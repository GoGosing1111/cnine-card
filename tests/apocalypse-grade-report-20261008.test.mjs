import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {comparisonArgs,battleMetrics} from '../scripts/measure-apocalypse-grade-balance-20261008.mjs';
import {ICON_ROLES} from '../shared/icon-roles-v1.mjs';
import report from '../docs/apocalypse-grade-balance-report-20261008.json' with {type:'json'};

test('the recorded 167040 battles belong to this engine and cover all legal ICON pairs',()=>{
 const source=fs.readFileSync(new URL('../functions/_battle_v2_preview.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 assert.equal(report.engineSha256,createHash('sha256').update(source).digest('hex'));
 assert.equal(report.total,167040);
 for(const phase of ['before','after']){
  const rows=report[phase].rows;assert.equal(rows.length,5220);assert.equal(rows.reduce((n,r)=>n+r.total,0),83520);
  assert.equal(new Set(rows.map(r=>r.icons.join(','))).size,29,'zero, seven singles and twenty-one pairs');
  assert.ok(rows.every(r=>r.total===16&&r.wins>=0&&r.wins<=r.total&&r.winRate===r.wins/r.total));
 }
 const rates=report.summary.after;
 assert.deepEqual(rates['0 ICON / SS 간호사'],report.summary.before['0 ICON / SS 간호사']);
 for(const size of [1,2])assert.ok(rates[size+' ICON / SSS'].percent>rates[size+' ICON / SS 간호사'].percent);
});

test('independent-seed recorded cases replay with actual combat, without changing the winner',()=>{
 for(const [icons,mercenary,formation,equipment,suit] of [
  [[1],'V-046','HP2',3000000,7000000],[[0,3],'V-021','HP1',1000000,12500000],[[2,6],'V-055','HP0',6000000,0]
 ]){
  const codes=icons.map(i=>ICON_ROLES[i].code),expected=report.after.rows.find(r=>r.icons.join(',')===codes.join(',')&&r.mercenary===mercenary&&r.formation===formation&&r.equipment===equipment&&r.suit===suit);
  assert.ok(expected);const totals={};
  for(let i=0;i<report.options.count;i++){
   const metrics=battleMetrics(createPveBattleV2(comparisonArgs({icons,mercenary,formation,equipment,suit,seed:Math.imul(report.options.start+i,7919)>>>0})));
   for(const [key,value] of Object.entries(metrics))totals[key]=(totals[key]||0)+value;
  }
  for(const [key,value] of Object.entries(totals))assert.equal(value,expected[key],key);
 }
});
