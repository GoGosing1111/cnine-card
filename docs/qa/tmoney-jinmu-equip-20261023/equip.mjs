import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readMercenaryModes,mercenaryModeStatements} from 'file:///C:/Users/User/Downloads/cnine-z-body-sword-20260918/site/functions/_mercenary_loadout_modes.js';
import {loadMercenaryBattleSnapshot} from 'file:///C:/Users/User/Downloads/cnine-z-body-sword-20260918/site/functions/_mercenary_account.js';
import {jinmuAccountAllowed} from 'file:///C:/Users/User/Downloads/cnine-z-body-sword-20260918/site/shared/mercenary-jinmu-v1.mjs';
export const PLAN=JSON.parse(readFileSync(new URL('./plan.json',import.meta.url),'utf8'));
export const OP=PLAN.operationKey,IDS=['5147'],CODE='V-989',ACTION='OPS_MERCENARY_LOADOUT';
export const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),HASH=hash(PLAN);
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const arr=sql=>`COALESCE((SELECT jsonb_agg(t) FROM (${sql}) t),'[]'::jsonb)`;
function adapter(c){return {dialect:'postgres',prepare(raw){let i=0;const sql=raw.replace(/\?/g,()=>'$'+(++i));const bound=args=>({sql,args,bind(...values){return bound(values);},async first(){return (await q(c,sql,args))[0]??null;},async all(){return {results:await q(c,sql,args)};}});return bound([]);}};}
export async function state(c){
 const fields={
  user:'SELECT u.id::text,u.nickname,u.role,u.status,u.coin::text,u.card_shards::text,u.magic_crystals::text,v.provider,v.provider_user_id FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id WHERE u.id=5147',
  cards:'SELECT * FROM user_mercenary_cards_v1 WHERE user_id=5147 ORDER BY mercenary_code',
  inventory:'SELECT * FROM cnine_user_inventory WHERE user_id=5147 ORDER BY item_code',
  levels:'SELECT * FROM user_mercenary_levels_v1 WHERE user_id=5147 ORDER BY mercenary_code',
  growth:'SELECT * FROM user_mercenary_growth_v1 WHERE user_id=5147 ORDER BY mercenary_code',
  pve:'SELECT * FROM user_mercenary_loadout_v1 WHERE user_id=5147',
  pvp:"SELECT key,value,updated_at FROM app_meta WHERE key='mercenary_pvp_loadout_v1:5147'",
  otherSettings:"SELECT key,value,updated_at FROM app_meta WHERE key IN ('pet_loadout_v1:5147','ranked_series_roster_v1:5147','ranked_series_ticket_v1:5147') OR key LIKE 'mercenary%:5147:%' ORDER BY key",
  stock:"SELECT * FROM mercenary_limited_stock_v1 WHERE code='V-989'",
  issues:"SELECT * FROM mercenary_limited_issues_v1 WHERE code='V-989' ORDER BY serial",
  sync:'SELECT user_id::text,revision::text,domains FROM account_sync_versions_v1 WHERE user_id=5147'
 };
 const data=one(await q(c,`SELECT jsonb_build_object(${Object.entries(fields).map(([k,sql])=>`'${k}',${arr(sql)}`).join(',')}) AS data`)).data;
 const {provider,provider_user_id,...u}=one(data.user);data.user={...u,identityHash:hash({provider,providerUserId:provider_user_id})};
 data.loadouts=(await readMercenaryModes({DB:adapter(c)},[5147])).get(5147).loadouts;return data;
}
const protectedState=s=>Object.fromEntries(Object.entries(s).filter(([k])=>!['pve','pvp','sync','loadouts'].includes(k)));
export async function receipt(c){const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);return rows.length?parse(one(rows).value):null;}
export async function artifacts(c){return one(await q(c,`SELECT jsonb_build_object('receipt',${arr('SELECT key FROM app_meta WHERE key=$1')},'audit',${arr('SELECT id::text FROM admin_logs WHERE action_type=$2 AND target_id=$1')},'acquisitions',${arr('SELECT acquisition_id FROM mercenary_card_acquisitions_v1 WHERE acquisition_id LIKE $3')},'messages',${arr('SELECT id::text FROM user_messages WHERE campaign_key=$1')}) AS data`,[OP,ACTION,OP+':%'])).data;}
async function snapshots(c){
 const result={},env={DB:adapter(c)},user={id:5147,role:'USER'};
 for(const mode of ['PVE','PVP']){const s=await loadMercenaryBattleSnapshot(env,user,mode);assert.equal(s?.code,CODE);result[mode]={code:s.code,name:s.name,rank:s.rank,basePower:s.basePower,statMode:s.statMode};}
 return result;
}
export async function verify(c,r,{exact=false}={}){
 assert.equal(r.status,'COMPLETED');assert.equal(r.actor,'CODEX_OPERATIONS');assert.equal(r.operationKey,OP);assert.equal(r.planHash,HASH);assert.deepEqual(r.plan,PLAN);
 assert.equal(r.protectedBeforeHash,r.protectedAfterHash);
 const s=await state(c);for(const mode of ['PVE','PVP']){assert.equal(s.loadouts[mode].mercenaryCode,CODE);assert.deepEqual(s.loadouts[mode],r.after[mode]);}
 const a=await artifacts(c);assert.equal(a.receipt.length,1);assert.equal(a.audit.length,1);assert.equal(a.acquisitions.length,0);assert.equal(a.messages.length,0);
 const audit=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(audit.id,r.auditId);assert.equal(audit.admin_id,'1');const {auditId,...logged}=r;assert.deepEqual(parse(audit.after_data),logged);
 if(exact)assert.equal(hash(protectedState(s)),r.protectedBeforeHash);
 return {status:'VERIFIED',userId:'5147',nickname:'T-Money™',loadouts:s.loadouts,battleSnapshots:await snapshots(c),currentCopies:Number(one(s.cards.filter(row=>row.mercenary_code===CODE)).total_copies),additionalGrants:0,additionalMessages:0};
}
// Caller owns a transaction and both live account lock leases.
export async function grant(c,expected,{lockDeadline,leaseToken}={}){
 assert.equal(expected,HASH);assert.equal(OP,'ops:tmoney-jinmu-pve-pvp-equip:20261023:v1');
 assert.deepEqual(PLAN.modes,['PVE','PVP']);assert.equal(PLAN.code,CODE);
 const saved=await receipt(c);if(saved)return {replayed:true,receipt:saved,verification:await verify(c,saved)};
 const runtime=JSON.parse(readFileSync(new URL('./runtime.json',import.meta.url),'utf8'));
 assert.equal(runtime.tmoneyExplicitlyAllowed,true,'Live runtime must allow the existing direct grant');assert(Date.now()-Date.parse(runtime.checkedAt)<15*60*1000,'Runtime verification expired');assert.equal(jinmuAccountAllowed(5147,CODE),true);
 assert.match(leaseToken,/^[a-f0-9]{64}$/);assert(lockDeadline>Date.now()+20000);
 const lease=async()=>{one(await q(c,'SELECT user_id FROM user_mutation_locks_v1520 WHERE user_id=5147 AND token=$1 AND action_path=$2 AND lease_until_ms>$3',[leaseToken,OP,Date.now()+5000]));assert(lockDeadline>Date.now()+5000);};
 await lease();await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
 const again=await receipt(c);if(again)return {replayed:true,receipt:again,verification:await verify(c,again)};
 one(await q(c,'SELECT id FROM users WHERE id=5147 FOR UPDATE'));
 await q(c,'SELECT user_id FROM user_second_verifications WHERE user_id=5147 FOR SHARE');
 await q(c,"SELECT user_id FROM user_mercenary_cards_v1 WHERE user_id=5147 AND mercenary_code='V-989' FOR SHARE");
 await q(c,'SELECT user_id FROM user_mercenary_loadout_v1 WHERE user_id=5147 FOR UPDATE');
 await q(c,"SELECT key FROM app_meta WHERE key='mercenary_pvp_loadout_v1:5147' FOR UPDATE");
 const before=await state(c);
 for(const k of ['id','nickname','status','role','identityHash'])assert.equal(before.user[k],PLAN.recipients[0][k]);
 assert(Number(one(before.cards.filter(r=>r.mercenary_code===CODE)).total_copies)>0);
 one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
 for(const rows of Object.values(await artifacts(c)))assert.equal(rows.length,0,'Prior/orphan operation artifacts');
 const DB=adapter(c),changes=[];
 for(const mode of PLAN.modes){
  const record=(await readMercenaryModes({DB},[5147])).get(5147),old=record.loadouts[mode];
  if(old.mercenaryCode===CODE)continue;
  assert(old.revision<2147483647);const next={mercenaryCode:CODE,revision:old.revision+1};
  for(const statement of mercenaryModeStatements(DB,5147,record,mode,next))await q(c,statement.sql,statement.args);
  changes.push({mode,before:old,after:next});
 }
 const after=await state(c);assert.deepEqual(protectedState(after),protectedState(before));
 if(changes.length)assert(BigInt(one(after.sync).domains.loadout)>BigInt(one(before.sync).domains.loadout||0));
 for(const mode of PLAN.modes)assert.equal(after.loadouts[mode].mercenaryCode,CODE);
 const r={status:'COMPLETED',actor:'CODEX_OPERATIONS',operationKey:OP,planHash:HASH,plan:PLAN,completedAt:new Date().toISOString(),before:before.loadouts,after:after.loadouts,changes,syncBefore:before.sync,syncAfter:after.sync,protectedBeforeHash:hash(protectedState(before)),protectedAfterHash:hash(protectedState(after)),runtimeVersion:runtime.deployments[0]?.versions,battleSnapshots:await snapshots(c),preserved:{balances:true,holdings:true,inventory:true,levels:true,growth:true,stock:true,issues:true,otherSettings:true}};
 r.auditId=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'USER',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({actor:'CODEX_OPERATIONS',operationKey:OP,userId:'5147',loadouts:before.loadouts}),JSON.stringify(r)])).id;
 one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) RETURNING key',[OP,JSON.stringify(r),r.completedAt]));
 const verification=await verify(c,r,{exact:true});await lease();return {replayed:false,receipt:r,verification};
}
