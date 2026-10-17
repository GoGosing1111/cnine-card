import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const PLAN=JSON.parse(readFileSync(new URL('./room-sponsor-rewards-20261018-plan.json',import.meta.url),'utf8'));
export const PLAN_HASH='89f51e4aa29ddcda4816fc0eac7341a1cf2d2d22dc7fd81bed6d5bdfc31b9be8';
export const OPERATION_KEY=PLAN.operationKey,PACK_KEY='mercenary_limited_pack_v1';
export const TARGETS=[...PLAN.recipients].sort((a,b)=>Number(a.userId)-Number(b.userId));
export const IDS=TARGETS.map(t=>t.userId);
const CODES=['V-996','V-999'],CARD_IDS=[...new Set(PLAN.grants.map(g=>g.userId))].sort((a,b)=>Number(a)-Number(b));
const PVP_KEY='mercenary_pvp_loadout_v1:'+PLAN.revoke.userId,ACTION='OPS_ROOM_SPONSOR_REWARDS';
const REASON='2026-10-18 방 후원 보상: 1회당 2조 코인·슈트 코어 6 10개';
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const aid=g=>OPERATION_KEY+':'+g.userId+':'+g.code;
const safe=(value,delta)=>{const n=BigInt(value??0);assert(n>=0n&&n+BigInt(delta)<=BigInt(Number.MAX_SAFE_INTEGER),'Balance overflow');};
function validate(expected){
 assert.equal(expected,PLAN_HASH,'Reviewed plan required');assert.equal(hash(PLAN),PLAN_HASH,'Plan changed');
 assert.equal(TARGETS.length,38);assert.equal(new Set(IDS).size,38);assert.equal(TARGETS.reduce((n,t)=>n+t.units,0),70);
 assert.equal(TARGETS.reduce((n,t)=>n+BigInt(t.coin),0n).toString(),'140000000000000');assert.equal(TARGETS.reduce((n,t)=>n+t.cores,0),700);
 for(const t of TARGETS){assert([1,2].includes(t.units));assert.equal(t.coin,(BigInt(t.units)*2000000000000n).toString());assert.equal(t.cores,t.units*10);}
 assert.deepEqual(PLAN.grants.map(g=>[g.userId,g.code,g.quantity]),[['4965','V-996',1],['4817','V-996',1],['4933','V-996',1],['4774','V-999',1]]);
 for(const g of PLAN.grants){const card=LIMITED_MERCENARIES.find(c=>c.code===g.code);assert.equal(card?.name,g.name);assert.equal(card.rank,'SSS');assert.equal(card.edition,'LIMITED');}
 assert.equal(PLAN.revoke.userId,'4774');assert.equal(PLAN.revoke.code,'V-996');assert.equal(PLAN.revoke.quantity,1);
}
export async function inspectSponsorRewards(db){
 const users=await q(db,'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,s.provider,s.provider_user_id FROM users u LEFT JOIN user_second_verifications s ON s.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',[IDS]);
 const inventory=await q(db,'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id',[IDS,PLAN.coreCode]);
 const item=await q(db,'SELECT code,name,is_active FROM inventory_items WHERE code=$1',[PLAN.coreCode]);
 const settings=await q(db,'SELECT key,value,updated_at FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[[PACK_KEY,PVP_KEY,PLAN.revoke.sourceGrantKey,'mercenary_limited_draw_policy_v1','mercenary_halloween_pack_v1']]);
 const stock=await q(db,'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code',[CODES]);
 const issues=await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($1::text[]) ORDER BY code,serial',[CODES]);
 const cards=await q(db,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[CARD_IDS]);
 const loadouts=await q(db,'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',[CARD_IDS]);
 const growth=await q(db,'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',[CARD_IDS]);
 const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);
 return {users,inventory,item,settings,stock,issues,cards,loadouts,growth,receipt:saved[0]?parse(saved[0].value):null};
}
function ledgers(s){
 const pack=parse(one(s.settings.filter(r=>r.key===PACK_KEY)).value);
 return CODES.map(code=>{const row=one(s.stock.filter(r=>r.code===code)),limit=Number(row.stock_limit),issued=Number(row.issued),issues=s.issues.filter(r=>r.code===code);
  assert(Number.isSafeInteger(limit)&&Number.isSafeInteger(issued)&&limit>=issued&&issued>=0);assert.equal(pack.settings.stockLimits[code],limit);assert.equal(issues.length,issued);issues.forEach((r,i)=>assert.equal(Number(r.serial),i+1));return {code,limit,issued,remaining:limit-issued};});
}
function identities(s){
 assert.deepEqual(s.users.map(u=>u.id),IDS,'Missing or duplicated user');
 for(let i=0;i<TARGETS.length;i++){const u=s.users[i],t=TARGETS[i];assert.equal(u.nickname,t.nickname,'Nickname changed');assert.equal(u.status,'ACTIVE');assert.equal(u.role,t.role);assert.equal(hash({provider:u.provider,providerUserId:u.provider_user_id}),t.identityHash,'Verified identity changed');safe(u.coin,t.coin);const inv=s.inventory.find(r=>String(r.user_id)===t.userId);safe(inv?.quantity,t.cores);safe(inv?.unseen_quantity,t.cores);}
 assert.equal(one(s.item).name,'슈트 코어 6');assert.equal(Number(s.item[0].is_active),1);
}
export async function verifySponsorRewards(db,receipt){
 validate(PLAN_HASH);if(!receipt)receipt=parse(one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).value);
 assert.equal(receipt.status,'COMPLETED');assert.equal(receipt.operationKey,OPERATION_KEY);assert.equal(receipt.planHash,PLAN_HASH);assert.equal(receipt.totalCoin,PLAN.totalCoin);assert.equal(receipt.totalCores,700);assert.equal(receipt.recipientCount,38);
 const coins=await q(db,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY coin_logs.user_id',[receipt.recipients.map(r=>r.coinLogId)]);
 const cores=await q(db,'SELECT id::text,user_id::text,item_code,change_amount::text,balance_after::text,reason,reference_type,reference_id FROM inventory_logs WHERE id=ANY($1::bigint[]) ORDER BY inventory_logs.user_id',[receipt.recipients.map(r=>r.coreLogId)]);
 assert.deepEqual(coins.map(r=>r.user_id),IDS);assert.deepEqual(cores.map(r=>r.user_id),IDS);
 for(let i=0;i<TARGETS.length;i++){
  const t=TARGETS[i],r=receipt.recipients[i],coin=coins[i],core=cores[i];assert.equal(r.userId,t.userId);assert.equal(r.nickname,t.nickname);assert.equal(r.units,t.units);assert.equal(r.coinGranted,t.coin);assert.equal(r.coresGranted,t.cores);
  assert.equal(coin.id,r.coinLogId);assert.equal(coin.change_amount,t.coin);assert.equal(coin.balance_after,r.coinAfter);assert.equal(coin.reason,REASON);assert.equal(BigInt(r.coinAfter)-BigInt(r.coinBefore),BigInt(t.coin));
  assert.equal(core.id,r.coreLogId);assert.equal(core.item_code,PLAN.coreCode);assert.equal(core.change_amount,String(t.cores));assert.equal(core.balance_after,r.coresAfter);assert.equal(core.reason,REASON);assert.equal(core.reference_id,OPERATION_KEY);assert.equal(core.reference_type,ACTION);
  assert.equal(BigInt(r.coresAfter)-BigInt(r.coresBefore),BigInt(t.cores));assert.equal(BigInt(r.unseenAfter)-BigInt(r.unseenBefore),BigInt(t.cores));
 }
 assert.equal(receipt.grants.length,4);
 for(const g of PLAN.grants){const r=one(receipt.grants.filter(r=>r.userId===g.userId&&r.code===g.code));assert.equal(r.copiesAfter,r.copiesBefore+1);assert.equal(r.acquisitionId,aid(g));
  const a=one(await q(db,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[aid(g)])),issue=one(await q(db,'SELECT * FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1',[aid(g)]));
  assert.equal(String(a.user_id),g.userId);assert.equal(a.mercenary_code,g.code);assert.equal(Number(a.total_copies_after),r.copiesAfter);assert.equal(Number(a.duplicate_count_after),r.copiesBefore);assert.equal(Number(a.is_duplicate),r.copiesBefore>0?1:0);assert.equal(a.created_at,receipt.completedAt);
  assert.equal(String(issue.user_id),g.userId);assert.equal(issue.code,g.code);assert.equal(Number(issue.serial),r.serial);assert.equal(issue.request_id,OPERATION_KEY);assert.equal(issue.created_at,receipt.completedAt);
 }
 assert.deepEqual(receipt.revocation.target,PLAN.revoke);assert.equal(receipt.revocation.copiesBefore,1);assert.equal(receipt.revocation.copiesAfter,0);assert.equal(receipt.revocation.growthPreserved,true);
 assert.equal(receipt.stockBefore.length,2);assert.equal(receipt.stockAfter.length,2);
 for(let i=0;i<2;i++){const b=receipt.stockBefore[i],a=receipt.stockAfter[i],n=PLAN.grants.filter(g=>g.code===b.code).length;assert.deepEqual(a,{code:b.code,limit:b.limit+n,issued:b.issued+n,remaining:b.remaining});}
 assert.equal(receipt.protectedBefore,receipt.protectedAfter);
 if(receipt.adminLogId){const audit=one(await q(db,'SELECT admin_id,action_type,target_id,after_data FROM admin_logs WHERE id=$1',[receipt.adminLogId]));assert.equal(Number(audit.admin_id),1);assert.equal(audit.action_type,ACTION);assert.equal(audit.target_id,OPERATION_KEY);const {adminLogId,...logged}=receipt;assert.deepEqual(parse(audit.after_data),logged);}
 return {status:'VERIFIED',recipientCount:38,totalUnits:70,totalCoin:PLAN.totalCoin,totalCores:700,grants:receipt.grants.map(g=>({userId:g.userId,nickname:g.nickname,code:g.code,copiesBefore:g.copiesBefore,copiesAfter:g.copiesAfter,serial:g.serial})),revocation:receipt.revocation,stockBefore:receipt.stockBefore,stockAfter:receipt.stockAfter,missing:0,duplicates:0};
}
function protectedState(s){return {
 users:s.users.map(({coin,...rest})=>rest),growth:s.growth,
 cards:s.cards.filter(r=>!PLAN.grants.some(g=>g.userId===String(r.user_id)&&g.code===r.mercenary_code)&&!(String(r.user_id)===PLAN.revoke.userId&&r.mercenary_code===PLAN.revoke.code)),
 loadouts:s.loadouts.filter(r=>String(r.user_id)!==PLAN.revoke.userId),settings:s.settings.filter(r=>![PACK_KEY,PVP_KEY].includes(r.key))};}

