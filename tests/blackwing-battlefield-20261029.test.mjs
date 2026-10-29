import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {battlefieldModel} from '../raid/blackwing/battlefield.mjs';
import {blackwingCommands} from '../raid/blackwing/commands.mjs';
import {blackwingView} from '../functions/_raid_blackwing.js';
import {room,scale,debt,hearts,sever,ward,damage,members,action} from './helpers/blackwing-scale-scenario.mjs';
import {room as legacyRoom} from './helpers/blackwing-feedback-scenario.mjs';

function check(r){
 for(const[id]of members){
  const state=blackwingView(r,id),field=battlefieldModel(state,r.clock);
  const shown=[...field.objects.map(o=>o.command).filter(Boolean),...field.utilities];
  for(const command of blackwingCommands(state,r.clock).buttons.filter(b=>!b.disabled))
   assert.ok(shown.some(b=>b.key===command.key&&!b.disabled),'reachable '+state.phase+' '+state.step+' '+id+' '+command.key);
  for(const c of shown)assert.deepEqual(c,blackwingCommands(state,r.clock).buttons.find(b=>b.key===c.key));
 }
}
test('every available role action remains reachable through the battlefield across all five phases and both branches',()=>{
 for(const part of ['WING','BLADE']){
  const r=room(123);check(r);scale(r);check(r);action(r,'1','CHARGE');check(r);debt(r);check(r);damage(r);
  check(r);scale(r);check(r);hearts(r);check(r);damage(r);
  check(r);scale(r);check(r);action(r,'7','VOTE',part);check(r);sever(r,part);check(r);damage(r);
  for(const w of [0,1,0]){check(r);ward(r,w);}check(r);damage(r);
  check(r);scale(r);check(r);debt(r);check(r);hearts(r);check(r);
  for(const w of part==='WING'?[1,2]:[2,1,2]){check(r);ward(r,w);}check(r);damage(r);
  assert.equal(r.status,'CLEAR');check(r);
 }
});
test('three physical pads retain wrong choices, own clue, occupants, shadow and contextual commitment',()=>{
 const r=room(33);scale(r);debt(r);damage(r);
 const before=blackwingView(r,'1'),previous=before.challenge.scale.previous;
 action(r,'1','PLACE',previous);const v=blackwingView(r,'1'),f=battlefieldModel(v,r.clock);
 const pads=f.objects.filter(o=>o.kind==='altar');assert.equal(pads.length,3);
 assert.ok(pads.every(p=>!p.command.disabled));assert.equal(pads[previous].shadow,true);assert.equal(pads[previous].selected,true);
 assert.equal(pads[previous].occupants[0].own,true);assert.ok(!JSON.stringify(f).includes('weights'));
 assert.match(f.clue,new RegExp('내 무게 '+v.challenge.scale.ownWeight));assert.equal(f.objects.find(o=>o.key==='lock').lane,previous);
});
test('live entry loads the full-width field and versioned assets without the sidebar',()=>{
 const inline=fs.readFileSync(new URL('../raid/blackwing/inline.mjs',import.meta.url),'utf8');
 assert.ok(inline.includes('createBattlefield'));assert.ok(!inline.includes('class="bw-command'));
 assert.ok(inline.includes('field.destroy()'));assert.match(inline,/battlefield\.mjs\?v=20261029-field1/);
 for(const file of ['field-altar.webp','field-heart.webp'])assert.ok(fs.statSync(new URL('../assets/raids/blackwing-20261024/'+file,import.meta.url)).size>1000);
});
test('legacy shared runes remain the exclusive field targets until the own oath is complete',()=>{
 const r=legacyRoom(42);
 for(const id of ['1','7']){
  const state=blackwingView(r,id),field=battlefieldModel(state,r.clock);
  assert.equal(field.objects.length,3);assert.ok(field.objects.every(o=>o.kind==='rune'));
  assert.ok(field.objects.every(o=>o.command.action==='RUNE'));assert.ok(field.clue.includes('→'));
 }
});
