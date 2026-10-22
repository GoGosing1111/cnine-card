import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {isProductionFile,prepareProductionAssets} from '../scripts/prepare-production-assets.mjs';

test('approved pumpkin PNGs and catalog ship unchanged within Pages cap while exact QA exclusions stay in Git',async()=>{
 const approvalPath='assets/ui/pets/pumpkin-duo-20261022/approval-20261022.json';
 const approval=JSON.parse(await readFile(approvalPath,'utf8'));
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 const art=approval.assets.map(asset=>asset.approvedAsset);
 assert.equal(art.length,2);
 const legacyPet='assets/ui/pets/gusudaeng/pet-tokki-gusudaeng-approved-20261002.png';
 const runtime=['shared/pet-art-catalog-v1.mjs',...art,legacyPet];
 const excluded=[approvalPath,'tests/qa-core-reward-v2-live.mjs','tests/serve-core-rewards-qa.mjs'];
 const originals=new Map();
 for(const file of [...runtime,...excluded])originals.set(file,hash(await readFile(file)));
 for(const asset of approval.assets)assert.equal(originals.get(asset.approvedAsset),asset.sha256,asset.approvedAsset);
 for(const file of runtime)assert.equal(isProductionFile(file),true,file);
 for(const file of excluded)assert.equal(isProductionFile(file),false,file);
 // The filter is an exact list: adjacent art metadata and unrelated test runners
 // retain their existing delivery behavior; no directory-wide exclusion is added.
 for(const file of ['assets/ui/pets/bazzi-bongsoon-20261016/approval-20261016.json','tests/navigation-deck-ui-v1880.mjs']){
  await access(file);assert.equal(isProductionFile(file),true,file);
 }
 const tracked=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 for(const file of [...runtime,...excluded])assert.ok(tracked.includes(file),'Stage the release file before packaging verification: '+file);
 const count=tracked.filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file)).length+1;
 assert.ok(count<=20000,`Pages asset count ${count}`);
 const stage=await prepareProductionAssets({files:[...runtime,...excluded]});
 try{
  for(const file of runtime)assert.equal(hash(await readFile(path.join(stage.directory,file))),originals.get(file),file);
  for(const file of excluded)await assert.rejects(access(path.join(stage.directory,file)));
  const desktop=JSON.parse(await readFile(path.join(stage.directory,'client/windows/manifest.json'),'utf8'));
  for(const file of ['shared/pet-art-catalog-v1.mjs',...art])assert.ok(desktop.files.some(item=>item.path==='/'+file),file);
 }finally{await stage.dispose();}
 for(const [file,sha] of originals)assert.equal(hash(await readFile(file)),sha,'Repository original retained: '+file);
 console.log(`Pumpkin pet delivery: ${count}/20000 files; approved originals and QA sources retained.`);
});
