import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {citadelFixture,citadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {citadelEnemies} from '../functions/_legion_citadel_battle.js';
import {citadelLoot,personalFarm,farmView,collectCitadelPile,citadelGrantStatements} from '../functions/_legion_citadel_loot.js';
import {defaultCitadelPolicy} from '../functions/_legion_citadel_policy.js';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
import {MIRACLE_BURNING_META_KEY} from '../functions/_miracle_burning.js';
import {victoryBuffKey} from '../functions/_territory_frontline.js';
import {legionRegionDefaults,LEGION_REGIONS_KEY,REGION_EQUIPMENT,regionalDifficulty} from '../shared/legion-regions-v1.mjs';
import {ASCENDANT_EQUIPMENT} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {createLegionCoins,advanceLegionCoins} from '../shared/legion-hunt-coins-v1.mjs';
import {UNIQUE_MERCENARY_EQUIPMENT as equipment} from '../shared/mercenary-unique-equipment-v1.mjs';

const stages=['gate','keep','throne'],users=[{id:1},{id:2}];
// Synthetic CMS inputs; live odds belong to the private operator catalog.
const syntheticTenth=280;
const getMeta=async(f,key)=>JSON.parse((await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first())?.value||'null');
const saveMeta=(f,key,value)=>f.exec('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value));
async function seedGear(f){
 const region=legionRegionDefaults();region.mode='ON';
 region.ascendantDrops={enabled:true,tiers:Array.from({length:10},(_,i)=>({tier:i+1,expectedRuns:100+20*i}))};
 await saveMeta(f,LEGION_REGIONS_KEY,region);
 for(const [i,g] of equipment.entries())await f.exec('INSERT INTO character_equipment_items(id,code,name,rarity,image_url,is_active,is_public) VALUES(?,?,?,?,?,1,1)',101+i,g.code,g.name,g.rarity,g.image);
 for(const [i,g] of [...REGION_EQUIPMENT,...ASCENDANT_EQUIPMENT].entries())await f.exec('INSERT INTO character_equipment_items(id,code,name,rarity,image_url,is_active,is_public) VALUES(?,?,?,?,?,1,1)',201+i,g.code,g.name,g.rarity,g.image);
 return region;
}
async function state(f,uid,action,body){
 const res=await f.action(uid,action,body);assert.equal(res.status,200,JSON.stringify(res.body));return res.body.state;
}
async function boot(f,tier){
 const {id}=await state(f,1,'create',{requestId:'citadel-reward-boundaries',tier});
 await state(f,2,'join',{id});for(const uid of [1,2])await state(f,uid,'ready',{id,...f.selection(uid-1)});
 await state(f,1,'start',{id});await state(f,1,'loaded',{id});return state(f,2,'loaded',{id});
}

test('each party form, respawn and boss uses a separate alpha WebP',async()=>{
 const {forms,sustained}=citadelEnemies();
 assert.equal(new Set(forms.map(f=>f.battleSprite)).size,5);
 assert.deepEqual(sustained.templates.map(f=>f.battleSprite),forms.slice(0,4).map(f=>f.battleSprite));
 assert.equal(sustained.finalBoss.battleSprite,forms[4].battleSprite);
 for(const form of forms){
  assert.match(form.battleSprite,/^\/assets\/ui\/legion-citadel\/enemies-v1\/[\w-]+\.webp$/);
  const bytes=await readFile(new URL('..'+form.battleSprite,import.meta.url));
  assert.equal(bytes.toString('ascii',8,16),'WEBPVP8X');assert.ok(bytes[20]&16);
  assert.equal(form.projectVMonsterArt.primaryUrl,form.battleSprite);
 }
});

test('every boss can award all three families at its stage multiplier, including all 15 public equipment IDs',async()=>{
 const f=await citadelFixture();try{
  const region=await seedGear(f),drops={...defaultCitadelPolicy().drops,normalPercent:0,elitePercent:0,bossPercent:0};
  for(const [i,tier] of stages.entries()){
   const pools=await citadelLoot(f.env,users,drops,tier);
   const scale=[.8,.9,1][i],divisors=[5,10,20];
   const available=pools.flatMap(p=>p.unique.flatMap(row=>row.pieces.map(g=>g.name)));
   assert.deepEqual(available.sort(),equipment.map(g=>g.name).sort());
   for(const full of pools){
    const pool={...full,calamity:null};
    assert.equal(personalFarm(pool,[[5000,0],[9000,1]],true,()=>0).events.length,0);
    let lo=0;
    for(const [j,{pieces,percent}] of pool.unique.entries()){
     const rate=scale/(syntheticTenth*divisors[j]),hi=lo+rate;
     assert.ok(Math.abs(percent/100-rate)<1e-18);
     assert.ok(pieces.length>=2&&pieces.every(g=>equipment.some(item=>item.tier===j+1&&item.name===g.name)));
     for(const ticket of [lo+1e-12,hi-1e-12]){
      for(const [k,part] of pieces.entries()){
       const rng=[ticket,(k+.5)/pieces.length];
       const farm=personalFarm(pool,[[5000,2]],false,()=>rng.shift()??.5);
       assert.equal(farm.events.length,1);assert.equal(farm.events[0][2],1);
       assert.equal(farmView(farm,4999,true).ground.length,0);
       assert.equal(farmView(farm,5000,true).ground[0].name,part.name);
       assert.equal(farmView(farm,17000,true).ground.length,0);
      }
     }
     lo=hi;
    }
    assert.equal(personalFarm(pool,[[5000,2]],true,()=>lo+1e-12).events.length,0);
   }
  }
  region.ascendantDrops.tiers[9].expectedRuns=1_000_000_000;
  await saveMeta(f,LEGION_REGIONS_KEY,region);
  assert.equal((await citadelLoot(f.env,users,drops,'throne'))[0].unique[2].percent,100/1e9/20);
  await f.exec('UPDATE character_equipment_items SET is_public=0 WHERE id=115');
  await assert.rejects(()=>citadelLoot(f.env,users,drops,'throne'),e=>e.code==='CITADEL_CATALOG');
  region.ascendantDrops.enabled=false;await saveMeta(f,LEGION_REGIONS_KEY,region);
  assert.ok((await citadelLoot(f.env,users,drops,'throne')).every(p=>!p.unique.length));
 }finally{await f.close();}
});

test('supplementary party supplies retain weighted marginal rolls with a 30% increase',()=>{
 const goods=['a','b'].map(ref=>({type:'INVENTORY_ITEM',ref,quantity:4,weight:1}));
 const armory=['1','2'].map(ref=>({type:'EQUIPMENT',ref}));
 const pool={goods,armory,chance:20,rates:{normalPercent:8,elitePercent:50,bossPercent:80,bossMultiplier:3}};
 const trials=2000;
 for(const [kind,expected] of [[0,[.052,.052,0,0]],[1,[.325,.325,0,0]],[2,[.416,.416,.104,.104]]]){
  const counts=[0,0,0,0];
  for(let n=0;n<trials;n++){
   const farm=personalFarm(pool,[[10000,kind]],true,()=>(n+.5)/trials);
   for(const item of farmView(farm,10000,true).drops){
    counts[farm.items.findIndex(i=>i.ref===item.ref)]++;
    assert.equal(item.quantity,item.type==='EQUIPMENT'?1:kind===2?12:4);
   }
  }
  assert.deepEqual(counts,expected.map(v=>v*trials));
 }
 const saturated={...pool,armory:[],goods:goods.slice(0,1),rates:{...pool.rates,normalPercent:100}};
 assert.equal(personalFarm(saturated,[[5000,0]],true,()=>.999999).events.length,1);
 // A boss arriving during the ordinary drop interval can still award both lines.
 const bundle=personalFarm({...saturated,unique:[{pieces:armory,percent:100}]},[[5000,0],[5001,2]],false,()=>0);
 const [boss]=farmView(bundle,5001,true).ground.filter(g=>g.extraKinds===1);
 bundle.picked=[boss.token];assert.deepEqual(farmView(bundle,5001,true).drops.map(g=>g.quantity),[1,12]);
});

test('party odds and coins inherit the same event and personal bonuses as Calamity',async()=>{
 const f=await citadelFixture();try{
  await seedGear(f);
  await saveMeta(f,MIRACLE_BURNING_META_KEY,{enabled:true,endsAt:new Date(Date.now()+86400000).toISOString()});
  await saveMeta(f,victoryBuffKey(2),{start:Date.now()-1000,roundId:1});
  const pools=await citadelLoot(f.env,users,defaultCitadelPolicy().drops,'keep');
  for(const pool of pools)for(const [j,row] of pool.unique.entries()){
   assert.ok(Math.abs(row.percent-(100/syntheticTenth)*1.3*.9/[5,10,20][j])<1e-12);
  }
  for(const pool of pools){
   const tenth=pool.calamity.groups[2].flat().filter(r=>r.item.kind==='ASCENDANT'&&r.item.tier===10);
   assert.equal(tenth.length,5);
   for(const row of tenth)assert.ok(Math.abs(row.percent-100/syntheticTenth*1.3*1.3/5)<1e-12);
  }
  assert.equal(pools[0].coins.multiplier,createLegionCoins('coast','calamity').multiplier);
  assert.equal(pools[1].coins.multiplier,createLegionCoins('coast','calamity',{bonusPercent:50}).multiplier);
 }finally{await f.close();}
});

test('each seat inherits all open Calamity gear and weighted fields once; distinct regional items retain their own rates',async()=>{
 const f=await citadelFixture();try{
  const region=await seedGear(f);
  const field=(code,weight,minQuantity=1,maxQuantity=1)=>({code:'INVENTORY_ITEM:'+code,type:'INVENTORY_ITEM',ref:code,name:code,enabled:true,weight,minQuantity,maxQuantity});
  const make=(pct,items)=>({difficulties:region.difficulties.map(d=>({id:d.id,dropPercent:pct,bossDropPercent:70,lifetimeSeconds:7})),items});
  for(const r of region.regions)r.fieldDrops=make(10,[field('VEHICLE_PART_ENGINE',1,2,5),field('MASTER_STAR',3,4,8)]);
  region.regions[1].fieldDrops=make(8,[field('VEHICLE_PART_ENGINE',1,1,2),field('DESERT_ONLY',1)]);
  region.regions[2].enabled=false;
  region.regions[2].fieldDrops=make(100,[field('CLOSED_MAP',1)]);
  await saveMeta(f,LEGION_REGIONS_KEY,region);
  const pools=await citadelLoot(f.env,users,defaultCitadelPolicy().drops,'keep');
  const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,actual+' / '+expected);
  for(const pool of pools){
   assert.equal(pool.goods.some(g=>g.ref==='VEHICLE_PART_ENGINE'||g.ref==='EQUIPMENT_POLISH_STONE'),false);
   const [normal,elite,boss]=pool.calamity.groups.map(groups=>groups.flat());
   const named=(rows,ref)=>rows.filter(row=>row.item.ref===ref);
   assert.equal(named(normal,'VEHICLE_PART_ENGINE').length,1);
   near(named(normal,'VEHICLE_PART_ENGINE')[0].percent,4*1.3);
   near(named(normal,'MASTER_STAR')[0].percent,7.5*1.3);
   near(named(boss,'MASTER_STAR')[0].percent,52.5*1.3);
   assert.deepEqual([named(normal,'MASTER_STAR')[0].min,named(normal,'MASTER_STAR')[0].max],[4,8]);
   assert.equal(named(normal,'CLOSED_MAP').length,0);near(named(normal,'DESERT_ONLY')[0].percent,4*1.3);
   const base=region.difficulties.find(d=>d.id==='calamity').loot;
   for(const rows of [elite,boss]){
    const gear=rows.filter(row=>row.item.kind==='SET');assert.equal(gear.length,20);
    for(const row of gear)near(row.percent,(rows===elite?base.eliteSetPercent:base.bossSetPercent)*1.3/5);
   }
   const mythics=boss.filter(row=>row.item.kind==='UNIQUE');assert.equal(mythics.length,4);
   for(const row of mythics)near(row.percent,base.bossUniquePercent*1.3);
   const upper=boss.filter(row=>row.item.kind==='ASCENDANT');assert.equal(upper.length,50);
   for(const {item,percent} of upper)near(percent,100/region.ascendantDrops.tiers[item.tier-1].expectedRuns*1.3/5);
   near(named(normal,'EQUIPMENT_POLISH_STONE')[0].percent,base.stonePercent*1.3);
   assert.equal(pool.calamity.guarantee.quantity,base.bossStones);
  }
 }finally{await f.close();}
});

test('each confirmed kill rolls, overflowing ground piles remain collectible, and guaranteed boss stones bypass pickup',()=>{
 const item={type:'INVENTORY_ITEM',ref:'X',name:'X'},stone={type:'INVENTORY_ITEM',ref:'STONE',name:'STONE'};
 const row={item,percent:100,min:2,max:2};
 const pool={goods:[],armory:[],chance:0,calamity:{groups:[[[row]],[],[[row]]],guarantee:{item:stone,quantity:20}}};
 const farm=personalFarm(pool,Array.from({length:11},(_,i)=>[1000+i*10,i===10?2:0]),false,()=>0);
 assert.equal(farm.events.length,11);assert.equal(farmView(farm,1099,true).drops.length,0);
 assert.deepEqual(farmView(farm,1100,true).drops.map(g=>[g.ref,g.quantity]),[['STONE',20]]);
 assert.equal(collectCitadelPile(farm,farm.events[10][4],1099),false);
 const pending=farmView(farm,1099,true).ground;assert.equal(pending.length,6);
 for(const pile of pending)assert.ok(collectCitadelPile(farm,pile.token,1099));
 assert.equal(farm.picked.length,10);
 assert.equal(farmView(farm,1100,true).ground.length,1);
 const last=farm.events[10][4];assert.equal(collectCitadelPile(farm,last,13100),false);
 assert.ok(collectCitadelPile(farm,last,1100));
 assert.equal(farmView(farm,14000,false).drops.find(i=>i.ref==='X').quantity,22);
 const auto=personalFarm(pool,[[1200,2]],true,()=>0);assert.equal(farmView(auto,1200,true).drops.length,2);
 assert.equal(collectCitadelPile(auto,auto.events[0][4],1200),false);
});

test('a paused regional catalog holds an already earned guaranteed drop and coins until the original room settles',async()=>{
 const f=await citadelFixture({squads:citadelSquads({ss:21,sss:21,gear:12000000})});try{
  const region=await seedGear(f),active=await boot(f,'keep'),{id}=active,key='legion_citadel_v1:farm:'+id+':1';
  const frozen=await getMeta(f,key);assert.equal(frozen.guaranteed.length,1);
  f.clock.now=active.startsAt+active.duration+1;region.mode='OFF';await saveMeta(f,LEGION_REGIONS_KEY,region);
  assert.equal((await f.action(1,'claim',{id})).status,423);
  assert.equal(Number((await f.db.prepare('SELECT COUNT(*) n FROM coin_logs').first()).n),0);
  region.mode='ON';region.difficulties.find(d=>d.id==='calamity').loot.bossStones=77;await saveMeta(f,LEGION_REGIONS_KEY,region);
  assert.deepEqual(await getMeta(f,key),frozen);
  for(let i=0;i<2;i++)assert.equal((await state(f,1,'claim',{id})).drops.find(d=>d.ref==='EQUIPMENT_POLISH_STONE').quantity,20);
  assert.equal(Number((await f.db.prepare('SELECT COUNT(*) n FROM coin_logs').first()).n),1);
 }finally{await f.close();}
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' inherited vehicle, card, inventory and equipment rewards use solo availability checks and grant together',async()=>{
 const f=await citadelFixture({postgres});try{
  await seedGear(f);
  const items=[['VEHICLE','1'],['CARD','CN-TEST'],['EQUIPMENT','201'],['INVENTORY_ITEM','VEHICLE_PART_ENGINE']].map(([type,ref])=>({type,ref,name:ref,quantity:1}));
  const apply=async()=>f.db.batch(await citadelGrantStatements(f.env,users[0],'calamity-inherited-types',items,true,0,true));
  await f.exec("UPDATE cards_effective_v1210 SET card_status='HIDDEN' WHERE id='CN-TEST'");
  await assert.rejects(apply);
  assert.equal(Number((await f.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=1').first()).n),0);
  await f.exec("UPDATE cards_effective_v1210 SET card_status='PUBLIC' WHERE id='CN-TEST'");
  await apply();
  for(const table of ['user_equipment_instances','user_garage_vehicles'])assert.equal(Number((await f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE user_id=1').first()).n),1);
  assert.equal(Number((await f.db.prepare("SELECT quantity FROM user_cards WHERE user_id=1 AND card_id='CN-TEST'").first()).quantity),1);
 }finally{await f.close();}
});

test('all nine boss and equipment-tier combinations settle through the normal two-player APIs',async t=>{
 let ticket=0;
 t.mock.method(crypto,'getRandomValues',array=>{
  if(array.length===1)return array.fill(5);
  for(let i=0;i<array.length;i+=2){array[i]=Math.floor(ticket*4294967296);array[i+1]=0;}
  return array;
 });
 for(const [stage,tier] of stages.entries()){
  const scale=[.8,.9,1][stage];
  let lower=0;
  for(const [index,divisor] of [5,10,20].entries()){
   const rate=scale/(syntheticTenth*divisor);
   ticket=lower+rate/2;lower+=rate;
   const f=await citadelFixture({squads:citadelSquads({ss:21,sss:21,gear:12000000})});
   try{
    await seedGear(f);const active=await boot(f,tier),{id}=active;
    const room=await getMeta(f,'legion_citadel_v1:room:'+id),boss=room.kills.find(([,kind])=>kind===2);
    assert.ok(boss);f.clock.now=active.startsAt+boss[0]+1;
    const {ground}=await state(f,1,'state?id='+id);
    const reward=ground.find(g=>equipment.some(item=>item.tier===index+1&&item.name===g.name));
    assert.ok(reward,tier+' / '+(index+1));
    await state(f,1,'pickup',{id,token:reward.token});
    f.clock.now=active.startsAt+active.duration+1;
    await state(f,1,'claim',{id});
    const rows=await f.db.prepare('SELECT e.name FROM user_equipment_instances i JOIN character_equipment_items e ON e.id=i.equipment_id WHERE i.user_id=?').bind(1).all();
    assert.deepEqual(rows.results.filter(row=>equipment.some(item=>item.name===row.name)).map(row=>row.name),[reward.name]);
   }finally{await f.close();}
  }
 }
});

for(const postgres of [false,true])test((postgres?'PostgreSQL':'SQLite')+' exact coin and unique settlement, failure rollback, peer isolation and replay',async t=>{
 const f=await citadelFixture({postgres,squads:citadelSquads({ss:21,sss:21,gear:12000000})});try{
  await seedGear(f);
  const balance=async uid=>BigInt((await f.db.prepare('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=?').bind(uid).first()).coin);
  const before=100000000000000001n;
  await f.exec('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id IN (1,2)',before.toString());
  // Deterministic entropy for this isolated process. The normal API still builds
  // the battle, rolls the three families and checks the personal ground token.
  t.mock.method(crypto,'getRandomValues',array=>array.fill(array.length===1?5:0));
  const active=await boot(f,'throne'),{id}=active,room=await getMeta(f,'legion_citadel_v1:room:'+id);
  const kills=room.kills, boss=kills.find(([,kind])=>kind===2);assert.ok(boss);
  const coins=createLegionCoins('coast','calamity',{live:true});coins.eligible=true;
  function expectCoins(at){
   const timeline=kills.filter(([t])=>t<=at).map(([t,kind],i)=>({seq:i+1,combatAtMs:t,huntKill:true,boss:kind===2,elite:kind===1}));
   return 10*advanceLegionCoins(coins,{timeline,lastAck:timeline.length,policy:{huntDurationMs:regionalDifficulty('calamity').huntDurationMs}}).coins.paid;
  }
  assert.equal((await state(f,1,'state?id='+id)).coins,0);
  f.clock.now=active.startsAt+boss[0]+1;
  const mid=await state(f,1,'state?id='+id);assert.equal(mid.coins,expectCoins(boss[0]+1));
  const own=b=>b.ground.find(g=>equipment.some(i=>i.tier===1&&i.name===g.name));
  const drop=own(mid);assert.ok(drop);
  assert.equal((await f.action(2,'pickup',{id,token:drop.token})).status,403);
  assert.ok((await state(f,1,'pickup',{id,token:drop.token})).picked>=1);
  const gearCount=async uid=>Number((await f.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=?').bind(uid).first()).n);
  f.clock.now=active.startsAt+active.duration+10;
  const end=await state(f,1,'state?id='+id);assert.equal(end.coins,expectCoins(active.duration));assert.ok(end.coins>0&&end.coins<=300_000_000_000);
  assert.ok(end.drops.some(i=>i.name===drop.name&&i.quantity===1));
  assert.equal((await f.action(2,'leave',{id})).status,409);
  f.fail('INSERT INTO coin_logs');assert.equal((await f.action(1,'claim',{id})).status,503);f.fail('');
  assert.equal(await balance(1),before);assert.equal(await gearCount(1),0);assert.equal((await state(f,1,'state?id='+id)).claimed,false);
  for(let n=0;n<2;n++)assert.equal((await state(f,1,'claim',{id})).coins,end.coins);
  assert.equal(await balance(1),before+BigInt(end.coins));
  assert.equal(await gearCount(1),end.drops.filter(d=>d.type==='EQUIPMENT').reduce((sum,d)=>sum+d.quantity,0));
  assert.equal(await balance(2),before);
  const peer=await state(f,2,'claim',{id});assert.deepEqual(peer.drops.map(v=>[v.ref,v.quantity]),[['EQUIPMENT_POLISH_STONE',20]]);
  assert.equal(peer.coins,end.coins);assert.equal(await gearCount(2),0);
  for(const uid of [1,2]){await state(f,uid,'leave',{id});assert.equal(await balance(uid),before+BigInt(end.coins));}
  assert.equal((await state(f,1,'claim',{id})).coins,end.coins);
  assert.equal(Number((await f.db.prepare('SELECT COUNT(*) AS n FROM coin_logs').first()).n),2);
 }finally{await f.close();}
});

test('test mode previews earnings without spending energy or granting money; old rooms keep their original contract',async()=>{
 const f=await citadelFixture();try{
  await saveMeta(f,LEGION_HUNT_SETTINGS_KEY,{...defaultLegionHuntPolicy(),mode:'TEST',testUserIds:[1,2]});
  const active=await boot(f,'gate'),{id}=active;assert.equal(active.test,true);
  assert.equal(active.nextEntryAt,null);
  f.clock.now=active.startsAt+active.duration+1;
  const claim=await state(f,1,'claim',{id});assert.ok(claim.coins>0&&claim.claimed);assert.equal(await getMeta(f,'legion_hunt_owner_session_v1:1'),null);
  for(const uid of [1,2])assert.equal(await getMeta(f,'legion_citadel_v1:next-entry:'+uid),null);
  assert.equal(Number((await f.db.prepare('SELECT COUNT(*) AS n FROM coin_logs').first()).n),0);
  const roomKey='legion_citadel_v1:room:'+id,room=await getMeta(f,roomKey);
  delete room.members[1].coins;await saveMeta(f,roomKey,room);
  const legacy=await state(f,2,'state?id='+id);assert.equal(legacy.coins,0);assert.equal(legacy.canClaim,false);
 }finally{await f.close();}
});

for(const current of [0,1])test('OWNER is exempt from the party clock with '+current+' paid energy and the partner has an independent limit',async()=>{
 const f=await citadelFixture({ownerIds:[1]});try{
  await saveMeta(f,'legion_hunt_owner_session_v1:1',{energy:{version:1,current,updatedAt:f.clock.now,maximum:10}});
  const prior=f.clock.now+3600000;
  await saveMeta(f,'legion_citadel_v1:next-entry:1',prior);
  const active=await boot(f,'gate');f.clock.now=active.startsAt+active.duration+1;
  const owner=await state(f,1,'state?id='+active.id),partner=await state(f,2,'state?id='+active.id);
  assert.equal(owner.coins>0,current>0);assert.equal(owner.nextEntryAt,null);
  assert.ok(partner.coins>0);assert.equal(partner.nextEntryAt,active.startsAt+6*60*60*1000);
  assert.equal((await getMeta(f,'legion_hunt_owner_session_v1:1')).energy.current,0);
  assert.equal(await getMeta(f,'legion_citadel_v1:next-entry:1'),prior);
  for(const uid of [1,2]){await state(f,uid,'claim',{id:active.id});await state(f,uid,'leave',{id:active.id});}
  const lobby=(await f.action(1,'lobby')).body;assert.equal(lobby.unlimited,true);assert.equal(lobby.nextEntryAt,null);
  const other=await state(f,3,'create',{tier:'keep',requestId:'available-to-owner'});
  assert.equal((await f.action(2,'join',{id:other.id})).body.code,'CITADEL_COOLDOWN');
  await state(f,1,'join',{id:other.id});await state(f,1,'leave',{id:other.id});
  await state(f,1,'create',{tier:'throne',requestId:'unlimited-owner-can-host'});
 }finally{await f.close();}
});
