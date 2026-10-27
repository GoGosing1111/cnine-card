import assert from 'node:assert/strict';
import {blackwingView,tickBlackwingRoom} from '../../functions/_raid_blackwing.js';
import {scalePending} from '../../functions/_raid_blackwing_scale.js';
import {room as oldRoom,action,members,heal} from './blackwing-feedback-scenario.mjs';
export {action,members,heal};
export const room=(seed,deck=null)=>oldRoom(seed,3,deck);

// The coordinator combines six player-visible clues, never the server's weights
// or RNG. This also checks that the published rules are sufficient to solve.
export function solveViews(views) {
 const members=views[0].challenge.scale.members,goals=views[0].challenge.scale.goals;
 const weights=Object.fromEntries(views.map(v=>[v.me.id,v.challenge.scale.ownWeight]));
 const solutions=[];
 for(let code=0;code<729;code++){
  let n=code;const positions={},groups=[[],[],[]];
  for(const m of members){const p=n%3;n=Math.floor(n/3);positions[m.id]=p;groups[p].push(m);}
  if(members.some(m=>positions[m.id]===m.previous))continue;
  if(groups.some((g,p)=>g.length!==2||g[0].role===g[1].role||g.reduce((sum,m)=>sum+weights[m.id],0)!==goals[p]))continue;
  solutions.push(positions);
 }
 return solutions;
}
export function scale(r,{planning=12000,gap=500,healing=true,blind=null}={}){
 while(r.status==='ACTIVE'&&scalePending(r)){
  const views=members.map(([id])=>blackwingView(r,id));
  const solutions=solveViews(views);assert.ok(solutions.length,'visible clues must admit a solution');
  const positions=blind?blind(views):solutions[0];
  tickBlackwingRoom(r,r.clock+planning);if(r.status!=='ACTIVE')break;heal(r,healing);
  for(const[id]of members)assert.equal(action(r,id,'PLACE',positions[id]).ok,true);
  for(const[id]of members){if(r.status!=='ACTIVE')break;assert.equal(action(r,id,'LOCK',undefined,r.clock+gap).ok,true);}
 }
 return r.status==='ACTIVE';
}
export function debt(r){action(r,'1','CHARGE');action(r,'2','CHARGE');action(r,'1','CHARGE',undefined,r.clock+1200);action(r,'7','ISOLATE');action(r,'8','ISOLATE');action(r,'6','ANCHOR',undefined,Math.max(r.clock,r.challenge.debt.opensAt));action(r,'3','REFLECT');}
export function hearts(r){action(r,'7','ARM',0);action(r,'8','ARM',1);action(r,'1','HEART',0,r.clock+1300);action(r,'2','HEART',1);}
export function sever(r,part){action(r,'7','VOTE',part);action(r,'8','VOTE',part);action(r,'3','BRACE');action(r,'6','BRACE');action(r,'1','CUT');action(r,'2','CUT');}
export function ward(r,index,options={}){
 if(!scale(r,options))return;heal(r,options.healing!==false);
 const user=r.challenge.breaths%2?'6':'3';assert.equal(action(r,user,'WARD',index,Math.max(r.clock,r.challenge.breathAt-1500)).ok,true);
 tickBlackwingRoom(r,r.challenge.breathAt);heal(r,options.healing!==false);
}
export function damage(r,healing=true){
 for(let round=0;r.status==='ACTIVE'&&r.step==='DAMAGE'&&round<15;round++){
  tickBlackwingRoom(r,r.clock+1800);heal(r,healing);
  for(const[id]of members){if(r.status!=='ACTIVE'||r.step!=='DAMAGE')break;if(blackwingView(r,id).attackRemaining>0)assert.equal(action(r,id,'STRIKE').ok,true);}
 }
 if(r.status==='ACTIVE'&&r.step==='TRANSITION')tickBlackwingRoom(r,r.challenge.deadline);
 heal(r,healing);
}
export function play(seed,part,options={}){
 const r=room(seed,options.deck),healing=options.healing!==false;
 if(!scale(r,options))return r;debt(r);damage(r,healing);
 if(!scale(r,options))return r;hearts(r);damage(r,healing);
 if(!scale(r,options))return r;sever(r,part);damage(r,healing);
 for(const w of [0,1,0]){ward(r,w,options);if(r.status!=='ACTIVE')return r;}damage(r,healing);
 if(!scale(r,options))return r;debt(r);heal(r,healing);hearts(r);
 for(const w of part==='WING'?[1,2]:[2,1,2]){ward(r,w,options);if(r.status!=='ACTIVE')return r;}damage(r,healing);return r;
}
