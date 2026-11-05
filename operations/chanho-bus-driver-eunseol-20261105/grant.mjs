import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const PLAN=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,IDS=[PLAN.target.id],CODE='V-973',TITLE='655095',ACTION='OPS_TITLE_MERCENARY_GRANT';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,s,a=[])=>(await c.query(s,a)).rows,one=r=>(assert.equal(r.length,1,'Expected one row'),r[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v,AID=OP+':4597:V-973:1',CODES=[CODE,'SSS_MIRACLE_CUBE:'+CODE];
const SETTINGS=['mercenary_level_policy_v1','mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_limited_shard_craft_v1:V-973','sss_miracle_cube_policy_20261021_v1','mercenary_runtime_policy_v1'];
function validate(expected=HASH){
 assert.equal(expected,HASH,'Reviewed plan required');assert.equal(OP,'ops:chanho-bus-driver-eunseol:20261105:v1');
 assert.deepEqual(PLAN.target,{id:'4597',nickname:'찬호',role:'USER',status:'ACTIVE',identityHash:'7fb3ed96eaff0baf400ec52b93258975ade8ed08316b87c8f4164546afe6f60d'});
 assert.equal(PLAN.authorization,'찬호 계정에 버스기사 칭호 지급하고 은설 용병까지 지급해');
 assert.deepEqual([PLAN.titleId,PLAN.titleCode,PLAN.titleName,PLAN.titlePolicy],[TITLE,'RAID_BUS_DRIVER','버스기사','ENSURE_PERMANENT_PRESERVE_EXISTING']);
 assert.equal(PLAN.expectedTitle,null);assert.equal(PLAN.expectedHolding,null);assert.equal(PLAN.quantity,1);
 assert.deepEqual([PLAN.code,PLAN.name,PLAN.rank,PLAN.edition],[CODE,'은설','SSS','LIMITED']);
 assert.equal(PLAN.stockPolicy,'ADMIN_DIRECT_NO_COUNTER_CHANGE');assert.equal(PLAN.levelPolicy,'PRESERVE_EXISTING_DEFAULT_ONE');
 assert.equal(PLAN.cost,0);assert.equal(PLAN.sendMessages,false);assert.equal(PLAN.automaticLoadout,false);
}
export async function snapshot(c){
 const fields={
  users:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=ANY($1::bigint[]) ORDER BY u.id',
  title:'SELECT * FROM character_titles WHERE id=$4',
  titles:'SELECT * FROM user_character_titles WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,title_id',
  titleLoadout:'SELECT * FROM user_title_loadout WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  otherTitleOwners:'SELECT * FROM user_character_titles WHERE title_id=$4 AND user_id<>ALL($1::bigint[]) ORDER BY user_id',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,item_code',
  pig:'SELECT * FROM pig_coin_wallets_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  ranked:'SELECT user_id::text,source_version::text FROM ranked_duo_accounts_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=ANY($2::text[]) ORDER BY code',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=ANY($2::text[]) ORDER BY code,serial',
  craft:"SELECT output_ref,COUNT(*)::text rows,COALESCE(SUM(output_quantity) FILTER(WHERE success=1),0)::text crafted FROM workshop_craft_logs_v1668 WHERE output_type='MERCENARY' AND output_ref=ANY($2::text[]) GROUP BY output_ref ORDER BY output_ref",
  settings:'SELECT key,value FROM app_meta WHERE key=ANY($3::text[]) ORDER BY key',
  accountSettings:"SELECT key,value FROM app_meta WHERE key LIKE '%:4597' OR key LIKE 'mercenary%:4597:%' ORDER BY key"
 };
 const arr=s=>`COALESCE((SELECT jsonb_agg(t) FROM (${s}) t),'[]'::jsonb)`;
 const s=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,v])=>`'${k}',${arr(v)}`).join(',')}) data`,[IDS,CODES,SETTINGS,TITLE])).data;
 s.users=s.users.map(({provider,provider_user_id,...u})=>({...u,identityHash:hash({provider,providerUserId:provider_user_id})}));return s;
}
export const protectedState=s=>({...s,cards:s.cards.filter(x=>x.mercenary_code!==CODE),titles:s.titles.filter(x=>String(x.title_id)!==TITLE),sync:undefined,ranked:undefined});
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function artifacts(c){return {receipt:await receipt(c),audit:await q(c,'SELECT id::text FROM admin_logs WHERE target_id=$1',[OP]),acquisitions:await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%'])};}
export async function verify(c,r=undefined,{exact=false}={}){
 validate();r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);assert.deepEqual(await receipt(c),r);
 assert.equal(r.quantity,1);assert.equal(r.copiesBefore,0);assert.equal(r.copiesAfter,1);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await snapshot(c),a=one((await artifacts(c)).acquisitions);
 assert.equal(a.acquisition_id,AID);assert.equal(String(a.user_id),'4597');assert.equal(a.mercenary_code,CODE);assert.equal(Number(a.is_duplicate),0);assert.equal(Number(a.total_copies_after),1);assert.equal(Number(a.duplicate_count_after),0);assert.equal(a.created_at,r.completedAt);
 const audit=one(await q(c,'SELECT id::text,admin_id::text,action_type,target_type,after_data FROM admin_logs WHERE target_id=$1',[OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');assert.equal(audit.action_type,ACTION);assert.equal(audit.target_type,'USER');const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_limited_issues_v1 WHERE acquisition_id LIKE $1 OR request_id=$2',[OP+':%',OP])).length,0);
 const title=one(s.titles.filter(x=>String(x.title_id)===TITLE));assert.equal(title.source_type,'ADMIN');assert.equal(title.source_id,'1');assert.equal(title.unlocked_at,r.completedAt);assert.equal(title.expires_at,null);
 const holding=s.cards.find(x=>x.mercenary_code===CODE)||null;assert(holding&&Number(holding.total_copies)>=1);
 if(exact){assert.equal(Number(holding.total_copies),1);assert.equal(Number(holding.duplicate_count),0);assert.equal(hash(protectedState(s)),r.protectedBeforeHash);}
 assert.equal(BigInt(one(r.syncAfter).revision),BigInt(one(r.syncBefore).revision)+1n);assert.equal(one(r.syncAfter).domains.collection,one(r.syncAfter).revision);
 assert.equal(BigInt(one(r.rankedAfter).source_version),BigInt(one(r.rankedBefore).source_version)+2n);
 return {status:'VERIFIED',userId:'4597',nickname:'찬호',title:{id:TITLE,code:'RAID_BUS_DRIVER',name:'버스기사',permanent:true},code:CODE,name:'은설',quantityGranted:1,copiesBefore:0,copiesAfter:1,currentCopies:Number(holding.total_copies),auditId:r.auditId,completedAt:r.completedAt,acquisitionRecords:1,protectedStatePreserved:true,limitedStockConsumed:0};
}
// Caller owns the SQL transaction and holds both live account leases.
export async function grant(c,expected=HASH,{leaseToken,lockDeadline}={}){
 validate(expected);let saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 assert.match(String(leaseToken),/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000,'Live account lease required');
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const lease=async()=>{assert(lockDeadline>Date.now()+5000);one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=$1 AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS[0],leaseToken,OP,Date.now()+5000]));};
 one(await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=$1 FOR UPDATE',IDS));one(await q(c,'SELECT id FROM users WHERE id=$1 FOR UPDATE',IDS));await lease();
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=$1 FOR SHARE',IDS);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=$1 ORDER BY mercenary_code FOR UPDATE',IDS);
 await q(c,'SELECT user_id FROM user_character_titles WHERE user_id=$1 ORDER BY title_id FOR UPDATE',IDS);
 await q(c,'SELECT id FROM character_titles WHERE id=$1 FOR SHARE',[TITLE]);
 await q(c,'SELECT code FROM mercenary_limited_stock_v1 WHERE code=ANY($1::text[]) ORDER BY code FOR SHARE',[CODES]);
 await q(c,'SELECT key FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key FOR SHARE',[SETTINGS]);
 const before=await snapshot(c),u=one(before.users);for(const k of Object.keys(PLAN.target))assert.equal(u[k],PLAN.target[k],`Recipient ${k} changed`);
 assert.equal(one(await q(c,'SELECT id::text FROM users WHERE nickname=$1',['찬호'])).id,'4597');one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const def=one(before.title);assert.equal(def.code,'RAID_BUS_DRIVER');assert.equal(def.name,'버스기사');assert.equal(def.unlock_type,'MANUAL');assert.equal(Number(def.is_active),1);assert.equal(Number(def.is_public),1);
 assert.equal(before.cards.filter(x=>x.mercenary_code===CODE).length,0,'Holding changed since inspection');assert.equal(before.titles.filter(x=>String(x.title_id)===TITLE).length,0,'Title changed since inspection');
 const prior=await artifacts(c);assert.equal(prior.receipt,null);assert.equal(prior.audit.length,0);assert.equal(prior.acquisitions.length,0);
 const now=new Date().toISOString();
 const titleGranted=one(await q(c,"INSERT INTO user_character_titles(user_id,title_id,source_type,source_id,unlocked_at,expires_at) VALUES($1,$2,'ADMIN','1',$3,NULL) RETURNING *",[IDS[0],TITLE,now]));
 one(await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) RETURNING user_id',[IDS[0],CODE,now]));
 one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,0,1,0,$4) RETURNING acquisition_id',[AID,IDS[0],CODE,now]));
 const after=await snapshot(c);assert.deepEqual(protectedState(after),protectedState(before),'Protected account state changed');
 assert.equal(BigInt(one(after.sync).revision),BigInt(one(before.sync).revision)+1n);for(const k of Object.keys(one(before.sync).domains))if(k!=='collection')assert.equal(one(after.sync).domains[k],one(before.sync).domains[k]);
 assert.equal(BigInt(one(after.ranked).source_version),BigInt(one(before.ranked).source_version)+2n);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:now,titleGranted,quantity:1,copiesBefore:0,copiesAfter:1,holdingBefore:null,holdingAfter:one(after.cards.filter(x=>x.mercenary_code===CODE)),syncBefore:before.sync,syncAfter:after.sync,rankedBefore:before.ranked,rankedAfter:after.ranked,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),preserved:{currency:true,otherTitles:true,otherTitleOwners:true,titleLoadout:true,otherMercenaries:true,levels:true,growth:true,loadouts:true,stock:true,limitedIssues:true,craftCounts:true}};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({holding:null,title:null,protectedHash:r.protectedBeforeHash}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));await lease();return {replayed:false,receipt:r,verification:await verify(c,r,{exact:true})};
}
