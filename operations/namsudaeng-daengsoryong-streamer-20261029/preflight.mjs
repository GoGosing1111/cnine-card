import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {connect,safe,hash} from '../rap-contest-rewards-20261027/preflight.mjs';
const db=connect(),operationKey='ops:namsudaeng-daengsoryong-streamer:20261029:v1';
try {
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>{try{return (await db.query(sql,args)).rows;}catch(e){throw Error(sql.slice(0,100)+': '+safe(e));}};
 const rows=await q('SELECT u.id::text,u.nickname,u.role,u.status,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=183 OR u.nickname=$1',['남수댕']);
 assert.equal(rows.length,1);const u=rows[0];assert.equal(u.id,'183');assert.equal(u.nickname,'남수댕');assert.equal(u.status,'ACTIVE');assert(u.provider&&u.provider_user_id);
 const meta=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[operationKey,'pet_cms_preparation_v1','pet_collection_v1:183','pet_loadout_v1:183','pet_potentials_v1:183']]);
 assert(!meta.some(r=>r.key===operationKey),'Already completed: inspect receipt');
 const cms=JSON.parse(meta.find(r=>r.key==='pet_cms_preparation_v1').value),pets=cms.document.pets.filter(p=>p.code==='PET-DAENGSORYONG');
 assert.equal(pets.length,1);assert.equal(pets[0].name,'댕소룡');
 const items=await q('SELECT code,name,description,is_active FROM inventory_items WHERE code=$1',['REVERSECALL_STREAMER_GIFT_BOX']);
 assert.equal(items.length,1);assert.equal(Number(items[0].is_active),1);
 const logs=await q('SELECT id::text FROM inventory_logs WHERE item_code=$1 AND reference_id=$2',[items[0].code,operationKey]);assert.equal(logs.length,0);
 const audit=await q('SELECT id::text FROM admin_logs WHERE target_id=$1',[operationKey]);assert.equal(audit.length,0);
 const inventory=await q('SELECT quantity::text,unseen_quantity::text FROM cnine_user_inventory WHERE user_id=183 AND item_code=$1',[items[0].code]);
 const target={userId:u.id,nickname:u.nickname,role:u.role,identityHash:hash({provider:u.provider,providerId:u.provider_user_id}),amount:4};
 const source={operationKey,authorization:'남수댕 계정에 댕소룡 지급하고 스트리머 선물 4개 지급해',clarification:'펫이야 임마',delivery:'DIRECT',petQuantity:1,boxQuantity:4};
 const plan={...source,targets:[target],petCode:pets[0].code,petName:pets[0].name,petDefinition:pets[0],petDefinitionHash:hash(pets[0]),itemCode:items[0].code,itemName:items[0].name,itemDescription:items[0].description,checkedAt:new Date().toISOString()};
 for(const [file,data] of [['source.json',source],['plan.json',plan],['preflight.json',{plan,inventory,petCollection:meta.find(r=>r.key==='pet_collection_v1:183'),petLoadout:meta.find(r=>r.key==='pet_loadout_v1:183'),cmsRevision:cms.revision}]])await fs.writeFile(new URL('./'+file,import.meta.url),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 await db.query('ROLLBACK');console.log(JSON.stringify({target:{id:u.id,nickname:u.nickname},pet:pets[0].name,petQuantity:1,boxes:4,planHash:hash(plan)}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
