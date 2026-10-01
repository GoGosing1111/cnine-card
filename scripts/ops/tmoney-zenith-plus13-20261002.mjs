import assert from 'node:assert/strict';
export const KEY='ops:tmoney-zenith-joeun-ayoon-plus13:20261002:v1';
export const TARGET=Object.freeze({id:5147,nickname:'T-Money™'});
export const CARDS=Object.freeze([
 {id:'CN-BA6BDEC789144D00',title:'오조은',grade:'ZENITH',name:'오조은'},
 {id:'CN-ED78DCC2DA3C42B5',title:'아윤',grade:'ZENITH',name:'아윤'}
]);
const ids=CARDS.map(card=>card.id),query=async(client,sql,args=[])=>(await client.query(sql,args)).rows;
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const normalized=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['quantity','breakthrough_level','breakthrough_fail_count'].includes(key)?Number(value):value]));

export async function inspect(client){
 const q=(sql,args)=>query(client,sql,args);
 const users=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE nickname=$1 ORDER BY id LIMIT 2',[TARGET.nickname]);
 assert.equal(users.length,1,'Exact account must match once');const user=users[0];
 assert.equal(Number(user.id),TARGET.id);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const links=await q("SELECT provider_user_id FROM user_second_verifications WHERE user_id=$1 AND provider='PLAYDK'",[TARGET.id]);
 assert.equal(links.length,1);assert.equal(links[0].provider_user_id,'9c5d467b','Reviewed PLAYDK account changed');
 const catalog=await q(`SELECT c.id,c.title,UPPER(c.rarity) AS grade,c.is_active,COALESCE(c.card_status,'PUBLIC') AS card_status,
  m.name,COALESCE(m.is_active,1) AS member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
  WHERE c.id=ANY($1::text[]) ORDER BY c.id`,[ids]);
 assert.equal(catalog.length,2,'Target cards missing');
 for(const expected of CARDS){
  const card=catalog.find(row=>row.id===expected.id);assert.ok(card);
  for(const [key,value] of Object.entries(expected))assert.equal(card[key],value,'Reviewed target card changed');
  assert.equal(Number(card.is_active),1);assert.equal(Number(card.member_active),1);assert.equal(card.card_status,'PUBLIC');
 }
 const holdings=await q('SELECT * FROM user_cards WHERE user_id=$1 ORDER BY card_id',[TARGET.id]);
 const cards=CARDS.map(card=>{
  const owned=holdings.find(row=>row.card_id===card.id),quantity=Number(owned?.quantity||0),level=Number(owned?.breakthrough_level||0),failCount=Number(owned?.breakthrough_fail_count||0);
  assert.ok(Number.isSafeInteger(quantity)&&quantity>=0&&quantity<Number.MAX_SAFE_INTEGER,'Invalid card quantity');
  assert.ok(Number.isInteger(level)&&level>=0&&level<=13,'Unexpected enhancement level');assert.ok(Number.isInteger(failCount)&&failCount>=0);
  return {...card,quantity,level,failCount};
 });
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
 return {user,catalog,holdings,cards,receipt:saved?parse(saved.value):null};
}

function validateReceipt(receipt,mode=receipt?.mode){
 assert.equal(receipt?.status,'COMPLETED');assert.equal(receipt.operationKey,KEY);assert.deepEqual(receipt.user,TARGET);
 assert.equal(mode,'UPGRADE_ONLY','User chose to preserve existing quantities');assert.equal(receipt.mode,mode);
 assert.equal(receipt.levelRequested,13);assert.equal(receipt.cards.length,2);
 for(const expected of CARDS){
  const change=receipt.cards.find(card=>card.id===expected.id);assert.ok(change);assert.equal(change.title,expected.title);assert.equal(change.grade,'ZENITH');
  assert.equal(change.quantityGranted,0);assert.equal(change.quantityAfter,change.quantityBefore);assert.equal(change.levelAfter,13);
 }
}

