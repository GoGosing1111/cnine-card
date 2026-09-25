import assert from 'node:assert/strict';
import reviewedCatalog from './minji-cards-grant-20260925.catalog.json' with {type:'json'};

export const OPERATION_KEY='ops:minji-full-card-plus13-grant:20260925:v1';
export const TARGET=Object.freeze({id:5589,nickname:'민지'});
export const COUNTS=Object.freeze({SUPERSTAR:7,FUR:14,ZENITH:29});
const ids=reviewedCatalog.map(card=>card.id);
const walletSql='SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=$1';
const holdingSql='SELECT * FROM user_cards WHERE user_id=$1 AND card_id=ANY($2::text[]) ORDER BY card_id';
const normalize=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['quantity','breakthrough_level','breakthrough_fail_count'].includes(key)?Number(value):value]));

// Explicit operator action only: never imported by a live route or startup hook.
export async function grantMinjiCards(client,{commit=false}={}){
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query("SET LOCAL statement_timeout='15s'");
  const users=(await client.query('SELECT id,nickname,status FROM users WHERE nickname=$1 ORDER BY id LIMIT 2 FOR UPDATE',[TARGET.nickname])).rows;
  assert.equal(users.length,1,'Exactly one named account is required');
  assert.equal(Number(users[0].id),TARGET.id,'Target account changed');
  assert.equal(users[0].status,'ACTIVE','Target must be active');
  // The user row serializes callers before checking the durable operation receipt.
  const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
  if(saved){
   const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.user.id,TARGET.id);
   await client.query('ROLLBACK');return {...receipt,replayed:true};
  }
  const cards=(await client.query(`SELECT c.id,c.title,UPPER(c.rarity) grade FROM cards_effective_v1210 c
   JOIN members m ON m.id=c.member_id WHERE UPPER(c.rarity) IN ('SUPERSTAR','FUR','ZENITH')
   AND c.is_active=1 AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND COALESCE(m.is_active,1)=1
   ORDER BY UPPER(c.rarity),c.id`)).rows;
  assert.deepEqual(cards.map(c=>[c.id,c.grade]),reviewedCatalog.map(c=>[c.id,c.grade]),'Reviewed live catalog changed');
  const owner=(await client.query("SELECT id FROM users WHERE UPPER(role)='OWNER' AND UPPER(status)='ACTIVE' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(owner,'Active owner audit identity missing');
  const walletBefore=(await client.query(walletSql,[TARGET.id])).rows[0];
  const before=(await client.query(holdingSql+' FOR UPDATE',[TARGET.id,ids])).rows;
  const old=new Map(before.map(row=>[row.card_id,row]));
  for(const row of before)assert.ok(Number.isSafeInteger(Number(row.quantity))&&Number(row.quantity)>=0&&Number(row.quantity)<Number.MAX_SAFE_INTEGER,'Invalid existing quantity');
  const now=new Date().toISOString();
  const changed=await client.query(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at)
   SELECT $1,id,1,13,0,$3,$3 FROM unnest($2::text[]) AS id
   ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,
   breakthrough_level=GREATEST(user_cards.breakthrough_level,excluded.breakthrough_level),
   breakthrough_fail_count=CASE WHEN user_cards.breakthrough_level<excluded.breakthrough_level THEN 0 ELSE user_cards.breakthrough_fail_count END,
   last_obtained_at=excluded.last_obtained_at RETURNING card_id`,[TARGET.id,ids,now]);
  assert.equal(changed.rowCount,ids.length,'Incomplete card grant');
  const after=(await client.query(holdingSql,[TARGET.id,ids])).rows;
  assert.equal(after.length,ids.length);
  const next=new Map(after.map(row=>[row.card_id,row]));
  const cardChanges=cards.map(card=>{
   const previous=old.get(card.id),row=next.get(card.id);
   assert.ok(row);assert.equal(Number(row.quantity),Number(previous?.quantity||0)+1);
   assert.equal(Number(row.breakthrough_level),Math.max(Number(previous?.breakthrough_level||0),13));
   assert.equal(Number(row.breakthrough_fail_count),Number(previous?.breakthrough_level||0)<13?0:Number(previous.breakthrough_fail_count));
   if(previous)assert.deepEqual(normalize(row),normalize({...previous,quantity:row.quantity,breakthrough_level:row.breakthrough_level,breakthrough_fail_count:row.breakthrough_fail_count,last_obtained_at:row.last_obtained_at}),'Unrequested card field changed');
   return {...card,quantityBefore:Number(previous?.quantity||0),quantityAfter:Number(row.quantity),levelBefore:Number(previous?.breakthrough_level||0),levelAfter:Number(row.breakthrough_level)};
  });
  assert.deepEqual((await client.query(walletSql,[TARGET.id])).rows[0],walletBefore,'Account balances changed');
  const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',user:TARGET,counts:COUNTS,quantityPerType:1,totalGranted:ids.length,levelRequested:13,cardChanges,balancesPreserved:true,completedAt:now};
  const log=(await client.query('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[
   owner.id,'OPS_CARD_FULL_PLUS13_GRANT','USER',String(TARGET.id),
   JSON.stringify({operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',user:TARGET,cardChanges:cardChanges.map(({id,quantityBefore,levelBefore})=>({id,quantityBefore,levelBefore}))}),
   JSON.stringify({...receipt,reason:'사용자 지시: 민지 계정에 SUPERSTAR·FUR·ZENITH 공개·활성 전체 각 1장 +13 지급. 기존 수량과 상위 강화 보존.'})
  ])).rows[0];
  assert.ok(log,'Audit log missing');receipt.adminLogId=String(log.id);
  await client.query('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OPERATION_KEY,JSON.stringify(receipt),now]);
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

export async function verifyMinjiCards(client){
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 assert.ok(saved,'Completed operation receipt missing');
 const receipt=JSON.parse(saved.value);assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.user.id,TARGET.id);
 const user=(await client.query('SELECT id,nickname,status FROM users WHERE id=$1',[TARGET.id])).rows[0];
 assert.equal(user?.nickname,TARGET.nickname);
 const rows=(await client.query(holdingSql,[TARGET.id,ids])).rows;
 assert.equal(rows.length,ids.length);
 for(const row of rows){
  const change=receipt.cardChanges.find(c=>c.id===row.card_id);assert.ok(change);
  assert.equal(Number(row.quantity),change.quantityAfter);assert.equal(Number(row.breakthrough_level),change.levelAfter);
 }
 const audit=(await client.query('SELECT id,action_type,target_type,target_id FROM admin_logs WHERE id=$1',[receipt.adminLogId])).rows[0];
 assert.equal(audit?.action_type,'OPS_CARD_FULL_PLUS13_GRANT');assert.equal(audit.target_id,String(TARGET.id));
 return {status:'VERIFIED',user:TARGET,counts:receipt.counts,totalGranted:receipt.totalGranted,verifiedCards:rows.length,levels:[...new Set(rows.map(r=>Number(r.breakthrough_level)))],adminLogId:receipt.adminLogId,completedAt:receipt.completedAt,operationKey:OPERATION_KEY};
}