// One transaction, called only while holding every recipient's gameplay lease.
// Original limited issuance history is immutable, including the recalled card.
export async function grantSponsorRewards(db,{approvedPlanHash,lockDeadline,dryRun=true}={}){
 validate(approvedPlanHash);assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Gameplay leases required');
 await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='3s'");await db.query("SET LOCAL statement_timeout='15s'");
  await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OPERATION_KEY]);
  const saved=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY]);if(saved.length){const receipt=parse(saved[0].value),verification=await verifySponsorRewards(db,receipt);await db.query('ROLLBACK');return {receipt,verification,replayed:true,dryRun};}
  await q(db,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);
  await q(db,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
  await q(db,'SELECT user_id FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) AND item_code=$2 ORDER BY user_id FOR UPDATE',[IDS,PLAN.coreCode]);
  await q(db,'SELECT code FROM inventory_items WHERE code=$1 FOR SHARE',[PLAN.coreCode]);
  await q(db,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE',[[PACK_KEY,PVP_KEY,PLAN.revoke.sourceGrantKey]]);
  await q(db,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR UPDATE',[CODES]);
  await q(db,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[CARD_IDS]);
  await q(db,'SELECT user_id FROM user_mercenary_loadout_v1 WHERE user_id=$1 FOR UPDATE',[PLAN.revoke.userId]);
  const before=await inspectSponsorRewards(db);identities(before);const stockBefore=ledgers(before),protectedBefore=hash(protectedState(before));
  one(await q(db,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const source=parse(one(before.settings.filter(r=>r.key===PLAN.revoke.sourceGrantKey)).value);assert.equal(source.status,'COMPLETED');assert.equal(source.operationKey,PLAN.revoke.sourceGrantKey);assert(source.grants.some(g=>String(g.userId)===PLAN.revoke.userId&&g.code==='V-996'&&g.copiesAfter===1),'Original Valter grant missing');
  const revoked=one(before.cards.filter(r=>String(r.user_id)===PLAN.revoke.userId&&r.mercenary_code===PLAN.revoke.code));assert.equal(Number(revoked.total_copies),1,'Recall requires the original single copy');assert.equal(Number(revoked.duplicate_count),0);
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=ANY($1::text[])',[PLAN.grants.map(aid)])).length,0,'Orphan card grant');
  assert.equal((await q(db,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id=ANY($1::text[])',[PLAN.grants.map(aid)])).length,0,'Orphan issuance');
  const now=new Date().toISOString(),payload=JSON.stringify(TARGETS.map(t=>({user_id:t.userId,coin:t.coin,cores:t.cores})));
  const coinLogs=await q(db,`WITH credited AS (UPDATE users u SET coin=u.coin+t.coin FROM jsonb_to_recordset($1::jsonb) t(user_id bigint,coin bigint,cores bigint) WHERE u.id=t.user_id RETURNING u.id,u.coin,t.coin amount)
   INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at) SELECT id,amount,coin,$2,1,$3 FROM credited RETURNING id::text,user_id::text`,[payload,REASON,now]);assert.equal(coinLogs.length,38);
  const coreLogs=await q(db,`WITH credited AS (INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
   SELECT t.user_id,$2,t.cores,t.cores,$3,$3 FROM jsonb_to_recordset($1::jsonb) t(user_id bigint,coin bigint,cores bigint) ORDER BY t.user_id
   ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,updated_at=excluded.updated_at RETURNING user_id,quantity)
   INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id,admin_id,created_at)
   SELECT c.user_id,$2,t.cores,c.quantity,$4,$5,$6,1,$3 FROM credited c JOIN jsonb_to_recordset($1::jsonb) t(user_id bigint,coin bigint,cores bigint) ON t.user_id=c.user_id RETURNING id::text,user_id::text`,[payload,PLAN.coreCode,now,REASON,ACTION,OPERATION_KEY]);assert.equal(coreLogs.length,38);
  const packRow=one(before.settings.filter(r=>r.key===PACK_KEY)),nextPack=parse(packRow.value);
  for(const code of CODES){const n=PLAN.grants.filter(g=>g.code===code).length;nextPack.settings.stockLimits[code]+=n;one(await q(db,'UPDATE mercenary_limited_stock_v1 SET stock_limit=stock_limit+$2,issued=issued+$2,revision=revision+1,last_token=$3 WHERE code=$1 RETURNING code',[code,n,OPERATION_KEY]));}
  nextPack.revision=Number(nextPack.revision)+1;nextPack.updatedAt=now;nextPack.updatedBy=1;nextPack.lastRequestId=OPERATION_KEY;
  one(await q(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 AND value=$4 RETURNING key',[PACK_KEY,JSON.stringify(nextPack),now,packRow.value]));
  const grants=[],serials=Object.fromEntries(stockBefore.map(s=>[s.code,s.issued]));
  for(const g of PLAN.grants){
   const owned=before.cards.find(r=>String(r.user_id)===g.userId&&r.mercenary_code===g.code),copiesBefore=Number(owned?.total_copies??0);assert(Number.isSafeInteger(copiesBefore)&&copiesBefore>=0&&copiesBefore<2147483647);if(owned)assert.equal(Number(owned.duplicate_count),copiesBefore-1);
   const holding=one(await q(db,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3)
    ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[g.userId,g.code,now]));
   assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(Number(holding.duplicate_count),copiesBefore);assert.equal(holding.first_obtained_at,owned?.first_obtained_at??now);
   one(await q(db,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[aid(g),g.userId,g.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
   const serial=++serials[g.code];one(await q(db,'INSERT INTO mercenary_limited_issues_v1(acquisition_id,request_id,user_id,code,serial,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING acquisition_id',[aid(g),OPERATION_KEY,g.userId,g.code,serial,now]));
   grants.push({...g,nickname:TARGETS.find(t=>t.userId===g.userId).nickname,acquisitionId:aid(g),copiesBefore,copiesAfter:copiesBefore+1,serial});
  }
  const legacy=before.loadouts.find(r=>String(r.user_id)===PLAN.revoke.userId),pvp=before.settings.find(r=>r.key===PVP_KEY),pvpValue=pvp?parse(pvp.value):null,clearedModes=[];
  if(legacy?.mercenary_code===PLAN.revoke.code){one(await q(db,'UPDATE user_mercenary_loadout_v1 SET mercenary_code=NULL,revision=revision+1,updated_at=$2 WHERE user_id=$1 RETURNING user_id',[PLAN.revoke.userId,now]));clearedModes.push('PVE');if(!pvp)clearedModes.push('PVP');}
  if(pvpValue?.mercenaryCode===PLAN.revoke.code){const next={...pvpValue,mercenaryCode:null,revision:Number(pvpValue.revision||0)+1};one(await q(db,'UPDATE app_meta SET value=$2,updated_at=$3 WHERE key=$1 RETURNING key',[PVP_KEY,JSON.stringify(next),now]));clearedModes.push('PVP');if(legacy&&legacy.mercenary_code!==PLAN.revoke.code)await q(db,'UPDATE user_mercenary_loadout_v1 SET updated_at=$2 WHERE user_id=$1',[PLAN.revoke.userId,now]);}
  one(await q(db,'DELETE FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 AND total_copies=1 AND duplicate_count=0 RETURNING user_id',[PLAN.revoke.userId,PLAN.revoke.code]));
  const after=await inspectSponsorRewards(db),stockAfter=ledgers(after),protectedAfter=hash(protectedState(after));assert.equal(protectedAfter,protectedBefore);
  assert.deepEqual(after.issues.filter(i=>!PLAN.grants.some(g=>aid(g)===i.acquisition_id)),before.issues);assert.deepEqual(parse(one(after.settings.filter(s=>s.key===PACK_KEY)).value),nextPack);
  assert.equal(after.cards.some(r=>String(r.user_id)===PLAN.revoke.userId&&r.mercenary_code===PLAN.revoke.code),false);
  const afterLegacy=after.loadouts.find(r=>String(r.user_id)===PLAN.revoke.userId);assert.notEqual(afterLegacy?.mercenary_code,PLAN.revoke.code);
  const afterPvp=after.settings.find(r=>r.key===PVP_KEY);assert.notEqual(afterPvp?parse(afterPvp.value).mercenaryCode:afterLegacy?.mercenary_code,PLAN.revoke.code);
  const recipients=TARGETS.map(t=>{const b=before.users.find(r=>r.id===t.userId),a=after.users.find(r=>r.id===t.userId),bi=before.inventory.find(r=>String(r.user_id)===t.userId),ai=one(after.inventory.filter(r=>String(r.user_id)===t.userId));return {userId:t.userId,nickname:t.nickname,inputNickname:t.inputNickname,units:t.units,coinGranted:t.coin,coresGranted:t.cores,coinBefore:b.coin,coinAfter:a.coin,coresBefore:String(bi?.quantity??0),coresAfter:String(ai.quantity),unseenBefore:String(bi?.unseen_quantity??0),unseenAfter:String(ai.unseen_quantity),coinLogId:one(coinLogs.filter(r=>r.user_id===t.userId)).id,coreLogId:one(coreLogs.filter(r=>r.user_id===t.userId)).id};});
  const receipt={status:'COMPLETED',operationKey:OPERATION_KEY,planHash:PLAN_HASH,authorization:PLAN.authorization,delivery:'DIRECT',completedAt:now,recipientCount:38,totalUnits:70,totalCoin:PLAN.totalCoin,totalCores:700,recipients,grants,
   revocation:{target:PLAN.revoke,copiesBefore:1,copiesAfter:0,clearedModes,loadoutBefore:legacy??null,loadoutAfter:afterLegacy??null,pvpBefore:pvpValue,pvpAfter:afterPvp?parse(afterPvp.value):null,growthPreserved:true,sourceHistoryPreserved:true},stockBefore,stockAfter,protectedBefore,protectedAfter,automaticLoadout:false};
  await verifySponsorRewards(db,receipt);
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER_GROUP',$2,$3,$4) RETURNING id::text",[ACTION,OPERATION_KEY,JSON.stringify({stockBefore,revokedCard:revoked}),JSON.stringify(receipt)]));receipt.adminLogId=audit.id;
  one(await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OPERATION_KEY,JSON.stringify(receipt),now]));
  const verification=await verifySponsorRewards(db,receipt);assert(lockDeadline>Date.now()+5000,'Gameplay lease expired before commit');await db.query(dryRun?'ROLLBACK':'COMMIT');return {receipt,verification,dryRun,replayed:false};
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}
}
