import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

test('new local art studies stay preserved in Git while existing live assets fit Pages delivery',()=>{
 const git=(...args)=>execFileSync('git',['-c','gc.auto=0',...args],{encoding:'utf8',maxBuffer:40e6});
 const roots=['preview/v35-character-baseline-20261101/','preview/spine-professional-verification-20261101/','assets/ui/project-v/art-references/style-reset-20261101/','output/imagegen/mercenary-golden-crown-knight-20261101/','output/imagegen/mercenary-white-coat-retouch-20261101/'];
 const tracked=git('ls-files','-z').split('\0').filter(Boolean);
 const studies=tracked.filter(file=>roots.some(root=>file.startsWith(root)));assert.equal(studies.length,89);
 assert(studies.every(file=>!isProductionFile(file)));
 assert.equal(git('ls-tree','-r','--name-only','611e3a14d90067e6fede4be74713923d14510bd9','--',...roots).trim(),'','No previously deployed resource is excluded');
 const count=tracked.filter(isProductionFile).filter(file=>!file.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(file)).length+1;
 assert(count<=20000,'Pages asset count '+count);
 for(const file of ['js/streamer-lounge-v2036.js','css/streamer-lounge-v2036.css','assets/ui/streamer-lounge/premium-v1/lounge-interior.png','assets/ui/streamer-lounge/premium-v1/member-card.png','preview/project-v-v3/project-v-pixi-battle.bundle.js'])assert(isProductionFile(file),file);
});
