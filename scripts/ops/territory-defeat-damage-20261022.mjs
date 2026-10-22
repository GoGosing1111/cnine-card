import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const OP='ops:territory-defeat-damage:20261022:20-percent:v1';
export const KEY='territory_war_settings_v3';
export const ACTION='TERRITORY_DEFEAT_DAMAGE_SETTING';
export const AUTHORIZATION='패배해도 데미지 들어가게 해야지 → 승리 시 피해의 20%';
const q=async(c,sql,args=[])=>(await c.query(sql,args)).rows;
const one=rows=>(assert.equal(rows.length,1,'Expected exactly one row'),rows[0]);
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const rest=value=>{const {defeatSiegeDamagePercent,...other}=value;return other;};
export async function inspect(c){
 const setting=one(await q(c,'SELECT value,updated_at FROM app_meta WHERE key=$1',[KEY]));
 const rows=await q(c,'SELECT value FROM app_meta WHERE key=$1',[OP]);
 return {settings:parse(setting.value),updatedAt:setting.updated_at,receipt:rows.length?parse(one(rows).value):null};
}
export async function verify(c){
 const {settings,receipt:r}=await inspect(c);assert.equal(r?.status,'COMPLETED');assert.equal(r.operationKey,OP);assert.equal(r.authorization,AUTHORIZATION);assert.equal(r.beforePercent,0);assert.equal(r.afterPercent,20);assert.equal(settings.defeatSiegeDamagePercent,20);assert.equal(r.otherSettingsBeforeHash,r.otherSettingsAfterHash);
 const a=one(await q(c,'SELECT id::text,admin_id::text,after_data FROM admin_logs WHERE action_type=$1 AND target_id=$2',[ACTION,OP]));assert.equal(a.id,r.auditId);assert.equal(a.admin_id,'1');const {auditId,...recorded}=r;assert.deepEqual(parse(a.after_data),recorded);
 return {verified:true,operationKey:OP,defeatSiegeDamagePercent:20,appliesTo:'NEW_SIEGE_ATTACKS',historicalResultsChanged:false,receipt:r};
}
export async function apply(c,{dryRun=true}={}){
 if((await inspect(c)).receipt)return {...await verify(c),replayed:true};
 await c.query('BEGIN');
 try{
  await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='10s'");await q(c,'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[OP]);
  const row=one(await q(c,'SELECT value FROM app_meta WHERE key=$1 FOR UPDATE',[KEY]));
  const existing=await inspect(c);if(existing.receipt){const verified=await verify(c);await c.query('ROLLBACK');return {...verified,replayed:true};}
  const before=parse(row.value);assert.equal(before.defeatSiegeDamagePercent,0,'Live setting changed; review first');assert(['OFF','TEST','ON'].includes(before.mode));
  one(await q(c,"SELECT id FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"));
  const next={...before,defeatSiegeDamagePercent:20};
  one(await q(c,'UPDATE app_meta SET value=$1,updated_at=CURRENT_TIMESTAMP WHERE key=$2 AND value=$3 RETURNING key',[JSON.stringify(next),KEY,row.value]));
  const after=(await inspect(c)).settings;assert.deepEqual(after,next);assert.deepEqual(rest(after),rest(before));
  const r={status:'COMPLETED',operationKey:OP,authorization:AUTHORIZATION,completedAt:new Date().toISOString(),key:KEY,beforePercent:0,afterPercent:20,otherSettingsBeforeHash:hash(rest(before)),otherSettingsAfterHash:hash(rest(after)),settingsBefore:before,settingsAfter:after,appliesTo:'NEW_SIEGE_ATTACKS',historicalResultsChanged:false,accountCurrencyChanged:false,frontHpDirectlyChanged:false};
  const a=one(await q(c,"INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(1,$1,'SETTING',$2,$3,$4) RETURNING id::text",[ACTION,OP,JSON.stringify({key:KEY,defeatSiegeDamagePercent:0}),JSON.stringify(r)]));r.auditId=a.id;
  one(await q(c,'INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) RETURNING key',[OP,JSON.stringify(r)]));
  const result=await verify(c);await c.query(dryRun?'ROLLBACK':'COMMIT');return {...result,dryRun,replayed:false};
 }catch(e){await c.query('ROLLBACK');throw e;}
}
