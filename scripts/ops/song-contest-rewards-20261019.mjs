import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';

export const PLAN=JSON.parse(readFileSync(new URL('./song-contest-rewards-20261019-plan.json',import.meta.url),'utf8'));
export const HASH='be11e2a4b4a6022d9d63dbe8ab5449a08e09a2fbb7ba8009e10dcd2e5edba9d1';
export const OP=PLAN.operationKey,ACTION='OPS_SONG_CONTEST_REWARDS';
export const REASON='2026-10-19 노래대회 참가상 · 3조 코인';
const TARGETS=[...PLAN.coinRecipients,PLAN.mercenary].sort((a,b)=>Number(a.userId)-Number(b.userId));
export const IDS=TARGETS.map(t=>t.userId);
const COIN_IDS=PLAN.coinRecipients.map(t=>t.userId),M=PLAN.mercenary,ACQUISITION=OP+':'+M.userId+':'+M.code;
const SETTINGS=['mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_halloween_pack_v1'];
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const array=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;

function validate(expected){
 assert.equal(expected,HASH,'Reviewed plan required');assert.equal(hash(PLAN),HASH,'Plan changed');
 assert.equal(PLAN.coinRecipients.length,5);assert.equal(new Set(IDS).size,6);
 assert.equal(PLAN.amountEach,'3000000000000');assert.equal(PLAN.totalCoin,(BigInt(PLAN.amountEach)*5n).toString());
 assert.equal(M.quantity,1);assert.equal(M.cost,0);assert.equal(M.stockPolicy,'EXEMPT_NO_COUNTER_CHANGE');
 const card=LIMITED_MERCENARIES.find(c=>c.code===M.code);assert.equal(card?.name,M.name);assert.equal(card.rank,M.rank);assert.equal(card.edition,'LIMITED');
}

