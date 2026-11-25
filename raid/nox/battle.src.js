import {Sprite} from 'pixi.js';
import '../../preview/project-v-v3/source/project-v-pixi-battle.src.js';
import '../../js/battle-v3-live.js';
import {NoxFloor} from './floor.mjs';
import {NoxBattleArt} from './assets.mjs';
let engine=null,renderer=null,epoch=0,pending=0,queue=Promise.resolve(),snapshot=null,bossId='',lastStage='',seen=0;
const art=new NoxBattleArt(),poses=art.poses,fx=art.fx,effects=new Set();
let floor=null,viewportObserver=null,finished=false;
function pose(key){const actor=engine?.combatantById(bossId);if(actor&&poses[key])actor.useFullBodySprite(poses[key],actor.fullBodyHeight);}
function resize(){
  const e=engine;if(!e?.app||!e.host?.isConnected)return false;
  const w=e.host.clientWidth,h=e.host.clientHeight;
  // The prepared battlefield is hidden while the party waits. Never derive
  // camera/floor coordinates from that zero-size surface.
  if(w<2||h<2)return false;
  const app=e.app,resolution=app.renderer.resolution;
  if(app.screen.width!==w||app.screen.height!==h||app.canvas.width!==Math.round(w*resolution)||app.canvas.height!==Math.round(h*resolution))app.renderer.resize(w,h);
  e.resize();if(floor)floor.layoutDirty=true;return true;
}
function reveal(){
  if(finished||document.hidden||!resize())return;
  // Mechanics use a persistent live renderer, not V3's completed-replay state.
  // Reconnect the ticker and commit a frame before exposing the timed floor.
  engine.root.visible=true;engine.root.renderable=true;engine.root.alpha=1;
  void engine.setVisible(true);engine.app.render();
}
async function effect(kind,safe=false,position=null){
  const owner=engine,version=epoch;if(!owner||!fx[kind])return;const boss=owner.combatantById(bossId),allies=owner.allies.filter(a=>a.battleActive!==false);if(!boss||!allies.length)return;
  const center={x:allies.reduce((n,a)=>n+a.baseX,0)/allies.length,y:allies.reduce((n,a)=>n+a.baseY,0)/allies.length};
  const sprite=new Sprite(fx[kind][0]);sprite.anchor.set(.5,.83);sprite.position.set(position?.x??(kind==='coop'?boss.baseX:center.x),position?.y??(kind==='coop'?boss.baseY:center.y+10));sprite.width=kind==='memory'?500:640;sprite.height=sprite.width;sprite.alpha=safe?.7:.95;owner.effectLayer.addChild(sprite);effects.add(sprite);
  const p={frame:0};pose('anticipation');
  await owner.timeline(tl=>{tl.call(()=>pose(kind==='rhythm'?'strike':kind),[],.2);tl.to(p,{frame:15,duration:1.15,ease:'none',onUpdate:()=>{if(!sprite.destroyed)sprite.texture=fx[kind][Math.min(15,Math.floor(p.frame))];}},0);tl.to(sprite,{alpha:0,duration:.2},1);if(!safe)owner.camera.addShake(tl,{intensity:.25,duration:.16,at:.55});},()=>{if(!sprite.destroyed)sprite.destroy();effects.delete(sprite);if(version===epoch)pose('idle');},1);
}
export async function mount(payload){
  teardown();const version=epoch;bossId=payload.battleV2.teams.B.cards[0].id;window.cnineCardCatalog=()=>payload.cards;
  const modal=document.getElementById('battleMount');
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'RAID',playerName:'주파수 공대',opponentName:'적관의 지휘자 녹스',autoText:'전장 진입 중'});
  const nextRenderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'RAID',playUltimateCinematics:false});
  if(version!==epoch){nextRenderer.destroy();return;}
  renderer=nextRenderer;
  // createRenderer has already mounted this raid in the shared V3 engine.
  const mountedEngine=await window.ProjectVPixiBattle.mount();
  if(version!==epoch)return;
  engine=mountedEngine;
  modal.querySelector('.battle-v3-header strong').textContent='종언의 주파수';
  modal.querySelector('.battle-v3-header small').textContent='적관의 지휘자 녹스';
  modal.querySelector('.battle-v3-header>b').textContent='공대전';
  await Promise.all([engine.deployCards({instant:true,force:true}),art.load()]);
  if(version!==epoch||!engine)return;
  pose('idle');engine.app.resizeTo=null;
  viewportObserver=new ResizeObserver(resize);viewportObserver.observe(engine.host);
}
function syncPartyStatus(){if(!engine||!snapshot)return;const text=`공대 생존 ${snapshot.members.filter(m=>m.hp>0&&!m.left).length}/${snapshot.size} · ${snapshot.round}회차`;if(document.getElementById('pvBattleStatus')?.textContent!==text)engine.updateStatus(text);}
function syncHp(id,hp,maxHp){
  const actor=engine.combatantById(id);
  if(!actor)return;
  const percent=Math.min(100,Math.max(0,hp)/Math.max(1,maxHp)*100);
  actor.serverMaxHp=maxHp;
  if(actor.isMercenary)actor.enabled=hp>0;
  // Polls and phase changes repeat the same HP. An idle/dead reset on each
  // snapshot would restart the death animation while this player spectates.
  if(actor.hp!==percent||(actor.state==='DEAD')!==(hp<=0))engine.syncTargetHp(actor,percent);
}
function syncHealth(){
  for(const fighter of snapshot.fighters)syncHp(fighter.id,fighter.hp,fighter.maxHp);
  syncHp(bossId,snapshot.bossHp,snapshot.bossMaxHp);
}
function cancelPlayback(){
  epoch++;pending=0;queue=Promise.resolve();engine?.cancelTimelines();
  for(const sprite of effects)if(!sprite.destroyed)sprite.destroy();
  effects.clear();
}
function update(state,events=[]){
  if(!engine||finished||state.status!=='ACTIVE')return;
  snapshot=state;
  const changed=state.challenge?.id!==lastStage;
  if(changed){lastStage=state.challenge?.id;cancelPlayback();syncHealth();reveal();}
  if(state.stage==='MEMORY')floor??=new NoxFloor(engine,state.challenge.tiles.length);floor?.update(state);
  if(changed){engine.app.render();const kind={RHYTHM:'rhythm',MEMORY:'memory',COOP:'coop'}[state.stage];if(kind)void effect(kind,true);}
  const fresh=events.filter(e=>e.seq>seen);seen=Math.max(seen,state.eventSeq);
  for(const e of fresh)if(state.stage==='MEMORY'&&e.type==='NOX_DEATH'&&e.memberId===state.me.id&&Number.isInteger(e.tile))void effect('memory',false,floor.tiles[e.tile]?.center);
  syncPartyStatus();
  if(pending>12){cancelPlayback();syncHealth();return;}
  const relevant=fresh.filter(e=>!e.type.startsWith('NOX_')&&e.type!=='RESULT');
  if(!relevant.length){if(!pending&&!changed)syncHealth();return;}
  const version=epoch;
  pending+=relevant.length;
  queue=queue.then(async()=>{
    for(const e of relevant){
      if(version!==epoch||!engine)return;
      try{await engine.playEvents([e]);}finally{if(version===epoch)pending--;}
    }
    if(version===epoch&&!pending)syncHealth();
  }).catch(()=>{if(version===epoch){cancelPlayback();syncHealth();}});
}
function teardown(){cancelPlayback();viewportObserver?.disconnect();viewportObserver=null;floor?.destroy();floor=null;art.clear();renderer?.destroy();renderer=null;void window.ProjectVPixiBattle?.setVisible(false);engine=null;snapshot=null;lastStage='';seen=0;finished=false;}
function finish(state){
  if(!engine||finished)return;
  finished=true;snapshot=state;cancelPlayback();floor?.update(state);syncHealth();syncPartyStatus();
  if(state.status==='CLEAR')pose('defeat');
  engine.completePlayback();
}
window.NoxBattle={mount,update,memoryCue:state=>floor?.update(state),teardown,finish,placeFloorTargets:target=>floor?.placeTargets(target),visible:visible=>visible?reveal():window.ProjectVPixiBattle.setVisible(false),resize,diagnostics:()=>({ready:!!engine,art:art.diagnostics(),pending,effects:effects.size,viewportObserved:!!viewportObserver,scene:engine?{width:engine.app.screen.width,height:engine.app.screen.height,scale:engine.root.scale.x,ticking:engine.app.ticker.started,contextLost:engine.app.renderer.gl?.isContextLost()??false}:null,floor:floor?.diagnostics(),engine:engine?.diagnostics(),canvases:document.querySelectorAll('canvas').length})};
