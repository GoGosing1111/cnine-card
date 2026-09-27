import assert from 'node:assert/strict';
import manifest from '../../preview/clan-avatar-hanbok-live-v1/manifest.json' with {type:'json'};
import previous from '../../preview/clan-avatar-hanbok-live-v1/before-images.json' with {type:'json'};
export const CLAN_HANBOK_KEY='ops:clan-avatar-hanbok:20260927:v1';
export const CLAN_HANBOK_CODES=Object.freeze(manifest.entries.map(e=>e.code).sort());
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const artFields=['lobby_image','lobby_mobile_image','equipment_image','role_label','description','accent'];
const protectedFields=row=>Object.fromEntries(Object.entries(row).filter(([k])=>![...artFields,'version','updated_at'].includes(k)));
// Explicit operation only. Caller owns one PostgreSQL transaction; never run on
// normal game requests. A catalog art swap does not grant or extend ownership.
export async function replaceClanAvatarsWithHanbok(q){
 await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,'{\"status\":\"PENDING\"}',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",[CLAN_HANBOK_KEY]);
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[CLAN_HANBOK_KEY]);const receipt=parse(saved.value);
 if(receipt.status==='COMPLETED')return {...receipt.result,replayed:true};assert.equal(receipt.status,'PENDING');
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 const before=await q('SELECT * FROM avatar_catalog_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[CLAN_HANBOK_CODES]);
 assert.deepEqual(before.map(a=>a.code),CLAN_HANBOK_CODES,'All eight registered clan avatars are required');
 const effects=await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=ANY($1::text[]) ORDER BY avatar_code,option_order',[CLAN_HANBOK_CODES]);
 const now=new Date().toISOString(),changes=[];
 for(const old of before){
  const entry=manifest.entries.find(e=>e.code===old.code),expected=previous.find(a=>a.code===old.code);
  assert.equal(old.name,expected.name);for(const k of artFields)assert.equal(old[k],expected[k],old.code+' art changed; inspect again');
  const role=old.name.split(' ')[0]+' 클랜 한복',description=`${entry.name}의 ${entry.caption} 한복 아바타입니다. 한복 로비 일러스트와 투명 장비창 전신을 함께 적용합니다.`;
  const updated=await q('UPDATE avatar_catalog_v1 SET lobby_image=$1,lobby_mobile_image=$2,equipment_image=$3,role_label=$4,description=$5,accent=$6,version=version+1,updated_at=$7 WHERE code=$8 AND version=$9 RETURNING *',[entry.lobbyImage,entry.lobbyMobileImage,entry.equipmentImage,role,description,entry.accent,now,old.code,old.version]);
  assert.equal(updated.length,1,'Catalog version changed');const after=updated[0];assert.deepEqual(protectedFields(after),protectedFields(old));assert.equal(Number(after.version),Number(old.version)+1);
  changes.push({code:old.code,name:old.name,before:Object.fromEntries([...artFields,'version'].map(k=>[k,old[k]])),after:Object.fromEntries([...artFields,'version'].map(k=>[k,after[k]]))});
 }
 assert.deepEqual(await q('SELECT * FROM avatar_effect_options_v1 WHERE avatar_code=ANY($1::text[]) ORDER BY avatar_code,option_order',[CLAN_HANBOK_CODES]),effects);
 const result={status:'COMPLETED',operationKey:CLAN_HANBOK_KEY,count:changes.length,changes,ownershipChanged:false,expiryChanged:false,effectsChanged:false,loadoutChanged:false,completedAt:now};
 const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'CLAN_AVATAR_HANBOK_SWAP','AVATAR_CATALOG',$1,$2,$3) RETURNING id",[CLAN_HANBOK_KEY,JSON.stringify(changes.map(c=>({code:c.code,...c.before}))),JSON.stringify(result)]);assert.ok(audit);result.adminLogId=String(audit.id);
 await q('UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1',[CLAN_HANBOK_KEY,JSON.stringify({status:'COMPLETED',result}),now]);
 return {...result,replayed:false};
}
