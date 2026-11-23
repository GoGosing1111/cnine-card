import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {APOCALYPSE_KNIGHTS, knightProfile} from '../../shared/apocalypse-knights-v1.mjs';
import {normalizeApocalypseSettings, pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';

export const operationKey = 'ops:apocalypse-knights-20261124:v1';
const cmsKey = 'battle_apocalypse_settings_v1';
const ids = APOCALYPSE_KNIGHTS.map(b => b.monsterId);

export async function registerKnights(client, {commit = false, expectedMorgas} = {}) {
  const query = async (sql, args = []) => (await client.query(sql, args)).rows;
  const receipt = async () => {
    const [row] = await query('SELECT value FROM app_meta WHERE key=$1', [operationKey]);
    if (!row) return null;
    const saved = JSON.parse(row.value);
    assert.equal(saved.operationKey, operationKey);
    const monsters = await query('SELECT id,name FROM battle_monsters WHERE id=ANY($1::bigint[]) ORDER BY id', [ids]);
    assert.deepEqual(monsters.map(r => [Number(r.id), r.name]), APOCALYPSE_KNIGHTS.map(b => [b.monsterId, b.name]));
    return {...saved, committed:true, replayed:true};
  };
  const saved = await receipt();
  if (saved) return saved;
  await client.query('BEGIN');
  try {
    await query("SET LOCAL lock_timeout='5s'");
    await query('SELECT pg_advisory_xact_lock(hashtext($1))', [operationKey]);
    const concurrent = await receipt();
    if (concurrent) {await client.query('ROLLBACK'); return concurrent;}
    const [row] = await query('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE', [cmsKey]);
    assert(row, '아포칼립스 CMS 설정이 필요합니다.');
    const settings = JSON.parse(row.value);
    assert.equal(settings.enabled, true);
    const reference = settings.monsterProfiles?.['83'];
    assert(reference, '모르가스 설정이 필요합니다.');
    if (expectedMorgas) assert.deepEqual(reference, expectedMorgas, '검수 이후 모르가스 설정이 변경됐습니다.');
    await query('LOCK TABLE battle_monsters IN SHARE ROW EXCLUSIVE MODE');
    const [anchor] = await query("SELECT id,name,battle_power,pve_display_order FROM battle_monsters WHERE pve_tab='APOCALYPSE' ORDER BY pve_display_order DESC,id DESC LIMIT 1");
    assert.equal(Number(anchor?.id), 83, '마지막 아포칼립스 몬스터를 확인하세요.');
    assert.equal(Number(anchor.battle_power), reference.battlePower);
    const collision = await query('SELECT id FROM battle_monsters WHERE id=ANY($1::bigint[]) OR name=ANY($2::text[])', [ids, APOCALYPSE_KNIGHTS.map(b => b.name)]);
    assert.equal(collision.length, 0, '몬스터 ID 또는 이름이 이미 사용 중입니다.');
    const [owner] = await query("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
    assert(owner);
    const registered = [];
    for (const [index, boss] of APOCALYPSE_KNIGHTS.entries()) {
      assert.equal(settings.monsterProfiles[boss.monsterId], undefined);
      const profile = knightProfile(boss, reference);
      const normalized = normalizeApocalypseSettings({monsterProfiles: {[boss.monsterId]: profile}}).monsterProfiles[boss.monsterId];
      for (const key of ['battlePower','rewardCoin','rewardPercent','clearBonus','legionUltimate','battleSuitSkillDefensePercent',...Object.keys(boss.tuning)])
        assert.deepEqual(normalized[key], profile[key], 'CMS would clamp ' + key);
      const order = Number(anchor.pve_display_order) + index + 1;
      if (commit) await query(`INSERT INTO battle_monsters(id,name,image_url,battle_power,reward_coin,is_boss,is_active,sort_order,monster_category,pve_tab,pve_display_order,pve_enabled,tower_enabled,tower_only,ultimate_enabled,ultimate_name,ultimate_description)
        VALUES($1,$2,$3,$4,$5,1,1,$6,'BOSS','APOCALYPSE',$6,1,0,0,0,$7,$8)`,
        [boss.monsterId,boss.name,boss.sourceArt.slice(1),profile.battlePower,profile.rewardCoin,order,boss.skills[2].name,profile.skillDescription]);
      settings.monsterProfiles[boss.monsterId] = profile;
      const runtime = pveDifficultyRuntime({apocalypse:settings},{id:boss.monsterId,pve_tab:'APOCALYPSE',is_boss:1});
      registered.push({id:boss.monsterId,name:boss.name,order,power:runtime.engineMonster.battle_power,coin:runtime.effectiveRewardCoin,clearBonus:profile.clearBonus});
    }
    const result = {operationKey,registered,referencePower:reference.battlePower};
    if (!commit) {
      await client.query('ROLLBACK');
      return {...result, committed:false, replayed:false};
    }
    await query('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2', [JSON.stringify(settings),cmsKey]);
    const [audit] = await query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'APOCALYPSE_BOSSES_REGISTER','MONSTER',$2,$3,$4) RETURNING id",
      [owner.id,ids.join(','),JSON.stringify({reference}),JSON.stringify(result)]);
    result.auditId = String(audit.id);
    await query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)', [operationKey,JSON.stringify(result)]);
    const [state] = await query("SELECT pg_get_serial_sequence('battle_monsters','id') seq, MAX(id) maximum FROM battle_monsters");
    if (state.seq) {
      const [seq] = await query('SELECT pg_sequence_last_value($1::regclass) AS last', [state.seq]);
      let last = Number(seq.last ?? 0);
      assert(Number(state.maximum) - last < 10_000, 'Unexpected ID sequence gap');
      while (last < Number(state.maximum)) last = Number((await query('SELECT nextval($1::regclass) AS id', [state.seq]))[0].id);
    }
    await client.query('COMMIT');
    return {...result, committed:true, replayed:false};
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const {default:pg} = await import('pg');
  assert(process.env.DATABASE_URL, 'DATABASE_URL is required.');
  const client = new pg.Client({connectionString:process.env.DATABASE_URL});
  try {await client.connect(); console.log(await registerKnights(client,{commit:process.argv.includes('--apply')}));}
  finally {await client.end();}
}
