import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {isProductionFile,revanAuthoringOnly} from '../scripts/prepare-production-assets.mjs';
test('Revan delivery preserves art and live resources while retaining excluded authoring originals in Git',()=>{
 for(const file of revanAuthoringOnly){assert(fs.existsSync(file),file);assert.equal(isProductionFile(file),false,file);}
 const root='assets/ui/project-v/mercenaries/revan-20261027/';const manifest=JSON.parse(fs.readFileSync(root+'motion-manifest.json'));
 assert.equal(Object.keys(manifest.files).length,11);for(const entry of Object.values(manifest.files))assert(isProductionFile(root+entry.file),entry.file);
 for(const file of [root+'motion-manifest.json','shared/mercenary-revan-v1.mjs','assets/ui/project-v/mercenaries/reaper-mask-20261027/source-art-approved-v9.png'])assert(isProductionFile(file),file);
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:32e6}).split('\0').filter(Boolean);const delivery=files.filter(isProductionFile);assert(delivery.length<=20000,'Pages count '+delivery.length);
});
