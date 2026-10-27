import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
const read=f=>fs.readFileSync(f,'utf8'),hash=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
test('all ten current V3 bundles contain Revan and match their source report',()=>{
 const report=JSON.parse(read('preview/project-v-v3/grid-build-report.json'));assert.equal(report.outputs.length,10);
 for(const entry of report.outputs){const text=read(entry.file);assert(text.includes('MERCENARY_REVAN_AREA'),entry.file);assert(text.includes('revan-general-jok-20261027-v2'),entry.file);assert.equal(hash(text),entry.sha256,entry.file);}
 for(const entry of report.sources.filter(s=>s.file.includes('revan')||s.file.includes('Revan')))assert.equal(hash(read(entry.file)),entry.sha256,entry.file);
});
test('main loader, wrapper and installed shell share the Revan runtime and cache key',()=>{
 const entry=read('preview/project-v-v3/source/project-v-pixi-battle.src.js'),wrapper=read('js/battle-v3-live.js'),app=read('js/app.js');
 const version=wrapper.match(/const BATTLE_RUNTIME = '([^']+)'/)[1];assert(version.includes('-revan-general-jok-20261027-v2'));assert(entry.includes(version));assert(app.includes(version));
 assert.equal((app.match(/\?blackcrown=20261027-live-v1&revan=20261027-general-jok-v2&/g)||[]).length,4,'both loader URLs and both stale-runtime filters stay paired');
 const key=read('index.html').match(/js\/app\.js\?v=([^&"]+)/)[1];assert.equal(read('service-worker.js').match(/const SHELL_CACHE='([^']+)'/)[1],'soop-card-shell-v'+key);
 for(const file of ['mercenary-codex/index.html','mercenary-codex/shell.mjs','mercenary-codex/app.mjs'])assert(read(file).includes('revan=20261027-general-jok-v2'),file);
});
