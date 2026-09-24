import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {handleMercenaryAccount,handleMercenaryAccountReady} from '../functions/_mercenary_account_routes.js';
import {handlePveV3} from '../functions/_pve_v3_routes.js';
import {mercenaryAccountState,loadMercenaryBattleSnapshot,saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {prepareSSkillAssignments} from '../shared/mercenary-s-skill-assignment-v3.mjs';
import {MERCENARY_PACK,mercenaryPackResults} from '../shared/mercenary-pack-contract-v1.mjs';
import {V3_LIVE_CONNECTIONS} from '../shared/v3-live-connections.mjs';
import {createPveBattleV2} from '../functions/_battle_v2_preview.js';
const plan=JSON.parse(fs.readFileSync(new URL('../preview/project-v-mercenary-system-v1/skill-s-ss-plan-v3.json',import.meta.url)));
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const request=(path,body)=>new Request('https://game.test/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-7',origin:'https://game.test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});

test('production links and all opening aliases are connected while OFF permits only a settings read',async()=>{
 assert.equal(MERCENARY_PACK.price,500000000);assert.equal(MERCENARY_PACK.maxCount,10);
 for(const row of Object.values(V3_LIVE_CONNECTIONS))assert.doesNotMatch(row.url,/preview/);
 const env={DB:{prepare(sql){assert.match(sql,/SELECT value FROM app_meta/);return {bind(){return {first:async()=>null};}};}}},deps={json:(b,s=200)=>Response.json(b,{status:s}),authenticate(){throw Error('auth touched');}};
 for(const path of ['mercenary-cards/open','mercenary-cards/open-batch','hyper-pack/open','mercenaries/v3/open']){
  const r=await handleMercenaryAccount({path,request:request(path,{requestId:crypto.randomUUID(),count:10}),env,deps});assert.ok(r.status>=400);assert.equal((await r.json()).userOpeningEnabled,false);
 }
 for(const path of ['idle-dungeon/v3/run','tower/v3/run'])assert.equal((await handlePveV3({path,request:request(path,{requestId:crypto.randomUUID()}),env,deps})).status,423);
 const feature=await(await handlePveV3({path:'pve/v3/feature',request:request('pve/v3/feature'),env,deps})).json();assert.equal(feature.connected,true);assert.equal(feature.enabled,false);assert.deepEqual(feature.connections,V3_LIVE_CONNECTIONS);
});

test('presentation accepts only completed server receipts with real card art and reward quantities',()=>{
 const receipt={requestId:crypto.randomUUID(),status:'COMPLETED',draws:[{mercenaryCode:'V-001',name:'아우렌',rank:'S',sourceArt:seed.catalog.cards[0].sourceArt,duplicate:true,duplicateCount:3},{outcomeId:'MASTER_STAR',quantity:40},{outcomeId:'MYSTIC_ENERGY',quantity:2},{outcomeId:'NONE'}]};
 assert.deepEqual(mercenaryPackResults(receipt).map(r=>r.kind),['MERCENARY','MASTER_STAR','MYSTIC_ENERGY','MISS']);assert.ok(mercenaryPackResults(receipt).every(r=>r.preview===false&&r.granted===true));
 assert.throws(()=>mercenaryPackResults({...receipt,status:'PENDING'}));assert.throws(()=>mercenaryPackResults({...receipt,draws:[{...receipt.draws[0],sourceArt:'https://external.invalid/fake.png'}]}));assert.throws(()=>mercenaryPackResults({...receipt,draws:[{outcomeId:'MASTER_STAR',quantity:null}]}));
 const app=read('js/app.js'),hero=app.slice(app.indexOf('function hyperPackHero'),app.indexOf('function recentCards'));
 assert.doesNotMatch(hero,/preview\/hyper-pack|연출 미리보기/);assert.match(hero,/data-mercenary-open="10"/);assert.match(app,/MercenaryPack\.open\(Number\(count\)\)/);
 assert.match(read('admin/hyper-pack-v2076.js'),/#mercenaries\/draw/);assert.doesNotMatch(read('admin/hyper-pack-v2076.js'),/data-hyper-rate/);
});

test('every released mercenary source art can be displayed in a completed pack receipt, including Omega-X JPEG',()=>{
 for(const card of seed.catalog.cards){
  const draw={mercenaryCode:card.code,name:card.name||card.code,rank:card.code==='V-021'?'SSS':'S',sourceArt:card.sourceArt,duplicate:false,duplicateCount:0};
  const receipt={requestId:crypto.randomUUID(),status:'COMPLETED',draws:[draw]};
  const [result]=mercenaryPackResults(receipt);
  assert.equal(result.sourceArt,card.sourceArt,card.code);assert.equal(result.mercenaryCode,card.code);
 }
 const omega=seed.catalog.cards.find(card=>card.code==='V-021');assert.match(omega.sourceArt,/\.jpg$/);
 const draw={mercenaryCode:omega.code,name:'오메가-X',rank:'SSS',sourceArt:omega.sourceArt,duplicate:false,duplicateCount:0};
 const receipt={requestId:crypto.randomUUID(),status:'COMPLETED',draws:[draw]};
 assert.equal(mercenaryPackResults({...receipt,draws:[{...draw,sourceArt:omega.sourceArt.replace(/\.jpg$/,'.jpeg')}]}).length,1);
 for(const sourceArt of ['https://external.invalid/omega.jpg','//external.invalid/omega.jpg','assets/ui/project-v/mercenaries/../outside.jpg','assets/ui/project-v/mercenaries/%2e%2e/outside.jpg','assets/ui/project-v/mercenaries/omega.svg','assets/cards/omega.jpg']){
  assert.throws(()=>mercenaryPackResults({...receipt,draws:[{...draw,sourceArt}]}),sourceArt);
 }
 assert.throws(()=>mercenaryPackResults({...receipt,draws:[{...draw,rank:'INVALID'}]}));
});

for(const postgres of [false,true]){
 const label=postgres?'PostgreSQL':'SQLite';
 test(`${label}: shop and account aliases share payment, receipt, art and duplicate accounting`,async t=>{
  const f=await mercenaryFixture(t,{postgres}),rid=crypto.randomUUID(),body={requestId:rid,count:10};
  const call=path=>handleMercenaryAccountReady({path,request:request(path,body),env:f.env,deps:f.deps});
  const first=await call('hyper-pack/open');assert.equal(first.status,200);const receipt=await first.json();assert.equal(receipt.draws.length,10);assert.equal(receipt.accountId,7);assert.equal(mercenaryPackResults(receipt).length,10);assert.equal(await f.coin(),9990000);
  for(const path of ['mercenary-cards/open-batch','mercenaries/v3/open']){const replay=await(await call(path)).json();assert.equal(replay.replayed,true);assert.deepEqual(replay.draws,receipt.draws);assert.equal(await f.coin(),9990000);}
  const total=(await f.p('SELECT SUM(total_copies) AS n FROM user_mercenary_cards_v1 WHERE user_id=7').first()).n;assert.equal(Number(total),10);
 });
 test(`${label}: S6 and SS8 CMS assignments reach owned cards, separate loadout and real PVE snapshots`,async t=>{
  const f=await mercenaryFixture(t,{postgres}),d=structuredClone(f.document);for(const c of d.mercenaries)c.rank=plan.targets.find(r=>r.code===c.code)?.rank||(['V-021','V-046','V-049'].includes(c.code)?'SSS':['V-044','V-045','V-047','V-048'].includes(c.code)?'SS':'C');
  for(const s of d.skills){s.review='REVIEWED';s.balance={damageRatio:1,cooldownTurns:3,cost:0};}
  const next=prepareSSkillAssignments(d,seed.document,seed.catalog,{...plan,targets:[...plan.targets,{code:'V-044',rank:'SS',skillId:'MS-044'},{code:'V-045',rank:'SS',skillId:'MS-045'},{code:'V-047',rank:'SS',skillId:'MS-047'},{code:'V-048',rank:'SS',skillId:'MS-048'}]});await f.p("UPDATE mercenary_cms_documents_v1 SET payload_json=? WHERE doc_key='config'",JSON.stringify(next)).run();
  let revision=0;for(const row of plan.targets){
   await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:row.code,acquisitionId:crypto.randomUUID()}));
   await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mercenaryCode:row.code,revision:revision++});
   const snapshot=await loadMercenaryBattleSnapshot(f.env,f.user);assert.equal(snapshot.rank,row.rank);assert.ok(snapshot.skills.some(s=>s.id===row.skillId));assert.notEqual(snapshot.sourceArt,snapshot.battleSprite);
   const cards=Array.from({length:5},(_,i)=>({id:String(i+1),title:'계정 덱',rarity:'FUR',power:1000,power_type:'ATTACK'}));
   const battle=createPveBattleV2({cards,mercenary:snapshot,monster:{id:1,name:'전투 연결 검수',battle_power:100000},seed:12});
   assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.teams.A.mercenaries.length,1);assert.equal(battle.teams.A.mercenaries[0].cardId,row.code);assert.ok(battle.result.timeline.some(e=>e.skillId===row.skillId),row.code+' canonical skill event');
  }
  const state=await mercenaryAccountState(f.env,f.user);assert.equal(state.cards.length,14);for(const row of plan.targets){const c=state.cards.find(c=>c.code===row.code);assert.equal(c.canDeploy,true);assert.ok(c.skills.some(s=>s.id===row.skillId));}
 });
}
