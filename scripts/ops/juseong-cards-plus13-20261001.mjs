import assert from 'node:assert/strict';
export const KEY='ops:juseong:son-ayoon-plus13:20261001:v1';
export const TARGET=Object.freeze({id:5393,nickname:'주성'});
const AUTHORIZATION={request:'주성계정에 손흥민 +13강 ,아윤 제니스 +13강 지급해',followup:'ㅇㅇ 있으면 업그레이드'};
export const CARDS=Object.freeze([
 {id:'CN-A041807B14B54C89',title:'Son Heung min',grade:'SUPERSTAR',name:'Son Heung min'},
 {id:'CN-ED78DCC2DA3C42B5',title:'아윤',grade:'ZENITH',name:'아윤'}
]);
const ids=CARDS.map(c=>c.id),parse=v=>typeof v==='string'?JSON.parse(v):v;
const normalized=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['quantity','breakthrough_level','breakthrough_fail_count'].includes(key)?Number(value):value]));

export async function inspect(q){
 const users=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE nickname=$1',[TARGET.nickname]);
 assert.equal(users.length,1,'Exact account must match once');const user=users[0];
 assert.equal(Number(user.id),TARGET.id);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const catalog=await q(`SELECT c.id,c.title,UPPER(c.rarity) AS grade,c.is_active,COALESCE(c.card_status,'PUBLIC') AS card_status,
  m.name,COALESCE(m.is_active,1) AS member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
  WHERE c.id=ANY($1::text[]) ORDER BY c.id`,[ids]);
 assert.equal(catalog.length,2,'Target cards missing');
 for(const expected of CARDS){
  const card=catalog.find(c=>c.id===expected.id);assert.ok(card);
  for(const [key,value] of Object.entries(expected))assert.equal(card[key],value,'Target card changed');
  assert.equal(Number(card.is_active),1);assert.equal(Number(card.member_active),1);assert.equal(card.card_status,'PUBLIC');
 }
 const holdings=await q('SELECT * FROM user_cards WHERE user_id=$1 ORDER BY card_id',[TARGET.id]);
 const cards=CARDS.map(card=>{
  const owned=holdings.find(h=>h.card_id===card.id),quantity=Number(owned?.quantity||0),level=Number(owned?.breakthrough_level||0),failCount=Number(owned?.breakthrough_fail_count||0);
  assert.ok(Number.isSafeInteger(quantity)&&quantity>=0,'Invalid current card quantity');
  assert.ok(Number.isInteger(level)&&level>=0&&level<=13,'Unexpected current enhancement');
  assert.ok(Number.isInteger(failCount)&&failCount>=0,'Invalid failure count');
  return {...card,quantity,level,failCount};
 });
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
 return {user,catalog,holdings,cards,receipt:saved?parse(saved.value):null};
}

export async function verify(q){
 const state=await inspect(q),receipt=state.receipt;assert.ok(receipt,'Completion receipt missing');
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);assert.deepEqual(receipt.user,TARGET);
 assert.equal(receipt.cards.length,2);assert.equal(receipt.levelRequested,13);
 for(const card of CARDS){
  const change=receipt.cards.find(r=>r.id===card.id);assert.ok(change);
  assert.equal(change.title,card.title);assert.equal(change.grade,card.grade);
  assert.equal(change.action,change.quantityBefore>0?'UPGRADE':'GRANT');
  assert.equal(change.quantityGranted,change.quantityBefore>0?0:1);
  assert.equal(change.levelAfter,13);assert.equal(change.quantityAfter,change.quantityBefore+change.quantityGranted);assert.equal(change.failCountAfter,0);
  const current=state.cards.find(r=>r.id===card.id);assert.equal(current.level,13);assert.equal(current.quantity,change.quantityAfter);assert.equal(current.failCount,0);
 }
 const [audit]=await q('SELECT action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]);
 assert.equal(audit?.action_type,'OPS_CARD_UPGRADE_OR_GRANT');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...recorded}=receipt,{authorization,...audited}=parse(audit.after_data);assert.deepEqual(audited,recorded);
 assert.deepEqual(authorization,AUTHORIZATION);
 return {status:'COMPLETED',receipt,currentCards:state.cards,missing:0};
}

