import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isProductionFile,heukmuAuditOnly} from '../scripts/prepare-production-assets.mjs';
import {plan,swordSwingTime,SWORD_SWING_RATE,effectScale} from '../preview/project-v-v3/source/battle/heukmu/skills.mjs';
const read=f=>fs.readFileSync(f,'utf8'),hash=s=>createHash('sha256').update(s.replaceAll('\r\n','\n')).digest('hex');
test('all shipped V3 consumers contain Heukmu and match the recorded source',()=>{
 const r=JSON.parse(read('preview/project-v-v3/grid-build-report.json'));assert.equal(r.outputs.length,11);
 for(const e of r.outputs){const s=read(e.file);assert(s.includes('MERCENARY_HEUKMU_AREA'),e.file);assert.equal(hash(s),e.sha256,e.file);}
 for(const e of r.sources)assert.equal(hash(read(e.file)),e.sha256,e.file);
});
test('main loader, codex and installed shell select the current release',()=>{
 const version=read('js/battle-v3-live.js').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];assert(version);
 for(const f of ['js/app.js','preview/project-v-v3/source/project-v-pixi-battle.src.js','onestore/js/app.js'])assert(read(f).includes(version),f);
 const key=read('index.html').match(/js\/app\.js\?v=([^&"]+)/)[1];assert.equal(read('service-worker.js').match(/const SHELL_CACHE='([^']+)'/)[1],'soop-card-shell-v'+key);assert(read('onestore/index.html').includes(key));
 for(const f of ['mercenary-codex/index.html','mercenary-codex/shell.mjs','mercenary-codex/app.mjs'])assert(read(f).includes('heukmu=20261029-live-v1'),f);
 for(const f of ['js/app.js','js/battle-v3-live.js','defense/index.html','preview/coop-defense-v1/index.html'])assert(read(f).includes('heukmu=20261029-swing-fx-v2'),f);
});
test('sword swing clock doubles only the swing and retains each contact and surrounding travel',()=>{
 assert.equal(SWORD_SWING_RATE,2);
 for(const [mode,from,contact,to] of [['attack',.43,.8,1.4],['cross',.42,.87,1.02],['cross',1.02,1.24,2],['ultimate',.55,1.45,3.05]]){
  assert.equal(swordSwingTime(mode,contact),contact);
  for(const t of [contact-.01,contact+.01])assert(Math.abs((swordSwingTime(mode,t+.001)-swordSwingTime(mode,t))/.001-2)<1e-9);
  assert.equal(swordSwingTime(mode,from),from);assert.equal(swordSwingTime(mode,to),to);
 }
 for(const mode of ['idle','dash','cast','hit','defeat'])for(let t=0;t<6;t+=.05)assert.equal(swordSwingTime(mode,t),t);
 for(const t of [0,.1,.3,1.45,1.62,1.85,2.3])assert.equal(swordSwingTime('attack',t),t);
 assert.equal(effectScale('attack'),1.5);assert.equal(effectScale('cross'),1.5);assert.equal(effectScale('cast'),1.5);assert.equal(effectScale('ultimate'),1.6);assert.equal(effectScale('idle'),1);
});
test('two melee forms and both twelve-target area plans retain approved poses and contacts',()=>{
 for(const mode of ['attack','cross','cast','ultimate']){const p=plan(mode,12);assert(p.hits.length>0);assert(p.hits.every(h=>h.at>0&&h.at<p.duration));assert(!p.poses.some(p=>p[1]==='slash'&&[1,2].includes(p[2])||p[1]==='ultimate'&&p[2]===1));if(['cast','ultimate'].includes(mode))assert.equal(new Set(p.hits.map(h=>h.target)).size,12);}
});
test('approved assets ship below Pages cap and authoring sources remain preserved',()=>{
 const files=execFileSync('git',['ls-files','-co','--exclude-standard','-z'],{encoding:'utf8',maxBuffer:64e6}).split('\0').filter(Boolean),selected=[...new Set(files)].filter(isProductionFile);
 const count=selected.filter(f=>!f.startsWith('functions/')&&!['_headers','_redirects','_routes.json','_worker.js'].includes(f)).length+1;assert(count<=20000,String(count));
 for(const f of JSON.parse(read('docs/qa/heukmu-live-20261029/approved-assets.json')).files)assert(selected.includes(f.file),f.file);
 assert(selected.includes('shared/mercenary-heukmu-v1.mjs'));assert(!selected.includes('preview/project-v-v3/source/battle/HeukmuCombatPlayback.js'));
 for(const f of heukmuAuditOnly){assert.match(f,/^TEST-REPORT-v\d+(?:-[A-Za-z0-9-]+)?\.txt$/);assert(files.includes(f));assert(!selected.includes(f));}
});
