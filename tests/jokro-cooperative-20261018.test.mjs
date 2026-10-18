import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createCooperativeBattle} from '../functions/_cooperative_battle.js';
import {coopSquads,fixture} from './helpers/cooperative-fixture.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';

test('the cooperative server owns each Jokro cast and its distinct living-target damage receipts',()=>{
 const squads=coopSquads({mercenaries:['V-055','V-049','V-046']});
 squads[0].mercenary={...limitedDeploymentSnapshot('V-979'),combat:fixture.combat};
 const {payload}=createCooperativeBattle({squads,difficulty:'HARD',seed:7919});
 const timeline=payload.battleV2.result.timeline,areas=timeline.filter(e=>e.type==='MERCENARY_JOKRO_AREA');
 assert(areas.length>1);assert.equal(areas[0].hits.length,3);
 for(const event of areas){
  const cast=timeline.filter(e=>e.combatGroup===event.combatGroup&&e.actorId===event.actorId);
  assert.equal(cast.filter(e=>e.type==='MERCENARY_WINDUP').length,1);assert.equal(cast.filter(e=>e.type==='MERCENARY_END').length,1);
  assert.equal(new Set(event.hits.map(h=>h.targetId)).size,event.hits.length);assert.equal(event.battleMode,'PVE');
  assert(event.hits.every(h=>Number.isSafeInteger(h.damage)&&h.damage>=0));
 }
});

test('the real cooperative queue prioritizes Jokro area over queued basics without reviving the retired lane',async t=>{
 const saved=Object.fromEntries(['window','document','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,globalThis[k]]));
 let controller;
 t.after(()=>{controller?.destroy();for(const [key,value]of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 let callback,now=1000;const calls=[],pending=new Map();
 globalThis.document={hidden:false};globalThis.requestAnimationFrame=fn=>(callback=fn,1);globalThis.cancelAnimationFrame=()=>{};
 const api={restoreDeployedFormation:async()=>{},cancelActiveAnimations(){},syncFinalState(){},diagnostics:()=>({}),
  playEvents(events){const group=events[0].combatGroup;calls.push(group);return new Promise(resolve=>pending.set(group,resolve));}};
 globalThis.window={ProjectVPixiBattle:api,ProjectVBattleV3Live:{ensureRuntime:async()=>{},prepareLoading:()=>({stage:{querySelector:()=>({})}}),createRenderer:async()=>({destroy(){}})}};
 const source=fs.readFileSync('raid/cooperative/battle.mjs','utf8').replace("'/shared/server-clock-v1.mjs?v=20261015-v1'",JSON.stringify(pathToFileURL(path.resolve('shared/server-clock-v1.mjs')).href));
 const {mountCoopBattle}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const event=(group,at,type='TURN')=>({type,actorId:'A:OWNER:1:MERCENARY:V-979',combatGroup:group,combatAtMs:at});
 const payload={monster:{name:'격리 검수'},battleV2:{result:{timeline:[event(1,0),event(2,340),event(3,680,'MERCENARY_JOKRO_AREA'),event(4,1020),event(5,5000,'MERCENARY_JOKRO_AREA')]}}};
 controller=await mountCoopBattle({classList:{add(){}}},payload,{clock:{now:()=>now,diagnostics:()=>({})}});
 controller.update({state:{status:'ACTIVE',startsAt:1000}});
 const flush=async at=>{now=at;callback();for(let i=0;i<8;i++)await Promise.resolve();};
 await flush(1000);await flush(1340);assert.deepEqual(calls,[1]);
 await flush(1680);assert.deepEqual(calls,[1,3],'area starts immediately while old basic is still awaiting completion');
 pending.get(1)(false);await flush(1680);assert.deepEqual(calls,[1,3],'retired basic lane cannot replay its queued basic');
 await flush(2020);pending.get(3)(true);await flush(2020);assert.deepEqual(calls,[1,3,4]);
 await flush(7500);assert.deepEqual(calls,[1,3,4],'late snapshots skip stale skills instead of replaying old damage');
 controller.destroy();pending.get(4)(false);await Promise.resolve();assert.deepEqual(calls,[1,3,4]);
});

test('the dedicated green dialogue frame preserves source pixels and ships in the actual V3 consumers',()=>{
 const dir='assets/ui/project-v/mercenaries/jokro-dialogue-20261018/',m=JSON.parse(fs.readFileSync(dir+'manifest.json'));
 for(const a of [m.source,m.runtime])assert.equal(createHash('sha256').update(fs.readFileSync(dir+a.path)).digest('hex'),a.sha256);
 assert.equal(m.runtime.alpha,true);
 const wrapper=fs.readFileSync('js/battle-v3-live.js','utf8').match(/const BATTLE_RUNTIME = '([^']+)'/)[1];
 const source=fs.readFileSync('preview/project-v-v3/source/project-v-pixi-battle.src.js','utf8');assert(source.includes("runtimeVersion:'"+wrapper+"'"));
 const report=JSON.parse(fs.readFileSync('preview/project-v-v3/grid-build-report.json'));
 for(const row of report.outputs){const bundle=fs.readFileSync(row.file,'utf8');assert(bundle.includes('/'+dir+'frame.webp'),row.file);assert(bundle.includes('MERCENARY_JOKRO_AREA'),row.file);}
 assert(fs.readFileSync('raid/cooperative/live.mjs','utf8').includes('battle.mjs?v=20261018-jokro-coop-v1-normal-view-v1'));
});
