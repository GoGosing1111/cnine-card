import assert from 'node:assert/strict';
import {createBlackwingRoom,addBlackwingMember,readyBlackwingMember,startBlackwingRoom,actBlackwingRoom,tickBlackwingRoom,blackwingView} from '../../functions/_raid_blackwing.js';
import {REVIEW_DECK} from '../../preview/lich-king-raid-v1/fixture.mjs';
export const members=[['1','BREAKER'],['2','BREAKER'],['3','GUARD'],['6','GUARD'],['7','SEALER'],['8','SEALER']];
let serial=0;
export function room(seed=123){
 const r=createBlackwingRoom({id:'FEEDBACK01',hostId:'1',now:1000,seed,monster:{id:'BLACKWING',name:'모르드레인',isBoss:true,battle_power:45000000,pve_hp_percent:270,battleSprite:'/assets/raids/blackwing-20261024/idle.webp'}});
 for(const[id,role]of members){addBlackwingMember(r,{id,name:'참가자 '+id,role,deck:{cards:REVIEW_DECK.map(c=>({...c,power:10000000}))}});readyBlackwingMember(r,id,true);}
 startBlackwingRoom(r,'1');return r;
}
export const action=(r,id,action,target,now=r.clock,extra={})=>actBlackwingRoom(r,id,{requestId:'feedback_'+(++serial),action,token:blackwingView(r,id).challenge.tokens[action],...(target!==undefined?{target:String(target)}:{}),...extra},now);
export function oaths(r){for(const role of ['BREAKER','SEALER']){const o=r.challenge.oaths[role];while(o.progress<2){const result=action(r,o.order[o.progress],'RUNE',o.runes[o.progress]);assert.equal(result.ok,true,JSON.stringify(result));}}}
const minimumHp=r=>Math.min(...r.fighters.map(f=>f.hp/f.maxHp));
export function heal(r,enabled=true){if(enabled&&r.status==='ACTIVE'&&minimumHp(r)<.57&&r.resources.heal>0&&r.clock>=(r.resources.healReadyAt||0))assert.equal(action(r,'3','HEAL').ok,true);}
export function debt(r){oaths(r);action(r,'1','CHARGE');action(r,'2','CHARGE');action(r,'1','CHARGE',undefined,r.clock+1200);action(r,'7','ISOLATE');action(r,'8','ISOLATE');action(r,'6','ANCHOR',undefined,Math.max(r.clock,r.challenge.debt.opensAt));action(r,'3','REFLECT');}
export function hearts(r){oaths(r);action(r,'7','ARM',0);action(r,'8','ARM',1);action(r,'1','HEART',0,r.clock+1300);action(r,'2','HEART',1);}
export function sever(r,part){oaths(r);action(r,'7','VOTE',part);action(r,'8','VOTE',part);action(r,'3','BRACE');action(r,'6','BRACE');action(r,'1','CUT');action(r,'2','CUT');}
export function ward(r,index,healing=true){oaths(r);heal(r,healing);const user=r.challenge.breaths%2?'6':'3';const result=action(r,user,'WARD',index,Math.max(r.clock,r.challenge.breathAt-1500));assert.equal(result.ok,true,JSON.stringify(result));tickBlackwingRoom(r,r.challenge.breathAt);heal(r,healing);}
export function damage(r,healing=true){
 for(let round=0;r.status==='ACTIVE'&&r.step==='DAMAGE'&&round<15;round++)for(const[id]of members){if(r.status!=='ACTIVE'||r.step!=='DAMAGE')break;heal(r,healing);if(blackwingView(r,id).attackRemaining>0)action(r,id,'STRIKE',undefined,r.clock+1200);}
 if(r.status==='ACTIVE'&&r.step==='TRANSITION')tickBlackwingRoom(r,r.challenge.deadline);
 heal(r,healing);
}
export function play(seed,part,healing=true){
 const r=room(seed);debt(r);damage(r,healing);hearts(r);damage(r,healing);sever(r,part);damage(r,healing);
 for(const w of [0,1,0]){if(r.status!=='ACTIVE')return r;ward(r,w,healing);}damage(r,healing);
 if(r.status!=='ACTIVE')return r;debt(r);if(r.status!=='ACTIVE')return r;heal(r,healing);hearts(r);
 for(const w of part==='WING'?[1,2]:[2,1,2]){if(r.status!=='ACTIVE')return r;ward(r,w,healing);}damage(r,healing);return r;
}
