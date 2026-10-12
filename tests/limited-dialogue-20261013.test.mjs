import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MERCENARY_DIALOGUE_PROFILES,VALTER_DIALOGUE_LINES,HELIOS_DIALOGUE_LINES} from '../preview/project-v-v3/source/battle/MercenaryDialogueProfiles.js';

test('Valter and Helios each have three distinct short lines and approved existing portraits',()=>{
 for(const [code,lines,theme] of [['V-996',VALTER_DIALOGUE_LINES,'valter'],['V-999',HELIOS_DIALOGUE_LINES,'helios']]){
  const profile=MERCENARY_DIALOGUE_PROFILES[code];
  assert.equal(lines.length,3);assert.equal(new Set(lines).size,3);assert.equal(profile.lines,lines);assert.equal(profile.theme,theme);
  assert.ok(lines.every(line=>line.length<=32&&!/[<>]/.test(line)));
  assert.ok(fs.existsSync(new URL('..'+profile.portrait,import.meta.url)));
 }
 assert.equal(MERCENARY_DIALOGUE_PROFILES['V-989'].lines.length,5);
});

test('every shipped V3 consumer includes the dialogue profiles and the matching loader version',()=>{
 const report=JSON.parse(fs.readFileSync(new URL('../preview/project-v-v3/grid-build-report.json',import.meta.url)));
 assert.ok(report.sources.some(row=>row.file.endsWith('/MercenaryDialogueProfiles.js')));
 for(const output of report.outputs){
  const bundle=fs.readFileSync(new URL('../'+output.file,import.meta.url),'utf8').replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  assert.ok(bundle.includes(VALTER_DIALOGUE_LINES[0]),output.file);
  assert.ok(bundle.includes(HELIOS_DIALOGUE_LINES[0]),output.file);
 }
 for(const file of ['index.html','service-worker.js','js/app.js','js/battle-v3-live.js','preview/project-v-v3/source/project-v-pixi-battle.src.js']){
  assert.match(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),/limited-dialogue/);
 }
});
