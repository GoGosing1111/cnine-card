import assert from 'node:assert/strict';

export const AIZEN_KEY='ops:soopketland-bj-aizen-plus15:20261004:v1';
export const DRILL_KEY='ops:bongsoon-solar-drill-revoke:20261004:v1';
export const CARD={id:'CN-47AD4B47B6A7452C',title:'아이젠 족스케',grade:'FUR'};
export const TARGETS=Object.freeze([
 {id:4718,nickname:'강구열'},{id:4754,nickname:'조은'},{id:4773,nickname:'진짜디임'},
 {id:4913,nickname:'오리꿍'},{id:4977,nickname:'하이희야♡'},{id:5209,nickname:'김아윤'},
 {id:5393,nickname:'주성'},{id:5426,nickname:'나무늘봉순'}
]);
const DRILL='MINE_SOLAR_DRILL',BONGSOON=5426,EXCLUDED=1;
const ids=TARGETS.map(t=>t.id),rows=client=>async(sql,args=[])=>(await client.query(sql,args)).rows;
const usersSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id';
const cardsSql='SELECT * FROM user_cards WHERE user_id=ANY($1::bigint[]) AND card_id=$2 ORDER BY user_id';
const starsSql="SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id";
const normalize=values=>values.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,['user_id','quantity','breakthrough_level','breakthrough_fail_count'].includes(k)?Number(v):v])));

async function begin(client,key){
 await client.query('BEGIN');
 await client.query("SET LOCAL lock_timeout='3s'");
 await client.query("SET LOCAL statement_timeout='10s'");
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
 const [saved]=await rows(client)('SELECT value FROM app_meta WHERE key=$1',[key]);
 if(!saved)return null;
 const receipt=JSON.parse(saved.value);assert.equal(receipt.operationKey,key);assert.equal(receipt.status,'COMPLETED');
 return receipt;
}
async function owner(q){
 const [account]=await q("SELECT id,nickname FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");
 assert.equal(account?.nickname,'핑크빛유두','Expected audit owner and excluded account');return account;
}
async function save(q,receipt,before,action,target){
 const operator=await owner(q);
 const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
  [operator.id,action,target.type,target.id,JSON.stringify({operationKey:receipt.operationKey,...before}),JSON.stringify(receipt)]);
 assert.ok(audit,'Audit log missing');receipt.adminLogId=String(audit.id);
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[receipt.operationKey,JSON.stringify(receipt),receipt.completedAt]);
}

