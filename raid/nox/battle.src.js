import {Assets,Sprite,Texture,Rectangle} from 'pixi.js';
import {mountForBattle,resetSession,setVisible} from '../../preview/project-v-v3/source/project-v-pixi-battle.src.js';
import {NoxFloor} from './floor.mjs';
let engine=null,renderer=null,epoch=0,pending=0,queue=Promise.resolve(),snapshot=null,bossId='',lastStage='',seen=0;
const poses={},fx={},effects=new Set();
let floor=null;
const base='/assets/ui/raid-nox-v1/';
async function load(){
  await Promise.all(['idle','anticipation','strike','memory','coop','defeat'].map(async key=>poses[key]??=await Assets.load(base+'boss-'+key+'.webp')));
  await Promise.all(['rhythm','memory','coop'].map(async key=>{if(fx[key])return;const t=await Assets.load(base+'fx-'+key+'.webp');fx[key]=Array.from({length:16},(_,i)=>new Texture({source:t.source,frame:new Rectangle(i%4*t.width/4,Math.floor(i/4)*t.height/4,t.width/4,t.height/4)}));}));
}
function pose(key){const actor=engine?.combatantById(bossId);if(actor&&poses[key])actor.useFullBodySprite(poses[key],actor.fullBodyHeight);}
async function effect(kind,safe=false,position=null){
  const owner=engine,version=epoch;if(!owner||!fx[kind])return;const boss=owner.combatantById(bossId),allies=owner.allies.filter(a=>a.battleActive!==false);if(!boss||!allies.length)return;
  const center={x:allies.reduce((n,a)=>n+a.baseX,0)/allies.length,y:allies.reduce((n,a)=>n+a.baseY,0)/allies.length};
  const sprite=new Sprite(fx[kind][0]);sprite.anchor.set(.5,.83);sprite.position.set(position?.x??(kind==='coop'?boss.baseX:center.x),position?.y??(kind==='coop'?boss.baseY:center.y+10));sprite.width=kind==='memory'?500:640;sprite.height=sprite.width;sprite.alpha=safe?.7:.95;owner.effectLayer.addChild(sprite);effects.add(sprite);
  const p={frame:0};pose('anticipation');
  await owner.timeline(tl=>{tl.call(()=>pose(kind==='rhythm'?'strike':kind),[],.2);tl.to(p,{frame:15,duration:1.15,ease:'none',onUpdate:()=>{if(!sprite.destroyed)sprite.texture=fx[kind][Math.min(15,Math.floor(p.frame))];}},0);tl.to(sprite,{alpha:0,duration:.2},1);if(!safe)owner.camera.addShake(tl,{intensity:.25,duration:.16,at:.55});},()=>{if(!sprite.destroyed)sprite.destroy();effects.delete(sprite);if(version===epoch)pose('idle');},1);
}
export async function mount(payload){
  teardown();const version=epoch;bossId=payload.battleV2.teams.B.cards[0].id;window.cnineCardCatalog=()=>payload.cards;
  const api=window.ProjectVPixiBattle,original=api.mountForBattle,originalReset=api.resetSession;
  api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};api.resetSession=async(data,host)=>{engine=await resetSession(data,host);return engine;};
  try{const modal=document.getElementById('battleMount'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'RAID',playerName:'주파수 공대',opponentName:'적관의 지휘자 녹스',autoText:'전장 진입 중'});renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'RAID',playUltimateCinematics:false});if(version!==epoch)return;modal.querySelector('.battle-v3-header strong').textContent='종언의 주파수';modal.querySelector('.battle-v3-header small').textContent='적관의 지휘자 녹스';modal.querySelector('.battle-v3-header>b').textContent='공대전';await Promise.all([engine.deployCards({instant:true,force:true}),load()]);pose('idle');}finally{api.mountForBattle=original;api.resetSession=originalReset;}
}
function syncPartyStatus(){if(!engine||!snapshot)return;const text=`공대 생존 ${snapshot.members.filter(m=>m.hp>0&&!m.left).length}/${snapshot.size} · ${snapshot.round}회차`;if(document.getElementById('pvBattleStatus')?.textContent!==text)engine.updateStatus(text);}
function sync(){if(!engine||!snapshot)return;engine.syncFinalState({A:snapshot.fighters,B:[{id:bossId,hp:snapshot.bossHp,maxHp:snapshot.bossMaxHp}]});syncPartyStatus();}
function update(state,events=[]){
  if(!engine)return;snapshot=state;if(state.stage==='MEMORY')floor??=new NoxFloor(engine,state.challenge.tiles.length);floor?.update(state);
  if(state.challenge?.id!==lastStage){lastStage=state.challenge?.id;epoch++;engine.cancelTimelines();for(const s of effects){if(!s.destroyed)s.destroy();}effects.clear();pending=0;queue=Promise.resolve();sync();const kind={RHYTHM:'rhythm',MEMORY:'memory',COOP:'coop'}[state.stage];if(kind)void effect(kind,true);}
  const version=epoch,relevant=events.filter(e=>e.seq>seen&&!e.type.startsWith('NOX_')&&e.type!=='RESULT');seen=Math.max(seen,state.eventSeq);
  for(const e of events)if(e.type==='NOX_DEATH'&&e.memberId===state.me.id&&Number.isInteger(e.tile))void effect('memory',false,floor.tiles[e.tile]?.center);
  if(pending>12){epoch++;engine.cancelTimelines();pending=0;queue=Promise.resolve();sync();return;}
  pending+=relevant.length;queue=queue.then(async()=>{for(const e of relevant){if(version!==epoch||!engine)return;try{await engine.playEvents([e]);}finally{if(version===epoch)pending--;}}if(version===epoch&&!pending)sync();}).catch(()=>{if(version===epoch){pending=0;sync();}});
  // Party truth is immediate; it must not wait behind actor/effect playback.
  syncPartyStatus();
}
function teardown(){epoch++;engine?.cancelTimelines();floor?.destroy();floor=null;for(const s of effects){if(!s.destroyed)s.destroy();}effects.clear();renderer?.destroy();renderer=null;void setVisible(false);engine=null;pending=0;queue=Promise.resolve();snapshot=null;lastStage='';seen=0;}
function finish(state){snapshot=state;floor?.update(state);engine?.cancelTimelines();for(const s of effects){if(!s.destroyed)s.destroy();}effects.clear();sync();if(state.status==='CLEAR')pose('defeat');void setVisible(false);}
window.NoxBattle={mount,update,memoryCue:state=>floor?.update(state),teardown,finish,placeFloorTargets:target=>floor?.placeTargets(target),visible:visible=>setVisible(visible),resize:()=>{engine?.app?.resize();engine?.resize();},diagnostics:()=>({ready:!!engine,pending,effects:effects.size,floor:floor?.diagnostics(),engine:engine?.diagnostics(),canvases:document.querySelectorAll('canvas').length})};