// Caller holds USER_LOCK and one PostgreSQL transaction. Upgrade owned rows
// without extra copies; grant exactly one +13 card only when quantity is zero.
export async function upgrade(q){
 await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
 const [user]=await q('SELECT id,nickname,status,role FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
 assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]);
 if(saved)return {...await verify(q),replayed:true};
 const [date]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(date.kst,'2026-10-01','One-time upgrade date expired');
 await q('SELECT card_id FROM user_cards WHERE user_id=$1 AND card_id=ANY($2::text[]) ORDER BY card_id FOR UPDATE',[TARGET.id,ids]);
 const before=await inspect(q),[owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 for(const card of before.cards){
  const changed=card.quantity>0
   ?await q(`UPDATE user_cards SET breakthrough_level=13,breakthrough_fail_count=0
     WHERE user_id=$1 AND card_id=$2 AND quantity=$3 AND quantity>0 AND breakthrough_level BETWEEN 0 AND 13 RETURNING card_id`,[TARGET.id,card.id,card.quantity])
   :await q(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at)
     VALUES($1,$2,1,13,0,sqlite_now(),sqlite_now())
     ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=1,breakthrough_level=13,breakthrough_fail_count=0,
     first_obtained_at=COALESCE(user_cards.first_obtained_at,excluded.first_obtained_at),last_obtained_at=excluded.last_obtained_at
     WHERE user_cards.quantity=0 RETURNING card_id`,[TARGET.id,card.id]);
  assert.equal(changed.length,1,'Partial upgrade or grant');assert.equal(changed[0].card_id,card.id);
 }
 const after=await inspect(q);assert.deepEqual(after.user,before.user,'Account balances changed');assert.deepEqual(after.catalog,before.catalog,'Card catalog changed');
 assert.equal(after.holdings.length,before.holdings.length+ids.filter(id=>!before.holdings.some(h=>h.card_id===id)).length,'Unexpected owned card row count');
 for(const old of before.holdings){
  const row=after.holdings.find(h=>h.card_id===old.card_id);assert.ok(row);
  const isTarget=ids.includes(old.card_id),wasOwned=Number(old.quantity)>0;
  const expected=isTarget?{...old,quantity:wasOwned?old.quantity:1,breakthrough_level:13,breakthrough_fail_count:0,
   first_obtained_at:wasOwned?old.first_obtained_at:(old.first_obtained_at??row.first_obtained_at),last_obtained_at:wasOwned?old.last_obtained_at:row.last_obtained_at}:old;
  assert.deepEqual(normalized(row),normalized(expected),'Unexpected quantity, obtained timestamp or other card change');
 }
 const cards=CARDS.map(card=>{
  const old=before.cards.find(c=>c.id===card.id),now=after.cards.find(c=>c.id===card.id);
  assert.equal(now.quantity,old.quantity>0?old.quantity:1);assert.equal(now.level,13);assert.equal(now.failCount,0);
  return {...card,action:old.quantity>0?'UPGRADE':'GRANT',quantityGranted:old.quantity>0?0:1,
   quantityBefore:old.quantity,quantityAfter:now.quantity,levelBefore:old.level,levelAfter:now.level,failCountBefore:old.failCount,failCountAfter:now.failCount};
 });
 const receipt={status:'COMPLETED',operationKey:KEY,actor:'SYSTEM_OPS',user:TARGET,levelRequested:13,cards,completedAt:new Date().toISOString()};
 const audits=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,'OPS_CARD_UPGRADE_OR_GRANT','USER',$2,$3,$4) RETURNING id`,[owner.id,String(TARGET.id),JSON.stringify({operationKey:KEY,cards:before.cards}),JSON.stringify({...receipt,authorization:AUTHORIZATION})]);
 assert.equal(audits.length,1);receipt.adminLogId=String(audits[0].id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
 return {...await verify(q),replayed:false,preserved:{existingQuantities:true,existingObtainedTimestamps:true,otherCards:true,balances:true}};
}
