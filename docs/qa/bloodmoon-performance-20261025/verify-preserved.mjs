import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {connect,safeError} from 'file:///C:/Users/User/Downloads/upload/cnine-card/output/territory-finish-rewards-20261022/connect.mjs';
const out=path.resolve(process.argv[2]),before=JSON.parse(fs.readFileSync(path.join(out,'public-pool-before.json'))),old=JSON.parse(fs.readFileSync(path.join(out,'../bloodmoon-bulk-20261025/after-settings.json'))),sha=x=>createHash('sha256').update(x).digest('hex');
let db;
try{
 db=await connect();await db.query('BEGIN READ ONLY');
 const settings=(await db.query("SELECT key,value FROM app_meta WHERE key IN ('mercenary_bloodmoon_ss_pack_v1','mercenary_halloween_ss_pack_v1') ORDER BY key")).rows.map(r=>({key:r.key,sha256:sha(r.value)}));
 const stock=(await db.query("SELECT code,stock_limit,issued,revision FROM mercenary_limited_stock_v1 WHERE code IN ('V-960','V-961','V-962','V-963','V-964','V-965','V-978','V-974','V-975') ORDER BY code")).rows;
 await db.query('ROLLBACK');assert.deepEqual(settings,old.settings.map(r=>({key:r.key,sha256:r.sha256})));assert.deepEqual(stock,old.stock);
 const response=await fetch('https://cnine-card.pages.dev/api/mercenaries/v3/bloodmoon-pack/feature'),after=await response.json();assert.equal(response.status,200);
 for(const key of ['releaseEnabled','userOpeningEnabled','settings','stock','normalCards'])assert.deepEqual(after[key],before[key],key);
 const wrangler=path.join(path.dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),'bin/wrangler.js');
 const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;
 if(!token)throw Error('Cloudflare authentication unavailable');
 const api=route=>fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa'+route,{headers:{Authorization:'Bearer '+token}});
 const [script,project,runtime]=await Promise.all([api('/workers/scripts/cnine-bloodmoon-performance-20261025'),api('/pages/projects/cnine-card'),api('/workers/scripts/cnine-card-api-runtime/deployments')]);
 assert.equal(script.status,404,'No permanent benchmark Worker');assert(project.ok&&runtime.ok);
 const p=(await project.json()).result,r=(await runtime.json()).result.deployments[0],deployed=p.canonical_deployment;
 const report={at:new Date().toISOString(),salesLocked:after.releaseEnabled===false&&after.userOpeningEnabled===false,settings,stock,settingsUnchanged:true,stockUnchanged:true,normalPoolUnchanged:true,databaseAuditMode:'READ ONLY',productionAccountWrites:0,permanentBenchmarkWorkerStatus:script.status,pages:{id:deployed.id,commit:deployed.deployment_trigger.metadata.commit_hash},runtime:r};
 fs.writeFileSync(path.join(out,'preservation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({salesLocked:true,settingsUnchanged:true,stockUnchanged:true,permanentBenchmarkWorkerStatus:script.status,pages:report.pages,runtimeVersion:r.versions?.[0]?.version_id}));
}catch(e){console.error(safeError(e));process.exitCode=1;}finally{if(db){await db.query('ROLLBACK').catch(()=>{});await db.end();}}
