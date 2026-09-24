import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:territory:58:winner-extra:20260924:v1';
export const ROUND=Object.freeze({id:58,battleName:'어른들의세계',winnerSide:'B',settledAt:'2026-09-24 08:49:12'});
export const COIN_PER_USER='30000000000';
export const STARS_PER_USER='200000';
export const USER_IDS=Object.freeze([8,13,16,22,24,29,32,39,62,71,75,81,85,87,91,92,145,156,162,164,185,187,216,218,220,242,261,289,295,303,312,314,359,360,490,521,619,631,660,792,850,1195,1255,1301,1843,2246,2300,2333,2420,2734,3011,3480,3646,3739,4111,4199,4222,4235,4389,4552,4562,4570,4572,4581,4582,4598,4610,4614,4627,4628,4652,4675,4686,4705,4754,4772,4773,4820,4866,4870,4910,4913,4954,4965,5008,5148,5436]);
export const COIN_REASON='영토전 58회 승리팀 추가 지급 · 20260924';
export const REFERENCE_TYPE='TERRITORY_WINNER_EXTRA';
const safeMaximum=BigInt(Number.MAX_SAFE_INTEGER);
const sortedIds=(rows,field='user_id')=>rows.map(row=>Number(row[field])).sort((a,b)=>a-b);

