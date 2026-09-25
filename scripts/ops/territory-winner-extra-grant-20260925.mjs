import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const OPERATION_KEY='ops:territory:60:winner-extra:20260925:v1';
export const ROUND=Object.freeze({id:60,battleName:'크로우즈',winnerSide:'B',settledAt:'2026-09-25 13:21:44'});
export const RECIPIENT_COUNT=89;
export const COIN_PER_USER='50000000000';
export const STARS_PER_USER='1000000';
export const COIN_REASON='영토전 60회 승리팀 추가 지급 · 20260925';
export const REFERENCE_TYPE='TERRITORY_WINNER_EXTRA';
const roundSql='SELECT id,status,battle_name,winner_side,settled_at FROM territory_war_v3_rounds WHERE id=$1';
const rosterSql='SELECT user_id,side,status,attacks,clan_id FROM territory_war_v3_users WHERE round_id=$1 AND side=$2 ORDER BY user_id LIMIT 2001';
const sortedIds=(rows,field='user_id')=>rows.map(row=>String(row[field])).sort((a,b)=>Number(a)-Number(b));
const digest=ids=>createHash('sha256').update(JSON.stringify(ids)).digest('hex');
const safeAmount=(amount,increase)=>assert.ok(BigInt(amount??0)>=0n&&BigInt(amount??0)+BigInt(increase)<=BigInt(Number.MAX_SAFE_INTEGER),'Balance outside supported exact integer range');

export async function inspectTerritoryWinnerExtra(client){
 const round=(await client.query(roundSql,[ROUND.id])).rows[0];
 const recipients=(await client.query(rosterSql,[ROUND.id,ROUND.winnerSide])).rows;
 const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];
 return {round,recipientCount:recipients.length,recipientHash:digest(sortedIds(recipients)),recipients,receipt:saved?JSON.parse(saved.value):null};
}

