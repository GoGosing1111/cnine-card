import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {connect,safe,hash} from '../rap-contest-rewards-20261027/preflight.mjs';

const OP='ops:heukgu-draw-winners:20261102:v1',PET='PET-HEUKGU',names=['˚쟁이。','Moo날두','박사'];
const source={operationKey:OP,authorization:'3명 흑구 지급해',interpretation:'One Heukgu pet per winner from the preceding drawing in this chat. Ticket counts are draw weights, not reward quantities. No redraw, messages, or automatic equip.',quantityPerAccount:1,recipientCount:3,draw:{participants:42,tickets:153,method:'Python secrets.randbelow; weighted draw without replacement of people',winners:[{draw:1,nickname:'˚쟁이。',tickets:5,pickedTicket:64,remainingPoolBeforeDraw:153},{draw:2,nickname:'Moo날두',tickets:5,pickedTicket:43,remainingPoolBeforeDraw:148},{draw:3,nickname:'박사',tickets:2,pickedTicket:104,remainingPoolBeforeDraw:143}]}};
const db=connect();
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const users=await q('SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.nickname=ANY($1::text[]) ORDER BY u.id',[names]);
 assert.equal(users.length,3,'All three winners must resolve uniquely');assert.deepEqual([...users.map(u=>u.nickname)].sort(),[...names].sort());
 const targets=users.map(u=>{assert.equal(u.status,'ACTIVE');assert(u.provider&&u.provider_user_id);return{order:names.indexOf(u.nickname)+1,nickname:u.nickname,userId:u.id,role:u.role,identityHash:hash({provider:u.provider,providerId:u.provider_user_id}),amount:1};});
 const ids=targets.map(t=>t.userId);
 const settings=await q("SELECT key,value FROM app_meta WHERE key IN ('pet_cms_preparation_v1','pet_opening_settings_v1','pet_potential_settings_v1') ORDER BY key");
 const cms=JSON.parse(settings.find(r=>r.key==='pet_cms_preparation_v1').value),pets=cms.document.pets.filter(p=>p.code===PET);assert.equal(pets.length,1);assert.equal(pets[0].name,'흑구');
 const collections=await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[ids.map(id=>'pet_collection_v1:'+id)]);
 const previous=await q("SELECT key,value FROM app_meta WHERE key=$1 OR key LIKE 'pet_grant_receipt_v1:ops-heukgu-draw-20261102-%'",[OP]);assert.equal(previous.length,0,'This drawing reward already processed; inspect receipt instead of issuing again');
 const recent=await q("SELECT id::text,target_id,created_at,after_data FROM admin_logs WHERE action_type='PET_GRANT' AND target_id=ANY($1::text[]) AND after_data LIKE '%PET-HEUKGU%' ORDER BY id DESC LIMIT 30",[ids]);
 const plan={operationKey:OP,authorization:source.authorization,petCode:PET,petName:'흑구',petDefinition:pets[0],petCmsRevision:cms.revision,settingsHash:hash(settings),delivery:'DIRECT_PET_COLLECTION',recipientCount:3,totalPets:3,targets,pending:[],checkedAt:new Date().toISOString()};
 await db.query('ROLLBACK');
 for(const[name,data]of[['source.json',source],['plan.json',plan],['preflight.json',{checkedAt:plan.checkedAt,readOnly:true,plan,settings,collections,recentPetGrants:recent,previous}]])await fs.writeFile(new URL(name,import.meta.url),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({targets:targets.map(t=>({id:t.userId,nickname:t.nickname,amount:t.amount})),petCode:PET,petName:pets[0].name,cmsRevision:cms.revision,current:targets.map(t=>({id:t.userId,quantity:JSON.parse(collections.find(r=>r.key==='pet_collection_v1:'+t.userId)?.value||'{"pets":{}}').pets[PET]??0})),previousOperation:previous.length,recentPetGrants:recent.map(r=>({id:r.id,targetId:r.target_id,createdAt:r.created_at})),planHash:hash(plan)}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
