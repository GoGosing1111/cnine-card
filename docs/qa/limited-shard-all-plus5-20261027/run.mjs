import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {OP,PLAN_HASH,TARGETS,inspect,increaseStock,verify} from '../../../scripts/ops/limited-shard-all-plus5-20261027.mjs';
import {decorateMercenaryCraft} from '../../../functions/_mercenary_craft.js';
import {__postgresCompatTest} from '../../../functions/_postgres_d1_compat.js';
const root=path.resolve(import.meta.dirname,'../../..'),mode=process.argv[2],out=path.resolve(process.argv[3]||'');
assert(['dry-run','apply','verify'].includes(mode));assert(process.argv[3],'Evidence directory required');await fs.mkdir(out,{recursive:true});await assert.rejects(fs.access(path.join(out,mode+'.json')),/ENOENT/);
const digest=createHash('sha256');
for(const file of ['scripts/ops/limited-shard-all-plus5-20261027.mjs','scripts/ops/limited-shard-all-plus5-20261027.plan.json','shared/mercenary-limited-shard-craft-v1.mjs','shared/mercenary-craft-v1.mjs','functions/_mercenary_craft.js','docs/qa/limited-shard-all-plus5-20261027/run.mjs'])digest.update(file).update((await fs.readFile(path.join(root,file),'utf8')).replace(/\r\n/g,'\n'));
const sourceSha=digest.digest('hex');
if(mode==='apply'){const dry=JSON.parse(await fs.readFile(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha,sourceSha);assert.equal(dry.planHash,PLAN_HASH);assert.equal(dry.result.rollbackVerified,true);assert.equal(dry.result.committed,false);assert.equal(dry.injectedFailureRollback,true);}
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'limited-shard-all-plus5-'+mode,connectionTimeoutMillis:15000});
try{
 await db.connect();let result,injectedFailureRollback=false;
 if(mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
  const verified=await verify(db),queries=[];
  const noWrites={query:(sql,args)=>{assert(/^SELECT\b/i.test(sql));assert(!/FOR UPDATE|pg_advisory|nextval/i.test(sql));queries.push(sql);return db.query(sql,args);}};
  assert.equal((await increaseStock(noWrites,{expectedPlanHash:PLAN_HASH,dryRun:false})).replayed,true);
  const env={DB:new __postgresCompatTest.PostgresD1Database({query:arg=>db.query(arg)})};
  const [adminRecipes,playerRecipes]=await Promise.all([decorateMercenaryCraft(env,[],{admin:true}),decorateMercenaryCraft(env,[])]);
  const display=TARGETS.map(target=>{const row=adminRecipes.find(r=>r.code===target.recipeCode),expected=verified.targets.find(t=>t.code===target.code);assert(row);assert.equal(row.craftStock.limit,expected.limit);assert.equal(row.craftStock.crafted,expected.crafted);assert.equal(row.is_public,Number(expected.public));assert.equal(row.craftConfiguredActive,expected.active);assert.equal(playerRecipes.some(r=>r.code===target.recipeCode),expected.public);if(expected.active&&row.craftStock.remaining>0)assert.equal(row.craftLocked,false);if(!expected.active)assert.equal(row.craftLocked,true);return {code:target.code,name:target.name,stock:row.craftStock,locked:row.craftLocked,active:row.is_active,public:row.is_public,coinCost:row.coin_cost,masterStarCost:row.master_star_cost,successRate:row.success_rate,materials:row.materials};});
  const readOnly=(await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only;assert.equal(readOnly,'on');await db.query('ROLLBACK');
  result={verified,independentReadOnly:true,replayVerified:true,replaySelectQueries:queries.length,replayWrites:0,display};
 }else{
  if(mode==='dry-run'){
   const before=await inspect(db),audit=await db.query('SELECT id FROM admin_logs WHERE target_id=$1',[OP]);assert.equal(before.receipt,null);
   const failure={query:(sql,args)=>sql.startsWith('INSERT INTO app_meta')&&args[0]===OP?db.query('SELECT 1/0'):db.query(sql,args)};
   await assert.rejects(increaseStock(failure,{expectedPlanHash:PLAN_HASH,dryRun:false}),error=>error.code==='22012');
   assert.deepEqual(await inspect(db),before);assert.deepEqual((await db.query('SELECT id FROM admin_logs WHERE target_id=$1',[OP])).rows,audit.rows);injectedFailureRollback=true;
  }
  result=await increaseStock(db,{expectedPlanHash:PLAN_HASH,dryRun:mode==='dry-run'});
 }
 const evidence={checkedAt:new Date().toISOString(),mode,sourceSha,planHash:PLAN_HASH,injectedFailureRollback,result};await fs.writeFile(path.join(out,mode+'.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,sourceSha,committed:result.committed,completedAt:result.receipt?.completedAt,rollbackVerified:result.rollbackVerified,injectedFailureRollback,verification:result.verification||result.verified,replayWrites:result.replayWrites}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.stack||error).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
