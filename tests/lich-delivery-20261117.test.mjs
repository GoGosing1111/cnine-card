import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Isgen keeps its build provenance in Git while delivering the runtime and matching cache versions',()=>{
 assert.equal(isProductionFile('preview/lich-king-raid-v1/build-report.json'),false);
 assert(read('preview/lich-king-raid-v1/build-report.json').includes('sharedEngine'));
 for(const p of ['preview/lich-king-raid-v1/battle.bundle.js','shared/lich-boss-health-v1.mjs','raid/lich-king/inline.mjs','js/lich-king-raid-entry-v1.js'])assert.equal(isProductionFile(p),true,p);
 const tag=read('service-worker.js').match(/soop-card-shell-v([^']+)/)[1];
 assert.equal(read('index.html').match(/js\/app\.js\?v=([^"'&]+)/)[1],tag);
 const raidTag=read('js/lich-king-raid-entry-v1.js').match(/const VERSION = '([^']+)'/)[1];
 for(const p of ['index.html','onestore/index.html','raid/lich-king/inline.mjs'])assert(read(p).includes(raidTag),p);
 assert(read('raid/lich-king/index.html').includes('src="live.mjs?v='+raidTag+'"'),'standalone entry refreshes the same client module');
});
test('cold inline entry waits for the common runtime and bundle together, shares one load and retries a failed load',async()=>{
 let resolve,reject,calls=0,scripts=0;
 const context=vm.createContext({window:{CNineCoreRaidBridge:{ensureFeatureResources(key){assert.equal(key,'battleV2');calls++;return new Promise((a,b)=>{resolve=a;reject=b;});}}},document:{createElement:()=>({}),head:{appendChild(node){scripts++;queueMicrotask(()=>node.onload());}}}});
 vm.runInContext(read('raid/lich-king/inline.mjs').replace(/^import[^\n]+\n/,'').replace('export async function','async function'),context);
 const first=vm.runInContext('loadBattle()',context);assert.equal(first,vm.runInContext('loadBattle()',context));
 let ready=false;first.then(()=>{ready=true;},()=>{});await Promise.resolve();assert.equal(ready,false);assert.equal(calls,1);assert.equal(scripts,1);
 reject(Error('temporary runtime failure'));await assert.rejects(first,/temporary runtime failure/);
 const retry=vm.runInContext('loadBattle()',context);assert.equal(calls,2);assert.equal(scripts,2);resolve();await retry;
 assert.equal(retry,vm.runInContext('loadBattle()',context));assert.equal(calls,2);
});
