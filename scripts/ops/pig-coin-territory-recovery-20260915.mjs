export const RECOVERY_KEY='ops_pig_coin_territory_recovery_20260915_v1';
export const RELEASE_KEY='pig_coin_territory_release_v1';
export const RESTORE_KEY='ops_pig_coin_territory_recovery_restore_20260915_v1';
const POLICY='loot_shop_policy_v1',FIRST_ROUND=49;
const check=(v,m)=>{if(!v)throw Error(m)};
export async function recoverTerritoryPigCoins(client,{dryRun=false}={}){
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 const q=async(s,v=[])=>(await client.query(s,v)).rows;
 try{
  await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");
  const prior=(await q('SELECT value FROM app_meta WHERE key=$1',[RECOVERY_KEY]))[0];
  if(prior){const receipt=JSON.parse(prior.value);check(receipt.status==='COMPLETED','Incomplete receipt');await client.query('ROLLBACK');return {ok:true,replayed:true,receipt};}
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RECOVERY_KEY,'{"status":"PENDING"}']);
  const policyRow=(await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[POLICY]))[0];check(policyRow,'Policy missing');
  const beforePolicy=JSON.parse(policyRow.value),territory=beforePolicy.sources.find(s=>s.code==='TERRITORY');check(territory,'Territory policy missing');
  const round=(await q('SELECT id,status FROM territory_war_v3_rounds WHERE id=$1 FOR SHARE',[FIRST_ROUND]))[0];check(round&&round.status==='RECRUITING','Current round changed');
  const release={firstRoundId:FIRST_ROUND,reason:'피그 코인 도입 전 종료한 영토전 회차의 소급 지급 금지',operationKey:RECOVERY_KEY};
  check((await q('SELECT key FROM app_meta WHERE key=$1',[RELEASE_KEY])).length===0,'Release boundary already exists');
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RELEASE_KEY,JSON.stringify(release)]);
  const next=structuredClone(beforePolicy);next.revision++;next.sources.find(s=>s.code==='TERRITORY').enabled=false;
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[POLICY,JSON.stringify(next)]);
  const credits=await q("SELECT l.*,u.nickname FROM pig_coin_ledger_v1 l JOIN territory_war_v3_rounds r ON l.reference_id='V3:'||CAST(r.id AS TEXT) JOIN users u ON u.id=l.user_id WHERE l.source='TERRITORY' AND l.amount>0 AND r.id<$1 ORDER BY l.user_id,l.id",[FIRST_ROUND]);
  const totals=new Map();for(const c of credits)totals.set(String(c.user_id),(totals.get(String(c.user_id))||0n)+BigInt(c.amount));
  const ids=[...totals.keys()];
  // Pack openings lock the account first; use the same lock before revoking packs.
  if(ids.length)await q('SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[ids]);
  const cancelledPurchases=[];
  const purchases=ids.length?await q('SELECT * FROM loot_shop_purchases_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY request_id FOR UPDATE',[ids]):[];
  for(const purchase of purchases){
   check(purchase.request_id==='041f1b76-349f-4e75-9a69-834017a81a9f'&&String(purchase.user_id)==='145'&&String(purchase.price)==='15'&&purchase.product_id==='superstar_choice','Unexpected purchase needs inspection');
   const pack=(await q('SELECT * FROM loot_shop_packs_v1 WHERE id=$1 FOR UPDATE',[purchase.request_id]))[0];check(pack&&pack.opened_at===null&&pack.opened_request_id===null,'Purchased pack already opened');
   const otherIncome=await q("SELECT id FROM pig_coin_ledger_v1 WHERE user_id=$1 AND amount>0 AND NOT(source='TERRITORY' AND reference_id IN (SELECT 'V3:'||CAST(id AS TEXT) FROM territory_war_v3_rounds WHERE id<$2))",[purchase.user_id,FIRST_ROUND]);check(otherIncome.length===0,'Purchase funding is mixed');
   const wallet=(await q('UPDATE pig_coin_wallets_v1 SET balance=balance+$2::bigint WHERE user_id=$1 RETURNING balance',[purchase.user_id,purchase.price]))[0];check(wallet,'Refund wallet missing');
   await q("INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) VALUES($1,$2,$3,$4,'SHOP_RECOVERY_REFUND',$5,$6)",[RECOVERY_KEY+':refund:'+purchase.request_id,purchase.user_id,purchase.price,wallet.balance,purchase.request_id,new Date().toISOString()]);
   check((await q('DELETE FROM loot_shop_packs_v1 WHERE id=$1 AND opened_at IS NULL RETURNING id',[purchase.request_id])).length===1,'Pack revoke failed');
   check((await q('DELETE FROM loot_shop_purchases_v1 WHERE request_id=$1 RETURNING request_id',[purchase.request_id])).length===1,'Purchase cancellation failed');
   const operations=await q("UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=$3 WHERE user_id=$1 AND (request_id=$2 OR (kind='LOOT_PACK_OPEN' AND status='PENDING' AND plan_json::jsonb->>'packId'=$2)) RETURNING request_id",[purchase.user_id,purchase.request_id,new Date().toISOString()]);check(operations.some(o=>o.request_id===purchase.request_id),'Purchase replay cancellation failed');
   cancelledPurchases.push({purchase,pack,operations});
  }
  const wallets=ids.length?await q('SELECT * FROM pig_coin_wallets_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[ids]):[];
  check(wallets.length===ids.length,'Wallet missing');
  const entries=[];
  for(const wallet of wallets){
   const amount=totals.get(String(wallet.user_id)),balance=BigInt(wallet.balance);check(balance>=amount,'Spent pig coins require separate recovery: '+wallet.user_id);
   const updated=await q('UPDATE pig_coin_wallets_v1 SET balance=balance-$2::bigint WHERE user_id=$1 AND balance>=$2::bigint RETURNING balance',[wallet.user_id,String(amount)]);check(updated.length===1,'Recovery failed');
   const ledger=await q("INSERT INTO pig_coin_ledger_v1(id,user_id,amount,balance_after,source,reference_id,created_at) VALUES($1,$2,$3,$4,'TERRITORY_RECOVERY',$5,$6) RETURNING id",[RECOVERY_KEY+':'+wallet.user_id,wallet.user_id,String(-amount),updated[0].balance,RECOVERY_KEY,new Date().toISOString()]);check(ledger.length===1,'Recovery ledger missing');
   entries.push({userId:String(wallet.user_id),nickname:credits.find(c=>String(c.user_id)===String(wallet.user_id)).nickname,amount:String(amount),before:String(balance),after:String(updated[0].balance)});
  }
  const owner=(await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1 FOR SHARE"))[0];check(owner,'Audit owner missing');
  const receipt={status:'COMPLETED',operationKey:RECOVERY_KEY,actor:'CODEX_OPERATIONS',reason:'사용자 요청: 지난 영토전 미수령 보상에서 뒤늦게 지급된 피그 코인 전액 회수 및 재지급 차단',completedAt:new Date().toISOString(),release,beforePolicy,afterPolicy:next,credits,entries,cancelledPurchases,totalRecovered:String([...totals.values()].reduce((a,b)=>a+b,0n))};
  const logs=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'PIG_COIN_TERRITORY_RECOVERY','APP_META',RECOVERY_KEY,JSON.stringify({policy:beforePolicy,wallets}),JSON.stringify(receipt)]);check(logs.length===1,'Audit missing');receipt.auditId=String(logs[0].id);
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[RECOVERY_KEY,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {ok:true,dryRun,receipt};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}

// Invoke only after the fixed production deployment is verified.
export async function restoreAfterTerritoryFix(client,{dryRun=false}={}){
 await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
 const q=async(s,v=[])=>(await client.query(s,v)).rows;
 try{
  await client.query("SET LOCAL lock_timeout='5s'");
  const prior=(await q('SELECT value FROM app_meta WHERE key=$1',[RESTORE_KEY]))[0];if(prior){await client.query('ROLLBACK');return {ok:true,replayed:true,receipt:JSON.parse(prior.value)}}
  const recovery=JSON.parse((await q('SELECT value FROM app_meta WHERE key=$1',[RECOVERY_KEY]))[0]?.value||'null');check(recovery?.status==='COMPLETED','Recovery incomplete');
  const containment=JSON.parse((await q('SELECT value FROM app_meta WHERE key=$1',['ops_pig_coin_territory_containment_20260915_v1']))[0]?.value||'null');check(containment?.status==='COMPLETED','Containment record missing');
  const boundary=JSON.parse((await q('SELECT value FROM app_meta WHERE key=$1',[RELEASE_KEY]))[0]?.value||'null');check(boundary?.firstRoundId===FIRST_ROUND,'Boundary changed');
  const raw=(await q('SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[POLICY]))[0].value,before=JSON.parse(raw);check(JSON.stringify(before)===JSON.stringify(recovery.afterPolicy),'CMS changed since containment');
  const next=structuredClone(before);next.revision++;next.salesEnabled=containment.before.salesEnabled;next.sources.find(s=>s.code==='TERRITORY').enabled=containment.before.sources.find(s=>s.code==='TERRITORY').enabled;
  await q('UPDATE app_meta SET value=$2,updated_at=sqlite_now() WHERE key=$1',[POLICY,JSON.stringify(next)]);
  const receipt={operationKey:RESTORE_KEY,status:'COMPLETED',actor:'CODEX_OPERATIONS',reason:'회수 및 지난 회차 소급 지급 차단 운영 배포 검증 후 기존 판매·지급 설정 복구',completedAt:new Date().toISOString(),before,after:next};
  const owner=(await q("SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"))[0];check(owner,'Audit owner missing');
  const logs=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'PIG_COIN_RECOVERY_RESTORE','APP_META',RESTORE_KEY,raw,JSON.stringify(receipt)]);check(logs.length===1,'Audit missing');receipt.auditId=String(logs[0].id);
  await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,sqlite_now())',[RESTORE_KEY,JSON.stringify(receipt)]);
  await client.query(dryRun?'ROLLBACK':'COMMIT');return {ok:true,dryRun,receipt};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
}
