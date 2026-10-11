import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {MODES,SHOWCASE,makePlan} from '../skill.mjs';
import {GoldenDragonFX,loadDragonAssets} from './GoldenDragonFX.js';
const ROOT='/preview/mercenary-golden-dragon-battle-v1/',parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id);
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error('자산 누락: '+path);return r.json();};
let engine,renderer,merc,fx,disposed=false;const queue={active:false,index:0,completed:false};
function stopQueue(){queue.active=false;$('showcase').textContent='전체 시연';}
function startQueue(){queue.active=true;queue.completed=false;queue.index=0;fx.setMotionOnly(false);$('motion-only').checked=false;fx.setAura(true);$('aura').checked=true;$('scenario').value='normal';playQueue();}
function playQueue(){if(!queue.active)return;const mode=SHOWCASE[queue.index];$('mode').value=mode;fx.setPlan(makePlan({mode}));fx.play();$('showcase').textContent='전체 시연 '+(queue.index+1)+' / '+SHOWCASE.length;}
function plan(){const mode=$('mode').value,stop=mode==='ultimate'?2.0:mode==='skill'?1.0:.32;return makePlan({mode,cancelAt:$('scenario').value==='interrupt'?stop:null,targetLostAt:$('scenario').value==='lost'?stop:null});}
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('scrub').max=f.plan.duration;$('scrub').value=f.time;$('time').textContent=f.time.toFixed(2)+' / '+f.plan.duration.toFixed(2)+'초';$('cue').textContent=f.sample.label;$('description').textContent=MODES[f.plan.mode].description;
 $('events').innerHTML=f.plan.events.map(([t,label])=>'<li class="'+(t<=f.time?'active':'')+'"><time>'+t.toFixed(2)+'</time><span>'+label+'</span></li>').join('');
 for(const b of parentDoc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.plan.mode));
}
function resize(){if(!fx||disposed)return;const at=fx.time,was=fx.playing;fx.pause();engine.setFormationMercenaries([merc]);fx.captureFormation();fx.makeTimeline();fx.seek(at);if(was)fx.play();}
function dispose(){if(disposed)return;disposed=true;queue.active=false;engine?.app.renderer.off('resize',resize);fx?.destroy();for(const a of [...(engine?.allies||[]),...(engine?.enemies||[])]){a.animationAdapter?.destroy?.();a.animationController?.kill?.();}merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=IDS.map((id,i)=>{const c=available.find(x=>x.cardId===id);if(!c)throw Error('실제 기준 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'황금 용 검사',opponentName:'전투 연출',autoText:'용혼을 불러오는 중'});
  renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'황금 용 검사'});api.mountForBattle=mountForBattle;
  await engine.deployCards({instant:true,force:true});
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);
  const [sd,cutin,assets]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(ROOT+'assets/source-art-preview.webp'),loadDragonAssets(manifest)]);
  merc=new BattleCharacter({id:'GOLDEN_DRAGON_RESOURCE_PREVIEW',name:'황금 용 검사',team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:cutin,fullBodyHeight:manifest.displaySizing.fullBodyHeight,accent:0xe8bb60});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;
  const targets=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY);fx=new GoldenDragonFX(engine,merc,targets,assets,manifest,plan(),update);
  fx.onCancel=stopQueue;fx.onComplete=()=>{if(!queue.active)return;queue.index++;if(queue.index<SHOWCASE.length)playQueue();else{queue.completed=true;stopQueue();$('cue').textContent='전체 시연 완료';}};
  $('showcase').onclick=startQueue;$('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{if(queue.active)startQueue();else{fx.seek(0);fx.play();}};$('cancel').onclick=()=>fx.cancel();
  $('impact').onclick=()=>fx.seek(fx.plan.contacts[0]??.35);$('scrub').oninput=()=>{stopQueue();fx.seek(Number($('scrub').value));};$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  const change=()=>{stopQueue();fx.setPlan(plan());};$('mode').onchange=change;$('scenario').onchange=change;
  $('sound').onchange=()=>fx.setSound($('sound').checked);$('aura').onchange=()=>fx.setAura($('aura').checked);$('motion-only').onchange=()=>{stopQueue();fx.setMotionOnly($('motion-only').checked);};$('reduced').onchange=()=>fx.setReducedMotion($('reduced').checked);
  $('reduced').checked=fx.reducedMotion;
  for(const b of parentDoc.querySelectorAll('[data-mode]'))b.onclick=()=>{$('mode').value=b.dataset.mode;change();fx.play();};
  for(const e of parentDoc.querySelectorAll('button,select,input'))e.disabled=false;
  $('health').textContent='재생 준비 완료 · 동작 40 / 이펙트 84 프레임';prepared.phase.textContent='SSS LIMITED · 황금 용 검사';
  engine.app.renderer.on('resize',resize);
  const review={get fx(){return fx},get engine(){return engine},get merc(){return merc},manifest,queue,diagnostics:()=>({...fx.diagnostics(),queue:{...queue}}),dispose};window.GoldenDragonPreview=review;window.parent.GoldenDragonPreview=review;
  if(new URLSearchParams(window.parent.location.search).has('showcase')&&!fx.reducedMotion)startQueue();else{fx.setPlan(makePlan({mode:'aura'}));$('mode').value='aura';if(!fx.reducedMotion)fx.play();}
  window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.pause();});engine.app.canvas.addEventListener('webglcontextlost',()=>fx.cancel());
 }catch(e){$('health').textContent='시연 준비 실패: '+e.message;console.error('[GoldenDragon]',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
