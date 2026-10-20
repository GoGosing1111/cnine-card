import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mercenaryCardAcquisitionStatements} from '../../functions/_mercenary_draw_accounting.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';

export const OP='ops:sera-kangyun-grant:20261021:v1';
export const TARGET=Object.freeze({id:45,nickname:'박세라-ㅂ-',provider:'PLAYDK',providerUserId:'0ab57d26',code:'V-057',name:'신궁 강윤',rank:'SSS',quantity:1});
export const AUTHORIZATION='박세라-ㅂ- 강윤 지급',ACTION='OPS_MERCENARY_DIRECT_GRANT';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const PLAN_HASH=hash({OP,TARGET,AUTHORIZATION});
const q=async(c,s,a=[])=>(await c.query(s,a)).rows;
const one=rows=>{assert.equal(rows.length,1,'Expected one exact row');return rows[0];};
const int=v=>{const n=Number(v);assert(Number.isSafeInteger(n)&&n>=0);return n;};
const array=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;

export async function inspect(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.status,u.role,v.provider,v.provider_user_id FROM users u JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=$1 OR u.nickname=$2 OR (v.provider=\'PLAYDK\' AND v.provider_user_id=$3) ORDER BY u.id',
  owned:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$4',
  acquisitions:'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=$5',
  receipts:'SELECT value FROM app_meta WHERE key=$5',
  audits:'SELECT id::text,admin_id::text,action_type,target_type,target_id,after_data FROM admin_logs WHERE action_type=$6 AND target_id=$5'
 };
 return one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,s])=>`'${k}',${array(s)}`).join(',')}) data`,[TARGET.id,TARGET.nickname,TARGET.providerUserId,TARGET.code,OP,ACTION])).data;
}
export async function protectedState(c){
 const fields={
  user:'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=$1',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=$1 ORDER BY item_code',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=$1',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=$1 ORDER BY mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=$1 ORDER BY mercenary_code',
  otherCards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code<>$2 ORDER BY mercenary_code',
  rosters:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  policy:'SELECT * FROM mercenary_draw_config_v1 WHERE id=1',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$2',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$2 ORDER BY serial'
 };
 const rows=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,s])=>`'${k}',${array(s)}`).join(',')}) data`,[TARGET.id,TARGET.code,[`ranked_series_roster_v1:${TARGET.id}`,`mercenary_pvp_loadout_v1:${TARGET.id}`]])).data;
 return hash(rows);
}
export async function verify(c,{exact=false}={}){
 const s=await inspect(c),r=JSON.parse(one(s.receipts).value);
 assert.equal(r.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.planHash,PLAN_HASH);assert.deepEqual(r.target,TARGET);assert.equal(r.authorization,AUTHORIZATION);
 assert.equal(r.copiesAfter,r.copiesBefore+1);assert.equal(r.cost,0);assert.equal(r.permanent,true);assert.equal(r.automaticLoadout,false);assert.equal(r.protectedBefore,r.protectedAfter);
 const owned=one(s.owned),a=one(s.acquisitions),audit=one(s.audits);
 assert(int(owned.total_copies)>=r.copiesAfter);assert.equal(int(owned.duplicate_count),int(owned.total_copies)-1);if(exact)assert.equal(int(owned.total_copies),r.copiesAfter);
 assert.equal(a.acquisition_id,OP);assert.equal(int(a.user_id),TARGET.id);assert.equal(a.mercenary_code,TARGET.code);assert.equal(int(a.total_copies_after),r.copiesAfter);assert.equal(int(a.duplicate_count_after),r.copiesBefore);assert.equal(int(a.is_duplicate),r.copiesBefore>0?1:0);assert.equal(a.created_at,r.completedAt);
 assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.target_type,'USER');const {auditId,...payload}=r;assert.deepEqual(JSON.parse(audit.after_data),payload);
 return {receipt:r,summary:{status:'VERIFIED',recipient:TARGET.nickname,userId:TARGET.id,code:TARGET.code,name:TARGET.name,rank:TARGET.rank,quantity:1,copiesBefore:r.copiesBefore,copiesAfter:r.copiesAfter,currentCopies:int(owned.total_copies),cost:0,permanent:true,automaticLoadout:false,acquisitions:1,auditRecords:1,completionReceipts:1,duplicateOperationGrants:0,preservedStateVerified:true,auditId:r.auditId,completedAt:r.completedAt}};
}

// Caller owns the transaction and holds live USER_LOCK plus the DB fallback lease.
export async function grant(c,approvedPlanHash,{leaseToken,lockDeadline}={}){
 assert.equal(approvedPlanHash,PLAN_HASH,'Reviewed plan required');assert.match(String(leaseToken||''),/^[a-f0-9]{64}$/);assert(Number.isSafeInteger(lockDeadline)&&lockDeadline>Date.now()+15000,'Live lease required');
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const saved=await q(c,'SELECT key FROM app_meta WHERE key=$1',[OP]);if(saved.length)return {...await verify(c),replayed:true};
 one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',[TARGET.id]));
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',[TARGET.id]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2 FOR UPDATE',[TARGET.id,TARGET.code]);
 await q(c,'SELECT id FROM mercenary_draw_config_v1 WHERE id=1 FOR SHARE');
 one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[TARGET.id,leaseToken,OP,Date.now()+10000]));
 const date=one(await q(c,"SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS today"));assert.equal(date.today,'2026-10-21');
 const s=await inspect(c),u=one(s.users);assert.deepEqual(u,{id:String(TARGET.id),nickname:TARGET.nickname,status:'ACTIVE',role:'USER',provider:TARGET.provider,provider_user_id:TARGET.providerUserId});
 for(const key of ['acquisitions','receipts','audits'])assert.equal(s[key].length,0,'Prior grant needs reconciliation');
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const catalog=one(MERCENARY_CMS_SEED.catalog.cards.filter(x=>x.code===TARGET.code));assert.equal(catalog.name,TARGET.name);assert.equal(catalog.rank,TARGET.rank);
 const protectedBefore=await protectedState(c),old=s.owned[0]||null,copiesBefore=int(old?.total_copies||0);assert(copiesBefore<2147483647);if(old)assert.equal(int(old.duplicate_count),copiesBefore-1);
 const now=new Date().toISOString(),adapter={dialect:'postgres',prepare(sql){return {bind(...args){let n=0;return {sql:sql.replace(/\?/g,()=>'$'+(++n)),args};}};}};
 for(const stmt of mercenaryCardAcquisitionStatements(adapter,{userId:TARGET.id,mercenaryCode:TARGET.code,acquisitionId:OP,createdAt:now}))await c.query(stmt.sql,stmt.args);
 const holding=one(await q(c,'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=$1 AND mercenary_code=$2',[TARGET.id,TARGET.code]));
 assert.equal(int(holding.total_copies),copiesBefore+1);assert.equal(int(holding.duplicate_count),copiesBefore);assert.equal(holding.first_obtained_at,old?.first_obtained_at||now);
 const protectedAfter=await protectedState(c);assert.equal(protectedAfter,protectedBefore,'Protected state changed');
 const r={status:'COMPLETED',operationKey:OP,planHash:PLAN_HASH,target:TARGET,authorization:AUTHORIZATION,copiesBefore,copiesAfter:copiesBefore+1,cost:0,permanent:true,automaticLoadout:false,protectedBefore,protectedAfter,completedAt:now};
 const audit=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({targetUserId:TARGET.id,owned:old}),JSON.stringify(r),now]));r.auditId=audit.id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const verified=await verify(c,{exact:true});assert(lockDeadline>Date.now()+5000,'Account lease expiring');return {...verified,replayed:false};
}
