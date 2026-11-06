import assert from 'node:assert/strict';
import {BOSSES} from '../../shared/apocalypse-trio-v1.mjs';
import {normalizeApocalypseSettings,pveDifficultyRuntime} from '../../functions/_pve_nightmare.js';
export const OPERATION_KEY='ops:apocalypse-facing-balance:20261106:v1';
export const PREVIOUS_POWERS=[66_000_000_000,220_000_000_000,660_000_000_000];
export async function lowerApocalypseTrio(client,{commit=false,expectedProfiles,assets=[]}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const replay=async()=>{const [row]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(!row)return null;const receipt=JSON.parse(row.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);return {...receipt,replayed:true};};
 const done=await replay();if(done)return done;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const raced=await replay();if(raced){await client.query('ROLLBACK');return raced;}
  const [meta]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1' FOR UPDATE");assert(meta);
  const settings=JSON.parse(meta.value),before=structuredClone(settings);assert.equal(settings.enabled,true);
  const rows=await q('SELECT id,name,battle_power,reward_coin,pve_tab,is_active,pve_enabled FROM battle_monsters WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[BOSSES.map(b=>b.monsterId)]);
  assert.equal(rows.length,3);assert(expectedProfiles,'Read-only reviewed profiles required');
  if(commit)for(const path of ['/preview/project-v-v3/project-v-pixi-battle.bundle.js','/js/battle-v3-live.js','/shared/apocalypse-trio-v1.mjs'])assert(assets.some(a=>a.path===path&&a.verified&&/^[a-f0-9]{64}$/.test(a.sha256)),'Public runtime not verified: '+path);
  const changes=[];
  for(const [i,boss] of BOSSES.entries()){
   const row=rows[i],id=String(boss.monsterId),profile=settings.monsterProfiles[id];
   assert.equal(Number(row.id),boss.monsterId);assert.equal(row.name,boss.name);assert.equal(row.pve_tab,'APOCALYPSE');assert.equal(Number(row.is_active),1);assert.equal(Number(row.pve_enabled),1);
   assert.deepEqual(profile,expectedProfiles[id],'CMS changed after review');assert.equal(profile.battlePower,PREVIOUS_POWERS[i]);assert.equal(Number(row.battle_power),PREVIOUS_POWERS[i]);
   assert.equal(Number(row.reward_coin),profile.rewardCoin);assert.equal(profile.clearBonus.masterStars,boss.clearRewards.masterStars);
   profile.battlePower=boss.battlePower;
   assert.equal(normalizeApocalypseSettings({monsterProfiles:{[id]:profile}}).monsterProfiles[id].battlePower,boss.battlePower);
   assert.equal(pveDifficultyRuntime({apocalypse:settings},{id:boss.monsterId,pve_tab:'APOCALYPSE',is_boss:1}).effectiveRewardCoin,boss.clearRewards.coin);
   assert.equal((await q('UPDATE battle_monsters SET battle_power=$1 WHERE id=$2 AND battle_power=$3 RETURNING id',[boss.battlePower,boss.monsterId,PREVIOUS_POWERS[i]])).length,1);
   changes.push({id:boss.monsterId,name:boss.name,before:PREVIOUS_POWERS[i],after:boss.battlePower,coin:boss.clearRewards.coin,masterStars:boss.clearRewards.masterStars});
  }
  const preserved=structuredClone(settings);for(const c of changes)preserved.monsterProfiles[c.id].battlePower=c.before;assert.deepEqual(preserved,before);
  assert.equal((await q("UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key='battle_apocalypse_settings_v1' RETURNING key",[JSON.stringify(settings)])).length,1);
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner);
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:'카르겐 방향전환 한거 맞음? 그리고 난이도 3개 다 낮춰 너무쌘듯',changes,assets,completedAt:new Date().toISOString()};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'APOCALYPSE_TRIO_DIFFICULTY_LOWER','MONSTER','81,82,83',JSON.stringify({profiles:expectedProfiles,rows}),JSON.stringify(receipt)]);assert(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
