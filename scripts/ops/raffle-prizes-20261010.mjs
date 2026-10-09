import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./raffle-prizes-20261010.json',import.meta.url),'utf8'));
export const PLAN_HASH='dfe990c28c65663bb7ec0f3656fe6756b704af27cd977905fa9f58ade643c211';
export const OPERATION_KEY=PLAN.operationKey;
export const ACTION='OPS_RAFFLE_PRIZES_20261010';
const q=async(c,sql,values=[])=>(await c.query(sql,values)).rows;
const ids=PLAN.recipients.map(r=>r.userId);
const cards=PLAN.recipients.filter(r=>r.reward.kind==='MERCENARY');
const suits=PLAN.recipients.filter(r=>r.reward.kind==='EQUIPMENT');
const grantId=r=>OPERATION_KEY+':'+r.userId+':'+r.reward.code;

function validatePlan(hash){
 assert.equal(hash,PLAN_HASH,'Inspected plan hash required');
 assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(PLAN.authorization,'지급해 저대로');assert.equal(PLAN.delivery,'DIRECT');
 assert.equal(ids.length,12);assert.equal(new Set(ids).size,12);assert.equal(cards.length,7);assert.equal(suits.length,5);
 assert.deepEqual(PLAN.recipients.map(r=>r.participant),['혜루','레드클라우드','쁴로리','족구조아','으악','zkzk9999','족단','다시생각','핫시','라페스타다','헬로희야','박사']);
 assert.deepEqual(PLAN.recipients.map(r=>r.reward.code),['V-055','V-055','V-055','V-049','V-049','V-049','V-049','BATTLE_SUIT_S_BODY','BATTLE_SUIT_S_BODY','BATTLE_SUIT_S_BODY','BATTLE_SUIT_S_BODY','BATTLE_SUIT_S_BODY']);
 assert.equal(PLAN.ticketAllocation.length,65);
 let pool=PLAN.ticketAllocation.flatMap(p=>p.tickets.map(ticket=>({name:p.name,ticket})));
 assert.equal(pool.length,94);assert.equal(new Set(pool.map(p=>p.ticket)).size,94);
 for(const r of PLAN.recipients){
  assert.equal(r.reward.quantity,1);
  assert.ok(pool.some(p=>p.name===r.participant&&p.ticket===r.winningTicket));
  const drawn=PLAN.draw.results.find(d=>d.order===r.order);
  assert.equal(drawn.name,r.participant);assert.equal(drawn.prize,r.prize);
  assert.equal(drawn.winningTicket,r.winningTicket);assert.equal(drawn.eligibleTicketsBeforeDraw,pool.length);
  pool=pool.filter(p=>p.name!==r.participant);
 }
}

export async function balances(c){
 const cardRows=await q(c,'SELECT user_id::text,mercenary_code,total_copies,duplicate_count FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) AND mercenary_code=ANY($2::text[]) ORDER BY user_id,mercenary_code',[cards.map(r=>r.userId),['V-049','V-055']]);
 const instanceRows=await q(c,'SELECT user_id::text,COUNT(*)::text quantity FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 GROUP BY user_id ORDER BY user_id',[suits.map(r=>r.userId)]);
 const countRows=await q(c,'SELECT user_id::text,quantity::text FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 ORDER BY user_id',[suits.map(r=>r.userId)]);
 return {cardRows,instanceRows,countRows};
}

