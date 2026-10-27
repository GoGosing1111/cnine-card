import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {connect, safeError} from './connect.mjs';
import {OP, hash, makePlan, validatePlan, artifacts, receipt, send, verify} from './delivery.mjs';

const [mode, directory] = process.argv.slice(2);
assert.ok(['prepare', 'dry-run', 'apply', 'verify', 'replay'].includes(mode)); assert.ok(directory);
const out = path.resolve(directory);
const save = (name, value) => {
  let filename = path.join(out, name + '.json');
  if (['verify', 'replay'].includes(name) && fs.existsSync(filename)) filename = path.join(out, name + '-' + Date.now() + '.json');
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
};
const sourceHash = createHash('sha256').update(fs.readFileSync(new URL('./delivery.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
if (mode === 'prepare') {
  const plan = makePlan(JSON.parse(fs.readFileSync(path.join(out, 'inspection.json'), 'utf8')));
  validatePlan(plan, hash(plan)); save('plan', plan);
  fs.writeFileSync(path.join(out, 'reviewed-plan.sha256'), hash(plan) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({mode, planHash: hash(plan), ...plan.totals}));
} else {
  const plan = JSON.parse(fs.readFileSync(path.join(out, 'plan.json'), 'utf8'));
  const planHash = fs.readFileSync(path.join(out, 'reviewed-plan.sha256'), 'utf8').trim(); validatePlan(plan, planHash);
  // Refuse an unrecorded re-apply after a successful/ambiguous apply. Verification is always available.
  if (mode === 'apply') assert.equal(fs.existsSync(path.join(out, 'apply.json')), false, 'Use verify or replay after apply');
  let db;
  try {
    db = await connect();
    const original = db.query.bind(db);
    const allowed = new Set(['user_messages', 'user_message_rewards', 'admin_logs', 'app_meta']);
    db.query = (sql, args) => {
      const insert = sql.match(/^\s*INSERT\s+INTO\s+([a-z_0-9]+)/i);
      if (insert) assert.ok(allowed.has(insert[1]), 'Unexpected insert');
      else assert.match(sql, /^(SELECT|BEGIN|SET LOCAL|SAVEPOINT|ROLLBACK|COMMIT)\b/, 'Unexpected statement');
      return original(sql, args);
    };
    const readonly = {query(sql, args) { assert.match(sql, /^SELECT\b/, 'Replay must use SELECT only'); return db.query(sql, args); }};
    const transaction = async (fn, {readOnly = false, rollback = false} = {}) => {
      // Account/identity row locks and a fixed attendance cutoff protect the write.
      // READ COMMITTED lets normal account-sync trigger updates coexist with active users.
      await db.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      try {
        await db.query("SET LOCAL lock_timeout='5s'"); await db.query("SET LOCAL statement_timeout='30s'");
        const result = await fn(); await db.query(readOnly || rollback ? 'ROLLBACK' : 'COMMIT'); return result;
      } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    };
    let result;
    if (mode === 'dry-run') {
      result = await transaction(async () => {
        assert.equal(await receipt(db), null, 'Already complete');
        const before = await artifacts(db); for (const n of Object.values(before)) assert.equal(n, 0);
        await db.query('SAVEPOINT failure_test');
        await assert.rejects(() => send({query(sql, args) {
          if (sql.startsWith('INSERT INTO app_meta(') && args[0] === OP) throw Error('INJECTED_RECEIPT_FAILURE');
          return db.query(sql, args);
        }}, plan, planHash), /INJECTED_RECEIPT_FAILURE/);
        await db.query('ROLLBACK TO SAVEPOINT failure_test'); assert.deepEqual(await artifacts(db), before);
        const sent = await send(db, plan, planHash), replay = await send(readonly, plan, planHash);
        assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, sent.receipt);
        return {verification: sent.verification, injectedFailureRolledBack: true, rollbackVerified: true, replayWrites: 0};
      }, {rollback: true});
      result.artifactsAfterRollback = await transaction(() => artifacts(db), {readOnly: true});
      for (const n of Object.values(result.artifactsAfterRollback)) assert.equal(n, 0);
    } else if (mode === 'apply') {
      const dry = JSON.parse(fs.readFileSync(path.join(out, 'dry-run.json'), 'utf8'));
      assert.equal(dry.sourceHash, sourceHash); assert.equal(dry.planHash, planHash);
      assert.ok(dry.injectedFailureRolledBack && dry.rollbackVerified);
      result = await transaction(() => send(db, plan, planHash));
    } else if (mode === 'verify') {
      result = await transaction(async () => {
        const saved = await receipt(readonly); assert.ok(saved);
        const a = await artifacts(readonly);
        assert.equal(a.messages, plan.totals.recipients); assert.equal(a.rewards, plan.totals.recipients);
        assert.equal(a.audits, 1); assert.equal(a.receipts, 1); assert.equal(a.matchingMessages, plan.totals.recipients); assert.equal(a.matchingDirectCoinLogs, 0);
        return {verification: await verify(readonly, saved, plan), artifacts: a, completedAt: saved.completedAt, independentReadOnlyConnection: true};
      }, {readOnly: true});
    } else {
      result = await transaction(async () => {
        const before = await artifacts(readonly), replay = await send(readonly, plan, planHash);
        assert.equal(replay.replayed, true); assert.deepEqual(await artifacts(readonly), before);
        return {verification: replay.verification, replayed: true, additionalWrites: 0};
      }, {readOnly: true});
    }
    save(mode, {...result, sourceHash, planHash, checkedAt: new Date().toISOString()});
    console.log(JSON.stringify({mode, ...result.verification, injectedFailureRolledBack: result.injectedFailureRolledBack,
      rollbackVerified: result.rollbackVerified, additionalWrites: result.additionalWrites, completedAt: result.receipt?.completedAt ?? result.completedAt}));
  } catch (error) { await db?.query('ROLLBACK').catch(() => {}); console.error(JSON.stringify({mode, ...safeError(error)})); process.exitCode = 1; }
  finally { await db?.end(); }
}