// One-time explicit maintenance: upgrade existing copies only, never add cards.
export async function upgradeLandBjAizen(client,{commit=false}={}){
 const q=rows(client);
 try{
  const prior=await begin(client,AIZEN_KEY);
  if(prior){await client.query('ROLLBACK');return {...prior,committed:false,replayed:true};}
  const users=await q(usersSql+' FOR UPDATE',[ids]);
  assert.deepEqual(users.map(u=>({id:Number(u.id),nickname:u.nickname})),TARGETS,'Account identity changed');
  assert.ok(users.every(u=>u.status==='ACTIVE'),'All target accounts must be active');
  await q('LOCK TABLE soopketland_accounts IN SHARE MODE');
  await owner(q);
  const roster=await q('SELECT slot,user_id FROM soopketland_accounts ORDER BY user_id');
  const included=roster.filter(r=>Number(r.user_id)!==EXCLUDED&&r.slot!=='핑크빛유두');
  assert.deepEqual(included.map(r=>({id:Number(r.user_id),nickname:r.slot})),TARGETS,'Registered BJ roster changed; inspect again');
  const catalog=await q('SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,c.card_status,m.is_active member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=$1 OR c.title=$2 ORDER BY c.id',[CARD.id,CARD.title]);
  assert.equal(catalog.length,1);const [card]=catalog;
  assert.deepEqual({id:card.id,title:card.title,grade:card.grade},CARD);
  assert.equal(Number(card.is_active),1);assert.equal(card.card_status,'PUBLIC');assert.equal(Number(card.member_active),1);
  const excludedBefore=await q(cardsSql,[[EXCLUDED],CARD.id]);
  // Match gameplay's inventory-before-card lock order.
  const starsBefore=await q(starsSql+' FOR UPDATE',[ids]);
  const before=await q(cardsSql+' FOR UPDATE',[ids,CARD.id]);
  assert.equal(before.length,ids.length,'Existing card required for every BJ');
  for(const c of before){
   assert.ok(Number(c.quantity)>0,'Existing owned card required');
   assert.ok(Number.isInteger(Number(c.breakthrough_level))&&Number(c.breakthrough_level)>=0&&Number(c.breakthrough_level)<=15,'Unexpected enhancement level');
   assert.ok(Number(c.breakthrough_fail_count)>=0,'Enhancement in progress');
  }
  const pending=before.filter(c=>Number(c.breakthrough_level)<15);
  const changed=await q('UPDATE user_cards SET breakthrough_level=15,breakthrough_fail_count=0 WHERE user_id=ANY($1::bigint[]) AND card_id=$2 AND breakthrough_level<15 RETURNING user_id',[ids,CARD.id]);
  assert.deepEqual(changed.map(c=>Number(c.user_id)).sort((a,b)=>a-b),pending.map(c=>Number(c.user_id)));
  const after=await q(cardsSql,[ids,CARD.id]);
  assert.deepEqual(normalize(after),normalize(before.map(c=>Number(c.breakthrough_level)<15?{...c,breakthrough_level:15,breakthrough_fail_count:0}:c)),'Unrequested holding field changed');
  assert.deepEqual(await q(usersSql,[ids]),users,'Account balances changed');
  assert.deepEqual(await q(starsSql,[ids]),starsBefore,'Master stars changed');
  assert.deepEqual(await q(cardsSql,[[EXCLUDED],CARD.id]),excludedBefore,'Excluded account changed');
  const receipt={operationKey:AIZEN_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',card:CARD,excluded:{id:EXCLUDED,nickname:'핑크빛유두'},
   registeredBjCount:ids.length,upgraded:changed.length,alreadyAt15:ids.length-changed.length,
   users:before.map(c=>({id:Number(c.user_id),nickname:TARGETS.find(t=>t.id===Number(c.user_id)).nickname,levelBefore:Number(c.breakthrough_level),levelAfter:15,quantityBefore:Number(c.quantity),quantityAfter:Number(c.quantity)})),
   copiesAndBalancesPreserved:true,excludedPreserved:true,completedAt:new Date().toISOString()};
  await save(q,receipt,{holdings:before,roster},'OPS_CARD_UPGRADE_PLUS15',{type:'SOOPKETLAND_BJ',id:'registered-excluding-pink'});
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

// Revoke the owned tool now; preserve the already-started run and its earned claim.
// This explicit maintenance does not use CMS's wait-until-claim restriction, and
// does not cancel, accelerate, or pay an in-progress mining reward.
export async function revokeBongsoonSolarDrill(client,{commit=false}={}){
 const q=rows(client);
 try{
  const prior=await begin(client,DRILL_KEY);
  if(prior){await client.query('ROLLBACK');return {...prior,committed:false,replayed:true};}
  const users=await q(usersSql+' FOR UPDATE',[[BONGSOON]]);
  assert.equal(users.length,1);assert.equal(users[0].nickname,'나무늘봉순');assert.equal(users[0].status,'ACTIVE');
  const operator=await owner(q);
  const inventorySql='SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code';
  const inventoryBefore=await q(inventorySql,[BONGSOON]);
  const [before]=await q('SELECT * FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2 FOR UPDATE',[BONGSOON,DRILL]);
  assert.equal(Number(before?.quantity),1,'Inspected drill quantity changed');assert.ok(Number(before.unseen_quantity)>=0);
  const runsSql='SELECT * FROM master_star_mine_runs_v1 WHERE user_id=$1 AND claimed_at_ms IS NULL ORDER BY id';
  const runs=await q(runsSql+' FOR UPDATE',[BONGSOON]);
  const at=new Date().toISOString();
  const updated=await q('UPDATE cnine_user_inventory SET quantity=0,unseen_quantity=0,updated_at=$3 WHERE user_id=$1 AND item_code=$2 AND quantity=1 RETURNING *',[BONGSOON,DRILL,at]);
  assert.equal(updated.length,1,'Drill changed during revoke');assert.equal(Number(updated[0].quantity),0);assert.equal(Number(updated[0].unseen_quantity),0);
  const inventoryAfter=await q(inventorySql,[BONGSOON]);
  assert.deepEqual(inventoryAfter.filter(i=>i.item_code!==DRILL),inventoryBefore.filter(i=>i.item_code!==DRILL),'Other inventory changed');
  assert.deepEqual(updated[0],{...before,quantity:updated[0].quantity,unseen_quantity:updated[0].unseen_quantity,updated_at:updated[0].updated_at},'Unrequested drill field changed');
  assert.deepEqual(await q(usersSql,[[BONGSOON]]),users,'Account balances changed');
  assert.deepEqual(await q(runsSql,[BONGSOON]),runs,'Started mining run changed');
  const [log]=await q('INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id) VALUES($1,$2,-1,0,$3,$4,$5,$6) RETURNING id',
   [BONGSOON,DRILL,'사용자 지시: 나무늘봉순 태양광드릴 회수. 이미 시작한 채굴 및 보상 권리 유지.','OPS_MINE_DRILL_REVOKE',DRILL_KEY,operator.id]);
  assert.ok(log,'Inventory audit missing');
  const receipt={operationKey:DRILL_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',user:{id:BONGSOON,nickname:'나무늘봉순'},itemCode:DRILL,itemName:'태양광드릴',
   quantityBefore:1,removed:1,quantityAfter:0,unseenAfter:0,activeRunsPreserved:runs,otherInventoryAndBalancesPreserved:true,inventoryLogId:String(log.id),completedAt:at};
  await save(q,receipt,{inventory:before,activeRuns:runs},'OPS_MINE_DRILL_REVOKE',{type:'USER',id:String(BONGSOON)});
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyLandBjMaintenance(client){
 const q=rows(client),result={};
 for(const key of [AIZEN_KEY,DRILL_KEY]){
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[key]);assert.ok(saved,'Receipt missing');
  const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,key);
  const [audit]=await q('SELECT action_type,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]);
  assert.equal(JSON.parse(audit?.after_data||'{}').operationKey,key,'Audit mismatch');
  if(key===AIZEN_KEY){
   assert.equal(audit.action_type,'OPS_CARD_UPGRADE_PLUS15');
   const holdings=await q(cardsSql,[ids,CARD.id]);assert.equal(holdings.length,ids.length);
   assert.ok(holdings.every(c=>Number(c.quantity)>0&&Number(c.breakthrough_level)===15),'BJ upgrade verification failed');
   result.aizen={...receipt,current:holdings.map(c=>({id:Number(c.user_id),quantity:Number(c.quantity),level:Number(c.breakthrough_level)}))};
  }else{
   assert.equal(audit.action_type,'OPS_MINE_DRILL_REVOKE');
   const [holding]=await q('SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code=$2',[BONGSOON,DRILL]);
   assert.equal(Number(holding?.quantity),0);assert.equal(Number(holding?.unseen_quantity),0);
   const [log]=await q('SELECT user_id,item_code,change_amount,balance_after,reference_id FROM inventory_logs WHERE id=$1',[receipt.inventoryLogId]);
   assert.equal(Number(log?.user_id),BONGSOON);assert.equal(log.item_code,DRILL);assert.equal(Number(log.change_amount),-1);assert.equal(Number(log.balance_after),0);assert.equal(log.reference_id,key);
   const preservedRuns=[];
   for(const run of receipt.activeRunsPreserved){
    const [current]=await q('SELECT * FROM master_star_mine_runs_v1 WHERE id=$1 AND user_id=$2',[run.id,BONGSOON]);assert.ok(current,'Started run missing');
    for(const field of ['drill_code','reward','policy_revision','started_at_ms','ready_at_ms'])assert.equal(String(current[field]),String(run[field]),'Started run entitlement changed');
    preservedRuns.push(current);
   }
   result.drill={...receipt,currentQuantity:0,currentPreservedRuns:preservedRuns};
  }
 }
 return {status:'VERIFIED',...result};
}