// One-time operator action only. No game route, startup hook or recurring reward change.
// The finished round roster, including its unaffiliated members, determines recipients.
export async function grantTerritoryWinnerExtra(client){
 const q=async(sql,args=[])=>(await client.query(sql,args)).rows;
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='20s'");
  const [round]=await q('SELECT id,status,battle_name,winner_side,settled_at FROM territory_war_v3_rounds WHERE id=$1 FOR UPDATE',[ROUND.id]);
  assert.ok(round,'Reviewed round missing');
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
  if(saved){
   const receipt=JSON.parse(saved.value);
   assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.roundId,ROUND.id);
   assert.equal(receipt.coinPerUser,COIN_PER_USER);assert.equal(receipt.starsPerUser,STARS_PER_USER);
   assert.deepEqual(receipt.userIds,USER_IDS);
   await client.query('COMMIT');return {...receipt,replayed:true};
  }
  assert.equal(round.status,'FINISHED','Round must be finished');
  assert.equal(round.battle_name,ROUND.battleName,'Reviewed round name changed');
  assert.equal(round.winner_side,ROUND.winnerSide,'Reviewed winning side changed');
  assert.equal(round.settled_at,ROUND.settledAt,'Reviewed settlement changed');
  const roster=await q('SELECT user_id,side,status,attacks,clan_id FROM territory_war_v3_users WHERE round_id=$1 AND side=$2 ORDER BY user_id FOR SHARE',[ROUND.id,ROUND.winnerSide]);
  assert.deepEqual(sortedIds(roster),USER_IDS,'Reviewed winning roster changed');
  assert.ok(roster.every(row=>row.status==='ACTIVE'),'Reviewed participant status changed');
  const [item]=await q("SELECT code,name,is_active FROM inventory_items WHERE code='MASTER_STAR' FOR SHARE");
  assert.ok(item?.name==='마스터의 별'&&Number(item.is_active)===1,'Master Star catalog changed');
  const [owner]=await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1");
  assert.ok(owner,'Active owner required for audit');
  const wallets=await q('SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[USER_IDS]);
  assert.deepEqual(sortedIds(wallets,'id'),USER_IDS,'Recipient account missing');
  assert.ok(wallets.every(row=>row.status==='ACTIVE'),'Recipient account status changed');
  const inventory=await q("SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id FOR UPDATE",[USER_IDS]);
  const beforeStars=new Map(inventory.map(row=>[Number(row.user_id),row]));
  for(const wallet of wallets){
   const stars=beforeStars.get(Number(wallet.id));
   assert.ok(BigInt(wallet.coin)+BigInt(COIN_PER_USER)<=safeMaximum,'Coin exceeds exact integer range');
   assert.ok(BigInt(stars?.quantity??0)+BigInt(STARS_PER_USER)<=safeMaximum,'Stars exceed exact integer range');
   assert.ok(BigInt(stars?.unseen_quantity??0)+BigInt(STARS_PER_USER)<=safeMaximum,'Unseen stars exceed exact integer range');
  }
  const now=new Date().toISOString();
  const coinLogs=await q(`WITH credited AS (
   UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin
  ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
   SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id,user_id,change_amount,balance_after`,[USER_IDS,COIN_PER_USER,COIN_REASON,owner.id,now]);
  assert.deepEqual(sortedIds(coinLogs),USER_IDS,'Partial coin credit or ledger insert');
  const starLogs=await q(`WITH credited AS (
   INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT id,'MASTER_STAR',$2::bigint,$2::bigint,$3,$3 FROM unnest($1::bigint[]) AS id ORDER BY id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
    unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at
   RETURNING user_id,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT user_id,'MASTER_STAR',$2::bigint,quantity,$4,$5,$6,$7,$3 FROM credited RETURNING id,user_id,change_amount,balance_after`,[USER_IDS,STARS_PER_USER,now,COIN_REASON,REFERENCE_TYPE,OPERATION_KEY,owner.id]);
  assert.deepEqual(sortedIds(starLogs),USER_IDS,'Partial star credit or ledger insert');
  const afterWallets=await q('SELECT id,nickname,status,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[USER_IDS]);
  const afterInventory=await q("SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id",[USER_IDS]);
  assert.deepEqual(sortedIds(afterWallets,'id'),USER_IDS);assert.deepEqual(sortedIds(afterInventory),USER_IDS);
  const coinLedger=new Map(coinLogs.map(row=>[Number(row.user_id),row])),starLedger=new Map(starLogs.map(row=>[Number(row.user_id),row]));
  const recipients=wallets.map((wallet,index)=>{
   const userId=Number(wallet.id),after=afterWallets[index],starsBefore=beforeStars.get(userId),starsAfter=afterInventory[index];
   assert.equal(BigInt(after.coin),BigInt(wallet.coin)+BigInt(COIN_PER_USER),'Coin balance verification failed');
   assert.deepEqual({...after,coin:wallet.coin},wallet,'Other wallet fields changed');
   assert.equal(BigInt(starsAfter.quantity),BigInt(starsBefore?.quantity??0)+BigInt(STARS_PER_USER),'Star balance verification failed');
   assert.equal(BigInt(starsAfter.unseen_quantity),BigInt(starsBefore?.unseen_quantity??0)+BigInt(STARS_PER_USER),'Unseen star balance verification failed');
   assert.equal(String(coinLedger.get(userId).change_amount),COIN_PER_USER);assert.equal(String(coinLedger.get(userId).balance_after),String(after.coin));
   assert.equal(String(starLedger.get(userId).change_amount),STARS_PER_USER);assert.equal(String(starLedger.get(userId).balance_after),String(starsAfter.quantity));
   return {userId,nickname:wallet.nickname,coinBefore:String(wallet.coin),coinAfter:String(after.coin),starsBefore:String(starsBefore?.quantity??0),starsAfter:String(starsAfter.quantity),coinLogId:String(coinLedger.get(userId).id),starLogId:String(starLedger.get(userId).id)};
  });
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',roundId:ROUND.id,battleName:ROUND.battleName,winnerSide:ROUND.winnerSide,settledAt:ROUND.settledAt,
   recipientCount:USER_IDS.length,userIds:USER_IDS,coinPerUser:COIN_PER_USER,starsPerUser:STARS_PER_USER,
   totalCoin:String(BigInt(COIN_PER_USER)*BigInt(USER_IDS.length)),totalStars:String(BigInt(STARS_PER_USER)*BigInt(USER_IDS.length)),recipients,completedAt:now};
  const audit=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at)
   VALUES($1,'OPS_TERRITORY_WINNER_EXTRA','TERRITORY_WAR_ROUND',$2,$3,$4,$5) RETURNING id`,[owner.id,String(ROUND.id),JSON.stringify({round,roster}),JSON.stringify({...receipt,authorization:'영토전 승리팀 마별 20만개 300억 추가 지급'}),now]);
  assert.equal(audit.length,1,'Grant audit missing');receipt.adminLogId=String(audit[0].id);
  const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);
  assert.equal(written.length,1,'Grant receipt missing');
  await client.query('COMMIT');return {...receipt,replayed:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
