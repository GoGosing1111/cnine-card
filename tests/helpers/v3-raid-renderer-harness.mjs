import vm from 'node:vm';
import {readFileSync} from 'node:fs';
export function v3Harness(){
 const calls=[],labels=new Set();
 const stage={classList:{add:(...v)=>v.forEach(x=>labels.add(x)),remove:(...v)=>v.forEach(x=>labels.delete(x)),contains:v=>labels.has(v)},querySelector:()=>null,querySelectorAll:()=>[]};
 const canvas={width:1600,height:820,getContext:()=>({isContextLost:()=>false})};
 const context={console:{warn:()=>{},error:()=>{}},setTimeout,clearTimeout,requestAnimationFrame:callback=>{callback(0);return 1;},document:{querySelectorAll:()=>[]},ProjectVPixiBattle:{
  mount:async()=>{},setBattlePayload:async()=>{},setBattlefield:async()=>{},setVisible:async()=>{},destroy:()=>{},
  playEvents:async(events,options={})=>{for(const e of events){const event=options.beforeEvent?await options.beforeEvent(e):e;if(event)calls.push(event.type);}},
 }};
 context.window=context;vm.runInNewContext(readFileSync(new URL('../../js/battle-v3-live.js',import.meta.url),'utf8'),context);
 return {calls,stage,create:options=>context.ProjectVBattleV3Live.createRenderer({stage,host:{querySelector:()=>canvas,querySelectorAll:()=>[]},modal:{classList:{remove:()=>{}}},mode:'RAID',...options})};
}
