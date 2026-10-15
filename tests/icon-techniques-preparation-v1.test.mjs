import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {iconCmsFixture} from './helpers/icon-cms-fixture.mjs';
import {handleIconTechniques} from '../functions/_icon_techniques.js';
import {ICON_ROLES,defaultIconRoles} from '../shared/icon-roles-v1.mjs';
import {ICON_TECHNIQUES,ICON_TECHNIQUES_KEY,ICON_TECHNIQUE_PREPARATION,ICON_TECHNIQUES_RELEASE_ENABLED,defaultIconTechniques,emptyIconTechniqueTuning,validateIconTechniques,validateIconTechniquePreparation} from '../shared/icon-techniques-v1.mjs';

const packet=(document=defaultIconTechniques(),expectedRevision=1,requestId=crypto.randomUUID())=>({document,expectedRevision,requestId});
async function fixture(){
 const f=await iconCmsFixture();
 const call=async(body,options={})=>{
  const path=options.path||'admin/icon-techniques';
  const response=await handleIconTechniques({path,env:f.env,request:new Request('https://qa.test/api/'+path,{method:options.method||(body===undefined?'GET':'PATCH'),...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})}),deps:{requirePermission:async()=>options.denied?null:{id:options.actor??1,role:options.role||'OWNER'},json:(data,status=200)=>Response.json(data,{status})}});
  return response?{status:response.status,headers:response.headers,body:await response.json()}:null;
 };
 return{...f,call};
}
test('eight new techniques start unassigned, OFF and untuned, preserving all nine live ICON roles',()=>{
 assert.equal(ICON_TECHNIQUES.length,8);assert.equal(ICON_ROLES.length,9);
 assert.deepEqual(ICON_TECHNIQUES.map(def=>def.name),['왕관 찬탈','전열 편집','상처 유예','선불 출격','추적 금지','기술 검열','자율 병기','귀환 서약']);
 const draft=defaultIconTechniques();assert.deepEqual(validateIconTechniques(draft),draft);
 assert.equal(draft.enabled,false);
 assert.ok(draft.techniques.every(row=>row.cardId===null&&row.enabled===false&&row.tuning===null));
 assert.equal(ICON_TECHNIQUES_RELEASE_ENABLED,false);assert.equal(typeof ICON_TECHNIQUE_PREPARATION,'symbol');
 assert.equal(JSON.stringify({[ICON_TECHNIQUE_PREPARATION]:{assignments:[]}}),'{}');
 assert.equal(defaultIconRoles().cards.length,9);
 for(const def of ICON_TECHNIQUES){assert.ok(def.summary&&def.target&&def.timing&&def.safety.length>=3);assert.ok(def.fields.every(field=>!('value'in field)));}
});
test('draft validation accepts partial null tuning but rejects release, mappings, foreign keys and unsafe numbers',()=>{
 const doc=defaultIconTechniques();doc.techniques[0].tuning=emptyIconTechniqueTuning('CROWN_USURP');doc.techniques[0].tuning.firstAction=2;
 assert.equal(validateIconTechniques(doc).techniques[0].tuning.cooldownActions,null);
 const mutations=[d=>d.enabled=true,d=>d.extra=true,d=>d.techniques.pop(),d=>d.techniques[1]=d.techniques[0],d=>d.techniques[0].cardId=ICON_ROLES[0].cardId,d=>d.techniques[0].enabled=true,d=>d.techniques[0].tuning={firstAction:1},d=>d.techniques[0].notes='x'.repeat(1201),d=>d.techniques[0].tuning={firstAction:NaN,cooldownActions:1,maxCasts:1},d=>d.techniques[0].tuning={firstAction:0,cooldownActions:1,maxCasts:1},d=>d.techniques[0].tuning={firstAction:1,cooldownActions:1.5,maxCasts:1},d=>d.techniques[0].code='LIVE_CARD',d=>d.techniques[0].approved=true];
 for(const change of mutations){const value=defaultIconTechniques();change(value);assert.throws(()=>validateIconTechniques(value),String(change));}
});
test('isolated preparation requires exact numeric tuning and unique actor assignments',()=>{
 const def=ICON_TECHNIQUES[0],tuning=Object.fromEntries(def.fields.map(field=>[field.key,field.min]));
 const input={assignments:[{actorId:'A:1',code:def.code,tuning}]};
 assert.deepEqual(validateIconTechniquePreparation(input),input);
 for(const raw of [{...input,enabled:true},{assignments:[input.assignments[0],input.assignments[0]]},{assignments:[{...input.assignments[0],tuning:null}]},{assignments:[{...input.assignments[0],cardId:'CN-1C000001'}]},{assignments:[{...input.assignments[0],code:'UNKNOWN'}]}])assert.throws(()=>validateIconTechniquePreparation(raw));
});
test('OWNER route rejects unauthorized, public and malformed writes before database access; GET is read-only',async()=>{
 const f=await fixture();try{
  for(const role of ['USER','ADMIN','SUPPORT'])assert.equal((await f.call(undefined,{role})).status,403);
  assert.equal((await f.call(undefined,{denied:true})).status,403);
  assert.equal((await f.call(undefined,{method:'POST'})).status,405);
  assert.equal(await f.call(undefined,{path:'icons/techniques'}),null);
  assert.equal((await f.call('{bad')).status,400);assert.equal((await f.call(' '.repeat(32769))).status,400);
  const invalid=packet();invalid.document.enabled=true;assert.equal((await f.call(invalid)).status,400);
  assert.equal(f.count(),0);
  const read=await f.call();assert.equal(read.status,200);assert.equal(f.count(),1);
  assert.equal(read.body.revision,1);assert.equal(read.body.locks.releaseEnabled,false);
  assert.equal(read.headers.get('cache-control'),'private, no-store');assert.equal(read.headers.get('vary'),'Authorization');
  assert.deepEqual((await f.pg.query('SELECT key FROM app_meta')).rows,[]);
 }finally{await f.close();}
});
test('CAS, actor-bound retries and independent key preserve existing ICON settings under concurrent saves',async()=>{
 const f=await fixture();try{
  const live=JSON.stringify({revision:77,document:defaultIconRoles()}),old='{"preserved":true}';
  await f.pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2),($3,$4)',['icon_role_settings_v1',live,'icon_cms_v1',old]);
  const request=packet();request.document.techniques[0].notes='준비 검수';
  const pair=await Promise.all([f.call(request),f.call(request)]);
  assert.deepEqual(pair.map(row=>row.status),[200,200]);assert.equal(pair.filter(row=>row.body.replayed).length,1);
  assert.equal((await f.call(request)).body.replayed,true);
  assert.equal((await f.call(request,{actor:2})).body.code,'REQUEST_ID_CONFLICT');
  const changed=structuredClone(request);changed.document.techniques[0].notes='다른 내용';
  assert.equal((await f.call(changed)).body.code,'REQUEST_ID_CONFLICT');
  assert.equal((await f.call(packet())).body.code,'REVISION_CONFLICT');
  const current=(await f.call()).body,a=packet(current.document,2),b=packet(current.document,2);a.document.techniques[1].notes='A';b.document=structuredClone(current.document);b.document.techniques[1].notes='B';
  assert.deepEqual((await Promise.all([f.call(a),f.call(b)])).map(row=>row.status).sort(),[200,409]);
  const after=(await f.call()).body;assert.equal(after.revision,3);assert.equal(after.audit.length,2);assert.equal(after.document.enabled,false);
  const existing=await f.pg.query('SELECT key,value FROM app_meta WHERE key<>$1',[ICON_TECHNIQUES_KEY]);
  assert.deepEqual(Object.fromEntries(existing.rows.map(row=>[row.key,row.value])),{icon_role_settings_v1:live,icon_cms_v1:old});
 }finally{await f.close();}
});
test('write failure keeps draft and receipt atomic; corrupted stored ON state fails closed',async()=>{
 const f=await fixture();try{
  const initial=await f.call(packet());assert.equal(initial.status,200);
  const next=packet(initial.body.document,2);next.document.techniques[2].notes='atomic';
  f.fail(true);assert.equal((await f.call(next)).status,503);f.fail(false);
  const unchanged=(await f.call()).body;assert.equal(unchanged.revision,2);assert.equal(unchanged.audit.length,1);assert.equal(unchanged.document.techniques[2].notes,'');
  assert.equal((await f.call(next)).body.revision,3);
  const stored=JSON.parse((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[ICON_TECHNIQUES_KEY])).rows[0].value);
  stored.document.techniques[0].enabled=true;
  await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(stored),ICON_TECHNIQUES_KEY]);
  assert.equal((await f.call()).status,503);
 }finally{await f.close();}
});
test('CMS mount isolates editing events and route remains OWNER-only preparation',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 assert.match(read('functions/api/[[path]].js'),/handleIconTechniques\(\{path,request,env,deps:\{requirePermission,json\}\}\)/);
 assert.match(read('admin/icon-admin-v1.mjs'),/mountIconTechniqueEditor/);
 assert.match(read('admin/icon-admin-v1.mjs'),/event.target.closest\('\.ic-technique-editor'\)/);
 assert.match(read('admin/icon-technique-editor-v1.mjs'),/\/api\/admin\/icon-techniques/);
 assert.match(read('admin/icon-technique-editor-v1.mjs'),/preview\/icon-techniques-20261015/);
 assert.match(read('admin/index.html'),/icon-admin-v1\.mjs[^"]*techniques=20261015-preparation-v1/);
 assert.doesNotMatch(read('functions/_icon_roles.js'),/icon-techniques|icon_technique_preparation/);
});
