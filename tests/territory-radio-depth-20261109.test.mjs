import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../js/territory-network-v6.js',import.meta.url),'utf8');
const view=()=>{const ctx=vm.createContext({});vm.runInContext(code,ctx);return ctx.CNineTerritoryNetwork;};
const sideName=s=>s==='A'?'서부 연합':'동부 연합';
const labels={esc:value=>String(value).replaceAll('<','&lt;'),sideName,selectedIndex:4,stage:'',actions:''};
const now='2026-11-09T07:00:00.000Z';
const base=()=>({serverNow:now,round:{id:6,status:'ACTIVE',current_front_index:4},mine:{side:'A'},
  network:{nodes:[{index:1,name:'북서 고지',owner:'A',front_id:51},{index:4,name:'중앙 교차지',owner:'',front_id:54}],
    counts:{A:4,neutral:1,B:4},edges:[[1,4]]},frontlineActivity:{minimum:4,nodes:[{nodeIndex:4,attacks:9},{nodeIndex:1,attacks:3}]}});

test('a contact has the engagement icon and label only in a fighting round',()=>{
  const ui=view(),s=base(),markup=ui.mapHtml(s,labels);
  assert.equal(markup.match(/class="fl-heat-label"/g)?.length,1);
  assert.match(markup,/fl-art-contact[^>]*><\/i>교전중/);assert.doesNotMatch(markup,/격전 9/);
  assert.match(markup,/fl-impact/);
  for(const stopped of [{...s,truce:{active:true}},{...s,round:{id:6,status:'FINISHED'}}]){
    assert.doesNotMatch(ui.mapHtml(stopped,labels),/fl-heat-label|fl-impact/);
    assert.equal(ui.hotList(stopped,labels),'');
  }
});

test('radio distinguishes sector results and personal victories and resolves old front IDs',()=>{
  const ui=view(),s=base();
  s.recentResults=[{front_id:41,node_index:1,winner_side:'B',created_at:'2026-11-09 06:59:04'}];
  s.recentActionPulse=[{id:8,front_id:41,winner_side:'A',created_at:'2026-11-09T06:59:55Z'}];
  const rows=ui.radioReports(s,sideName);
  assert.equal(rows[0].place,'북서 고지');assert.match(rows[0].body,/동부 연합.*거점 공방.*승리/);
  assert.deepEqual(Array.from(rows,r=>r.key),['sector:41','contact:4','action:8','control']);
  assert.match(rows.find(r=>r.key==='action:8').body,/서부 연합.*개인 교전/);
  s.recentResults[0].created_at='2026-11-09 06:50:00';s.recentActionPulse[0].front_id=910;
  assert.deepEqual(Array.from(ui.radioReports(s,sideName),r=>r.key),['contact:4','control']);
});

test('quiet, truce and final result replace live reports, including archived rounds',()=>{
  const ui=view(),s=base();s.frontlineActivity.nodes=[];
  assert.equal(ui.radioReports(s,sideName)[0].key,'quiet');
  s.truce={active:true};assert.deepEqual(Array.from(ui.radioReports(s,sideName),r=>r.key),['truce']);
  s.round.status='FINISHED';s.round.winner_side='B';
  assert.match(ui.radioReports(s,sideName)[0].body,/동부 연합 승리/);
  s.round.winner_side='DRAW';assert.doesNotMatch(ui.radioReports(s,sideName)[0].body,/연합 승리/);
  const legacy={round:{id:1,status:'ACTIVE'},nodes:[{index:0,name:'본성'}],counts:{A:8,B:12},recentActions:[]};
  assert.deepEqual(Array.from(ui.radioReports(legacy,sideName),r=>r.key),['quiet']);
  assert.match(ui.occupationHtml(legacy,labels),/flex:8.+flex:0.+flex:12/);
});

test('a fresh capture or defense leads the radio once even when a full result reports the same front',()=>{
  const ui=view(),s=base();
  s.notice={id:9,type:'NETWORK_CAPTURE',side:'B',created_at:'2026-11-09 06:59:58',payload:{nodeIndex:4,frontId:41,defended:false}};
  s.recentResults=[{front_id:41,node_index:4,winner_side:'B',created_at:s.notice.created_at}];
  let rows=ui.radioReports(s,sideName);
  assert.equal(rows.filter(r=>r.key==='sector:41').length,1);
  assert.equal(rows[0].place,'중앙 교차지');assert.match(rows[0].body,/동부 연합.*점령.*경로/);
  s.notice.payload.defended=true;
  assert.match(ui.radioReports(s,sideName)[0].body,/동부 연합.*방어에 성공/);
  delete s.notice.payload;
  s.notice.title='거점 방어 성공';s.notice.message='중앙 교차지 · 방어에 성공했습니다.';
  assert.match(ui.radioHtml(s,labels),/중앙 교차지 · 방어에 성공했습니다/);
  s.notice.created_at='2026-11-09 06:57:00';s.recentResults=[];
  assert.equal(ui.radioReports(s,sideName)[0].key,'contact:4');
});

test('supplied team and sector names are escaped in the radio and map',()=>{
  const ui=view(),s=base();s.network.nodes[1].name='<sector>';
  assert.match(ui.radioHtml(s,labels),/&lt;sector>/);assert.doesNotMatch(ui.mapHtml(s,labels),/<sector>/);
});
