import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
test('the bounded release ships five frames and every live bundle while retaining local-only authoring in Git',()=>{
 const files=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const count=files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert(count<=20000,'Pages count '+count);
 const manifest=JSON.parse(fs.readFileSync('docs/qa/sss-area-cutins-20261028/dialogue-generation.json'));
 for(const row of manifest.assets)assert(isProductionFile(row.destination));
 const build=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 for(const row of build.outputs)assert(isProductionFile(row.file));
 for(const file of ['shared/mercenary-area-cutins-v1.mjs','preview/project-v-v3/source/battle/MercenaryAreaCutinPlayback.js','preview/project-v-v3/source/battle/MercenaryAreaDialogueStyle.js','preview/project-v-v3/grid-build-report.json','preview/battle-suit-skill-chip-v1/build-report.json','preview/sustained-hunt-v2/engine-build.json',...files.filter(f=>f.startsWith('preview/sss-area-cutscenes-20261028/'))]){
  assert(files.includes(file));assert(fs.existsSync(file));assert(!isProductionFile(file),file);
 }
});
