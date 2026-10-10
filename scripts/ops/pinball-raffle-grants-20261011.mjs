import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const PLAN=JSON.parse(fs.readFileSync(new URL('./pinball-raffle-grants-20261011.json',import.meta.url),'utf8'));
export const PLAN_HASH='1129e47816efaf1c0864a9fc46b14827fab9d333a4a4e024c753bc62ba95fd06';
export const OPERATION_KEY=PLAN.operationKey;
export const ACTION='OPS_PINBALL_RAFFLE_PRIZES_20261011';
export const grantId=t=>OPERATION_KEY+':'+t.slotId;
const hash=x=>createHash('sha256').update(x).digest('hex');
const q=async(c,sql,v=[])=>(await c.query(sql,v)).rows;
const only=rows=>{assert.equal(rows.length,1,'Expected exactly one row');return rows[0];};
const ids=PLAN.recipients.map(t=>t.userId),cards=PLAN.recipients.filter(t=>t.reward.kind==='MERCENARY');
const suits=PLAN.recipients.filter(t=>t.reward.kind==='EQUIPMENT');
const settingsKeys=['mercenary_limited_draw_policy_v1','mercenary_limited_pack_v1'];

function validatePlan(inspectedHash){
 assert.equal(inspectedHash,PLAN_HASH);assert.equal(hash(JSON.stringify(PLAN)),PLAN_HASH,'Plan changed');
 const raw=fs.readFileSync(new URL('../../docs/pinball-raffle-berkan-redraw-20261011.json',import.meta.url));
 assert.equal(hash(raw),PLAN.drawHash);const draw=JSON.parse(raw);assert.equal(draw.drawId,PLAN.drawId);
 assert.equal(PLAN.delivery,'DIRECT');assert.equal(PLAN.permanent,true);
 assert.equal(PLAN.recipients.length,7);assert.equal(new Set(ids).size,7);assert.equal(cards.length,4);assert.equal(suits.length,3);
 assert.deepEqual(PLAN.recipients.map(t=>t.nickname),['비_니','응맨','쁴로리','전게씹선미아웃','암살자..','란x2','나도한번']);
 assert.deepEqual(PLAN.recipients.map(t=>t.reward.code),['BATTLE_SUIT_S_BODY','V-055','V-996','BATTLE_SUIT_S_BODY','V-055','V-055','BATTLE_SUIT_S_BODY']);
 assert.deepEqual(PLAN.excluded,['하이희야','강구열','천재b']);
 assert.deepEqual(PLAN.held.map(t=>t.nickname),['딤럼프','족단','현하루','ShowMaker','시소둥이']);
 for(const t of PLAN.recipients){
  const assignment=only(draw.finalAssignments.filter(a=>a.slotId===t.slotId));
  assert.equal(assignment.nickname,t.nickname);assert.equal(assignment.prize,t.prize);assert.equal(t.reward.quantity,1);
  assert.ok(!PLAN.held.some(a=>a.nickname===t.nickname));assert.ok(!PLAN.excluded.includes(t.nickname));
 }
 for(const t of PLAN.held){
  const {status,...assignment}=t;assert.equal(status,'AWAITING_SELECTION');assert.equal(t.prize,'SS 리미티드 용병');
  assert.deepEqual(assignment,only(draw.finalAssignments.filter(a=>a.slotId===t.slotId)));
 }
 assert.equal(hash(fs.readFileSync(new URL('../../shared/mercenary-limited-catalog-v1.mjs',import.meta.url))),PLAN.catalogSourceHash);
}

// Caller supplies one transaction. Follow the live limited-pack lock order.
export async function lockGrant(c){
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids])).length,7);
 assert.equal((await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[settingsKeys])).length,2);
 assert.equal((await q(c,"SELECT code FROM mercenary_limited_stock_v1 WHERE code='V-996' FOR UPDATE")).length,1);
 await c.query('SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[ids]);
 await c.query('SELECT user_id FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,equipment_id FOR UPDATE',[ids]);
}

