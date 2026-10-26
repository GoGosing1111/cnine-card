import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isProductionFile,prepareProductionAssets} from '../scripts/prepare-production-assets.mjs';

test('standalone store packaging stays in Git while the existing web game stays within the Pages cap',async()=>{
 const all=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:40e6}).split('\0').filter(Boolean);
 const offline=all.filter(file=>file.startsWith('packaging/onestore/')||file.startsWith('scripts/onestore/')||file==='tests/android-native/StoreDistributionTest.java');
 for(const file of ['packaging/onestore/web/bootstrap.mjs','scripts/onestore/prepare-apk.mjs','tests/android-native/StoreDistributionTest.java'])assert.ok(offline.includes(file),file);
 for(const file of offline){assert.equal(isProductionFile(file),false,file);assert.ok(fs.existsSync(file),file);}
 // Preserve all existing game files, including the older published native-test path.
 const runtime=['functions/_mercenary_level.js','shared/mercenary-level-v1.mjs','mercenary-codex/leveling/app.mjs'];
 for(const file of [...runtime,'tests/android-native/ClientCoreTest.java','packaging/unrelated/file.js'])assert.equal(isProductionFile(file),true,file);
 const count=all.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert.ok(count<=20000,`Pages file count ${count}`);
 const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const before=new Map([...runtime,...offline].map(file=>[file,hash(file)]));
 const stage=await prepareProductionAssets({files:[...runtime,...offline]});
 try{for(const file of runtime)assert.equal(hash(path.join(stage.directory,file)),before.get(file));for(const file of offline)assert.equal(fs.existsSync(path.join(stage.directory,file)),false);}
 finally{await stage.dispose();}
 for(const [file,digest] of before)assert.equal(hash(file),digest,'Preserved original: '+file);
});
