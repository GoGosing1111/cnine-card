import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {CHARACTER,MODES,makePlan} from '../skill.mjs';
import {BlackMoonFX,loadBlackMoonAssets} from './BlackMoonFX.js';
const parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id),ROOT='/preview/mercenary-black-moon-swordsman-ss-v1/';
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error('리소스 읽기 실패: '+path);return r.json();};
let engine,renderer,merc,fx,disposed=false;
const plan=()=>makePlan({mode:$('mode').value,cancelAt:$('scenario').value==='interrupt'?1.02:null,targetLostAt:$('scenario').value==='lost'?1.6:null});
let eventCount=-1,lastPlan=null;
function update(instance){
 $('play').textContent=instance.playing?'일시정지':'재생';$('scrub').max=instance.plan.duration;$('scrub').value=instance.time;$('time').textContent=instance.time.toFixed(2)+' / '+instance.plan.duration.toFixed(2)+'초';$('cue').textContent=instance.sample.label;$('health').dataset.diagnostics=JSON.stringify(instance.diagnostics());
 if(eventCount!==instance.sample.events.length||lastPlan!==instance.plan){eventCount=instance.sample.events.length;lastPlan=instance.plan;$('events').innerHTML=instance.plan.events.map(e=>'<li class="'+(e.at<=instance.time?'active':'')+'"><time>'+e.at.toFixed(2)+'</time> '+e.label+'</li>').join('');}
 for(const b of parentDoc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===instance.plan.mode));
}
function resize(){if(disposed||!fx)return;fx.pause();engine.setFormationMercenaries([merc]);fx.captureFormation();fx.render(fx.time);}
function dispose(){if(disposed)return;disposed=true;engine?.app.renderer.off('resize',resize);fx?.destroy();merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('기준 카드 누락');return{...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'흑월 · SS',opponentName:'검격 연출 검수',autoText:'전장 준비 중'});
  renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'흑월 · SS'});api.mountForBattle=mountForBattle;
  await engine.deployCards({instant:true,force:true});
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);if(!art)throw Error('전투 SD를 읽을 수 없습니다.');
  const [sd,cutin,assets]=await Promise.all([Assets.load(art.spriteUrl),Assets.load('/'+manifest.sourceArt),loadBlackMoonAssets(manifest)]);
  merc=new BattleCharacter({id:'BLACK_MOON_PREVIEW',name:CHARACTER.name,team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:cutin,fullBodyHeight:300,accent:0xe5c68b});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;engine.sortCombatDepth();
  const target=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY)[0];
  fx=new BlackMoonFX(engine,merc,target,assets,manifest,plan(),update);
  $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();$('impact').onclick=()=>fx.seek(fx.plan.contacts.at(-1)??0);
  $('scrub').oninput=()=>fx.seek(Number($('scrub').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  const change=()=>fx.setPlan(plan());$('mode').onchange=change;$('scenario').onchange=change;
  for(const button of parentDoc.querySelectorAll('[data-mode]'))button.onclick=()=>{$('mode').value=button.dataset.mode;change();fx.play();};
  for(const el of parentDoc.querySelectorAll('.controls button,.controls select,.mode-tabs button,.scrubber input'))el.disabled=false;
  $('health').textContent='재생 준비 완료';engine.app.renderer.on('resize',resize);prepared.phase.textContent='SS · 흑월 삼연참';prepared.stage.querySelector('#pvBattleStatus').textContent='흑월 · SD / 3연격 연출';
  const review={get fx(){return fx;},get engine(){return engine;},get merc(){return merc;},manifest,diagnostics:()=>fx.diagnostics(),dispose};window.BlackMoonPreview=review;window.parent.BlackMoonPreview=review;
  window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('health').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});fx.play();
 }catch(e){$('health').textContent='시연 준비 실패: '+e.message;console.error('[BlackMoon]',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
