// Explicit one-round recovery. Call inside a transaction; never run at startup.
export const SEAL_RECOVERY_KEY='ops:seal:46:min10:20260922';
export const SEAL_RECOVERY_EVENT_KEY='seal-1790036014785-ef686f5ce533';
const check=(value,message)=>{if(!value)throw Error(message)};
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export async function recoverSeal46(q){
  await q('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[SEAL_RECOVERY_KEY]);
  const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[SEAL_RECOVERY_KEY]);
  if(saved){const receipt=parse(saved.value);check(receipt.eventKey===SEAL_RECOVERY_EVENT_KEY&&receipt.status==='COMPLETED','Invalid recovery receipt');return {...receipt,replayed:true};}
  // Serialize against normal claim endpoints before checking their receipts.
  await q('LOCK TABLE seal_battle_clear_claims,seal_battle_rank_claims IN SHARE ROW EXCLUSIVE MODE');
  const [event]=await q('SELECT * FROM seal_battle_events WHERE id=46 FOR UPDATE');
  check(event?.event_key===SEAL_RECOVERY_EVENT_KEY&&event.status==='CLEARED'&&Number(event.min_reward_attempts)===30,'Event changed');
  check(Number(event.clear_coin)===5000000000&&Number(event.clear_shards)===0,'Clear reward changed');
  const [owner]=await q("SELECT id FROM users WHERE id=1 AND nickname='핑크빛유두' AND role='OWNER'");check(owner,'Owner identity changed');
  const participants=await q(`SELECT p.*,ROW_NUMBER() OVER(ORDER BY total_contribution DESC,total_attempts DESC,last_contribution_at ASC,user_id ASC) AS final_rank
    FROM seal_battle_user_progress p WHERE event_id=46 AND total_attempts>0`);
  check(participants.length===173&&participants.every(p=>p.last_contribution_at),'Participant snapshot changed');
  const eligible=participants.filter(p=>Number(p.total_attempts)>=10);
  check(eligible.length===123,'Eligible count changed');
  const clearClaims=await q('SELECT * FROM seal_battle_clear_claims WHERE event_id=46');
  const rankClaims=await q('SELECT * FROM seal_battle_rank_claims WHERE event_id=46');
  check([...clearClaims,...rankClaims].every(c=>c.status==='COMPLETED'),'A reward claim is in progress');
  const clearPaid=new Map(clearClaims.map(c=>[String(c.user_id),c]));
  const rankPaid=new Map(rankClaims.map(c=>[String(c.user_id),c]));
  const rankConfig=parse(event.rank_rewards_json);
  const clear=eligible.filter(p=>!clearPaid.has(String(p.user_id))).map(p=>({user_id:String(p.user_id),coin:Number(event.clear_coin),shards:Number(event.clear_shards)}));
  const rank=eligible.flatMap(p=>{
    if(!rankConfig.enabled||rankPaid.has(String(p.user_id)))return [];
    const tier=rankConfig.tiers.find(t=>Number(p.final_rank)>=t.startRank&&Number(p.final_rank)<=t.endRank);
    if(!tier||!(Number(tier.coin||0)+Number(tier.premiumCube||0)+Number(tier.equipmentBox||0)))return [];
    return [{user_id:String(p.user_id),final_rank:Number(p.final_rank),total_contribution:String(p.total_contribution),reward:{coin:Number(tier.coin||0),premiumCube:Number(tier.premiumCube||0),equipmentBox:Number(tier.equipmentBox||0)}}];
  });
  const wallets=await q('SELECT id,coin,card_shards FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[eligible.map(p=>String(p.user_id))]);
  check(wallets.length===eligible.length,'Participant account missing');
  const totals=new Map(eligible.map(p=>[String(p.user_id),0]));
  for(const r of clear)totals.set(r.user_id,totals.get(r.user_id)+r.coin);
  for(const r of rank)totals.set(r.user_id,totals.get(r.user_id)+r.reward.coin);
  check(wallets.every(w=>BigInt(w.coin)+BigInt(totals.get(String(w.id)))<=BigInt(Number.MAX_SAFE_INTEGER)),'Wallet exceeds exact integer range');
  const clearJson=JSON.stringify(clear);
  const insertedClear=await q(`INSERT INTO seal_battle_clear_claims(event_id,user_id,status,reward_coin,reward_shards,claimed_at,updated_at)
    SELECT 46,x.user_id,'COMPLETED',x.coin,x.shards,sqlite_now(),sqlite_now()
    FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,coin bigint,shards bigint) RETURNING user_id`,[clearJson]);
  check(insertedClear.length===clear.length,'Clear receipt count mismatch');
  const clearLogs=await q(`WITH paid AS (
    UPDATE users u SET coin=u.coin+x.coin,card_shards=u.card_shards+x.shards
    FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,coin bigint,shards bigint) WHERE u.id=x.user_id RETURNING u.id,u.coin,x.coin AS reward
  ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,reward,coin,'SEAL_BATTLE_CLEAR' FROM paid RETURNING user_id`,[clearJson]);
  check(clearLogs.length===clear.length,'Clear payment count mismatch');
  const rankJson=JSON.stringify(rank.map(r=>({...r,reward_json:JSON.stringify(r.reward),coin:r.reward.coin})));
  const insertedRank=await q(`INSERT INTO seal_battle_rank_claims(event_id,user_id,final_rank,total_contribution,reward_json,status,claimed_at,created_at,updated_at)
    SELECT 46,x.user_id,x.final_rank,x.total_contribution,x.reward_json,'COMPLETED',sqlite_now(),sqlite_now(),sqlite_now()
    FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,final_rank bigint,total_contribution bigint,reward_json text) RETURNING user_id`,[rankJson]);
  check(insertedRank.length===rank.length,'Rank receipt count mismatch');
  const rankLogs=await q(`WITH paid AS (
    UPDATE users u SET coin=u.coin+x.coin FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,coin bigint)
    WHERE u.id=x.user_id AND x.coin>0 RETURNING u.id,u.coin,x.coin AS reward
  ) INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,reward,coin,'SEAL_BATTLE_RANK' FROM paid RETURNING user_id`,[rankJson]);
  check(rankLogs.length===rank.filter(r=>r.reward.coin>0).length,'Rank coin payment count mismatch');
  const items=rank.flatMap(r=>[['premiumCube','PREMIUM_CUBE'],['equipmentBox','EQUIPMENT_SUPPLY_BOX']].flatMap(([field,item_code])=>r.reward[field]>0?[{user_id:r.user_id,item_code,quantity:r.reward[field]}]:[]));
  const itemLogs=await q(`WITH awarded AS (
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
    SELECT x.user_id,x.item_code,x.quantity,x.quantity,sqlite_now(),sqlite_now()
    FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,item_code text,quantity bigint)
    ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,
      unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=sqlite_now()
    RETURNING user_id,item_code,quantity
  ) INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id)
    SELECT a.user_id,a.item_code,x.quantity,a.quantity,'SEAL_BATTLE_RANK','SEAL_BATTLE',$2
    FROM awarded a JOIN jsonb_to_recordset($1::jsonb) AS x(user_id bigint,item_code text,quantity bigint) USING(user_id,item_code) RETURNING id,user_id,item_code`,[JSON.stringify(items),SEAL_RECOVERY_EVENT_KEY]);
  check(itemLogs.length===items.length,'Rank inventory payment count mismatch');
  const updated=await q('UPDATE seal_battle_events SET min_reward_attempts=10,updated_at=sqlite_now() WHERE id=46 AND min_reward_attempts=30 RETURNING id');check(updated.length===1,'Threshold update mismatch');
  const after=await q('SELECT id,coin,card_shards FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[eligible.map(p=>String(p.user_id))]);
  check(after.every((w,i)=>String(w.id)===String(wallets[i].id)&&BigInt(w.coin)===BigInt(wallets[i].coin)+BigInt(totals.get(String(w.id)))&&String(w.card_shards)===String(wallets[i].card_shards)),'Final wallet verification failed');
  const result={status:'COMPLETED',eventId:46,eventKey:SEAL_RECOVERY_EVENT_KEY,minimumAttemptsBefore:30,minimumAttemptsAfter:10,eligibleUsers:eligible.length,
    clearPaidUsers:clear.length,rankPaidUsers:rank.length,clearCoin:clear.reduce((a,r)=>a+r.coin,0),rankCoin:rank.reduce((a,r)=>a+r.reward.coin,0),
    premiumCubes:rank.reduce((a,r)=>a+r.reward.premiumCube,0),equipmentBoxes:rank.reduce((a,r)=>a+r.reward.equipmentBox,0),
    clear,rank,inventoryLogIds:itemLogs.map(r=>String(r.id)),walletsBefore:wallets,completedAt:new Date().toISOString(),receiptKey:SEAL_RECOVERY_KEY};
  const audit=await q(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data)
    VALUES(1,'SEAL_REWARD_RECOVERY','SEAL_BATTLE','46',$1,$2) RETURNING id`,[JSON.stringify({minimumAttempts:30,clearClaims:clearClaims.length,rankClaims:rankClaims.length}),JSON.stringify({...result,walletsBefore:undefined,authorization:'방금 종료회차 10회 이상자 다 보상 지급'})]);
  check(audit.length===1,'Audit missing');result.adminLogId=String(audit[0].id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[SEAL_RECOVERY_KEY,JSON.stringify(result)]);
  return result;
}
