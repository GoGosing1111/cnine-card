import assert from 'node:assert/strict';
import manifest from './aizen-ohseunghwan-plus15-20261007.targets.json' with {type:'json'};
export const OPERATION_KEY='ops:aizen-ohseunghwan-plus15:20261007:v1';
export const CARD=Object.freeze({id:'CN-47AD4B47B6A7452C',title:'아이젠 족스케',grade:'FUR'});
export const TARGETS=Object.freeze(manifest.targets.map(Object.freeze));
export const EXCLUDED=Object.freeze(manifest.excluded.map(Object.freeze));
const ids=TARGETS.map(t=>t.id);
assert.equal(ids.length,1);assert.equal(new Set(ids).size,1);
assert.ok(EXCLUDED.every(e=>!ids.includes(e.id)));
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const numeric=row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,['user_id','quantity','breakthrough_level','breakthrough_fail_count'].includes(k)?Number(v):v]));
const holdingSql='SELECT * FROM user_cards WHERE user_id=ANY($1::bigint[]) AND card_id=$2 ORDER BY user_id';
const walletSql='SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id';
const starsSql="SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code='MASTER_STAR' ORDER BY user_id";

export async function inspectUpgrade(q){
 const users=await q(walletSql,[ids]),holdings=await q(holdingSql,[ids,CARD.id]);
 assert.deepEqual(users.map(u=>({id:Number(u.id),nickname:u.nickname})),TARGETS.map(t=>({id:t.id,nickname:t.nickname})),'Target identity changed');
 assert.ok(users.every(u=>u.status==='ACTIVE'),'Inactive target');
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,holdings,stars:await q(starsSql,[ids]),receipt:saved?parse(saved.value):null};
}

