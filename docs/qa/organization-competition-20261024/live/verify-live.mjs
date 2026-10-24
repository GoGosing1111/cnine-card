import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=process.cwd(),out=dirname(fileURLToPath(import.meta.url)),require=createRequire(join(root,'scripts/deploy-production.mjs'));
const pg=require('pg'),wrangler=join(dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),head=process.env.FACTION_RELEASE_COMMIT||'0f0617e8acc849d16a722e145bbbcd2299da4ee0';
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})),token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
const base='https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa';
async function cf(path,json=true){const response=await fetch(base+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(response.ok,'Cloudflare verification '+response.status+' '+path);if(!json)return response.text();const body=await response.json();assert(body.success);return body.result;}
const project=await cf('/pages/projects/cnine-card'),deployment=project.canonical_deployment;assert.equal(deployment.deployment_trigger.metadata.commit_hash,head);assert.equal(deployment.latest_stage.status,'success');
const runtime=[];
for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){
 const deployments=await cf('/workers/scripts/'+name+'/deployments'),content=await cf('/workers/scripts/'+name,false);
 const marker={weekly:content.includes('competition:v1:week:'),season:content.includes('competition:v1:season:'),pigCoin:content.includes('pigCoinReward')};assert(Object.values(marker).every(Boolean));runtime.push({name,deployment:(()=>{const d=deployments.deployments?.[0]||deployments[0];return {id:d.id,source:d.source,strategy:d.strategy,versions:d.versions,createdAt:d.created_on};})(),bundleSha256:createHash('sha256').update(content).digest('hex'),marker});
}
const files=git('diff','--name-only','335eafc712dc9188c8a98b9eeba9f77a64e431ec',head).split('\n').filter(f=>/^(js|css|admin|organization|shared)\/.*\.(mjs|js|css|html)$/.test(f));
const publicFiles=[];
for(const file of files){const response=await fetch('https://cnine-card.pages.dev/'+file+'?release='+head,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,file);const actual=Buffer.from(await response.arrayBuffer()),local=await readFile(join(root,file));assert.deepEqual(actual,local,file+' production bytes');publicFiles.push({path:file,bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex')});}
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'faction-live-readonly-20261024',connectionTimeoutMillis:15000});let database;
try{
 await db.connect();await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const [p]=await q('SELECT revision,policy_json FROM organization_faction_policy_v1 WHERE id=1'),[r]=await q("SELECT id,scope,phase FROM organization_rounds_v1 WHERE scope='LIVE' ORDER BY created_at DESC LIMIT 1"),[row]=await q('SELECT revision,state_json FROM organization_faction_state_v1 WHERE round_id=$1',[r.id]);
 const state=JSON.parse(row.state_json),storedPolicy=JSON.parse(p.policy_json),{validateOrganizationFactionPolicy}=await import(pathToFileURL(join(root,'shared/organization-faction-v1.mjs'))),effective=validateOrganizationFactionPolicy({...storedPolicy,revision:Number(p.revision)});
 const before=JSON.parse(await readFile(join(out,'read-before.json'),'utf8'));assert.equal(Number(p.revision),before.policy.revision);assert.equal(effective.mode,'ON');assert.deepEqual(effective.pigCoinReward,{enabled:true,requiredTerritories:8,amount:200});assert.equal(effective.competition.seasonWeeks,4);assert(state.competition,'Scheduled competition initialization missing');
 assert.equal(state.competition.nextWeeklyAt,Date.parse('2026-10-26T00:00:00+09:00'));assert.equal(state.competition.season.endsAt,Date.parse('2026-11-16T00:00:00+09:00'));assert.equal(state.competition.season.weeksSettled,0);assert.equal(state.competition.weeklyHistory.length,0);assert.equal(state.competition.seasonHistory.length,0);
 const holdings=state.districts.reduce((a,d)=>(a[d.owner]=(a[d.owner]||0)+1,a),{});assert.deepEqual(holdings,before.holdings);assert.equal(state.session?.key,before.session?.key);
 const [receipts]=await q("SELECT COUNT(*)::int AS count FROM organization_faction_settlements_v1 WHERE round_id=$1 AND session_key LIKE 'competition:v1:%'",[r.id]);assert.equal(receipts.count,0);
 database={readOnly:true,policyRevision:Number(p.revision),mode:effective.mode,pigCoinReward:effective.pigCoinReward,competitionPolicy:effective.competition,round:r,stateRevision:Number(row.revision),holdings,competition:state.competition,settlementReceipts:receipts.count,oldSessionPreserved:true};await db.query('ROLLBACK');
}catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{await db.end();}
const report={checkedAt:new Date().toISOString(),sourceCommit:head,pages:{id:deployment.id,url:deployment.url,createdAt:deployment.created_on,status:deployment.latest_stage.status},runtime,publicFiles,database,manualAccountGrants:0,noticePublished:false};await writeFile(join(out,'live-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({source:head,pages:report.pages,workers:runtime.map(r=>({name:r.name,marker:r.marker})),publicFiles:publicFiles.length,policy:database.pigCoinReward,firstWeeklyAt:database.competition.nextWeeklyAt,firstSeasonEndsAt:database.competition.season.endsAt,settlementReceipts:database.settlementReceipts}));

