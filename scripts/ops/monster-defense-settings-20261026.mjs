import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DEFENSE_KEY,validateDefenseSettings} from '../../shared/monster-defense-v1.mjs';
export const OP='ops:monster-defense-settings:20261026:v1';
export const SCROLLS=['WEAPON_ENHANCEMENT_SCROLL','ARMOR_ENHANCEMENT_SCROLL'];
export const TARGET=[
 ['GUIDE',300000000000,65,65,85,75,1300],
 ['NORMAL',600000000000,90,85,100,90,1200],
 ['HARD',900000000000,150,105,108,100,1100],
 ['NIGHTMARE',1500000000000,300,180,130,150,1000],
 ['CATACLYSM',3000000000000,400,250,150,160,600]
];
export const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const q=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected one row'),rows[0]);
export function requestedSettings(raw){
 const next=structuredClone(raw);next.rewardsEnabled=true;next.growth.waves=30;
 for(const [i,[id,coin,hpPercent,attackPercent,speedPercent,spawnPercent,coreHp]] of TARGET.entries()){
  const d=next.difficulties.find(d=>d.id===id);assert(d,id);
  Object.assign(d,{enabled:true,hpPercent,attackPercent,speedPercent,spawnPercent,coreHp,clearReward:{coin,masterStars:0,items:SCROLLS.map(code=>({code,chancePercent:i+1,minQuantity:1,maxQuantity:1}))}});
 }
 validateDefenseSettings(next);return next;
}
export async function inspect(db){
 const raw=one(await q(db,'SELECT value FROM app_meta WHERE key=$1',[DEFENSE_KEY])).value;
 const items=await q(db,'SELECT code,name,is_active FROM inventory_items WHERE code=ANY($1::text[]) ORDER BY code',[SCROLLS]);
 const receipts=await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {raw,settings:JSON.parse(raw),items,receipt:receipts.length?JSON.parse(receipts[0].value):null};
}
export async function verify(db){
 const s=await inspect(db),r=s.receipt;assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(hash(s.raw),r.afterHash);
 assert.deepEqual(s.settings,requestedSettings(s.settings));assert.equal(s.settings.revision,r.before.revision+1);assert.equal(s.settings.mode,r.before.mode);
 const audit=one(await q(db,"SELECT after_data FROM admin_logs WHERE id=$1 AND action_type='OPS_DEFENSE_SETTINGS'",[r.auditId]));assert.equal(JSON.parse(audit.after_data).operationKey,OP);
 return {verified:true,revision:s.settings.revision,mode:s.settings.mode,rewardsEnabled:s.settings.rewardsEnabled,difficulties:s.settings.difficulties,auditId:r.auditId,receipt:r};
}
export async function apply(db,{expectedRaw,dryRun=true}={}){
 if((await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP])).length)return {replayed:true,...await verify(db)};
 assert.equal(typeof expectedRaw,'string');await db.query('BEGIN');
 try{
  await db.query("SET LOCAL lock_timeout='4s'");await db.query("SET LOCAL statement_timeout='15s'");await q(db,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  if((await q(db,'SELECT value FROM app_meta WHERE key=$1',[OP])).length){const r=await verify(db);await db.query('ROLLBACK');return {replayed:true,...r};}
  await q(db,'SELECT key FROM app_meta WHERE key=$1 FOR UPDATE',[DEFENSE_KEY]);
  await q(db,'SELECT code FROM inventory_items WHERE code=ANY($1::text[]) FOR SHARE',[SCROLLS]);
  const before=await inspect(db);assert.equal(before.raw,expectedRaw,'Defense settings changed; inspect again');assert.equal(before.settings.mode,'ON');
  assert.deepEqual(before.items.map(i=>i.code),[...SCROLLS].sort());assert(before.items.every(i=>Number(i.is_active)===1));
  const owner=one(await q(db,"SELECT id FROM users WHERE role='OWNER' AND status='ACTIVE' ORDER BY id LIMIT 1"));
  const now=new Date().toISOString(),next=requestedSettings(before.settings);next.revision++;next.updatedAt=now;next.updatedBy=Number(owner.id);
  delete next.lastRequest;
  next.audit=[{operationKey:OP,actorId:Number(owner.id),revision:next.revision,createdAt:now},...(Array.isArray(before.settings.audit)?before.settings.audit:[])].slice(0,50);
  const raw=JSON.stringify(next);one(await q(db,'UPDATE app_meta SET value=$1,updated_at=$2 WHERE key=$3 AND value=$4 RETURNING key',[raw,now,DEFENSE_KEY,before.raw]));
  const receipt={status:'COMPLETED',operationKey:OP,actor:'CODEX_OPERATIONS',authorization:'사진의 코인/난이도 설정과 무기·방어구 강화주문서 각각 입문 1%부터 난이도당 1% 증가 드롭 설정',completedAt:now,before:before.settings,after:next,beforeHash:hash(before.raw),afterHash:hash(raw),accountWrites:0};
  const audit=one(await q(db,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'OPS_DEFENSE_SETTINGS','MONSTER_DEFENSE',$2,$3,$4) RETURNING id",[owner.id,OP,JSON.stringify(before.settings),JSON.stringify(receipt)]));receipt.auditId=String(audit.id);
  await q(db,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3)',[OP,JSON.stringify(receipt),now]);const verification=await verify(db);
  await db.query(dryRun?'ROLLBACK':'COMMIT');if(dryRun)assert.deepEqual(await inspect(db),before);
  return {replayed:false,committed:!dryRun,rolledBack:dryRun,receipt,verification};
 }catch(e){await db.query('ROLLBACK');throw e;}
}
