import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n'),hash=v=>createHash('sha256').update(v).digest('hex');
test('eleven V3 consumers match their source hashes and include the accelerated awakening',()=>{
 const report=JSON.parse(read('preview/project-v-v3/grid-build-report.json')),version=read('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
 assert(version.endsWith('-zero-awakening-20261115-v1'));assert.equal(report.outputs.length,11);
 for(const s of report.sources)assert.equal(hash(read(s.file)),s.sha256,s.file);
 for(const output of report.outputs){const bundle=read(output.file);assert.equal(hash(bundle),output.sha256,output.file);
  // Defense constructs the shared engine directly, without the main global API.
  if(output.file!=='preview/coop-defense-v1/defense.bundle.js')assert(bundle.includes(version),output.file);
  assert(bundle.includes('MS-1096'),output.file);assert(bundle.includes('ZeroAwakeningEffects'),output.file);
 }
 for(const file of ['js/app.js','onestore/js/app.js','preview/project-v-v3/source/project-v-pixi-battle.src.js'])assert(read(file).includes(version),file);
 for(const file of ['index.html','onestore/index.html','service-worker.js'])assert.match(read(file),/zero-awakening(?:15|-20261115)-v1/,file);
});
test('deployed body and effect assets exactly match the user-approved image hashes',()=>{
 const approval=JSON.parse(read('docs/qa/zero-awakening-release-20261115/approval.json'));
 assert.equal(approval.assets.filter(a=>a.file.endsWith('.png')).length,4);
 for(const a of approval.assets){const bytes=fs.readFileSync(new URL('../'+a.file,import.meta.url));assert.equal(bytes.length,a.bytes);assert.equal(hash(bytes),a.sha256,a.file);}
 const runtime=read('preview/zero-awakening-20261115/source/ZeroAwakening.js');assert(!runtime.includes('/output/'));assert(!runtime.includes('QA-ZERO'));assert(!runtime.includes("'effects/runtime"));
});
