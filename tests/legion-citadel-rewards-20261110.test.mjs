import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {citadelFixture,citadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {citadelEnemies} from '../functions/_legion_citadel_battle.js';
import {citadelLoot,personalFarm,farmView} from '../functions/_legion_citadel_loot.js';
import {defaultCitadelPolicy} from '../functions/_legion_citadel_policy.js';
import {defaultLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from '../functions/_legion_hunt_settings.js';
import {MIRACLE_BURNING_META_KEY} from '../functions/_miracle_burning.js';
import {victoryBuffKey} from '../functions/_territory_frontline.js';
import {legionRegionDefaults,LEGION_REGIONS_KEY,regionalDifficulty} from '../shared/legion-regions-v1.mjs';
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
   for(const pool of pools){
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

test('the 50% increase applies to each marginal chance including boss materials and regional set pieces',()=>{
 const goods=['a','b'].map(ref=>({type:'INVENTORY_ITEM',ref,quantity:4,weight:1}));
 const armory=['1','2'].map(ref=>({type:'EQUIPMENT',ref}));
 const pool={goods,armory,chance:20,rates:{normalPercent:8,elitePercent:50,bossPercent:80,bossMultiplier:3}};
 const trials=2000;
 for(const [kind,expected] of [[0,[.06,.06,0,0]],[1,[.375,.375,0,0]],[2,[.48,.48,.12,.12]]]){
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
  assert.equal(pools[0].coins.multiplier,createLegionCoins('coast','calamity').multiplier);
  assert.equal(pools[1].coins.multiplier,createLegionCoins('coast','calamity',{bonusPercent:50}).multiplier);
 }finally{await f.close();}
});

test('all nine boss and equipment-tier combinations settle through the normal two-player APIs',async t=>{
 let ticket=0;
 t.mock.method(crypto,'getRandomValues',array=>{
  if(array.length!==2)return array.fill(5);
  array[0]=Math.floor(ticket*4294967296);array[1]=0;return array;
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
    assert.deepEqual(rows.results.map(row=>row.name),[reward.name]);
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
  assert.equal((await state(f,1,'pickup',{id,token:drop.token})).picked,1);
  const gearCount=async uid=>Number((await f.db.prepare('SELECT COUNT(*) n FROM user_equipment_instances WHERE user_id=?').bind(uid).first()).n);
  f.clock.now=active.startsAt+active.duration+10;
  const end=await state(f,1,'state?id='+id);assert.equal(end.coins,expectCoins(active.duration));assert.ok(end.coins>0&&end.coins<=300_000_000_000);
  assert.ok(end.drops.some(i=>i.name===drop.name&&i.quantity===1));
  assert.equal((await f.action(2,'leave',{id})).status,409);
  f.fail('INSERT INTO coin_logs');assert.equal((await f.action(1,'claim',{id})).status,503);f.fail('');
  assert.equal(await balance(1),before);assert.equal(await gearCount(1),0);assert.equal((await state(f,1,'state?id='+id)).claimed,false);
  for(let n=0;n<2;n++)assert.equal((await state(f,1,'claim',{id})).coins,end.coins);
  assert.equal(await balance(1),before+BigInt(end.coins));assert.equal(await gearCount(1),1);
  assert.equal(await balance(2),before);
  const peer=await state(f,2,'claim',{id});assert.deepEqual(peer.drops,[]);assert.equal(peer.coins,end.coins);assert.equal(await gearCount(2),0);
  for(const uid of [1,2]){await state(f,uid,'leave',{id});assert.equal(await balance(uid),before+BigInt(end.coins));}
  assert.equal((await state(f,1,'claim',{id})).coins,end.coins);
  assert.equal(Number((await f.db.prepare('SELECT COUNT(*) AS n FROM coin_logs').first()).n),2);
 }finally{await f.close();}
});

test('test mode previews earnings without spending energy or granting money; old rooms keep their original contract',async()=>{
 const f=await citadelFixture();try{
  await saveMeta(f,LEGION_HUNT_SETTINGS_KEY,{...defaultLegionHuntPolicy(),mode:'TEST',testUserIds:[1,2]});
  const active=await boot(f,'gate'),{id}=active;assert.equal(active.test,true);
  f.clock.now=active.startsAt+active.duration+1;
  const claim=await state(f,1,'claim',{id});assert.ok(claim.coins>0&&claim.claimed);assert.equal(await getMeta(f,'legion_hunt_owner_session_v1:1'),null);
  assert.equal(Number((await f.db.prepare('SELECT COUNT(*) AS n FROM coin_logs').first()).n),0);
  const roomKey='legion_citadel_v1:room:'+id,room=await getMeta(f,roomKey);
  delete room.members[1].coins;await saveMeta(f,roomKey,room);
  const legacy=await state(f,2,'state?id='+id);assert.equal(legacy.coins,0);assert.equal(legacy.canClaim,false);
 }finally{await f.close();}
});

test('an owner with no remaining paid energy can play but earns no Calamity coins',async()=>{
 const f=await citadelFixture();try{
  await f.exec("UPDATE users SET role='OWNER' WHERE id=1");
  await saveMeta(f,'legion_hunt_owner_session_v1:1',{energy:{version:1,current:0,updatedAt:f.clock.now,maximum:10}});
  const active=await boot(f,'gate');f.clock.now=active.startsAt+active.duration+1;
  assert.equal((await state(f,1,'state?id='+active.id)).coins,0);
  assert.ok((await state(f,2,'state?id='+active.id)).coins>0);
  assert.equal((await getMeta(f,'legion_hunt_owner_session_v1:1')).energy.current,0);
 }finally{await f.close();}
});