export async function state(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.status,u.role,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$2',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$2 ORDER BY serial',
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  accountSettings:"SELECT key,value FROM app_meta WHERE EXISTS(SELECT 1 FROM unnest($1::bigint[]) u(id) WHERE key LIKE 'mercenary%:'||u.id::text||':%' OR key='mercenary_pvp_loadout_v1:'||u.id::text) ORDER BY key"
 };
 const result=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([key,sql])=>`'${key}',${array(sql)}`).join(',')}) AS data`,[IDS,M.code,SETTINGS])).data;
 result.users=result.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));
 return result;
}
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){
 return one(await q(c,`SELECT jsonb_build_object(
  'receipts',${array('SELECT key FROM app_meta WHERE key=$1')},
  'acquisitions',${array('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$2')},
  'audits',${array('SELECT id::text FROM admin_logs WHERE action_type=$3 AND target_id=$1')},
  'coins',${array('SELECT id::text FROM coin_logs WHERE id>(SELECT COALESCE(MAX(id),0)-100000 FROM coin_logs) AND user_id=ANY($4::bigint[]) AND reason=$5')}
 ) AS data`,[OP,ACQUISITION,ACTION,COIN_IDS,REASON])).data;
}

export async function verify(c,r,{exact=false}={}){
 validate(HASH);assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);
 assert.equal(r.totalCoin,PLAN.totalCoin);assert.equal(r.coins.length,5);assert.deepEqual(r.stockBefore,r.stockAfter);assert.deepEqual(r.issuesBefore,r.issuesAfter);
 const s=await state(c);
 const logs=await q(c,'SELECT id::text,user_id::text,change_amount::text,balance_after::text,reason,admin_id::text FROM coin_logs WHERE id=ANY($1::bigint[]) ORDER BY user_id',[r.coins.map(x=>x.coinLogId)]);
 assert.equal(logs.length,5);
 for(const [i,p]of PLAN.coinRecipients.entries()){
  const g=r.coins[i],log=one(logs.filter(x=>x.user_id===p.userId));assert.equal(g.userId,p.userId);assert.equal(g.nickname,p.nickname);
  assert.equal(g.amount,PLAN.amountEach);assert.equal(BigInt(g.after)-BigInt(g.before),BigInt(PLAN.amountEach));
  assert.equal(log.id,g.coinLogId);assert.equal(log.change_amount,PLAN.amountEach);assert.equal(log.balance_after,g.after);assert.equal(log.reason,REASON);assert.equal(log.admin_id,r.adminId);
  if(exact)assert.equal(one(s.users.filter(x=>x.id===p.userId)).coin,g.after);
 }
 const g=r.mercenary;assert.equal(g.userId,M.userId);assert.equal(g.code,M.code);assert.equal(g.acquisitionId,ACQUISITION);
 assert.equal(g.copiesAfter,g.copiesBefore+1);assert.equal(g.cost,0);assert.equal(g.automaticLoadout,false);assert.equal(g.stockPolicy,M.stockPolicy);
 const holding=one(s.cards.filter(x=>String(x.user_id)===M.userId&&x.mercenary_code===M.code));
 assert(Number(holding.total_copies)>=g.copiesAfter);assert.equal(Number(holding.duplicate_count),Number(holding.total_copies)-1);
 const a=one(await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$1',[ACQUISITION]));
 assert.equal(String(a.user_id),M.userId);assert.equal(a.mercenary_code,M.code);assert.equal(Number(a.total_copies_after),g.copiesAfter);
 assert.equal(Number(a.duplicate_count_after),g.copiesBefore);assert.equal(Number(a.is_duplicate),g.copiesBefore>0?1:0);assert.equal(a.created_at,r.completedAt);
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id=$1 OR request_id=$2',[ACQUISITION,OP])).length,0);
 const audits=await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]);
 const audit=one(audits);assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,r.adminId);const {auditId,...audited}=r;assert.deepEqual(parse(audit.after_data),audited);
 if(exact){assert.equal(Number(holding.total_copies),g.copiesAfter);assert.deepEqual(s.stock,r.stockBefore);assert.deepEqual(s.issues,r.issuesBefore);}
 return {status:'VERIFIED',coinRecipients:5,coinEach:PLAN.amountEach,totalCoin:PLAN.totalCoin,coinLogRecords:5,mercenaryRecipient:M.nickname,code:M.code,copiesGranted:1,currentCopies:Number(holding.total_copies),stockChanged:false,limitedIssueRecords:0,auditRecords:1,duplicateOperationGrants:0};
}

// Caller owns the transaction and holds all six live USER_LOCK and database leases.
export async function grant(c,expectedHash,{lockDeadline}={}){
 validate(expectedHash);assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+20000,'Live account leases required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const saved=await receipt(c);if(saved)return {receipt:saved,replayed:true,verification:await verify(c,saved)};
 assert.equal((await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS])).length,6);
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR SHARE',[IDS]);
 one(await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=$1 FOR SHARE',[M.code]));
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[M.userId,M.code]);
 const before=await state(c);assert.equal(before.users.length,6);
 for(const t of TARGETS){const u=one(before.users.filter(x=>x.id===t.userId));assert.equal(u.nickname,t.nickname);assert.equal(u.status,'ACTIVE');assert.equal(u.role,t.role);assert.equal(u.identityHash,t.identityHash);}
 const exact=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[])',[TARGETS.map(t=>t.nickname)]);assert.equal(exact.length,6);
 for(const t of TARGETS)assert.equal(one(exact.filter(u=>u.nickname===t.nickname)).id,t.userId);
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Prior or orphan grant requires reconciliation');
 const owner=one(await q(c,"SELECT id::text FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 for(const t of PLAN.coinRecipients){const n=BigInt(one(before.users.filter(u=>u.id===t.userId)).coin);assert(n>=0n&&n+BigInt(PLAN.amountEach)<=BigInt(Number.MAX_SAFE_INTEGER),'Unsupported coin balance');}
 const old=before.cards.find(x=>String(x.user_id)===M.userId&&x.mercenary_code===M.code)||null,copiesBefore=Number(old?.total_copies||0);
 assert(Number.isSafeInteger(copiesBefore)&&copiesBefore>=0&&copiesBefore<2147483647);if(old)assert.equal(Number(old.duplicate_count),copiesBefore-1);
 const now=new Date().toISOString();
 const coinLogs=await q(c,`WITH credited AS (UPDATE users SET coin=coin+$2::bigint WHERE id=ANY($1::bigint[]) RETURNING id,coin)
  INSERT INTO coin_logs(user_id,change_amount,balance_after,reason,admin_id,created_at)
  SELECT id,$2::bigint,coin,$3,$4,$5 FROM credited RETURNING id::text,user_id::text`,[COIN_IDS,PLAN.amountEach,REASON,owner.id,now]);assert.equal(coinLogs.length,5);
 const holding=one(await q(c,`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
  VALUES($1,$2,1,0,$3,$3) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,
  duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at RETURNING *`,[M.userId,M.code,now]));
 assert.equal(Number(holding.total_copies),copiesBefore+1);assert.equal(holding.first_obtained_at,old?.first_obtained_at||now);
 one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING acquisition_id',[ACQUISITION,M.userId,M.code,copiesBefore>0?1:0,copiesBefore+1,copiesBefore,now]));
 const after=await state(c);
 for(const key of ['stock','issues','settings','loadout','inventory','levels','growth','accountSettings'])assert.deepEqual(after[key],before[key],key+' changed unexpectedly');
 for(const u of before.users){const a=one(after.users.filter(x=>x.id===u.id)),expectedCoin=COIN_IDS.includes(u.id)?(BigInt(u.coin)+BigInt(PLAN.amountEach)).toString():u.coin;assert.deepEqual(a,{...u,coin:expectedCoin});}
 const others=cards=>cards.filter(x=>String(x.user_id)!==M.userId||x.mercenary_code!==M.code);assert.deepEqual(others(after.cards),others(before.cards));
 const coins=PLAN.coinRecipients.map(t=>({userId:t.userId,nickname:t.nickname,amount:PLAN.amountEach,before:one(before.users.filter(x=>x.id===t.userId)).coin,after:one(after.users.filter(x=>x.id===t.userId)).coin,coinLogId:one(coinLogs.filter(x=>x.user_id===t.userId)).id}));
 const r={status:'COMPLETED',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,adminId:owner.id,totalCoin:PLAN.totalCoin,coins,
  mercenary:{...M,acquisitionId:ACQUISITION,copiesBefore,copiesAfter:copiesBefore+1,holdingBefore:old},stockBefore:before.stock,stockAfter:after.stock,issuesBefore:before.issues,issuesAfter:after.issues,
  preserved:{nonCoinCurrency:true,mercenaryRecipientCoin:true,stockCounters:true,numberedIssues:true,packSettings:true,otherCards:true,loadout:true,inventory:true,levels:true,growth:true,accountSettings:true}};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,$2,'USER_GROUP',$3,$4,$5) RETURNING id::text",[owner.id,ACTION,OP,JSON.stringify({recipients:6,stock:before.stock,holding:old}),JSON.stringify(r)]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const verification=await verify(c,r,{exact:true});assert(lockDeadline>Date.now()+5000,'Account leases nearing expiration');
 return {receipt:r,replayed:false,verification};
}
