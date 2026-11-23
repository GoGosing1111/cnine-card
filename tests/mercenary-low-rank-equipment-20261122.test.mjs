import test from 'node:test';
import assert from 'node:assert/strict';
import {rankedSnapshot} from './helpers/mercenary-rank-growth-20261029.mjs';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {mercenaryEquipmentPower} from '../shared/mercenary-equipment-v1.mjs';
import {mercenarySnapshotPower} from '../functions/_mercenary_account.js';
import {equipmentGrowthFromRows} from '../functions/_equipment_growth.js';
import {UNIQUE_MERCENARY_EQUIPMENT} from '../shared/mercenary-unique-equipment-v1.mjs';
import {buildFighter,distributeEquipment,distributePveEquipment} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {applyPveEquipmentGrowth,applyPvpMercenaryEquipmentGrowth} from '../shared/equipment-combat-growth-v1.mjs';
import {applyMercenaryCombatLink,mercenaryEffectiveAttack} from '../shared/mercenary-combat-link-v2103.mjs';
import {stats,previewChange} from '../mercenary-codex/equipment/ui.mjs';
import {buildCitadelBattle} from '../functions/_legion_citadel_battle.js';
import {veteranCitadelSquads} from './helpers/legion-citadel-fixture.mjs';

const codes=['V-035','V-012','V-006','V-001','V-010','V-021'];
const expectedRates=[1,2,3,5,100,100],basePower=MERCENARY_POWER_STANDARD.basePowerByRank;
const items=UNIQUE_MERCENARY_EQUIPMENT.filter(i=>i.tier===3).map((i,n)=>({...i,instanceId:String(n+1),level:15,pvePower:i.pvePower*5.5,pvpPower:i.pvpPower*5.5}));
const rawDefense=equipmentGrowthFromRows(items,1).effects;
const gear=mode=>({schemaVersion:1,mode,items,power:items.reduce((sum,i)=>sum+i[mode==='PVE'?'pvePower':'pvpPower'],0),effects:rawDefense});
const deck=Array.from({length:5},(_,i)=>({id:'card'+i,power:150000,type:'NONE'}));

function formation(code,mode,{personal=false,gearPower=0,otherPower=0,level=1,startingHpPercent=100}={}){
 const snapshot={...rankedSnapshot(code,level),startingHpPercent,...(personal?{equipment:gear(mode)}:{})};
 const fighter=buildMercenaryFighter(snapshot,'A',mode,buildFighter);
 const distribute=mode==='PVE'?distributePveEquipment:distributeEquipment;
 const cards=distribute(deck,gearPower+otherPower,gearPower).map((card,i)=>buildFighter(card,i,'A',null,mode));
 applyMercenaryCombatLink([[...cards,fighter]]);
 return {snapshot,fighter,cards};
}

for(const mode of ['PVE','PVP']){
 test(mode+' applies the actual grade to battle power, account ratings and armory transfers',()=>{
  const equipment=gear(mode),raw=equipment.power;
  for(const [idx,code] of codes.entries()){
   const {snapshot}=formation(code,mode,{personal:true});
   const rate=expectedRates[idx],expected=rate===100?raw:Math.min(Math.floor(raw*rate/100),basePower[snapshot.rank]*rate/100);
   assert.equal(mercenaryEquipmentPower(snapshot,mode),expected);
   assert.equal(mercenarySnapshotPower(snapshot)-mercenarySnapshotPower({...snapshot,equipment:null}),expected);
   assert.equal(mercenaryEquipmentPower(snapshot,mode==='PVE'?'PVP':'PVE'),0);
   const slots=Object.fromEntries(items.map(i=>[i.slot,i.instanceId]));
   const state={items,mercenaries:[{code,rank:snapshot.rank,owned:true}],sets:[],loadouts:{[code]:{[mode]:slots}}};
   assert.equal(stats(state,code,mode).power,expected);
   const change=previewChange(state,{mercenaryCode:code,mode,slot:items[0].slot,instanceId:null});
   assert.equal(change.before.power,expected);
   assert.equal(change.after.power,mercenaryEquipmentPower({...snapshot,equipment:{...equipment,power:raw-items[0][mode==='PVE'?'pvePower':'pvpPower']}},mode));
  }
 });

 test(mode+' lower fully equipped ranks stay below the next naked grade at equal level and deck',()=>{
  for(const level of [1,21])for(const [idx,code] of codes.slice(0,4).entries()){
   const low=formation(code,mode,{personal:true,gearPower:90000000,level}).fighter;
   const next=formation(codes[idx+1],mode,{level}).fighter;
   assert(mercenaryEffectiveAttack(low)<mercenaryEffectiveAttack(next),low.rank+' attack at '+level);
   assert(low.maxHp<next.maxHp,low.rank+' HP at '+level);
   assert(low.maxHp+low.maxShield<next.maxHp+next.maxShield,low.rank+' HP and shield at '+level);
  }
 });

 test(mode+' preserves non-gear power, caps each transferred stat, and applies once on reentry',()=>{
  for(const [idx,code] of codes.entries()){
   const noGear=formation(code,mode,{otherPower:2400000});
   const strong=formation(code,mode,{gearPower:99000000,otherPower:2400000});
   const naked=formation(code,mode);
   const rate=expectedRates[idx];
   for(const key of ['attackFloor','hpFloor','openingShield']){
    const plain=noGear.fighter.mercenaryLink[key],changed=strong.fighter.mercenaryLink[key];
    assert(plain>naked.fighter.mercenaryLink[key],key+' title/garage bonus');
    if(rate<100)assert(Math.abs(changed-plain*(1+rate/100))<2,key+' capped owner equipment');
    else assert(changed>plain*5,key+' upper grades use full card average');
   }
   const previous=structuredClone(strong.fighter);
   applyMercenaryCombatLink([[...strong.cards,strong.fighter]]);
   assert.deepEqual(strong.fighter,previous);
  }
  const dead=formation(codes[0],mode,{personal:true,gearPower:1e7,startingHpPercent:0}).fighter;
  assert.equal(dead.hp,0);assert.equal(dead.alive,false);assert.equal(dead.shield,0);
 });
}

