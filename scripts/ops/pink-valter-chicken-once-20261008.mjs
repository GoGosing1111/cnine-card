import assert from 'node:assert/strict';
import {chickenLimitedOnceKey,chickenLimitedOnceState} from '../../functions/_chicken_limited_once.js';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const OPERATION_KEY='ops:pink-valter-chicken-once:20261008:v1';
export const TARGETS=Object.freeze([{id:1,nickname:'핑크빛유두',role:'OWNER'},{id:81,nickname:'비쥬얼깡패',role:'USER'}]);
export const CODE='V-996';
const SETTINGS=['pingdu_chicken_event_v1','mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1'];
const parse=v=>JSON.parse(v);
const only=rows=>{assert.equal(rows.length,1);return rows[0];};
async function snapshot(q){
 const users=await q('SELECT id,nickname,status,role,coin,card_shards,magic_crystals FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',[TARGETS.map(t=>t.id)]);
 assert.equal(users.length,2);
 for(const target of TARGETS){const user=users.find(u=>Number(u.id)===target.id);assert.equal(user?.nickname,target.nickname);assert.equal(user?.role,target.role);assert.equal(user?.status,'ACTIVE');const matches=await q('SELECT id FROM users WHERE nickname=$1',[target.nickname]);assert.equal(matches.length,1);assert.equal(Number(matches[0].id),target.id);}
 const [saved]=await q('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 const [once]=await q('SELECT value FROM app_meta WHERE key=$1',[chickenLimitedOnceKey(81)]);
 return {users,receipt:saved?parse(saved.value):null,once:once?parse(once.value):null,
  settings:await q('SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[SETTINGS]),
  stock:await q('SELECT * FROM mercenary_limited_stock_v1 ORDER BY code'),
  cards:await q('SELECT * FROM user_mercenary_cards_v1 WHERE user_id IN (1,81) ORDER BY user_id,mercenary_code'),
  inventory:await q('SELECT * FROM cnine_user_inventory WHERE user_id IN (1,81) ORDER BY user_id,item_code'),
  loadout:await q('SELECT * FROM user_mercenary_loadout_v1 WHERE user_id IN (1,81) ORDER BY user_id'),
  growth:await q('SELECT * FROM user_mercenary_growth_v1 WHERE user_id IN (1,81) ORDER BY user_id,mercenary_code')};
}
export async function verifyValterChicken(q){
 const s=await snapshot(q),r=s.receipt;assert.ok(r,'Operation receipt missing');
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OPERATION_KEY);assert.equal(r.grant.userId,1);assert.equal(r.grant.code,CODE);assert.equal(r.grant.quantity,1);assert.equal(r.guarantee.userId,81);assert.equal(r.guarantee.code,CODE);assert.equal(r.guarantee.quantity,1);
 const card=s.cards.find(c=>Number(c.user_id)===1&&c.mercenary_code===CODE);assert.ok(Number(card?.total_copies)>=r.grant.copiesAfter);
 const issue=only(await q('SELECT * FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));assert.equal(Number(issue.user_id),1);assert.equal(issue.code,CODE);assert.equal(Number(issue.serial),r.grant.serial);
 const acquisition=only(await q('SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY]));assert.equal(Number(acquisition.user_id),1);assert.equal(acquisition.mercenary_code,CODE);assert.equal(Number(acquisition.total_copies_after),r.grant.copiesAfter);
 assert.equal(s.once?.operationId,OPERATION_KEY);assert.equal(s.once?.userId,81);assert.equal(s.once?.mercenaryCode,CODE);assert.ok(['ARMED','CONSUMED'].includes(s.once?.status));
 if(s.once.status==='CONSUMED'){const order=only(await q('SELECT result_json FROM chicken_event_receipts_v1 WHERE user_id=81 AND request_id=$1',[s.once.requestId]));const result=parse(order.result_json);assert.equal(result.grantKind,'ONE_TIME_SSS_LIMITED_GUARANTEE');assert.equal(result.reward.code,CODE);}
 const audits=await q('SELECT id,action_type,target_id,after_data FROM admin_logs WHERE id=ANY($1::bigint[]) ORDER BY id',[r.adminLogIds]);assert.equal(audits.length,2);
 assert.deepEqual(audits.map(a=>a.action_type),['OPS_LIMITED_MERCENARY_GRANT','CHICKEN_LIMITED_ONCE_ARMED']);
 assert.deepEqual(audits.map(a=>a.target_id),['1','81']);for(const a of audits)assert.equal(parse(a.after_data).operationKey,OPERATION_KEY);
 return {status:'VERIFIED',receipt:r,ownerCopies:Number(card.total_copies),guaranteeStatus:s.once.status,guaranteeRemaining:s.once.status==='ARMED'?1:0,stock:s.stock.find(x=>x.code===CODE)};
}
// Caller holds both production USER_LOCK leases and one PostgreSQL transaction.
// This explicit grant does not activate the limited pack, event or deployment.
export async function applyValterChicken(q,{releaseCommit}={}){
 assert.match(releaseCommit||'',/^[a-f0-9]{40}$/,'Verified runtime deployment required');
 assert.equal((await q('SELECT id FROM users WHERE id IN (1,81) ORDER BY id FOR UPDATE')).length,2);
 const before=await snapshot(q);
 if(before.receipt)return {...(await verifyValterChicken(q)).receipt,replayed:true};
 const [day]=await q("SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS kst");assert.equal(day.kst,'2026-10-08','One-time operation expired');
 const card=LIMITED_MERCENARIES.find(c=>c.code===CODE);assert.equal(card?.name,'발테르');assert.equal(card?.rank,'SSS');
 assert.equal(before.once,null,'Existing entitlement must not be overwritten');
 assert.equal((await q('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[OPERATION_KEY])).length,0,'Orphan acquisition');
 const stock=before.stock.find(s=>s.code===CODE);assert.equal(Number(stock?.stock_limit),7,'Expected live limit changed');assert.ok(Number(stock.issued)+2<=7,'Both authorized rewards need available stock');
 assert.equal(before.settings.length,SETTINGS.length);const pack=parse(before.settings.find(s=>s.key==='mercenary_limited_pack_v1').value);assert.equal(pack.settings.stockLimits[CODE],7);
 const owned=before.cards.find(c=>Number(c.user_id)===1&&c.mercenary_code===CODE),copiesBefore=Number(owned?.total_copies||0);if(owned)assert.equal(Number(owned.duplicate_count),copiesBefore-1);
 const now=new Date().toISOString();
 const issued=only(await q('UPDATE mercenary_limited_stock_v1 SET issued=issued+1,revision=revision+1,last_token=$2 WHERE code=$1 AND stock_limit=7 AND issued+2<=stock_limit RETURNING issued',[CODE,OPERATION_KEY]));
 const holding=only(await q(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(1,$1,1,0,$2,$2)
  ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[CODE,now]));
 assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);if(owned)assert.equal(holding.first_obtained_at,owned.first_obtained_at);
 only(await q('INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$1,1,$2,$3,$4) RETURNING acquisition_id',[OPERATION_KEY,CODE,issued.issued,now]));
 only(await q('INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[OPERATION_KEY,CODE,copiesBefore>0?1:0,holding.total_copies,holding.duplicate_count,now]));
 const once=chickenLimitedOnceState({userId:81,actorId:1,operationId:OPERATION_KEY,mercenaryCode:CODE,reason:'사용자 지정: 다음 철구네 치킨 정상 참여 1회 SSS 리미티드 확정, 이후 일반 확률 적용',now});
 only(await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[chickenLimitedOnceKey(81),JSON.stringify(once),now]));
 const after=await snapshot(q);
 for(const key of ['users','settings','inventory','loadout','growth'])assert.deepEqual(after[key],before[key],key+' changed unexpectedly');
 const other=c=>!(Number(c.user_id)===1&&c.mercenary_code===CODE);assert.deepEqual(after.cards.filter(other),before.cards.filter(other));assert.deepEqual(after.stock.filter(s=>s.code!==CODE),before.stock.filter(s=>s.code!==CODE));assert.equal(Number(after.stock.find(s=>s.code===CODE).stock_limit),7);
 const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,releaseCommit,completedAt:now,
  grant:{userId:1,nickname:'핑크빛유두',code:CODE,name:'발테르',rank:'SSS',edition:'LIMITED',quantity:1,serial:Number(issued.issued),copiesBefore,copiesAfter:Number(holding.total_copies)},
  guarantee:{userId:81,nickname:'비쥬얼깡패',code:CODE,rank:'SSS',quantity:1,status:'ARMED',nextValidParticipation:true,subsequent:'NORMAL_PROBABILITY',key:chickenLimitedOnceKey(81)},
  settingsPreserved:true,balancesPreserved:true,loadoutPreserved:true,stockLimit:7,adminLogIds:[]};
 for(const [action,id,data] of [['OPS_LIMITED_MERCENARY_GRANT',1,receipt.grant],['CHICKEN_LIMITED_ONCE_ARMED',81,once]]){
  const audit=only(await q('INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,\'USER\',$2,$3,$4) RETURNING id',[action,String(id),JSON.stringify({operationKey:OPERATION_KEY,...(id===1?{owned:owned||null,stock}:{entitlement:null})}),JSON.stringify({operationKey:OPERATION_KEY,releaseCommit,...data})]));receipt.adminLogIds.push(String(audit.id));
 }
 only(await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
 await verifyValterChicken(q);return {...receipt,replayed:false};
}
