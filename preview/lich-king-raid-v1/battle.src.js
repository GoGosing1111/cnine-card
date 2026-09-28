import { Assets, Sprite, Texture, Rectangle } from 'pixi.js';
import { MechanicOverlay } from './MechanicOverlay.js';

// The encounter extends the already loaded live V3 runtime. It does not bundle
// or create another Application, formation, card dock, GSAP clock or renderer.
const sheets={prison:'frost-prison-16.png',zero:'absolute-zero-16.png',soul:'soul-annihilation-16.png'};
let engine=null,renderer=null,prison=null,mechanics=null,epoch=0,queue=Promise.resolve(),pending=0,snapshot=null,syncedHp='',bossId='';
const textures={};
async function loadFrames(key){
  if(textures[key])return textures[key];
  const sheet=await Assets.load('/preview/lich-king-raid-v1/assets/'+sheets[key]);
  const w=sheet.width/4,h=sheet.height/4;
  textures[key]=Array.from({length:16},(_,i)=>new Texture({source:sheet.source,frame:new Rectangle((i%4)*w,Math.floor(i/4)*h,w,h)}));
  return textures[key];
}
function releasePrison(){if(prison){prison.destroy();prison=null;}}
async function animate(key,{targetId,hold=false,safe=false}={}){
  if(!engine)return;
  const owner=engine,version=epoch,frames=await loadFrames(key);if(version!==epoch)return;
  const actor=owner.combatantById(targetId)||owner.allies.find(a=>a.battleActive!==false);
  if(!actor)return;
  const live=owner.allies.filter(a=>a.battleActive!==false);
  const center={x:live.reduce((n,a)=>n+a.baseX,0)/Math.max(1,live.length),y:live.reduce((n,a)=>n+a.baseY,0)/Math.max(1,live.length)};
  const effect=new Sprite(frames[0]);effect.anchor.set(.5,.86);
  effect.position.set(key==='prison'?actor.baseX:center.x,key==='prison'?actor.baseY+12:center.y+30);
  const size=key==='prison'?250:key==='zero'?760:620;effect.width=size;effect.height=size;
  effect.alpha=safe?.55:.9;owner.effectLayer.addChild(effect);
  const progress={frame:0};
  await owner.timeline(tl=>{
    tl.to(progress,{frame:hold?8:15,duration:hold?.65:1.25,ease:'none',onUpdate:()=>{if(!effect.destroyed)effect.texture=frames[Math.min(15,Math.floor(progress.frame))];}},0);
    if(!hold)tl.to(effect,{alpha:0,duration:.22},1.13);
    if(!hold&&!safe)owner.camera.addShake(tl,{intensity:.5,duration:.2,at:key==='zero'?.75:.65});
  },()=>{if(hold&&version===epoch){releasePrison();prison=effect;}else if(!effect.destroyed)effect.destroy();},1);
}
async function mount(payload,modal=document.getElementById('battleMount')){
  teardown();const version=epoch;
  await window.ProjectVBattleV3Live.ensureRuntime();
  if(version!==epoch)return;
  bossId=payload.battleV2.teams.B.cards[0].id;
  const api=window.ProjectVPixiBattle,original=api.mountForBattle,originalReset=api.resetSession;
  api.mountForBattle=async(data,host)=>{engine=await original(data,host);return engine;};
  api.resetSession=async(data,host)=>{engine=await originalReset(data,host);return engine;};
  try{
    const prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'RAID',playerName:'정벌 공대',opponentName:'리치왕',autoText:'얼어붙은 왕좌에 진입 중'});
    const candidate=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'RAID',playUltimateCinematics:false});
    if(version!==epoch){candidate.destroy();return;}
    renderer=candidate;
    modal.querySelector('.battle-v3-header strong').textContent='리치왕 정벌';
    modal.querySelector('.battle-v3-header small').textContent='THE FROZEN THRONE';
    await engine.deployCards({instant:true,force:true});
    await Promise.all(Object.keys(sheets).map(loadFrames));
    if(version!==epoch)return;
    mechanics=new MechanicOverlay(engine,modal.querySelector('.battle-v3-canvas-host'));
  }finally{api.mountForBattle=original;api.resetSession=originalReset;}
}
function enqueue(events,state){
  if(!engine)return;
  snapshot=state;
  // Mechanic deadlines are real time. Never leave a new prison/breath waiting
  // behind cosmetic assault hits from the previous server window.
  const boundary=events.findLastIndex(e=>['RAID_LICH_PHASE','RAID_LICH_BREATH','RAID_LICH_WIPE'].includes(e.type));
  if(boundary>=0){restore(state,false);events=events.slice(boundary);}
  mechanics?.update(state,events);
  const version=epoch;
  const interesting=events.filter(e=>!e.type.startsWith('RAID_')||['RAID_LICH_PRISON','RAID_LICH_SHATTER','RAID_LICH_BREATH','RAID_LICH_WIPE','RAID_LICH_INTERRUPT'].includes(e.type));
  // Catch up through the canonical server snapshot if a hidden/slow tab falls behind.
  if(pending>30){restore(state);return;}
  if(!interesting.length){if(!pending)syncHp();return;}
  pending+=interesting.length;
  queue=queue.then(async()=>{
    for(const event of interesting){
      if(version!==epoch||!engine)return;
      try{
        if(event.type==='RAID_LICH_PRISON')await animate('prison',{targetId:event.targetId,hold:true});
        else if(event.type==='RAID_LICH_SHATTER'){releasePrison();await animate('prison',{targetId:event.targetId});}
        else if(event.type==='RAID_LICH_BREATH'){releasePrison();await animate('zero',{safe:event.safe});}
        else if(event.type==='RAID_LICH_WIPE'){releasePrison();await animate('soul');}
        else if(event.type==='RAID_LICH_INTERRUPT')await animate('soul',{safe:true});
        else if(event.type!=='RESULT')await engine.playEvents([event]);
      }finally{if(version===epoch)pending=Math.max(0,pending-1);}
    }
    if(version===epoch&&!pending)syncHp();
  }).catch(error=>console.warn('[Lich review playback]',error));
}
function syncHp(){
  if(!engine||!snapshot)return;
  const key=JSON.stringify([snapshot.bossHp,snapshot.fighters]);if(key===syncedHp)return;
  engine.syncFinalState({A:snapshot.fighters,B:[{id:bossId,hp:snapshot.bossHp,maxHp:snapshot.bossMaxHp}]});
  engine.updateStatus('리치왕 정벌 · 공대 생존 '+snapshot.fighters.filter(f=>f.hp>0).length);
  syncedHp=key;
}
function restore(state,restorePrison=true){
  epoch++;engine?.cancelTimelines();releasePrison();pending=0;queue=Promise.resolve();snapshot=state;syncedHp='';syncHp();
  mechanics?.update(state);
  if(restorePrison&&engine&&state.status==='ACTIVE'&&state.challenge?.prison)queue=animate('prison',{targetId:state.challenge.targetId,hold:true});
}
function teardown(){
  epoch++;engine?.cancelTimelines();mechanics?.destroy();mechanics=null;releasePrison();renderer?.destroy();renderer=null;
  // Keep the live Application/canvas cache; the next mount uses canonical
  // resetSession just like production V3, without dangling character tweens.
  engine=null;pending=0;queue=Promise.resolve();snapshot=null;syncedHp='';
}
window.LichBattle={mount,enqueue,restore,teardown,resize:()=>requestAnimationFrame(()=>{engine?.app?.resize();engine?.resize();mechanics?.layout();}),diagnostics:()=>({ready:Boolean(engine),pending,engine:engine?.diagnostics(),mechanics:mechanics?.diagnostics(),atlases:Object.keys(textures),prison:Boolean(prison),canvasCount:document.querySelectorAll('canvas').length})};
window.addEventListener('pagehide',teardown,{once:true});
