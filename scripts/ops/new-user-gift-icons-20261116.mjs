import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {NEW_USER_GIFT_ICONS,NEW_USER_GIFT_CODE,NEW_USER_GIFT_COIN,NEW_USER_GIFT_DESCRIPTION,NEW_USER_GIFT_ICON_BUNDLE_VERSION,readNewUserGiftCatalog,upgradeNewUserGiftReceipt,giftTimestamp} from '../../functions/_new_user_gift.js';
export const OP='ops:new-user-gift-icons-coin1000t:20261116:since20261101:v1';
export const CUTOFF='2026-11-01T00:00:00+09:00';
export const NOTICE_TITLE='신규유저 기프트박스 보완 지급 완료';
const coinText=value=>{const n=BigInt(value),t=n/1000000000000n,e=(n%1000000000000n)/100000000n;return [t?t.toLocaleString('ko-KR')+'조':'',e?e.toLocaleString('ko-KR')+'억':''].filter(Boolean).join(' ')||'0';};
export const noticeBody=target=>`${target.nickname}님, 11월 1일 이후 신규유저 기프트박스를 수령하신 기록에 따라 보상을 추가 지급했습니다.\n\n${target.cards.length?`아이콘 1단계 ${target.cards.length}종 각 1장\n디임·하이희야·나무늘봉순·오조은·오리꿍·강구열·아윤·구수댕\n신규 카드는 +0이며 기존에 올린 강화는 유지됩니다.\n\n`:''}${BigInt(target.coinAdded)>0n?`코인 ${coinText(target.coinAdded)} 추가 지급\n기프트박스에서 이미 받은 ${coinText(target.originalGiftCoin)}을 포함해 총 1,000조입니다.\n\n`:''}카드는 보유 카드에, 코인은 지갑에 직접 반영했습니다. 이 메시지는 지급 완료 안내이며 별도로 수령할 첨부 보상은 없습니다.`;
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
export async function completed(q){const rows=await q('SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?JSON.parse(one(rows).value):null;}
export async function planIconBackfill(q,through=Date.now()){
 const rows=await q(`SELECT r.user_id::text,u.nickname,u.status AS account_status,r.status,r.issued_at,r.opened_at,r.manifest_json,r.manifest_hash,r.result_json
 FROM new_user_gift_receipts_v1 r JOIN users u ON u.id=r.user_id ORDER BY r.user_id`),upgrades=[],grants=[],skipped=[];
 for(const row of rows){
  const manifest=JSON.parse(row.manifest_json);
  if(row.status==='ISSUED'){
   if(manifest.iconBundleVersion===NEW_USER_GIFT_ICON_BUNDLE_VERSION&&manifest.coin===NEW_USER_GIFT_COIN)continue;
   assert.equal(hash(row.manifest_json),row.manifest_hash);
   upgrades.push({userId:row.user_id,nickname:row.nickname,manifestHash:row.manifest_hash});continue;
  }
  const opened=giftTimestamp(row.opened_at);
  if(row.status!=='OPENED'||!Number.isFinite(opened)||opened<Date.parse(CUTOFF)||opened>through)continue;
  const result=JSON.parse(row.result_json);assert(result.ok&&result.rewards);assert.equal(hash(row.manifest_json),row.manifest_hash);
  const received=new Set((result.rewards.icons||[]).map(c=>c.id));
  const missing=NEW_USER_GIFT_ICONS.map(c=>c.id).filter(id=>!received.has(id));
  const originalGiftCoin=BigInt(result.coin??result.rewards.coin);assert(originalGiftCoin>=0n);const coinAdded=(originalGiftCoin<BigInt(NEW_USER_GIFT_COIN)?BigInt(NEW_USER_GIFT_COIN)-originalGiftCoin:0n).toString();
  if(!missing.length&&coinAdded==='0')continue;
  if(row.account_status!=='ACTIVE'){skipped.push({userId:row.user_id,nickname:row.nickname,reason:row.account_status});continue;}
  grants.push({userId:row.user_id,nickname:row.nickname,openedAt:row.opened_at,manifestHash:row.manifest_hash,resultHash:hash(row.result_json),cardIds:missing,originalGiftCoin:originalGiftCoin.toString(),coinAdded});
 }
 return {operationKey:OP,cutoff:CUTOFF,through,upgrades,grants,skipped,cardCount:grants.reduce((n,r)=>n+r.cardIds.length,0),coinTotal:grants.reduce((n,r)=>n+BigInt(r.coinAdded),0n).toString()};
}
// The caller owns one transaction and the live account leases. Never commit here:
// failure injection, rehearsal, account snapshots and the final receipt stay atomic.
export async function applyIconBackfill(q,{plan,actorId=1,now=Date.now()}){
 const prior=await completed(q);if(prior)return {...prior,replayed:true};
 assert.equal(plan.operationKey,OP);assert.equal(plan.cutoff,CUTOFF);assert.deepEqual(await planIconBackfill(q,plan.through),plan);
 one(await q("SELECT id FROM users WHERE id=$1 AND role='OWNER' AND status='ACTIVE'",[actorId]));
 const catalog=await readNewUserGiftCatalog(q),ids=NEW_USER_GIFT_ICONS.map(c=>c.id),at=new Date(now).toISOString();
 assert.equal(catalog.icons.length,8);assert(catalog.icons.every(c=>c.level===0));
 const stock=await q('SELECT id,limited_total FROM cards WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',[ids]);assert.equal(stock.length,8);assert(stock.every(c=>c.limited_total==null));
 const upgraded=[];
 for(const target of plan.upgrades){
  const row=one(await q('SELECT * FROM new_user_gift_receipts_v1 WHERE user_id=$1 FOR UPDATE',[target.userId]));assert.equal(row.status,'ISSUED');assert.equal(row.manifest_hash,target.manifestHash);
  const before=JSON.parse(row.manifest_json),after=await upgradeNewUserGiftReceipt(q,row,catalog);
  assert.equal(after.iconBundleVersion,1);assert.equal(after.icons.length,8);
  assert.equal(after.coin,NEW_USER_GIFT_COIN);
  if(before.version===4)for(const key of ['cardLevels','cards','magic','magicLevel','equipment','delivery','messageId','rewardId'])assert.deepEqual(after[key],before[key]);
  upgraded.push({...target,afterHash:row.manifest_hash,icons:after.icons.map(c=>c.id),coinBefore:before.coin,coinAfter:after.coin});
 }
 const grantUsers=plan.grants.map(g=>g.userId);
 const before=grantUsers.length?await q('SELECT user_id::text,card_id,quantity::text,breakthrough_level,breakthrough_fail_count FROM user_cards WHERE user_id=ANY($1::bigint[]) AND card_id=ANY($2::text[]) ORDER BY user_id,card_id FOR UPDATE',[grantUsers,ids]):[];
 const pairs=plan.grants.flatMap(g=>g.cardIds.map(id=>({userId:g.userId,cardId:id})));
 let after=[];
 if(pairs.length)after=await q(`INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level,breakthrough_fail_count,last_obtained_at)
 SELECT reward.user_id,reward.card_id,1,0,0,$3 FROM unnest($1::bigint[],$2::text[]) AS reward(user_id,card_id)
 ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=GREATEST(user_cards.quantity,0)+1,
 breakthrough_level=CASE WHEN user_cards.quantity<=0 THEN 0 ELSE user_cards.breakthrough_level END,
 breakthrough_fail_count=CASE WHEN user_cards.quantity<=0 THEN 0 ELSE user_cards.breakthrough_fail_count END,
 last_obtained_at=EXCLUDED.last_obtained_at
 RETURNING user_id::text,card_id,quantity::text,breakthrough_level,breakthrough_fail_count`,[pairs.map(p=>p.userId),pairs.map(p=>p.cardId),at]);
 assert.equal(after.length,pairs.length);
 const walletBefore=grantUsers.length?await q('SELECT id::text,coin::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[grantUsers]):[];
 const money=plan.grants.filter(g=>BigInt(g.coinAdded)>0n);
 const walletAfter=money.length?await q(`UPDATE users u SET coin=u.coin+r.amount FROM unnest($1::bigint[],$2::bigint[]) r(user_id,amount)
 WHERE u.id=r.user_id AND u.status='ACTIVE' RETURNING u.id::text,u.coin::text`,[money.map(g=>g.userId),money.map(g=>g.coinAdded)]):[];
 assert.equal(walletAfter.length,money.length);
 const accounts=[];
 for(const target of plan.grants){
  const receipt=one(await q('SELECT status,manifest_hash,result_json FROM new_user_gift_receipts_v1 WHERE user_id=$1 FOR UPDATE',[target.userId]));
  assert.equal(receipt.status,'OPENED');assert.equal(receipt.manifest_hash,target.manifestHash);assert.equal(hash(receipt.result_json),target.resultHash);
  const cards=target.cardIds.map(id=>{
   const old=before.find(c=>c.user_id===target.userId&&c.card_id===id),next=one(after.filter(c=>c.user_id===target.userId&&c.card_id===id));
   assert.equal(BigInt(next.quantity),BigInt(old?.quantity||0)>0n?BigInt(old.quantity)+1n:1n);
   assert.equal(Number(next.breakthrough_level),Number(old?.quantity)>0?Number(old.breakthrough_level):0);
   assert.equal(Number(next.breakthrough_fail_count||0),Number(old?.quantity)>0?Number(old.breakthrough_fail_count||0):0);
   return {cardId:id,before:old?.quantity||'0',after:next.quantity,levelBefore:Number(old?.breakthrough_level||0),levelAfter:Number(next.breakthrough_level),failCountBefore:Number(old?.breakthrough_fail_count||0),failCountAfter:Number(next.breakthrough_fail_count||0)};
  });
  const walletOld=one(walletBefore.filter(r=>r.id===target.userId)),walletNew=BigInt(target.coinAdded)>0n?one(walletAfter.filter(r=>r.id===target.userId)):walletOld;
  assert.equal(BigInt(walletNew.coin),BigInt(walletOld.coin)+BigInt(target.coinAdded));
  const result={operationKey:OP,userId:target.userId,nickname:target.nickname,source:'NEW_USER_GIFT_ICON_BACKFILL',openedAt:target.openedAt,cards,originalGiftCoin:target.originalGiftCoin,coinAdded:target.coinAdded,walletBefore:walletOld.coin,walletAfter:walletNew.coin,completedAt:at,messagesSent:1};
  if(BigInt(target.coinAdded)>0n)result.coinLogId=String(one(await q('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id) VALUES($1,$2,$3,$4,$5) RETURNING id',[target.userId,target.coinAdded,walletNew.coin,'신규유저 기프트박스 1,000조 구성 변경 차액 · '+OP,actorId])).id);
  result.messageId=String(one(await q("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) VALUES($1,'ADMIN',$2,$3,'SYSTEM',$4) RETURNING id",[target.userId,NOTICE_TITLE,noticeBody(result),OP])).id);
  result.auditId=String(one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'NEW_USER_GIFT_ICON_BACKFILL','USER',$2,$3,$4) RETURNING id",[actorId,target.userId,JSON.stringify({manifestHash:target.manifestHash,resultHash:target.resultHash}),JSON.stringify(result)])).id);
  one(await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP+':'+target.userId,JSON.stringify(result),at]));accounts.push(result);
 }
 const item=one(await q('SELECT description,is_active FROM inventory_items WHERE code=$1 FOR UPDATE',[NEW_USER_GIFT_CODE]));
 await q('UPDATE inventory_items SET description=$2 WHERE code=$1 AND description IS DISTINCT FROM $2',[NEW_USER_GIFT_CODE,NEW_USER_GIFT_DESCRIPTION]);
 const result={status:'COMPLETED',operationKey:OP,planHash:hash(plan),cutoff:CUTOFF,through:plan.through,completedAt:at,upgraded,accounts,recipientCount:accounts.length,cardCount:after.length,coinTotal:plan.coinTotal,skipped:plan.skipped,itemActivePreserved:Number(item.is_active),messagesSent:accounts.length,boxesIssued:0,boxesOpened:0};
 result.auditId=String(one(await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'NEW_USER_GIFT_ICON_CONTENTS','INVENTORY_ITEM',$2,$3,$4) RETURNING id",[actorId,NEW_USER_GIFT_CODE,JSON.stringify({description:item.description}),JSON.stringify(result)])).id);
 one(await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(result),at]));
 assert.deepEqual(await completed(q),result);return {...result,replayed:false};
}
