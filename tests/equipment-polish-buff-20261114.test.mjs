import test from 'node:test';
import assert from 'node:assert/strict';
import {polishFixture} from './helpers/equipment-polish-db.mjs';
import {readPolishSettings} from '../functions/_equipment_polish.js';
import {executePolish,polishReceipt} from '../functions/_equipment_polish_transactions.js';
import {equipmentGrowthFromRows,polishStateKey,restoredPolishStatements} from '../functions/_equipment_growth.js';
import {normalizedEquipmentEffects,applyPveEquipmentGrowth,applyPvpMercenaryEquipmentGrowth} from '../shared/equipment-combat-growth-v1.mjs';
import {buildFighter,buildMonsterFighter,simulateBattleV2Preview} from '../functions/_battle_v2_preview.js';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';
import {releasedMercenarySnapshot} from '../functions/_mercenary_account.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {ASCENDANT_EQUIPMENT} from '../shared/mercenary-ascendant-equipment-v1.mjs';

const user={id:7,role:'OWNER'},increments=[2,.5,3,2,.5];
const buff=settings=>({...settings,publicVisible:true,executionMode:'ON',successRate:10,maxAttempts:50,
  options:settings.options.map((o,i)=>({...o,increment:increments[i],maxLevel:20})),
  costs:Array.from({length:50},(_,i)=>({attempt:i+1,coins:10000000000000,masterStars:30000000,stones:1}))});
const state=levels=>({schemaVersion:1,userId:7,instanceId:'72',attempts:levels.reduce((a,b)=>a+b,0),rolls:500,levels,values:levels.map((n,i)=>n*increments[i])});
const fighter=()=>({isMercenary:true,battleMode:'PVE',attack:1000,maxHp:10000,hp:10000,speed:100,shield:0,maxShield:0});

test('earned polish survives set caps and composes once with personal gear',()=>{
  const raw={attackPercent:90,criticalChancePoints:25,criticalDamagePoints:110,bossDamagePercent:80,penetrationPoints:30,hpPercent:999};
  const polish={attackPercent:40,criticalChancePoints:10,criticalDamagePoints:60,bossDamagePercent:40,penetrationPoints:10,hpPercent:999};
  const fx=normalizedEquipmentEffects(raw,polish);
  assert.equal(fx.attackPercent,70);assert.equal(fx.criticalChancePoints,25);assert.equal(fx.criticalDamagePoints,110);
  assert.equal(fx.bossDamagePercent,80);assert.equal(fx.penetrationPoints,30);assert.equal(fx.hpPercent,30);
  assert.equal(normalizedEquipmentEffects(raw).attackPercent,30);
  assert.equal(normalizedEquipmentEffects({attackPercent:4},{attackPercent:999}).attackPercent,4);
  const f=fighter();
  applyPveEquipmentGrowth([f],{effects:{attackPercent:50},polishEffects:{attackPercent:40}},{attackPercent:100});
  assert.equal(f.attack,2500);
  applyPveEquipmentGrowth([f],{effects:{attackPercent:70},polishEffects:{attackPercent:40}});
  assert.equal(f.equipmentEffects.attackPercent,210);assert.equal(f.attack,3100);
  assert.equal(f.equipmentPolishEffects.attackPercent,80);
  const pvp={...fighter(),battleMode:'PVP'};
  applyPveEquipmentGrowth([pvp],{effects:raw,polishEffects:polish});assert.equal(pvp.attack,1000);
  applyPvpMercenaryEquipmentGrowth(pvp,raw);assert.equal(pvp.attack,1300);
  assert.equal(pvp.equipmentPolishEffects,undefined);
});

test('stored rebased polish reaches the equipped runtime and its user summary',()=>{
  const s=state([20,10,10,10,0]);
  const runtime=equipmentGrowthFromRows([{id:72,code:'QA_WEAPON',value:JSON.stringify(s)}],7);
  assert.equal(runtime.effects.attackPercent,40);assert.equal(runtime.polishEffects.attackPercent,40);
  assert.match(runtime.summary,/공격력 \+40%/);assert.match(runtime.summary,/치명타 피해 \+30%p/);
  const f=fighter();applyPveEquipmentGrowth([f],runtime);assert.equal(f.attack,1400);
});

test('a mercenary snapshot carries earned polish into PvE without leaking it into PvP',async t=>{
  const f=await ascendantEquipmentFixture(t);
  const item=ASCENDANT_EQUIPMENT.find(i=>i.tier===10&&i.slot==='WEAPON');
  await f.equip('PVE',item);
  const id=f.instances.get(item.code),s={...state([20,0,0,0,0]),instanceId:id};
  await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)',polishStateKey(id,7),JSON.stringify(s)).run();
  const snapshot=await releasedMercenarySnapshot(f.env,f.user,'PVE');
  assert.equal(snapshot.equipment.polishEffects.attackPercent,40);
  const pve=buildMercenaryFighter(snapshot,'A','PVE',buildFighter);
  assert.equal(pve.equipmentEffects.attackPercent,40);assert.equal(pve.attack,Math.round(pve.equipmentGrowthBase.attack*1.4));
  const pvp=buildMercenaryFighter({...snapshot,equipmentPolishEffects:{attackPercent:40}},'A','PVP',buildFighter);
  assert.equal(pvp.equipmentPolishEffects,undefined);assert.equal(pvp.attack,buildMercenaryFighter(snapshot,'A','PVP',buildFighter).attack);
});

