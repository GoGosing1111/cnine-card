import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {KNIGHT,MODES,makePlan} from '../skill.mjs';
import {KnightFX,loadKnightAssets} from './KnightFX.js';
const parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id),ROOT='/preview/mercenary-crimson-silver-knight-battle-v1/';
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error(`자산을 불러오지 못했습니다: ${path}`);return r.json();};
let engine,renderer,merc,fx,disposed=false;
function plan(){const mode=$('mode').value,at=mode==='ultimate'?2.05:mode==='aura'?2.5:mode==='dash'?.30:.65;return makePlan({mode,cancelAt:$('scenario').value==='interrupt'?at:null,targetLostAt:$('scenario').value==='lost'?at:null});}
let lastEvent=-1,lastEventsPlan=null;
function update(instance){
 const spec=MODES[instance.plan.mode];$('play').textContent=instance.playing?'일시정지':'재생';$('scrub').max=spec.duration;$('scrub').value=instance.time;$('time').textContent=`${instance.time.toFixed(2)} / ${spec.duration.toFixed(2)}초`;
 $('cue').textContent=instance.sample.label;$('health').dataset.diagnostics=JSON.stringify(instance.diagnostics());
 const current=instance.sample.events.length;if(current!==lastEvent||lastEventsPlan!==instance.plan){lastEvent=current;lastEventsPlan=instance.plan;$('events').innerHTML=instance.plan.events.map(e=>`<li class="${e.at<=instance.time?'active':''}"><time>${e.at.toFixed(2)}</time><span>${e.label}</span></li>`).join('');}
 for(const button of parentDoc.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===instance.plan.mode));
}
function resize(){if(disposed||!fx)return;const at=fx.time;fx.pause();fx.removeTimeline();engine.setFormationMercenaries([merc]);fx.captureFormation();fx.makeTimeline();fx.seek(at);}
function dispose(){if(disposed)return;disposed=true;engine?.app.renderer.off('resize',resize);fx?.destroy();for(const actor of new Set([...(engine?.allies||[]),...(engine?.enemies||[])])){actor.animationAdapter?.destroy?.();actor.animationController?.kill?.();}merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('기준 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'은백·금색 대검 기사',opponentName:'연출 검수',autoText:'전장 준비 중'});
  renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'은백·금색 대검 기사'});api.mountForBattle=mountForBattle;
  await engine.deployCards({instant:true,force:true});
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);if(!art)throw Error('대검 기사 전투 SD 누락');
  const [sd,cutin,assets]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(ROOT+'assets/source-art-preview.webp'),loadKnightAssets(manifest)]);
  merc=new BattleCharacter({id:'CRIMSON_KNIGHT_PREVIEW',name:KNIGHT.name,team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:cutin,fullBodyHeight:manifest.displaySizing.fullBodyHeight,accent:0xffa74b});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;engine.sortCombatDepth();
  const targets=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY).slice(0,3);
  fx=new KnightFX(engine,merc,targets,assets,manifest,plan(),update);
  $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();
  $('impact').onclick=()=>fx.seek(fx.plan.contacts.at(-1)??.40);$('scrub').oninput=()=>fx.seek(Number($('scrub').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  const change=()=>{lastEvent=-1;fx.setPlan(plan());};$('mode').onchange=change;$('scenario').onchange=change;
  $('sound').onchange=()=>fx.setSound($('sound').checked);
  $('aura').onchange=()=>fx.setAura($('aura').checked);
  $('motion-only').onchange=()=>fx.setMotionOnly($('motion-only').checked);
  $('mobile').onchange=()=>{$('battle-viewport').classList.toggle('mobile-test',$('mobile').checked);};
  for(const button of parentDoc.querySelectorAll('[data-mode]'))button.onclick=()=>{$('mode').value=button.dataset.mode;change();};
  for(const el of parentDoc.querySelectorAll('.controls button,.controls select,.controls input,.mode-tabs button,.scrubber input'))el.disabled=false;
  $('health').textContent='재생 준비 완료';engine.app.renderer.on('resize',resize);prepared.phase.textContent='대검 기사 · 고강화 광원';prepared.stage.querySelector('#pvBattleStatus').textContent='종결 용병 · 대검과 전장 연출 검수';
  const review={get fx(){return fx;},get engine(){return engine;},get merc(){return merc;},manifest,diagnostics:()=>fx.diagnostics(),dispose};window.CrimsonKnightPreview=review;window.parent.CrimsonKnightPreview=review;
  fx.setPlan(makePlan({mode:'ultimate'}));$('mode').value='ultimate';fx.play();
  window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});engine.app.canvas.addEventListener('webglcontextlost',()=>{if(disposed)return;fx.cancel();$('health').textContent='그래픽 연결이 끊어졌습니다. 새로고침해 주세요.';});
 }catch(error){$('health').textContent='시연 준비 실패: '+error.message;console.error('[CrimsonKnight]',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