export async function verifyTerritoryWinnerExtra(client,receipt){
 if(!receipt){const saved=(await client.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows[0];assert.ok(saved,'Completed receipt missing');receipt=JSON.parse(saved.value);}
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.roundId,ROUND.id);
 assert.equal(receipt.battleName,ROUND.battleName);assert.equal(receipt.winnerSide,ROUND.winnerSide);assert.equal(receipt.settledAt,ROUND.settledAt);
 assert.equal(receipt.coinPerUser,COIN_PER_USER);assert.equal(receipt.starsPerUser,STARS_PER_USER);
 const ids=receipt.recipients.map(r=>String(r.userId));assert.equal(ids.length,RECIPIENT_COUNT);assert.equal(new Set(ids).size,ids.length);assert.equal(digest(ids),receipt.recipientHash);
 const coins=(await client.query('SELECT id,user_id,change_amount,balance_after,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[receipt.recipients.map(r=>r.coinLogId)])).rows;
 const stars=(await client.query('SELECT id,user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id FROM inventory_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[receipt.recipients.map(r=>r.starLogId)])).rows;
 assert.deepEqual(sortedIds(coins),ids);assert.deepEqual(sortedIds(stars),ids);
 for(let i=0;i<ids.length;i++){
  const r=receipt.recipients[i],coin=coins[i],star=stars[i];
  assert.equal(String(coin.change_amount),COIN_PER_USER);assert.equal(String(coin.balance_after),r.coinAfter);assert.equal(coin.reason,COIN_REASON);
  assert.equal(BigInt(r.coinAfter)-BigInt(r.coinBefore),BigInt(COIN_PER_USER));
  assert.equal(star.item_code,'MASTER_STAR');assert.equal(String(star.change_amount),STARS_PER_USER);assert.equal(String(star.balance_after),r.starsAfter);
  assert.equal(BigInt(r.starsAfter)-BigInt(r.starsBefore),BigInt(STARS_PER_USER));assert.equal(BigInt(r.unseenAfter)-BigInt(r.unseenBefore),BigInt(STARS_PER_USER));
  assert.equal(star.reason,COIN_REASON);assert.equal(star.reference_type,REFERENCE_TYPE);assert.equal(star.reference_id,OPERATION_KEY);
 }
 const audit=(await client.query('SELECT id,action_type,target_id FROM admin_logs WHERE id=$1',[receipt.adminLogId])).rows[0];
 assert.equal(audit?.action_type,'OPS_TERRITORY_WINNER_EXTRA');assert.equal(audit.target_id,String(ROUND.id));
 return {status:'VERIFIED',roundId:ROUND.id,battleName:ROUND.battleName,winnerSide:ROUND.winnerSide,recipientCount:ids.length,coinLogs:coins.length,starLogs:stars.length,coinPerUser:COIN_PER_USER,starsPerUser:STARS_PER_USER,totalCoin:receipt.totalCoin,totalStars:receipt.totalStars,duplicates:0,adminLogId:receipt.adminLogId,completedAt:receipt.completedAt};
}

// One-time direct grant for the reviewed finished round. Never imported by the game runtime.
export async function grantTerritoryWinnerExtra(client,{expectedRecipientHash,commit=false}={}){
 assert.match(String(expectedRecipientHash||''),/^[a-f0-9]{64}$/,'Reviewed winner roster hash required');
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='20s'");
  const [round]=await q(roundSql+' FOR UPDATE',[ROUND.id]);assert.ok(round,'Reviewed round missing');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){const receipt=JSON.parse(saved.value),verification=await verifyTerritoryWinnerExtra(client,receipt);await client.query('ROLLBACK');return {...receipt,verification,replayed:true};}
  assert.equal(round.status,'FINISHED');assert.equal(round.battle_name,ROUND.battleName);assert.equal(round.winner_side,ROUND.winnerSide);assert.equal(round.settled_at,ROUND.settledAt);
  const roster=await q(rosterSql+' FOR SHARE',[ROUND.id,ROUND.winnerSide]),ids=sortedIds(roster);
  assert.equal(ids.length,RECIPIENT_COUNT,'Reviewed winner count changed');assert.equal(digest(ids),expectedRecipientHash,'Reviewed winner roster changed');
  assert.ok(roster.every(r=>r.status==='ACTIVE'),'Reviewed participant status changed');
  const [item]=await q("SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR' FOR SHARE");assert.ok(item?.name==='마스터의 별'&&Number(item.is_active)===1,'Master Star catalog changed');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");assert.ok(owner,'Active owner audit identity missing');
  const wallets=await q('SELECT id,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
  assert.deepEqual(sortedIds(wallets,'id'),ids);assert.ok(wallets.every(r=>r.status==='ACTIVE'),'Recipient account status changed');
  const inventory=await q("SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id FOR UPDATE",[ids]);
  const oldStars=new Map(inventory.map(r=>[String(r.user_id),r]));
  for(const wallet of wallets){const held=oldStars.get(String(wallet.id));safeAmount(wallet.coin,COIN_PER_USER);safeAmount(held?.quantity,STARS_PER_USER);safeAmount(held?.unseen_quantity,STARS_PER_USER);}
  const now=new Date().toISOString();
  const coinLogs=await q(`WITH credited AS (
   UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin
  ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
   SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id,user_id,change_amount,balance_after`,[ids,COIN_PER_USER,COIN_REASON,owner.id,now]);
  assert.deepEqual(sortedIds(coinLogs),ids,'Partial coin grant or ledger write');
  const starLogs=await q(`WITH credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT id,'MASTER_STAR',$2::bigint,$2::bigint,$3,$3 FROM unnest($1::bigint[]) AS id ORDER BY id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
   unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT user_id,'MASTER_STAR',$2::bigint,quantity,$4,$5,$6,$7,$3 FROM credited RETURNING id,user_id,change_amount,balance_after`,[ids,STARS_PER_USER,now,COIN_REASON,REFERENCE_TYPE,OPERATION_KEY,owner.id]);
  assert.deepEqual(sortedIds(starLogs),ids,'Partial star grant or ledger write');
  const afterWallets=await q('SELECT id,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[ids]);
  const afterInventory=await q("SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id",[ids]);
  assert.deepEqual(sortedIds(afterWallets,'id'),ids);assert.deepEqual(sortedIds(afterInventory),ids);
  const coins=new Map(coinLogs.map(r=>[String(r.user_id),r])),stars=new Map(starLogs.map(r=>[String(r.user_id),r]));
  const recipients=wallets.map((wallet,i)=>{
   const id=String(wallet.id),after=afterWallets[i],previous=oldStars.get(id),itemAfter=afterInventory[i],coinLog=coins.get(id),starLog=stars.get(id);
   assert.equal(BigInt(after.coin),BigInt(wallet.coin)+BigInt(COIN_PER_USER));assert.deepEqual({...after,coin:wallet.coin},wallet,'Other wallet fields changed');
   assert.equal(BigInt(itemAfter.quantity),BigInt(previous?.quantity??0)+BigInt(STARS_PER_USER));assert.equal(BigInt(itemAfter.unseen_quantity),BigInt(previous?.unseen_quantity??0)+BigInt(STARS_PER_USER));
   if(previous)assert.deepEqual({...itemAfter,quantity:previous.quantity,unseen_quantity:previous.unseen_quantity,updated_at:previous.updated_at},previous,'Other inventory fields changed');
   assert.equal(String(coinLog.change_amount),COIN_PER_USER);assert.equal(String(coinLog.balance_after),String(after.coin));assert.equal(String(starLog.change_amount),STARS_PER_USER);assert.equal(String(starLog.balance_after),String(itemAfter.quantity));
   return {userId:id,coinBefore:String(wallet.coin),coinAfter:String(after.coin),starsBefore:String(previous?.quantity??0),starsAfter:String(itemAfter.quantity),unseenBefore:String(previous?.unseen_quantity??0),unseenAfter:String(itemAfter.unseen_quantity),coinLogId:String(coinLog.id),starLogId:String(starLog.id)};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',delivery:'DIRECT',roundId:ROUND.id,battleName:ROUND.battleName,winnerSide:ROUND.winnerSide,settledAt:ROUND.settledAt,recipientCount:ids.length,recipientHash:digest(ids),coinPerUser:COIN_PER_USER,starsPerUser:STARS_PER_USER,totalCoin:String(BigInt(ids.length)*BigInt(COIN_PER_USER)),totalStars:String(BigInt(ids.length)*BigInt(STARS_PER_USER)),recipients,completedAt:now};
  const audit=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_TERRITORY_WINNER_EXTRA','TERRITORY_WAR_ROUND',$2,$3,$4,$5) RETURNING id`,[owner.id,String(ROUND.id),JSON.stringify({round,roster}),JSON.stringify({...receipt,authorization:'영토전 방금 종료 승리팀 마별 100만개 코인 500억 추가 지급'}),now]);
  assert.equal(audit.length,1,'Audit record missing');receipt.adminLogId=String(audit[0].id);
  const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);assert.equal(written.length,1,'Completion receipt missing');
  await client.query(commit?'COMMIT':'ROLLBACK');return {...receipt,committed:commit,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