test('PvE hit rolls honor polished critical and penetration beyond the old ceilings',()=>{
  const a=buildFighter({id:'1',title:'검수',rarity:'FUR',power:100000,power_type:'ATTACK'},0,'A',null,'PVE');
  const b=buildMonsterFighter({id:1,name:'검수 보스',battle_power:100000000});
  Object.assign(b,{isBoss:true,maxHp:1e10,hp:1e10,attack:1,defense:1000,speed:1});
  applyPveEquipmentGrowth([a],{effects:{criticalChancePoints:100,penetrationPoints:100},polishEffects:{criticalChancePoints:100,penetrationPoints:100}});
  const result=simulateBattleV2Preview({teamA:[a],teamB:[b],seed:19,maxActions:35});
  const hits=result.timeline.filter(e=>e.type==='TURN'&&e.actorId===a.id&&e.damage>0&&typeof e.critical==='boolean');
  assert(hits.length>=10);assert(hits.every(h=>h.critical));assert(hits.every(h=>h.penetration===100));
  const old={...a,equipmentPolishEffects:undefined};
  const baseline=simulateBattleV2Preview({teamA:[old],teamB:[b],seed:19,maxActions:35});
  const previous=baseline.timeline.filter(e=>e.type==='TURN'&&e.actorId===a.id&&e.damage>0&&typeof e.critical==='boolean');
  assert(previous.some(h=>!h.critical));assert(previous.every(h=>h.penetration===80));
});

for(const postgres of [false,true])test('50 successes, capped options, restoration and policy-race rollback: '+(postgres?'PostgreSQL':'SQLite'),async t=>{
  const f=await polishFixture(t,{postgres});
  const settings=buff((await f.call('',{admin:true})).body.settings);
  assert.equal((await f.call('',{admin:true,method:'PATCH',body:{settings,expectedRevision:0}})).status,200);
  await f.p('UPDATE users SET coin=? WHERE id=7',100000000000000).run();
  await f.p("UPDATE cnine_user_inventory SET quantity=300000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
  const put=async s=>f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',polishStateKey('72',7),JSON.stringify(s)).run();
  await put(state([20,0,0,0,0]));
  const policy=await readPolishSettings(f.env);
  const body={instanceId:'72',expectedAttempts:20,revision:1,requestId:'polish-buff-success-00001'};
  const continued=await executePolish(f.env,user,policy,body,{unit:0});
  assert.equal(continued.total,21);assert.equal(continued.selected,1);assert.equal(continued.values[1],.5);
  await put(state([20,9,10,10,0]));
  const final=await executePolish(f.env,user,policy,{...body,expectedAttempts:49,requestId:'polish-buff-success-00002'},{unit:0});
  assert.equal(final.total,50);assert.equal(final.selected,1);
  assert.deepEqual(final.values,[40,5,30,20,0]);
  const balance=String((await f.p('SELECT coin FROM users WHERE id=7').first()).coin);
  await assert.rejects(executePolish(f.env,user,policy,{...body,expectedAttempts:50,requestId:'polish-buff-success-00003'},{unit:0}),{code:'POLISH_COMPLETE'});
  assert.equal(String((await f.p('SELECT coin FROM users WHERE id=7').first()).coin),balance);
  await f.p("INSERT INTO equipment_forge_destroyed_v1 VALUES('buff-repair',7,'72','74')").run();
  await f.env.DB.batch(await restoredPolishStatements(f.env.DB,7,'buff-repair'));
  assert.deepEqual(JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',polishStateKey('74',7)).first()).value).values,final.values);
  await f.p("INSERT INTO equipment_forge_destroyed_v1 VALUES('buff-stale-repair',7,'72','75')").run();
  const staleRestore=await restoredPolishStatements(f.env.DB,7,'buff-stale-repair');
  await put(state([20,10,10,9,1]));
  await assert.rejects(f.env.DB.batch(staleRestore));
  assert.equal(await f.p('SELECT value FROM app_meta WHERE key=?',polishStateKey('75',7)).first(),null);
  const batch=f.env.DB.batch.bind(f.env.DB);
  f.env.DB.batch=async statements=>{
    f.env.DB.batch=batch;
    const next={...settings,notice:'정책 교체 검수'};
    assert.equal((await f.call('',{admin:true,method:'PATCH',body:{settings:next,expectedRevision:1}})).status,200);
    return batch(statements);
  };
  const racing={instanceId:'71',expectedAttempts:0,revision:1,requestId:'polish-buff-policy-race-0001'};
  await assert.rejects(executePolish(f.env,user,policy,racing,{unit:0}),{code:'POLISH_RETRY'});
  assert.equal(await polishReceipt(f.env,user,racing.requestId),null);
  assert.equal(String((await f.p('SELECT coin FROM users WHERE id=7').first()).coin),balance);
});
