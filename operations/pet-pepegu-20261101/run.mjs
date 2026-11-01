import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {connect,safe} from '../rap-contest-rewards-20261027/preflight.mjs';
const root='C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout',mode=process.argv[2];
assert(['read','dry-run','apply','verify'].includes(mode));
const source='scripts/ops/pet-pepegu-registration-20261101.mjs';
const {hash,inspect,registerPepegu,verifyRegistration}=await import(pathToFileURL(path.join(root,source)));
const approval=JSON.parse(await fs.readFile(path.join(root,'docs/qa/pet-pepegu-20261101/approval-20261101.json'),'utf8'));
const sourceHash=hash(await fs.readFile(path.join(root,source))),db=connect();
const read=async p=>JSON.parse(await fs.readFile(new URL('./'+p+'.json',import.meta.url),'utf8'));
try{
 await db.connect();let result;
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='20s'");
  const current=await inspect(db);
  result={revision:current.state.revision,petCount:current.state.document.pets.length,rawHash:hash(current.raw),preservedPetsHash:hash(current.state.document.pets),settingsHash:hash(current.settings),heukgu:current.state.document.pets.find(p=>p.code==='PET-HEUKGU'),pepegu:current.state.document.pets.filter(p=>p.code==='PET-PEPEGU'),receipt:current.receipt,readOnly:true,sourceHash};
  if(mode==='read'){assert.equal(current.receipt,null);assert.equal(result.pepegu.length,0);}
  else{assert(current.receipt);result.verification=await verifyRegistration(db,current.receipt,{exact:true});}
  await db.query('ROLLBACK');
 }else{
  const reviewed=await read('read');assert.equal(reviewed.sourceHash,sourceHash);
  const options={expectedRevision:reviewed.revision,expectedRawHash:reviewed.rawHash,commit:mode==='apply'};
  if(mode==='apply'){
   const dry=await read('dry-run');assert.equal(dry.sourceHash,sourceHash);assert.equal(dry.rollbackVerified,true);assert.equal(dry.committed,false);
   const art=approval.assets[0],r=await fetch('https://cnine-card.pages.dev/'+art.approvedAsset+'?verify=pepegu-20261101',{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200);
   const b=Buffer.from(await r.arrayBuffer());assert.equal(hash(b),art.sha256);assert.equal(b.length,art.bytes);
   const catalog=await fetch('https://cnine-card.pages.dev/shared/pet-art-catalog-v1.mjs?verify=pepegu-20261101',{signal:AbortSignal.timeout(30000)});assert.equal(catalog.status,200);assert.equal(hash(Buffer.from(await catalog.arrayBuffer())),hash(await fs.readFile(path.join(root,'shared/pet-art-catalog-v1.mjs'))));
  }
  const before=await inspect(db);result=await registerPepegu(db,options);
  if(mode==='dry-run'){assert.deepEqual(await inspect(db),before);result.rollbackVerified=true;}
  else{const replay=await registerPepegu({query:(sql,args)=>{assert(!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql));return db.query(sql,args);}},options);assert(replay.replayed);assert.deepEqual(replay.receipt,result.receipt);result.noWriteReplayVerified=true;}
  result.sourceHash=sourceHash;
 }
 result.checkedAt=new Date().toISOString();await fs.writeFile(new URL('./'+mode+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,revision:result.revision??result.receipt?.revision,petCount:result.petCount??result.verification?.petCount,pepegu:result.pepegu,committed:result.committed,rollbackVerified:result.rollbackVerified,noWriteReplayVerified:result.noWriteReplayVerified,auditId:result.receipt?.auditId,verified:result.verification?.verified,alreadyExists:!!result.receipt}));
}catch(e){await db.query('ROLLBACK').catch(()=>{});console.error(safe(e));process.exitCode=1;}finally{await db.end().catch(()=>{});}
