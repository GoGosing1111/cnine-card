import assert from 'node:assert/strict';
import {prepareChickenEvent} from '../../functions/_chicken_event.js';
import {CHICKEN_KEY,CHICKEN_TICKET,chickenDraft} from '../../shared/chicken-event-v1.mjs';
export const PREPARE_KEY='ops:chicken-event-prepare:20261008:v1';
// Explicit setup only. Never assign dates, odds, stock limits or user tickets.
export async function prepareChickenEventOperation(client,{commit=false}={}){
 const q=async(text,values=[])=>(await client.query(text,values)).rows;
 await q('BEGIN');
 try{
  await q("SET LOCAL lock_timeout='5s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[PREPARE_KEY]);
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[PREPARE_KEY]);
  if(prior){await q('ROLLBACK');return {...JSON.parse(prior.value),replayed:true};}
  const [existing]=await q('SELECT value FROM app_meta WHERE key=$1',[CHICKEN_KEY]);
  assert.equal(existing,undefined,'Unexpected prior event settings; inspect before preparation');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Active OWNER required');
  await prepareChickenEvent(client);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[CHICKEN_KEY]),settings=JSON.parse(saved.value).settings;
  assert.deepEqual(settings,chickenDraft());
  const [ticket]=await q('SELECT code,name,is_active FROM inventory_items WHERE code=$1',[CHICKEN_TICKET]);assert.equal(ticket.name,'핑두의 배민권');assert.equal(Number(ticket.is_active),1);
  const receipt={operation:PREPARE_KEY,preparedAt:new Date().toISOString(),restaurant:'철구네 치킨',settings,ticket:CHICKEN_TICKET,ticketCost:1,ticketsGranted:0,stockLimitsChanged:false};
  const [audit]=await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'CHICKEN_EVENT_PREPARE','EVENT',$2,$3,$4) RETURNING id",[owner.id,CHICKEN_KEY,'null',JSON.stringify(receipt)]);assert.ok(audit);receipt.auditId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP)',[PREPARE_KEY,JSON.stringify(receipt)]);
  await q(commit?'COMMIT':'ROLLBACK');return {...receipt,dryRun:!commit};
 }catch(e){await q('ROLLBACK').catch(()=>{});throw e;}
}
