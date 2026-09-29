import test from 'node:test';
import assert from 'node:assert/strict';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {suggestedMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {prepareRelease,applyRelease} from '../scripts/ops/berkan-area-release-20260930.mjs';
import {pickMercenaryDraw} from '../functions/_mercenary_draw_accounting.js';
function fixture(){
 const doc=structuredClone(seed.document);for(const c of doc.mercenaries)if(!['V-021','V-046','V-049','V-055'].includes(c.code))c.rank='SS';
 doc.mercenaries=doc.mercenaries.filter(c=>c.code!=='V-055');doc.assignments=doc.assignments.filter(c=>c.code!=='V-055');doc.skills=doc.skills.filter(s=>!['MS-055','MS-056'].includes(s.id));
 const policy=suggestedMercenaryDraw();policy.cardRules.cardWeights={'V-021':8991,'V-046':2000,'V-049':500,'V-055':0,'V-054':3};
 return {cms:{payload_json:JSON.stringify(doc),revision:59},draw:{payload_json:JSON.stringify(policy),revision:26}};
}
test('release expands the live pre-Berkan catalog, assigns PVE skill, and makes SSS exactly 0.1% equally',()=>{
 const input=fixture(),copy=structuredClone(input),next=prepareRelease(input);assert.deepEqual(input,copy);
 assert.deepEqual(next.document.assignments.find(a=>a.code==='V-055').skillIds,['MS-055','MS-056']);
 assert.ok(next.chances.every(c=>c.weight===1&&c.withinRankPercent===25&&c.percent===.025));
 const old=JSON.parse(input.draw.payload_json);assert.deepEqual(next.policy.outcomes.filter(r=>!['NONE','CARD_SSS'].includes(r.id)),old.outcomes.filter(r=>!['NONE','CARD_SSS'].includes(r.id)));
 assert.equal(next.policy.outcomes.reduce((n,r)=>n+r.chancePpm,0),1e6);assert.equal(next.policy.cardRules.cardWeights['V-054'],3);
 assert.deepEqual(next.document.mercenaries.filter(c=>c.code!=='V-055'),JSON.parse(input.cms.payload_json).mercenaries);
 assert.equal(next.cmsRevision,60);assert.equal(next.drawRevision,27);
});
test('production picker uses the exact 1000-ppm SSS interval and four equal selectable outcomes',()=>{
 const {policy,document}=prepareRelease(fixture()),mercenaries=structuredClone(document.mercenaries);
 ['C','B','A','S','SS'].forEach((rank,i)=>mercenaries[i].rank=rank);
 const index=policy.outcomes.findIndex(r=>r.id==='CARD_SSS'),start=policy.outcomes.slice(0,index).reduce((n,r)=>n+r.chancePpm,0);
 for(const ticket of [start,start+999])for(const [selection,code]of ['V-021','V-046','V-049','V-055'].entries()){
  const draws=[ticket,selection],bounds=[];const result=pickMercenaryDraw({policy,mercenaries,randomInt:max=>{bounds.push(max);return draws.shift();}});
  assert.equal(result.mercenaryCode,code);assert.deepEqual(bounds,[1e6,4]);
 }
 const after=pickMercenaryDraw({policy,mercenaries,randomInt:()=>start+1000});assert.equal(after.outcomeId,'MASTER_STAR');
});
function database(failAt){
 let state={...fixture(),cmsReceipt:false,drawReceipt:false,logs:0},backup;const calls=[];
 return {get state(){return state;},calls,async query(sql,args=[]){
  calls.push(sql);if(sql==='BEGIN'){backup=structuredClone(state);return {};}if(sql==='ROLLBACK'){state=backup;return {};}if(sql==='COMMIT'||sql.startsWith('SET '))return {};
  if(failAt&&sql.startsWith(failAt))throw Error('injected failure');
  if(sql.startsWith('SELECT * FROM mercenary_cms_documents'))return {rows:[state.cms]};
  if(sql.startsWith('SELECT * FROM mercenary_draw_config'))return {rows:[state.draw]};
  if(sql.startsWith('SELECT request_id FROM mercenary_cms_audit'))return {rows:state.cmsReceipt?[{}]:[]};
  if(sql.startsWith('SELECT request_id FROM mercenary_draw_audit'))return {rows:state.drawReceipt?[{}]:[]};
  if(sql.startsWith('SELECT id FROM users'))return {rows:[{id:1}]};
  if(sql.startsWith('SELECT value FROM app_meta'))return {rows:[{value:'{"mode":"ON"}'}]};
  if(sql.startsWith('UPDATE mercenary_cms_documents')){state.cms={payload_json:args[0],revision:args[1]};return {rowCount:1};}
  if(sql.startsWith('UPDATE mercenary_draw_config')){state.draw={payload_json:args[0],revision:args[1]};return {rowCount:1};}
  if(sql.startsWith('INSERT INTO mercenary_cms_audit')){state.cmsReceipt=true;return {};}
  if(sql.startsWith('INSERT INTO mercenary_draw_audit')){state.drawReceipt=true;return {};}
  if(sql.startsWith('INSERT INTO admin_logs')){state.logs++;return {rows:[{id:100}]};}
  throw Error('Unexpected query: '+sql);
 }};
}
test('settings and receipts commit together; retries cannot duplicate or undo later edits',async()=>{
 const db=database(),opts={expectedCmsRevision:59,expectedDrawRevision:26};const first=await applyRelease(db,opts);
 assert.equal(first.replayed,false);assert.equal(db.state.cms.revision,60);assert.equal(db.state.draw.revision,27);assert.equal(db.state.logs,1);
 db.state.cms.revision=61;assert.deepEqual(await applyRelease(db,opts),{replayed:true});assert.equal(db.state.cms.revision,61);assert.equal(db.state.logs,1);
});
test('stale revision or an audit failure rolls back both settings',async()=>{
 for(const [failAt,revision]of [['INSERT INTO mercenary_draw_audit',59],[null,58]]){
  const db=database(failAt),before=structuredClone(db.state);await assert.rejects(applyRelease(db,{expectedCmsRevision:revision,expectedDrawRevision:26}));
  assert.deepEqual(db.state,before);assert.equal(db.calls.at(-1),'ROLLBACK');
 }
});
