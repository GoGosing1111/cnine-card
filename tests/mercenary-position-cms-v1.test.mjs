import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cloneDraft, validatePositionDraft, parsePositionDraft, revisePositionDraft,
  summarizePositions, changedAssignments, MAX_DRAFT_BYTES, POSITIONS
} from '../shared/mercenary-position-config-v1.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const roster = JSON.parse(read('assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json'));
const seed = JSON.parse(read('preview/project-v-mercenary-system-v1/position-draft-v1.json'));
const change = fn => { const copy = cloneDraft(seed); fn(copy); return copy; };
const reject = fn => assert.equal(validatePositionDraft(change(fn), roster).ok, false);

test('43 approved roster codes each have a distinct, complete proposed assignment', () => {
  assert.deepEqual(validatePositionDraft(seed, roster), { ok: true, errors: [] });
  assert.deepEqual(seed.assignments.map(entry => entry.code).sort(), roster.cards.map(card => card.code).sort());
  assert.equal(new Set(seed.assignments.map(entry => entry.specialty)).size, 43);
  assert.equal(roster.cards.every(card => card.rank === null), true);
  assert.deepEqual(summarizePositions(seed), {
    total: 43,
    positions: { FRONT: 20, MIDDLE: 15, REAR: 8 },
    roles: { GUARDIAN: 4, VANGUARD: 10, ASSASSIN: 5, MARKSMAN: 11, SNIPER: 4, CONTROLLER: 6, SUPPORT: 3 }
  });
});

test('tactical middle and rear do not silently create a third engine targeting row', () => {
  assert.equal(POSITIONS.FRONT.engineRow, 'FRONT');
  assert.equal(POSITIONS.MIDDLE.engineRow, 'BACK');
  assert.equal(POSITIONS.REAR.engineRow, 'BACK');
});

test('missing, duplicated and unregistered mercenaries cannot be imported', () => {
  reject(draft => draft.assignments.pop());
  reject(draft => draft.assignments.push(cloneDraft(draft.assignments[0])));
  reject(draft => draft.assignments[0].code = 'V-999');
  reject(draft => draft.assignments[0] = null);
  reject(draft => draft.assignments = {});
});

test('roles cannot select incompatible positions or skill targets', () => {
  reject(draft => draft.assignments[0].position = 'REAR');
  reject(draft => draft.assignments[0].skillTarget = 'ALLY_TEAM');
  reject(draft => draft.assignments[0].role = 'UNKNOWN');
  reject(draft => draft.assignments[0].role = ['VANGUARD']);
  reject(draft => draft.assignments[0].role = '__proto__');
  reject(draft => draft.assignments[0].basicTarget = 'BACK_THREAT');
});

test('import cannot enable runtime or inject ranks, assets, stats, prices or arbitrary fields', () => {
  reject(draft => draft.runtimeEnabled = true);
  reject(draft => draft.status = 'APPROVED');
  for (const key of ['rank', 'sourceArt', 'battleSprite', 'power', 'price', 'enabled']) reject(draft => draft.assignments[0][key] = 'injected');
  reject(draft => draft.approvedBy = 'OWNER');
  reject(draft => delete draft.runtimeEnabled);
  reject(draft => delete draft.assignments[0].rationale);
});

test('stale roster or schema versions require explicit migration and review', () => {
  reject(draft => draft.rosterVersion--);
  reject(draft => draft.schemaVersion++);
  reject(draft => draft.format = 'MERCENARY_RELEASE_CONFIG');
  for (const value of [0, 1.5, '1', Number.MAX_SAFE_INTEGER]) reject(draft => draft.revision = value);
  assert.equal(validatePositionDraft(seed, { ...roster, cards: [] }).ok, false);
  assert.equal(validatePositionDraft(null, roster).ok, false);
});

test('draft text must describe both the benefit and weakness within the CMS size limit', () => {
  for (const key of ['specialty', 'weakness', 'rationale']) {
    reject(draft => draft.assignments[0][key] = '   ');
    reject(draft => draft.assignments[0][key] = '가'.repeat(241));
    reject(draft => draft.assignments[0][key] = 123);
  }
});

test('JSON parser rejects malformed and oversized UTF-8 content before replacing the draft', () => {
  assert.deepEqual(parsePositionDraft(JSON.stringify(seed), roster), seed);
  assert.throws(() => parsePositionDraft('{', roster));
  assert.throws(() => parsePositionDraft('가'.repeat(MAX_DRAFT_BYTES / 2), roster), /128 KB/);
  assert.throws(() => parsePositionDraft('null', roster));
  assert.throws(() => parsePositionDraft(JSON.stringify({ ...seed, runtimeEnabled: true }), roster));
});

test('revision save returns a detached copy and never mutates the source roster or prior revision', () => {
  const original = JSON.stringify({ seed, roster });
  const candidate = change(draft => draft.assignments[0].specialty = '전열 결투 · 검수 수정안');
  const next = revisePositionDraft(candidate, seed, seed.revision, roster);
  assert.equal(next.revision, 2);
  assert.equal(candidate.revision, 1);
  assert.notEqual(next.assignments, candidate.assignments);
  assert.equal(JSON.stringify({ seed, roster }), original);
  assert.deepEqual(changedAssignments(seed, next), [{ code: 'V-001', fields: ['specialty'] }]);
});

test('a stale editor cannot overwrite a later draft revision', () => {
  const current = revisePositionDraft(seed, seed, 1, roster);
  assert.throws(() => revisePositionDraft(seed, current, 1, roster), /다른 편집/);
  assert.throws(() => revisePositionDraft({ ...seed, revision: 3 }, current, 2, roster), /다른 편집/);
  const invalid = change(draft => draft.assignments.pop());
  assert.throws(() => revisePositionDraft(invalid, seed, 1, roster));
  assert.equal(current.revision, 2);
});

test('preparation editor uses canonical original art and never reads accounts or admin credentials', () => {
  const client = read('preview/project-v-mercenary-system-v1/positions.js');
  assert.match(client, /mediaPath\(card.code, 'art', 320\)/);
  assert.match(client, /mercenary-codex-v1\/model\.js/);
  assert.doesNotMatch(client, /\/api\/|cnine_admin_token|authorization:|battleSprite\s*=/i);
  assert.match(client, /textContent = message/);
  assert.match(client, /escape\(entry.specialty\)/);
  assert.match(client, /revisePositionDraft/);
});

test('live CMS, account API, codex and battle entrypoints do not import the draft editor or rules', () => {
  for (const file of ['admin/index.html', 'admin/admin.js', 'functions/api/[[path]].js', 'js/app.js', 'js/battle-v3-live.js', 'functions/_battle_v2_preview.js', 'preview/project-v-v3/source/battle/BattleEngine.js', 'preview/mercenary-codex-v1/model.js']) {
    assert.doesNotMatch(read(file), /mercenary-position-config-v1|position-draft-v1|mercenary-system-v1\/positions|mercenaries\/settings/, file);
  }
});
