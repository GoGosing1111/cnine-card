import assert from 'node:assert/strict';
export const KEY='ops:heeya:son-ayoon-plus13:20261001:v1';
export const TARGET=Object.freeze({id:4977,nickname:'하이희야♡'});
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
  const owned=holdings.find(h=>h.card_id===card.id);assert.ok(owned,'Target card is not owned');
  assert.ok(Number.isSafeInteger(Number(owned.quantity))&&Number(owned.quantity)>0,'Target card must have a positive quantity');
  assert.ok(Number.isInteger(Number(owned.breakthrough_level))&&Number(owned.breakthrough_level)>=0&&Number(owned.breakthrough_level)<=13,'Unexpected current enhancement');
  return {...card,quantity:Number(owned.quantity),level:Number(owned.breakthrough_level),failCount:Number(owned.breakthrough_fail_count)};
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
  assert.equal(change.levelAfter,13);assert.equal(change.quantityAfter,change.quantityBefore);assert.equal(change.failCountAfter,0);
  assert.equal(state.cards.find(r=>r.id===card.id).level,13);
 }
 const [audit]=await q('SELECT action_type,target_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]);
 assert.equal(audit?.action_type,'OPS_CARD_ENHANCEMENT_UPGRADE');assert.equal(audit.target_type,'USER');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...recorded}=receipt,{authorization,...audited}=parse(audit.after_data);assert.deepEqual(audited,recorded);
 assert.equal(authorization,'하이희야♡ 계정에 손흥민(영어로) + 13강, 제니스 아윤 +13강으로 업그레이드해');
 return {status:'COMPLETED',receipt,currentCards:state.cards,missing:0};
}

// Caller holds USER_LOCK and one PostgreSQL transaction. Upgrade owned rows;
// quantity, obtained timestamps and all other cards remain in the same rows.
export async function upgrade(q){
 await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
 const [user]=await q('SELECT id,nickname,status,role FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);
 assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]);
 if(saved)return {...await verify(q),replayed:true};
 const [date]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");
 assert.equal(date.kst,'2026-10-01','One-time upgrade date expired');
 const locked=await q('SELECT card_id FROM user_cards WHERE user_id=$1 AND card_id=ANY($2::text[]) ORDER BY card_id FOR UPDATE',[TARGET.id,ids]);
 assert.equal(locked.length,2,'Owned card rows missing');
 const before=await inspect(q),[owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
 const changed=await q(`UPDATE user_cards SET breakthrough_level=13,breakthrough_fail_count=0
  WHERE user_id=$1 AND card_id=ANY($2::text[]) AND quantity>0 AND breakthrough_level BETWEEN 0 AND 13 RETURNING card_id`,[TARGET.id,ids]);
 assert.equal(changed.length,2,'Partial card upgrade');
 const after=await inspect(q);assert.deepEqual(after.user,before.user,'Account balances changed');assert.deepEqual(after.catalog,before.catalog,'Card catalog changed');
 assert.equal(after.holdings.length,before.holdings.length,'Owned card row count changed');
 for(const old of before.holdings){
  const row=after.holdings.find(h=>h.card_id===old.card_id);assert.ok(row);
  const expected=ids.includes(old.card_id)?{...old,breakthrough_level:13,breakthrough_fail_count:0}:old;
  assert.deepEqual(normalized(row),normalized(expected),'Unexpected quantity, obtained timestamp or other card change');
 }
 const cards=CARDS.map(card=>{
  const old=before.cards.find(c=>c.id===card.id),now=after.cards.find(c=>c.id===card.id);
  return {...card,quantityBefore:old.quantity,quantityAfter:now.quantity,levelBefore:old.level,levelAfter:now.level,failCountBefore:old.failCount,failCountAfter:now.failCount};
 });
 const receipt={status:'COMPLETED',operationKey:KEY,actor:'SYSTEM_OPS',user:TARGET,levelRequested:13,cards,completedAt:new Date().toISOString()};
 const audits=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
  VALUES($1,'OPS_CARD_ENHANCEMENT_UPGRADE','USER',$2,$3,$4) RETURNING id`,[owner.id,String(TARGET.id),JSON.stringify({operationKey:KEY,cards:before.cards}),JSON.stringify({...receipt,authorization:'하이희야♡ 계정에 손흥민(영어로) + 13강, 제니스 아윤 +13강으로 업그레이드해'})]);
 assert.equal(audits.length,1);receipt.adminLogId=String(audits[0].id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[KEY,JSON.stringify(receipt),receipt.completedAt])).length,1);
 return {...await verify(q),replayed:false,preserved:{quantities:true,obtainedTimestamps:true,otherCards:true,balances:true}};
}