export async function grantState(c){
 return {
  users:await q(c,'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]),
  settings:await q(c,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[settingsKeys]),
  stocks:await q(c,"SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-996'"),
  cards:await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids]),
  equipment:await q(c,'SELECT * FROM user_equipment_instances WHERE user_id=ANY($1::bigint[]) AND equipment_id=47 ORDER BY id',[suits.map(t=>t.userId)]),
  counts:await q(c,'SELECT user_id::text,equipment_id::text,quantity::text FROM user_equipment_counts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,equipment_id',[ids]),
  loadouts:await q(c,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[ids]),
  growth:await q(c,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[ids])
 };
}

export async function verifyRaffle(c,receipt,{exact=false}={}){
 validatePlan(receipt.planHash);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);
 assert.deepEqual(receipt.plan,PLAN);assert.equal(receipt.grants.length,7);
 const acquisitions=await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[])',[cards.map(grantId)]);
 const issues=await q(c,'SELECT * FROM mercenary_limited_issues_v1 WHERE request_id=$1',[OPERATION_KEY]);
 const equipment=await q(c,'SELECT * FROM user_equipment_instances WHERE user_id=ANY($3::bigint[]) AND equipment_id=47 AND (source_id=$1 OR request_id=ANY($2::text[]))',[OPERATION_KEY,suits.map(grantId),suits.map(t=>t.userId)]);
 const audits=await q(c,'SELECT * FROM admin_logs WHERE id=ANY($1::bigint[])',[receipt.grants.map(g=>g.adminLogId)]);
 assert.equal(acquisitions.length,4);assert.equal(issues.length,1);assert.equal(equipment.length,3);assert.equal(audits.length,7);
 for(const t of PLAN.recipients){
  const g=only(receipt.grants.filter(g=>g.slotId===t.slotId));
  for(const key of Object.keys(t))assert.deepEqual(g[key],t[key]);
  assert.equal(g.grantId,grantId(t));assert.equal(g.quantityAfter,g.quantityBefore+1);
  if(t.reward.kind==='MERCENARY'){
   const a=only(acquisitions.filter(a=>a.acquisition_id===g.grantId));
   assert.equal(String(a.user_id),t.userId);assert.equal(a.mercenary_code,t.reward.code);
   assert.equal(Number(a.total_copies_after),g.quantityAfter);assert.equal(Number(a.duplicate_count_after),g.quantityAfter-1);
   assert.equal(Number(a.is_duplicate),g.quantityBefore>0?1:0);assert.equal(a.created_at,receipt.completedAt);
   const holding=only(await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[t.userId,t.reward.code]));
   assert.ok(Number(holding.total_copies)>=g.quantityAfter);assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
   if(exact){assert.equal(Number(holding.total_copies),g.quantityAfter);assert.equal(holding.last_obtained_at,receipt.completedAt);}
   if(t.reward.edition==='LIMITED'){
    const issue=only(issues.filter(i=>i.acquisition_id===g.grantId));
    assert.equal(String(issue.user_id),t.userId);assert.equal(issue.code,t.reward.code);assert.equal(Number(issue.serial),g.serial);
    assert.equal(issue.created_at,receipt.completedAt);assert.equal(g.serial,Number(g.stockBefore.issued)+1);
    const stock=only(await q(c,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[t.reward.code]));
    assert.ok(Number(stock.issued)>=g.serial&&Number(stock.issued)<=Number(stock.stock_limit));
    if(exact){assert.equal(Number(stock.issued),g.serial);assert.equal(Number(stock.stock_limit),t.reward.stockLimit);assert.equal(Number(stock.revision),Number(g.stockBefore.revision)+1);assert.equal(stock.last_token,OPERATION_KEY);}
   }
  }else{
   const e=only(equipment.filter(e=>String(e.id)===g.instanceId));
   assert.equal(String(e.user_id),t.userId);assert.equal(String(e.equipment_id),t.reward.id);
   assert.equal(e.source_type,'ADMIN');assert.equal(e.source_id,OPERATION_KEY);assert.equal(e.request_id,g.grantId);
   if(exact){
    const instances=only(await q(c,'SELECT COUNT(*)::int quantity FROM user_equipment_instances WHERE user_id=$1 AND equipment_id=$2',[t.userId,t.reward.id]));
    const count=only(await q(c,'SELECT quantity FROM user_equipment_counts_v1 WHERE user_id=$1 AND equipment_id=$2',[t.userId,t.reward.id]));
    assert.equal(instances.quantity,g.quantityAfter);assert.equal(Number(count.quantity),g.quantityAfter);
   }
  }
  const audit=only(audits.filter(a=>String(a.id)===g.adminLogId)),{adminLogId,...logged}=g;
  assert.equal(String(audit.admin_id),receipt.adminId);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,t.userId);
  assert.deepEqual(JSON.parse(audit.before_data),{quantity:g.quantityBefore,stock:g.stockBefore||null});
  assert.deepEqual(JSON.parse(audit.after_data),{operationKey:OPERATION_KEY,planHash:PLAN_HASH,completedAt:receipt.completedAt,grant:logged});
 }
 return {status:'VERIFIED',recipients:7,mercenaryAcquisitions:4,equipmentInstances:3,limitedIssues:1,adminLogs:7,missing:0,duplicateOperationGrants:0,
  targets:receipt.grants.map(g=>({nickname:g.nickname,userId:g.userId,prize:g.prize,quantity:1,serial:g.serial,instanceId:g.instanceId,adminLogId:g.adminLogId}))};
}

