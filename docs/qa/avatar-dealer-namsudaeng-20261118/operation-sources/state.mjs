import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
export {connect,safe};
export const out=fileURLToPath(new URL('./',import.meta.url));
export const root=path.resolve(out,'../..');
export const source=path.join(root,'operations/equipment-polish-roulette-20261114/source');
export const OP='ops:santa-sudaeng:dealer-approved-v4:20261118:replace:v1';
export const code='SANTA_SUDAENG',serial='A-40';
export const name='딜러 남수댕',role='딜러',description='남수댕의 붉은 재킷 딜러 아바타입니다.';
export const files=['sudaeng-lobby-1024.webp','sudaeng-lobby-640.webp','sudaeng-equipment-640.webp'];
export const base='assets/ui/avatars-v1/santa-20261114/';
export const tag='127f1fb9-dealer-v4';
export const urls=files.map(f=>base+f+'?v='+tag);
export const approvedSHA256='127f1fb9fb8f7f7c64a795a707f9ca36c1c6030417ae428fa5651855a70cb428';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export const git=(...a)=>execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false',...a],{cwd:source,encoding:'utf8',windowsHide:true}).trim();
export const save=(n,x)=>fs.writeFileSync(path.join(out,n+'.json'),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
export async function snapshot(c){return {
 catalog:(await c.query("SELECT * FROM avatar_catalog_v1 WHERE code LIKE 'SANTA_%' ORDER BY code")).rows,
 effects:(await c.query("SELECT * FROM avatar_effect_options_v1 WHERE avatar_code LIKE 'SANTA_%' ORDER BY avatar_code,option_order")).rows,
 ownership:(await c.query('SELECT * FROM avatar_user_ownership_v1 WHERE avatar_code=$1 ORDER BY user_id',[code])).rows,
 loadouts:(await c.query('SELECT * FROM avatar_user_loadout_v1 WHERE avatar_code=$1 ORDER BY user_id',[code])).rows,
 settings:(await c.query("SELECT key,value FROM app_meta WHERE key IN ('avatar_settings_v1',$1) ORDER BY key",[OP])).rows
};}
export async function cloud(){
 const wr=path.join(path.dirname(createRequire(path.join(source,'package.json')).resolve('wrangler/package.json')),'bin/wrangler.js');
 const auth=JSON.parse(execFileSync(process.execPath,[wr,'auth','token','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}));
 const token=auth.token||auth.apiToken||auth.oauthToken;assert(token);
 const api=async p=>{const r=await fetch('https://api.cloudflare.com/client/v4/accounts/1e7c59450a8b6e34a9d87f92ca02aeaa'+p,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});assert(r.ok,'Cloudflare '+r.status);return(await r.json()).result;};
 const [project,...workers]=await Promise.all([api('/pages/projects/cnine-card'),...['cnine-card-api-runtime','cnine-card-clan-draft'].map(async name=>({name,deployments:(await api('/workers/scripts/'+name+'/deployments')).deployments[0].versions}))]);
 const d=project.canonical_deployment;return{pages:{id:d.id,commit:d.deployment_trigger.metadata.commit_hash,status:d.latest_stage.status},workers};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 let c;try{
  c=connect();c.connectionParameters.application_name='dealer-namsudaeng-readonly';await c.connect();
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL statement_timeout='15s'");
  const data=await snapshot(c);await c.query('ROLLBACK');
  const production=await cloud();
  const assets=fs.readdirSync(path.join(source,base)).map(f=>{const b=fs.readFileSync(path.join(source,base,f));return{file:base+f,bytes:b.length,sha256:digest(b)};});
  const report={checkedAt:new Date().toISOString(),head:git('rev-parse','HEAD'),production,assets,...data};save(process.argv[2]||'baseline',report);
  console.log(JSON.stringify({head:report.head,production,target:data.catalog.find(x=>x.code===code),owners:data.ownership.length,loadouts:data.loadouts.length,priorReceipt:data.settings.some(x=>x.key===OP)}));
 }catch(e){console.error(safe(e));process.exitCode=1;}finally{await c?.end().catch(()=>{});}
}
