import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {iconFurFixture} from './helpers/icon-fur15-fixture.mjs';
import {cardUniqueDeckStates} from '../functions/_magic.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2,createDuoBattleV2} from '../functions/_battle_v2_preview.js';
import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';
import {defaultIconRoles} from '../shared/icon-roles-v1.mjs';

const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
// Execute the production route's actual mapping, including both hunt branches.
const mappings=[...api.matchAll(/const (engineCards|attackerEngineCards|defenderEngineCards)=(?:cards|aCards|dCards)\.map\([^\n]+/g)];
assert.equal(mappings.length,4);
function mapRoute(match,cards,state){
 const byId=new Map(state.cards.map(c=>[String(c.id),c]));
 return vm.runInNewContext(match[0]+';'+match[1],{cards,aCards:cards,dCards:cards,uniqueCardsById:byId,aUniqueById:byId,dUniqueById:byId,synergyMultiplier:1,aSynergyMultiplier:1,dSynergyMultiplier:1});
}
const input=spec=>({id:spec.cardId,rarity:'ICON',name:spec.name,title:spec.name,power:spec.basePower,breakthrough_level:0});

for(const [index,mapping] of mappings.entries())test(`entry ${index+1}: all four registered ICONs preserve server stats, enhancement and scope`,async()=>{
 const f=iconFurFixture(),mode=index<2?'PVE':'PVP';
 try{
  for(const level of [0,10])for(const spec of ICON_EXPANSION_CARDS){
   const cards=[{...input(spec),power:spec.basePower*(1+level/5),breakthrough_level:level}];
   const [state]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards}],mode,{fresh:true,batched:true});
   const mapped=mapRoute(mapping,cards,state);
   for(const [i,c]of mapped.entries()){
    assert.equal(c.iconExpansion,state.cards[i].iconExpansion,c.id+' loses the server expansion snapshot');
    const actual=buildFighter(c,i,'A',null,mode),expected=buildFighter(state.cards[i],i,'A',null,mode);
    for(const k of ['maxHp','attack','defense','speed'])assert.equal(actual[k],expected[k],c.id+' '+k);
   }
  }
  const roles=defaultIconRoles();roles.scopes[mode.toLowerCase()]=false;f.save('icon_role_settings_v1',{revision:1,document:roles,audit:[]});
  const cards=[input(ICON_EXPANSION_CARDS[1])],[state]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards}],mode,{fresh:true,batched:true});
  assert.equal(mapRoute(mapping,cards,state)[0].iconExpansion.enabled,false);
 }finally{f.close();}
});

test('actual hunt/ranked route cards and duo snapshots summon on Diim first action and the weapon attacks',async()=>{
 const f=iconFurFixture(),card=input(ICON_EXPANSION_CARDS[1]);
 try{
  for(const mode of ['PVE','PVP','DUO']){
   const cards=[card,...Array.from({length:4},(_,i)=>({id:'QA'+i,grade:'NORMAL',power:100000}))];
   const [state]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards}],mode==='PVE'?'PVE':'PVP',{fresh:true,batched:true});
   const ready=mode==='DUO'?state.cards:mapRoute(mappings[mode==='PVE'?1:2],cards,state);
   const battle=mode==='PVE'?createPveBattleV2({cards:ready,monster:{id:1,name:'QA',battle_power:50000000,isBoss:true},seed:17}):mode==='PVP'?createPvpBattleV2({attackerCards:ready,defenderCards:ready,seed:17}):createDuoBattleV2({attackerSquads:[1,2].map(ownerId=>({ownerId,cards:ready})),defenderSquads:[3,4].map(ownerId=>({ownerId,cards:ready})),seed:17});
   const timeline=battle.result.timeline,casts=timeline.filter(e=>e.techniqueCode==='AUTONOMOUS_WEAPON'&&e.phase==='CAST'),summons=timeline.filter(e=>e.type==='ICON_SUMMON');
   assert(casts.length>0,mode);assert(casts.every(c=>c.cast!==1||c.sourceAction===1),mode+' first action');
   assert(summons.length>0,mode);assert(timeline.some(e=>e.type==='TURN'&&summons.some(s=>s.summonId===e.actorId)),mode+' weapon attacks');
   for(const side of ['A','B']){const slots=[...new Map(summons.filter(s=>s.side===side).map(s=>[s.summonId,s.slot])).values()];assert.equal(new Set(slots).size,slots.length,mode+' separate slots');}
  }
 }finally{f.close();}
});

test('lost expansion snapshot can kill Diim before the first summon; preserving it restores that action',async()=>{
 const f=iconFurFixture(),cards=[input(ICON_EXPANSION_CARDS[1]),...Array.from({length:4},(_,i)=>({id:'ALLY'+i,grade:'NORMAL',power:100000}))];
 try{
  const [state]=await cardUniqueDeckStates(f.env,[{user:{id:1},cards}],'PVP',{fresh:true,batched:true});
  const mapped=mapRoute(mappings[2],cards,state),lost=mapped.map(({iconExpansion,...c})=>c);
  const enemy=Array.from({length:5},(_,i)=>({id:'ENEMY'+i,grade:'NORMAL',power:500000,power_type:'ATTACK'}));
  const run=attackerCards=>createPvpBattleV2({attackerCards,defenderCards:enemy,seed:17}).result;
  assert.equal(run(lost).timeline.filter(e=>e.type==='ICON_SUMMON').length,0);
  const fixed=run(mapped),cast=fixed.timeline.find(e=>e.type==='ICON_TECHNIQUE'&&e.phase==='CAST');
  assert.equal(cast?.sourceAction,1);assert(fixed.timeline.some(e=>e.type==='ICON_SUMMON'));
 }finally{f.close();}
});