export async function grantRaffle(c,inspectedHash){
 validatePlan(inspectedHash);
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
 const saved=await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[OPERATION_KEY]);
 if(saved.length){const receipt=JSON.parse(only(saved).value);return {receipt,replayed:true,verification:await verifyRaffle(c,receipt)};}
 await lockGrant(c);const before=await grantState(c);
 assert.equal(hash(JSON.stringify(before.settings)),PLAN.settingsHash,'Limited settings changed; inspect again');
 for(const t of PLAN.recipients){
  const u=only(before.users.filter(u=>u.id===t.userId));assert.equal(u.nickname,t.nickname);assert.equal(u.status,'ACTIVE');assert.equal(u.role,'USER');
  assert.equal(String(only(await q(c,'SELECT id FROM users WHERE nickname=$1',[t.nickname])).id),t.userId);
 }
 const pack=JSON.parse(only(before.settings.filter(r=>r.key==='mercenary_limited_pack_v1')).value);
 const limited=only(LIMITED_MERCENARIES.filter(m=>m.code==='V-996'));assert.equal(limited.name,'발테르');assert.equal(limited.rank,'SSS');assert.equal(limited.edition,'LIMITED');
 const stockBefore=only(before.stocks);assert.equal(Number(stockBefore.stock_limit),8);assert.equal(pack.settings.stockLimits['V-996'],8);assert.ok(Number(stockBefore.issued)<8,'Valter stock exhausted');
 const ledger=only(await q(c,"SELECT COUNT(*)::int count,MAX(serial)::text max_serial FROM mercenary_limited_issues_v1 WHERE code='V-996'"));
 assert.equal(ledger.count,Number(stockBefore.issued));assert.equal(Number(ledger.max_serial||0),Number(stockBefore.issued));
 const cms=JSON.parse(only(await q(c,"SELECT payload_json FROM mercenary_cms_documents_v1 WHERE doc_key='config' FOR SHARE")).payload_json);
 const draw=JSON.parse(only(await q(c,'SELECT payload_json FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE')).payload_json);
 const berkan=only(cms.mercenaries.filter(m=>m.code==='V-055'));assert.equal(berkan.name,'베르칸');assert.equal(berkan.rank,'SSS');assert.equal(berkan.review,'REVIEWED');assert.ok(Number(draw.cardRules?.cardWeights?.['V-055']??1)>0);
 assert.equal((await q(c,"SELECT code FROM mercenary_limited_stock_v1 WHERE code='V-055'")).length,0);
 const equipment=only(await q(c,'SELECT * FROM character_equipment_items WHERE id=47 FOR SHARE'));
 assert.equal(equipment.code,'BATTLE_SUIT_S_BODY');assert.equal(equipment.name,'S-BODY');assert.equal(equipment.slot,'BATTLE_SUIT');assert.equal(Number(equipment.is_active),1);assert.equal(Number(equipment.is_public),1);
 for(const table of ['mercenary_card_acquisitions_v1','mercenary_limited_issues_v1'])assert.equal((await q(c,`SELECT acquisition_id FROM ${table} WHERE acquisition_id=ANY($1::text[])`,[cards.map(grantId)])).length,0,'Orphan grant requires reconciliation');
 assert.equal((await q(c,'SELECT id FROM user_equipment_instances WHERE user_id=ANY($3::bigint[]) AND equipment_id=47 AND (source_id=$1 OR request_id=ANY($2::text[]))',[OPERATION_KEY,suits.map(grantId),suits.map(t=>t.userId)])).length,0);
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE action_type=$1',[ACTION])).length,0);
 const owner=only(await q(c,"SELECT id::text FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
 const now=new Date().toISOString(),grants=[];
 for(const t of PLAN.recipients){
  let grant;
  if(t.reward.kind==='MERCENARY'){
   const holdingBefore=before.cards.find(a=>String(a.user_id)===t.userId&&a.mercenary_code===t.reward.code)||null;
   const quantityBefore=Number(holdingBefore?.total_copies||0);assert.ok(Number.isSafeInteger(quantityBefore)&&quantityBefore>=0&&quantityBefore<2147483647);
   if(holdingBefore)assert.equal(Number(holdingBefore.duplicate_count),quantityBefore-1);
   let serial;
   if(t.reward.edition==='LIMITED'){
    const stock=only(await q(c,"UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$1 WHERE code='V-996' AND stock_limit=8 AND issued<stock_limit RETURNING *",[OPERATION_KEY]));serial=Number(stock.issued);
   }
   const holding=only(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
    VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,
    duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[t.userId,t.reward.code,now]));
   assert.equal(Number(holding.total_copies),quantityBefore+1);assert.equal(Number(holding.duplicate_count),quantityBefore);assert.equal(holding.first_obtained_at,holdingBefore?.first_obtained_at||now);
   only(await q(c,`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id`,[grantId(t),t.userId,t.reward.code,quantityBefore>0?1:0,quantityBefore+1,quantityBefore,now]));
   if(serial)only(await q(c,`INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id`,[grantId(t),OPERATION_KEY,t.userId,t.reward.code,serial,now]));
   grant={...t,grantId:grantId(t),quantityBefore,quantityAfter:quantityBefore+1,...(serial?{serial,stockBefore}:{})};
  }else{
   const quantityBefore=before.equipment.filter(e=>String(e.user_id)===t.userId&&String(e.equipment_id)===t.reward.id).length;
   assert.equal(Number(before.counts.find(e=>e.user_id===t.userId&&e.equipment_id===t.reward.id)?.quantity||0),quantityBefore,'Equipment aggregate differs');
   // Existing triggers update user_equipment_counts_v1 once per new instance.
   const item=only(await q(c,"INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,source_id,request_id) VALUES($1,47,'ADMIN',$2,$3) RETURNING id::text",[t.userId,OPERATION_KEY,grantId(t)]));
   grant={...t,grantId:grantId(t),instanceId:item.id,quantityBefore,quantityAfter:quantityBefore+1};
  }
  const audit=only(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,t.userId,
   JSON.stringify({quantity:grant.quantityBefore,stock:grant.stockBefore||null}),JSON.stringify({operationKey:OPERATION_KEY,planHash:PLAN_HASH,completedAt:now,grant})]));
  grants.push({...grant,adminLogId:audit.id});
 }
 const after=await grantState(c);
 for(const key of ['users','settings','loadouts','growth'])assert.deepEqual(after[key],before[key],key+' changed unexpectedly');
 const otherCards=rows=>rows.filter(a=>!cards.some(t=>String(a.user_id)===t.userId&&a.mercenary_code===t.reward.code));
 const otherCounts=rows=>rows.filter(a=>!suits.some(t=>a.user_id===t.userId&&a.equipment_id===t.reward.id));
 assert.deepEqual(otherCards(after.cards),otherCards(before.cards));assert.deepEqual(otherCounts(after.counts),otherCounts(before.counts));
 assert.deepEqual(after.equipment.filter(e=>!grants.some(g=>g.instanceId===String(e.id))),before.equipment);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,plan:PLAN,actor:'CODEX_OPERATIONS',adminId:owner.id,completedAt:now,grants,
  preserved:{balances:true,settings:true,stockLimits:true,loadouts:true,growth:true,otherMercenaries:true,existingEquipment:true,ssLimitedPrizesHeld:true}};
 only(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 return {receipt,replayed:false,verification:await verifyRaffle(c,receipt,{exact:true})};
}
