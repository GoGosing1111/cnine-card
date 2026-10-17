import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {MODES,SHOWCASE,makePlan} from '../skill.mjs';
import {JokroFX,loadJokroAssets} from './JokroFX.js';
import {JokroDialogue} from './JokroDialogue.js';
import {JINMU_BASELINE,JOKRO_COMBAT,resolveJokroPreviewCast} from '../balance.mjs';
const ROOT='/preview/mercenary-jokro-iaido-20261017-v1/',parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id);
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error('자산 누락: '+path);return r.json();};
let engine,renderer,merc,fx,dialogue,disposed=false;const queue={active:false,index:0,completed:false};
function beginDialogue(mode){dialogue?.begin(mode,MODES[mode].label.split(' · ')[0]);}
function stopQueue(){queue.active=false;$('showcase').textContent='전체 시연';}
function startQueue(){queue.active=true;queue.completed=false;queue.index=0;fx.setMotionOnly(false);$('motion-only').checked=false;fx.setAura(true);$('aura').checked=true;$('scenario').value='normal';playQueue();}
function playQueue(){if(!queue.active)return;const mode=SHOWCASE[queue.index];$('mode').value=mode;fx.setPlan(makePlan({mode}));beginDialogue(mode);fx.play();$('showcase').textContent='전체 시연 '+(queue.index+1)+' / '+SHOWCASE.length;}
function plan(){const mode=$('mode').value,stop=mode==='awakening'?2.4:mode==='ultimate'?2.0:mode==='skill'?1.0:.32;return makePlan({mode,cancelAt:$('scenario').value==='interrupt'?stop:null,targetLostAt:$('scenario').value==='lost'?stop:null});}
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('scrub').max=f.plan.duration;$('scrub').value=f.time;$('time').textContent=f.time.toFixed(2)+' / '+f.plan.duration.toFixed(2)+'초';$('cue').textContent=f.sample.label;$('description').textContent=MODES[f.plan.mode].description;
 $('events').innerHTML=f.plan.events.map(([t,label])=>'<li class="'+(t<=f.time?'active':'')+'"><time>'+t.toFixed(2)+'</time><span>'+label+'</span></li>').join('');
 for(const b of parentDoc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.plan.mode));
 if(f.sample.done||f.sample.cancelled)dialogue?.end();
}
function resize(){if(!fx||disposed)return;const at=fx.time,was=fx.playing;fx.pause();engine.setFormationMercenaries([merc]);fx.captureFormation();fx.makeTimeline();fx.seek(at);if(was)fx.play();}
function dispose(){if(disposed)return;disposed=true;queue.active=false;dialogue?.destroy();engine?.app.renderer.off('resize',resize);fx?.destroy();for(const a of [...(engine?.allies||[]),...(engine?.enemies||[])]){a.animationAdapter?.destroy?.();a.animationController?.kill?.();}merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();}
async function boot(){
 try{
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=IDS.map((id,i)=>{const c=available.find(x=>x.cardId===id);if(!c)throw Error('실제 기준 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
  window.cnineCardCatalog=()=>deck;const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'족로',opponentName:'전투 연출',autoText:'용혼을 불러오는 중'});
  renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'족로'});api.mountForBattle=mountForBattle;
  await engine.deployCards({instant:true,force:true});
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[manifest]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);
  const [sd,assets]=await Promise.all([Assets.load(art.spriteUrl),loadJokroAssets(manifest)]);
  merc=new BattleCharacter({id:'JOKRO_RESOURCE_PREVIEW',name:'족로',team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:null,fullBodyHeight:manifest.displaySizing.fullBodyHeight,accent:0x49eaa8});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;
  const targets=engine.enemies.slice().sort((a,b)=>b.baseY-a.baseY);fx=new JokroFX(engine,merc,targets,assets,manifest,plan(),update);
  dialogue=new JokroDialogue(parentDoc);
  fx.onCancel=()=>{stopQueue();dialogue.end();};fx.onComplete=()=>{dialogue.end();if(!queue.active)return;queue.index++;if(queue.index<SHOWCASE.length)playQueue();else{queue.completed=true;stopQueue();$('cue').textContent='전체 시연 완료';}};
  $('showcase').onclick=startQueue;$('play').onclick=()=>{if(fx.playing)fx.pause();else{if(fx.time>=fx.plan.duration)beginDialogue(fx.plan.mode);fx.play();}};$('restart').onclick=()=>{if(queue.active)startQueue();else{beginDialogue(fx.plan.mode);fx.seek(0);fx.play();}};$('cancel').onclick=()=>fx.cancel();
  $('impact').onclick=()=>fx.seek(fx.plan.contacts[0]??.35);$('scrub').oninput=()=>{stopQueue();fx.seek(Number($('scrub').value));};$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  const change=()=>{stopQueue();fx.setPlan(plan());beginDialogue(fx.plan.mode);};$('mode').onchange=change;$('scenario').onchange=change;
  $('sound').onchange=()=>fx.setSound($('sound').checked);$('aura').onchange=()=>fx.setAura($('aura').checked);$('motion-only').onchange=()=>{stopQueue();fx.setMotionOnly($('motion-only').checked);};$('reduced').onchange=()=>fx.setReducedMotion($('reduced').checked);
  $('reduced').checked=fx.reducedMotion;
  for(const b of parentDoc.querySelectorAll('[data-mode]'))b.onclick=()=>{$('mode').value=b.dataset.mode;change();fx.play();};
  for(const e of parentDoc.querySelectorAll('button,select,input'))e.disabled=false;
  $('health').textContent='동작 2× · 이펙트 1× · '+(manifest.counts.motion+manifest.counts.effects)+' 프레임';prepared.phase.textContent='SSS LIMITED · 족로';
  const n=v=>v.toLocaleString('ko-KR',{maximumFractionDigits:3});
  const rows=[['기본 전투력',n(JINMU_BASELINE.basePower),n(JOKRO_COMBAT.basePower)],['공격력 연계',n(JINMU_BASELINE.link.attackPercent)+'%',n(JOKRO_COMBAT.link.attackPercent)+'%'],['체력 연계',n(JINMU_BASELINE.link.hpPercent)+'%',n(JOKRO_COMBAT.link.hpPercent)+'%'],['방벽 연계',n(JINMU_BASELINE.link.shieldPercent)+'%',n(JOKRO_COMBAT.link.shieldPercent)+'%'],['받는 피해 감소','75%','80%'],['행동 배율','3.12×','3.12×'],['광역기 총 피해 / 대기 / 소모','560% / 5턴 / 35','672% / 4턴 / 30'],['청룡단천 총 피해 / 대기 / 소모','—','840% / 5턴 / 35']];
  $('balance-rows').innerHTML=rows.map(r=>'<tr>'+r.map((v,i)=>i?'<td>'+v+'</td>':'<th scope="row">'+v+'</th>').join('')+'</tr>').join('');
  engine.app.renderer.on('resize',resize);
  const review={get fx(){return fx},get engine(){return engine},get merc(){return merc},get dialogue(){return dialogue},manifest,queue,balance:{baseline:JINMU_BASELINE,jokro:JOKRO_COMBAT,resolveCast:resolveJokroPreviewCast},diagnostics:()=>({...fx.diagnostics(),dialogue:dialogue.diagnostics(),queue:{...queue}}),dispose};window.JokroPreview=review;window.parent.JokroPreview=review;
  const params=new URLSearchParams(window.parent.location.search),initial=MODES[params.get('mode')]?params.get('mode'):'aura';
  if(params.has('showcase')&&!fx.reducedMotion)startQueue();else{fx.setPlan(makePlan({mode:initial}));$('mode').value=initial;beginDialogue(initial);if(!fx.reducedMotion)fx.play();}
  window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.pause();});engine.app.canvas.addEventListener('webglcontextlost',()=>fx.cancel());
 }catch(e){$('health').textContent='시연 준비 실패: '+e.message;console.error('[Jokro]',e);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
