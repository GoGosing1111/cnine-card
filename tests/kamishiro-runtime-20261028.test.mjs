import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isProductionFile,kamishiroAuditOnly} from '../scripts/prepare-production-assets.mjs';
import {plan} from '../preview/project-v-v3/source/battle/kamishiro/skills.mjs';
const read=f=>fs.readFileSync(f,'utf8'),hash=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
test('all shipped V3 consumers contain Kamishiro and match the recorded source',()=>{
 const r=JSON.parse(read('preview/project-v-v3/grid-build-report.json'));assert.equal(r.outputs.length,11);
 for(const e of r.outputs){const s=read(e.file);assert(s.includes('MERCENARY_KAMISHIRO_AREA'),e.file);assert.equal(hash(s),e.sha256,e.file);}
 for(const e of r.sources)assert.equal(hash(read(e.file)),e.sha256,e.file);
});
test('main loader, codex and installed shell select the current release',()=>{
 const version=read('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];assert(version.endsWith('-kamishiro-live-20261028-v1'));
 for(const f of ['js/app.js','preview/project-v-v3/source/project-v-pixi-battle.src.js','onestore/js/app.js'])assert(read(f).includes(version),f);
 const key=read('index.html').match(/js\/app\.js\?v=([^&"]+)/)[1];assert.equal(read('service-worker.js').match(/const SHELL_CACHE='([^']+)'/)[1],'soop-card-shell-v'+key);assert(read('onestore/index.html').includes(key));
 for(const f of ['mercenary-codex/index.html','mercenary-codex/shell.mjs','mercenary-codex/app.mjs','defense/index.html','preview/coop-defense-v1/index.html'])assert(read(f).includes('kamishiro=20261028-live-v1'),f);
});
test('all three basics arrive before a single hit and return before the action ends',()=>{
 for(const key of ['cleave','rise','thrust']){const p=plan(key),t=p.travel;assert(t.depart<t.arrive&&t.arrive<=p.release);assert.equal(p.hits.length,1);assert(p.hits[0].at>t.arrive&&p.hits[0].at<t.leave);assert(p.fxEnd<=t.leave&&t.leave<t.home&&t.home<p.duration);}
 assert(plan('ruin').travel);assert.equal(plan('eclipse').kind,'AREA');
});
test('approved assets ship below Pages cap and authoring sources remain preserved',()=>{
 const files=execFileSync('git',['ls-files','-co','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:64e6}).split('\0').filter(Boolean),selected=[...new Set(files)].filter(isProductionFile);
 const count=selected.filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;assert(count<=20000,String(count));
 for(const f of JSON.parse(read('docs/qa/kamishiro-live-20261028/approved-assets.json')).files)assert(selected.includes(f.file),f.file);
 assert(selected.includes('shared/mercenary-kamishiro-v1.mjs'));assert(!selected.includes('preview/project-v-v3/source/battle/KamishiroCombatPlayback.js'));
 for(const f of kamishiroAuditOnly){assert.match(f,/^TEST-REPORT-v\d+\.txt$/);assert(files.includes(f));assert(!selected.includes(f));}
});
