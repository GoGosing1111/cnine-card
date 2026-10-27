import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {isProductionFile,cardguAuditOnly} from '../scripts/prepare-production-assets.mjs';
const read=f=>fs.readFileSync(f,'utf8'),hash=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
test('all eleven shipped V3 consumers embed Cardgu and the same verified source',()=>{
 const report=JSON.parse(read('preview/project-v-v3/grid-build-report.json'));assert.equal(report.outputs.length,11);
 assert(report.outputs.some(e=>e.file==='preview/coop-defense-v1/defense.bundle.js'));
 for(const e of report.outputs){const s=read(e.file);assert(s.includes('MERCENARY_CARDGU_AREA'),e.file);if(e.file!=='preview/coop-defense-v1/defense.bundle.js')assert(s.includes('cardgu-live-20261027-v1'),e.file);else assert(s.includes('CARDGU_ROYAL_POKER'));assert.equal(hash(s),e.sha256,e.file);}
 for(const e of report.sources)assert.equal(hash(read(e.file)),e.sha256,e.file);
});
test('main loader and stale-runtime selectors agree with wrapper, codex and installed shell',()=>{
 const wrapper=read('js/battle-v3-live.js'),version=wrapper.match(/const BATTLE_RUNTIME = '([^']+)'/)[1],app=read('js/app.js');
 assert(version.endsWith('-cardgu-live-20261027-v1'));assert(read('preview/project-v-v3/source/project-v-pixi-battle.src.js').includes(version));assert(app.includes(version));
 assert.equal((app.match(/&cardgu=20261027-live-v1&/g)||[]).length,4);
 const key=read('index.html').match(/js\/app\.js\?v=([^&"]+)/)[1];assert.equal(read('service-worker.js').match(/const SHELL_CACHE='([^']+)'/)[1],'soop-card-shell-v'+key);
 for(const f of ['mercenary-codex/index.html','mercenary-codex/shell.mjs','mercenary-codex/app.mjs'])assert(read(f).includes('cardgu=20261027-live-v1'),f);
 assert(read('onestore/js/app.js').includes(version));assert(read('onestore/index.html').includes(key));
 for(const f of ['defense/index.html','preview/coop-defense-v1/index.html'])assert(read(f).includes('defense.bundle.js?cardgu=20261027-live-v1&'),f);
});
test('approved assets ship within Pages cap while historical reports and bundled sources remain in Git',()=>{
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:64e6}).split('\0').filter(Boolean),selected=files.filter(isProductionFile);
 const count=selected.filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;assert(count<=20000,String(count));
 for(const f of JSON.parse(read('docs/qa/cardgu-live-20261027/approved-assets.json')).files)assert(selected.includes(f.file),f.file);
 assert(selected.includes('shared/mercenary-cardgu-v1.mjs'));assert(!selected.includes('preview/project-v-v3/source/battle/CardguCombatPlayback.js'));
 assert.equal(cardguAuditOnly.size,32);for(const f of cardguAuditOnly){assert.match(f,/^TEST-REPORT-v\d+\.txt$/);assert(files.includes(f));assert(!selected.includes(f));assert(fs.statSync(f).size>0);}
});
