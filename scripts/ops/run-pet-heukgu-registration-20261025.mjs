import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {hash,inspect,registerHeukgu,verifyRegistration} from './pet-heukgu-registration-20261025.mjs';
const mode=process.argv[2];
assert(['read','dry-run','apply','verify'].includes(mode),'Use read, dry-run, apply or verify');
const out='docs/qa/pet-heukgu-live-20261025';
const approval=JSON.parse(fs.readFileSync(out+'/approval-20261025.json','utf8'));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),uri=new URL(connectionString);
assert(uri.hostname.endsWith('.neon.tech')&&uri.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'pet-heukgu-registration-20261025',connectionTimeoutMillis:15000});
try{
 await db.connect();let result;
 if(mode==='read'||mode==='verify'){
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const current=await inspect(db);
  result={revision:current.state.revision,petCount:current.state.document.pets.length,rawHash:hash(current.raw),preservedPetsHash:hash(current.state.document.pets),settingsHash:hash(current.settings),heukgu:current.state.document.pets.filter(p=>p.code==='PET-HEUKGU'),receipt:current.receipt};
  if(mode==='verify'){assert(current.receipt,'Registration receipt required');result.verification=await verifyRegistration(db,current.receipt,{exact:true});}
  await db.query('ROLLBACK');
 }else{
  const reviewed=JSON.parse(fs.readFileSync(out+'/read.json','utf8'));
  const options={expectedRevision:reviewed.revision,expectedRawHash:reviewed.rawHash,commit:mode==='apply'};
  let publicArt;
  if(mode==='apply'){
   const art=approval.assets[0],url='https://cnine-card.pages.dev/'+art.approvedAsset;
   const response=await fetch(url+'?verify=heukgu-20261025',{signal:AbortSignal.timeout(30000)});
   assert.equal(response.status,200,'Approved image must be deployed before registration');
   const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),art.sha256);assert.equal(bytes.length,art.bytes);
   const catalog=await fetch('https://cnine-card.pages.dev/shared/pet-art-catalog-v1.mjs?verify=heukgu-20261025',{signal:AbortSignal.timeout(30000)});
   assert.equal(catalog.status,200);assert.equal(hash(Buffer.from(await catalog.arrayBuffer())),hash(fs.readFileSync('shared/pet-art-catalog-v1.mjs')));
   publicArt={url,sha256:hash(bytes),bytes:bytes.length,catalogHashVerified:true};
  }
  const before=await inspect(db);
  result=await registerHeukgu(db,options);
  if(mode==='dry-run'){assert.deepEqual(await inspect(db),before);result.rollbackVerified=true;}
  else{
   const replay=await registerHeukgu({query:(sql,args)=>{assert(!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql),'Replay must not write');return db.query(sql,args);}},options);
   assert(replay.replayed);assert.deepEqual(replay.receipt,result.receipt);result.noWriteReplayVerified=true;result.publicArt=publicArt;
  }
 }
 fs.writeFileSync(out+'/'+mode+'.json',JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2)+'\n');
 console.log(JSON.stringify({mode,revision:result.revision??result.receipt?.revision,petCount:result.petCount??result.verification?.petCount,committed:result.committed,rollbackVerified:result.rollbackVerified,noWriteReplayVerified:result.noWriteReplayVerified,auditId:result.receipt?.auditId,heukgu:result.heukgu,verified:result.verification?.verified}));
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g,'[connection withheld]'));process.exitCode=1;}finally{await db.end();}
