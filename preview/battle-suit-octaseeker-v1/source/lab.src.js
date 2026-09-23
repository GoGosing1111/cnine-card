import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {OctaSeekerFX} from './OctaSeekerFX.js';
import {OctaSeekerAudio} from './OctaSeekerAudio.js';
import {SEQUENCE,cueAt} from './sequence.mjs';

const controlsDocument=window.parent===window?document:window.parent.document;
const $=id=>controlsDocument.getElementById(id)||document.getElementById(id);
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const absolute=value=>'/'+String(value||'').replace(/^\//,'');
let engine,renderer,fx,equipment,deck,monster,changing=false,epoch=0,normalFireTimer=0,normalShots=0,disposing=false;
const audio=new OctaSeekerAudio();
const json=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`검수 자산 로드 실패: ${path}`);return r.json()};
async function loadFixture(){
  const [fur,zenith,superstar,suits,hBody,monsters]=await Promise.all([
    '/assets/ui/project-v/characters/fur/manifest-v2.json','/assets/ui/project-v/characters/zenith/manifest-v1.json',
    '/assets/ui/project-v/characters/superstar/manifest-v1.json','/assets/ui/project-v/account-battle-suits/manifest-v2.json',
    '/assets/ui/project-v/account-battle-suits/h-body-v2066.json','/assets/ui/project-v/monsters/hunt-tower/manifest-v1.json',
  ].map(json));
  const rows=[fur,zenith,superstar].flatMap(manifest=>manifest.characters.map(card=>({...card,grade:manifest.rarity})));
  deck=IDS.map((id,index)=>{
    const card=rows.find(c=>c.cardId===id);if(!card)throw new Error('승인 카드 ID 누락');
    return {...card,id,cardId:id,name:card.member,title:card.title,image:absolute(card.sourceArt),sourceArt:absolute(card.sourceArt),
      originalCardArt:absolute(card.sourceArt),power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][index],hp:100,maxHp:100};
  });
  window.cnineCardCatalog=()=>deck;
  equipment={...suits,suits:[...suits.suits,{...hBody.suit,image:hBody.suit.battleSprite}]};
  const entry=monsters.sprites.find(row=>row.monsterId===68);if(!entry)throw new Error('승인 검수 몬스터 누락');
  monster={...entry,id:68,cardId:'MONSTER:68',monsterId:68,name:entry.name,title:entry.name,image:absolute(entry.sourceArt),grade:'MONSTER',mode:'HUNT',hp:100,maxHp:100};
}
function payload(){
  const suit=equipment.suits.find(s=>s.code===$('suit').value),weapon=equipment.weapons.find(w=>w.equipmentCode===$('weapon').value);
  if(!suit||!weapon)throw new Error('승인된 배틀슈트·무기 조합이 아닙니다.');
  return {previewOnly:true,mode:'HUNT',battlefieldMode:'HUNT',accountNickname:'유도탄 연출 검수',monster,
    equippedBattleSuit:{code:suit.code,appearance:{battleSprite:suit.image,battleHeight:278}},
    equippedWeapon:{code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}},
    battleV2:{mode:'HUNT',rules:{battleSuitDamageAuthority:'SERVER_TIMELINE'},teams:{
      A:{cards:deck,supports:[{actorId:'ACCOUNT_BATTLE_UNIT',actorKind:'BATTLE_SUIT',damageAuthority:'SERVER_TIMELINE'}]},B:{cards:[monster]}},result:{timeline:[]}}};
}
function stopNormalFire(){clearTimeout(normalFireTimer);normalFireTimer=0;engine?.accountBattleUnit?.cancelFire?.()}
function normalFire(){
  clearTimeout(normalFireTimer);normalFireTimer=0;
  if(!fx?.playing||!$('gunfire').checked||disposing)return;
  const target=fx.target,unit=engine.accountBattleUnit;
  if(unit&&target&&target.battleActive!==false)void unit.playAuthoredRangedFire({targetX:target.root.x,targetY:target.root.y-92,
    weaponCode:$('weapon').value,playbackRate:fx.speed,onImpact:()=>{normalShots++}});
  normalFireTimer=setTimeout(normalFire,520/fx.speed);
}
function update(time){
  if(!fx)return;
  $('scrub').value=time;$('time').value=`${time.toFixed(2)} / ${SEQUENCE.duration.toFixed(2)}`;
  $('cue').textContent=cueAt(time);$('play').textContent=fx.playing?'일시정지':'재생';
  if(time>=SEQUENCE.duration){audio.stop();stopNormalFire()}
}
function pause(){epoch++;fx?.pause();audio.stop();stopNormalFire()}
function seek(time){pause();fx?.seek(time)}
async function play(restart=false){
  if(!fx||changing||disposing)return;
  const token=++epoch;if(restart||fx.time>=SEQUENCE.duration)fx.seek(0);
  if($('audio').checked)try{await audio.unlock()}catch(error){$('health').textContent=`영상 재생 가능 · ${error.message}`;audio.setEnabled(false)}
  if(token!==epoch||disposing)return;
  fx.play();audio.schedule('octaseeker',fx.time,fx.speed);normalFire();
}
function controls(enabled){for(const node of controlsDocument.querySelectorAll('.lab-controls button,.lab-controls select,.lab-controls input'))node.disabled=!enabled}
async function configure(){
  if(changing)return;changing=true;pause();controls(false);
  try{await engine.configureAccountBattleUnit(payload());if(disposing)return;
    engine.accountBattleUnit?.setActive(true,{deployed:true});engine.layoutAccountBattleUnit();fx.bindTarget();fx.seek(0)}
  catch(error){$('health').textContent=error.message}finally{changing=false;if(!disposing)controls(true)}
}
function bind(){
  $('play').addEventListener('click',()=>fx.playing?pause():void play());
  $('replay').addEventListener('click',()=>void play(true));$('cancel').addEventListener('click',()=>seek(0));
  $('spread').addEventListener('click',()=>seek(.34));$('turn').addEventListener('click',()=>seek(.72));$('impact').addEventListener('click',()=>seek(1.48));
  $('scrub').addEventListener('input',()=>seek(Number($('scrub').value)));
  $('speed').addEventListener('change',()=>{const running=fx.playing;pause();fx.setSpeed(Number($('speed').value));if(running)void play()});
  $('suit').addEventListener('change',()=>void configure());$('weapon').addEventListener('change',()=>void configure());
  $('audio').addEventListener('change',async()=>{audio.setEnabled($('audio').checked);if(audio.enabled&&fx.playing){const token=epoch;await audio.unlock();if(token===epoch&&fx.playing)audio.schedule('octaseeker',fx.time,fx.speed)}});
  $('gunfire').addEventListener('change',()=>{$('gunfire').checked?normalFire():stopNormalFire()});
  $('shake').addEventListener('change',()=>{fx.shake=$('shake').checked;fx.render(fx.time)});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
  window.addEventListener('resize',()=>{pause();requestAnimationFrame(()=>{if(!disposing)fx?.render(fx.time)})});
  engine.app.canvas.addEventListener('webglcontextlost',()=>{pause();controls(false);$('health').textContent='WebGL이 중단되었습니다. 새로고침해 주세요.'});
}
async function dispose(){if(disposing)return;disposing=true;pause();fx?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();await audio.destroy()}
function diagnostics(){return {ready:Boolean(fx&&!changing&&!disposing),scope:'INDEPENDENT_PREVIEW_ONLY',fx:fx?.diagnostics(),audio:audio.diagnostics(),
  normalShots,normalFireTimer:Boolean(normalFireTimer),deckIds:deck?.map(c=>c.cardId),cardCount:document.querySelectorAll('[data-v3-roster-card]').length,
  engine:engine?.diagnostics(),source:'UNMODIFIED_V3_ENGINE',networkPolicy:'STATIC_GET_ONLY'}}