export async function verifyRaffle(c,receipt,{checkBalances=false}={}){
 validatePlan(receipt.planHash);
 assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.status,'COMPLETED');
 assert.equal(receipt.authorization,PLAN.authorization);assert.equal(receipt.delivery,'DIRECT');
 assert.deepEqual(receipt.totals,PLAN.totals);assert.equal(receipt.grants.length,12);
 assert.equal(new Set(receipt.grants.map(g=>g.userId)).size,12);
 const acquisitions=await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[])',[cards.map(grantId)]);
 const instances=await q(c,'SELECT id::text,user_id::text,equipment_id::text,source_type,source_id,request_id FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 AND source_id=$2',[suits.map(r=>r.userId),OPERATION_KEY]);
 const audits=await q(c,"SELECT id::text,admin_id::text,target_type,target_id,before_data,after_data FROM admin_logs WHERE action_type=$1 AND after_data::jsonb->>'operationKey'=$2",[ACTION,OPERATION_KEY]);
 assert.equal(acquisitions.length,7);assert.equal(instances.length,5);assert.equal(audits.length,12);
 const state=checkBalances?await balances(c):null;
 for(const r of PLAN.recipients){
  const g=receipt.grants.find(g=>g.userId===r.userId);assert.ok(g);
  for(const field of Object.keys(r))assert.deepEqual(g[field],r[field]);
  assert.equal(g.operationKey,OPERATION_KEY);assert.equal(g.grantId,grantId(r));
  assert.equal(g.quantityAfter,g.quantityBefore+1);
  if(r.reward.kind==='MERCENARY'){
   const a=acquisitions.find(a=>a.acquisition_id===g.grantId);assert.ok(a);
   assert.equal(String(a.user_id),r.userId);assert.equal(a.mercenary_code,r.reward.code);
   assert.equal(a.total_copies_after,g.quantityAfter);assert.equal(a.duplicate_count_after,g.quantityAfter-1);
   assert.equal(a.is_duplicate,g.quantityBefore>0?1:0);
   if(state){
    const row=state.cardRows.find(s=>s.user_id===r.userId&&s.mercenary_code===r.reward.code);assert.ok(row);
    assert.equal(row.total_copies,g.quantityAfter);assert.equal(row.duplicate_count,g.quantityAfter-1);
   }
  }else{
   const e=instances.find(e=>e.id===g.instanceId);assert.ok(e);
   assert.equal(e.user_id,r.userId);assert.equal(e.equipment_id,r.reward.id);
   assert.equal(e.source_type,'ADMIN');assert.equal(e.source_id,OPERATION_KEY);assert.equal(e.request_id,g.grantId);
   if(state){
    assert.equal(Number(state.instanceRows.find(s=>s.user_id===r.userId)?.quantity||0),g.quantityAfter);
    assert.equal(Number(state.countRows.find(s=>s.user_id===r.userId)?.quantity||0),g.quantityAfter);
   }
  }
  const audit=audits.find(a=>a.id===g.adminLogId);assert.ok(audit);
  assert.equal(audit.admin_id,receipt.adminId);assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,r.userId);
  const {adminLogId,...logged}=g;
  assert.deepEqual(JSON.parse(audit.after_data),logged);
  assert.deepEqual(JSON.parse(audit.before_data),{quantity:g.quantityBefore});
 }
 return {recipients:12,mercenaryAcquisitions:7,equipmentInstances:5,adminLogs:12,missing:0,duplicateRecipients:0};
}

