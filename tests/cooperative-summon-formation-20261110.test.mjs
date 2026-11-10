import test from 'node:test';
import assert from 'node:assert/strict';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {ICON_EXPANSION_CARDS} from '../shared/icon-expansion-v1.mjs';
import {coopSquads,fixture} from './helpers/cooperative-fixture.mjs';

function battleWithWeapon(size){
  const squads=coopSquads().slice(0,size);
  const diim=ICON_EXPANSION_CARDS.find(card=>card.techniqueCode==='AUTONOMOUS_WEAPON');
  squads[0].cards[0]={id:diim.cardId,rarity:'ICON',title:diim.name,power:20000000,breakthrough_level:13};
  for(const squad of squads)squad.mercenaries=[squad.mercenary,fixture.mercenaries.find(m=>m.code==='V-055')];
  const {payload,states}=createCooperativeBattle({squads,difficulty:'HARD',seed:17});
  const event=payload.battleV2.result.timeline.find(e=>e.type==='ICON_SUMMON');
  assert.ok(event);
  const frame=states.find(s=>s.A.some(row=>row.id===event.targetId&&row.hp>0));
  const cards=payload.battleV2.teams.A.cards;
  assert.equal(cards.length,2*size);
  return {event,cards,frame};
}

function actor(id){
  return {id,hp:100,battleActive:false,root:{visible:false,renderable:false,position:{set(){}},scale:{set(){}}},
    setState(state){this.state=state;},setHp(hp){this.hp=hp;},setShield(shield){this.shield=shield;},setTint(){}};
}

for(const size of [2,3])test(`${size}-player cooperative resync never assigns Diim's weapon to a card slot`,()=>{
  const {event,cards,frame}=battleWithWeapon(size);
  const allies=cards.map(card=>actor(card.id));
  while(allies.length<6)allies.push(actor('reserved-'+allies.length));
  const weapon=actor(event.targetId);
  weapon.battleActive=weapon.root.visible=true;
  const engine={formationCoop:true,allies,enemies:[],mercenaries:[],characters:[...allies,weapon],
    iconTechniqueWeapons:new Map([[weapon.id,weapon]]),combatantById:id=>engine.characters.find(a=>a.id===id),
    cancelTimelines(){},isAlive:a=>a.hp>0&&a.battleActive,updateStatus(){},sortCombatDepth(){}};
  // A saved cooperative frame predates summon kind flags. Its ID is still unique to its owner.
  const rows=frame.A.filter(f=>!f.isMercenary);
  const summon=rows.find(row=>row.id===weapon.id);
  assert.equal(summon.isIconSummon,undefined);
  const cardsOnly=rows.filter(row=>row.id!==weapon.id).reverse();
  const sync=rows=>BattleEngine.prototype.syncFinalState.call(engine,{A:rows,B:[]});
  for(const mixed of [[...cardsOnly,summon],[summon,...cardsOnly,cardsOnly[0],null,{id:'A:UNKNOWN',hp:1,maxHp:1}]]){
    sync(mixed);
    assert.deepEqual(allies.filter(a=>a.root.visible&&a.root.renderable).map(a=>a.id),cards.map(card=>card.id));
    for(const card of cardsOnly)assert.equal(engine.combatantById(card.id).hp,Math.max(0,card.hp)/card.maxHp*100);
    assert.equal(weapon.root.visible,true);
  }
  sync(cardsOnly);
  assert.equal(weapon.root.visible,false);
  assert.equal(weapon.hp,0);
  sync({});
  assert.equal(allies.some(a=>a.root.visible),false);
});