// Caller holds all target USER_LOCKs and one PostgreSQL transaction. This is
// an upgrade of existing holdings, never an item grant or enhancement charge.
export async function upgradeCards(q){
 const [day]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') kst");
 assert.equal(day.kst,'2026-10-07','One-time operation expired');
 await q(holdingSql+' FOR UPDATE NOWAIT',[ids,CARD.id]);
 await q(walletSql+' FOR UPDATE NOWAIT',[ids]);
 const before=await inspectUpgrade(q);
 if(before.receipt){const checked=await verifyUpgrade(q);return {...checked.receipt,replayed:true};}
 const [catalog]=await q('SELECT c.id,c.title,UPPER(c.rarity) grade,c.is_active,c.card_status,m.name member_name,m.is_active member_active FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id WHERE c.id=$1',[CARD.id]);
 assert.deepEqual({id:catalog?.id,title:catalog?.title,grade:catalog?.grade},CARD);
 assert.equal(catalog.member_name,'이예준');assert.equal(catalog.card_status,'PUBLIC');assert.equal(Number(catalog.is_active),1);assert.equal(Number(catalog.member_active),1);
 const [owner]=await q("SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'");assert.ok(owner,'Audit owner missing');
 assert.equal(before.holdings.length,ids.length,'Existing owned card required for every target');
 for(let i=0;i<ids.length;i++){
  const row=before.holdings[i];assert.equal(Number(row.user_id),ids[i]);assert.ok(Number(row.quantity)>0,'Existing owned card required');
  assert.ok(Number.isInteger(Number(row.breakthrough_level))&&Number(row.breakthrough_level)>=0&&Number(row.breakthrough_level)<=15,'Unexpected enhancement level');
  assert.ok(Number(row.breakthrough_fail_count)>=0,'Enhancement in progress');
 }
 const otherSql='SELECT * FROM user_cards WHERE user_id=ANY($1::bigint[]) AND card_id<>$2 ORDER BY user_id,card_id';
 const others=await q(otherSql,[ids,CARD.id]);
 const changed=before.holdings.filter(r=>Number(r.breakthrough_level)<15);
 // The fixed ID list and locked rows keep this update within the authorized
 // accounts. Already +15 holdings, copy counts and acquisition dates are intact.
 const updated=await q('UPDATE user_cards SET breakthrough_level=15,breakthrough_fail_count=0 WHERE user_id=ANY($1::bigint[]) AND card_id=$2 AND quantity>0 AND breakthrough_level<15 AND breakthrough_fail_count>=0 RETURNING user_id',[ids,CARD.id]);
 assert.deepEqual(updated.map(r=>Number(r.user_id)).sort((a,b)=>a-b),changed.map(r=>Number(r.user_id)),'Partial upgrade');
 const after=await inspectUpgrade(q);
 assert.deepEqual(after.holdings.map(numeric),before.holdings.map(r=>numeric({...r,breakthrough_level:15,breakthrough_fail_count:Number(r.breakthrough_level)<15?0:r.breakthrough_fail_count})),'Unrequested holding change');
 assert.deepEqual(after.users,before.users,'Wallet changed');assert.deepEqual(after.stars,before.stars,'Master stars changed');assert.deepEqual(await q(otherSql,[ids,CARD.id]),others,'Other cards changed');
 const now=new Date().toISOString(),recipients=[];
 for(let i=0;i<ids.length;i++){
  const t=TARGETS[i],b=before.holdings[i],a=after.holdings[i];
  const row={userId:t.id,nickname:t.nickname,inputNickname:t.inputNickname,levelBefore:Number(b.breakthrough_level),levelAfter:15,quantityBefore:Number(b.quantity),quantityAfter:Number(a.quantity),changed:Number(b.breakthrough_level)<15};
  const audit=await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[owner.id,'OPS_CARD_UPGRADE_PLUS15','USER',String(t.id),JSON.stringify({operationKey:OPERATION_KEY,card:b}),JSON.stringify({...row,operationKey:OPERATION_KEY,cardId:CARD.id,cardState:a,authorization:manifest.authorization})]);
  assert.equal(audit.length,1,'Audit missing');recipients.push({...row,adminLogId:String(audit[0].id)});
 }
 const receipt={operationKey:OPERATION_KEY,status:'COMPLETED',actor:'SYSTEM_OPS',authorization:manifest.authorization,card:CARD,recipients,accounts:ids.length,changed:changed.length,already15:ids.length-changed.length,excluded:EXCLUDED,balancesPreserved:true,otherCardsPreserved:true,noNewCopies:true,completedAt:now};
 const written=await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]);assert.equal(written.length,1,'Receipt missing');
 await verifyUpgrade(q);return {...receipt,replayed:false};
}

export async function verifyUpgrade(q){
 const state=await inspectUpgrade(q),r=state.receipt;assert.ok(r,'Receipt missing');
 assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.status,'COMPLETED');assert.equal(r.accounts,1);assert.deepEqual(r.card,CARD);
 assert.deepEqual(r.recipients.map(t=>t.userId),ids);assert.deepEqual(r.excluded,EXCLUDED);
 assert.equal(state.holdings.length,ids.length);
 for(let i=0;i<ids.length;i++){
  const h=state.holdings[i],entry=r.recipients[i];assert.equal(Number(h.user_id),ids[i]);assert.equal(Number(h.breakthrough_level),15);assert.ok(Number(h.quantity)>0);assert.equal(entry.quantityBefore,entry.quantityAfter);
 }
 const audits=await q('SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[r.recipients.map(t=>t.adminLogId)]);
 assert.equal(audits.length,ids.length);
 for(const entry of r.recipients){const a=audits.find(a=>String(a.id)===entry.adminLogId);assert.equal(a?.action_type,'OPS_CARD_UPGRADE_PLUS15');assert.equal(a.target_id,String(entry.userId));const detail=parse(a.after_data);assert.equal(detail.operationKey,OPERATION_KEY);assert.equal(detail.cardId,CARD.id);assert.equal(detail.levelAfter,15);}
 return {status:'VERIFIED',receipt:r,current:state.holdings.map(h=>({userId:Number(h.user_id),level:Number(h.breakthrough_level),quantity:Number(h.quantity)}))};
}
