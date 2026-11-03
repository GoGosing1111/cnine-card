import {createBattleHud} from '../../js/battle-v3-hud.mjs';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
export function v3Harness(){
 const bundle=readFileSync(new URL('../../preview/project-v-v3/project-v-pixi-battle.bundle.js',import.meta.url),'utf8');
 const calls=[],labels=new Set();
 const stage={classList:{add:(...v)=>v.forEach(x=>labels.add(x)),remove:(...v)=>v.forEach(x=>labels.delete(x)),contains:v=>labels.has(v)},querySelector:()=>null,querySelectorAll:()=>[]};
 const canvas={width:1600,height:820,getContext:()=>({isContextLost:()=>false})};
 const context={__testCreateBattleHud:createBattleHud,console:{warn:()=>{},error:()=>{}},setTimeout,clearTimeout,requestAnimationFrame:callback=>{callback(0);return 1;},document:{querySelectorAll:()=>[]},ProjectVPixiBattle:{
  runtimeVersion:bundle.match(/runtimeVersion:\s*["']([^"']+)["']/)[1],mount:async()=>{},setBattlePayload:async()=>{},setBattlefield:async()=>{},setVisible:async()=>{},destroy:()=>{},
  playEvents:async(events,options={})=>{for(const e of events){const event=options.beforeEvent?await options.beforeEvent(e):e;if(event)calls.push(event.type);}},
 }};
 context.window=context;vm.runInNewContext(readFileSync(new URL('../../js/battle-v3-live.js',import.meta.url),'utf8').replace("await import('/js/battle-v3-hud.mjs?v=20261102-v1')",'({createBattleHud:globalThis.__testCreateBattleHud})'),context);
 return {calls,stage,create:options=>context.ProjectVBattleV3Live.createRenderer({stage,host:{querySelector:()=>canvas,querySelectorAll:()=>[]},modal:{classList:{remove:()=>{}}},mode:'RAID',...options})};
}
