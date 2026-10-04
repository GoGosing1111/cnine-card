import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {gsap} from 'gsap';
import {BattleEngine} from '../preview/project-v-v3/source/battle/BattleEngine.js';
import {BattleCharacter} from '../preview/project-v-v3/source/battle/BattleCharacter.js';
import {MercenarySkillFX} from '../preview/project-v-mercenary-system-v1/source/MercenarySkillFX.js';
import {Container} from 'pixi.js';
after(()=>gsap.ticker.sleep());
const harness=coop=>({formationCoop:coop,pendingTails:new Map(),simpleTimelines:new Set(),timeline:BattleEngine.prototype.timeline,settlePendingTails:BattleEngine.prototype.settlePendingTails});
test('cooperative attackers keep their own windup when another attacker shares the same target',async()=>{
 const e=harness(true),a={},b={},target={};let contacts=0,cleanups=0;
 const first=e.timeline(t=>{t.call(()=>contacts++,[],.5);t.to({x:0},{x:1,duration:1},0);},()=>cleanups++,1,{releaseAt:.65,owners:[a,target]});
 const entry=e.pendingTails.get(a);entry.instance.pause();
 assert.equal(e.pendingTails.has(target),false);
 e.settlePendingTails([b,target]);assert.equal(cleanups,0);
 const second=e.timeline(t=>t.to({x:0},{x:1,duration:1}),()=>cleanups++,1,{owners:[b,target]});
 const other=e.pendingTails.get(b);other.instance.pause();
 entry.instance.time(.7);assert.equal(contacts,1);assert.equal(await first,true);
 assert.equal(a.cooperativeActionActive,true,'return tail still owns the pose');
 e.settlePendingTails([a,target]);assert.equal(a.cooperativeActionActive,false);assert.equal(cleanups,1);
 assert.equal(e.pendingTails.get(b),other,'finishing A must not cancel B');
 other.instance.time(1);assert.equal(await second,true);assert.equal(b.cooperativeActionActive,false);assert.equal(cleanups,2);
});
test('ordinary PVE/PVP keeps target tail ownership',async()=>{
 const e=harness(false),a={},b={},target={};let cleaned=false;
 const pending=e.timeline(t=>t.to({x:0},{x:1,duration:1}),()=>cleaned=true,1,{owners:[a,target]});
 e.pendingTails.get(a).instance.pause();e.settlePendingTails([b,target]);
 assert.equal(await pending,false);assert.equal(cleaned,true);assert.equal(e.pendingTails.size,0);
});
test('incoming hit/idle cannot replace an active cooperative authored sprite pose',()=>{
 const actor={cooperativeActionActive:true,state:'ATTACK',animationAdapter:{setState(){throw Error('must not touch active pose');}}};
 for(const state of ['HIT','IDLE'])BattleCharacter.prototype.setState.call(actor,state);
 assert.equal(actor.state,'ATTACK');
});
test('shared mercenary skill cleanup leaves a concurrently moving target at its current position',()=>{
 const actor={root:new Container(),fullBodySprite:{tint:1}},target={root:new Container(),fullBodySprite:{tint:2}};
 actor.root.position.set(50,60);target.root.position.set(700,800);target.root.rotation=.2;
 MercenarySkillFX.prototype.restore.call({engine:{formationCoop:true},lastShake:{x:0,y:0},actors:new Map([['M',actor],['E1',target]]),origins:new Map([['M',{x:10,y:20,rotation:0}],['E1',{x:30,y:40,rotation:0}]])});
 assert.equal(actor.root.x,10);assert.equal(target.root.x,700);assert.equal(target.root.y,800);assert.equal(target.root.rotation,.2);
 actor.root.destroy();target.root.destroy();
});
test('late animations cannot undo authoritative cooperative damage, healing, shields or death',()=>{
 const actor={id:'A:1',team:'ALLY',hp:100,shield:0,setHp(n){this.hp=n;return n;},setShield(n,m){this.shield=n;this.maxShield=m;}};
 const e={formationCoop:true,characters:[actor],syncTargetHp:BattleEngine.prototype.syncTargetHp,syncTargetShield:BattleEngine.prototype.syncTargetShield};
 for(const [hp,shield] of [[400,12],[700,34],[0,0]]){
  BattleEngine.prototype.syncCooperativeState.call(e,{A:[{id:actor.id,hp,maxHp:1000,shield,maxShield:100}],B:[]});
  e.syncTargetHp(actor,99);e.syncTargetShield(actor,9999);
  assert.equal(actor.hp,hp/10);assert.equal(actor.shield,shield);assert.equal(actor.maxShield,100);
 }
});
