import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {APOCALYPSE_KNIGHTS, glancingHitDescription} from '../../shared/apocalypse-knights-v1.mjs';

const cmsKey = 'battle_apocalypse_settings_v1';
export const balanceKey = 'ops:apocalypse-knights:gear-balance-20261124:v1';
const release = new Map([
  [84, {launch:3_000_000_000_000, target:29_000_000_000}],
  [85, {launch:3_400_000_000_000, target:1_500_000_000_000}]
]);

function withRule(description, rule) {
  const original = description || '';
  return original.includes(rule) ? original : [original, rule].filter(Boolean).join(' ');
}

export async function rebalanceKnights(client, {commit = false} = {}) {
  const rows = async (sql, args = []) => (await client.query(sql, args)).rows;
  await client.query('BEGIN');
  try {
    await rows("SET LOCAL lock_timeout='5s'");
    await rows('SELECT pg_advisory_xact_lock(hashtext($1))', [balanceKey]);
    const [existing] = await rows('SELECT value FROM app_meta WHERE key=$1', [balanceKey]);
    if (existing) {
      const receipt = JSON.parse(existing.value);
      assert.equal(receipt.operationKey, balanceKey);
      await client.query('ROLLBACK');
      return {...receipt, committed:true, replayed:true};
    }

    const [cms] = await rows('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE', [cmsKey]);
    assert(cms, '아포칼립스 운영 설정이 필요합니다.');
    const settings = JSON.parse(cms.value);
    const ids = [...release.keys()];
    const monsters = await rows('SELECT id,name,battle_power,pve_tab,is_boss,ultimate_description FROM battle_monsters WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE', [ids]);
    assert.equal(monsters.length, ids.length);
    const changes = monsters.map(row => {
      const id = Number(row.id), boss = APOCALYPSE_KNIGHTS.find(b => b.monsterId === id);
      const profile = settings.monsterProfiles?.[id];
      assert.equal(row.name, boss.name);
      assert.equal(row.pve_tab, 'APOCALYPSE');
      assert.equal(Number(row.is_boss), 1);
      const before = Number(row.battle_power), {launch, target:after} = release.get(id);
      assert.equal(after, boss.battlePower, row.name + ' 검증한 버전을 사용하세요.');
      assert.equal(profile?.battlePower, before, row.name + ' 몬스터와 CMS 전투력이 다릅니다.');
      assert(before === launch || before === after, row.name + ' 운영 전투력이 검증 이후 변경됐습니다.');
      profile.battlePower = after;
      const change = {id, name:row.name, before, after};
      const glancing = boss.skills.find(s => s.glancingHit)?.glancingHit;
      if (glancing) {
        const rule = glancingHitDescription(glancing);
        change.oldText = {cms:profile.skillDescription, monster:row.ultimate_description};
        change.newText = {cms:withRule(profile.skillDescription, rule), monster:withRule(row.ultimate_description, rule)};
        assert(change.newText.cms.length <= 300, 'CMS 기술 설명 길이를 확인하세요.');
        profile.skillDescription = change.newText.cms;
      }
      return change;
    });
    const result = {operationKey:balanceKey, changes};
    if (!commit) {
      await client.query('ROLLBACK');
      return {...result, committed:false, replayed:false};
    }

    const [owner] = await rows("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
    assert(owner);
    for (const change of changes) {
      if (change.newText) {
        await rows('UPDATE battle_monsters SET battle_power=$1,ultimate_description=$2 WHERE id=$3', [change.after, change.newText.monster, change.id]);
      } else if (change.before !== change.after) {
        await rows('UPDATE battle_monsters SET battle_power=$1 WHERE id=$2', [change.after, change.id]);
      }
    }
    await rows('UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2', [JSON.stringify(settings), cmsKey]);
    const [audit] = await rows("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'APOCALYPSE_KNIGHTS_REBALANCE','MONSTER',$2,$3,$4) RETURNING id",
      [owner.id, ids.join(','), JSON.stringify(changes.map(c => ({id:c.id, battlePower:c.before, descriptions:c.oldText}))), JSON.stringify(changes.map(c => ({id:c.id, battlePower:c.after, descriptions:c.newText})))]);
    result.auditId = String(audit.id);
    await rows('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)', [balanceKey, JSON.stringify(result)]);
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
  try {await client.connect(); console.log(await rebalanceKnights(client, {commit:process.argv.includes('--apply')}));}
  finally {await client.end();}
}
