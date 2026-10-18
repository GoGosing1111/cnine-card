import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {MODES} from '../motion.mjs';
import {LeonelFX,loadLeonelAssets} from './LeonelFX.js';
import {LeonelDialogue} from './LeonelDialogue.js';
import {attachReviewTools} from './ReviewTools.js';
const ROOT='/preview/mercenary-leonel-sss-limited-20261018-v1/',doc=parent.document,$=id=>doc.getElementById(id)||document.getElementById(id);
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error('리소스 누락: '+path);return r.json();};
let engine,renderer,merc,fx,dialogue,disposed=false,lastMode;const queue={active:false,index:0,modes:['idle','attack','dash','skill','ultimate']};
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('time').textContent=f.time.toFixed(2)+' / '+MODES[f.mode].duration.toFixed(2)+' s';$('seek').max=MODES[f.mode].duration;$('seek').value=f.time;$('frame').textContent=String(f.state.frame+1).padStart(2,'0')+' / '+MODES[f.mode].poses.length;
 $('health').textContent=JSON.stringify(f.diagnostics(),null,2);
 for(const b of doc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.mode));
 if(lastMode!==f.mode||f.state.done){dialogue?.set(f.mode,f.state.done);lastMode=f.mode;}
}
function gallery(mode){$('frames').innerHTML=MODES[mode].poses.map((p,i)=>{const name=p.bank+'-'+String(p.index+1).padStart(2,'0');return'<div class="frame-item"><button class="frame-card" data-frame="'+i+'"><img loading="lazy" src="assets/thumbs/'+name+'.png" alt="'+(i+1)+'번 동작"><span>'+p.at.toFixed(2)+'s</span></button><a href="assets/frames/'+name+'.png" target="_blank">원본 100% ↗</a></div>';}).join('');for(const b of doc.querySelectorAll('[data-frame]'))b.onclick=()=>{stopQueue();fx.seek(MODES[mode].steps[Number(b.dataset.frame)]);};}
function stopQueue(){queue.active=false;$('showcase').textContent='전체 시연';}
function queueNext(){if(!queue.active)return;const mode=queue.modes[queue.index];fx.setMode(mode);gallery(mode);dialogue.set(mode);fx.play();$('showcase').textContent='전체 시연 '+(queue.index+1)+' / '+queue.modes.length;}
function resize(){if(disposed||!fx)return;const was=fx.playing,t=fx.time;fx.pause();engine.setFormationMercenaries([merc]);fx.captureFormation();fx.render(t);if(was)fx.play();}
function dispose(){if(disposed)return;disposed=true;queue.active=false;engine?.app.renderer.off('resize',resize);dialogue?.destroy();fx?.destroy();merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  localStorage.setItem('cnine_battle_sound','OFF');
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=IDS.map((id,i)=>{const c=available.find(x=>x.cardId===id);if(!c)throw Error('기준 카드 누락');return{...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;
  const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'레오넬',opponentName:'검술 연출 시연',autoText:'전장 준비 중'});
  try{renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'레오넬'});}finally{api.mountForBattle=mountForBattle;}
  await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();
  if(engine.uiLayer?.statusPanel)engine.uiLayer.statusPanel.visible=false;
  if(engine.uiLayer?.status)engine.uiLayer.status.visible=false;
  const statusNotice=document.querySelector('.battle-v3-status');if(statusNotice)statusNotice.style.display='none';
  // V-000 is an in-memory adapter fixture only. No operational identity is assigned.
  const card={...manifest,code:'V-000'};
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[card]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD','V-000');
  const [sd,assets]=await Promise.all([Assets.load(art.spriteUrl),loadLeonelAssets(manifest)]);
  merc=new BattleCharacter({id:'LEONEL_RESOURCE_PREVIEW',name:'레오넬',team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:null,fullBodyHeight:manifest.displaySizing?.fullBodyHeight||333,accent:0xd2c093});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;
  const targets=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY);fx=new LeonelFX(engine,merc,targets,assets,manifest,update);dialogue=new LeonelDialogue(engine,manifest);engine.setFormationMercenaries([merc]);fx.captureFormation();
  engine.host.closest('.battle-v3-live-shell').querySelector('.battle-v3-header strong').textContent='레오넬 · SSS LIMITED';
  fx.onComplete=()=>{dialogue.set(fx.mode,true);if(queue.active){queue.index++;if(queue.index<queue.modes.length)queueNext();else stopQueue();}};
  // Idle is looped on the same clock; showcase leaves after its first full loop.
  fx.timeline.eventCallback('onRepeat',()=>{if(queue.active&&fx.mode==='idle'){queue.index++;queueNext();}});
  $('showcase').onclick=()=>{queue.active=true;queue.index=1;queueNext();};
  $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{stopQueue();fx.seek(0);fx.play();};$('cancel').onclick=()=>{stopQueue();fx.cancel();};$('seek').oninput=()=>{stopQueue();fx.seek(Number($('seek').value));};$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  $('contact').onclick=()=>{stopQueue();const hits=MODES[fx.mode].contacts;fx.seek(hits.find(t=>t>fx.time+.005)??hits[0]??0);};$('zoom').onclick=()=>{fx.zoom=!fx.zoom;$('zoom').setAttribute('aria-pressed',String(fx.zoom));fx.render(fx.time);};
  $('effects').onchange=()=>fx.setEffects($('effects').checked);$('aura').onchange=()=>fx.setAura($('aura').checked);
  for(const b of doc.querySelectorAll('[data-mode]'))b.onclick=()=>{stopQueue();fx.setMode(b.dataset.mode);gallery(fx.mode);dialogue.set(fx.mode);fx.play();};
  for(const b of doc.querySelectorAll('button,select,input'))b.disabled=false;
  $('status').textContent='전용 동작 · 고정 원본 검 · 전장 검압 시연';gallery('idle');fx.seek(0);
  $('source-art').href='/'+manifest.sourceArt.replace(/^\//,'');$('locked-sword').href=ROOT+(manifest.weapon?.url||'assets/locked/leonel-sword.png');
  $('battle-original').href='/'+manifest.battleSprite.replace(/^\//,'');
  const review={fx,engine,merc,manifest,queue,dialogue,diagnostics:()=>({...fx.diagnostics(),dialogue:dialogue.diagnostics()}),dispose};window.LeonelPreview=review;parent.LeonelPreview=review;
  attachReviewTools(review,doc);
  engine.app.renderer.on('resize',resize);window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopQueue();fx.cancel();}});engine.app.canvas.addEventListener('webglcontextlost',()=>fx.cancel());
  if(!engine.reducedMotion)fx.play();
 }catch(error){$('status').textContent='준비 실패: '+error.message;$('health').textContent=error.stack;console.error('[Leonel]',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
