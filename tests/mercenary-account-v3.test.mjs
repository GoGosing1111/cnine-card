import test from 'node:test';import assert from 'node:assert/strict';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {openMercenaryCards,mercenaryOpeningReceipt,saveMercenaryLoadout,growMercenary,mercenaryAccountState,loadMercenaryBattleSnapshot,MERCENARY_RUNTIME_KEY,saveMercenaryRuntime} from '../functions/_mercenary_account.js';
import {handleMercenaryAccount,handleMercenaryAccountReady,mercenaryUsesInnerLock} from '../functions/_mercenary_account_routes.js';
const rid=()=>crypto.randomUUID(),zero=()=>0;
test('legacy hyper-pack keeps its outer account lock while the joint release is OFF',()=>{assert.equal(mercenaryUsesInnerLock('hyper-pack/open',false),false);assert.equal(mercenaryUsesInnerLock('hyper-pack/open',true),true);assert.equal(mercenaryUsesInnerLock('mercenaries/v3/open',false),true);});
test('mercenary public release hold never touches accounts or DB',async()=>{
 const deps={json:(b,s=200)=>Response.json(b,{status:s}),authenticate(){throw Error('auth touched');}};
 for(const path of ['mercenaries/v3/open','mercenaries/v3/loadout','mercenaries/v3/train','mercenary-cards/open']){const r=await handleMercenaryAccount({path,request:new Request(`https://game.test/api/${path}`,{method:'POST'}),env:new Proxy({},{get(){throw Error('DB touched');}}),deps});assert.ok(r.status>=400);}
});
for(const postgres of [false,true]){const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: uniform opening counts every duplicate once and replays a durable receipt`,async t=>{
  const f=await mercenaryFixture(t,{postgres}),requestId=rid(),body={requestId,count:3};
  const first=await openMercenaryCards(f.env,f.user,body,{randomInt:zero});assert.deepEqual(first.draws.map(d=>[d.mercenaryCode,d.duplicate,d.duplicateCount]),[['V-001',false,0],['V-001',true,1],['V-001',true,2]]);assert.equal(await f.coin(),9997000);
  const retry=await openMercenaryCards(f.env,f.user,body,{randomInt(){throw Error('reroll');}});assert.equal(retry.replayed,true);assert.deepEqual(retry.draws,first.draws);assert.equal(await f.coin(),9997000);
  await assert.rejects(()=>openMercenaryCards(f.env,f.user,{requestId,count:2}),{code:'JOINT_REQUEST_CONFLICT'});
  await assert.rejects(()=>mercenaryOpeningReceipt(f.env,{id:8},requestId),{code:'JOINT_NOT_FOUND'});
 });
 test(`${label}: failure rolls back coin and ownership; frozen draw survives CMS edits`,async t=>{
  const f=await mercenaryFixture(t,{postgres}),body={requestId:rid(),count:2};f.fail('INSERT INTO mercenary_card_acquisitions_v1');await assert.rejects(()=>openMercenaryCards(f.env,f.user,body,{randomInt:zero}));
  assert.equal(await f.coin(),10000000);assert.equal((await f.p('SELECT * FROM user_mercenary_cards_v1').all()).results.length,0);
  const changed=structuredClone(f.draw);for(const o of changed.outcomes)o.chancePpm=o.id==='NONE'?1000000:0;await f.setDraw(changed);f.fail('');
  const r=await openMercenaryCards(f.env,f.user,body,{randomInt(){throw Error('reroll');}});assert.equal(r.draws[0].mercenaryCode,'V-001');assert.equal(await f.coin(),9998000);
 });
 test(`${label}: item payment and rewards settle together, and empty rank pool cannot charge`,async t=>{
  const f=await mercenaryFixture(t,{postgres});await f.setting(MERCENARY_RUNTIME_KEY,{...f.policy,opening:{...f.policy.opening,paymentKind:'ITEM',itemCode:'MERCENARY_TEST_PACK',itemsPerOpen:2}});
  const changed=structuredClone(f.draw);for(const o of changed.outcomes)o.chancePpm=o.id==='MASTER_STAR'?1000000:0;changed.outcomes.find(o=>o.id==='MASTER_STAR').quantity=3;await f.setDraw(changed);
  await openMercenaryCards(f.env,f.user,{requestId:rid(),count:2},{randomInt:zero});const qty=async code=>Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',code).first()).quantity);
  assert.equal(await qty('MASTER_STAR'),106);assert.equal(await qty('MERCENARY_TEST_PACK'),96);assert.equal(await f.coin(),10000000);
  for(const o of changed.outcomes)o.chancePpm=o.id==='CARD_SS'?1000000:0;await f.setDraw(changed);await assert.rejects(()=>openMercenaryCards(f.env,f.user,{requestId:rid(),count:1}),{code:'MERCENARY_RANK_POOL_EMPTY'});assert.equal(await qty('MERCENARY_TEST_PACK'),96);
 });
 test(`${label}: owned slot and growth use independent revisions and never consume duplicates`,async t=>{
  const f=await mercenaryFixture(t,{postgres});await openMercenaryCards(f.env,f.user,{requestId:rid(),count:2},{randomInt:zero});
  const slot={requestId:rid(),mercenaryCode:'V-001',revision:0};const s=await saveMercenaryLoadout(f.env,f.user,slot);assert.equal(s.revision,1);assert.equal((await saveMercenaryLoadout(f.env,f.user,slot)).replayed,true);
  await assert.rejects(()=>saveMercenaryLoadout(f.env,{id:8,role:'OWNER'},{...slot,requestId:rid()}),{code:'MERCENARY_NOT_OWNED'});
  const train={requestId:rid(),mercenaryCode:'V-001',revision:0,quantity:2};await growMercenary(f.env,f.user,train,'TRAIN');assert.equal((await growMercenary(f.env,f.user,train,'TRAIN')).replayed,true);
  const level=await growMercenary(f.env,f.user,{requestId:rid(),mercenaryCode:'V-001',revision:1,quantity:2},'LEVEL');assert.equal(level.level,3);assert.equal(level.experience,0);
  const state=await mercenaryAccountState(f.env,f.user);assert.equal(state.cards[0].duplicates,1);assert.equal(state.cards[0].level,3);assert.equal(state.loadout.mercenaryCode,'V-001');
  const snapshot=await loadMercenaryBattleSnapshot(f.env,f.user);assert.equal(snapshot.basePower,10000);assert.equal(snapshot.stats.hp,10200);assert.notEqual(snapshot.sourceArt,snapshot.battleSprite);assert.deepEqual(snapshot.skills,[]);
  await saveMercenaryLoadout(f.env,f.user,{requestId:rid(),mercenaryCode:null,revision:1});assert.equal(await loadMercenaryBattleSnapshot(f.env,f.user),null);
 });
 test(`${label}: route rejects forged deck, cross-origin, non-owner TEST and ON policy`,async t=>{
  const f=await mercenaryFixture(t,{postgres}),path='mercenaries/v3/loadout',make=(body,origin='https://game.test')=>new Request(`https://game.test/api/${path}`,{method:'POST',headers:{authorization:'Bearer local-account-7',origin,'content-type':'application/json'},body:JSON.stringify(body)});
  const call=request=>handleMercenaryAccountReady({path,request,env:f.env,deps:f.deps});
  assert.equal((await call(make({requestId:rid(),mercenaryCode:null,revision:0,cardIds:[1,2,3,4,5,6]}))).status,400);
  assert.equal((await call(make({requestId:rid(),mercenaryCode:null,revision:0},'https://evil.test'))).status,403);
  await assert.rejects(()=>openMercenaryCards(f.env,{...f.user,role:'USER'},{requestId:rid(),count:1}),{code:'MERCENARY_CLOSED'});
  await assert.rejects(()=>saveMercenaryRuntime(f.env,f.user,{...f.policy,mode:'ON'}),{code:'MERCENARY_CONFIG'});assert.equal(await f.coin(),10000000);
 });
}
