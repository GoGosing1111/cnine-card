// One explicitly requested card registration. No ownership/currency writes.
import assert from 'node:assert/strict';
import {ICON_LIVE_CARDS,ICON_FUSION_CARDS} from '../../shared/icon-fusion-policy-v1.mjs';
export const RECEIPT_KEY='release_icon_zeus_cheolgu_20261010_v1';
const card=ICON_LIVE_CARDS.find(c=>c.code==='ICON-ZEUS-CHEOLGU');
const columns='id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,card_status,base_power,reroll_material_enabled,reroll_result_enabled';
const keys=['icon_fusion_settings_v1','icon_role_settings_v1','icon_cms_v1'];
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
function verify(row){
 assert.ok(row,'Missing Zeus card');assert.equal(row.id,card.cardId);assert.equal(Number(row.member_id),30);assert.equal(row.title,card.name);assert.equal(row.rarity,'FUR');assert.equal(row.rarity_override,'ICON');
 assert.equal(row.image_url,card.sourceArt);assert.equal(Number(row.base_power),180000);assert.equal(Number(row.is_active),1);assert.equal(row.card_status,'PUBLIC');
 for(const key of ['draw_weight','reroll_material_enabled','reroll_result_enabled'])assert.equal(Number(row[key]),0);
 assert.ok(!ICON_FUSION_CARDS.some(c=>c.cardId===row.id));
 return row;
}
export async function inspect(c){
 const row=(await q(c,'SELECT '+columns+' FROM cards WHERE id=$1',[card.cardId]))[0]||null;
 const receipt=(await q(c,'SELECT value FROM app_meta WHERE key=$1',[RECEIPT_KEY]))[0]?.value;
 return {card:row,receipt:receipt?JSON.parse(receipt):null};
}
export async function apply(c,{dryRun=false}={}){
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='4s'");
  await c.query("SELECT pg_advisory_xact_lock(hashtext('register-icon-zeus-cheolgu-20261010'))");
  const before=await inspect(c);
  if(before.receipt){verify(before.card);assert.equal(before.receipt.cardId,card.cardId);await c.query('ROLLBACK');return {...before.receipt,replayed:true,dryRun};}
  assert.equal(before.card,null,'An unreceipted Zeus ID already exists');
  assert.equal((await q(c,'SELECT id FROM cards WHERE title=$1',[card.name])).length,0,'Duplicate Zeus title');
  const member=await q(c,'SELECT id,name,is_active FROM members WHERE id=$1 FOR SHARE',[30]);
  assert.equal(member.length,1);assert.equal(member[0].name,'철구');assert.equal(Number(member[0].is_active),1);
  const settings=await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys]);
  assert.equal(settings.length,3);
  const existingIds=ICON_FUSION_CARDS.map(c=>c.cardId);
  const previousCards=await q(c,'SELECT '+columns+' FROM cards WHERE id=ANY($1::text[]) ORDER BY id',[existingIds]);assert.equal(previousCards.length,7);
  const created=await q(c,"INSERT INTO cards(id,member_id,title,rarity,rarity_override,image_url,focus_x,focus_y,is_active,draw_weight,card_status,batch_name,batch_date,base_power,reroll_material_enabled,reroll_result_enabled) VALUES($1,30,$2,'FUR','ICON',$3,50,50,1,0,'PUBLIC','제우스 철구 ICON','2026-10-10',180000,0,0) RETURNING "+columns,[card.cardId,card.name,card.sourceArt]);
  assert.equal(created.length,1);verify(created[0]);
  assert.deepEqual(await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[keys]),settings,'Existing settings changed');
  assert.deepEqual(await q(c,'SELECT '+columns+' FROM cards WHERE id=ANY($1::text[]) ORDER BY id',[existingIds]),previousCards,'Previous cards changed');
  const receipt={operation:RECEIPT_KEY,cardId:card.cardId,code:card.code,name:card.name,registeredAt:new Date().toISOString(),sourceArt:card.sourceArt,sourceSha256:card.sourceSha256,memberId:30,basePower:180000,fusionEligible:false,drawWeight:0,ownershipWrites:0,currencyWrites:0,previousCardsPreserved:true,settingsPreserved:true};
  const logs=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,'ICON_REGISTER','CARD',$1,$2,$3) RETURNING id",[card.cardId,JSON.stringify({card:null}),JSON.stringify(receipt)]);
  assert.equal(logs.length,1);receipt.auditId=String(logs[0].id);
  await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[RECEIPT_KEY,JSON.stringify(receipt)]);
  assert.equal((await inspect(c)).receipt.auditId,receipt.auditId);
  await c.query(dryRun?'ROLLBACK':'COMMIT');
  return {...receipt,replayed:false,dryRun};
 }catch(e){await c.query('ROLLBACK');throw e;}
}

