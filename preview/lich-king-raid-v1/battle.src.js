import { MechanicOverlay } from './MechanicOverlay.js';

// The encounter extends the already loaded live V3 runtime. It does not bundle
// or create another Application, formation, card dock, GSAP clock or renderer.
const sheets={prison:'frost-prison-16.png',zero:'absolute-zero-16.png',soul:'soul-annihilation-16.png'};
let engine=null,renderer=null,prison=null,mechanics=null,epoch=0,queue=Promise.resolve(),pending=0,snapshot=null,syncedHp='',bossId='';
const textures={};
let visibleActors=new Set();
async function loadFrames(key){
  const {Assets,Texture,Rectangle}=window.ProjectVPixiBattle.fxRuntime;
  if(textures[key])return textures[key];
  const sheet=await Assets.load('/preview/lich-king-raid-v1/assets/'+sheets[key]);
  const w=sheet.width/4,h=sheet.height/4;
  textures[key]=Array.from({length:16},(_,i)=>new Texture({source:sheet.source,frame:new Rectangle((i%4)*w,Math.floor(i/4)*h,w,h)}));
  return textures[key];
}
function releasePrison(){if(prison){prison.destroy();prison=null;}}
async function animate(key,{targetId,hold=false,safe=false}={}){
  if(!engine)return;
  const {Sprite}=window.ProjectVPixiBattle.fxRuntime;
  const owner=engine,version=epoch,frames=await loadFrames(key);if(version!==epoch)return;
  const actor=targetId?owner.combatantById(targetId):owner.allies.find(a=>a.battleActive!==false);
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
  await window.ProjectVBattleV3Live.ensureRuntime({effects:true});
  if(version!==epoch)return;
  bossId=payload.battleV2.teams.B.cards[0].id;
  const team=payload.battleV2.teams.A;
  visibleActors=new Set([...team.cards,...(team.mercenaries||[]),...(team.supports||[]),...payload.battleV2.teams.B.cards].map(f=>f.id));
  const api=window.ProjectVPixiBattle,original=api.mountForBattle,originalReset=api.resetSession;
  api.mountForBattle=async(data,host)=>{engine=await original(data,host);return engine;};
  api.resetSession=async(data,host)=>{engine=await originalReset(data,host);return engine;};
  try{
    const prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'RAID',playerName:payload.accountNickname||'정벌 공대',opponentName:'리치왕',autoText:'얼어붙은 왕좌에 진입 중'});
    const candidate=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'RAID',playUltimateCinematics:false});
    if(version!==epoch){candidate.destroy();return;}
    renderer=candidate;
    modal.querySelector('.battle-v3-header strong').textContent='리치왕 정벌';
    modal.querySelector('.battle-v3-header small').textContent='THE FROZEN THRONE';
    await engine.deployCards({instant:true,force:true});
    // The raid overlay provides the phase, HP and input status in this area.
    if(engine.uiLayer?.status)engine.uiLayer.status.visible=false;
    if(engine.uiLayer?.statusPanel)engine.uiLayer.statusPanel.visible=false;
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
  // Remote squads contribute to the shared boss, never as a missing/local
  // actor. Each account retains the canonical five-card V3 formation.
  events=events.filter(e=>!e.actorId||visibleActors.has(e.actorId))
    .map(e=>({...e,...(e.hits?{hits:e.hits.filter(h=>visibleActors.has(h.targetId))}:{}),...(e.targets?{targets:e.targets.filter(t=>visibleActors.has(t.targetId))}:{})}));
  const version=epoch;
  const interesting=events.filter(e=>!e.type.startsWith('RAID_')||['RAID_LICH_PRISON','RAID_LICH_SHATTER','RAID_LICH_BREATH','RAID_LICH_WIPE','RAID_LICH_INTERRUPT'].includes(e.type));
  // Catch up through the canonical server snapshot if a hidden/slow tab falls behind.
  const blocks=interesting.filter(e=>!(e.type==='TURN'&&e.actorKind==='BATTLE_SUIT')).length;
  if(pending>30){restore(state);return;}
  if(!interesting.length){if(!pending)syncHp();return;}
  pending+=blocks;
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
      }finally{if(version===epoch&&!(event.type==='TURN'&&event.actorKind==='BATTLE_SUIT'))pending=Math.max(0,pending-1);}
    }
    if(version===epoch&&!pending)syncHp();
  }).catch(error=>console.warn('[Lich review playback]',error));
}
function syncHp(){
  if(!engine||!snapshot)return;
  const key=JSON.stringify([snapshot.bossHp,snapshot.fighters]);if(key===syncedHp)return;
  engine.syncFinalState({A:snapshot.fighters.filter(f=>!f.isMercenary),mercenaries:{A:snapshot.fighters.filter(f=>f.isMercenary),B:[]},B:[{id:bossId,hp:snapshot.bossHp,maxHp:snapshot.bossMaxHp}]});
  if(snapshot.status==='ACTIVE')engine.startAccountBattleUnitSustainedFire();
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
window.LichBattle={mount,enqueue,restore,teardown,preload:async()=>{await window.ProjectVBattleV3Live.ensureRuntime({effects:true});await Promise.all(Object.keys(sheets).map(loadFrames));},setPending:value=>mechanics?.setPending(value),resize:()=>requestAnimationFrame(()=>{engine?.app?.resize();engine?.resize();mechanics?.layout();}),diagnostics:()=>({ready:Boolean(engine),pending,engine:engine?.diagnostics(),mechanics:mechanics?.diagnostics(),atlases:Object.keys(textures),prison:Boolean(prison),canvasCount:document.querySelectorAll('canvas').length})};
window.addEventListener('pagehide',teardown,{once:true});
