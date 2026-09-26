import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {NURSE_SKILL} from '../skill.mjs';
import {NurseHealFX,loadHealSequence} from './NurseHealFX.js';
import {skillAssetBaseUrl} from '../../project-v-mercenary-system-v1/skill-asset-base.mjs';
const parentDoc=window.parent.document,$=id=>parentDoc.getElementById(id)||document.getElementById(id);
const ROOT='/preview/mercenary-nurse-healers-ss-v1/';
const FIXTURE_IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async p=>{const r=await fetch(p);if(!r.ok)throw Error('자산 오류: '+p);return r.json()};
let engine,renderer,merc,fx,manifest,adapter,sequence,disposed=false,epoch=0,selected;
const paths=new Set();
function update(instance){
 $('play').textContent=instance.playing?'일시정지':'스킬 재생';$('scrub').value=instance.time;$('time').textContent=instance.time.toFixed(2)+' / 2.60초';
 $('cue').textContent=instance.sample.phase;$('health').dataset.diagnostics=JSON.stringify({...instance.diagnostics(),selectedCode:selected,canvasCount:document.querySelectorAll('canvas').length});
}
function controls(enabled){for(const el of parentDoc.querySelectorAll('.controls button,.controls select,.scrubber input'))el.disabled=!enabled}
async function select(code){
 if(disposed||!manifest)return;const token=++epoch;controls(false);fx?.destroy();fx=null;
 const card=manifest.cards.find(c=>c.code===code);if(!card)throw Error('알 수 없는 간호사');selected=code;
 try{
  const art=adapter.resolveForConsumer('BATTLE_FIELD',code);if(!art)throw Error('전투 SD 해석 실패');
  const cutin='/'+card.previewArt;paths.add(art.spriteUrl);paths.add(cutin);
  const [sd,portrait]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(cutin)]);
  if(disposed||token!==epoch)return;
  if(!merc){merc=new BattleCharacter({id:'NURSE_PREVIEW',name:card.name,team:TEAM.ALLY,fullBodyTexture:sd,cutInTexture:portrait,fullBodyHeight:260});engine.combatLayer.addChild(merc.root)}
  else{merc.name=card.name;merc.nameLabel.text=card.name;merc.cutInTexture=portrait;merc.useFullBodySprite(sd,260);}
  merc.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);engine.setFormationMercenaries([merc]);merc.root.alpha=1;merc.root.visible=true;engine.sortCombatDepth();
  fx=new NurseHealFX(engine,merc,engine.allies,sequence,update);fx.setSpeed(Number($('speed').value));
  controls(true);$('health').textContent=card.name+' · 공통 회복 스킬 준비 완료';
 }catch(e){if(token===epoch){$('health').textContent='스킬 준비 실패: '+e.message;console.error(e)}}
}
function resize(){if(disposed||!fx)return;fx.pause();engine.setFormationMercenaries([merc]);fx.render(fx.time)}
const onSelect=e=>void select(e.detail);
function dispose(){
 if(disposed)return;disposed=true;++epoch;window.parent.removeEventListener('nurse-selected',onSelect);engine?.app.renderer.off('resize',resize);
 fx?.destroy();merc?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();
 sequence?.frames.forEach(t=>t.destroy(false));for(const p of paths)void Assets.unload(p).catch(()=>{});
}
async function boot(){
 try{
  // Pages removes .html; keep Pixi's relative V3 assets anchored to the shared directory.
  await Assets.init({basePath:skillAssetBaseUrl(location.href)});
  const catalogs=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)));
  manifest=await get(ROOT+'manifest.json');
  adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:4,battleSpritePending:0},cards:manifest.cards});
  const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  const deck=FIXTURE_IDS.map((id,i)=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('승인 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100}});
  window.cnineCardCatalog=()=>deck;
  const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine};
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'간호사 용병 스킬 검수',opponentName:'승인 카드 모의 편성',autoText:'공유 V3 전장 준비 중'});
  try{renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'간호사 용병 스킬 검수'});}finally{api.mountForBattle=mountForBattle;}
  await engine.deployCards({instant:true,force:true});
  sequence=await loadHealSequence(manifest);paths.add('/'+manifest.skill.atlas);
  $('play').onclick=()=>fx?.playing?fx.pause():fx?.play();$('restart').onclick=()=>{fx?.seek(0);fx?.play()};$('impact').onclick=()=>fx?.seek(NURSE_SKILL.contactAt);$('cancel').onclick=()=>fx?.cancel();
  $('scrub').oninput=()=>fx?.seek(Number($('scrub').value));$('speed').onchange=()=>fx?.setSpeed(Number($('speed').value));
  engine.app.renderer.on('resize',resize);window.parent.addEventListener('nurse-selected',onSelect);
  prepared.phase.textContent='백의의 맹세 · 공통 회복';prepared.stage.querySelector('#pvBattleStatus').textContent='간호사 4명 · 동일 스킬 1종 · 연출 시연';
  const review={select,dispose,get fx(){return fx},get engine(){return engine},diagnostics:()=>({...fx?.diagnostics(),selectedCode:selected,canvasCount:document.querySelectorAll('canvas').length})};
  window.NurseHealerPreview=review;window.parent.NurseHealerPreview=review;
  await select(window.parent.nurseSelection||manifest.cards[0].code);
  window.addEventListener('pagehide',dispose,{once:true});window.parent.addEventListener('pagehide',dispose,{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)fx?.cancel()});
  engine.app.canvas.addEventListener('webglcontextlost',()=>{fx?.cancel();controls(false);$('health').textContent='WebGL 연결이 끊어졌습니다. 새로고침해 주세요.'});
 }catch(error){controls(false);$('health').textContent='전투 시연 준비 실패: '+error.message;console.error('[NurseHealers]',error)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