// Caller owns BEGIN / COMMIT / ROLLBACK. Ownership, audit and receipt commit together.
export async function grantRaffle(c,inspectedHash){
 validatePlan(inspectedHash);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){
  const receipt=JSON.parse(saved.value);
  return {receipt,replayed:true,verification:await verifyRaffle(c,receipt)};
 }
 const users=await q(c,'SELECT id::text,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 const providers=await q(c,'SELECT user_id::text,provider,provider_name,provider_user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[ids]);
 assert.equal(users.length,12);assert.equal(providers.length,12);
 for(const r of PLAN.recipients){
  const u=users.find(u=>u.id===r.userId),p=providers.find(p=>p.user_id===r.userId);
  assert.equal(u?.nickname,r.gameNickname);assert.equal(u?.status,'ACTIVE');
  assert.equal(p?.provider,r.provider);assert.equal(p?.provider_name,r.providerName);assert.equal(p?.provider_user_id,r.providerUserId);
 }
 const [owner]=await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");assert.ok(owner);
 const [configRow]=await q(c,"SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
 const [drawRow]=await q(c,'SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
 const config=JSON.parse(configRow.payload_json),draw=JSON.parse(drawRow.payload_json);
 for(const r of cards){
  const m=config.mercenaries.find(m=>m.code===r.reward.code);
  assert.equal(m?.name,r.reward.name);assert.equal(m?.rank,'SSS');assert.equal(m?.review,'REVIEWED');
  assert.ok(Number(draw.cardRules?.cardWeights?.[r.reward.code]??1)>0,'Mercenary acquisition is OFF');
 }
 assert.equal((await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[])',[['V-049','V-055']])).length,0,'Limited stock requires separate handling');
 const [equipment]=await q(c,'SELECT id::text,code,name,slot,is_active,is_public FROM character_equipment_items WHERE id=47 FOR SHARE');
 assert.equal(equipment?.code,'BATTLE_SUIT_S_BODY');assert.equal(equipment?.name,'S-BODY');assert.equal(equipment?.slot,'BATTLE_SUIT');
 assert.equal(Number(equipment?.is_active),1);assert.equal(Number(equipment?.is_public),1);
 const prior=await q(c,"SELECT 'card' kind FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[]) UNION ALL SELECT 'equipment' FROM user_equipment_instances WHERE user_id=ANY($5::bigint[]) AND equipment_id=47 AND (source_id=$2 OR request_id=ANY($3::text[])) UNION ALL SELECT 'audit' FROM admin_logs WHERE action_type=$4",[cards.map(grantId),OPERATION_KEY,suits.map(grantId),ACTION,suits.map(r=>r.userId)]);
 assert.equal(prior.length,0,'Prior grant without receipt requires reconciliation');
 await c.query('SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) AND mercenary_code=ANY($2::text[]) ORDER BY user_id,mercenary_code FOR UPDATE',[cards.map(r=>r.userId),['V-049','V-055']]);
 await c.query('SELECT user_id FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 ORDER BY user_id FOR UPDATE',[suits.map(r=>r.userId)]);
 const before=await balances(c);
 for(const r of suits)assert.equal(Number(before.instanceRows.find(e=>e.user_id===r.userId)?.quantity||0),Number(before.countRows.find(e=>e.user_id===r.userId)?.quantity||0),'Equipment aggregate differs before grant');
 const now=new Date().toISOString(),grants=[];
 for(const r of cards){
  const b=before.cardRows.find(c=>c.user_id===r.userId&&c.mercenary_code===r.reward.code);
  if(b){assert.ok(b.total_copies>=1);assert.equal(b.duplicate_count,b.total_copies-1);}
  const [a]=await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=EXCLUDED.last_obtained_at RETURNING total_copies,duplicate_count',[r.userId,r.reward.code,now]);
  assert.equal(a.total_copies,(b?.total_copies||0)+1);
  assert.equal((await c.query('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[grantId(r),r.userId,r.reward.code,b?1:0,a.total_copies,a.duplicate_count,now])).rowCount,1);
  grants.push({...r,operationKey:OPERATION_KEY,actor:'CODEX_OPERATIONS',grantId:grantId(r),quantityBefore:b?.total_copies||0,quantityAfter:a.total_copies});
 }
 const inserted=await q(c,"INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) SELECT x.user_id,47,'ADMIN',$2,x.request_id FROM unnest($1::bigint[],$3::text[]) x(user_id,request_id) RETURNING id::text,user_id::text",[suits.map(r=>r.userId),OPERATION_KEY,suits.map(grantId)]);
 assert.equal(inserted.length,5);
 for(const r of suits){
  const row=inserted.find(e=>e.user_id===r.userId);assert.ok(row);
  const quantityBefore=Number(before.instanceRows.find(e=>e.user_id===r.userId)?.quantity||0);
  grants.push({...r,operationKey:OPERATION_KEY,actor:'CODEX_OPERATIONS',grantId:grantId(r),instanceId:row.id,quantityBefore,quantityAfter:quantityBefore+1});
 }
 grants.sort((a,b)=>a.order-b.order);
 const audits=await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT $1,$2,'USER',x.user_id,x.before_data,x.after_data FROM unnest($3::text[],$4::text[],$5::text[]) x(user_id,before_data,after_data) RETURNING id::text,target_id",[owner.id,ACTION,ids,grants.map(g=>JSON.stringify({quantity:g.quantityBefore})),grants.map(g=>JSON.stringify(g))]);
 assert.equal(audits.length,12);
 for(const g of grants){const a=audits.find(a=>a.target_id===g.userId);assert.ok(a);g.adminLogId=a.id;}
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,delivery:'DIRECT',adminId:owner.id,totals:PLAN.totals,grants,completedAt:now};
 assert.equal((await c.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 return {receipt,replayed:false,verification:await verifyRaffle(c,receipt,{checkBalances:true})};
}
