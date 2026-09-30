import test from 'node:test';import assert from 'node:assert/strict';
import {withMagicSeason2Playback} from '../preview/magic-card-season2-v1/source/MagicSeason2Playback.js';
import {SKILL_CHIP_CLOCK} from '../shared/battle-suit-skill-chips.mjs';
const unit=(id)=>({id,hp:100,shield:0,root:{x:0,y:0,position:{set(){}}}});
class Base{
 constructor(){this.allies=[unit('A0'),unit('A1')];this.enemies=[unit('B0')];this.visible=true;this.forwarded=[];this.rows=[{dataset:{v3RosterCard:'A0'},querySelector:()=>this.label}];this.label={textContent:'전열'};this.host={dispatchEvent:e=>this.lastEvent=e.detail,closest:()=>({querySelectorAll:()=>this.rows})};}
 async applyBattlePayload(){}station(kind,index,team){return {x:index*100,y:team==='ALLY'?10:200};}
 combatantById(id){return [...this.allies,...this.enemies].find(a=>a.id===id);}
 eventHpPercent(_a,v){return v/10;}syncTargetHp(a,v){a.hp=v;}syncTargetShield(a,v){a.shield=v;}
 playEvents(events,options){this.forwarded.push({events,options});return true;}
 layoutCharacterGrid(){for(const [i,a]of this.allies.entries()){const p=this.station('cards',i,'ALLY');a.baseX=p.x;a.baseY=p.y;}}
 timeline(build,cleanup){build({fromTo:()=>{}});cleanup();return true;}sortCombatDepth(){}queueSupportEffect(){}queueBanner(){}diagnostics(){return {mounted:true};}
}
const Engine=withMagicSeason2Playback(Base);
test('intercept and team buffs apply every authoritative snapshot without a second damage calculation',async()=>{
 const e=new Engine();await e.applyBattlePayload({});await e.playEvents([{type:'MAGIC_SEASON2',phase:'INTERCEPT',targetId:'A0',targetHpAfter:1,targets:[{targetId:'A1',hpAfter:320,shieldAfter:50}]}]);
 assert.equal(e.allies[0].hp,.1);assert.equal(e.allies[1].hp,32);assert.equal(e.allies[1].shield,50);
 await e.playEvents([{type:'MAGIC_SEASON2',phase:'FALLEN_STAR',targets:[{targetId:'A1',hpAfter:320,attackAfter:1080,gaugeAfter:12}]}]);assert.equal(e.allies[1].s2ServerAttack,1080);assert.equal(e.allies[1].s2ServerGauge,12);
});
test('formation snapshots remap shared stations and dock row labels, including resize and next session',async()=>{
 const e=new Engine();await e.applyBattlePayload({});const original=e.allies.map(a=>a.id);
 await e.playEvents([{type:'MAGIC_SEASON2',phase:'FORMATION_SWAP',targets:[{targetId:'A0',row:'BACK',slot:1},{targetId:'A1',row:'FRONT',slot:0}]}]);
 assert.deepEqual(e.allies.map(a=>a.id),original);assert.equal(e.allies[0].baseX,100);assert.equal(e.label.textContent,'후열');e.layoutCharacterGrid();assert.equal(e.allies[0].baseX,100);
 await e.applyBattlePayload({});e.layoutCharacterGrid();assert.equal(e.allies[0].baseX,0);assert.deepEqual(e.diagnostics().magicSeason2.slots,{});
});
test('timed combat stays on the shared clock and normal events delegate unchanged',async()=>{
 const e=new Engine();await e.applyBattlePayload({});const events=[{type:'MAGIC_SEASON2',combatClock:SKILL_CHIP_CLOCK}];await e.playEvents(events);
 assert.deepEqual(e.forwarded[0].events,events);await e.playEvents([{type:'TURN'}]);assert.equal(e.forwarded[1].events[0].type,'TURN');
 await e.playEvents([{type:'MAGIC_SEASON2',phase:'STATUS',targetId:'B0',statusKind:'S2_COMMAND_SEVERANCE',remaining:2}],{timedInternal:true});assert.equal(e.s2Statuses.size,1);
 await e.playEvents([{type:'MAGIC_SEASON2',phase:'STATUS',targetId:'B0',statusKind:'S2_COMMAND_SEVERANCE',remaining:0}],{timedInternal:true});assert.equal(e.s2Statuses.size,0);
});
