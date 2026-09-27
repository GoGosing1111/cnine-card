import test from 'node:test';
import assert from 'node:assert/strict';
import {mercenaryTurnCadence,buildMercenaryFighter} from '../functions/_mercenary_combat.js';
import {buildFighter,createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {BERKAN_TEMPO,berkanPlaybackRate} from '../shared/mercenary-berkan-v1.mjs';
import {candidate} from '../scripts/measure-berkan-balance.mjs';
const actor=(id,side='A',extra={})=>({id,side,alive:true,hp:100,...extra});
const merc=(code='V-055',side='A',extra={})=>actor(side+code,side,{isMercenary:true,statMode:'RANK_FIXED',code,...extra});
function drain(c){let n=0,m;while((m=c.pending())){assert.ok(++n<4,'no recursive turn loop');c.acted(m);}return n;}
test('only Berkan accumulates five extra actions from four ordinary ally actions, in both sides',()=>{
 for(const code of ['V-055','V-049','V-004'])for(const side of ['A','B']){
  const a=actor('card',side),m=merc(code,side),other=side==='A'?'B':'A',c=mercenaryTurnCadence({[side]:[a,m],[other]:[actor('enemy',other)]});
  const counts=[];for(let i=0;i<8;i++){c.acted(a);counts.push(drain(c));}
  assert.deepEqual(counts,code==='V-055'?[1,1,1,2,1,1,1,2]:Array(8).fill(1));
  for(const extra of [{isBattleSuit:true},{actorKind:'BATTLE_SUIT'},{isMonster:true},{hp:0}])c.acted({...a,...extra});assert.equal(drain(c),0);
 }
});
test('duo action credit belongs to its owner; death and natural action cannot bank a ghost turn',()=>{
 const a=actor('a','A',{ownerId:1}),b=actor('b','A',{ownerId:2}),m=merc('V-055','A',{ownerId:1}),n=merc('V-049','A',{ownerId:2}),c=mercenaryTurnCadence({A:[a,b,m,n],B:[]});
 for(let i=0;i<4;i++){c.acted(b);assert.equal(c.pending(),n);assert.equal(drain(c),1);}
 let count=0;for(let i=0;i<4;i++){c.acted(a);assert.equal(c.pending(),m);count+=drain(c);}assert.equal(count,5);
 c.acted(a);c.acted(m);assert.equal(c.pending(),null);m.hp=0;m.alive=false;c.acted(a);assert.equal(c.pending(),null);
});
test('rank-fixed Berkan speed and playback increase 25 percent without changing damage, health or other mercenaries',()=>{
 for(const mode of ['PVE','PVP']){
  const base=buildFighter({id:1,power:180000,type:'NONE'},5,'A',null,mode),b=buildMercenaryFighter(candidate('V-055'),'A',mode,buildFighter);
  assert.equal(b.speed,Math.round(base.speed*1.25));assert.equal(b.stats.speed,b.speed);
  for(const key of ['attack','defense'])assert.equal(b[key],base[key]);assert.equal(b.maxHp,base.maxHp);
  assert.equal(buildMercenaryFighter(candidate('V-049'),'A',mode,buildFighter).speed,base.speed);
 }
 assert.equal(BERKAN_TEMPO.actionCredit,1.25);assert.equal(berkanPlaybackRate({paceScale:1}),1.625);assert.equal(berkanPlaybackRate({paceScale:2}),3.25);assert.equal(berkanPlaybackRate({reducedMotion:true}),8);
});
test('PVE and PVP publish boosted stats and complete bounded authoritative Berkan actions',()=>{
 const cards=Array.from({length:5},(_,i)=>({id:String(i+1),power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i]})),m=candidate('V-055');
 for(const battle of [createPveBattleV2({cards,mercenary:m,monster:{id:1,battle_power:6e8},seed:12}),createPvpBattleV2({attackerCards:cards,defenderCards:cards,attackerMercenary:m,defenderMercenary:m,seed:12})]){
  assert.ok(battle.result.timeline.some(e=>e.actorId?.includes('V-055')&&e.type==='MERCENARY_STARFALL'));
  assert.equal(battle.teams.A.cards.length,5);assert.equal(battle.teams.A.mercenaries.length,1);assert.ok(battle.result.timeline.length<2000);
  assert.equal(battle.teams.A.mercenaries[0].stats.speed,buildMercenaryFighter(m,'A',battle.mode||'PVE',buildFighter).speed);
 }
});
