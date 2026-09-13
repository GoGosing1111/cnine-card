import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
import {validateCatalog,filterCatalog,escapeHtml,asset} from '../mercenary-codex/model.mjs';

for(const dialect of ['sqlite','postgres'])test(`${dialect}: public codex reads exact saved CMS ranks, assignments, names and skill balances`,async t=>{
  const f=await mercenaryFixture(t,{postgres:dialect==='postgres'});
  const call=(path,method='GET',body)=>handleMercenaryCms({path,request:new Request('https://qa.test/api/'+path,{method,...(body?{body:JSON.stringify(body)}:{})}),env:f.env,deps:{json:(body,status=200,headers={})=>({body,status,headers}),requirePermission:async()=>f.user}});
  const original=await call('mercenary-codex');assert.equal(original.status,200);assert.equal(original.headers['cache-control'],'no-store');validateCatalog(original.body);
  const state=(await call('admin/mercenaries')).body,doc=state.document,c=doc.mercenaries.find(c=>c.code==='V-004'),s=doc.skills.find(s=>s.id==='MS-004');
  Object.assign(c,{name:'새 저격수',rank:'SS',notes:'PRIVATE_OPERATOR_NOTE'});Object.assign(s,{name:'운영 스킬',effect:'저장한 효과 <b>테스트</b>',balance:{damageRatio:2.15,cooldownTurns:6,cost:31},review:'REVIEWED',notes:'PRIVATE_SKILL_NOTE'});
  doc.assignments.find(a=>a.code===c.code).skillIds=[s.id];doc.settings.releaseNotes='PRIVATE_RELEASE_NOTE';
  const saved=await call('admin/mercenaries','PATCH',{document:doc,expectedRevision:state.revision,requestId:crypto.randomUUID()});assert.equal(saved.status,200,JSON.stringify(saved.body));
  const publicState=(await call('mercenary-codex')).body;validateCatalog(publicState);
  const card=publicState.cards.find(row=>row.code===c.code);assert.equal(publicState.revision,saved.body.revision);assert.equal(card.name,c.name);assert.equal(card.rank,'SS');assert.equal(card.basePower,120000);assert.deepEqual(card.skills.map(s=>s.id),['MS-004']);assert.deepEqual(card.skills[0].balance,s.balance);assert.equal(card.skills[0].effect,s.effect);assert.equal(card.skills[0].ready,true);
  assert.doesNotMatch(JSON.stringify(publicState),/PRIVATE_|updatedBy|audit|coinPrice|rankGrowth/);
  doc.assignments.find(a=>a.code===c.code).skillIds=[];await call('admin/mercenaries','PATCH',{document:doc,expectedRevision:saved.body.revision,requestId:crypto.randomUUID()});
  assert.deepEqual((await call('mercenary-codex')).body.cards.find(row=>row.code===c.code).skills,[]);
  assert.equal((await call('mercenary-codex','POST',{rank:'SSS'})).status,405);
});
test('codex search, grade filters and escaped presentation use current CMS skill data',()=>{
  const cards=[{code:'V-004',name:'베스페라',title:'저격수',rank:'SS',position:'REAR',basePower:120000,skills:[{name:'루비 최후통첩'}]},{code:'V-001',name:'아우렌',title:'성검',rank:'S',position:'FRONT',basePower:70000,skills:[]}];
  assert.equal(filterCatalog(cards,{q:'ㄹㅂ'},new Set())[0].code,'V-004');assert.equal(filterCatalog(cards,{rank:'S'},new Set())[0].code,'V-001');assert.equal(filterCatalog(cards,{saved:true},new Set(['V-004'])).length,1);assert.equal(filterCatalog(cards,{sort:'power'},new Set())[0].code,'V-004');
  assert.equal(escapeHtml('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');assert.throws(()=>asset('assets/ui/project-v/../../secret.png'));assert.throws(()=>asset('https://external.example/a.png'));
});
