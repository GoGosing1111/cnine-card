// One-time, explicitly authorized recipe registration. Never imported by runtime.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {equipmentCraftPolicy} from '../../shared/workshop-equipment-craft.mjs';
export const OP='ops:arden-craft:20261029:v1';
export const PARTS=Object.freeze(['TOP','BOTTOM','SHOES','DUAL_DISK']);
export const recipeCodes=PARTS.map(part=>'WORKSHOP_ARDEN_'+part);
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
export function draftFor(part,equipment){
 const input=one(equipment.filter(e=>e.code==='EMPEROR_'+part)),output=one(equipment.filter(e=>e.code==='ARDEN_'+part));
 assert.equal(input.slot,output.slot);
 for(const e of [input,output]){assert.equal(Number(e.is_active),1);assert.equal(Number(e.is_public),1);}
 const draft={code:'WORKSHOP_ARDEN_'+part,name:output.name+' 제작',category:'ITEM_SYNTHESIS',outputType:'EQUIPMENT',outputRef:String(output.id),outputQuantity:1,paymentMode:'COIN_ONLY',coinCost:50000000000000,masterStarCost:0,successRate:10,equipmentCraft:{inputEquipmentId:Number(input.id),requiredLevel:15,pityAfter:3,revision:0,failureInputPolicy:'PRESERVE',failureRepairable:false},materials:[{itemCode:'ARDEN_ENERGY',quantity:50}],isActive:true,isPublic:true,ownerTestOnly:false,isFeatured:false,sortOrder:200+PARTS.indexOf(part)*10,description:`같은 부위의 +15 ${input.name}, 아르덴 에너지 50개와 50조 코인을 사용합니다. 기본 성공률 10%, 3회 실패 후 4번째 제작 확정 성공. 실패 시 엠퍼러 장비와 +15 강화 단계 보존, 성공 시 아르덴 +0 획득.`};
 return {draft,policy:{...equipmentCraftPolicy(draft),revision:1,inputName:input.name,inputImage:input.image_url,inputRarity:input.rarity}};
}
export async function inspect(c){
 return {
  equipment:await q(c,"SELECT * FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id",[PARTS.flatMap(p=>['ARDEN_'+p,'EMPEROR_'+p])]),
  material:one(await q(c,"SELECT * FROM inventory_items WHERE code='ARDEN_ENERGY'")),
  recipes:await q(c,"SELECT * FROM workshop_recipes_v1668 WHERE code=ANY($1::text[]) OR (category='ITEM_SYNTHESIS' AND output_type='EQUIPMENT' AND output_ref IN (SELECT CAST(id AS TEXT) FROM character_equipment_items WHERE code LIKE 'ARDEN_%')) ORDER BY id",[recipeCodes]),
  policies:await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[recipeCodes.map(s=>'WORKSHOP_EQUIPMENT_CRAFT_V1:'+s)]),
  receipt:(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0]?.value??null
 };
}
export async function protectedState(c){return {
 equipment:await q(c,'SELECT * FROM character_equipment_items ORDER BY id'),
 material:await q(c,"SELECT * FROM inventory_items WHERE code LIKE '%ARDEN%' ORDER BY code"),
 recipes:await q(c,'SELECT * FROM workshop_recipes_v1668 WHERE NOT(code=ANY($1::text[])) ORDER BY id',[recipeCodes]),
 materials:await q(c,'SELECT m.* FROM workshop_recipe_materials_v1668 m JOIN workshop_recipes_v1668 r ON r.id=m.recipe_id WHERE NOT(r.code=ANY($1::text[])) ORDER BY recipe_id,item_code',[recipeCodes]),
 policies:await q(c,"SELECT key,value FROM app_meta WHERE key LIKE 'WORKSHOP_EQUIPMENT_CRAFT_V1:%' AND NOT(key=ANY($1::text[])) ORDER BY key",[recipeCodes.map(s=>'WORKSHOP_EQUIPMENT_CRAFT_V1:'+s)])
};}
export async function verify(c){
 const state=await inspect(c);assert(state.receipt);const receipt=JSON.parse(state.receipt);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OP);
 for(const part of PARTS){const {draft,policy}=draftFor(part,state.equipment),r=one(state.recipes.filter(r=>r.code===draft.code));
  for(const [key,value] of Object.entries({output_ref:draft.outputRef,payment_mode:'COIN_ONLY',category:'ITEM_SYNTHESIS',output_type:'EQUIPMENT'}))assert.equal(r[key],value);
  for(const [key,value] of Object.entries({coin_cost:draft.coinCost,master_star_cost:0,success_rate:10,output_quantity:1,is_active:1,is_public:1,owner_test_only:0}))assert.equal(Number(r[key]),value);
  assert.deepEqual(JSON.parse(one(state.policies.filter(p=>p.key==='WORKSHOP_EQUIPMENT_CRAFT_V1:'+draft.code)).value),policy);
  const m=one(await q(c,'SELECT item_code,quantity FROM workshop_recipe_materials_v1668 WHERE recipe_id=$1',[r.id]));assert.equal(m.item_code,'ARDEN_ENERGY');assert.equal(Number(m.quantity),50);
 }
 assert.equal((await q(c,"SELECT id FROM admin_logs WHERE id=$1 AND action_type='OPS_ARDEN_CRAFT_OPEN'",[receipt.auditId])).length,1);
 return {verified:true,receipt,recipes:state.recipes};
}
export async function apply(c,{expectedHash,releaseCommit,dryRun=true,failAfter=0}={}){
 const prior=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0];
 if(prior)return {replayed:true,receipt:JSON.parse(prior.value)}; // SELECT-only replay; never overwrite later CMS edits.
 assert(/^[a-f0-9]{40}$/.test(releaseCommit||''));assert.equal(typeof expectedHash,'string');
 await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 try {
  await c.query("SET LOCAL lock_timeout='4s'");await c.query("SET LOCAL statement_timeout='15s'");await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const duplicate=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]))[0];if(duplicate){await c.query('ROLLBACK');return {replayed:true,receipt:JSON.parse(duplicate.value)};}
  await q(c,'SELECT id FROM character_equipment_items WHERE code=ANY($1::text[]) ORDER BY id FOR UPDATE',[PARTS.flatMap(p=>['ARDEN_'+p,'EMPEROR_'+p])]);
  await q(c,"SELECT code FROM inventory_items WHERE code='ARDEN_ENERGY' FOR UPDATE");
  const before=await inspect(c);assert.equal(hash(before),expectedHash,'Target catalog/recipe changed; inspect again');assert.equal(before.recipes.length,0);assert.equal(before.policies.length,0);assert.equal(Number(before.material.is_active),1);assert.equal(before.material.category,'MATERIAL');
  const protectedBefore=hash(await protectedState(c)),created=[];
  for(const part of PARTS){const {draft:d,policy}=draftFor(part,before.equipment);
   const r=one(await q(c,"INSERT INTO workshop_recipes_v1668(code,category,name,description,output_type,output_ref,output_quantity,payment_mode,coin_cost,master_star_cost,success_rate,is_featured,is_active,is_public,owner_test_only,sort_order) VALUES($1,'ITEM_SYNTHESIS',$2,$3,'EQUIPMENT',$4,1,'COIN_ONLY',$5,0,10,0,1,1,0,$6) RETURNING *",[d.code,d.name,d.description,d.outputRef,d.coinCost,d.sortOrder]));
   await q(c,"INSERT INTO workshop_recipe_materials_v1668(recipe_id,item_code,quantity,sort_order) VALUES($1,'ARDEN_ENERGY',50,10)",[r.id]);
   await q(c,'INSERT INTO app_meta(key,value) VALUES($1,$2)',['WORKSHOP_EQUIPMENT_CRAFT_V1:'+d.code,JSON.stringify(policy)]);created.push({recipe:r,policy});
   if(failAfter===created.length)throw Error('INJECTED_ARDEN_FAILURE');
  }
  assert.equal(hash(await protectedState(c)),protectedBefore,'Unrequested setting changed');
  const owner=one(await q(c,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
  const receipt={status:'COMPLETED',operationKey:OP,releaseCommit,completedAt:new Date().toISOString(),authorization:'아르덴 장비 4종 장비제작 추가: +15 엠퍼러 + 아르덴 에너지 50개 + 50조, 10%, 3번 실패하면 4번째에 성공, 실패 시 +15 그대로 반환',created,protectedHash:protectedBefore,accountWrites:0,messagesSent:0};
  const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_ARDEN_CRAFT_OPEN','WORKSHOP_RECIPE',$2,$3,$4) RETURNING id",[owner.id,OP,JSON.stringify({recipes:[],policies:[]}),JSON.stringify(receipt)]));receipt.auditId=String(audit.id);
  await q(c,'INSERT INTO app_meta(key,value) VALUES($1,$2)',[OP,JSON.stringify(receipt)]);await verify(c);await c.query(dryRun?'ROLLBACK':'COMMIT');
  if(dryRun)assert.equal(hash(await inspect(c)),expectedHash);
  return {replayed:false,committed:!dryRun,rolledBack:dryRun,receipt};
 }catch(e){await c.query('ROLLBACK');throw e;}
}
