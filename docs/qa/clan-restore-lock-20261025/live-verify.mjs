import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {connect} from 'file:///C:/Users/User/Downloads/upload/cnine-card/output/territory-finish-rewards-20261022/connect.mjs';
const out='C:/Users/User/Downloads/upload/cnine-card/output/clan-restore-lock-20261025',mode=process.argv[2]||'before';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const require=createRequire(import.meta.url),wrangler=join(dirname(require.resolve('wrangler/package.json')),'bin/wrangler.js');
const auth=JSON.parse(execFileSync(process.execPath,[wrangler,'auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}));
const cf=async route=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa'+route,{headers:{Authorization:'Bearer '+(auth.token||auth.apiToken||auth.oauthToken)},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Cloudflare GET '+r.status);return r;};
const project=await (await cf('/pages/projects/cnine-card')).json(),d=project.result.canonical_deployment;
const result={deployment:{id:d.id,url:d.url,source:d.deployment_trigger.metadata.commit_hash,status:d.latest_stage.status},tables:{}};
const db=await connect();
try{
 await db.query('BEGIN READ ONLY');
 for(const table of ['clan_seasons','clan_members','clan_wars','clan_championships','clan_season_teams','organization_members_v1','organization_faction_state_v1','organization_faction_days_v1','organization_faction_treasury_v1','organization_faction_settlements_v1']){
  const {rows}=await db.query('SELECT row_to_json(t)::text AS row FROM '+table+' t ORDER BY row_to_json(t)::text');result.tables[table]={count:rows.length,sha256:sha(JSON.stringify(rows))};
 }
 result.settings=(await db.query("SELECT key,value FROM app_meta WHERE key IN ('clan_settings_v1','clan_draft_scheduler_v1','organization_scheduler_v1') ORDER BY key")).rows;
 await db.query('ROLLBACK');
}finally{await db.end();}
if(mode==='after'){
 const before=JSON.parse(fs.readFileSync(out+'/live-before.json','utf8'));
 result.preserved=Object.entries(before.tables).map(([table,data])=>({table,equal:JSON.stringify(data)===JSON.stringify(result.tables[table])}));
 const files=execFileSync('git',['diff','--name-only',before.deployment.source,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(f=>/^(js|css|admin|shared|organization)\//.test(f)||f==='index.html');
 result.publicFiles=[];
 for(const file of files){const r=await fetch(d.url+'/'+file+'?clanRestore=20261025',{signal:AbortSignal.timeout(30000)});const bytes=Buffer.from(await r.arrayBuffer());result.publicFiles.push({file,status:r.status,equal:r.ok&&sha(bytes)===sha(fs.readFileSync(file))});}
 result.workers=[];
 for(const name of ['cnine-card-api-runtime','cnine-card-clan-draft']){
  const source=await (await cf('/workers/scripts/'+name)).text();
  result.workers.push({name,restoration:source.includes('20261025-restored-locked'),locked:source.includes('SCHEDULE_LOCKED'),noPoints:source.includes('pointsIncluded: false')||source.includes('pointsIncluded:false')});
 }
}
fs.writeFileSync(out+'/live-'+mode+'.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,settings:result.settings.map(r=>({key:r.key,value:r.key.includes('scheduler')?JSON.parse(r.value):{mode:JSON.parse(r.value).mode,scheduleEnabled:JSON.parse(r.value).scheduleEnabled}}))}));