async function boot(){
  try{
    await loadFixture();if(disposing)return;const loads=OctaSeekerFX.preload();
    const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine};
    const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'HUNT',playerName:'8방향 유도탄',opponentName:monster.name,autoText:'V3 전장 준비 중'});
    try{renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload(),mode:'HUNT',playerName:'스킬칩 검수'})}
    finally{api.mountForBattle=mountForBattle}
    if(disposing){renderer?.destroy();window.ProjectVPixiBattle?.destroy();return;}
    await engine.deployCards({instant:true,force:true});await engine.accountBattleUnit.prepareRangedFireEffects();
    const textures=await loads;if(disposing)return;fx=new OctaSeekerFX(engine,textures,update);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){fx.shake=false;$('shake').checked=false}
    $('lab-boot').hidden=true;prepared.phase.textContent='OCTA SEEKER / PREVIEW';
    prepared.stage.querySelector('#pvBattleStatus').textContent='연출 검수 · 8발 → 동일 대상 1명 · 실제 피해 없음';
    bind();controls(true);update(0);$('health').textContent='V3 WebGL · PixiJS 8.20 / GSAP 3.13 · 재생 준비 완료';
    window.OctaSeekerLab={play,pause,seek,diagnostics,dispose,configure,get engine(){return engine},get fx(){return fx},get audio(){return audio}};
    window.parent.OctaSeekerLab=window.OctaSeekerLab;
  }catch(error){console.error('[OctaSeekerLab]',error);$('lab-boot').textContent=`프리뷰 준비 실패: ${error.message}`;$('health').textContent='자산 또는 WebGL 준비 오류'}
}
window.addEventListener('pagehide',()=>void dispose(),{once:true});
if(window.parent===window)location.replace('./');
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
