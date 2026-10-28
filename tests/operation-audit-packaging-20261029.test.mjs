import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';

test('operational receipts stay in Git while live combat files fit the Pages boundary',()=>{
 const files=execFileSync('git',['ls-files','-z'],{maxBuffer:40e6}).toString().split('\0').filter(Boolean);
 const operations=files.filter(f=>f.startsWith('operations/'));
 assert(operations.length>=14);
 for(const file of operations)assert.equal(isProductionFile(file),false,file);
 for(const file of ['operations/future-audit/grant.mjs','operations/future-audit/receipt.json'])assert.equal(isProductionFile(file),false,file);
 for(const file of ['index.html','js/battle-v3-live.js','preview/project-v-v3/project-v-pixi-battle.bundle.js','preview/coop-defense-v1/defense.bundle.js','pve-v3/battle.bundle.js'])assert(isProductionFile(file),file);
 const count=files.filter(isProductionFile).filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;
 assert(count<=20000,'Pages asset count '+count);
});
