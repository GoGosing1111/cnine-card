import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {normalizeApocalypseSettings,preserveApocalypseUltimateSettings,pveDifficultyRuntime} from '../functions/_pve_nightmare.js';
import {apocalypseLegionUltimate} from '../shared/apocalypse-legion-v1.mjs';
import {buildApocalypseLegion,castApocalypseAction} from '../functions/_apocalypse_legion.js';
import {buildMonsterFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';

const profile={battlePower:7500000,rewardCoin:600000,hpPercent:350,attackPercent:475,defensePercent:375,speedPercent:375,shieldPercent:70,attackCount:2,forcedActionEvery:4,skillEnabled:true};
const settings=(ultimate,id=75)=>normalizeApocalypseSettings({monsterProfiles:{[id]:{...profile,...(ultimate?{legionUltimate:ultimate}:{})}}});
const runtime=(apocalypse,id=75)=>pveDifficultyRuntime({apocalypse},{id,pve_tab:'APOCALYPSE'});

test('legacy balance preserved; each boss accepts zero, fractional values, and bounded settings',()=>{
 assert.deepEqual(apocalypseLegionUltimate(75),{enabled:true,attackPercent:190,shieldPiercePercent:40});
 assert.deepEqual(apocalypseLegionUltimate(76),{enabled:true,attackPercent:225,shieldPiercePercent:60});
 const saved=settings({enabled:false,attackPercent:112.5,shieldPiercePercent:0},76);
 assert.deepEqual(saved.monsterProfiles['76'].legionUltimate,{enabled:false,attackPercent:112.5,shieldPiercePercent:0});
 assert.deepEqual(apocalypseLegionUltimate(75,{attackPercent:-1,shieldPiercePercent:900}),{enabled:true,attackPercent:0,shieldPiercePercent:100});
 assert.equal(apocalypseLegionUltimate(75,{attackPercent:Infinity}).attackPercent,190);
 assert.equal(apocalypseLegionUltimate(75,{attackPercent:1e9}).attackPercent,1000);
 assert.equal(apocalypseLegionUltimate(74),null);
 assert(!('legionUltimate' in settings({},74).monsterProfiles['74']));
});

test('saved tuning reaches battle snapshot, public description and authoritative damage, independently of legacy opening damage',()=>{
 const cards=['HP','DEFENSE','DEFENSE','ATTACK','SPEED'].map((power_type,i)=>({id:'C'+i,power:10000000,power_type,rarity:'FUR'}));
 for(const id of [75,76]){
  const before=runtime(settings(undefined,id),id),after=runtime(settings({attackPercent:25,shieldPiercePercent:0},id),id);
  assert.match(after.apocalypseSkill.skills[2].description,/25%/);
  assert.equal(after.apocalypseSkill.skills[2].shieldPiercePercent,0);
  const fight=r=>createPveBattleV2({cards,monster:r.engineMonster,seed:83});
  const legacy=fight(before).result.timeline.find(e=>e.kind==='ultimate'),tuned=fight(after).result.timeline.find(e=>e.kind==='ultimate');
  assert(legacy&&tuned,'both simulations must reach the ultimate');
  assert.equal(tuned.attackPercent,25);assert.equal(tuned.shieldPiercePercent,0);
  const total=e=>e.hits.reduce((sum,h)=>sum+h.damage+h.absorbed,0);
  assert(total(tuned)<total(legacy),'lower CMS multiplier must lower actual server damage');
  const zero=fight(runtime(settings({attackPercent:0,shieldPiercePercent:100},id),id)).result.timeline.find(e=>e.kind==='ultimate');
  assert(zero);assert(zero.hits.every(h=>h.damage===0&&h.absorbed===0));
  const off=fight(runtime(settings({enabled:false},id),id));
  assert.deepEqual(off.result.timeline.filter(e=>e.type==='APOCALYPSE_SKILL').map(e=>e.kind),['seal','curse']);
  assert.equal(off.teams.B.cards.length,7);
 }
});

test('shield pierce uses configured share; already-built encounter keeps its own snapshot',()=>{
 const config=settings({attackPercent:50,shieldPiercePercent:0}),r=runtime(config);
 const [actor]=buildApocalypseLegion(r.engineMonster,buildMonsterFighter);
 config.monsterProfiles['75'].legionUltimate.attackPercent=999;
 assert.equal(actor.apocalypseUltimate.attackPercent,50);
 actor.attack=1000;actor.actions=3;actor.damageDealt=0;
 const run=pierce=>{
  actor.apocalypseUltimate.shieldPiercePercent=pierce;
  const target={id:'A:0',alive:true,hp:10000,maxHp:10000,shield:10000,attack:100,defense:0};let hit;
  castApocalypseAction(actor,[target],{damage:(t,value,options={})=>{
   const absorbed=options.ignoreShield?0:Math.min(t.shield,value);t.shield-=absorbed;
   const hpDamage=Math.min(t.hp,value-absorbed);t.hp-=hpDamage;return {absorbed,hpDamage};
  },knockout:()=>assert.fail('unexpected death'),emit:(_,e)=>{hit=e.hits[0];}});
  return hit;
 };
 assert.equal(run(0).absorbed,500);assert.equal(run(0).damage,0);
 assert.equal(run(100).damage,500);assert.equal(run(100).absorbed,0);
});

test('real CMS PATCH persists tuning in PostgreSQL and stale CMS saves retain it',async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$; CREATE TABLE app_meta(key text PRIMARY KEY,value text,updated_at text)");
 const client={async query(input){const r=await pg.query(input.text,input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
 const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
 await pg.query('INSERT INTO app_meta(key,value) VALUES($1,$2)',['battle_apocalypse_settings_v1',JSON.stringify(settings())]);
 const readBattleSettings=async()=>({apocalypse:normalizeApocalypseSettings(JSON.parse((await pg.query('SELECT value FROM app_meta')).rows[0].value))});
 const source=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
 const start=source.indexOf("      if(request.method==='PATCH'&&payload.apocalypse){"),end=source.indexOf("      if(request.method==='PATCH'&&Array.isArray(payload.ultimateRules))",start);
 assert(start>0&&end>start);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const handler=new AsyncFunction('request','payload','env','battleSettings','normalizeApocalypseSettings','preserveApocalypseUltimateSettings','invalidateMetaSnapshot','runtimeSettingsCache','readBattleSettings','writeAdminLog','admin','json',source.slice(start,end));
 const audit=[];
 const save=apocalypse=>handler({method:'PATCH'},{apocalypse},env,readBattleSettings,normalizeApocalypseSettings,preserveApocalypseUltimateSettings,()=>{},new Map(),readBattleSettings,async(...args)=>audit.push(args),{id:1},(data,status=200)=>Response.json(data,{status}));
 const initial=await save({monsterProfiles:{75:{...profile,legionUltimate:{enabled:true,attackPercent:95,shieldPiercePercent:15}},76:{...profile,legionUltimate:{enabled:false,attackPercent:112.5,shieldPiercePercent:20}}}});
 assert.equal(initial.status,200);
 let saved=(await initial.json()).apocalypse;
 assert.equal(saved.monsterProfiles['75'].legionUltimate.attackPercent,95);
 assert.equal(saved.monsterProfiles['76'].legionUltimate.enabled,false);
 assert.equal(runtime(saved).engineMonster.pve_apocalypse_skill.ultimate.shieldPiercePercent,15);
 const stale=await save({monsterProfiles:{75:{...profile,hpPercent:400},76:profile}});
 assert.equal(stale.status,200);saved=(await stale.json()).apocalypse;
 assert.equal(saved.monsterProfiles['75'].hpPercent,400);
 assert.equal(saved.monsterProfiles['75'].legionUltimate.attackPercent,95);
 assert.equal(saved.monsterProfiles['76'].legionUltimate.enabled,false);
 const partial=await save({monsterProfiles:{75:{...profile,legionUltimate:{attackPercent:0}},76:profile}});
 assert.equal(partial.status,200);saved=(await partial.json()).apocalypse;
 assert.equal(saved.monsterProfiles['75'].legionUltimate.attackPercent,0);
 assert.equal(saved.monsterProfiles['75'].legionUltimate.shieldPiercePercent,15);
 assert.equal(audit.length,3);
});
