import assert from 'node:assert/strict';

export const OPERATION_KEY='ops:eumsuni-icon-bongsoon-3trillion:20261006:v1';
export const TARGET=Object.freeze({id:65,nickname:'음순이'});
export const CARDS=Object.freeze([Object.freeze({id:'CN-1C000003',title:'나무늘봉순',grade:'ICON'})]);
export const COIN_AMOUNT=3000000000000;
export const AUTHORIZATION='음순이 계정에 아이콘 나무늘봉순 지급하고 3조 지급해';
const REASON='운영자 지급 · ICON 나무늘봉순 및 코인 3조 · '+OPERATION_KEY;
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const normalize=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,['quantity','breakthrough_level','breakthrough_fail_count'].includes(k)?Number(v):v]));
const owned=s=>s.holdings.find(r=>r.card_id===CARDS[0].id);
const withoutCoin=user=>Object.fromEntries(Object.entries(user).filter(([key])=>key!=='coin'));

export async function inspectGrant(q){
 const matches=await q('SELECT id FROM users WHERE nickname=$1 ORDER BY id',[TARGET.nickname]);
 assert.equal(matches.length,1,'Nickname must identify one account');assert.equal(Number(matches[0].id),TARGET.id);
 const [user]=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=$1',[TARGET.id]);
 assert.equal(user.nickname,TARGET.nickname);assert.equal(user.status,'ACTIVE');assert.equal(user.role,'USER');
 const card=CARDS[0];
 const cards=await q("SELECT c.id,c.title,UPPER(c.rarity) AS grade,c.is_active,c.card_status,m.name AS member_name,m.is_active AS member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=$1 OR (UPPER(c.rarity)='ICON' AND m.name=$2) ORDER BY c.id",[card.id,card.title]);
 assert.equal(cards.length,1,'ICON catalog must identify one requested card');
 assert.deepEqual({id:cards[0].id,title:cards[0].title,grade:cards[0].grade},card);
 assert.equal(cards[0].member_name,card.title);assert.equal(Number(cards[0].is_active),1);assert.equal(cards[0].card_status,'PUBLIC');assert.equal(Number(cards[0].member_active),1);
 const holdings=await q('SELECT * FROM user_cards WHERE user_id=$1 ORDER BY card_id',[TARGET.id]);
 const stars=await q("SELECT quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=$1 AND item_code='MASTER_STAR'",[TARGET.id]);
 const saved=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]),receipt=saved.length?parse(saved[0].value):null;
 const audits=receipt?await q('SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]):[];
 const coinLogs=receipt?await q('SELECT id,user_id,change_amount,balance_after,reason FROM coin_logs WHERE id=$1',[receipt.coinLogId]):[];
 return {user,cards,holdings,stars,receipt,audits,coinLogs,quantities:[{cardId:card.id,title:card.title,quantity:Number(holdings.find(r=>r.card_id===card.id)?.quantity||0)}]};
}

export async function verifyGrant(q){
 const state=await inspectGrant(q),r=state.receipt,card=CARDS[0];assert.ok(r,'Grant receipt missing');
 for(const [key,val] of Object.entries({status:'COMPLETED',operationKey:OPERATION_KEY,userId:TARGET.id,nickname:TARGET.nickname,permanent:true,totalGranted:1,coinAmount:COIN_AMOUNT,authorization:AUTHORIZATION}))assert.equal(r[key],val);
 assert.equal(r.cards.length,1);const gift=r.cards[0];
 assert.deepEqual({id:gift.cardId,title:gift.cardTitle,grade:gift.grade},card);assert.equal(gift.quantity,1);assert.equal(gift.quantityAfter,gift.quantityBefore+1);
 assert.equal(BigInt(r.coinAfter)-BigInt(r.coinBefore),BigInt(COIN_AMOUNT));
 assert.equal(state.coinLogs.length,1);const [log]=state.coinLogs;
 assert.equal(Number(log.user_id),TARGET.id);assert.equal(BigInt(log.change_amount),BigInt(COIN_AMOUNT));assert.equal(BigInt(log.balance_after),BigInt(r.coinAfter));assert.equal(log.reason,REASON);
 assert.equal(state.audits.length,1);const [audit]=state.audits;
 assert.equal(audit.action_type,'OPS_CARD_COIN_GRANT');assert.equal(audit.target_id,String(TARGET.id));
 const {adminLogId,...audited}=r;assert.deepEqual(parse(audit.after_data),audited,'Audit receipt differs');
 // Current balances may change through legitimate gameplay after the committed grant.
 return {status:'VERIFIED',receipt:r,currentHoldings:state.quantities.map(g=>({...g,level:Number(owned(state)?.breakthrough_level||0)})),currentCoin:String(state.user.coin),auditCount:1,coinLogCount:1};
}

