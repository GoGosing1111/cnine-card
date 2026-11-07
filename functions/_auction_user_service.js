import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {jointInventoryChange} from './_joint_transactions.js';
import {auctionAssetDebit,auctionAssetCredit,auctionCanReceive,auctionRowLock} from './_auction_user_assets.js';
import {AUCTION_USER_POLICY_KEY,AUCTION_TICKET,AUCTION_DURATION_MS,AUCTION_MAX_BID,AUCTION_USER_DRAFT,auctionProceeds} from '../shared/auction-user-policy-v1.mjs';
import {readAuctionPolicy,auctionAssetBlocked} from './_auction_user_policy.js';
import {readAuctionBgmGuide,prepareAuctionBgmBid,readCommittedAuctionBgm,readAuctionBgmEvents} from './_auction_user_bgm.js';

export const AUCTION_USER_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS auction_user_card_growth_v1(user_id BIGINT NOT NULL,card_id TEXT NOT NULL,PRIMARY KEY(user_id,card_id))`,
 `CREATE TABLE IF NOT EXISTS auction_user_clock_v1(id BIGINT PRIMARY KEY CHECK(id=1),version BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS auction_user_lots_v1(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,input_json TEXT NOT NULL,seller_id BIGINT NOT NULL,seller_name TEXT NOT NULL,asset_json TEXT NOT NULL,start_price BIGINT NOT NULL,status TEXT NOT NULL CHECK(status IN('QUEUED','ACTIVE','SOLD','UNSOLD','CANCELLED')),queue_order BIGINT NOT NULL UNIQUE,created_ms BIGINT NOT NULL,started_ms BIGINT,ends_ms BIGINT,winner_id BIGINT,winning_bid BIGINT NOT NULL DEFAULT 0,fee BIGINT NOT NULL DEFAULT 0,net BIGINT NOT NULL DEFAULT 0,settled_ms BIGINT)`,
 `CREATE UNIQUE INDEX IF NOT EXISTS auction_user_one_active_v1 ON auction_user_lots_v1(status) WHERE status='ACTIVE'`,
 `CREATE INDEX IF NOT EXISTS auction_user_queue_v1 ON auction_user_lots_v1(status,queue_order)`,
 `CREATE TABLE IF NOT EXISTS auction_user_bidders_v1(lot_id TEXT NOT NULL,user_id BIGINT NOT NULL,nickname TEXT NOT NULL,total BIGINT NOT NULL,last_ms BIGINT NOT NULL,PRIMARY KEY(lot_id,user_id))`,
 `CREATE TABLE IF NOT EXISTS auction_user_bid_receipts_v1(request_id TEXT PRIMARY KEY,lot_id TEXT NOT NULL,user_id BIGINT NOT NULL,amount BIGINT NOT NULL,created_ms BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS auction_user_settlements_v1(lot_id TEXT PRIMARY KEY,seller_id BIGINT NOT NULL,recipient_id BIGINT NOT NULL,asset_json TEXT NOT NULL,gross BIGINT NOT NULL,fee BIGINT NOT NULL,net BIGINT NOT NULL,kind TEXT NOT NULL,created_ms BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS auction_user_notices_v1(lot_id TEXT NOT NULL,user_id BIGINT NOT NULL,claimed_ms BIGINT NOT NULL,PRIMARY KEY(lot_id,user_id))`,
 `CREATE TABLE IF NOT EXISTS auction_user_returns_v1(lot_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,asset_json TEXT NOT NULL,created_ms BIGINT NOT NULL,claimed_ms BIGINT)`,
 `CREATE TABLE IF NOT EXISTS auction_user_bgm_events_v1(id TEXT PRIMARY KEY,sequence BIGINT NOT NULL UNIQUE,request_id TEXT NOT NULL UNIQUE,lot_id TEXT NOT NULL,user_id BIGINT NOT NULL,nickname TEXT NOT NULL,amount BIGINT NOT NULL,message TEXT NOT NULL,bgm_url TEXT NOT NULL,duration_seconds BIGINT NOT NULL,starts_ms BIGINT NOT NULL,ends_ms BIGINT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS auction_user_transfers_v1(lot_id TEXT PRIMARY KEY,kind TEXT NOT NULL,ref TEXT NOT NULL,seller_id BIGINT NOT NULL,buyer_id BIGINT NOT NULL,quantity BIGINT NOT NULL,provenance_json TEXT NOT NULL,created_ms BIGINT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS auction_user_transfer_owner_v1 ON auction_user_transfers_v1(buyer_id,kind,ref)`,
 `CREATE INDEX IF NOT EXISTS auction_user_bgm_poll_v1 ON auction_user_bgm_events_v1(lot_id,sequence)`
];
// Explicit staging entry point, never called merely by opening a production page.
export async function prepareUserAuctionSchema(env){
 if(env.DB.execSchema)await env.DB.execSchema(AUCTION_USER_SCHEMA);else await env.DB.batch(AUCTION_USER_SCHEMA.map(s=>env.DB.prepare(s)));
 await ensureJointAtomicSchema(env);
 await env.DB.prepare('INSERT OR IGNORE INTO auction_user_clock_v1(id,version) VALUES(1,0)').run();
}
const fail=(message,status=409,code='AUCTION_CONFLICT')=>{throw Object.assign(Error(message),{status,code})};
const validRequest=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(value))fail('요청 번호를 확인하세요.',400);return value;};
const publicAsset=({kind,ref,name,image,quantity})=>({kind,ref,name,image,quantity});
const publicLot=row=>row?{id:row.id,sellerId:Number(row.seller_id),sellerName:row.seller_name,asset:publicAsset(JSON.parse(row.asset_json)),sourceKind:JSON.parse(row.asset_json).sourceKind||'USER',startPrice:Number(row.start_price),status:row.status,queueOrder:Number(row.queue_order),startedMs:row.started_ms==null?null:Number(row.started_ms),endsMs:row.ends_ms==null?null:Number(row.ends_ms),winnerId:row.winner_id==null?null:Number(row.winner_id),winningBid:Number(row.winning_bid),fee:Number(row.fee),net:Number(row.net)}:null;

// catalog must resolve an authenticated user's current owned, tradeable assets.
// Keeping it injected makes the preparation executable without any live API/DB.
// Production activation requires its audited catalog/access bridge, the existing
// shared account lock, legacy-auction drain, schema and account-sync hooks.
export function createUserAuctionService(env,{catalog,operatorCatalog=async()=>[],now=Date.now,legacyActive=async()=>false,afterCommit=async()=>{},withUserLocks=async(ids,work)=>work(),settlementAccounting=async()=>({statements:[],reason:''}),hostGuards=async()=>[]}){
 const DB=env.DB,p=(sql,...v)=>DB.prepare(sql).bind(...v);
 const version=async()=>Number((await p('SELECT version FROM auction_user_clock_v1 WHERE id=1').first()).version);
 const lot=id=>p('SELECT * FROM auction_user_lots_v1 WHERE id=?',String(id)).first();
 const policy=async()=>(await readAuctionPolicy(env)).policy;
 async function commit(expected,statements,users=[]){
  const token=crypto.randomUUID();
  const ids=[...new Set(users)].map(Number).sort((a,b)=>a-b);
  try{await withUserLocks(ids,()=>DB.batch([...auctionRowLock(DB,'SELECT id FROM auction_user_clock_v1 WHERE id=1'),jointGuard(DB,token,'EXISTS(SELECT 1 FROM auction_user_clock_v1 WHERE id=1 AND version=?)',[expected]),...(ids.length?auctionRowLock(DB,`SELECT id FROM users WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`,...ids):[]),p('UPDATE auction_user_clock_v1 SET version=version+1 WHERE id=1'),...statements,jointGuardEnd(DB,token)]));}
  catch(error){if(/CHECK|constraint|verified/i.test(error.message))fail('보유 물품이나 경매 상태가 바뀌었습니다. 새로고침 후 다시 시도하세요.');throw error;}
  // A notification failure must never turn a committed trade into a retry debit.
  try{await afterCommit([...new Set(users)]);}catch{/* durable account-sync triggers remain authoritative */}
 }
 const creditCoin=(uid,amount,reason)=>amount?[p('UPDATE users SET coin=coin+CAST(? AS BIGINT) WHERE id=?',amount,uid),p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',amount,reason,uid)]:[];
 async function tick(){
  const expected=await version(),active=await p("SELECT * FROM auction_user_lots_v1 WHERE status='ACTIVE'").first(),at=now();
  if(active&&Number(active.ends_ms)>at)return;
  const next=await p("SELECT * FROM auction_user_lots_v1 WHERE status='QUEUED' ORDER BY queue_order LIMIT 1").first();
  const statements=[],changed=[];
  if(active){
   const asset=JSON.parse(active.asset_json),bidders=(await p('SELECT * FROM auction_user_bidders_v1 WHERE lot_id=? ORDER BY total DESC,last_ms,user_id',active.id).all()).results;
   let winner=null;for(const b of bidders)if(Number(b.total)>=Number(active.start_price)&&await auctionCanReceive(env,Number(b.user_id),asset)){winner=b;break;}
   const recipient=Number(winner?.user_id||active.seller_id),system=asset.sourceKind==='SYSTEM',money=system?{gross:Number(winner?.total||0),fee:0,net:0}:auctionProceeds(Number(winner?.total||0));
   const accounting=await settlementAccounting(env,active,winner,money);statements.push(...accounting.statements);
   if(!winner&&system){}
   else if(!winner&&!await auctionCanReceive(env,recipient,asset))statements.push(p('INSERT INTO auction_user_returns_v1(lot_id,user_id,asset_json,created_ms) VALUES(?,?,?,?)',active.id,recipient,active.asset_json,at));
   else statements.push(...await auctionAssetCredit(env,recipient,asset,active.id));changed.push(recipient,Number(active.seller_id));
   for(const b of bidders)if(!winner||Number(b.user_id)!==Number(winner.user_id)){statements.push(...creditCoin(b.user_id,Number(b.total),`경매 U${active.id} 유찰·차순위 환급`));changed.push(Number(b.user_id));}
   if(winner){if(!system)statements.push(...creditCoin(active.seller_id,money.net,accounting.reason||`유저 경매 ${active.id} 판매 정산 (수수료 20%)`));
    statements.push(p('INSERT INTO auction_user_transfers_v1(lot_id,kind,ref,seller_id,buyer_id,quantity,provenance_json,created_ms) VALUES(?,?,?,?,?,?,?,?)',active.id,asset.kind,asset.ref,active.seller_id,winner.user_id,asset.quantity,JSON.stringify(asset.provenance||{}),at));}
   statements.push(p('INSERT INTO auction_user_settlements_v1(lot_id,seller_id,recipient_id,asset_json,gross,fee,net,kind,created_ms) VALUES(?,?,?,?,?,?,?,?,?)',active.id,active.seller_id,recipient,active.asset_json,money.gross,money.fee,money.net,winner?'SOLD':'UNSOLD',at),p('UPDATE auction_user_lots_v1 SET status=?,winner_id=?,winning_bid=?,fee=?,net=?,settled_ms=? WHERE id=?',winner?'SOLD':'UNSOLD',winner?.user_id??null,money.gross,money.fee,money.net,at,active.id));
  }
  if(next&&!await legacyActive())statements.push(p("UPDATE auction_user_lots_v1 SET status='ACTIVE',started_ms=?,ends_ms=? WHERE id=? AND status='QUEUED'",at,at+AUCTION_DURATION_MS,next.id));
  if(statements.length)await commit(expected,statements,changed);
 }
 async function host(user,body,{system=false}={}){
  if(system&&user.role!=='OWNER')fail('운영자만 운영 경매를 개최할 수 있습니다.',403);
  const requestId=validRequest(body.requestId),input=JSON.stringify({kind:body.kind,ref:String(body.ref),quantity:Number(body.quantity),startPrice:Number(body.startPrice),...(system?{sourceKind:'SYSTEM'}:{})});
  const prior=await p('SELECT * FROM auction_user_lots_v1 WHERE request_id=?',requestId).first();
  if(prior){if(Number(prior.seller_id)!==Number(user.id)||prior.input_json!==input)fail('이미 다른 내용으로 사용된 요청 번호입니다.');return {ok:true,replayed:true,lot:publicLot(prior)};}
  const saved=await readAuctionPolicy(env);if((system?saved.policy.operatorEnabled:saved.policy.enabled)!==true)fail('경매 개최가 일시 중지되어 있습니다.',423,'AUCTION_CLOSED');
  const startPrice=Number(body.startPrice);if(!Number.isSafeInteger(startPrice)||startPrice<1||startPrice>AUCTION_MAX_BID)fail('시작가는 1~100조 코인 사이의 정수로 입력하세요.',400);
  await tick();const expected=await version(),id=crypto.randomUUID(),at=now();
  const definition=(await(system?operatorCatalog(user):catalog(user))).find(x=>x.kind===body.kind&&String(x.ref)===String(body.ref));
  if(!definition||auctionAssetBlocked(saved.policy,definition))fail('경매에 등록할 수 없는 품목입니다.');
  const quantity=Number(body.quantity);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1e10)fail('판매 수량을 확인하세요.',400);
  let prepared;if(system){if(!definition.systemEligible||(['EQUIPMENT','VEHICLE'].includes(definition.kind)&&quantity!==1))fail('운영 경매 물품과 수량을 확인하세요.');prepared={asset:{kind:definition.kind,ref:String(definition.ref),policyRef:definition.policyRef,name:definition.name,image:definition.image||'',quantity,sourceKind:'SYSTEM',provenance:{source:'OPERATOR_CATALOG',operatorId:Number(user.id)}},statements:[]};}
  else prepared=await auctionAssetDebit(env,Number(user.id),definition,quantity,id);
  const {asset,statements}=prepared,policyToken=crypto.randomUUID();
  statements.push(...auctionRowLock(DB,'SELECT key FROM app_meta WHERE key=?',AUCTION_USER_POLICY_KEY),jointGuard(DB,policyToken,saved.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',saved.raw===null?[AUCTION_USER_POLICY_KEY]:[AUCTION_USER_POLICY_KEY,saved.raw]),jointGuardEnd(DB,policyToken));
  statements.push(...await hostGuards(user,definition,quantity));
  const running=!!await p("SELECT id FROM auction_user_lots_v1 WHERE status IN ('ACTIVE','QUEUED') LIMIT 1").first()||await legacyActive();
  const status=running?'QUEUED':'ACTIVE';
  if(!system)statements.push(...auctionRowLock(DB,'SELECT user_id FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,AUCTION_TICKET),...jointInventoryChange(DB,user.id,AUCTION_TICKET,-1,'AUCTION_HOST',id));
  statements.push(p('INSERT INTO auction_user_lots_v1(id,request_id,input_json,seller_id,seller_name,asset_json,start_price,status,queue_order,created_ms,started_ms,ends_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,requestId,input,user.id,user.nickname,JSON.stringify(asset),startPrice,status,expected+1,at,running?null:at,running?null:at+AUCTION_DURATION_MS));
  if(system)statements.push(p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'AUCTION_OPERATOR_HOST','AUCTION',id,null,JSON.stringify({asset,startPrice,status})));
  await commit(expected,statements,[Number(user.id)]);return {ok:true,replayed:false,lot:publicLot(await lot(id))};
 }
 async function bid(user,body){
  const requestId=validRequest(body.requestId),amount=Number(body.amount),id=String(body.lotId);
  if(!Number.isSafeInteger(amount)||amount<1||amount>AUCTION_MAX_BID)fail('추가 입찰액은 1~100조 사이의 정수로 입력하세요.',400);
  const prior=await p('SELECT * FROM auction_user_bid_receipts_v1 WHERE request_id=?',requestId).first();
  if(prior){if(prior.lot_id!==id||Number(prior.user_id)!==Number(user.id)||Number(prior.amount)!==amount)fail('이미 다른 내용으로 사용된 요청 번호입니다.');return {ok:true,replayed:true,bgm:await readCommittedAuctionBgm(env,requestId),serverNow:now()};}
  await tick();const expected=await version(),a=await lot(id),at=now();
  if(!a||a.status!=='ACTIVE'||Number(a.ends_ms)<=at)fail('현재 입찰 가능한 경매가 아닙니다.');
  if(Number(a.seller_id)===Number(user.id))fail('본인이 판매하는 물품에는 입찰할 수 없습니다.');
  if(!await auctionCanReceive(env,user.id,JSON.parse(a.asset_json)))fail('이미 보유한 이동수단에는 입찰할 수 없습니다.');
  const mine=await p('SELECT total FROM auction_user_bidders_v1 WHERE lot_id=? AND user_id=?',id,user.id).first();
  if(!Number.isSafeInteger(Number(mine?.total||0)+amount))fail('정확하게 처리할 수 있는 누적 입찰 범위를 초과했습니다.');
  const token=crypto.randomUUID(),{statements:bgm,slot}=await prepareAuctionBgmBid(env,{lotId:id,lotEndsMs:a.ends_ms,user,amount,requestId,message:body.message,at,sequence:expected+1});
  await commit(expected,[jointGuard(DB,token,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=?)',[user.id,amount]),p('UPDATE users SET coin=coin-CAST(? AS BIGINT) WHERE id=? AND coin>=?',amount,user.id,amount),p('INSERT INTO auction_user_bidders_v1(lot_id,user_id,nickname,total,last_ms) VALUES(?,?,?,?,?) ON CONFLICT(lot_id,user_id) DO UPDATE SET total=auction_user_bidders_v1.total+excluded.total,last_ms=excluded.last_ms,nickname=excluded.nickname',id,user.id,user.nickname,amount,at),p('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',-amount,`경매 U${id} 누적 입찰`,user.id),p('INSERT INTO auction_user_bid_receipts_v1(request_id,lot_id,user_id,amount,created_ms) VALUES(?,?,?,?,?)',requestId,id,user.id,amount,at),...bgm,jointGuardEnd(DB,token)],[Number(user.id)]);
  return {ok:true,replayed:false,bgm:slot,serverNow:now()};
 }
 async function cancel(user,id,{operator=false}={}){
  if(operator&&user.role!=='OWNER')fail('운영자 권한이 필요합니다.',403);
  const expected=await version(),a=await lot(id);if(!a||(!operator&&Number(a.seller_id)!==Number(user.id)))fail('내 예약 경매를 찾을 수 없습니다.',404);
  if(a.status==='CANCELLED')return {ok:true,replayed:true};if(a.status!=='QUEUED')fail('시작 전 예약 경매만 취소할 수 있습니다.');
  const asset=JSON.parse(a.asset_json),owner=Number(a.seller_id),system=asset.sourceKind==='SYSTEM',statements=system?[]:await auctionCanReceive(env,owner,asset)?await auctionAssetCredit(env,owner,asset,a.id):[p('INSERT INTO auction_user_returns_v1(lot_id,user_id,asset_json,created_ms) VALUES(?,?,?,?)',a.id,owner,a.asset_json,now())];
  if(!system)statements.push(...await auctionAssetCredit(env,owner,{kind:'ITEM',ref:AUCTION_TICKET,quantity:1},a.id));
  statements.push(p("UPDATE auction_user_lots_v1 SET status='CANCELLED',settled_ms=? WHERE id=?",now(),a.id),p("INSERT INTO auction_user_settlements_v1(lot_id,seller_id,recipient_id,asset_json,gross,fee,net,kind,created_ms) VALUES(?,?,?,?,0,0,0,'CANCELLED',?)",a.id,owner,owner,a.asset_json,now()));
  if(operator)statements.push(p('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',user.id,'AUCTION_OPERATOR_CANCEL','AUCTION',a.id,JSON.stringify({status:a.status}),JSON.stringify({status:'CANCELLED'})));
  await commit(expected,statements,[owner]);return {ok:true};
 }
 async function state(user){
  await tick();const active=await p("SELECT * FROM auction_user_lots_v1 WHERE status='ACTIVE'").first();
  const [queue,history,bidders,tickets,wallet,rules]=await Promise.all([p("SELECT * FROM auction_user_lots_v1 WHERE status='QUEUED' ORDER BY queue_order LIMIT 50").all(),p("SELECT * FROM auction_user_lots_v1 WHERE status IN ('SOLD','UNSOLD','CANCELLED') ORDER BY settled_ms DESC LIMIT 20").all(),active?p('SELECT user_id,nickname,total FROM auction_user_bidders_v1 WHERE lot_id=? ORDER BY total DESC,last_ms,user_id',active.id).all():{results:[]},p('SELECT quantity FROM cnine_user_inventory WHERE user_id=? AND item_code=?',user.id,AUCTION_TICKET).first(),p('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=?',user.id).first(),policy()]);
  const returns=(await p('SELECT lot_id,asset_json FROM auction_user_returns_v1 WHERE user_id=? AND claimed_ms IS NULL',user.id).all()).results.map(r=>({lotId:r.lot_id,asset:publicAsset(JSON.parse(r.asset_json))}));
  return {enabled:rules.enabled===true,active:publicLot(active),queue:queue.results.map(publicLot),history:history.results.map(publicLot),bidders:bidders.results.map(x=>({...x,user_id:Number(x.user_id),total:Number(x.total)})),returns,tickets:Number(tickets?.quantity||0),coin:wallet?.coin||'0',bgmGuide:await readAuctionBgmGuide(env),serverNow:now(),userId:Number(user.id),legacyActive:await legacyActive()};
 }
 async function claimNotice(user,id){
  const result=await p("INSERT OR IGNORE INTO auction_user_notices_v1(lot_id,user_id,claimed_ms) SELECT id,?,? FROM auction_user_lots_v1 WHERE id=? AND status='ACTIVE' AND started_ms<=? AND ends_ms>?",user.id,now(),id,now(),now()).run();
  return {show:Number(result?.meta?.changes||0)===1};
 }
 async function claimReturn(user,id){const expected=await version(),r=await p('SELECT * FROM auction_user_returns_v1 WHERE lot_id=? AND user_id=?',id,user.id).first();if(!r)fail('반환 대기 물품을 찾을 수 없습니다.',404);if(r.claimed_ms!==null)return {ok:true,replayed:true};const asset=JSON.parse(r.asset_json);if(!await auctionCanReceive(env,user.id,asset))fail('같은 이동수단을 보유하고 있어 안전 보관 중입니다. 기존 보유분을 정리한 뒤 수령하세요.');await commit(expected,[...await auctionAssetCredit(env,user.id,asset,id),p('UPDATE auction_user_returns_v1 SET claimed_ms=? WHERE lot_id=?',now(),id)],[Number(user.id)]);return {ok:true};}
 const bgmEvents=body=>readAuctionBgmEvents(env,{lotId:body.lotId,after:body.after,at:now()});
 const activeLot=async()=>publicLot(await p("SELECT * FROM auction_user_lots_v1 WHERE status='ACTIVE'").first());
 return {host,bid,cancel,state,tick,claimNotice,claimReturn,catalog,bgmEvents,activeLot};
}
