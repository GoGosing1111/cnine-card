import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
export const OP='ops:blackcrown-cardgu-limit-plus2:20261101:v1';
export const PACK='mercenary_blackcrown_ss_pack_v1',CODE='V-970';
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export {connect,safe};
export async function inspect(db){
 const row=(await db.query('SELECT value FROM app_meta WHERE key=$1',[PACK])).rows[0];assert(row,'Missing Blackcrown policy');
 const document=JSON.parse(row.value),stock=(await db.query('SELECT * FROM mercenary_limited_stock_v1 WHERE code=$1',[CODE])).rows;
 assert.equal(stock.length,1);assert.equal(Number(stock[0].stock_limit),document.settings.stockLimits[CODE]);
 const issues=(await db.query('SELECT * FROM mercenary_limited_issues_v1 WHERE code=$1 ORDER BY serial',[CODE])).rows;
 const receipt=(await db.query('SELECT value FROM app_meta WHERE key=$1',[OP])).rows[0];
 const protectedState={
  policies:(await db.query("SELECT key,value FROM app_meta WHERE key IN ('mercenary_blackcrown_stock_schedule_v1','mercenary_bloodmoon_ss_pack_v1','sss_miracle_cube_policy_20261021_v1') ORDER BY key")).rows,
  stockLimits:(await db.query('SELECT code,stock_limit FROM mercenary_limited_stock_v1 WHERE code<>$1 ORDER BY code',[CODE])).rows
 };
 const normalized={...stock[0],stock_limit:Number(stock[0].stock_limit),issued:Number(stock[0].issued),revision:Number(stock[0].revision)};
 return {raw:row.value,document,documentHash:hash(row.value),stock:normalized,issues,protectedState,receipt:receipt?JSON.parse(receipt.value):null};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/blackcrown-cardgu-limit-plus2-20261101/preflight.mjs')){
 let db;try{
  db=connect();await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const identity=(await db.query('SELECT current_database() AS database,current_user AS actor,pg_is_in_recovery() AS replica,CURRENT_TIMESTAMP AS now')).rows[0];
  assert.equal(identity.database,'cnine');assert.equal(identity.actor,'cnine_migrator');assert.equal(identity.replica,false);
  const owner=(await db.query("SELECT id,role,status FROM users WHERE id=1")).rows[0];assert.equal(owner.role,'OWNER');assert.equal(owner.status,'ACTIVE');
  const state=await inspect(db);const report={operationKey:OP,authorization:'카드구 블랙크라운팩 한도 2장늘려라',identity,owner,...state,readOnly:true};
  await db.query('ROLLBACK');fs.writeFileSync(new URL('./before.json',import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({identity,code:CODE,limit:state.stock.stock_limit,issued:state.stock.issued,remaining:Number(state.stock.stock_limit)-Number(state.stock.issued),issueCount:state.issues.length,revision:state.document.revision,existingReceipt:state.receipt}));
 }catch(e){await db?.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1}finally{await db?.end()}
}
