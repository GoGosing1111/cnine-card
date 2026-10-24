import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:bus-driver-eunseol:20261024:v1',ACTION='OPS_BUS_DRIVER_RESET_EUNSEOL_GRANT';
export const TITLE_ID='655095',CODE='V-973';
export const TARGETS=[{id:'1195',nickname:'씨나인택갓'},{id:'22',nickname:'커피먹는철구'},{id:'45',nickname:'박세라-ㅂ-'},{id:'4391',nickname:'더듬이구'}];
export const IDS=['22','45','88','303','309','1195','4391'];
const OLD_IDS=['22','45','88','303','309','1195'];
const q=async(c,s,p=[])=>(await c.query(s,p)).rows;
const one=rows=>(assert.equal(rows.length,1),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const arr=s=>`COALESCE((SELECT jsonb_agg(t) FROM (${s}) t),'[]'::jsonb)`;
const sorted=ids=>ids.map(String).sort((a,b)=>Number(a)-Number(b));
export async function receipt(c){const r=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return r.length?parse(one(r).value):null;}
export async function state(c){
 const fields={
  title:'SELECT * FROM character_titles WHERE id=$2',
  titles:'SELECT * FROM user_character_titles WHERE title_id=$2 ORDER BY user_id',
  titleLoadout:'SELECT * FROM user_title_loadout WHERE title_id=$2 ORDER BY user_id',
  otherTitles:'SELECT * FROM user_character_titles WHERE user_id=ANY($1::bigint[]) AND title_id<>$2 ORDER BY user_id,title_id',
  otherTitleLoadout:'SELECT * FROM user_title_loadout WHERE user_id=ANY($1::bigint[]) AND title_id<>$2 ORDER BY user_id',
  users:'SELECT id::text,nickname,status,role,coin::text,card_shards::text,magic_crystals::text FROM users WHERE id=ANY($1::bigint[]) ORDER BY id',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  loadout:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code',
  stock:'SELECT * FROM mercenary_limited_stock_v1 WHERE code=$3',
  issues:'SELECT * FROM mercenary_limited_issues_v1 WHERE code=$3 ORDER BY serial',
  settings:"SELECT key,value FROM app_meta WHERE key IN ('mercenary_limited_pack_v1','mercenary_limited_draw_policy_v1','mercenary_halloween_ss_pack_v1','mercenary_runtime_policy_v1') OR key=ANY(SELECT 'mercenary_pvp_loadout_v1:'||id FROM unnest($1::bigint[]) u(id)) ORDER BY key"
 };
 return one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,s])=>`'${k}',${arr(s)}`).join(',')}) data`,[IDS,TITLE_ID,CODE])).data;
}
const protectedState=s=>({...s,titles:undefined,titleLoadout:undefined,cards:s.cards.filter(r=>r.mercenary_code!==CODE||!TARGETS.some(t=>t.id===String(r.user_id)))});
export async function verify(c,r){
 r??=await receipt(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);
 assert.equal(r.revoked.length,6);assert.equal(r.grants.length,4);assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await state(c);assert.deepEqual(sorted(s.titles.map(r=>r.user_id)),sorted(TARGETS.map(t=>t.id)));
 assert(s.titleLoadout.every(row=>TARGETS.some(t=>t.id===String(row.user_id))));
 const acquisitions=await q(c,'SELECT * FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1 ORDER BY acquisition_id',[OP+':%']);assert.equal(acquisitions.length,4);
 for(const t of TARGETS){
  const title=one(s.titles.filter(r=>String(r.user_id)===t.id));assert.equal(title.source_type,'ADMIN');assert.equal(title.source_id,'1');assert.equal(title.expires_at,null);assert.equal(title.unlocked_at,r.completedAt);
  const grant=one(r.grants.filter(g=>g.userId===t.id));assert.equal(grant.before,0);assert.equal(grant.after,1);
  const card=one(s.cards.filter(c=>String(c.user_id)===t.id&&c.mercenary_code===CODE));assert(Number(card.total_copies)>=1);
  const a=one(acquisitions.filter(a=>String(a.user_id)===t.id));assert.equal(a.acquisition_id,OP+':'+t.id+':'+CODE);assert.equal(a.mercenary_code,CODE);assert.equal(Number(a.total_copies_after),1);assert.equal(Number(a.duplicate_count_after),0);assert.equal(Number(a.is_duplicate),0);
 }
 const audit=one(await q(c,'SELECT id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);const {auditId,...payload}=r;assert.deepEqual(parse(audit.after_data),payload);
 return {verified:true,titleOwners:s.titles.length,revokedCount:r.revoked.length,grantedTitleCount:4,eunseolGranted:4,acquisitionRecords:4,auditId:r.auditId};
}
export async function apply(c,{leaseToken,lockDeadline}={}){
 const old=await receipt(c);if(old)return {replayed:true,receipt:old,verification:await verify(c,old)};
 assert(lockDeadline>Date.now()+20000);assert.match(leaseToken,/^[a-f0-9]{64}$/);
 await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const again=await receipt(c);if(again)return {replayed:true,receipt:again,verification:await verify(c,again)};
 const leases=async()=>{assert(lockDeadline>Date.now()+5000);assert.equal((await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=ANY($1::bigint[]) AND token=$2 AND action_path=$3 AND lease_until_ms>$4',[IDS,leaseToken,OP,Date.now()+5000])).length,IDS.length);};
 await leases();
 await q(c,'SELECT user_id FROM account_sync_versions_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE',[IDS]);
 await q(c,'SELECT id FROM users WHERE id=ANY($1::bigint[]) ORDER BY id FOR UPDATE',[IDS]);
 await c.query('LOCK TABLE user_character_titles,user_title_loadout IN SHARE ROW EXCLUSIVE MODE');
 await q(c,'SELECT id FROM character_titles WHERE id=$1 FOR SHARE',[TITLE_ID]);
 await q(c,'SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=ANY($1::bigint[]) ORDER BY user_id,mercenary_code FOR UPDATE',[IDS]);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 const before=await state(c),title=one(before.title);assert.equal(title.code,'RAID_BUS_DRIVER');assert.equal(title.name,'버스기사');assert.equal(title.unlock_type,'MANUAL');
 assert.deepEqual(sorted(before.titles.map(r=>r.user_id)),OLD_IDS,'Title holdings changed; refresh affected-account locks');
 assert(before.titleLoadout.every(r=>IDS.includes(String(r.user_id))));
 const exact=await q(c,'SELECT id::text,nickname FROM users WHERE nickname=ANY($1::text[])',[TARGETS.map(t=>t.nickname)]);assert.equal(exact.length,4);
 for(const target of TARGETS){assert.equal(one(exact.filter(r=>r.nickname===target.nickname)).id,target.id);const u=one(before.users.filter(u=>u.id===target.id));assert.equal(u.nickname,target.nickname);assert.equal(u.status,'ACTIVE');assert(!before.cards.some(r=>String(r.user_id)===target.id&&r.mercenary_code===CODE),'Unexpected existing Eunseol; reconcile before grant');}
 assert.equal((await q(c,'SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $1',[OP+':%'])).length,0);
 assert.equal((await q(c,'SELECT id FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP])).length,0);
 const now=new Date().toISOString();
 const removedLoadout=await q(c,'DELETE FROM user_title_loadout WHERE title_id=$1 RETURNING *',[TITLE_ID]);
 const revoked=await q(c,'DELETE FROM user_character_titles WHERE title_id=$1 RETURNING *',[TITLE_ID]);assert.equal(revoked.length,before.titles.length);
 const titles=await q(c,"INSERT INTO user_character_titles(user_id,title_id,source_type,source_id,unlocked_at,expires_at) SELECT id,$2,'ADMIN','1',$3,NULL FROM unnest($1::bigint[]) u(id) RETURNING *",[TARGETS.map(t=>t.id),TITLE_ID,now]);assert.equal(titles.length,4);
 const grants=[];
 for(const target of TARGETS){
  const card=one(await q(c,'INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES($1,$2,1,0,$3,$3) RETURNING *',[target.id,CODE,now]));assert.equal(Number(card.total_copies),1);
  const acquisitionId=OP+':'+target.id+':'+CODE;
  one(await q(c,'INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at) VALUES($1,$2,$3,0,1,0,$4) RETURNING acquisition_id',[acquisitionId,target.id,CODE,now]));
  grants.push({userId:target.id,nickname:target.nickname,code:CODE,name:'은설',quantity:1,before:0,after:1,acquisitionId});
 }
 const after=await state(c);assert.deepEqual(protectedState(after),protectedState(before));assert.equal(after.titleLoadout.length,0);
 const r={status:'COMPLETED',operationKey:OP,authorization:'버스기사 칭호 전체 회수 후 지정 네 계정 재지급. 버스기사 네 계정에 은설 각 1장 지급, 은설 PVE 편성 전용·PVP 차단.',completedAt:now,titleId:TITLE_ID,titleCode:title.code,titleName:title.name,targets:TARGETS,revoked:before.titles,removedLoadout:before.titleLoadout,grantedTitles:titles,grants,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),preserved:{currency:true,otherTitles:true,otherCards:true,mercenaryLoadouts:true,levels:true,growth:true,stock:true,packSettings:true},automaticEquip:false};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data,created_at) VALUES(1,$1,'USER_GROUP',$2,$3,$4,$5) RETURNING id::text",[ACTION,OP,JSON.stringify({titles:before.titles,titleLoadout:before.titleLoadout,eunseolHoldings:[],protectedHash:r.protectedBeforeHash}),JSON.stringify(r),now])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),now]));
 const verification=await verify(c,r);await leases();return {replayed:false,receipt:r,verification};
}
