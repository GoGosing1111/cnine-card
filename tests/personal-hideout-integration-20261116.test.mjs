import test from 'node:test';
import {prepareApiRuntimeRequest,openApiRuntimeRequest} from '../functions/_api_runtime_transport.js';
import assert from 'node:assert/strict';
import {citadelFixture} from './helpers/legion-citadel-fixture.mjs';
import {jointFixture} from './helpers/joint-db.mjs';
import {settleRankedHunt} from '../functions/_account_rank.js';
import {COW_DRAW_KEY,cowTicketCount} from '../functions/_legion_cow_tickets.js';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {emptyHideout,HIDEOUT_KEY,hideoutBenefits} from '../shared/personal-hideout-v1.mjs';
import {hideoutTrophies,mutateHideout,readHideout} from '../functions/_personal_hideout.js';
import {planUnifiedDropRoll,resolveUnifiedDrops} from '../functions/_drop_pool.js';
import {readCollectionBonuses} from '../functions/_collection_bonuses.js';
import {readSupportBenefits} from '../functions/_supporter_benefits.js';
import {legionHuntEnergy} from '../functions/_legion_hunt.js';
import {ultimateFixture,body as ultimateBody} from './helpers/ultimate-pack-bulk-fixture.mjs';
import {createUltimateBulkService} from '../functions/_ultimate_pack_bulk.js';
import {ultimateBulkDependencies} from '../functions/api/[[path]].js';
const unlocked=()=>({...emptyHideout(),level:1,revision:1,rooms:['main']});
for(const postgres of [false,true]){
 test((postgres?'PostgreSQL':'SQLite')+' hunt and sweep settle hideout salvage, coin and cow tickets together',async t=>{
  const f=await jointFixture(t,{postgres});
  f.env.PERSONAL_HIDEOUT_ENABLED='1';
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',COW_DRAW_KEY,'hideout-local-qa').run();
  const before=await f.coin();
  const settle=(id,sweep)=>settleRankedHunt(f.env,7,'HUNT',id,100,'QA',{source:'HUNT',sweep});
  f.fail('INSERT INTO inventory_logs');
  await assert.rejects(settle('fixture-hunt-72',false));
  f.fail('');
  assert.equal((await readHideout(f.env,7)).state.parts.STEEL,0);
  assert.equal(await f.coin(),before);
  for(const [id,sweep] of [['fixture-hunt-72',false],['fixture-hunt-63',true]]){
   const earned=await settle(id,sweep);
   assert.equal(earned.cowTicket.code,'LEGION_COW_SOLO_TICKET');
   assert.deepEqual(earned.hideoutReward,{STEEL:2,WIRE:1});
   await settle(id,sweep);
  }
  const home=(await readHideout(f.env,7)).state;
  assert.equal(home.parts.STEEL,4);assert.equal(home.parts.WIRE,2);
  assert.equal(home.parts.CORE,0);assert.equal(await cowTicketCount(f.env.DB,7,'solo'),2);
  assert.equal(await f.coin(),before+200);
 });
 test((postgres?'PostgreSQL':'SQLite')+' party consumes expanded personal energy once and settles parts without a season',async t=>{
  const f=await citadelFixture({postgres});t.after(()=>f.close());f.env.PERSONAL_HIDEOUT_ENABLED='1';
  f.clock.now=Date.parse('2026-11-17T12:00:00+09:00');
  for(const uid of [1,2])await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)',HIDEOUT_KEY(uid),JSON.stringify(unlocked()));
  const call=async(uid,path,body)=>{const r=await f.action(uid,path,body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
  assert.equal((await call(1,'lobby')).partyEnergy.current,2);
  const {state:{id}}=await call(1,'create',{requestId:'hideout-party-qa-0001'});await call(2,'join',{id});
  for(const uid of [1,2])await call(uid,'ready',{id,...f.selection(uid-1)});
  await call(1,'start',{id});await call(1,'loaded',{id});const {state:active}=await call(2,'loaded',{id});await call(2,'loaded',{id});
  assert.equal((await call(1,'lobby')).partyEnergy.current,1);
  f.clock.now=active.startsAt+active.duration+1;await call(1,'state?id='+id);await call(2,'state?id='+id);
  const paid=(await readHideout(f.env,1)).state.parts.STEEL;assert.equal(paid,8);assert.equal((await readHideout(f.env,2)).state.parts.STEEL,8);
  await call(1,'state?id='+id);assert.equal((await readHideout(f.env,1)).state.parts.STEEL,paid);
  f.clock.now=active.startsAt+3*3600000;assert.equal((await call(1,'lobby')).partyEnergy.current,2);
 });
 test((postgres?'PostgreSQL':'SQLite')+' real trophy ownership, reward bonuses and generic monster CARD pools',async t=>{
  const f=await collectionFixture(t,{postgres});f.env.PERSONAL_HIDEOUT_ENABLED='1';
  await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
  const s=unlocked();s.facilities.sofa=1;s.facilities.armory=1;s.facilities.fridge=1;
  s.placements=[{id:'stand',kind:'decor',code:'trophy',room:'main',x:500,y:500,flipped:false,trophyCode:null}];
  await f.write(HIDEOUT_KEY(7),s);
  const owned=await hideoutTrophies(f.env,7);assert(owned.length>0);assert(owned.every(t=>t.count>0&&t.image));
  const displayed=await mutateHideout(f.env,7,'trophy',{requestId:crypto.randomUUID(),revision:1,id:'stand',trophyCode:owned[0].code});assert.equal(displayed.state.placements[0].trophyCode,owned[0].code);
  await assert.rejects(mutateHideout(f.env,7,'trophy',{requestId:crypto.randomUUID(),revision:2,id:'stand',trophyCode:'NOT_OWNED'}),e=>e.code==='HIDEOUT_TROPHY');
  const collection=await readCollectionBonuses(f.env,7);assert.equal(collection.totals.coinPercent,52);assert.equal(collection.totals.dropPercent,17);assert.equal(collection.hideout.mercenaryEquipmentPercent,5);
  const support=await readSupportBenefits(f.env,7),energy=legionHuntEnergy({},Date.now(),support);assert.equal(energy.maximum,12);assert.deepEqual(support.hideout,hideoutBenefits(displayed.state));
  if(postgres)await f.pg.exec("CREATE FUNCTION sqlite_date(text,text) RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char((CASE WHEN $1='now' THEN sqlite_now() ELSE $1 END)::timestamp+$2::interval,'YYYY-MM-DD')$$;");
  await f.p("INSERT INTO unified_drop_pools_v1667(id,code,name) VALUES(5502,'HIDEOUT_QA','토벌 검수')").run();
  await f.p("INSERT INTO unified_drop_entries_v1667(pool_id,reward_type,reward_ref,chance_percent,min_quantity,max_quantity) VALUES(5502,'CARD','CN-TEST',100,1,1)").run();
  await f.p("INSERT INTO unified_drop_entries_v1667(pool_id,reward_type,chance_percent,min_quantity,max_quantity) VALUES(5502,'COIN',100,100,100)").run();
  for(const source of ['PVE','PVE_NIGHTMARE','PVE_APOCALYPSE']){
   await f.p("INSERT INTO unified_drop_bindings_v1667(source_type,trigger_type,pool_id) VALUES(?,'WIN',5502)",source).run();
   const args={userId:7,requestId:'hideout-pool-'+source,sourceType:source,triggerType:'WIN'};
   const closedPlan=await planUnifiedDropRoll({...f.env,PERSONAL_HIDEOUT_ENABLED:'0'},args);
   assert.equal(closedPlan.rewards.filter(r=>r.rewardType==='CARD').length,1);
   const plan=await planUnifiedDropRoll(f.env,args);assert.equal(plan.rewards.filter(r=>r.rewardType==='CARD').length,0);assert.equal(plan.rewards.filter(r=>r.rewardType==='COIN').length,1);
   const reward=await resolveUnifiedDrops(f.env,args);assert.equal(reward.rewards.length,1);assert.equal(Number((await f.p("SELECT COUNT(*) n FROM unified_drop_ledger_v1667 WHERE reward_type='CARD'").first()).n),0);
  }
 });
}
test('real bulk card opening uses the lamp bonus without expanding limited stock or replaying a payment',async t=>{
 const request=ultimateBody(10000);
 for(const level of [0,5]){
  const f=await ultimateFixture(t);f.env.PERSONAL_HIDEOUT_ENABLED='1';
  await f.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
  const state={...unlocked(),level:4};state.facilities.lamp=level;
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',HIDEOUT_KEY(1),JSON.stringify(state)).run();
  const deps=ultimateBulkDependencies(),pack=await f.p("SELECT * FROM card_packs WHERE id='ultimate'").first(),cached=await deps.queryContext(f.env,pack);let observed;
  f.service=createUltimateBulkService({...deps,loadContext:async()=>cached,criticalSettings:async()=>({enabled:false}),draw:(context,...args)=>{observed=context.rateRows;return deps.draw(context,...args);}});
  const result=await f.service.open(f.env,f.user,request),replay=await f.service.open(f.env,f.user,request);
  assert.equal(replay.replayed,true);assert.deepEqual(replay.results,result.results);
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
  assert.equal(Number((await f.p("SELECT issued_count FROM cards WHERE id='limited-a'").first()).issued_count),10);
  assert(Math.abs(Number(observed.find(r=>r.rarity==='SSR').rate)-(level===0?3:3.3))<1e-12);
  assert.equal(Number(observed.find(r=>r.rarity==='LIMITED').rate),1);
  assert.equal(Number(cached.rateRows.find(r=>r.rarity==='SSR').rate),3,'account bonus never mutates the shared draw context');
 }
});


test('Pages forwards the enabled or closed hideout state to the actual regional API environment',async()=>{
 const transport=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
 for(const setting of ['1','0',undefined]){
  const root={API_RUNTIME_KEY:transport,...(setting===undefined?{}:{PERSONAL_HIDEOUT_ENABLED:setting})};
  const request=new Request('https://cnine-card.pages.dev/api/hideout');
  const forwarded=await prepareApiRuntimeRequest(request,root);
  const opened=await openApiRuntimeRequest(forwarded,{API_RUNTIME_KEY:transport,PERSONAL_HIDEOUT_ENABLED:'obsolete'});
  assert.equal(opened.env.PERSONAL_HIDEOUT_ENABLED,setting);
 }
});
