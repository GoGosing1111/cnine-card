import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site',require=createRequire(path.join(root,'package.json')),pg=require('pg'),mode=process.argv[2];
assert(['dry-run','apply','verify'].includes(mode));
const {PLAN_HASH,TARGETS,increaseStock,verify}=await import(pathToFileURL(path.join(root,'scripts/ops/limited-shard-soldout-plus5-20261025.mjs')));
const out=path.join(root,'docs/qa/limited-shard-soldout-plus5-20261025'),sourceHash=createHash('sha256');
for(const f of ['scripts/ops/limited-shard-soldout-plus5-20261025.mjs','scripts/ops/limited-shard-soldout-plus5-20261025.plan.json','shared/mercenary-limited-shard-craft-v1.mjs','shared/mercenary-craft-v1.mjs'])sourceHash.update(f).update(fs.readFileSync(path.join(root,f)));sourceHash.update(fs.readFileSync(new URL(import.meta.url)));const sourceSha=sourceHash.digest('hex');
if(mode==='apply'){const dry=JSON.parse(fs.readFileSync(path.join(out,'dry-run.json'),'utf8'));assert.equal(dry.sourceSha,sourceSha);assert.equal(dry.planHash,PLAN_HASH);assert.equal(dry.result.rollbackVerified,true);assert.equal(dry.result.committed,false);}
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'limited-shard-soldout-plus5-'+mode,connectionTimeoutMillis:15000});
try{
 await db.connect();let result;
 if(mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
  const verified=await verify(db),queries=[];
  const readOnly={query:(sql,args)=>{assert(/^SELECT\b/i.test(sql));assert(!/FOR UPDATE|pg_advisory|nextval/i.test(sql));queries.push(sql);return db.query(sql,args);}};
  const replay=await increaseStock(readOnly,{expectedPlanHash:PLAN_HASH,dryRun:false});assert.equal(replay.replayed,true);
  const {decorateMercenaryCraft}=await import(pathToFileURL(path.join(root,'functions/_mercenary_craft.js'))),{__postgresCompatTest}=await import(pathToFileURL(path.join(root,'functions/_postgres_d1_compat.js')));
  const env={DB:new __postgresCompatTest.PostgresD1Database({query:arg=>db.query(arg)})},recipes=await decorateMercenaryCraft(env,[]);
  const playerRecipes=TARGETS.map(t=>{const row=recipes.find(r=>r.code===t.recipeCode);assert(row);assert.equal(row.craftStock.limit,10);assert.equal(row.is_public,1);if(row.craftStock.remaining>0){assert.equal(row.craftLocked,false);assert.equal(row.is_active,1);}return {code:t.code,name:t.name,stock:row.craftStock,locked:row.craftLocked,active:row.is_active,public:row.is_public,coinCost:row.coin_cost,masterStarCost:row.master_star_cost,successRate:row.success_rate,materials:row.materials};});
  await db.query('ROLLBACK');result={verified,replayVerified:true,replaySelectQueries:queries.length,replayWrites:0,playerRecipes};
 }else result=await increaseStock(db,{expectedPlanHash:PLAN_HASH,dryRun:mode==='dry-run'});
 const evidence={checkedAt:new Date().toISOString(),mode,sourceSha,planHash:PLAN_HASH,result};fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,sourceSha,committed:result.committed,rollbackVerified:result.rollbackVerified,verification:result.verification||result.verified,playerRecipes:result.playerRecipes,replayWrites:result.replayWrites}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(String(e.stack||e).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}finally{await db.end();}
