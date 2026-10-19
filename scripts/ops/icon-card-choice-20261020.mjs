import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ICON_CHOICE_ITEM as ITEM,ICON_CHOICE_CARDS} from '../../shared/icon-card-choice-v1.mjs';
export const OPERATION_KEY='ops:icon-card-choice:20261020:v1';
export async function registerIconChoiceItem(client,{commit=false,actorId=1}={}){
 const q=async(sql,values=[])=>(await client.query(sql,values)).rows;
 await q('BEGIN');try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[actorId])).length);
  const before=(await q('SELECT * FROM inventory_items WHERE code=$1 FOR UPDATE',[ITEM.code]))[0];assert(!before,'Unexpected existing item; inspect before replacing');
  const [pass]=await q("SELECT value FROM app_meta WHERE key='supporter_season_pass_v1' FOR SHARE");
  const cards=await q("SELECT c.id FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=ANY($1::text[]) AND c.rarity='ICON' AND c.is_active=1 AND m.is_active=1 AND c.card_status='PUBLIC'",[ICON_CHOICE_CARDS.map(c=>c.cardId)]);assert.equal(cards.length,8);
  const [item]=await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,50,1) RETURNING *',[ITEM.code,ITEM.name,ITEM.subtitle,ITEM.description,ITEM.category,ITEM.rarity,ITEM.image]);
  const passHash=createHash('sha256').update(pass?.value??'null').digest('hex');
  const result={operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),itemCode:ITEM.code,name:ITEM.name,choices:cards.length,passUnchanged:true,passHash,granted:0,committed:commit};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'ICON_CHOICE_REGISTER','INVENTORY_ITEM',$2,NULL,$3) RETURNING id",[actorId,ITEM.code,JSON.stringify({item,...result})]);result.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(result)]);
  const [afterPass]=await q("SELECT value FROM app_meta WHERE key='supporter_season_pass_v1'");assert.equal(afterPass?.value,pass?.value);
  await q(commit?'COMMIT':'ROLLBACK');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
