import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const qa='docs/qa/tower-monsters-20261022/',hash=b=>createHash('sha256').update(b).digest('hex');
if(!process.env.CNINE_OPERATIONS_CONNECTOR||!process.env.CNINE_CLOUDFLARE_CONNECTOR)throw Error('Use existing private read-only operations connectors');
const {connect,safeError}=await import(pathToFileURL(process.env.CNINE_OPERATIONS_CONNECTOR));
const {cf,account}=await import(pathToFileURL(process.env.CNINE_CLOUDFLARE_CONNECTOR));
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
async function cloud(path){const response=await cf('accounts/'+account+'/'+path);assert.equal(response.status,200);const body=typeof response.body==='string'?JSON.parse(response.body):response.body;assert.equal(body.success,true);return body.result;}
const project=await cloud('pages/projects/cnine-card'),deployed=project.canonical_deployment;
assert.equal(deployed.latest_stage.status,'success');assert.equal(deployed.deployment_trigger.metadata.commit_hash,source);
const manifest=JSON.parse(await fs.readFile('assets/ui/tower-monsters-20261022/manifest.json'));
const files=await Promise.all([...manifest.sprites.map(s=>s.image.slice(1)),'assets/ui/tower-monsters-20261022/manifest.json','shared/tower-monsters-20261022.mjs'].map(async path=>{
 const response=await fetch('https://cnine-card.pages.dev/'+path+'?verify=tower-monsters-'+source.slice(0,9),{cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,path);
 let actual=Buffer.from(await response.arrayBuffer()),expected=await fs.readFile(path);
 if(/\.(?:json|mjs)$/.test(path)){actual=Buffer.from(actual.toString().replace(/\r\n/g,'\n'));expected=Buffer.from(expected.toString().replace(/\r\n/g,'\n'));}
 assert.equal(hash(actual),hash(expected),path);return {path,bytes:actual.length,sha256:hash(actual)};
}));
const configs=await fetch('https://cnine-card.pages.dev/api/tower/config?_='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(configs.status,200);const config=await configs.json();assert.equal(config.protocol,'TOWER_ABYSS_20261022');assert.equal(config.enabled,true);
const unauthenticated=await fetch('https://cnine-card.pages.dev/api/tower/status?_='+Date.now(),{signal:AbortSignal.timeout(20000)});assert.equal(unauthenticated.status,401);
const deploymentLog=await fs.readFile(process.env.CNINE_DEPLOY_LOG,'utf8'),versions=[...deploymentLog.matchAll(/Current Version ID: ([a-f0-9-]+)/g)].map(r=>r[1]);assert.equal(versions.length,2);
const workers=[];
for(const [index,name] of ['cnine-card-api-runtime','cnine-card-clan-draft'].entries()){
 const result=await cloud('workers/scripts/'+name+'/deployments'),list=result.deployments||result,active=[...list].sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];
 assert.ok(active.versions.some(v=>v.version_id===versions[index]&&v.percentage===100),name);workers.push({name,...active});
}
let client,cms;
try{
 client=await connect();await client.query('BEGIN READ ONLY');await client.query("SET LOCAL statement_timeout='8s'");
 const result=await client.query("SELECT r.start_floor,r.end_floor,r.monster_id,r.power_override,r.reward_coin,r.is_boss,bm.name,bm.image_url FROM tower_floor_ranges r JOIN battle_monsters bm ON bm.id=r.monster_id WHERE r.is_active=1 AND r.season_id=(SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1) ORDER BY r.start_floor,r.id");await client.query('ROLLBACK');
 const before=JSON.parse(await fs.readFile(qa+'live-cms-before.json'));cms={rows:result.rows.length,hash:hash(JSON.stringify(result.rows)),unchanged:false};cms.unchanged=cms.hash===before.hash;assert.equal(cms.unchanged,true,'Tower CMS changed; investigate without overwriting');
}catch(error){throw Error(safeError(error));}finally{await client?.end();}
const report={checkedAt:new Date().toISOString(),source,pages:{id:deployed.id,url:deployed.url,commit:source},workers,files,config,unauthenticated:unauthenticated.status,cms,accountWrites:0};
await fs.writeFile(qa+'production-verification.json',JSON.stringify(report,null,2)+'\n');console.log({source,pages:deployed.id,files:files.length,cms,accountWrites:0});
