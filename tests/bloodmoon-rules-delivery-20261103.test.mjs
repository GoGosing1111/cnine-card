import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {isProductionFile} from '../scripts/prepare-production-assets.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replaceAll('\r\n','\n');
test('Bloodmoon entry, personal odds, CMS conditions and both shells ship the same current files',()=>{
 for(const file of ['js/app.js','onestore/js/app.js'])assert(read(file).includes('/js/mercenary-bloodmoon-pack-live.mjs?v=20261103-unique-v1'));
 const entry=read('js/mercenary-bloodmoon-pack-live.mjs');for(const token of ['personalOddsKnown','ssProbabilityDivisor','중복 획득 불가 (0%)','mercenary-bloodmoon-presentation-v2.mjs?v=20261103-unique-v1'])assert(entry.includes(token),token);
 const version=read('service-worker.js').match(/const SHELL_CACHE='soop-card-shell-v([^']+)'/)[1];assert(version.startsWith('bloodmoon-unique-20261103-v1-'));
 for(const file of ['index.html','onestore/index.html'])assert(read(file).includes('js/app.js?v='+version));
 assert(read('admin/mercenary-stock-schedule-v1.mjs').includes("s.condition==='SOLD_OUT_ONLY'"));assert(read('admin/mercenary-bloodmoon-admin-v1.mjs').includes('mercenary-stock-schedule-v1.mjs?v=20261103-soldout-v1'));
 assert(isProductionFile('shared/mercenary-bloodmoon-ownership-v1.mjs'));assert(!isProductionFile('docs/admin-master-star-limit-20261006.json'));
 const manifest=JSON.parse(read('packaging/onestore/web-build.json'));for(const file of ['onestore/index.html','onestore/js/app.js','shared/onestore-web-assets-v1.mjs'])assert.equal(createHash('sha256').update(read(file)).digest('hex'),manifest.outputs[file]);
});
