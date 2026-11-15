import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {equipmentDefenseFromRows,equipmentGuardMultiplier,combinePveGuard} from '../shared/equipment-defense-v1.mjs';
import {equipmentGrowthFromRows} from '../functions/_equipment_growth.js';
import {applyPveEquipmentGrowth,applyPvpMercenaryEquipmentGrowth} from '../shared/equipment-combat-growth-v1.mjs';
import {buildFighter,buildMonsterFighter,simulateBattleV2Preview,buildPvePlayerTeam} from '../functions/_battle_v2_preview.js';
import {ASCENDANT_EQUIPMENT} from '../shared/mercenary-ascendant-equipment-v1.mjs';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
import {ascendantEquipmentFixture} from './helpers/ascendant-equipment-db.mjs';
import {mercenaryEquipmentState} from '../functions/_mercenary_equipment.js';
import {releasedMercenarySnapshot} from '../functions/_mercenary_account.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {ardenRows,cases,snapshotFor} from '../scripts/measure-equipment-defense-20261115.mjs';
import {stats,previewChange} from '../mercenary-codex/equipment/ui.mjs';

test('Arden has four exact armor slots at +0; its complete defense is independent of the +10 cosmetic',()=>{
 const full=equipmentGrowthFromRows(ardenRows,7);
 assert.equal(full.effects.defensePercent,200);assert.equal(full.effects.pveGuardPercent,60);assert(!full.equipmentSetVisual);
 assert.match(full.summary,/방어력 \+200%/);assert.equal(full.defenseSets[0].active,true);
 for(let n=0;n<4;n++){const fx=equipmentDefenseFromRows(ardenRows.slice(0,n));assert.equal(fx.effects.defensePercent||0,n*25);assert(!fx.sets.some(s=>s.active));}
 assert.deepEqual(equipmentDefenseFromRows(ardenRows.map(r=>({...r,code:r.code.replace('ARDEN','EMPEROR')}))).effects,{});
});
test('each of ten tiers and three unique families requires five exact distinct slots, and removal drops the complete bonus',()=>{
 for(const catalog of [ASCENDANT_EQUIPMENT,UNIQUE_MERCENARY_EQUIPMENT])for(const tier of new Set(catalog.map(i=>i.tier))){
  const rows=catalog.filter(i=>i.tier===tier),full=equipmentDefenseFromRows(rows),four=equipmentDefenseFromRows(rows.slice(0,4));
  assert.equal(full.sets.length,1);assert.equal(full.sets[0].active,true);assert.equal(full.sets[0].count,5);
  assert.equal(four.sets[0].active,false);assert(full.effects.pveGuardPercent>=four.effects.pveGuardPercent+7);
  assert.deepEqual(equipmentDefenseFromRows(rows,'PVP'),{effects:{},sets:[]});
  assert.deepEqual(equipmentDefenseFromRows([...rows,...rows]),full);
 }
 for(const name of ['tier5','tier6','tier9','tier10','unique1','unique2','unique3']){
  const fx=equipmentDefenseFromRows(cases.find(c=>c[0]===name)[1]);
  assert.equal(fx.effects.pveGuardPercent,{tier5:40,tier6:44,tier9:56,tier10:60,unique1:65,unique2:72,unique3:80}[name]);
 }
 const mixed=equipmentDefenseFromRows(cases.find(c=>c[0]==='mixed')[1]);assert.equal(mixed.sets.length,3);assert(mixed.sets.every(s=>!s.active));assert.equal(mixed.effects.pveGuardPercent,10);
});
test('wrong slots, competing items and a reused instance cannot forge a complete set',()=>{
 const rows=cases.find(c=>c[0]==='tier9')[1].map((i,n)=>({...i,instanceId:String(n+1)}));
 for(const bad of [[...rows,{...rows[0],code:'MERC_ASC_10_WEAPON'}],rows.map(i=>({...i,slot:'TOP'})),rows.map(i=>({...i,instanceId:'same'}))])assert(!equipmentDefenseFromRows(bad).sets.some(s=>s.active));
 assert.equal(equipmentDefenseFromRows(rows.map(i=>({...i,defensePercent:9999,pveGuardPercent:9999}))).effects.pveGuardPercent,56);
});
test('real defense grows from the base exactly once across character and mercenary sources, with multiplicative guard',()=>{
 const row={battleMode:'PVE',isMercenary:true,attack:100,maxHp:1000,hp:500,defense:100,speed:100,shield:0,maxShield:0};
 applyPveEquipmentGrowth([row],equipmentGrowthFromRows(cases.find(c=>c[0]==='unique1')[1],7));
 applyPveEquipmentGrowth([row],equipmentGrowthFromRows(ardenRows,7));
 assert.equal(row.defense,650);assert.equal(row.hp,500);assert.equal(row.equipmentEffects.pveGuardPercent,86);assert(Math.abs(equipmentGuardMultiplier(row)-.14)<1e-12);
 assert.equal(combinePveGuard(20,40),52);assert(equipmentGuardMultiplier({...row,equipmentEffects:{pveGuardPercent:999}})>0);
 assert.equal(equipmentGuardMultiplier({...row,battleMode:'PVP'}),1);assert.equal(equipmentGuardMultiplier({...row,isBattleSuit:true}),1);
 const pvp={...row,battleMode:'PVP',defense:100,equipmentEffects:{},equipmentGrowthBase:undefined};applyPvpMercenaryEquipmentGrowth(pvp,{defensePercent:999,pveGuardPercent:99});assert.equal(pvp.defense,100);assert(!pvp.equipmentEffects.pveGuardPercent);
});
test('canonical regional special attacks and ordinary monster attacks both consume the guard exactly once',()=>{
 const hit=(guard,region)=>{
  const player=buildFighter({id:'target',power:100000},0,'A',null,'PVE');player.maxHp=player.hp=1e8;player.speed=1;player.equipmentEffects={pveGuardPercent:guard};
  const monster=buildMonsterFighter({id:1,name:'guard-probe',battle_power:100000});monster.speed=1e6;
  if(region)Object.assign(monster,{legionRegion:'coast',legionRole:'BOSS',isBoss:true});
  const battle=simulateBattleV2Preview({teamA:[player],teamB:[monster],seed:7919,maxActions:1});
  return battle.timeline.filter(e=>e.targetId===player.id&&e.type==='TURN').reduce((n,e)=>n+(e.damage||0)+(e.absorbed||0),0);
 };
 for(const region of [false,true])for(const guard of [30,60,65,80,92]){const raw=hit(0,region),guarded=hit(guard,region);assert(raw>0);assert(Math.abs(guarded/raw-(1-guard/100))<.001,`${region}: ${raw} -> ${guarded}`);}
});
for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: actual loadout runtime applies the chosen tier and keeps PvP and ownership separate`,async t=>{
 const f=await ascendantEquipmentFixture(t,{postgres});
 for(const mode of ['PVE','PVP'])for(const item of UNIQUE_MERCENARY_EQUIPMENT.filter(i=>i.tier===1))await f.equip(mode,item);
 let state=await mercenaryEquipmentState(f.env,f.user),pve=state.loadouts.PVE,pvp=state.loadouts.PVP;
 assert.equal(pve.defenseSets[0].active,true);assert.equal(pve.effects.pveGuardPercent,65);assert.equal(pvp.effects.pveGuardPercent,undefined);
 const snapshot=await releasedMercenarySnapshot(f.env,f.user,'PVE'),fighter=buildMercenaryFighter(snapshot,'A','PVE',buildFighter);
 assert.equal(fighter.equipmentEffects.defensePercent,350);assert.equal(fighter.equipmentEffects.pveGuardPercent,65);
 await f.equip('PVE',ASCENDANT_EQUIPMENT.find(i=>i.tier===9&&i.slot==='ACCESSORY'));
 state=await mercenaryEquipmentState(f.env,f.user);assert(state.loadouts.PVE.defenseSets.every(s=>!s.active));assert.equal(state.loadouts.PVE.effects.pveGuardPercent,22);
 assert.deepEqual(state.loadouts.PVP.items,pvp.items);assert.equal(state.loadouts.PVP.effects.pveGuardPercent,undefined);
});
test('the equipment preview groups unique and ascendant sets separately and shows loss of the complete defense',()=>{
 const items=cases.find(c=>c[0]==='unique1')[1].map((i,n)=>({...i,instanceId:String(n+1)}));
 const slots=Object.fromEntries(items.map(i=>[i.slot,i.instanceId]));
 const state={mercenaries:[{code:'V-001',owned:true}],items,sets:[],loadouts:{'V-001':{PVE:slots,PVP:slots}}};
 assert.equal(stats(state,'V-001','PVE').sets[0].tierLabel,'유니크 1단계');assert.equal(stats(state,'V-001','PVE').defense.pveGuardPercent,65);assert.deepEqual(stats(state,'V-001','PVP').defense,{});
 const change=previewChange(state,{mercenaryCode:'V-001',mode:'PVE',slot:'WEAPON',instanceId:null});assert.equal(change.after.defense.pveGuardPercent,20);assert.equal(change.after.sets[0].count,4);
});
test('controlled before/after hunts preserve bare and PvP results and materially improve Arden survival',()=>{
 const before=JSON.parse(fs.readFileSync(new URL('../docs/qa/equipment-defense-sets-20261115/before.json',import.meta.url))),after=JSON.parse(fs.readFileSync(new URL('../docs/qa/equipment-defense-sets-20261115/after.json',import.meta.url)));
 assert.deepEqual(after.pvp,before.pvp);
 const sum=(report,arden)=>report.rows.filter(r=>r.name==='bare'&&r.arden===arden).reduce((n,r)=>n+r.combatMs,0);
 assert.equal(sum(after,false),sum(before,false));assert(sum(after,true)>sum(before,true)*3,'full Arden must exceed three times baseline survival in this fixed stress fixture');
 const survivors=r=>r.rows.filter(x=>x.arden&&x.name==='unique1').reduce((n,x)=>n+x.survivors,0);
 assert(survivors(after)>=survivors(before)*4,'Unique 1 must keep substantially more allies alive at the time limit');
 for(const [name,items] of cases.slice(1,8)){const s=snapshotFor(items),b=buildPvePlayerTeam({cards:s.cards,mercenary:s.mercenary});assert(b.mercenaryFighter.defense>before.stats.find(r=>r.name===name&&!r.arden).mercenary.defense);}
});
