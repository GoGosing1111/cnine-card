import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:gingdeodeum-iyejun-plus15:20261021:v1';
export const TARGET=Object.freeze({id:5877,nickname:'깅더듬'});
export const CARDS=Object.freeze([
 Object.freeze({id:'CN-346F8DB0DEB84D41',title:'철구'}),
 Object.freeze({id:'CN-47AD4B47B6A7452C',title:'아이젠 족스케'}),
 Object.freeze({id:'CN-5D0E2E4D58C9416F',title:'치타구'})
]);
const holdingSql='SELECT * FROM user_cards WHERE user_id=$1 AND card_id=ANY($2::text[]) ORDER BY card_id';
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const starsSql="SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code='MASTER_STAR'";
const normalize=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,['quantity','breakthrough_level','breakthrough_fail_count'].includes(k)?Number(v):v]));

export async function upgradeGingdeodeumIyejun(client,{commit=false}={}){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows,ids=CARDS.map(c=>c.id);
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='10s'");
  const users=await q('SELECT id,nickname,status FROM users WHERE nickname=$1 ORDER BY id LIMIT 2 FOR UPDATE',[TARGET.nickname]);
  assert.equal(users.length,1,'Exactly one named account required');assert.equal(Number(users[0].id),TARGET.id);assert.equal(users[0].status,'ACTIVE');
  const [prior]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(prior){const r=JSON.parse(prior.value);assert.equal(r.status,'COMPLETED');assert.deepEqual(r.user,TARGET);assert.deepEqual(r.cards.map(c=>c.id),ids);await client.query('ROLLBACK');return {...r,replayed:true};}
  const catalog=await q('SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,c.card_status,c.member_id,m.name member_name,m.is_active member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=ANY($1::text[]) ORDER BY c.id',[ids]);
  assert.equal(catalog.length,3,'All three catalog cards required');
  for(let i=0;i<3;i++){
   const c=catalog[i];assert.deepEqual({id:c.id,title:c.title},CARDS[i]);assert.equal(c.grade,'FUR');assert.equal(c.member_name,'이예준');assert.equal(Number(c.member_id),111);
   assert.equal(Number(c.is_active),1);assert.equal(c.card_status,'PUBLIC');assert.equal(Number(c.member_active),1);
  }
  const ownedFur=await q("SELECT c.id FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id JOIN members m ON m.id=c.member_id WHERE uc.user_id=$1 AND uc.quantity>0 AND c.member_id=$2 ORDER BY c.id",[TARGET.id,111]);
  assert.deepEqual(ownedFur.map(c=>c.id),ids,'Owned Iyejun scope changed');
  const [owner]=await q("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Audit owner missing');
  const [walletBefore]=await q(walletSql,[TARGET.id]);
  const starsBefore=await q(starsSql+' FOR UPDATE',[TARGET.id]);
  assert.ok(starsBefore.every(row=>Number(row.quantity)>=0),'Enhancement is in progress');
  const before=await q(holdingSql+' FOR UPDATE',[TARGET.id,ids]);assert.equal(before.length,3,'All three existing holdings required');
  for(const row of before){
   assert.ok(Number(row.quantity)>0,'Existing owned card required');
   assert.ok(Number.isInteger(Number(row.breakthrough_level))&&Number(row.breakthrough_level)>=0&&Number(row.breakthrough_level)<=15,'Unexpected existing level');
   assert.ok(Number(row.breakthrough_fail_count)>=0,'Enhancement is in progress');
  }
  for(const row of before)if(Number(row.breakthrough_level)<15){
   const changed=await q('UPDATE user_cards SET breakthrough_level=15,breakthrough_fail_count=0 WHERE user_id=$1 AND card_id=$2 AND breakthrough_level=$3 AND quantity=$4 AND breakthrough_fail_count=$5 RETURNING card_id',[TARGET.id,row.card_id,row.breakthrough_level,row.quantity,row.breakthrough_fail_count]);
   assert.equal(changed.length,1,'Owned card changed during upgrade');
  }
  const after=await q(holdingSql,[TARGET.id,ids]);
  const expected=before.map(r=>({...r,breakthrough_level:15,breakthrough_fail_count:Number(r.breakthrough_level)<15?0:r.breakthrough_fail_count}));
  assert.deepEqual(after.map(normalize),expected.map(normalize),'Unrequested holding field changed');
  assert.deepEqual((await q(walletSql,[TARGET.id]))[0],walletBefore,'Account balance changed');assert.deepEqual(await q(starsSql,[TARGET.id]),starsBefore,'Master stars changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',user:TARGET,
   cards:CARDS.map((c,i)=>({...c,levelBefore:Number(before[i].breakthrough_level),levelAfter:15,quantityBefore:Number(before[i].quantity),quantityAfter:Number(after[i].quantity),changed:Number(before[i].breakthrough_level)<15})),balancesPreserved:true,completedAt:new Date().toISOString()};
  const [audit]=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_CARD_UPGRADE_PLUS15','USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,cards:before}),JSON.stringify({...receipt,cardStates:after,reason:'사용자 지시: 깅더듬 계정에 이예준 관련카드 +15강으로 다 업그레이드 해줘'})]);
  assert.ok(audit,'Audit log missing');receipt.adminLogId=String(audit.id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),receipt.completedAt]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}

export async function verifyGingdeodeumIyejun(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);assert.ok(saved,'Receipt missing');
 const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.deepEqual(receipt.user,TARGET);
 const [user]=await q('SELECT id,nickname,status FROM users WHERE id=$1',[TARGET.id]);assert.equal(user?.nickname,TARGET.nickname);
 const holdings=await q(holdingSql,[TARGET.id,CARDS.map(c=>c.id)]);assert.equal(holdings.length,3);
 for(let i=0;i<3;i++){assert.equal(holdings[i].card_id,CARDS[i].id);assert.equal(Number(holdings[i].breakthrough_level),15);assert.equal(Number(holdings[i].quantity),receipt.cards[i].quantityAfter);}
 const [audit]=await q('SELECT action_type,target_id FROM admin_logs WHERE id=$1',[receipt.adminLogId]);assert.equal(audit?.action_type,'OPS_CARD_UPGRADE_PLUS15');assert.equal(audit.target_id,String(TARGET.id));
 return {...receipt,status:'VERIFIED',current:holdings.map(r=>({cardId:r.card_id,level:Number(r.breakthrough_level),quantity:Number(r.quantity)}))};
}
