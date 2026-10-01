import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {KNIGHT,MODES,makePlan} from '../skill.mjs';
import {KnightFX,loadKnightAssets} from './KnightFX.js';
import {SkillShowcase} from '../showcase.mjs';
const parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id),ROOT='/preview/mercenary-crimson-silver-knight-battle-v1/';
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error(`자산을 불러오지 못했습니다: ${path}`);return r.json();};
let engine,renderer,merc,fx,showcase,battleStatus,disposed=false;
function plan(){const mode=$('mode').value,at=mode==='ultimate'?2.05:mode==='aura'?2.5:mode==='dash'?.30:.65;return makePlan({mode,cancelAt:$('scenario').value==='interrupt'?at:null,targetLostAt:$('scenario').value==='lost'?at:null});}
let lastEvent=-1,lastEventsPlan=null;
function update(instance){
 const spec=MODES[instance.plan.mode];$('play').textContent=instance.playing?'일시정지':'재생';$('scrub').max=spec.duration;$('scrub').value=instance.time;$('time').textContent=`${instance.time.toFixed(2)} / ${spec.duration.toFixed(2)}초`;
 $('cue').textContent=instance.sample.label;$('health').dataset.diagnostics=JSON.stringify(instance.diagnostics());
 const current=instance.sample.events.length;if(current!==lastEvent||lastEventsPlan!==instance.plan){lastEvent=current;lastEventsPlan=instance.plan;$('events').innerHTML=instance.plan.events.map(e=>`<li class="${e.at<=instance.time?'active':''}"><time>${e.at.toFixed(2)}</time><span>${e.label}</span></li>`).join('');}
 for(const button of parentDoc.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===instance.plan.mode));
 if(battleStatus)battleStatus.textContent=(showcase?.active?`${showcase.index+1}/7 · `:'')+spec.label;
}
function updateShowcase(sequence){
 $('showcase').setAttribute('aria-pressed',String(sequence.active));
 $('showcase').textContent=sequence.active?'전체 처음부터':'전체 스킬 재생';
 $('showcase-status').textContent=sequence.active?`전체 시연 ${sequence.index+1} / 7 · ${MODES[sequence.fx.plan.mode].label}`:sequence.completed?'전체 스킬 시연 완료':'대시 · 기본 강격 · 홍련 강격 · 채택 모션 · 심판 · 방벽 · 궁극기';
 if(sequence.active)$('mode').value=sequence.fx.plan.mode;
}
function resize(){if(disposed||!fx)return;const at=fx.time,playing=fx.playing;fx.pause();fx.removeTimeline();engine.setFormationMercenaries([merc]);fx.captureFormation();fx.makeTimeline();fx.seek(at);if(playing)fx.play();}
function dispose(){if(disposed)return;disposed=true;engine?.app.renderer.off('resize',resize);fx?.destroy();for(const actor of new Set([...(engine?.allies||[]),...(engine?.enemies||[])])){actor.animationAdapter?.destroy?.();actor.animationController?.kill?.();}merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json?v=17-valter-final'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  for(const option of $('speed').options)option.textContent=`${(Number(option.value)*(manifest.playbackTempo?.rate??1)).toFixed(2)}×${option.value==='1'?' (기본)':''}`;
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('기준 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:KNIGHT.name,opponentName:'연출 검수',autoText:'전장 준비 중'});
  renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:KNIGHT.name});api.mountForBattle=mountForBattle;
  await engine.deployCards({instant:true,force:true});
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);if(!art)throw Error('대검 기사 전투 SD 누락');
  const [sd,cutin,assets]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(ROOT+'assets/source-art-preview.webp'),loadKnightAssets(manifest)]);
  merc=new BattleCharacter({id:'CRIMSON_KNIGHT_PREVIEW',name:KNIGHT.name,team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:cutin,fullBodyHeight:manifest.displaySizing.fullBodyHeight,accent:0xffa74b});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;engine.sortCombatDepth();
  const targets=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY).slice(0,3);
  fx=new KnightFX(engine,merc,targets,assets,manifest,plan(),update);
  showcase=new SkillShowcase(fx,updateShowcase);
  const startShowcase=()=>{$('scenario').value='normal';$('aura').checked=true;fx.setAura(true);$('motion-only').checked=false;fx.setMotionOnly(false);showcase.start();};
  $('showcase').onclick=startShowcase;
  $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{if(showcase.active)showcase.start();else{fx.seek(0);fx.play();}};$('cancel').onclick=()=>fx.cancel();
  $('impact').onclick=()=>fx.seek(fx.plan.contacts.at(-1)??.40);$('scrub').oninput=()=>fx.seek(Number($('scrub').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  const change=()=>{showcase.stop();lastEvent=-1;fx.setPlan(plan());};$('mode').onchange=change;$('scenario').onchange=change;
  $('sound').onchange=()=>fx.setSound($('sound').checked);
  $('aura').onchange=()=>fx.setAura($('aura').checked);
  $('motion-only').onchange=()=>{showcase.stop();fx.setMotionOnly($('motion-only').checked);};
  $('mobile').onchange=()=>{$('battle-viewport').classList.toggle('mobile-test',$('mobile').checked);};
  for(const button of parentDoc.querySelectorAll('[data-mode]'))button.onclick=()=>{$('mode').value=button.dataset.mode;change();fx.play();};
  for(const el of parentDoc.querySelectorAll('.controls button,.controls select,.controls input,.mode-tabs button,.scrubber input'))el.disabled=false;
  $('health').textContent='재생 준비 완료';engine.app.renderer.on('resize',resize);prepared.phase.textContent=KNIGHT.name+' · 홍련의 검광';battleStatus=prepared.stage.querySelector('#pvBattleStatus');
  const review={get fx(){return fx;},get engine(){return engine;},get merc(){return merc;},showcase,manifest,diagnostics:()=>({...fx.diagnostics(),showcase:showcase.diagnostics()}),dispose};window.CrimsonKnightPreview=review;window.parent.CrimsonKnightPreview=review;
  if(new URLSearchParams(window.parent.location.search).has('showcase'))startShowcase();
  else{fx.setPlan(makePlan({mode:'ultimate'}));$('mode').value='ultimate';fx.play();updateShowcase(showcase);}
  window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});engine.app.canvas.addEventListener('webglcontextlost',()=>{if(disposed)return;fx.cancel();$('health').textContent='그래픽 연결이 끊어졌습니다. 새로고침해 주세요.';});
 }catch(error){$('health').textContent='시연 준비 실패: '+error.message;console.error('[CrimsonKnight]',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
