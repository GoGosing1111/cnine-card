import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {__postgresCompatTest} from '../../tmp/duo-settlement-recovery-20261027/functions/_postgres_d1_compat.js';
import {extendFurHighBreakthrough} from '../../tmp/duo-settlement-recovery-20261027/functions/_fur_enhancement_v2114.js';
export {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
export const OP='ops:hyerujjing-all-and-pending-card-retirement:20261101:v1';
export const AUTHORIZATION='혜루찡 카드 다 퇴사시키고 퇴사대기에 있는것들 있으면 다 확정시켜 그리고 유저 공지용 작성';
export const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const source=fs.readFileSync(new URL('../../tmp/duo-settlement-recovery-20261027/functions/api/[[path]].js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const section=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start+a.length);assert(start>=0&&end>start,`Missing CMS section: ${a}`);return source.slice(start,end)};
const constant=name=>{const line=source.split('\n').find(x=>x.startsWith(`const ${name}=`));assert(line);return line};
const constants=['BREAKTHROUGH_COST','BREAKTHROUGH_RATE','BREAKTHROUGH_GRADES','breakthroughMaxLevel','MA_MASTER_STAR_BREAKTHROUGH_DEFAULT','LIMITED_MASTER_STAR_BREAKTHROUGH_DEFAULT','FUR_MASTER_STAR_BREAKTHROUGH_DEFAULT','ZENITH_MASTER_STAR_BREAKTHROUGH_DEFAULT'].map(constant).join('\n');
const configs=section('function defaultBreakthroughConfig()','async function furRetirementRefundByLevel(');
const tickets=section('const RETIREMENT_REROLL_TICKETS=','const RETIREMENT_REROLL_CODES=');
const audit=section('async function writeAdminLog(','function cleanLimitedAuditText(');
const route=section("    if(path==='admin/card-retirement'&&request.method==='POST'){","    if(path==='admin/card-acquisition-effects'){");
export const CMS_HASH=hash([constants,configs,tickets,audit,route].join('\n'));
export const POLICY_KEYS=['breakthrough_config','ma_master_star_breakthrough_v1','limited_master_star_breakthrough_v1','fur_master_star_breakthrough_v1802','zenith_master_star_breakthrough_v1802'];
export const query=async(db,sql,args=[])=>(await db.query(sql,args)).rows;
export async function policy(db){return query(db,'SELECT key,value FROM app_meta WHERE key=ANY($1::text[]) ORDER BY key',[POLICY_KEYS])}
export async function targets(db){return query(db,`SELECT c.id,c.title,c.rarity,c.card_status,c.is_active,c.member_id,m.name
 FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
 WHERE m.name='혜루찡' OR c.card_status='RETIRE_PENDING' ORDER BY c.id`)}
// Run the unchanged CMS retirement route against the authorized operations connection.
// The caller owns the transaction. Batch statements never commit independently.
export function cms(db,{readOnly=false,failAfterRefund=false}={}){
 const guarded={query(sql,args){const text=typeof sql==='string'?sql:sql.text;
  if(readOnly)assert(/^\s*SELECT\b/i.test(text)&&!/FOR UPDATE|FOR SHARE|pg_advisory/i.test(text),'Read-only CMS preview');
  if(failAfterRefund&&/INSERT INTO shard_logs/i.test(text))throw Error('INJECTED_AFTER_REFUND');
  return db.query(sql,args);
 }};
 const compat=new __postgresCompatTest.PostgresD1Database(guarded);
 compat.batch=async statements=>{const result=[];for(const statement of statements)result.push(await statement.run());return result};
 const env={DB:compat};
 const context=vm.createContext({console,extendFurHighBreakthrough,
  cachedRuntimeSetting:async(_env,_key,_ttl,reader)=>reader(),
  metaValue:(e,key)=>e.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),
  requirePermission:async()=>{const owner=(await query(db,"SELECT id,role,status FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'"))[0];assert(owner,'Authorized OWNER missing');return owner},
  readBody:async request=>request.body,json:(data,status=200)=>({data,status})});
 vm.runInContext(`${constants}\nlet maMasterStarBreakthroughCache=null,limitedMasterStarBreakthroughCache=null;\n${configs}\n${tickets}\n${audit}\nasync function handle(request,env){const path='admin/card-retirement';${route}}\nglobalThis.handle=handle;`,context);
 return async(cardId,action)=>{
  if(readOnly)assert.equal(action,'PREVIEW');
  const response=await context.handle({method:'POST',body:{cardId,action}},env);
  assert(response?.status===200,`${cardId}/${action}: ${response?.data?.error||response?.status}`);
  assert(!response.data.logWarning,response.data.logWarning);
  return JSON.parse(JSON.stringify(response.data));
 };
}