// Explicit one-time addition. Caller holds production USER_LOCK and one PostgreSQL
// transaction for the card, wallet, coin ledger, audit and idempotency receipt.
export async function grantCard(q){
 const [day]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(day.kst,'2026-10-06','One-time operation expired');
 assert.equal((await q('SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id])).length,1);
 const before=await inspectGrant(q);
 if(before.receipt){const verified=await verifyGrant(q);return {...verified.receipt,replayed:true};}
 const [operator]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(operator,'Audit owner unavailable');
 const coinBefore=BigInt(before.user.coin),coinAfter=coinBefore+BigInt(COIN_AMOUNT);
 assert.ok(coinBefore>=0n&&coinAfter<=BigInt(Number.MAX_SAFE_INTEGER),'Coin balance exceeds the supported exact range');
 const previous=owned(before),quantity=Number(previous?.quantity||0),card=CARDS[0],now=new Date().toISOString();
 assert.ok(Number.isSafeInteger(quantity)&&quantity>=0&&quantity<Number.MAX_SAFE_INTEGER);
 const rows=await q('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,0,$3,$3) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=excluded.last_obtained_at RETURNING *',[TARGET.id,card.id,now]);
 assert.equal(rows.length,1);const [holding]=rows;assert.equal(Number(holding.quantity),quantity+1);
 assert.equal(Number(holding.breakthrough_level),Number(previous?.breakthrough_level||0));assert.equal(Number(holding.breakthrough_fail_count),Number(previous?.breakthrough_fail_count||0));
 if(previous)assert.deepEqual(normalize(holding),normalize({...previous,quantity:holding.quantity,last_obtained_at:holding.last_obtained_at}),'Unexpected holding field change');
 const credited=await q('UPDATE users SET coin=coin+$1::bigint WHERE id=$2 AND coin=$3::bigint RETURNING coin',[String(COIN_AMOUNT),TARGET.id,String(coinBefore)]);
 assert.equal(credited.length,1,'Coin credit failed');assert.equal(BigInt(credited[0].coin),coinAfter);
 const logs=await q('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,created_at) VALUES($1,$2::bigint,$3::bigint,$4,$5) RETURNING id',[TARGET.id,String(COIN_AMOUNT),String(coinAfter),REASON,now]);assert.equal(logs.length,1);
 const after=await inspectGrant(q);
 assert.equal(after.quantities[0].quantity,quantity+1);assert.equal(BigInt(after.user.coin),coinAfter);
 assert.deepEqual(withoutCoin(after.user),withoutCoin(before.user),'Other account fields changed');assert.deepEqual(after.stars,before.stars,'Master stars changed');
 const other=s=>s.holdings.filter(r=>r.card_id!==card.id);assert.deepEqual(other(after),other(before),'Other cards changed');
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,actor:'SYSTEM_OPS',authorization:AUTHORIZATION,userId:TARGET.id,nickname:TARGET.nickname,cards:[{cardId:card.id,cardTitle:card.title,grade:card.grade,quantity:1,quantityBefore:quantity,quantityAfter:Number(holding.quantity),levelAfter:Number(holding.breakthrough_level)}],totalGranted:1,permanent:true,coinAmount:COIN_AMOUNT,coinBefore:String(coinBefore),coinAfter:String(coinAfter),coinLogId:String(logs[0].id),otherBalancesPreserved:true,otherCardsPreserved:true,completedAt:now};
 const audits=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[operator.id,'OPS_CARD_COIN_GRANT','USER',String(TARGET.id),JSON.stringify({operationKey:OPERATION_KEY,holding:previous||null,coin:String(coinBefore)}),JSON.stringify(receipt)]);
 assert.equal(audits.length,1);receipt.adminLogId=String(audits[0].id);
 assert.equal((await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now])).length,1);
 await verifyGrant(q);return {...receipt,replayed:false};
}