// Explicit one-time account operation. Caller holds production USER_LOCK.
// User confirmed: preserve existing quantities and upgrade both cards to +13.
export async function grant(client,{mode,dryRun=false}={}){
 assert.equal(mode,'UPGRADE_ONLY','User chose to preserve existing quantities');
 const q=(sql,args)=>query(client,sql,args);await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='12s'");
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[KEY]);
  const [user]=await q('SELECT id,nickname,status FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]);assert.equal(user?.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[KEY]);
  if(saved){const receipt=parse(saved.value);validateReceipt(receipt,mode);await client.query('ROLLBACK');return {receipt,dryRun,replayed:true};}
  await q('SELECT card_id FROM user_cards WHERE user_id=$1 AND card_id=ANY($2::text[]) ORDER BY card_id FOR UPDATE',[TARGET.id,ids]);
  const before=await inspect(client),[owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner);
  const now=new Date().toISOString();
  for(const card of before.cards){
   assert.ok(card.quantity>0,'Reviewed existing card is no longer owned');
   const changed=await q(`UPDATE user_cards SET breakthrough_level=13,breakthrough_fail_count=CASE WHEN breakthrough_level<13 THEN 0 ELSE breakthrough_fail_count END
      WHERE user_id=$1 AND card_id=$2 AND quantity>0 RETURNING card_id`,[TARGET.id,card.id]);
   assert.equal(changed.length,1,'Partial card grant');assert.equal(changed[0].card_id,card.id);
  }
  const after=await inspect(client);assert.deepEqual(after.user,before.user,'Account balances changed');assert.deepEqual(after.catalog,before.catalog,'Card catalog changed');
  assert.equal(after.holdings.length,before.holdings.length);
  for(const old of before.holdings){
   const row=after.holdings.find(owned=>owned.card_id===old.card_id);assert.ok(row);
   const expected=ids.includes(old.card_id)?{...old,breakthrough_level:13,
    breakthrough_fail_count:Number(old.breakthrough_level)<13?0:old.breakthrough_fail_count}:old;
   assert.deepEqual(normalized(row),normalized(expected),'Unrequested card data changed');
  }
  const cards=CARDS.map(card=>{
   const old=before.cards.find(row=>row.id===card.id),current=after.cards.find(row=>row.id===card.id);
   assert.equal(current.quantity,old.quantity);assert.equal(current.level,13);assert.equal(current.failCount,old.level<13?0:old.failCount);
   return {...card,quantityGranted:0,quantityBefore:old.quantity,quantityAfter:current.quantity,levelBefore:old.level,levelAfter:current.level,failCountBefore:old.failCount,failCountAfter:current.failCount};
  });
  const receipt={status:'COMPLETED',operationKey:KEY,actor:'SYSTEM_OPS',user:TARGET,mode,levelRequested:13,cards,balancesPreserved:true,otherCardsPreserved:true,completedAt:now};
  validateReceipt(receipt,mode);
  const [audit]=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
    VALUES($1,'OPS_T_MONEY_ZENITH_PLUS13','USER',$2,$3,$4,$5) RETURNING id`,[owner.id,String(TARGET.id),JSON.stringify({operationKey:KEY,cards:before.cards}),JSON.stringify(receipt),now]);
  assert.ok(audit);receipt.adminLogId=String(audit.id);
  assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[KEY,JSON.stringify(receipt),now])).length,1);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,dryRun,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verify(client){
 const state=await inspect(client),receipt=state.receipt;validateReceipt(receipt);
 for(const current of state.cards){const change=receipt.cards.find(card=>card.id===current.id);assert.equal(current.quantity,change.quantityAfter);assert.equal(current.level,13);assert.equal(current.failCount,change.failCountAfter);}
 const [audit]=await query(client,'SELECT action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]);
 assert.equal(audit?.action_type,'OPS_T_MONEY_ZENITH_PLUS13');assert.equal(audit.target_id,String(TARGET.id));const {adminLogId,...recorded}=receipt;assert.deepEqual(parse(audit.after_data),recorded);
 return {verified:true,receipt,currentCards:state.cards};
}
