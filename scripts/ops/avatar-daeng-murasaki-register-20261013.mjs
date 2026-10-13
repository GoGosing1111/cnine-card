// Explicit user-authorized catalog registration. Never imported by live requests.
import assert from 'node:assert/strict';
import catalog from '../../preview/avatar-peach-kimono-20261013-v1/catalog.json' with {type:'json'};
import {clanAdminTransaction} from '../../functions/_clan_inactivity_cleanup.js';
export const DAENG_AVATAR=catalog;
export const DAENG_REGISTER_KEY='ops:avatar-daeng-murasaki-register:20261013:v1';
export const REFERENCE_CODE='FM_DIMWOOS';
export const EXPECTED_EFFECTS=Object.freeze([
 {option_order:0,effect_type:'DROP_RATE_PERCENT',effect_value:30},
 {option_order:1,effect_type:'COIN_GAIN_PERCENT',effect_value:100},
 {option_order:2,effect_type:'RAID_EXTRA_ENTRY',effect_value:10},
 {option_order:3,effect_type:'BATTLE_POWER_PERCENT',effect_value:3}
]);
const normalize=rows=>rows.map(r=>({option_order:Number(r.option_order),effect_type:r.effect_type,effect_value:Number(r.effect_value)}));
export async function registerDaengMurasaki(db,{expectedSourceVersion,expectedOwnerId,dryRun=false}){
 assert.ok(Number.isSafeInteger(expectedSourceVersion)&&expectedSourceVersion>0);
 assert.ok(Number.isSafeInteger(expectedOwnerId)&&expectedOwnerId>0);
 return clanAdminTransaction(db,async q=>{
  const [owner]=await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE' FOR SHARE",[expectedOwnerId]);assert.ok(owner,'Active OWNER required');
  await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',sqlite_now()) ON CONFLICT(key) DO NOTHING",[DAENG_REGISTER_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[DAENG_REGISTER_KEY]),receipt=JSON.parse(saved.value);
  if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};
  assert.equal(receipt.status,'PENDING','Unexpected registration receipt');
  const [source]=await q('SELECT * FROM avatar_catalog_v1 WHERE code=$1 FOR SHARE',[REFERENCE_CODE]);
  assert.equal(source?.name.replace(/\s/g,''),'한복디임2');assert.equal(Number(source.version),expectedSourceVersion,'Reference version changed');
  assert.equal(Number(source.is_active),1);assert.equal(Number(source.is_public),1);
  const effects=normalize(await q('SELECT option_order,effect_type,effect_value FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order FOR SHARE',[REFERENCE_CODE]));
  assert.deepEqual(effects,EXPECTED_EFFECTS,'Reference options changed');
  assert.equal(source.effect_type,catalog.effect_type);assert.equal(Number(source.effect_value),catalog.effect_value);
  assert.equal((await q('SELECT code FROM avatar_catalog_v1 WHERE code=$1 OR serial=$2 OR name=$3 FOR UPDATE',[catalog.code,catalog.serial,catalog.name])).length,0,'Code, serial or name already exists');
  assert.equal((await q('SELECT user_id FROM avatar_user_ownership_v1 WHERE avatar_code=$1 LIMIT 1',[catalog.code])).length,0,'Unexpected existing ownership');
  const fields=Object.keys(catalog);
  const inserted=await q('INSERT INTO avatar_catalog_v1('+fields.join(',')+') VALUES('+fields.map((_,i)=>'$'+(i+1)).join(',')+') RETURNING *',Object.values(catalog));assert.equal(inserted.length,1);
  for(const e of effects)await q('INSERT INTO avatar_effect_options_v1(avatar_code,option_order,effect_type,effect_value) VALUES($1,$2,$3,$4)',[catalog.code,e.option_order,e.effect_type,e.effect_value]);
  assert.deepEqual(normalize(await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=$1 ORDER BY option_order',[catalog.code])),effects);
  assert.deepEqual((await q('SELECT * FROM avatar_catalog_v1 WHERE code=$1',[REFERENCE_CODE]))[0],source);
  const [clock]=await q('SELECT sqlite_now() applied_at');
  const result={status:'COMPLETED',operationKey:DAENG_REGISTER_KEY,appliedAt:clock.applied_at,avatar:inserted[0],sourceAvatar:{code:source.code,name:source.name,version:Number(source.version)},effects,registered:1,granted:0,loadoutChanged:false,walletChanged:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_AVATAR_REGISTER','AVATAR',$2,$3,$4) RETURNING id",[owner.id,catalog.code,JSON.stringify({operationKey:DAENG_REGISTER_KEY,catalog:null,effects:[]}),JSON.stringify({...result,authorization:'댕무라사키 아바타로 추가하고 한복디임2하고 동급 옵션으로 만들어'})]);
  assert.ok(audit,'Audit missing');result.adminLogId=String(audit.id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[DAENG_REGISTER_KEY,JSON.stringify({status:'COMPLETED',result})]);
  if(dryRun)throw Object.assign(Error('Dry run rollback'),{dryRunResult:{...result,dryRun:true,rolledBack:true}});
  return {...result,replayed:false};
 }).catch(error=>{if(error.dryRunResult)return error.dryRunResult;throw error});
}
