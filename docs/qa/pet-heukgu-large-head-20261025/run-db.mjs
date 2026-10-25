import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root='C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site';
const out=path.join(root,'docs/qa/pet-heukgu-large-head-20261025');
const mode=process.argv[2]||'read';
const require=createRequire(path.join(root,'package.json')),pg=require('pg');
const ops=await import(pathToFileURL(path.join(root,mode==='read'?'scripts/ops/pet-heukgu-registration-20261025.mjs':'scripts/ops/pet-heukgu-large-head-20261025.mjs')));
const raw=execFileSync(process.execPath,['C:/Users/User/AppData/Local/npm-cache/_npx/74274893b9fe65d3/node_modules/neonctl/bin/cli.js','connection-string','br-misty-hat-az5in4f4','--project-id','purple-king-54735192','--database-name','cnine','--role-name','cnine_migrator','--ssl','verify-full'],{encoding:'utf8',timeout:30000,windowsHide:true,stdio:['ignore','pipe','pipe']});
const connectionString=raw.trim().replace(/^['"]|['"]$/g,''),url=new URL(connectionString);
assert(url.hostname.endsWith('.neon.tech')&&url.pathname==='/cnine');
const db=new pg.Client({connectionString,application_name:'pet-heukgu-large-head-20261025',connectionTimeoutMillis:15000});
try{
 await db.connect();fs.mkdirSync(out,{recursive:true});
 const current=await ops.inspect(db),pet=current.state.document.pets.find(p=>p.code==='PET-HEUKGU');
 let result;
 if(mode==='read')result={at:new Date().toISOString(),revision:current.state.revision,rawHash:ops.hash(current.raw),pet,petCount:current.state.document.pets.length,document:current.state.document,settingsHash:ops.hash(current.settings)};
 else if(mode==='verify')result=await ops.verifyUpdate(db,current.receipt,{exact:true});
 else {
  assert(['dry-run','apply','replay'].includes(mode));
  const reviewed=JSON.parse(fs.readFileSync(path.join(out,'read.json')));
  result=await ops.updateHeukgu(db,{expectedRevision:reviewed.revision,expectedRawHash:reviewed.rawHash,commit:mode!=='dry-run'});
 }
 const target=path.join(out,mode+'.json');assert(!fs.existsSync(target),'Preserve prior evidence before repeating');fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(mode==='read'?{mode,revision:result.revision,pet,petCount:result.petCount,settingsHash:result.settingsHash}:{mode,...result}));
}catch(error){console.error(String(error.stack||error).replace(/postgres(?:ql)?:\/\/\S+/gi,'[REDACTED]'));process.exitCode=1;}
finally{await db.end();}
