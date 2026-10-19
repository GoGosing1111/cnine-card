import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {BATHORY_COMBAT} from '../../../shared/mercenary-bathory-v1.mjs';
import {BathoryFX,loadBathoryAssets,BATHORY_RESOURCE_ROOT as ROOT} from './BathoryFX.js';
import {MODES} from '../motion.mjs';
const doc=parent.document,$=id=>doc.getElementById(id)||document.getElementById(id),get=async p=>{const r=await fetch(p);if(!r.ok)throw Error('리소스 누락: '+p);return r.json();};
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
let engine,renderer,merc,fx,disposed=false;const queue={active:false,index:0,modes:['idle','dash','attack','skill','hit','defeat']};
function update(f){$('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('seek').max=MODES[f.mode].duration;$('seek').value=f.time;$('time').textContent=f.time.toFixed(2)+' / '+MODES[f.mode].duration.toFixed(2)+' s';$('mode').value=f.mode;$('health').textContent=JSON.stringify(f.diagnostics(),null,2);}
function stopQueue(){queue.active=false;$('showcase').textContent='전체 시연';}
function next(){if(!queue.active)return;fx.setMode(queue.modes[queue.index]);fx.play();$('showcase').textContent='시연 중 '+(queue.index+1)+' / '+queue.modes.length;}
function resize(){if(!fx||disposed)return;const playing=fx.playing,t=fx.time;fx.pause();engine.setFormationMercenaries([merc]);fx.captureFormation();fx.render(t);if(playing)fx.play();}
function dispose(){if(disposed)return;disposed=true;stopQueue();engine?.app.renderer.off('resize',resize);fx?.destroy();merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity}))),deck=IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);return{...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'바토리',opponentName:'전투 리소스 시연',autoText:'전장 준비 중'});
  try{renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'바토리'});}finally{api.mountForBattle=mountForBattle;}
  await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();if(engine.uiLayer?.statusPanel)engine.uiLayer.statusPanel.visible=false;if(engine.uiLayer?.status)engine.uiLayer.status.visible=false;
  const notice=document.querySelector('.battle-v3-status');if(notice)notice.style.display='none';
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]}),art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);
  const [sd,assets]=await Promise.all([Assets.load(art.spriteUrl),loadBathoryAssets(manifest)]);
  merc=new BattleCharacter({id:'BATHORY_RESOURCE_PREVIEW',name:'바토리',team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:null,fullBodyHeight:333,accent:0xe94d70});merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);
  engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.visible=true;merc.root.alpha=1;
  merc.art={bodyHeight:333};merc.cardId=manifest.code;merc.isMercenary=true;
  fx=new BathoryFX(engine,merc,engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY),assets,manifest,update);engine.setFormationMercenaries([merc]);fx.captureFormation();
  engine.host.closest('.battle-v3-live-shell').querySelector('.battle-v3-header strong').textContent='바토리 · SS HALLOWEEN LIMITED';
  fx.onComplete=()=>{if(queue.active&&++queue.index<queue.modes.length)next();else{stopQueue();if(fx.mode!=='idle'){fx.setMode('idle');fx.play();}}};
  const repeat=()=>{if(queue.active&&fx.mode==='idle'){queue.index++;next();}};
  const originalMake=fx.makeTimeline.bind(fx);fx.makeTimeline=()=>{originalMake();fx.timeline.eventCallback('onRepeat',repeat);};fx.timeline.eventCallback('onRepeat',repeat);
  $('showcase').onclick=()=>{queue.active=true;queue.index=0;next();};$('play').onclick=()=>{stopQueue();fx.playing?fx.pause():fx.play();};$('restart').onclick=()=>{stopQueue();fx.seek(0);fx.play();};$('cancel').onclick=()=>{stopQueue();fx.setMode('idle');fx.cancel();};
  $('mode').onchange=()=>{stopQueue();fx.setMode($('mode').value);fx.play();};$('seek').oninput=()=>{stopQueue();fx.seek(Number($('seek').value));};$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));$('effects').onchange=()=>fx.setEffects($('effects').checked);
  $('contact').onclick=()=>{stopQueue();fx.seek(MODES[fx.mode].contacts.find(t=>t>fx.time+.005)??MODES[fx.mode].contacts[0]??0);};
  for(const c of doc.querySelectorAll('button,select,input'))c.disabled=false;
  $('status').textContent='기본 전투력 '+BATHORY_COMBAT.basePower.toLocaleString('ko-KR')+' · 서버 한정 10장 · 승인 대기';
  const review={engine,merc,fx,manifest,queue,dispose,diagnostics:()=>fx.diagnostics()};window.BathoryPreview=review;parent.BathoryPreview=review;
  engine.app.renderer.on('resize',resize);window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopQueue();fx.cancel();}});
  if(!engine.reducedMotion){queue.active=true;queue.index=0;next();}
 }catch(error){$('status').textContent='준비 실패: '+error.message;console.error('[Bathory]',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
