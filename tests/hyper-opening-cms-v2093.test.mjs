import test from 'node:test';import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {hyperOpeningState,HYPER_OPENING_KEY,HYPER_OPEN_PATHS,hyperOpeningGuards} from '../functions/_hyper_pack_opening.js';
import {MERCENARY_RUNTIME_KEY} from '../functions/_mercenary_account.js';
const origin='https://game.test';
async function fixture(t,postgres){const f=await mercenaryFixture(t,{postgres});await f.setting(MERCENARY_RUNTIME_KEY,{...f.policy,mode:'OFF',opening:{...f.policy.opening,coinPerOpen:500000000}});await f.p('UPDATE users SET coin=60000000000 WHERE id=7').run();return f;}
function call(f,path,body,{owner=false,method=body?'POST':'GET',site=origin}={}){return handleMercenaryAccount({path,env:f.env,deps:{...f.deps,authenticate:async()=>({...f.user,role:owner?'OWNER':'USER'})},request:new Request(origin+'/api/'+path,{method,headers:{origin:site,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})});}
const toggle=(f,mode,revision,requestId=crypto.randomUUID())=>call(f,'admin/mercenaries/opening',{mode,revision,requestId},{owner:true,method:'PATCH'});
for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: missing switch is OFF; only OWNER can start a ready pack; revisions, origin and audit are enforced`,async t=>{
  const f=await fixture(t,postgres);assert.deepEqual((await hyperOpeningState(f.env)).blockers,[]);assert.equal((await hyperOpeningState(f.env)).mode,'OFF');
  for(const path of HYPER_OPEN_PATHS)assert.equal((await call(f,path,{requestId:crypto.randomUUID(),count:1})).status,409);
  assert.equal(await f.coin(),60000000000);
  const body={mode:'ON',revision:0,requestId:crypto.randomUUID()};
  assert.equal((await call(f,'admin/mercenaries/opening',body,{method:'PATCH'})).status,403);
  assert.equal((await call(f,'admin/mercenaries/opening',body,{owner:true,method:'PATCH',site:'https://foreign.test'})).status,403);
  const on=await toggle(f,'ON',0,body.requestId);assert.equal(on.status,200,JSON.stringify(await on.clone().json()));
  assert.equal((await on.json()).mode,'ON');assert.equal((await(await toggle(f,'ON',0,body.requestId)).json()).replayed,true);
  assert.equal((await toggle(f,'OFF',0)).status,409);
  assert.equal(Number((await f.p("SELECT COUNT(*) n FROM admin_logs WHERE action_type='HYPER_PACK_OPENING_MODE'").first()).n),1);
  assert.equal((await toggle(f,'OFF',1)).status,200);
 });
 test(`${label}: ordinary user opens 1/10 at fixed price; aliases replay once; OFF retains receipts and collection while combat stays held`,async t=>{
  const f=await fixture(t,postgres);assert.equal((await toggle(f,'ON',0)).status,200);
  const firstBody={requestId:crypto.randomUUID(),count:1},batchBody={requestId:crypto.randomUUID(),count:10};
  assert.equal((await call(f,'mercenary-cards/open',firstBody)).status,200);
  const response=await call(f,'mercenary-cards/open-batch',batchBody);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const receipt=await response.json();assert.equal(receipt.draws.length,10);
  for(const path of HYPER_OPEN_PATHS){const r=await call(f,path,batchBody);assert.equal(r.status,200);assert.equal((await r.json()).replayed,true);}
  assert.equal(await f.coin(),54500000000);assert.equal(Number((await f.p('SELECT SUM(total_copies) n FROM user_mercenary_cards_v1 WHERE user_id=7').first()).n),11);
  assert.equal((await call(f,'mercenaries/v3/loadout',{requestId:crypto.randomUUID(),mercenaryCode:'V-001',revision:0})).status,423);
  const before=await(await call(f,'mercenaries/v3/state')).json();assert.equal(before.available,false);assert.equal(before.openingAvailable,true);
  assert.equal((await toggle(f,'OFF',1)).status,200);
  assert.equal((await call(f,'hyper-pack/open',{requestId:crypto.randomUUID(),count:10})).status,409);
  const path='mercenaries/v3/receipt';const result=await handleMercenaryAccount({path,env:f.env,deps:{...f.deps,authenticate:async()=>({...f.user,role:'USER'})},request:new Request(origin+'/api/'+path+'?requestId='+batchBody.requestId)});assert.equal(result.status,200);assert.deepEqual((await result.json()).draws,receipt.draws);
  assert.equal((await(await call(f,'mercenaries/v3/state')).json()).cards.length,before.cards.length);assert.equal(await f.coin(),54500000000);
 });
 test(`${label}: invalid reward readiness cannot start; audit failure cannot enable opening`,async t=>{
  const f=await fixture(t,postgres);const draw=structuredClone(f.draw);for(const o of draw.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(draw);
  let result=await toggle(f,'ON',0);assert.equal(result.status,409);assert.match((await result.json()).error,/SS/);
  await f.setDraw(f.draw);await f.p("UPDATE inventory_items SET is_active=0 WHERE code='MASTER_STAR'").run();for(const o of draw.outcomes)o.chancePpm=o.id==='MASTER_STAR'?1000000:0;await f.setDraw(draw);
  assert.equal((await toggle(f,'ON',0)).status,409);await f.p("UPDATE inventory_items SET is_active=1 WHERE code='MASTER_STAR'").run();await f.setDraw(f.draw);
  f.fail('INSERT INTO admin_logs');result=await toggle(f,'ON',0);assert.ok(result.status>=400);assert.equal((await hyperOpeningState(f.env)).mode,'OFF');f.fail('');
 });
 test(`${label}: opening guard rejects a stop between readiness and debit without changing wallet`,async t=>{
  const f=await fixture(t,postgres);await toggle(f,'ON',0);const guards=await hyperOpeningGuards(f.env);await toggle(f,'OFF',1);
  await assert.rejects(()=>f.env.DB.batch([...guards,f.p('UPDATE users SET coin=coin-500000000 WHERE id=7')]));assert.equal(await f.coin(),60000000000);
 });
}
