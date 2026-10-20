import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RANK_POTIONS} from '../../shared/rank-exp-potion-v1.mjs';
export const OPERATION_KEY='ops:rank-exp-potions:20261020:v1';
export async function registerRankPotions(client,{commit=false,actorId=1}={}){
 const q=async(sql,values=[])=>(await client.query(sql,values)).rows;
 await q('BEGIN');try{
  await q("SET LOCAL lock_timeout='5s'");await q("SET LOCAL statement_timeout='20s'");await q('SELECT pg_advisory_xact_lock(hashtext($1))',[OPERATION_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  assert((await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[actorId])).length);
  assert.equal((await q('SELECT code FROM inventory_items WHERE code=ANY($1::text[]) FOR UPDATE',[RANK_POTIONS.map(x=>x.code)])).length,0,'Unexpected existing potion; inspect before replacing');
  const [pass]=await q("SELECT value FROM app_meta WHERE key='supporter_season_pass_v1' FOR SHARE"),items=[];
  for(const item of RANK_POTIONS){
   const [row]=await q('INSERT INTO inventory_items(code,name,subtitle,description,category,rarity,image_url,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING *',[item.code,item.name,item.subtitle,item.description,item.category,item.rarity,item.image,50+item.multiplier]);items.push(row);
  }
  const result={operationKey:OPERATION_KEY,completedAt:new Date().toISOString(),itemCodes:items.map(x=>x.code),durationMinutes:60,sameMultiplier:'EXTEND',differentMultiplier:'REPLACE',passUnchanged:true,passHash:createHash('sha256').update(pass?.value??'null').digest('hex'),granted:0,committed:commit};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'RANK_POTION_REGISTER','INVENTORY_ITEM',$2,NULL,$3) RETURNING id",[actorId,OPERATION_KEY,JSON.stringify({items,...result})]);result.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[OPERATION_KEY,JSON.stringify(result)]);
  const [afterPass]=await q("SELECT value FROM app_meta WHERE key='supporter_season_pass_v1'");assert.equal(afterPass?.value,pass?.value);
  await q(commit?'COMMIT':'ROLLBACK');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
