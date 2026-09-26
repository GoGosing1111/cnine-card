import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {legionFixture} from './helpers/legion-hunt-fixture.mjs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {handleLegionHunt} from '../functions/_legion_hunt.js';
import {loadMercenaryBattleSnapshot,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';

const entrySource=fs.readFileSync('js/legion-hunt-entry-v1.mjs','utf8');
function entry(options){
  const source=entrySource.slice(entrySource.indexOf('export function createHuntEntry'),entrySource.indexOf('let active=null;')).replace('export function','function');
  return vm.runInNewContext(source+';createHuntEntry(options)',{options});
}
const lobbyData={difficulties:[{id:'normal'},{id:'hard'},{id:'inferno'}],loadout:{cards:[1,2,3,4,5],mercenary:{code:'V-050'}}};
test('opening and changing difficulty only read the loadout; explicit entry runs once and never on refresh',async()=>{
  const calls=[],enters=[],renders=[];
  const state=entry({request:async path=>{calls.push(path);return lobbyData;},render:s=>renders.push(s),enter:id=>enters.push(id),dispose(){}});
  await state.refresh();state.select('hard');state.select('inferno');
  assert.deepEqual(calls,['legion-hunt/bootstrap']);assert.deepEqual(enters,[]);
  assert.equal(state.state.difficulty,'inferno');assert.equal(state.state.phase,'lobby');
  state.enter();state.enter();state.select('normal');assert.deepEqual(enters,['inferno']);
  await state.refresh();assert.equal(state.state.phase,'lobby');assert.deepEqual(enters,['inferno']);
  assert.equal(calls.length,2);assert.ok(renders.some(s=>s.data?.loadout.mercenary.code==='V-050'));
});
test('invalid/missing deck blocks entry and a late bootstrap response cannot reopen a closed lobby',async()=>{
  let response;const enters=[],renders=[];
  const state=entry({request:()=>new Promise(resolve=>response=resolve),render:s=>renders.push(s),enter:x=>enters.push(x),dispose(){}});
  const first=state.refresh();state.enter();response({...lobbyData,loadout:null,loadoutError:'덱 5장을 저장하세요'});await first;state.enter();
  assert.equal(enters.length,0);assert.equal(state.state.error,'덱 5장을 저장하세요');
  const pending=state.refresh(),count=renders.length;state.close();response(lobbyData);await pending;
  assert.equal(renders.length,count);assert.equal(state.state.phase,'closed');assert.equal(enters.length,0);
});
test('bootstrap and actual entry use the authenticated saved deck, refreshing changes at entry and preserving separate mercenary',async()=>{
  const f=await legionFixture({withMercenary:true});
  try{
    const before=await f.call('legion-hunt/bootstrap');assert.equal(before.status,200);
    assert.equal(before.body.loadout.cards.length,5);assert.equal(before.body.loadout.mercenary.code,'V-050');
    assert.ok(!f.queries.some(q=>/INSERT INTO app_meta|UPDATE app_meta/.test(q)),'opening must not create a run');
    const deck=f.getDeck();deck.ids.reverse();deck.cards[0].power=312345;deck.characterBonus.pve+=50000;f.setDeck(deck);
    const started=await f.call('legion-hunt/start',{difficulty:'hard'});assert.equal(started.status,200,JSON.stringify(started.body));
    const p=started.body.payload;assert.equal(p.previewOnly,false);assert.equal(p.loadoutSource,'LATEST_SAVED_PVE_DECK');
    assert.deepEqual(p.cards.map(c=>c.id),deck.ids);assert.equal(p.cards.find(c=>c.id===deck.cards[0].id).power,312345);
    assert.equal(p.battleV2.teams.A.cards.length,5);assert.equal(p.battleV2.teams.A.mercenaries[0].cardId,'V-050');
    assert.ok(p.battleV2.result.timeline.some(e=>e.actorId==='A:MERCENARY:V-050'&&e.skillId==='MS-050'));
    assert.equal(p.equippedWeapon.code,deck.characterBonus.equippedWeapon.code);
    assert.ok(f.snapshotReads.every(r=>r.id===f.owner.id&&r.ids===null&&r.mode==='PVE'));
    for(const forged of [{party:'veteran'},{cards:[]},{mercenaryCode:'V-021'},{userId:999}]){
      assert.equal((await f.call('legion-hunt/start',{difficulty:'normal',...forged})).status,400);
    }
  }finally{await f.close();}
});
test('no suit, no chips, and no mercenary still use a bounded server clock with no invented support',async()=>{
  const f=await legionFixture();
  try{
    const deck=f.getDeck(),equipped=structuredClone(deck.characterBonus);deck.characterBonus={pve:80000};f.setDeck(deck);
    const snapshot=(await f.call('legion-hunt/bootstrap')).body.loadout;
    const s=createHuntSession({snapshot,difficulty:'hard',limitMs:1500,seed:1731});
    assert.equal(s.diagnostics.outcome.reason,'TIME_LIMIT');assert.equal(s.diagnostics.outcome.winner,'B');
    assert.ok(s.diagnostics.outcome.combatMs<=1500);
    assert.deepEqual(s.payload.battleV2.teams.A.supports,[]);assert.equal(s.payload.battleV2.teams.A.mercenaries,undefined);
    assert.equal(s.payload.equippedBattleSuit,null);assert.equal(s.payload.equippedWeapon,null);
    assert.ok(s.payload.battleV2.result.timeline.every(e=>Number.isFinite(e.combatAtMs)));
    const canonical=createPveBattleV2({cards:snapshot.cards,characterBonus:snapshot.cardSupportBonus,monster:{id:1,battle_power:10000},seed:1731});
    assert.deepEqual(s.payload.battleV2.teams.A.cards,canonical.teams.A.cards,'same stacking, equipment distribution, rank, unique stats');
    const started=await f.call('legion-hunt/start',{difficulty:'normal'});assert.equal(started.status,200);
    equipped.equippedBattleSuit.skillChips=[];deck.characterBonus=equipped;f.setDeck(deck);
    const noChip=(await f.call('legion-hunt/start',{difficulty:'hard'})).body;
    assert.equal(noChip.payload.battleV2.teams.A.supports.length,1);
    assert.ok(noChip.payload.battleV2.result.timeline.every(e=>Number.isFinite(e.combatAtMs)));
    assert.ok(!noChip.payload.battleV2.result.timeline.some(e=>e.type==='SKILL_CHIP_CAST'));
    deck.characterBonus={pve:0};deck.cards.forEach(c=>c.power=100);f.setDeck(deck);
    const weak=(await f.call('legion-hunt/start',{difficulty:'inferno'})).body.payload;
    assert.equal(weak.battleV2.result.timeline.at(-1).winner,'B','a weak real account can fail');
  }finally{await f.close();}
});
test('missing saved cards is recoverable in lobby but cannot start or overwrite an existing expedition',async()=>{
  const f=await legionFixture();
  try{
    const deck=f.getDeck();deck.ids.pop();deck.cards.pop();f.setDeck(deck);f.resetQueries();
    const bootstrap=await f.call('legion-hunt/bootstrap');assert.equal(bootstrap.status,200);
    assert.equal(bootstrap.body.loadout,null);assert.match(bootstrap.body.loadoutError,/덱 5장/);
    assert.equal((await f.call('legion-hunt/start',{difficulty:'normal'})).status,409);
    assert.ok(!f.queries.some(q=>/INSERT INTO app_meta|UPDATE app_meta/.test(q)));
  }finally{await f.close();}
});
for(const postgres of [false,true]){
  test((postgres?'PostgreSQL':'SQLite')+': owned mercenary loadout and CMS skill reach the actual hunt handler',async t=>{
    const f=await mercenaryFixture(t,{postgres});
    await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:'V-050',acquisitionId:crypto.randomUUID()}));
    await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:'V-050',revision:0});
    const deps={...f.deps,loadMercenaryBattleSnapshot},call=async(action,body)=>{
      const path='legion-hunt/'+action,request=new Request('https://game.test/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-7',origin:'https://game.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      const r=await handleLegionHunt({path,request,env:f.env,deps});assert.equal(r.status,200,await r.clone().text());return r.json();
    };
    const lobby=await call('bootstrap');assert.equal(lobby.loadout.mercenary.code,'V-050');
    assert.ok(lobby.loadout.mercenary.skills.some(s=>s.id==='MS-050'));
    const run=await call('start',{difficulty:'normal'});assert.equal(run.payload.battleV2.teams.A.cards.length,5);assert.equal(run.payload.battleV2.teams.A.mercenaries.length,1);
    assert.equal(run.payload.battleV2.teams.A.mercenaries[0].cardId,'V-050');
    assert.ok(run.payload.battleV2.result.timeline.some(e=>e.skillId==='MS-050'));
    await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:null,revision:1});
    const next=await call('start',{difficulty:'normal'});assert.equal(next.payload.battleV2.teams.A.mercenaries,undefined);
    assert.equal(await f.coin(),10000000,'entry and inspection do not charge or grant rewards');
  });
}
test('production entry has its own battle page with no preset-party setup and an explicit parent handshake',()=>{
  const html=fs.readFileSync('pve/legion-hunt/index.html','utf8'),app=fs.readFileSync('preview/sustained-hunt-v2/app.js','utf8');
  assert.match(entrySource,/frame.src='\/pve\/legion-hunt/);
  assert.doesNotMatch(html,/검수 원정대|hunt-party|hunt-setup|검수 V2/);
  assert.match(app,/event.source!==window.parent/);assert.match(app,/entryReceived=true/);
  assert.match(html,/project-v-battle-art-adapter-v1.js/);assert.match(html,/battle-v3-live.js/);
  assert.match(fs.readFileSync('functions/api/[[path]].js','utf8'),/handleLegionHunt\(\{path,request,env,deps:\{authenticate,json,raidDeckPower,cardBattlePower,magicBattleLoadout,selectActivatedUltimate,loadMercenaryBattleSnapshot:releasedMercenarySnapshot/);
});
