import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./event-contest-rewards-20261008.json',import.meta.url),'utf8'));
export const PLAN_HASH='81faa511a291580d24a6140c4e0ad26e291e4d5a0ae798d9afb626f0c5de14f7';
export const OPERATION_KEY=PLAN.operationKey;
export const ACTION='OPS_EVENT_CONTEST_REWARDS_20261008';
export const REFERENCE_TYPE='OPS_EVENT_REWARD';
const grantReason=r=>r.award?`이벤트 ${r.award.label} 및 참가상 · 계정당 1회`:'이벤트 참가상 · 계정당 1회';
export const REASONS=[...new Set(PLAN.recipients.map(grantReason))];
const q=async(client,sql,values=[])=>(await client.query(sql,values)).rows;
const ids=PLAN.recipients.map(r=>r.userId);
const itemCodes=['MASTER_STAR','EMPEROR_ENERGY'];
const cardRecipients=PLAN.recipients.filter(r=>r.mercenary);
const acquisitionId=r=>`${OPERATION_KEY}:${r.userId}:${r.mercenary.code}`;
const acquisitionIds=cardRecipients.map(acquisitionId);
const key=(id,code)=>`${id}:${code}`;

function validatePlan(hash){
 assert.equal(hash,PLAN_HASH,'Inspected plan hash required');
 assert.equal(createHash('sha256').update(JSON.stringify(PLAN)).digest('hex'),PLAN_HASH,'Plan changed');
 assert.equal(ids.length,53);assert.equal(new Set(ids).size,53);assert.equal(cardRecipients.length,3);
 assert.equal(PLAN.recipients.filter(r=>r.award).length,4);
 assert.equal(PLAN.recipients.reduce((n,r)=>n+r.inventory[0].quantity,0),239000000);
 assert.equal(PLAN.recipients.reduce((n,r)=>n+r.inventory[1].quantity,0),275);
}

export async function verifyContestRewards(client,receipt,{balances=false}={}){
 validatePlan(receipt.planHash);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.equal(receipt.delivery,'DIRECT');assert.deepEqual(receipt.totals,PLAN.totals);
 assert.deepEqual(receipt.authorization,PLAN.authorization);assert.equal(receipt.grants.length,53);
 assert.equal(new Set(receipt.grants.map(r=>r.userId)).size,53);
 const logs=await q(client,`SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,admin_id::text
   FROM inventory_logs WHERE user_id=ANY($3::bigint[]) AND item_code=ANY($4::text[]) AND reason=ANY($5::text[]) AND reference_type=$1 AND reference_id=$2`,[REFERENCE_TYPE,OPERATION_KEY,ids,itemCodes,REASONS]);
 const cards=await q(client,`SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[])`,[acquisitionIds]);
 const audits=await q(client,`SELECT id::text,admin_id::text,target_type,target_id,before_data,after_data FROM admin_logs
   WHERE action_type=$1 AND after_data::jsonb->>'operationKey'=$2`,[ACTION,OPERATION_KEY]);
 assert.equal(logs.length,106);assert.equal(cards.length,3);assert.equal(audits.length,53);
 assert.equal(new Set(logs.map(r=>key(r.user_id,r.item_code))).size,106);
 const current=balances?await q(client,`SELECT user_id::text,item_code,quantity::text,unseen_quantity::text
   FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[])`,[ids,itemCodes]):[];
 const currentCards=balances?await q(client,`SELECT * FROM user_mercenary_cards_v1
   WHERE user_id=ANY($1::bigint[]) AND mercenary_code=ANY($2::text[])`,[cardRecipients.map(r=>r.userId),['V-049','V-055']]):[];
 for(const expected of PLAN.recipients){
  const grant=receipt.grants.find(r=>r.userId===expected.userId);assert.ok(grant);
  for(const field of ['participant','gameNickname','verifiedNickname','categories','award','participation'])assert.deepEqual(grant[field],expected[field]);
  assert.equal(grant.operationKey,OPERATION_KEY);assert.equal(grant.inventory.length,2);
  for(const item of expected.inventory){
   const actual=grant.inventory.find(r=>r.code===item.code);assert.ok(actual);
   assert.equal(actual.name,item.name);assert.equal(actual.quantity,item.quantity);
   assert.equal(BigInt(actual.quantityAfter)-BigInt(actual.quantityBefore),BigInt(item.quantity));
   assert.equal(BigInt(actual.unseenAfter)-BigInt(actual.unseenBefore),BigInt(item.quantity));
   const log=logs.find(r=>r.id===actual.inventoryLogId);assert.ok(log);
   assert.equal(log.user_id,expected.userId);assert.equal(log.item_code,item.code);
   assert.equal(log.change_amount,String(item.quantity));assert.equal(log.balance_after,actual.quantityAfter);
   assert.equal(log.admin_id,receipt.adminId);
   if(balances){const row=current.find(r=>r.user_id===expected.userId&&r.item_code===item.code);assert.ok(row);
    assert.equal(row.quantity,actual.quantityAfter);assert.equal(row.unseen_quantity,actual.unseenAfter);}
  }
  if(expected.mercenary){
   const card=grant.mercenary;assert.ok(card);assert.equal(card.code,expected.mercenary.code);
   assert.equal(card.name,expected.mercenary.name);assert.equal(card.quantity,1);
   assert.equal(card.acquisitionId,acquisitionId(expected));assert.equal(card.copiesAfter,card.copiesBefore+1);
   const row=cards.find(r=>r.acquisition_id===card.acquisitionId);assert.ok(row);
   assert.equal(String(row.user_id),expected.userId);assert.equal(row.mercenary_code,card.code);
   assert.equal(row.total_copies_after,card.copiesAfter);assert.equal(row.duplicate_count_after,card.copiesAfter-1);
   assert.equal(row.is_duplicate,card.copiesBefore>0?1:0);
   if(balances){const owned=currentCards.find(r=>String(r.user_id)===expected.userId&&r.mercenary_code===card.code);
    assert.ok(owned);assert.equal(owned.total_copies,card.copiesAfter);assert.equal(owned.duplicate_count,card.copiesAfter-1);}
  }else assert.equal(grant.mercenary,null);
  const audit=audits.find(r=>r.id===grant.adminLogId);assert.ok(audit);
  assert.equal(audit.admin_id,receipt.adminId);assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,expected.userId);
  const {adminLogId,...logged}=grant;assert.deepEqual(JSON.parse(audit.after_data),logged);
  assert.deepEqual(JSON.parse(audit.before_data),{inventory:grant.inventory.map(i=>({code:i.code,quantity:i.quantityBefore,unseenQuantity:i.unseenBefore})),mercenaryCopies:grant.mercenary?.copiesBefore??null});
 }
 return {recipients:53,inventoryLogs:106,mercenaryAcquisitions:3,adminLogs:53,
  masterStars:239000000,emperorEnergy:275,missing:0,duplicateRecipients:0};
}

