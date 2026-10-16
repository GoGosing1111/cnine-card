import assert from 'node:assert/strict';
import {currentBrandText} from '../../shared/brand-presentation-20261016.mjs';
export const OPERATION_KEY='ops:reverse-call-brand:20261016:v1';
export const META_KEYS=['burning_event_settings_v1','hyper_burning_event_settings_v1310','miracle_burning_event_settings_v1','pvp_settings_v1','maintenance_title','maintenance_message','lobby_bgm_settings_v1803','supporter_season_pass_v1'];
export function brandSetting(key,value,now){
 if(!META_KEYS.includes(key))return value;
 if(key.startsWith('maintenance_'))return currentBrandText(value);
 const data=JSON.parse(value),next=structuredClone(data);
 for(const field of ['title','seasonTitle','seasonDescription'])if(typeof next[field]==='string')next[field]=currentBrandText(next[field]);
 if(key==='lobby_bgm_settings_v1803')for(const track of next.tracks||[])track.title=currentBrandText(track.title);
 if(JSON.stringify(next)===JSON.stringify(data))return value;
 if(Number.isSafeInteger(next.revision))next.revision++;
 if(Object.hasOwn(next,'updatedAt'))next.updatedAt=now;
 return JSON.stringify(next);
}
export async function rebrandStoredLabels(client){
 const identity=(await client.query('SELECT current_database() AS db, pg_is_in_recovery() AS recovery')).rows[0];assert.equal(identity?.db,'cnine');assert.equal(identity.recovery,false);
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try{
  await client.query("SET LOCAL statement_timeout='15s'");await client.query("SET LOCAL lock_timeout='3s'");
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(saved){const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);await client.query('COMMIT');return {...receipt,alreadyApplied:true};}
  const owner=(await client.query("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1")).rows[0];assert.ok(owner);
  const now=new Date().toISOString(),changes=[];
  const rows=(await client.query('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[META_KEYS])).rows;
  for(const row of rows){const next=brandSetting(row.key,row.value,now);if(next===row.value)continue;
   const result=await client.query('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[row.key,next,now,row.value]);assert.equal(result.rows.length,1,'Settings changed concurrently');
   changes.push({table:'app_meta',key:row.key});
  }
  const item=(await client.query("SELECT * FROM inventory_items WHERE code='SOOPKETLAND_TICKET' FOR UPDATE")).rows[0];assert.ok(item,'Existing land ticket required');
  const name=currentBrandText(item.name),description=currentBrandText(item.description);
  if(name!==item.name||description!==item.description){
   const result=await client.query("UPDATE inventory_items SET name=$1,description=$2,updated_at=$3 WHERE code='SOOPKETLAND_TICKET' RETURNING *",[name,description,now]);assert.equal(result.rows.length,1);
   const after={...result.rows[0],name:item.name,description:item.description,updated_at:item.updated_at};assert.deepEqual(after,item,'Ticket identity or behavior changed');
   changes.push({table:'inventory_items',code:item.code,before:{name:item.name,description:item.description},after:{name,description}});
  }
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',authorization:'숲켓몬이라는 이름을 모두 리버스콜로 변경; 숲켓랜드도 리버스랜드로 변경',completedAt:now,changes,accountChanges:0,grants:0,policyValuesChanged:0};
  const log=(await client.query("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES($1,'BRAND_LABEL_RENAME','APP_META',$2,'{}',$3,$4) RETURNING id",[owner.id,OPERATION_KEY,JSON.stringify(receipt),now])).rows[0];assert.ok(log);receipt.adminLogId=String(log.id);
  const savedReceipt=await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);assert.equal(savedReceipt.rows.length,1);
  await client.query('COMMIT');return receipt;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
