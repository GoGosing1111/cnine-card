import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MATERIAL,OPERATION_KEY,inspectMaterial,registerMaterial,verifyMaterial,protectedState} from './register.mjs';
const out=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(out,'../../..'),require=createRequire(root+'/package.json'),mode=process.argv[2];
assert(['read','dry-run','apply','verify'].includes(mode));assert.equal(process.argv.length,3);
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,data)=>fs.writeFileSync(out+'/'+name,JSON.stringify(data,null,2)+'\n');
for(const [file,sha] of [[MATERIAL.source,MATERIAL.sourceHash],[MATERIAL.image,MATERIAL.imageHash]])assert.equal(hash(fs.readFileSync(root+'/'+file)),sha);
let connectionString;
async function connect(){
 if(!connectionString){
  const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
  connectionString=raw.trim().replace(/^['"]|['"]$/g,'');const u=new URL(connectionString);assert(u.hostname.endsWith('.neon.tech')&&u.pathname==='/cnine');
 }
 const c=new (require('pg').Client)({connectionString,application_name:'prime-requiem-blueprint-'+mode,connectionTimeoutMillis:15000});await c.connect();return c;
}
async function read(c,fn){await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');try{return await fn();}finally{await c.query('ROLLBACK');}}
const assets=async()=>Promise.all([[MATERIAL.image,MATERIAL.imageHash]].map(async([file,expected])=>{
 const url='https://cnine-card.pages.dev/'+file,response=await fetch(url+'?verify=prime-blueprint-20261026',{signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);const sha256=hash(Buffer.from(await response.arrayBuffer()));assert.equal(sha256,expected);return {url,status:response.status,sha256};
}));
let c;
try{
 c=await connect();
 if(mode==='read'){
  const r=await read(c,async()=>({...await inspectMaterial(c),protectedStateHash:hash(JSON.stringify(await protectedState(c)))}));save('before.json',{checkedAt:new Date().toISOString(),...r});console.log(JSON.stringify({matchingItems:r.items.map(i=>({code:i.code,name:i.name,isActive:i.is_active})),existingReceipt:Boolean(r.receipt),protectedStateHash:r.protectedStateHash}));
 }else if(mode==='verify'){
  const r=await read(c,()=>verifyMaterial(c));save('verification.json',r);console.log(JSON.stringify({verified:r.verified,itemCode:r.items[0].code,cmsVisible:r.cmsVisible,adminLogId:r.receipt.adminLogId,grantedQuantity:r.receipt.grantedQuantity}));
 }else{
  const proof=await assets();save('public-assets.json',proof);
  const before=await read(c,async()=>({registration:await inspectMaterial(c),protected:await protectedState(c)}));
  if(mode==='apply'){
   const dry=JSON.parse(fs.readFileSync(out+'/dry-run.json','utf8'));assert.equal(dry.rolledBack,true);assert.equal(dry.operationKey,OPERATION_KEY);
   assert.equal(dry.operationSourceHash,hash(fs.readFileSync(out+'/register.mjs')));
  }
  const r=await registerMaterial(c,proof,{dryRun:mode==='dry-run'});
  if(mode==='dry-run'){
   assert.equal(r.rolledBack,true);const after=await read(c,async()=>({registration:await inspectMaterial(c),protected:await protectedState(c)}));assert.deepEqual(after,before);
   const report={checkedAt:new Date().toISOString(),operationKey:OPERATION_KEY,operationSourceHash:hash(fs.readFileSync(out+'/register.mjs')),rolledBack:true,existingPoliciesPreserved:true,previewAuditId:r.receipt.adminLogId};save('dry-run.json',report);console.log(JSON.stringify(report));
  }else{
   save('production.json',r);await c.end();c=await connect();const verified=await read(c,()=>verifyMaterial(c));save('verification.json',verified);
   assert.deepEqual(await read(c,()=>protectedState(c)),before.protected);
   const replay=await registerMaterial(c,proof);assert.equal(replay.alreadyRegistered,true);assert.equal(replay.receipt.adminLogId,r.receipt.adminLogId);
   save('replay.json',{checkedAt:new Date().toISOString(),alreadyRegistered:true,adminLogId:replay.receipt.adminLogId,duplicateItems:0,additionalCatalogWrites:0});
   console.log(JSON.stringify({completed:true,alreadyRegistered:r.alreadyRegistered,itemCode:MATERIAL.code,name:MATERIAL.name,adminLogId:r.receipt.adminLogId,completedAt:r.receipt.completedAt,cmsVisible:verified.cmsVisible,mercenaryCraftSelectable:r.receipt.mercenaryCraftSelectable,protectedPoliciesUnchanged:true,grantedQuantity:0}));
  }
 }
}catch(e){console.error(JSON.stringify({ok:false,mode,message:String(e.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted connection]')}));process.exitCode=1;}finally{await c?.end().catch(()=>{});}
