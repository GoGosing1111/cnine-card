import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
test('Tower UI images and browser entry ship within the Pages limit; exact sources and authoring files stay in Git',()=>{
 const qa='docs/qa/tower-abyss-ui-20261021/',manifest=JSON.parse(fs.readFileSync(qa+'art-manifest.json','utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
 for(const art of manifest.files){
  assert.equal(hash(fs.readFileSync(art.source)),art.sourceSha256);assert.equal(hash(fs.readFileSync(art.runtime)),art.runtimeSha256);
  assert.equal(isProductionFile(art.source),false);assert.equal(isProductionFile(art.runtime),true);
 }
 for(const file of ['js/tower-abyss-ui.js','js/tower-v1038.js','css/tower-abyss-ui.css','preview/infinite-tower-v3-v1/app.bundle.js','preview/infinite-tower-v3-v1/battle.bundle.js','docs/infinite-tower-limit-push-v2.md'])assert.equal(isProductionFile(file),true,file);
 for(const file of ['docs/cow-tower-live-on-2092-20260913.md','docs/infinite-tower-v3-economy-draft-20260911.md','docs/pve-combat-only-2094-20260913.md','preview/infinite-tower-v3-v1/README.md','preview/infinite-tower-v3-v1/source/app.mjs']){assert.ok(fs.existsSync(file));assert.equal(isProductionFile(file),false,file);}
 const index=fs.readFileSync('index.html','utf8');assert.ok(index.indexOf('js/tower-abyss-ui.js')<index.indexOf('js/tower-v1038.js'));assert.match(index,/css\/tower-abyss-ui\.css\?v=/);
 const files=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean).filter(isProductionFile);
 const count=files.filter(p=>!p.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(p)).length+1;
 assert.ok(count<=20000,`Pages asset count ${count}`);console.log(`Tower delivery: ${count}/20000 files; source PNGs preserved.`);
});
