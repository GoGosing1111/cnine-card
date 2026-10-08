import test from 'node:test';
import assert from 'node:assert/strict';
import {petCodexFixture} from './helpers/pet-codex-grants-fixture.mjs';
import {petSupportPosition} from '../preview/project-v-v3/source/battle/PetSupportLayout.mjs';
const endpoint='admin/pets/grants';
const preview={recipientType:'NICKNAME',recipient:'도감 검수',petCode:'PET-BONGSOON',quantity:3,reason:'이벤트 당첨 보상'};
async function prepare(f,input=preview){const r=await f.call(endpoint+'/preview',{body:input});assert.equal(r.status,200,JSON.stringify(r.body));return {...r.body.grant,requestId:crypto.randomUUID()};}
for(const postgres of [false,true])test(`pet codex and atomic grants (${postgres?'PostgreSQL':'SQLite'})`,async t=>{
 const f=await petCodexFixture(t,{postgres});
 await t.test('codex includes missing pets; equipped state still owns only; private GET and equip validation',async()=>{
  const r=await f.call('pets/v1/codex');assert.equal(r.status,200);assert.equal(r.body.cards.length,7);assert.equal(r.body.ownedCount,1);assert.equal(r.body.cards.filter(p=>!p.owned).length,6);assert.equal(r.headers['cache-control'],'private, no-store');assert.equal(r.headers.vary,'Authorization');
  assert.equal((await f.call('pets/v1/state')).body.cards.length,1);assert.equal((await f.call('pets/v1/codex',{user:null})).status,401);assert.equal((await f.call('pets/v1/codex',{body:{}})).status,405);
  assert.equal((await f.call('pets/v1/loadout',{body:{petCode:'PET-JOEUN',expectedRevision:0,petCmsRevision:4,requestId:crypto.randomUUID()}})).status,403);
  assert.equal((await f.call('pets/v1/loadout',{body:{petCode:'PET-BONGSOON',expectedRevision:0,petCmsRevision:4,requestId:crypto.randomUUID()}})).status,200);
 });
 await t.test('OWNER only; exact recipient, origin and bounded fields; preview has no collection side effects',async()=>{
  for(const role of ['USER','ADMIN','SUPPORT'])assert.equal((await f.call(endpoint,{role})).status,403);
  const before=await f.record('pet_collection_v1:2');const good=await f.call(endpoint+'/preview',{body:preview});assert.equal(good.body.target.id,2);assert.deepEqual(await f.record('pet_collection_v1:2'),before);
  for(const body of [{...preview,recipient:'도감'},{...preview,recipient:'%검수%'},{...preview,recipientType:'ID',recipient:'0'}])assert.notEqual((await f.call(endpoint+'/preview',{body})).status,200);
  assert.equal((await f.call(endpoint+'/preview',{body:{...preview,recipientType:'ID',recipient:'2'}})).status,200);
  assert.equal((await f.call(endpoint+'/preview',{body:{...preview,recipient:'도감%'}})).status,404);
  await f.p("INSERT INTO users(id,nickname,role) VALUES(5,'QA_%','USER')").run();assert.equal((await f.call(endpoint+'/preview',{body:{...preview,recipient:'QA_%'}})).body.target.id,5);await f.p('DELETE FROM users WHERE id=5').run();
  await f.p("INSERT INTO users(id,nickname,role) VALUES(4,'도감 검수','USER')").run();assert.equal((await f.call(endpoint+'/preview',{body:preview})).status,409);await f.p('DELETE FROM users WHERE id=4').run();
  for(const body of [{...preview,quantity:0},{...preview,quantity:10000},{...preview,quantity:1.5},{...preview,reason:' '},{...preview,petCode:'PET-UNKNOWN'},{...preview,role:'OWNER'}])assert.equal((await f.call(endpoint+'/preview',{body})).status,400);
  assert.equal((await f.call(endpoint+'/preview',{body:preview,origin:'https://other.test'})).status,403);
  assert.equal((await f.call(endpoint+'/preview',{body:preview,contentType:'text/plain'})).status,415);
 });
 await t.test('atomic grant + audit + durable replay, preserves equipped pet, potential and currencies',async()=>{
  const loadout=await f.record('pet_loadout_v1:2'),potential={revision:2,pets:{'PET-BONGSOON':{potential:'MAGNET',attempts:2}}};await f.write('pet_potentials_v1:2',potential);
  const body=await prepare(f),r=await f.call(endpoint,{body});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.before,2);assert.equal(r.body.after,5);assert(f.lockCalls>0);
  const replay=await f.call(endpoint,{body});assert.equal(replay.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.after,5);
  assert.equal((await f.call(endpoint,{body:{...body,quantity:4}})).status,409);
  assert.equal((await f.p('SELECT COUNT(*) AS n FROM admin_logs').first()).n,1);assert.deepEqual(await f.record('pet_loadout_v1:2'),loadout);assert.deepEqual(await f.record('pet_potentials_v1:2'),potential);assert.equal(Number((await f.p('SELECT coin FROM users WHERE id=2').first()).coin),999);
  const history=await f.call(endpoint);assert.equal(history.body.catalog.length,7);assert.equal(history.body.history.length,1);assert.equal(history.body.history[0].requestId,body.requestId);
 });
 await t.test('same request concurrency grants once; different requests from a stale preview cannot overwrite',async()=>{
  const body=await prepare(f),results=await Promise.all([f.call(endpoint,{body}),f.call(endpoint,{body})]);assert(results.every(r=>r.status===200));assert.equal(results.filter(r=>!r.body.replayed).length,1);assert.equal((await f.record('pet_collection_v1:2')).pets['PET-BONGSOON'],8);
  const first=await prepare(f),second={...first,requestId:crypto.randomUUID()};const concurrent=await Promise.all([f.call(endpoint,{body:first}),f.call(endpoint,{body:second})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);assert.equal((await f.record('pet_collection_v1:2')).pets['PET-BONGSOON'],11);
 });
 await t.test('failed audit/receipt rolls back ownership; lost commit response recovers exact receipt',async()=>{
  for(const pattern of ['INSERT INTO admin_logs','INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)']){
   const body=await prepare(f),before=await f.record('pet_collection_v1:2'),logs=Number((await f.p('SELECT COUNT(*) AS n FROM admin_logs').first()).n);
   // PostgreSQL compatibility rewrites placeholders. Match the receipt-only SQL
   // via its key in a batch wrapper instead of relying on placeholder spelling.
   const batch=f.DB.batch.bind(f.DB);if(pattern.startsWith('INSERT INTO app_meta')){f.DB.batch=async statements=>{const index=statements.length-5;statements[index]=f.DB.prepare('INSERT INTO missing_pet_receipt_table(value) VALUES(?)').bind('fail');return batch(statements);};}else f.fail(pattern);
   assert.equal((await f.call(endpoint,{body})).status,503);f.fail('');f.DB.batch=batch;
   assert.deepEqual(await f.record('pet_collection_v1:2'),before);assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM admin_logs').first()).n),logs);assert.equal(await f.record('pet_grant_receipt_v1:'+body.requestId),null);
  }
  const body=await prepare(f);f.loseCommit();const r=await f.call(endpoint,{body});assert.equal(r.status,200);assert.equal(r.body.replayed,true);assert.equal((await f.call(endpoint,{body})).body.after,r.body.after);
 });
 await t.test('new account and CMS revision guard; granted pet becomes visible and equipable',async()=>{
  const stale=await prepare(f),cms=await f.record('pet_cms_preparation_v1');await f.write('pet_cms_preparation_v1',{...cms,revision:cms.revision+1});assert.equal((await f.call(endpoint,{body:stale})).status,409);
  const body=await prepare(f,{...preview,recipientType:'ID',recipient:'3',petCode:'PET-JOEUN',quantity:1});assert.equal((await f.call(endpoint,{body})).status,200);assert.deepEqual((await f.record('pet_collection_v1:3')).pets,{'PET-JOEUN':1});assert.equal((await f.call('pets/v1/codex',{user:3})).body.ownedCount,1);
  assert.equal((await f.call('pets/v1/loadout',{user:3,body:{petCode:'PET-JOEUN',expectedRevision:0,petCmsRevision:5,requestId:crypto.randomUUID()}})).status,200);
 });
});
test('support placement keeps PVE left of suit and PVP centered at every viewport scale',()=>{
 for(const scale of [1,.6,.32]){
  const size=Math.max(126,56/scale),points=[{x:340,y:460},{x:610,y:550},{x:470,y:610}],base={points,side:'A',width:1440,height:1100,scale,size};
  const suit={x:590,y:750,halfWidth:90},pve=petSupportPosition({...base,pvp:false,suit});assert(pve.x+size*.4<suit.x-suit.halfWidth);assert.equal(pve.y,suit.y);
  const pvp=petSupportPosition({...base,pvp:true,suit});assert.equal(pvp.x,475);assert(pvp.y>610);assert(pvp.y<base.height);
  assert.equal(petSupportPosition({...base,side:'B',pvp:true}).x,pvp.x);assert(Number.isFinite(petSupportPosition({...base,pvp:false,suit:null}).x));
  const portrait=petSupportPosition({...base,points:[{x:140,y:857},{x:356,y:857}],pvp:false,suit:{x:356,y:857,halfWidth:95}});assert.equal(portrait.x,248);assert(portrait.size<=129.6);assert(portrait.x-portrait.size/2>140);assert(portrait.x+portrait.size/2<356);
 }
});
