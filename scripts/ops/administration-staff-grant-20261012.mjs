import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:administration-staff:20261012:v1';
export const TITLE_CODE='ADMINISTRATION';
export const TITLE_POWER=100000;
export const TARGETS=Object.freeze([
 {id:1,nickname:'핑크빛유두',role:'OWNER'},
 {id:2,nickname:'Inception',role:'OWNER'},
 {id:6,nickname:'남수단',role:'OWNER'},
 {id:83,nickname:'애장이',role:'ADMIN'},
 {id:3710,nickname:'꼭지위생크림',role:'ADMIN'},
 {id:5663,nickname:'비숑',role:'OWNER'},
 {id:5849,nickname:'족다니',role:'ADMIN'}
]);

// Caller owns a PostgreSQL transaction. Ownership, power, audit and the receipt
// commit together. Retries after a lost COMMIT response return the saved result.
export async function grantAdministrationStaff(q){
 await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
 const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 if(prior){
  const saved=JSON.parse(prior.value);
  assert.equal(saved.status,'COMPLETED');assert.equal(saved.operationKey,OPERATION_KEY);
  assert.equal(saved.titleCode,TITLE_CODE);assert.equal(saved.power,TITLE_POWER);
  assert.deepEqual(saved.targets.map(({id,nickname,role})=>({id,nickname,role})),TARGETS);
  return {...saved,replayed:true};
 }
 const users=await q("SELECT id,nickname,role,status FROM users WHERE role IN ('OWNER','ADMIN') ORDER BY id FOR UPDATE");
 assert.deepEqual(users.map(u=>({id:Number(u.id),nickname:u.nickname,role:u.role})),TARGETS,'Staff roster changed; inspect before granting');
 assert.ok(users.every(u=>u.status==='ACTIVE'),'Inactive staff account');
 const [title]=await q('SELECT * FROM character_titles WHERE code=$1 FOR UPDATE',[TITLE_CODE]);
 assert.ok(title,'Missing title');assert.equal(title.name,'행정부');assert.equal(title.unlock_type,'MANUAL');
 assert.equal(Number(title.is_active),1);assert.equal(Number(title.is_public),1);
 assert.equal(Number(title.pve_power),0,'Power changed since inspection');
 const ids=TARGETS.map(t=>t.id);
 const loadouts=await q('SELECT * FROM user_title_loadout WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]);
 const existing=await q('SELECT * FROM user_character_titles WHERE title_id=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id FOR UPDATE',[title.id,ids]);
 const audits=[],targets=[];
 const log=async(action,targetType,targetId,before,after)=>{
  const [row]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,$2,$3,$4,$5) RETURNING id',[action,targetType,String(targetId),JSON.stringify(before),JSON.stringify({...after,operationKey:OPERATION_KEY})]);
  assert.ok(row,'Audit missing');audits.push(String(row.id));
 };
 const updated=await q('UPDATE character_titles SET pve_power=$1,updated_at=to_char(CURRENT_TIMESTAMP AT TIME ZONE \'UTC\',\'YYYY-MM-DD HH24:MI:SS\') WHERE id=$2 RETURNING pve_power',[TITLE_POWER,title.id]);
 assert.equal(Number(updated[0]?.pve_power),TITLE_POWER);
 await log('TITLE_POWER_UPDATE','TITLE',title.id,{pvePower:Number(title.pve_power)},{titleCode:TITLE_CODE,pvePower:TITLE_POWER,pvpPower:TITLE_POWER,authorization:'사용자 지시: 전투력 10만'});
 for(const t of TARGETS){
  const owned=existing.find(r=>Number(r.user_id)===t.id);
  if(owned){assert.equal(owned.expires_at,null,'Existing temporary title needs review');targets.push({...t,granted:false,alreadyOwned:true});continue;}
  const inserted=await q("INSERT INTO user_character_titles(user_id,title_id,source_type,source_id) VALUES($1,$2,'ADMIN','1') ON CONFLICT(user_id,title_id) DO NOTHING RETURNING user_id",[t.id,title.id]);
  assert.equal(inserted.length,1,'Concurrent ownership change');
  await log('TITLE_GRANT','USER',t.id,null,{titleId:Number(title.id),titleCode:TITLE_CODE,nickname:t.nickname,role:t.role,permanent:true,authorization:'사용자 지시: OWNER, ADMIN 지급'});
  targets.push({...t,granted:true,alreadyOwned:false});
 }
 assert.deepEqual(await q('SELECT * FROM user_title_loadout WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]),loadouts,'Grant must not change equipped titles');
 const owned=await q('SELECT user_id,expires_at FROM user_character_titles WHERE title_id=$1 AND user_id=ANY($2::bigint[]) ORDER BY user_id',[title.id,ids]);
 assert.deepEqual(owned.map(r=>Number(r.user_id)),ids);assert.ok(owned.every(r=>r.expires_at===null));
 const result={status:'COMPLETED',operationKey:OPERATION_KEY,titleId:Number(title.id),titleCode:TITLE_CODE,power:TITLE_POWER,pvePower:TITLE_POWER,pvpPower:TITLE_POWER,targets,granted:targets.filter(t=>t.granted).length,alreadyOwned:targets.filter(t=>t.alreadyOwned).length,adminLogIds:audits,autoEquipped:false,completedAt:new Date().toISOString()};
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(result),result.completedAt])).length,1);
 return {...result,replayed:false};
}
