import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {isProductionFile,prepareProductionAssets} from '../scripts/prepare-production-assets.mjs';

test('Heukgu approved PNG ships intact within Pages cap; photo reference and provenance stay in Git',async()=>{
 const qa='docs/qa/pet-heukgu-live-20261025/';
 const approval=JSON.parse(await readFile(qa+'approval-20261025.json','utf8'));
 const art=approval.assets[0],runtime=['shared/pet-art-catalog-v1.mjs','css/pet-equipment-v1.css',art.approvedAsset];
 const excluded=[qa+'approval-20261025.json',qa+'reference-original.png',qa+'prompt-v1.txt','docs/pet-equipment-gugugaga-20261002.md','assets/ui/pets/heukgu-20261025/pet-heukgu-approved.png'];
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),originals=new Map();
 for(const file of [...runtime,...excluded])originals.set(file,hash(await readFile(file)));
 assert.equal(originals.get(art.approvedAsset),art.sha256);
 for(const file of runtime)assert(isProductionFile(file),file);
 for(const file of excluded)assert.equal(isProductionFile(file),false,file);
 const tracked=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 for(const file of [...runtime,...excluded])assert(tracked.includes(file),'Stage the release file before packaging verification: '+file);
 const count=tracked.filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file)).length+1;
 assert(count<=20000,'Pages asset count '+count);
 const stage=await prepareProductionAssets({files:[...runtime,...excluded]});
 try{
  for(const file of runtime)assert.equal(hash(await readFile(path.join(stage.directory,file))),originals.get(file));
  for(const file of excluded)await assert.rejects(access(path.join(stage.directory,file)));
  const manifest=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json'),'utf8'));
  for(const file of runtime)assert(manifest.files.some(row=>row.path==='/'+file),file);
 }finally{await stage.dispose();}
 for(const [file,sha] of originals)assert.equal(hash(await readFile(file)),sha,'Original retained: '+file);
 console.log(`Heukgu delivery: ${count}/20000 files; original photo and provenance retained in Git.`);
});
