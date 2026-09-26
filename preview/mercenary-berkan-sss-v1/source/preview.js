import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {skillAssetBaseUrl} from '../../project-v-mercenary-system-v1/skill-asset-base.mjs';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {MODES,makePlan} from '../skill.mjs';
import {BerkanFX,loadBerkanAssets} from './BerkanFX.js';
const parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id),ROOT='/preview/mercenary-berkan-sss-v1/';
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async url=>{const r=await fetch(url);if(!r.ok)throw Error('자산 읽기 실패: '+url);return r.json();};
let engine,renderer,merc,fx,disposed=false;
function plan(){const mode=$('mode').value,at=mode==='ultimate'?1.4:.6;return makePlan({mode,cancelAt:$('scenario').value==='interrupt'?at:null,targetLostAt:$('scenario').value==='lost'?at:null,dodge:$('scenario').value==='dodge'});}
let lastEvent=-1,lastPlan=null;
function update(instance){
 $('play').textContent=instance.playing?'일시정지':'재생';$('scrub').max=instance.plan.duration;$('scrub').value=instance.time;$('time').textContent=instance.time.toFixed(2)+' / '+instance.plan.duration.toFixed(2)+'초';
 $('cue').textContent=instance.sample.label;
 if(lastEvent!==instance.sample.events.length||lastPlan!==instance.plan){lastEvent=instance.sample.events.length;lastPlan=instance.plan;$('events').replaceChildren(...instance.plan.events.map(e=>{const li=parentDoc.createElement('li');li.className=e.at<=instance.time?'active':'';li.textContent=e.at.toFixed(2)+'  '+e.label;return li;}));}
 for(const b of parentDoc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===instance.plan.mode));
}
function resize(){if(disposed||!fx)return;fx.pause();engine.setFormationMercenaries([merc]);fx.render(fx.time);}
function dispose(){if(disposed)return;disposed=true;engine?.app.renderer.off('resize',resize);fx?.destroy();merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  await Assets.init({basePath:skillAssetBaseUrl(location.href)});
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('기준 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;const mode=new URLSearchParams(location.search).get('battleMode')==='PVE'?'PVE':'PVP';
  const payload={previewOnly:true,mode,battlefieldMode:mode,battleV2:{mode,teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode,playerName:'베르칸 · SSS',opponentName:'전투 연출 검수',autoText:'전장 준비 중'});
  try{renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode,playerName:'베르칸 · SSS'});}finally{api.mountForBattle=mountForBattle;}
  await engine.deployCards({instant:true,force:true});
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);if(!art)throw Error('전투 SD 누락');
  const [sd,cutin,assets]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(ROOT+'assets/source-art-preview.webp'),loadBerkanAssets(manifest)]);
  merc=new BattleCharacter({id:'BERKAN_PREVIEW',name:'베르칸',team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:cutin,fullBodyHeight:380,accent:0xffcd70});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;
  const targets=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY).slice(0,1);fx=new BerkanFX(engine,merc,targets,assets,manifest,plan(),update);
  $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();
  $('impact').onclick=()=>fx.seek(fx.plan.contacts[0]??0);$('scrub').oninput=()=>fx.seek(Number($('scrub').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  const change=()=>{fx.setPlan(plan());fx.play();};$('mode').onchange=change;$('scenario').onchange=change;
  $('aura').onchange=()=>fx.setAura($('aura').checked);
  $('mobile').onchange=()=>{$('battle-viewport').classList.toggle('mobile-test',$('mobile').checked);};
  for(const button of parentDoc.querySelectorAll('[data-mode]'))button.onclick=()=>{$('mode').value=button.dataset.mode;change();};
  for(const el of parentDoc.querySelectorAll('.controls button,.controls select,.controls input,.mode-tabs button,.scrubber input'))el.disabled=false;
  $('health').textContent='전투 연출 준비 완료';engine.app.renderer.on('resize',resize);prepared.phase.textContent='베르칸 · 흑금의 궁수';prepared.stage.querySelector('#pvBattleStatus').textContent='SSS · 흑금 광휘 / 흑금 낙성';
  const review={get fx(){return fx;},get engine(){return engine;},get merc(){return merc;},manifest,diagnostics:()=>fx.diagnostics(),dispose};window.BerkanPreview=review;window.parent.BerkanPreview=review;
  fx.play();window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.pause();});
  engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('health').textContent='그래픽 연결이 끊어졌습니다. 새로고침해 주세요.';});
 }catch(error){$('health').textContent='시연 준비 실패: '+error.message;console.error('[Berkan]',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
