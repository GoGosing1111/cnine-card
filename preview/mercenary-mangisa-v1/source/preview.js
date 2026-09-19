import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {MANGISA_SKILL,compileMangisaPreview} from '../skill.mjs';
import {MangisaSkillFX,loadMangisaAssets} from './MangisaSkillFX.js';

const parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id);
const ROOT='/preview/mercenary-mangisa-v1/';
const FIXTURE_IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const r=await fetch(path);if(!r.ok)throw Error(`자산 오류: ${path}`);return r.json()};
let engine,renderer,merc,fx,disposed=false;
const plan=()=>compileMangisaPreview({mode:$('mode').value,targetCount:Number($('targets').value),cancelAt:$('scenario').value==='interrupt'?.82:null,targetLostAt:$('scenario').value==='lost'?.82:null});
function update(instance){
 $('play').textContent=instance.playing?'일시정지':'스킬 재생';$('scrub').value=instance.time;
 $('time').textContent=`${instance.time.toFixed(2)} / ${MANGISA_SKILL.visual.duration.toFixed(2)}초`;
 $('cue').textContent=instance.sample.label;$('health').dataset.diagnostics=JSON.stringify(instance.diagnostics());
 $('events').innerHTML=instance.plan.events.filter(e=>e.kind==='SHOT'||e.kind==='SPLASH'||e.kind==='CANCEL').map(e=>`<li class="${e.at<=instance.time?'active':''}"><time>${e.at.toFixed(2)}</time>${e.label}</li>`).join('');
}
function dispose(){if(disposed)return;disposed=true;engine?.app.renderer.off('resize',resize);fx?.destroy();merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy()}
function resize(){if(disposed||!fx)return;fx.pause();engine.setFormationMercenaries([merc]);fx.render(fx.time)}
async function boot(){
 try{
  const [manifest,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=FIXTURE_IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('승인 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100}});
  window.cnineCardCatalog=()=>deck;
  const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'망이사 스킬 검수',opponentName:'승인 카드 모의 표적',autoText:'공유 V3 전장 준비 중'});
  renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'망이사 스킬 검수'});api.mountForBattle=mountForBattle;
  await engine.deployCards({instant:true,force:true});
  const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[{...manifest,battleSpriteSha256:manifest.battleSpriteInfo.sha256,battleSpriteStatus:'TECH_QA_COMPLETE_USER_REVIEW_PENDING'}]});
  const art=adapter.resolveForConsumer('BATTLE_FIELD',manifest.code);if(!art)throw Error('망이사 전투 SD 해석 실패');
  const [sd,cutin,assets]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(ROOT+'assets/source-art-preview.webp'),loadMangisaAssets(manifest)]);
  merc=new BattleCharacter({id:'MANGISA_PREVIEW',name:'망이사',team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:cutin,fullBodyHeight:260,accent:0xf3c475});
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.combatLayer.addChild(merc.root);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;engine.sortCombatDepth();
  fx=new MangisaSkillFX(engine,merc,engine.enemies.slice(0,3),assets,manifest,plan(),update);
  $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play()};$('impact').onclick=()=>fx.seek(MANGISA_SKILL.visual.impactAt+.10);$('cancel').onclick=()=>fx.cancel();
  $('scrub').oninput=()=>fx.seek(Number($('scrub').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
  for(const id of ['mode','targets','scenario'])$(id).onchange=()=>fx.setPlan(plan());
  for(const el of parentDoc.querySelectorAll('.controls button,.controls select,.scrubber input'))el.disabled=false;
  $('health').textContent='전투 시연 준비 완료';engine.app.renderer.on('resize',resize);
  prepared.phase.textContent='망이사 · 금란 연사';prepared.stage.querySelector('#pvBattleStatus').textContent='SD·스킬 검수 · 실제 계정 변경 없음';
  const review={get fx(){return fx},get engine(){return engine},diagnostics:()=>fx.diagnostics(),dispose};window.MangisaPreview=review;window.parent.MangisaPreview=review;
  window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel()});
  engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('health').textContent='WebGL 연결이 끊어졌습니다. 새로고침해 주세요.'});
 }catch(error){$('health').textContent='전투 시연 준비 실패: '+error.message;console.error('[Mangisa]',error)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
