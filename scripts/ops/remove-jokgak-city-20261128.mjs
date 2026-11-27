import assert from 'node:assert/strict';

const tableNames = [
  'jokgak_city_notifications_v1',
  'jokgak_city_actions_v1',
  'jokgak_city_players_v1',
  'jokgak_city_guards_v1'
];
const trophy = 'CITY_TOP_25';
const cityKeys = `starts_with(key,'jokgak_city_')
  OR starts_with(key,'ops:jokgak-city-')
  OR key ~ '^menu_favorite_v1:[0-9]+:jokgakCity$'
  OR key ~ '^trophy_city_top_v1:[0-9]+$'`;
const cityMail = `starts_with(campaign_key,'jokgak-city:action:')
  OR starts_with(campaign_key,'jokgak-city:round:')
  OR campaign_key='jokgak-city-top10-20261011-18-v1'`;

// Run after deploying the API and the scheduler. No account balances are reconstructed.
export async function removeJokgakCity(db, {commit = false} = {}) {
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL lock_timeout='4s'");
    await db.query("SET LOCAL statement_timeout='30s'");
    await db.query("SELECT pg_advisory_xact_lock(hashtext('jokgak-city-retirement'))");
    const {rows: tables} = await db.query(
      'SELECT tablename FROM pg_tables WHERE schemaname=\'public\' AND tablename=ANY($1::text[]) ORDER BY tablename',
      [tableNames]
    );
    const counts = {};
    for (const {tablename} of tables) {
      assert(tableNames.includes(tablename));
      await db.query('LOCK TABLE public.' + tablename + ' IN ACCESS EXCLUSIVE MODE');
      const {rows: [row]} = await db.query('SELECT count(*)::int n FROM public.' + tablename);
      counts[tablename] = row.n;
    }

    const {rows: messages} = await db.query(`SELECT id FROM user_messages WHERE ${cityMail} ORDER BY id FOR UPDATE`);
    const ids = messages.map(row => row.id);
    const attachments = await db.query(`SELECT reward_type,claimed_at FROM user_message_rewards
      WHERE message_id=ANY($1::bigint[]) OR reward_type='JOKGAK_CITY_REWARD' FOR UPDATE`, [ids]);
    assert(attachments.rows.every(r => r.claimed_at && ['JOKGAK_CITY_REWARD','COIN'].includes(r.reward_type)),
      'Unclaimed or unexpected attachment. Preserve its value before removing the message.');
    const receipts = await db.query(`DELETE FROM user_message_reward_claim_receipts_v1222
      WHERE message_id=ANY($1::bigint[]) OR reward_type='JOKGAK_CITY_REWARD'`, [ids]);
    const rewards = await db.query(`DELETE FROM user_message_rewards
      WHERE message_id=ANY($1::bigint[]) OR reward_type='JOKGAK_CITY_REWARD'`, [ids]);
    const mail = await db.query('DELETE FROM user_messages WHERE id=ANY($1::bigint[])', [ids]);
    assert.equal(mail.rowCount, ids.length);
    assert.equal(rewards.rowCount, attachments.rowCount);

    const {rows: settings} = await db.query(`SELECT key,value FROM app_meta
      WHERE (key='trophy_reward_bonuses_v1' OR key ~ '^trophy_manual_grants_v1:[0-9]+$'
             OR key ~ '^personal_hideout_v1:[0-9]+$') AND strpos(value,$1)>0 ORDER BY key FOR UPDATE`, [trophy]);
    const changed = {bonusSettings:0, manualGrants:0, displays:0};
    for (const {key,value} of settings) {
      const record = JSON.parse(value);
      if (key==='trophy_reward_bonuses_v1') {
        record.document.trophies = record.document.trophies.filter(row => row.code!==trophy);
        record.revision++;
        changed.bonusSettings++;
      } else if (key.startsWith('trophy_manual_grants_v1:')) {
        const grants = record.grants.filter(row => row.code!==trophy);
        changed.manualGrants += record.grants.length-grants.length;
        record.grants = grants;
      } else {
        // Preserve the position of every other display slot, including empty slots.
        for (const item of record.placements) {
          if (item.kind!=='decor' || item.code!=='trophy') continue;
          if (Array.isArray(item.trophyCodes)) {
            changed.displays += item.trophyCodes.filter(code => code===trophy).length;
            item.trophyCodes = item.trophyCodes.map(code => code===trophy ? null : code);
            item.trophyCode = item.trophyCodes[0] || null;
          } else if (item.trophyCode===trophy) {
            changed.displays++;
            item.trophyCode = null;
          }
        }
        record.revision++;
      }
      const next = JSON.stringify(record);
      assert(!next.includes('"'+trophy+'"'), 'Unexpected remaining trophy reference in '+key);
      const saved = await db.query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3', [next,key,value]);
      assert.equal(saved.rowCount,1);
    }

    const {rows:[before]} = await db.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE starts_with(key,'trophy_city_top_v1:'))::int AS progress,
      count(*) FILTER (WHERE starts_with(key,'menu_favorite_v1:'))::int AS favorites
      FROM app_meta WHERE ${cityKeys}`);
    const removed = await db.query('DELETE FROM app_meta WHERE '+cityKeys);
    assert.equal(removed.rowCount,before.total);
    if (tables.length) await db.query('DROP TABLE '+tables.map(row=>'public.'+row.tablename).join(', '));

    // Immutable Pages releases can still use their original database bindings.
    // Their schema initializer checks for the presence of this key before CREATE TABLE.
    await db.query(`INSERT INTO app_meta(key,value) VALUES('safe_runtime_jokgak_city_v1','retired')
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP
      WHERE app_meta.value IS DISTINCT FROM excluded.value`);
    const {rows:[remaining]} = await db.query(`SELECT
      (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[]))::int AS tables,
      (SELECT count(*) FROM app_meta WHERE ${cityKeys})::int AS keys,
      (SELECT count(*) FROM app_meta WHERE (key='trophy_reward_bonuses_v1'
        OR key ~ '^trophy_manual_grants_v1:[0-9]+$' OR key ~ '^personal_hideout_v1:[0-9]+$') AND strpos(value,$2)>0)::int AS embedded,
      (SELECT count(*) FROM user_messages WHERE ${cityMail})::int AS messages,
      (SELECT count(*) FROM user_message_rewards WHERE reward_type='JOKGAK_CITY_REWARD' OR message_id=ANY($3::bigint[]))::int AS attachments,
      (SELECT count(*) FROM user_message_reward_claim_receipts_v1222 WHERE reward_type='JOKGAK_CITY_REWARD' OR message_id=ANY($3::bigint[]))::int AS receipts`, [tableNames,trophy,ids]);
    assert(Object.values(remaining).every(n => n===0));
    // Install the write fence last to keep the lock on the shared table brief.
    // NOT VALID enforces it on new writes without scanning unrelated game data.
    const fence = await db.query("SELECT 1 FROM pg_constraint WHERE conrelid='public.app_meta'::regclass AND conname='retired_jokgak_city_v1'");
    if (!fence.rowCount) {
      await db.query(`ALTER TABLE public.app_meta ADD CONSTRAINT retired_jokgak_city_v1 CHECK (
        CASE WHEN key='safe_runtime_jokgak_city_v1' THEN value IS NOT DISTINCT FROM 'retired'
             WHEN ${cityKeys} THEN false
             WHEN key='trophy_reward_bonuses_v1' OR starts_with(key,'trophy_manual_grants_v1:')
               THEN strpos(value,'"CITY_TOP_25"')=0
             ELSE true END) NOT VALID`);
    }
    await db.query(commit ? 'COMMIT' : 'ROLLBACK');
    return {committed:commit, tables:counts, metadata:before, ...changed, messages:mail.rowCount, attachments:rewards.rowCount, receipts:receipts.rowCount, remaining};
  } catch (error) {
    await db.query('ROLLBACK').catch(()=>{});
    throw error;
  }
}
