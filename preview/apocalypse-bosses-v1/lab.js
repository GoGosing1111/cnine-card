import {mountForBattle} from '../project-v-v3/source/project-v-pixi-battle.src.js';
import {BOSSES,makeRegistrationDraft} from './bosses.mjs';
import {DraftSkillFX} from './DraftSkillFX.js';
const page=window.parent===window?document:parent.document,$=id=>page.getElementById(id)||document.getElementById(id);
let engine,renderer,fixtures,payload,boss=BOSSES[0],kind='seal',held=null,tl=null,mounting=false,epoch=0;
const skill=()=>boss.skills.find(s=>s.kind===kind);
const write=text=>{$('health').textContent=text;};
const control=(disabled)=>{for(const id of ['play','impact','reset','seek','pause',...BOSSES.map(b=>b.key)])$(id).disabled=disabled;};
function cancel(){epoch++;tl?.kill();tl=null;held?.release();held=null;engine?.cancelTimelines();$('pause').textContent='일시정지';}
function resetHp(){for(const data of payload.battleV2.teams.A.cards){const c=engine.combatantById(data.id);if(c){engine.syncTargetHp(c,100);c.setShield(data.shield||0,data.maxShield||0);}}}
function details(){
 const s=skill();$('boss-name').textContent=boss.name;$('subtitle').textContent=boss.subtitle;$('boss-sd').src=boss.battleSprite;$('boss-sd').alt=boss.name+' 전투 SD';$('source-art').href=boss.sourceArt;
 const draft=makeRegistrationDraft().find(d=>d.code===boss.code);$('power').innerHTML=(draft.battleProfile.battlePower/10000).toLocaleString('ko-KR')+'<small>만</small>';$('scale-note').textContent='하시라마 기준 ×'+boss.powerRatio.toFixed(2);
 $('skill-name').textContent=s.name;$('skill-category').textContent=({seal:'SEAL / 봉인',curse:'CURSE / 회복 차단',ultimate:'ULTIMATE / 궁극기'})[kind];$('skill-description').textContent=s.description;
 for(const b of BOSSES){$(b.key).classList.toggle('selected',b===boss);$(b.key).setAttribute('aria-pressed',String(b===boss));}
 for(const k of ['seal','curse','ultimate']){$(k).classList.toggle('selected',k===kind);$(k).setAttribute('aria-pressed',String(k===kind));}
}
async function select(key){
 if(mounting)return;mounting=true;control(true);cancel();boss=BOSSES.find(b=>b.key===key)||boss;details();$('render-state').textContent='전장 준비 중';
 try{
  if(renderer){renderer.destroy();renderer=null;window.ProjectVPixiBattle.destroy();}
  payload=structuredClone(fixtures[boss.key]);window.cnineCardCatalog=()=>payload.battleV2.teams.A.cards;
  const api=window.ProjectVPixiBattle,original=api.mountForBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'APOCALYPSE',playerName:'스킬 검수',opponentName:boss.name,autoText:'전투 리소스 준비'});renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'APOCALYPSE',playUltimateCinematics:false});}finally{api.mountForBattle=original;}
  await engine.deployCards({instant:true,force:true});await Promise.all(boss.skills.map(s=>DraftSkillFX.preload(s)));
  $('render-state').textContent='기존 V3 진형 · SD 준비 완료';write('스킬을 선택해 재생하세요. 봉인·저주 효과와 궁극기 충돌을 개별 확인할 수 있습니다.');
  $('seek').value=0;$('frame').textContent='00 / 11';control(false);
 }catch(e){write('리소스 준비 실패: '+e.message);$('render-state').textContent='로드 실패';console.error(e);}finally{mounting=false;}
}
async function play({seek=null}={}){
 if(mounting||!engine)return;cancel();const stamp=epoch,s=skill(),frames=await DraftSkillFX.preload(s);if(stamp!==epoch||!frames)return;
 resetHp();const events=payload.draftSkillEvents[kind];const targets=events.map(e=>engine.combatantById(e.targetId)).filter(Boolean);if(!targets.length)throw Error('MISSING_PREVIEW_TARGETS');
 const points=s.kind==='ultimate'?[{x:targets.reduce((n,t)=>n+t.root.x,0)/targets.length,y:targets.reduce((n,t)=>n+t.root.y,0)/targets.length}]:targets.map(t=>({x:t.root.x,y:t.root.y}));
 held=new DraftSkillFX(s,frames,points,{viewport:engine.scene,reducedMotion:engine.reducedMotion}).attach(engine.effectLayer);const fx=held;
 const apply=()=>{for(const e of events){const target=engine.combatantById(e.targetId);if(target&&e.type==='APOCALYPSE_DRAFT_HIT'){engine.syncTargetHp(target,engine.eventHpPercent(target,e.targetHpAfter));target.setShield(e.targetShieldAfter,target.serverMaxShield||0);}}write(s.kind==='ultimate'?s.name+' · 서버 초안 피해 반영 / 보호막 관통 '+s.shieldPiercePercent+'%':s.name+' · '+events.length+'명 / 각자 '+s.statusActions+'행동 '+(s.kind==='seal'?'스킬 봉인':'회복 100% 차단'));};
 const run=engine.timeline(timeline=>{tl=timeline;fx.play(timeline,{onImpact:apply,onSample:frame=>{$('frame').textContent=String(Math.floor(frame+1e-7)).padStart(2,'0')+' / 11';$('seek').value=String(Math.round(timeline.time()/s.duration*1000));}});},()=>{fx.release();if(held===fx)held=null;},Number($('speed').value));
 if(seek!==null){tl.time(Math.min(s.duration-.001,Math.max(0,seek)),false).pause();fx.render();if(seek>=s.impactAt)apply();$('pause').textContent='이어 재생';}
 else{write(s.name+' · 연출 재생 중');$('pause').textContent='일시정지';}
 return run;
}
async function boot(){
 await import('../project-v-v3/fit-preview-viewport.mjs');
 const r=await fetch('./payloads.json');if(!r.ok)throw Error('MISSING_FIXTURES');fixtures=await r.json();
 for(const b of BOSSES)$(b.key).addEventListener('click',()=>void select(b.key));
 for(const k of ['seal','curse','ultimate'])$(k).addEventListener('click',()=>{if(mounting)return;cancel();kind=k;details();resetHp();$('seek').value=0;$('frame').textContent='00 / 11';write(skill().description);});
 $('play').addEventListener('click',()=>void play().catch(e=>write(e.message)));$('impact').addEventListener('click',()=>void play({seek:skill().impactAt}).catch(e=>write(e.message)));
 $('pause').addEventListener('click',()=>{if(!tl||!held)return;tl.paused(!tl.paused());$('pause').textContent=tl.paused()?'이어 재생':'일시정지';});
 $('speed').addEventListener('change',()=>tl?.timeScale(Number($('speed').value)));
 $('seek').addEventListener('input',()=>{void play({seek:Number($('seek').value)/1000*skill().duration}).catch(e=>write(e.message));});
 $('reset').addEventListener('click',()=>{cancel();resetHp();$('frame').textContent='00 / 11';$('seek').value=0;const count=engine.effectLayer.children.filter(c=>c.label?.startsWith('DRAFT_FX_')).length;write('초기화 완료 · 남은 신규 스킬 이펙트 '+count+'개');});
 window.addEventListener('pagehide',()=>{cancel();renderer?.destroy();window.ProjectVPixiBattle.destroy();void DraftSkillFX.unload(BOSSES.flatMap(b=>b.skills));},{once:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&tl&&held){tl.pause();$('pause').textContent='이어 재생';}});
 window.BossDraftLab={diagnostics:()=>({boss:boss.key,kind,mounting,remainingFx:engine?.effectLayer?.children.filter(c=>c.label?.startsWith('DRAFT_FX_')).length||0,frame:held?.sprites[0]?.currentFrame??null,paused:tl?.paused(),canonicalRuntime:window.ProjectVPixiBattle.runtimeVersion,registered:false})};
 await select('alucard');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot().catch(e=>write(e.message)),{once:true});else void boot().catch(e=>write(e.message));