test('merged character and personal effects scale once, including polish, guard, unique magnitude and its normal cadence',()=>{
 const make=(rank,mode='PVE')=>({rank,isMercenary:true,battleMode:mode,attack:1000,maxHp:1000,hp:500,speed:100,defense:100,shield:0,maxShield:0});
 const first={effects:{attackPercent:10,pveGuardPercent:80,echoEvery:4,echoPercent:20,penetrationPoints:16},polishEffects:{penetrationPoints:16}};
 const second={effects:{attackPercent:5,pveGuardPercent:60,penetrationPoints:4},polishEffects:{penetrationPoints:4}};
 for(const [idx,rank] of ['C','B','A','S','SS','SSS'].entries()){
  const f=make(rank),rate=expectedRates[idx];
  applyPveEquipmentGrowth([f],first,{attackPercent:5,hpPercent:300});
  applyPveEquipmentGrowth([f],second);
  assert.equal(f.equipmentEffects.attackPercent,20*rate/100);
  assert.equal(f.equipmentEffects.pveGuardPercent,92*rate/100);
  assert.equal(f.equipmentEffects.hpPercent,rate===100?300:rate);
  assert.equal(f.equipmentEffects.echoEvery,4);assert.equal(f.equipmentEffects.echoPercent,20*rate/100);
  assert.equal(f.equipmentPolishEffects.penetrationPoints,20*rate/100);
  assert.equal(f.attack,Math.round(1000*(1+f.equipmentEffects.attackPercent/100)));
  const pvp=make(rank,'PVP');
  applyPvpMercenaryEquipmentGrowth(pvp,{attackPercent:1000,penetrationPoints:1000},null,{attackPercent:1000,penetrationPoints:1000});
  assert.equal(pvp.equipmentEffects.attackPercent,rate===100?1000:rate);
  assert.equal(pvp.equipmentPolishEffects.penetrationPoints,rate===100?1000:rate);
 }
});

test('account HP/attack percentage gear on ordinary cards cannot enter the low-rank link at full strength',()=>{
 const cards=deck.map((c,i)=>buildFighter(c,i,'A',null,'PVE')),snapshot=rankedSnapshot(codes[0],1);
 const normal=formation(codes[0],'PVE').fighter;
 const m=buildMercenaryFighter(snapshot,'A','PVE',buildFighter);
 applyPveEquipmentGrowth([...cards,m],{effects:{hpPercent:30,attackPercent:30}});
 applyMercenaryCombatLink([[...cards,m]]);
 for(const key of ['hpFloor','openingShield','attackFloor'])assert(Math.abs(m.mercenaryLink[key]-normal.mercenaryLink[key]*1.003)<2,key);
});

test('public Citadel monsters can pick the second owner on an HP tie and defeat both geared C mercenaries',()=>{
 const squads=veteranCitadelSquads(),guest=squads[1];
 guest.mercenaries=['V-035','V-039'].map(code=>({...rankedSnapshot(code),equipment:gear('PVE')}));
 for(const party of [squads,[...squads].reverse()]){
  const run=buildCitadelBattle(party,7919,'throne'),events=run.chunks.flatMap(c=>c.events);
  const first=events.find(e=>e.type==='TURN'&&e.actorId?.startsWith('B:')&&e.label!=='성채 일제 포격');
  assert(first.targetId.startsWith('A:OWNER:'+party[1].ownerId+':'));
  for(const m of guest.mercenaries){
   const id='A:OWNER:'+guest.ownerId+':MERCENARY:'+m.code;
   assert(events.some(e=>e.type==='KO'&&e.targetId===id));
   assert.equal(run.replay.payload.battleV2.result.final.mercenaries.A.find(f=>f.id===id).hp,0);
  }
 }
});
