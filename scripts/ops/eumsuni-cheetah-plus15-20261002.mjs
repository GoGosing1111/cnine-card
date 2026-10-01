import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:eumsuni-cheetah-plus15:20261002:v1';
export const TARGET=Object.freeze({id:65,nickname:'음순이'});
export const CARD=Object.freeze({id:'CN-5D0E2E4D58C9416F',title:'치타구',grade:'FUR'});
const holdingSql='SELECT * FROM user_cards WHERE user_id=$1 AND card_id=$2';
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const starsSql="SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code='MASTER_STAR'";
const normalize=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['quantity','breakthrough_level','breakthrough_fail_count'].includes(key)?Number(value):value]));

// Explicit upgrade of the existing holding; no new copies and no material charge.
export async function upgradeEumsuniCheetah(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='10s'");
  const users=await q('SELECT id,nickname,status FROM users WHERE nickname=$1 ORDER BY id LIMIT 2 FOR UPDATE',[TARGET.nickname]);
  assert.equal(users.length,1,'Exactly one named account required');assert.equal(Number(users[0].id),TARGET.id);assert.equal(users[0].status,'ACTIVE');
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const receipt=JSON.parse(prior.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.user.id,TARGET.id);assert.equal(receipt.card.id,CARD.id);await client.query('ROLLBACK');return {...receipt,replayed:true};}
  const cards=await q("SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,c.card_status,m.is_active member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.title=$1 OR c.id=$2 ORDER BY c.id",[CARD.title,CARD.id]);
  assert.equal(cards.length,1,'Ambiguous card catalog');const [card]=cards;
  assert.deepEqual({id:card.id,title:card.title,grade:card.grade},CARD);
  assert.equal(Number(card.is_active),1);assert.equal(card.card_status,'PUBLIC');assert.equal(Number(card.member_active),1);
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Audit owner missing');
  const [walletBefore]=await q(walletSql,[TARGET.id]);
  // Match gameplay's inventory-before-card lock order during enhancement.
  const starsBefore=await q(starsSql+' FOR UPDATE',[TARGET.id]);
  const [before]=await q(holdingSql+' FOR UPDATE',[TARGET.id,CARD.id]);
  assert.ok(before&&Number(before.quantity)>0,'Existing owned card required');
  assert.ok(Number.isInteger(Number(before.breakthrough_level))&&Number(before.breakthrough_level)>=0&&Number(before.breakthrough_level)<=15,'Unexpected existing level');
  assert.ok(Number(before.breakthrough_fail_count)>=0,'Enhancement is in progress');
  const changed=Number(before.breakthrough_level)<15;
  if(changed){
   const rows=await q('UPDATE user_cards SET breakthrough_level=15,breakthrough_fail_count=0 WHERE user_id=$1 AND card_id=$2 AND breakthrough_level=$3 AND quantity=$4 RETURNING card_id',[TARGET.id,CARD.id,before.breakthrough_level,before.quantity]);
   assert.equal(rows.length,1,'Owned card changed during upgrade');
  }
  const [after]=await q(holdingSql,[TARGET.id,CARD.id]);
  assert.deepEqual(normalize(after),normalize({...before,breakthrough_level:15,breakthrough_fail_count:changed?0:before.breakthrough_fail_count}),'Unrequested holding field changed');
  assert.deepEqual((await q(walletSql,[TARGET.id]))[0],walletBefore,'Account balance changed');
  assert.deepEqual(await q(starsSql,[TARGET.id]),starsBefore,'Master stars changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',user:TARGET,card:CARD,levelBefore:Number(before.breakthrough_level),levelAfter:15,quantityBefore:Number(before.quantity),quantityAfter:Number(after.quantity),changed,balancesPreserved:true,completedAt:new Date().toISOString()};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_CARD_UPGRADE_PLUS15','USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,card:before}),JSON.stringify({...receipt,cardState:after,reason:'사용자 지시: 음순이 계정의 기존 치타구를 15강으로 업그레이드'})]);
  assert.ok(audit,'Audit log missing');receipt.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyEumsuniCheetah(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Receipt missing');
 const receipt=JSON.parse(saved.value),[user]=await q('SELECT id,nickname,status FROM users WHERE id=$1',[TARGET.id]);
 assert.equal(user?.nickname,TARGET.nickname);assert.equal(receipt.status,'COMPLETED');
 const [holding]=await q(holdingSql,[TARGET.id,CARD.id]);assert.equal(Number(holding?.breakthrough_level),15);assert.ok(Number(holding.quantity)>0);
 const [audit]=await q('SELECT action_type,target_id FROM admin_logs WHERE id=$1',[receipt.adminLogId]);assert.equal(audit?.action_type,'OPS_CARD_UPGRADE_PLUS15');assert.equal(audit.target_id,String(TARGET.id));
 return {...receipt,status:'VERIFIED',currentQuantity:Number(holding.quantity),currentLevel:Number(holding.breakthrough_level)};
}
