import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {isProductionFile,prepareProductionAssets,experienceTransferAuthoringOnly} from '../scripts/prepare-production-assets.mjs';
const root=process.cwd(),assetRoot='assets/items/mercenary-experience-transfer-20261025/',hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=file=>fs.existsSync(file)?fs.readFileSync(file):execFileSync('git',['show','HEAD:'+file],{maxBuffer:40e6});
test('exact authoring-only exclusions retain source bytes and ship all experience transfer runtime assets within the Pages cap',async()=>{
 const runtime=[assetRoot+'potion.webp','shared/mercenary-experience-transfer-v1.mjs','mercenary-codex/leveling/transfer.html','mercenary-codex/leveling/transfer.mjs','mercenary-codex/leveling/transfer.css'];
 const manifest=JSON.parse(bytes(assetRoot+'manifest.json'));assert.equal(hash(bytes(assetRoot+'original.png')),manifest.sha256['original.png']);assert.equal(hash(bytes(assetRoot+'potion.webp')),manifest.sha256['potion.webp']);
 assert.equal(experienceTransferAuthoringOnly.size,7);for(const file of experienceTransferAuthoringOnly)assert.equal(isProductionFile(file),false,file);
 for(const file of [...runtime,assetRoot+'runtime.json',assetRoot+'nested/original.png','scripts/other-command.py'])assert.equal(isProductionFile(file),true,file);
 const all=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:40e6}).split('\0').filter(Boolean),count=all.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert(count<=20000,`Pages file count ${count}`);
 const before=new Map([...runtime,...experienceTransferAuthoringOnly].map(file=>[file,hash(bytes(file))]));
 const stage=await prepareProductionAssets({root,files:[...runtime,...experienceTransferAuthoringOnly]});
 try{assert.equal(stage.assetCount,runtime.length+1);for(const file of runtime)assert.equal(hash(fs.readFileSync(path.join(stage.directory,file))),before.get(file));for(const file of experienceTransferAuthoringOnly)assert.equal(fs.existsSync(path.join(stage.directory,file)),false);}finally{await stage.dispose();}
 for(const [file,original] of before)assert.equal(hash(bytes(file)),original,'Source preserved: '+file);
 console.log(`Experience transfer delivery ${count}/20000; exact originals and Python tools retained in Git.`);
});