// Caller owns BEGIN / COMMIT / ROLLBACK. Grants, ledgers, audit and receipt are one transaction.
export async function grantContestRewards(client,inspectedHash){
 validatePlan(inspectedHash);
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const [saved]=await q(client,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved){const receipt=JSON.parse(saved.value);return {receipt,replayed:true,verification:await verifyContestRewards(client,receipt)};}
 const users=await q(client,'SELECT id::text,nickname,status FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
 const providers=await q(client,`SELECT user_id::text,provider,provider_name FROM user_second_verifications
   WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE`,[ids]);
 assert.equal(users.length,53);assert.equal(providers.length,53);
 for(const recipient of PLAN.recipients){
  const u=users.find(u=>u.id===recipient.userId),v=providers.find(v=>v.user_id===recipient.userId);
  assert.equal(u?.nickname,recipient.gameNickname);assert.equal(u?.status,'ACTIVE');
  assert.equal(v?.provider,'PLAYDK');assert.equal(v?.provider_name,recipient.verifiedNickname);
 }
 const [owner]=await q(client,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE");
 assert.ok(owner,'Active owner required for audit');
 const items=await q(client,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) FOR SHARE',[itemCodes]);
 for(const item of PLAN.recipients[0].inventory){const catalog=items.find(r=>r.code===item.code);assert.equal(catalog?.name,item.name);assert.equal(Number(catalog?.is_active),1);}
 const [configRow]=await q(client,"SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE");
 assert.ok(configRow);const config=JSON.parse(configRow.payload_json);
 const [drawRow]=await q(client,'SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
 assert.ok(drawRow);const draw=JSON.parse(drawRow.payload_json);
 for(const r of cardRecipients){
  const meta=config.mercenaries.find(m=>m.code===r.mercenary.code);
  assert.equal(meta?.name,r.mercenary.name);assert.equal(meta?.rank,'SSS');assert.equal(meta?.review,'REVIEWED');
  assert.ok(Number(draw.cardRules?.cardWeights?.[r.mercenary.code]??1)>0,'Mercenary acquisition is OFF');
 }
 assert.equal((await q(client,"SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[])",[['V-049','V-055']])).length,0,'Limited acquisition requires stock handling');
 const prior=await q(client,`SELECT 'inventory' kind FROM inventory_logs WHERE user_id=ANY($5::bigint[]) AND item_code=ANY($6::text[]) AND reason=ANY($7::text[]) AND reference_type=$1 AND reference_id=$2
  UNION ALL SELECT 'mercenary' FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($3::text[])
  UNION ALL SELECT 'audit' FROM admin_logs WHERE action_type=$4 AND after_data::jsonb->>'operationKey'=$2`,
  [REFERENCE_TYPE,OPERATION_KEY,acquisitionIds,ACTION,ids,itemCodes,REASONS]);
 assert.equal(prior.length,0,'Prior grant without receipt requires reconciliation');
 const before=await q(client,`SELECT user_id::text,item_code,quantity::text,unseen_quantity::text FROM cnine_user_inventory
  WHERE user_id=ANY($1::bigint[]) AND item_code=ANY($2::text[]) ORDER BY user_id,item_code FOR UPDATE`,[ids,itemCodes]);
 for(const row of before){assert.ok(BigInt(row.quantity)>=0n);assert.ok(BigInt(row.unseen_quantity)>=0n);}
 const entries=PLAN.recipients.flatMap(r=>r.inventory.map(i=>({...i,userId:r.userId})));
 const credited=await q(client,`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
  SELECT x.user_id,x.item_code,x.amount,x.amount,sqlite_now(),sqlite_now()
  FROM unnest($1::bigint[],$2::text[],$3::bigint[]) x(user_id,item_code,amount)
  ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+EXCLUDED.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+EXCLUDED.unseen_quantity,updated_at=EXCLUDED.updated_at
  RETURNING user_id::text,item_code,quantity::text,unseen_quantity::text`,
  [entries.map(r=>r.userId),entries.map(r=>r.code),entries.map(r=>r.quantity)]);
 assert.equal(credited.length,106);
 const grants=PLAN.recipients.map(r=>({...r,operationKey:OPERATION_KEY,actor:'CODEX_OPERATIONS',
  inventory:r.inventory.map(item=>{
   const b=before.find(x=>x.user_id===r.userId&&x.item_code===item.code);
   const a=credited.find(x=>x.user_id===r.userId&&x.item_code===item.code);assert.ok(a);
   const quantityBefore=b?.quantity||'0',unseenBefore=b?.unseen_quantity||'0';
   assert.equal(BigInt(a.quantity)-BigInt(quantityBefore),BigInt(item.quantity));
   assert.equal(BigInt(a.unseen_quantity)-BigInt(unseenBefore),BigInt(item.quantity));
   return {...item,quantityBefore,quantityAfter:a.quantity,unseenBefore,unseenAfter:a.unseen_quantity};
  }),mercenary:null}));
 const logged=await q(client,`INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id)
  SELECT x.user_id,x.item_code,x.amount,i.quantity,x.reason,$5,$6,$7
  FROM unnest($1::bigint[],$2::text[],$3::bigint[],$4::text[]) x(user_id,item_code,amount,reason)
  JOIN cnine_user_inventory i ON i.user_id=x.user_id AND i.item_code=x.item_code
  RETURNING id::text,user_id::text,item_code`,
  [entries.map(r=>r.userId),entries.map(r=>r.code),entries.map(r=>r.quantity),entries.map(e=>grantReason(PLAN.recipients.find(r=>r.userId===e.userId))),REFERENCE_TYPE,OPERATION_KEY,owner.id]);
 assert.equal(logged.length,106);
 for(const r of grants)for(const item of r.inventory){const log=logged.find(l=>l.user_id===r.userId&&l.item_code===item.code);assert.ok(log);item.inventoryLogId=log.id;}
 const createdAt=new Date().toISOString();
 for(const r of cardRecipients){
  const [b]=await q(client,'SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[r.userId,r.mercenary.code]);
  const rows=await q(client,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
   VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET
   total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=EXCLUDED.last_obtained_at
   RETURNING total_copies,duplicate_count`,[r.userId,r.mercenary.code,createdAt]);
  assert.equal(rows.length,1);const a=rows[0];assert.equal(a.total_copies,(b?.total_copies||0)+1);
  const inserted=await client.query(`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
   VALUES($1,$2,$3,$4,$5,$6,$7)`,[acquisitionId(r),r.userId,r.mercenary.code,a.total_copies>1?1:0,a.total_copies,a.duplicate_count,createdAt]);
  assert.equal(inserted.rowCount,1);
  grants.find(g=>g.userId===r.userId).mercenary={...r.mercenary,acquisitionId:acquisitionId(r),copiesBefore:b?.total_copies||0,copiesAfter:a.total_copies};
 }
 const audits=await q(client,`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  SELECT $1,$2,'USER',x.user_id,x.before_data,x.after_data FROM unnest($3::text[],$4::text[],$5::text[]) x(user_id,before_data,after_data)
  RETURNING id::text,target_id`,[owner.id,ACTION,ids,
   grants.map(g=>JSON.stringify({inventory:g.inventory.map(i=>({code:i.code,quantity:i.quantityBefore,unseenQuantity:i.unseenBefore})),mercenaryCopies:g.mercenary?.copiesBefore??null})),
   grants.map(g=>JSON.stringify(g))]);
 assert.equal(audits.length,53);
 for(const grant of grants){const audit=audits.find(a=>a.target_id===grant.userId);assert.ok(audit);grant.adminLogId=audit.id;}
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,
  delivery:'DIRECT',adminId:owner.id,totals:PLAN.totals,grants,completedAt:new Date().toISOString()};
 assert.equal((await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[OPERATION_KEY,JSON.stringify(receipt)])).rowCount,1);
 return {receipt,replayed:false,verification:await verifyContestRewards(client,receipt,{balances:true})};
}
