import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8').replaceAll('\r\n','\n');
test('both live entrypoints load the reviewed Black Crown bundle and current scheduled-opening cache',()=>{
 for(const file of ['js/app.js','onestore/js/app.js']){const source=read(file);assert(source.includes("import('/js/mercenary-blackcrown-pack-live.bundle.mjs?blackcrownBalance=20261031-v1&sss=20261027-cardgu-revan-v1&v=20261027-buttons-v4&opening=20261031-v2')"));assert(source.includes('pack.drawEnabled||pack.openingScheduled'));}
 for(const file of ['index.html','onestore/index.html'])assert.match(read(file),/<script[^>]+src="js\/app\.js\?[^"\n]*blackcrownOpening=20261031-v2/);
 assert(read('service-worker.js').match(/soop-card-shell-v([^']+)/)[1].includes('blackcrown-opening-20261031-v2-'));
 assert.equal(read('index.html').match(/js\/app\.js\?v=([^"'&]+)/)[1],read('service-worker.js').match(/soop-card-shell-v([^']+)/)[1]);
 const bundle=read('js/mercenary-blackcrown-pack-live.bundle.mjs');for(const token of ['data-bcp-opening-cancel','BLACKCROWN_OPENING_CANCELLED','beforeOpen','openingScheduled','100000000000000n'])assert(bundle.includes(token),token);
 assert(bundle.includes('/css/mercenary-blackcrown-pack.bundle.css?sss=20261027-cardgu-revan-v1&v=20261027-buttons-v4&opening=20261031-v2'));
 const css=read('css/mercenary-blackcrown-pack.bundle.css');assert(css.includes('.bcp-opening-stage img{position:absolute;'));assert(css.includes('@media(prefers-reduced-motion:reduce)'));
 const manifest=JSON.parse(read('packaging/onestore/web-build.json'));for(const file of ['onestore/index.html','onestore/js/app.js','shared/onestore-web-assets-v1.mjs'])assert.equal(createHash('sha256').update(read(file)).digest('hex'),manifest.outputs[file]);
});
