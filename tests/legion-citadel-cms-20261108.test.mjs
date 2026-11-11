import test from 'node:test';
import assert from 'node:assert/strict';
import {citadelFixture,citadelSquads,veteranCitadelSquads} from './helpers/legion-citadel-fixture.mjs';
import {citadelEnemies,buildCitadelBattle} from '../functions/_legion_citadel_battle.js';
import {defaultCitadelPolicy,CITADEL_POLICY_KEY} from '../functions/_legion_citadel_policy.js';
import {citadelLoot,personalFarm} from '../functions/_legion_citadel_loot.js';
import {FIRST_TIER} from '../functions/_legion_citadel_tiers.js';
import {legionRegionDefaults,REGION_EQUIPMENT,LEGION_REGIONS_KEY} from '../shared/legion-regions-v1.mjs';
const ok=v=>{assert.equal(v.status,200,JSON.stringify(v.body));return v.body;};
const admin=(f,body,id=4)=>f.handle(new Request('https://game.test/api/admin/legion-hunt/citadel',{method:body?'PATCH':'GET',headers:{origin:'https://game.test','content-type':'application/json','x-test-id':String(id)},...(body?{body:JSON.stringify(body)}:{})}));
const setMode=async(f,mode)=>ok(await admin(f,{revision:ok(await admin(f)).policy.revision,mode}));
async function party(f,tier='gate',requestId='citadel-growth-cms-party'){
 const {state:{id}}=ok(await f.action(1,'create',{requestId,tier}));
 const entry=ok(await f.action(2,'lobby'));assert.equal(entry.rooms.find(r=>r.id===id).tier,tier);
 ok(await f.action(2,'join',{id}));for(const u of [1,2])ok(await f.action(u,'ready',{id,...f.selection(u-1)}));
 const start=ok(await f.action(1,'start',{id})).state;assert.equal(start.tier,tier);return id;
}
const read=async(f,k)=>JSON.parse((await f.db.prepare('SELECT value FROM app_meta WHERE key=?').bind(k).first())?.value??'null');
for(const postgres of [false,true]){
 const dialect=postgres?'PostgreSQL':'SQLite';
 test(dialect+' owner tier drop configuration, admission defaults, stale saves and audit rollback',async()=>{
  const f=await citadelFixture({postgres,partyMode:null});try{
   assert.equal(ok(await f.action(0,'status')).open,false);assert.equal((await f.action(0,'lobby')).status,401);
   assert.equal((await admin(f,undefined,2)).status,403);assert.equal((await admin(f,undefined,0)).status,401);
   const {policy,catalog,tiers}=ok(await admin(f));assert.equal(tiers.length,3);assert.equal(policy.mode,'OFF');assert.equal(policy.revision,0);
   assert.ok(catalog.supplies.length>=4);assert.ok(catalog.supplies.every(v=>v.code!=='OFF_ITEM'));
   const lobby=ok(await f.action(1,'lobby'));assert.deepEqual(lobby.rooms,[]);assert.equal(lobby.open,false);
   assert.deepEqual(lobby.tiers.map(t=>t.id),['gate','keep','throne']);
   assert.deepEqual(Object.keys(lobby.tiers[0]).sort(),['guide','id','name','stage','uniqueFamilies']);
   for(const tier of lobby.tiers)assert.deepEqual(tier.uniqueFamilies,['새벽별','그믐달','태양왕좌']);
   assert.equal((await f.action(1,'options')).status,423);assert.equal((await f.action(1,'create',{requestId:'citadel-growth-cms-party'})).status,423);
   const d={...policy.drops,normalPercent:100,elitePercent:0,bossSetPercent:0,bossMultiplier:4,equipmentCodes:[],supplies:policy.drops.supplies.slice(0,2).map(v=>({...v,quantity:17,weight:4}))};
   for(const bad of [{...d,normalPercent:101},{...d,supplies:d.supplies.slice(0,1)},{...d,supplies:[d.supplies[0],d.supplies[0]]},{...d,supplies:[d.supplies[0],{code:'OFF_ITEM',quantity:1,weight:1}]},{...d,equipmentCodes:['NO_SUCH_GEAR']}]){
    assert.equal((await admin(f,{revision:0,drops:bad})).status,400);
   }
   assert.equal((await admin(f,{revision:0,tier:'bad',drops:d})).status,400);
   assert.equal((await admin(f,{revision:0,mode:'ON',drops:d})).status,400);
   const saved=ok(await admin(f,{revision:0,tier:'keep',drops:d})).policy;assert.equal(saved.mode,'OFF');assert.deepEqual(saved.tierDrops.keep,d);assert.deepEqual(saved.drops,policy.drops);
   assert.equal((await admin(f,{revision:0,mode:'ON'})).status,409);
   f.fail('INSERT INTO admin_logs');assert.equal((await admin(f,{revision:1,mode:'ON'})).status,503);f.fail('');
   assert.equal(ok(await f.action(0,'status')).open,false);assert.equal((await read(f,CITADEL_POLICY_KEY)).revision,1);
   const fresh=ok(await admin(f,{revision:1,tier:'keep',drops:null})).policy;assert.equal(fresh.tierDrops.keep,undefined);
   assert.equal(Number((await f.db.prepare('SELECT COUNT(*) AS n FROM admin_logs').first()).n),2);
   await setMode(f,'ON');assert.equal((await f.action(1,'create',{requestId:'cms-invalid-difficulty',tier:'wrong'})).status,400);
   const legacy=ok(await f.action(1,'create',{requestId:'citadel-old-client-key'})).state;
   assert.equal(legacy.tier,FIRST_TIER);assert.equal((await f.action(1,'create',{requestId:'citadel-old-client-key',tier:'keep'})).status,409);
   const loan={id:legacy.id,...f.selection(0),mercenaryCodes:['V-058','V-977']};
   assert.equal((await f.action(1,'ready',loan)).status,403);
   await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)','comeback26:loan:1','2099-01-01 00:00:00');
   assert.deepEqual(ok(await f.action(1,'ready',loan)).state.selection.mercenaryCodes,loan.mercenaryCodes);
   await f.exec('UPDATE app_meta SET value=? WHERE key=?','2000-01-01 00:00:00','comeback26:loan:1');
   assert.equal((await f.action(1,'ready',loan)).status,403);
   const raw=await read(f,'legion_citadel_v1:room:'+legacy.id);delete raw.tier;await f.exec('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(raw),'legion_citadel_v1:room:'+legacy.id);
   assert.equal(ok(await f.action(1,'state?id='+legacy.id)).state.tierName,'재앙의 성문');
  }finally{await f.close();}
 });
 test(dialect+' pause between loaded acknowledgements and during a paid battle preserves personal settlement',async()=>{
  const f=await citadelFixture({postgres});try{
   const id=await party(f,'keep');ok(await f.action(1,'loaded',{id}));await setMode(f,'OFF');
   for(const [method,body] of [['join',{id}],['ready',{id,...f.selection(1)}],['start',{id}],['loaded',{id}],['battle?id='+id,undefined]])assert.equal((await f.action(2,method,body)).status,423,method);
   assert.equal(await read(f,'legion_hunt_owner_session_v1:1'),null);assert.equal(await read(f,'legion_hunt_owner_session_v1:2'),null);
   assert.equal(ok(await f.action(1,'lobby')).open,false);ok(await f.action(1,'leave',{id}));ok(await f.action(2,'leave',{id}));await setMode(f,'ON');
   const p=ok(await admin(f)).policy;
   const drops={...p.drops,normalPercent:100,elitePercent:100,bossPercent:100,bossSetPercent:0,supplies:p.drops.supplies.slice(0,2).map(v=>({...v,quantity:19}))};
   ok(await admin(f,{revision:p.revision,tier:'throne',drops}));const paid=await party(f,'throne','citadel-throne-paid-run');
   const farmKey=u=>'legion_citadel_v1:farm:'+paid+':'+u,farms=await Promise.all([read(f,farmKey(1)),read(f,farmKey(2))]);
   assert.equal(farms[0].items.length,1);assert.notEqual(farms[0].items[0].ref,farms[1].items[0].ref);assert.ok(farms.every(v=>v.events[0][2]===19));
   ok(await f.action(1,'loaded',{id:paid}));const active=ok(await f.action(2,'loaded',{id:paid})).state;
   await setMode(f,'OFF');ok(await admin(f,{revision:ok(await admin(f)).policy.revision,tier:'throne',drops:null}));
   assert.deepEqual(await read(f,farmKey(1)),farms[0]);assert.equal(ok(await f.action(1,'lobby')).state.status,'ACTIVE');
   ok(await f.action(1,'loaded',{id:paid}));ok(await f.action(1,'battle?id='+paid));
   const ev=farms[0].events[0];f.clock.now=active.startsAt+ev[0]+2;assert.equal((await f.action(2,'pickup',{id:paid,token:ev[4]})).status,403);
   ok(await f.action(1,'pickup',{id:paid,token:ev[4]}));f.clock.now=active.startsAt+active.duration+1;
   const receipt=ok(await f.action(1,'claim',{id:paid})).state;assert.equal(receipt.drops[0].quantity,19);assert.equal(receipt.claimed,true);
   ok(await f.action(1,'claim',{id:paid}));const inventory=await f.db.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').first();assert.equal(Number(inventory.quantity),19);
   assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM cnine_user_inventory WHERE user_id=2').first()).n.toString(),'0');
   for(const uid of [1,2]){
    assert.equal(await read(f,'legion_hunt_owner_session_v1:'+uid),null);
    assert.equal(Number(await read(f,'legion_citadel_v1:next-entry:'+uid)),active.startsAt+6*3600000);
   }
  }finally{await f.close();}
 });
}
test('Calamity equipment follows the public region and retains its rates across old party filters',async()=>{
 const f=await citadelFixture();try{
  const region=legionRegionDefaults();region.mode='ON';region.difficulties.find(v=>v.id==='calamity').loot.bossSetPercent=.5529;
  await f.exec('INSERT INTO app_meta(key,value) VALUES(?,?)',LEGION_REGIONS_KEY,JSON.stringify(region));
  const sets=REGION_EQUIPMENT.filter(v=>v.kind==='SET');for(const [i,v] of REGION_EQUIPMENT.entries())await f.exec('INSERT INTO character_equipment_items(id,code,name,is_active,is_public) VALUES(?,?,?,1,1)',20+i,v.code,v.name);
  const d=defaultCitadelPolicy().drops;const pools=await citadelLoot(f.env,[{id:1},{id:2}],{...d,equipmentCodes:[sets[0].code]});
  const inherited=p=>p.calamity.groups[2].flat().filter(v=>v.item.kind==='SET');
  for(const p of pools){assert.equal(inherited(p).length,25);assert.ok(inherited(p).every(v=>Math.abs(v.percent-.5529*1.3/5)<1e-12));}
  const limited=await citadelLoot(f.env,[{id:1},{id:2}],{...d,bossSetPercent:0,equipmentCodes:[]});
  assert.deepEqual(inherited(limited[0]),inherited(pools[0]));
  const pool={chance:100,goods:[{ref:'A',quantity:2,weight:1,type:'INVENTORY_ITEM'},{ref:'B',quantity:7,weight:3,type:'INVENTORY_ITEM'}],armory:[{ref:'9',type:'EQUIPMENT'}],rates:{normalPercent:0,elitePercent:100,bossPercent:0,bossMultiplier:3}};
  const series=[[1000,0],[4000,1],[7000,2]],one=personalFarm(pool,series,false,()=>0);
  assert.deepEqual(one.events.map(v=>v.slice(0,3)),[[4000,0,2]]);assert.ok(!('weight' in one.items[0]));
  // The 1:3 material weights have 32.5% and 97.5% marginal chances.
  pool.rates.bossPercent=100;assert.deepEqual(personalFarm(pool,series,false,()=>.325).events.map(v=>v.slice(0,3)),[[4000,1,7],[7000,2,1]]);
  pool.chance=0;assert.deepEqual(personalFarm(pool,series,false,()=>.325).events.at(-1).slice(0,3),[7000,1,21]);
 }finally{await f.close();}
});
test('public Citadel requires a boss kill and survival, with escalating pressure and a separate dockyard',()=>{
 const stages=['gate','keep','throne'],forms=stages.map(t=>citadelEnemies(t).forms);
 for(let i=1;i<3;i++)for(let j=0;j<5;j++){assert.ok(forms[i][j].maxHp>forms[i-1][j].maxHp);assert.ok(forms[i][j].attack>forms[i-1][j].attack);}
 const veteran=veteranCitadelSquads(),offense=veteranCitadelSquads({deck:'OFFENSE'});
 for(const tier of stages){
  const wipe=buildCitadelBattle(offense,5,tier);
  assert.equal(wipe.won,false);assert.equal(wipe.reason,'ELIMINATION');assert.ok(wipe.duration<420000);
  assert.ok(wipe.replay.payload.battleV2.result.final.mercenaries.A.every(f=>f.hp===0));
 }
 const gate=buildCitadelBattle(veteran,5,'gate'),keep=buildCitadelBattle(veteran,5,'keep');
 assert.ok(gate.won&&keep.won);assert.ok(keep.kills.find(k=>k[1]===2)[0]>gate.kills.find(k=>k[1]===2)[0]);
 const timeout=buildCitadelBattle(veteran,5,'throne');
 assert.equal(timeout.duration,420000);assert.equal(timeout.won,false);assert.equal(timeout.reason,'BOSS_SURVIVED');
 const clear=buildCitadelBattle(veteranCitadelSquads({gear:24000000}),5,'throne');
 assert.ok(clear.won);assert.equal(clear.duration,420000);assert.ok(clear.kills.some(k=>k[1]===2));
 const dock=buildCitadelBattle(citadelSquads({ss:1,sss:1}),5,'gate','clan-dockyard');
 assert.equal(dock.won,true);assert.equal(dock.kills.some(k=>k[1]===2),false);
 assert.equal(dock.chunks.some(c=>c.events.some(e=>e.legionPattern==='성채 일제 포격')),false);
});
