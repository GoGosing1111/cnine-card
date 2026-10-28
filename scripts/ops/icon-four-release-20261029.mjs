import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ICON_EXPANSION_CARDS} from '../../shared/icon-expansion-v1.mjs';
export const OPERATION_KEY='ops:icon-four-release:20261029:v1';
export const MEMBER_IDS=Object.freeze([4,37,15,3]);
const settingKeys=['icon_cms_v1','icon_fusion_settings_v1','icon_role_settings_v1','icon_technique_preparation_v1','icon_enhancement_settings_v1'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const columns='id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,card_status,base_power,reroll_material_enabled,reroll_result_enabled';
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const ids=ICON_EXPANSION_CARDS.map(c=>c.cardId);
export async function inspectIconFour(c){
 const cards=await q(c,'SELECT '+columns+" FROM cards WHERE rarity_override='ICON' OR id=ANY($1::text[]) ORDER BY id",[ids]);
 const settings=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settingKeys]);
 const members=await q(c,'SELECT id,name,is_active FROM members WHERE id=ANY($1::bigint[]) ORDER BY id',[MEMBER_IDS]);
 const receipt=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]))[0];
 const state={cards,settings,members};return {...state,stateHash:hash(state),receipt:receipt?JSON.parse(receipt.value):null};
}
export async function verifyIconFour(c,receipt){
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 const after=await inspectIconFour(c);
 for(const [i,spec] of ICON_EXPANSION_CARDS.entries()){
  const row=after.cards.find(c=>c.id===spec.cardId);assert(row,'Missing '+spec.cardId);
  assert.equal(Number(row.member_id),MEMBER_IDS[i]);assert.equal(row.title,spec.name);assert.equal(row.rarity,'FUR');assert.equal(row.rarity_override,'ICON');
  assert.equal(Number(row.base_power),360000);assert.equal(row.image_url,spec.sourceArt);assert.equal(row.card_status,'PUBLIC');assert.equal(Number(row.is_active),1);
  for(const key of ['draw_weight','reroll_material_enabled','reroll_result_enabled'])assert.equal(Number(row[key]),0);
 }
 assert.equal(after.cards.filter(c=>ids.includes(c.id)).length,4);
 return {status:'VERIFIED',cards:ids,basePower:360000,accountWrites:0};
}
export async function applyIconFour(c,{expectedStateHash,dryRun=false,failAfter=''}={}){
 const initial=await inspectIconFour(c);
 if(initial.receipt)return {receipt:initial.receipt,verification:await verifyIconFour(c,initial.receipt),replayed:true};
 assert.match(expectedStateHash||'',/^[a-f0-9]{64}$/);
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 try{
  await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='20s'");
  await q(c,'SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const before=await inspectIconFour(c);assert.equal(before.stateHash,expectedStateHash,'Catalogue or settings changed; inspect again');assert.equal(before.receipt,null);
  assert.equal(before.cards.filter(c=>ids.includes(c.id)).length,0,'Do not replace an existing card');
  const owner=(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"))[0];assert(owner);
  await q(c,'SELECT id FROM members WHERE id=ANY($1::bigint[]) FOR SHARE',[MEMBER_IDS]);
  const fusion=JSON.parse(before.settings.find(s=>s.key==='icon_fusion_settings_v1').value);assert.equal(fusion.enabled,true);
  for(const [i,spec] of ICON_EXPANSION_CARDS.entries()){
   const member=before.members.find(m=>Number(m.id)===MEMBER_IDS[i]);assert.equal(member?.name,spec.name);assert.equal(Number(member.is_active),1);
   await q(c,"INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,card_status,batch_name,batch_date,base_power,reroll_material_enabled,reroll_result_enabled) VALUES($1,$2,$3,'FUR','ICON',$4,50,50,1,0,'PUBLIC','아이콘 4종 제작 개방','2026-10-29',360000,0,0)",[spec.cardId,MEMBER_IDS[i],spec.name,spec.sourceArt]);
   if(failAfter===spec.code)throw Error('INJECTED_FAILURE:'+spec.code);
  }
  const after=await inspectIconFour(c);
  assert.deepEqual(after.settings,before.settings,'Preserve all existing ICON CMS and economic settings');
  assert.deepEqual(after.cards.filter(c=>!ids.includes(c.id)),before.cards,'Preserve all nine existing cards');
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),cards:ICON_EXPANSION_CARDS.map((s,i)=>({id:s.cardId,code:s.code,name:s.name,memberId:MEMBER_IDS[i],basePower:s.basePower,technique:s.techniqueCode})),existingCardsHash:hash(before.cards),settingsHash:hash(before.settings),accountWrites:0,currencyWrites:0,grants:0};
  const audit=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'OPS_ICON_FOUR_RELEASE','CARD_CATALOG',$1,$2,$3) RETURNING id",[OPERATION_KEY,JSON.stringify({stateHash:before.stateHash,cards:[]}),JSON.stringify(receipt)]);assert.equal(audit.length,1);receipt.auditId=String(audit[0].id);
  await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(receipt)]);
  if(failAfter==='receipt')throw Error('INJECTED_FAILURE:receipt');
  const verification=await verifyIconFour(c,receipt);
  await c.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,dryRun,replayed:false};
 }catch(e){await c.query('ROLLBACK');throw e;}
}
