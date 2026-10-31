import {preloadBlackwing,playBlackwingCue} from './presentation.mjs?v=20261031-ios-memory1';
export function createBlackwingBattle(host){
 let engine,renderer,assets,epoch=0,queue=Promise.resolve(),snapshot,lastCue='',scene,pending=0;let bossId='',visible=new Set(),cueHistory=[];
 function sync(){if(!engine||!snapshot)return;engine.syncFinalState({A:snapshot.fighters.filter(f=>!f.isMercenary),mercenaries:{A:snapshot.fighters.filter(f=>f.isMercenary),B:[]},B:[{id:bossId,hp:snapshot.bossHp,maxHp:snapshot.bossMaxHp}]});engine.updateStatus(snapshot.phaseName+' · '+(snapshot.step==='DAMAGE'?'역린 노출':'협동 기믹'));}
 function destroy(){epoch++;scene?.dispose();scene=null;engine?.cancelTimelines();renderer?.destroy();const retired=assets;assets=null;if(retired)void retired.release().catch(error=>console.warn('[Blackwing assets]',error));engine=null;renderer=null;pending=0;queue=Promise.resolve();lastCue='';}
 async function mount(payload){destroy();const version=epoch;await globalThis.ProjectVBattleV3Live.ensureRuntime({effects:true});if(version!==epoch)return;const acquired=await preloadBlackwing();if(version!==epoch){await acquired.release();return;}assets=acquired;const api=globalThis.ProjectVPixiBattle,oldMount=api.mountForBattle,oldReset=api.resetSession;
  api.mountForBattle=async(...args)=>{engine=await oldMount(...args);return engine;};api.resetSession=async(...args)=>{engine=await oldReset(...args);return engine;};
  try{host.id='blackwingBattleMount';const prepared=globalThis.ProjectVBattleV3Live.prepareLoading({modal:host,mode:'RAID',playerName:payload.accountNickname,opponentName:'모르드레인',autoText:'흑익의 맹약 전장 준비'});host.classList.add('bw-battle-mount');const candidate=await globalThis.ProjectVBattleV3Live.createRenderer({...prepared,modal:host,data:payload,mode:'RAID',playUltimateCinematics:false});if(version!==epoch){candidate.destroy();return;}renderer=candidate;host.querySelector('.battle-v3-header strong').textContent='흑익의 맹약';bossId=payload.battleV2.teams.B.cards[0].id;visible=new Set([...payload.battleV2.teams.A.cards,...payload.battleV2.teams.A.mercenaries,...payload.battleV2.teams.A.supports,...payload.battleV2.teams.B.cards].map(f=>f.id));await engine.deployCards({instant:true,force:true});sync();}
  finally{api.mountForBattle=oldMount;api.resetSession=oldReset;}
 }
 function update(state){snapshot=state;if(!engine)return;const cue=state.presentation,show=cue&&cue.id!==lastCue&&state.serverNow-cue.at<6000;if(cue&&cue.id!==lastCue){cueHistory.push({id:cue.id,effect:cue.effect,show,delta:state.serverNow-cue.at});if(cueHistory.length>12)cueHistory.shift();}if(cue)lastCue=cue.id;
  const events=state.events.filter(e=>!e.type.startsWith('BLACKWING_')&&e.type!=='RESULT'&&(!e.actorId||visible.has(e.actorId))).map(e=>({...e,...(e.hits?{hits:e.hits.filter(h=>visible.has(h.targetId))}:{})}));
  if(pending>18){epoch++;scene?.dispose();engine.cancelTimelines();queue=Promise.resolve();pending=0;sync();return;}if(!events.length&&!show){if(!pending)sync();return;}const version=epoch;pending+=events.length+Number(show);
  queue=queue.then(async()=>{if(version!==epoch||!engine)return;if(show){scene?.dispose();scene=playBlackwingCue(engine,cue,assets);try{await scene.playback;}finally{if(version===epoch)pending=Math.max(0,pending-1);}}for(const e of events){if(version!==epoch||!engine)return;try{await engine.playEvents([e]);}finally{if(version===epoch)pending=Math.max(0,pending-1);}}if(version===epoch&&!pending)sync();}).catch(error=>{console.warn('[Blackwing playback]',error);if(version===epoch){pending=0;sync();}});
 }
 function anchors(field){
  const actor=engine?.boss||engine?.enemies?.find(a=>a.battleActive!==false),canvas=host.querySelector('canvas');
  if(!actor?.root||!canvas||!engine.app?.screen)return null;
  const c=canvas.getBoundingClientRect(),f=field.getBoundingClientRect(),h=actor.fullBodyHeight||240;
  const points=Object.fromEntries(Object.entries({wing:{x:-h*.45,y:-h*.85},blade:{x:h*.35,y:-h*.08},core:{x:0,y:-h*.48}}).map(([key,local])=>{
   const p=actor.root.toGlobal(local);return [key,{x:Math.max(65,Math.min(f.width-65,c.left-f.left+p.x*c.width/engine.app.screen.width)),y:Math.max(100,Math.min(f.height-55,c.top-f.top+p.y*c.height/engine.app.screen.height))}];
  }));
  const gap=host.clientWidth<=760?86:106;
  if(Math.abs(points.wing.x-points.blade.x)<gap&&Math.abs(points.wing.y-points.blade.y)<gap){
   points.blade.y=Math.min(f.height-50,points.wing.y+gap);points.wing.y=points.blade.y-gap;
  }
  return points;
 }
 return {mount,update,destroy,anchors,diagnostics:()=>({ready:!!engine,pending,cueHistory,presentation:scene?.diagnostics?.()||null,canvases:host.querySelectorAll('canvas').length,engine:engine?.diagnostics()})};
}
