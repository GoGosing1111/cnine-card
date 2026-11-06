import assert from 'node:assert/strict';
export const OPERATION_KEY='ops:apocalypse-middle-balance:20261106:v1';
export const PLAN=Object.freeze([
 {id:81,name:'카르겐',before:2200000000,after:4400000000,coin:1500000000,masterStars:1000000},
 {id:82,name:'발카르',before:3300000000,after:5500000000,coin:2500000000,masterStars:2000000},
 {id:83,name:'모르가스',before:4400000000,after:6600000000,coin:4000000000,masterStars:3000000}
]);
export async function adjustApocalypseTrio(client,{commit=false,expected,review}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const replay=async()=>{const [r]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(!r)return null;const saved=JSON.parse(r.value);assert.equal(saved.operationKey,OPERATION_KEY);assert.equal(saved.status,'COMPLETED');return {...saved,replayed:true};};
 const done=await replay();if(done)return done;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='20s'");
  await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);const raced=await replay();if(raced){await client.query('ROLLBACK');return raced;}
  const [meta]=await q("SELECT value FROM app_meta WHERE key='battle_apocalypse_settings_v1' FOR UPDATE");assert(meta);assert(expected?.settings);
  const settings=JSON.parse(meta.value),beforeSettings=structuredClone(settings);assert.equal(settings.enabled,true);
  const rows=await q('SELECT * FROM battle_monsters WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[PLAN.map(p=>p.id)]);assert.equal(rows.length,3);
  if(commit){assert.equal(review?.passed,true);assert.match(review.sourceCommit,/^[a-f0-9]{40}$/);assert.match(review.calibrationSha256,/^[a-f0-9]{64}$/);assert.deepEqual(review.powers,PLAN.map(p=>p.after));assert(review.scenarios>=30&&review.battles>=4000);assert.equal(review.rewardsPreserved,true);}
  for(const [i,p]of PLAN.entries()){
   const row=rows[i],profile=settings.monsterProfiles[p.id];assert.equal(Number(row.id),p.id);assert.equal(row.name,p.name);assert.equal(row.pve_tab,'APOCALYPSE');assert.equal(Number(row.is_active),1);assert.equal(Number(row.pve_enabled),1);
   assert.deepEqual(profile,expected.settings.monsterProfiles[p.id],'CMS changed after review');assert.equal(profile.battlePower,p.before);assert.equal(Number(row.battle_power),p.before);
   assert.equal(Number(row.reward_coin)*profile.rewardPercent/100,p.coin);assert.equal(profile.clearBonus.masterStars,p.masterStars);
   profile.battlePower=p.after;assert.equal((await q('UPDATE battle_monsters SET battle_power=$1 WHERE id=$2 AND battle_power=$3 RETURNING id',[p.after,p.id,p.before])).length,1);
  }
  const preserved=structuredClone(settings);for(const p of PLAN)preserved.monsterProfiles[p.id].battlePower=p.before;assert.deepEqual(preserved,beforeSettings);
  assert.equal((await q("UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key='battle_apocalypse_settings_v1' RETURNING key",[JSON.stringify(settings)])).length,1);
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert(owner);
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:'다 다시 더 올려 너무 쉬워짐 / 타협점을 찾아라',completedAt:new Date().toISOString(),changes:PLAN,review,delivery:'CMS_AND_MONSTER_POWER_ONLY_EXISTING_LIVE_RUNTIME',beforeSettings,afterSettings:settings,beforeRows:rows};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'APOCALYPSE_TRIO_MIDDLE_BALANCE','MONSTER','81,82,83',JSON.stringify({profiles:expected.settings.monsterProfiles,rows}),JSON.stringify({operationKey:OPERATION_KEY,changes:PLAN,review})]);assert(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}
