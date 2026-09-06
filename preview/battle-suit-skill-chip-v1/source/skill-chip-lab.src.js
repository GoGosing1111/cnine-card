// One Pixi/GSAP copy, importing the unmodified production V3 engine source.
import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {SkillChipFX} from './SkillChipFX.js';
import {SkillChipAudio} from './SkillChipAudio.js';
import {SEQUENCES,cueAt} from './sequence.js';

// A real child viewport lets live 100dvh/mobile rules work unchanged. Preview
// controls stay in the parent; no override of the production shell/card dock.
const controlsDocument=window.parent===window?document:window.parent.document;
const $=id=>controlsDocument.getElementById(id)||document.getElementById(id);
const FIXTURE_IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const absolute=value=>'/'+String(value||'').replace(/^\//,'');
let engine,renderer,fx,textures,equipment,deck,monster,audio=new SkillChipAudio();
let changing=false,playEpoch=0,normalFireTimer=0,normalShots=0,disposing=false;
const json=async path=>{const r=await fetch(path);if(!r.ok)throw new Error(`검수 자산 로드 실패: ${path}`);return r.json()};

async function loadFixture(){
  const paths=['/assets/ui/project-v/characters/fur/manifest-v2.json','/assets/ui/project-v/characters/zenith/manifest-v1.json','/assets/ui/project-v/characters/superstar/manifest-v1.json'];
  const [fur,zenith,superstar,suits,monsters]=await Promise.all([...paths.map(json),json('/assets/ui/project-v/account-battle-suits/manifest-v2.json'),json('/assets/ui/project-v/monsters/hunt-tower/manifest-v1.json')]);
  const rows=[fur,zenith,superstar].flatMap(manifest=>manifest.characters.map(card=>({...card,grade:manifest.rarity})));
  deck=FIXTURE_IDS.map((id,index)=>{
    const card=rows.find(card=>card.cardId===id);if(!card)throw new Error(`승인 카드 로스터에 없는 ID: ${id}`);
    return {...card,id,cardId:id,name:card.member,title:card.title,image:absolute(card.sourceArt),sourceArt:absolute(card.sourceArt),originalCardArt:absolute(card.sourceArt),power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][index],hp:100,maxHp:100};
  });
  // Snapshot uses actual approved card identities/sourceArt, never fabricated frame IDs.
  window.cnineCardCatalog=()=>deck;
  equipment=suits;
  const monsterRows=monsters.sprites;
  const entry=monsterRows?.find(row=>row.monsterId===68);if(!entry)throw new Error('승인 오메가-09 몬스터를 찾을 수 없습니다.');
  monster={...entry,id:68,cardId:'MONSTER:68',monsterId:68,name:entry.name,title:entry.name,image:absolute(entry.sourceArt),grade:'MONSTER',mode:'HUNT',hp:100,maxHp:100};
}
function payload(){
  const suit=equipment.suits.find(s=>s.code===$('suit').value);
  const weapon=equipment.weapons.find(s=>s.equipmentCode===$('weapon').value);
  if(!suit||!weapon)throw new Error('승인 배틀슈트/무기 조합을 찾을 수 없습니다.');
  return {previewOnly:true,mode:'HUNT',battlefieldMode:'HUNT',accountNickname:'스킬칩 검수',monster,
    equippedBattleSuit:{code:suit.code,appearance:{battleSprite:suit.image,battleHeight:278}},equippedWeapon:{code:weapon.equipmentCode,appearance:{battleSprite:weapon.battleSprite}},
    battleV2:{mode:'HUNT',rules:{battleSuitDamageAuthority:'SERVER_TIMELINE'},teams:{A:{cards:deck,supports:[{actorId:'ACCOUNT_BATTLE_UNIT',actorKind:'BATTLE_SUIT',damageAuthority:'SERVER_TIMELINE'}]},B:{cards:[monster]}},result:{timeline:[]}}
  };
}
function stopNormalFire(){clearTimeout(normalFireTimer);normalFireTimer=0;engine?.accountBattleUnit?.cancelFire?.()}
function normalFire(){
  clearTimeout(normalFireTimer);normalFireTimer=0;
  if(!fx?.playing||!$('gunfire').checked||disposing)return;
  const unit=engine.accountBattleUnit,target=engine.enemies.find(x=>x.battleActive!==false);
  if(unit&&target){
    // Existing actor animation is independent of the skill timeline. Cosmetic
    // concurrent-shot check only: never call authoritative damage or mutate HP.
    void unit.playAuthoredRangedFire({targetX:target.root.x,targetY:target.root.y-92,weaponCode:$('weapon').value,playbackRate:fx.speed,onImpact:()=>{normalShots++}});
  }
  normalFireTimer=setTimeout(normalFire,520/fx.speed);
}
function update(time){
  if(!fx)return;
  $('scrub').max=fx.sequence.duration;$('scrub').value=time;
  $('time').value=`${time.toFixed(2)} / ${fx.sequence.duration.toFixed(2)}`;
  $('cue').textContent=cueAt(fx.key,time);$('play').textContent=fx.playing?'일시정지':'재생';
  if(time>=fx.sequence.duration){audio.stop();stopNormalFire()}
}
function pause(){playEpoch++;fx?.pause();audio.stop();stopNormalFire()}
function seek(time){pause();fx?.seek(time)}
async function play(restart=false){
  if(!fx||changing||disposing)return;
  const token=++playEpoch;
  if(restart||fx.time>=fx.sequence.duration)fx.seek(0);
  if($('audio').checked){try{await audio.unlock()}catch(error){$('health').textContent=`영상 재생 가능 · ${error.message}`;audio.setEnabled(false)}}
  if(token!==playEpoch||disposing)return;
  fx.play();audio.schedule(fx.key,fx.time,fx.speed);normalFire();
}
function select(key){pause();fx.select(key);for(const button of controlsDocument.querySelectorAll('[data-skill]'))button.setAttribute('aria-pressed',String(button.dataset.skill===key));}
function controls(enabled){for(const node of controlsDocument.querySelectorAll('.lab-controls button,.lab-controls select,.lab-controls input'))node.disabled=!enabled}
async function configure(){
  if(changing)return;changing=true;pause();controls(false);
  try{await engine.configureAccountBattleUnit(payload());engine.accountBattleUnit?.setActive(true,{deployed:true});engine.layoutAccountBattleUnit();fx.seek(0)}
  catch(error){$('health').textContent=error.message}
  finally{changing=false;controls(true)}
}
function bind(){
  $('play').addEventListener('click',()=>fx.playing?pause():void play());
  $('replay').addEventListener('click',()=>void play(true));
  $('impact').addEventListener('click',()=>seek(fx.sequence.impacts[0]+.17));
  $('scrub').addEventListener('input',()=>seek(Number($('scrub').value)));
  for(const b of controlsDocument.querySelectorAll('[data-skill]'))b.addEventListener('click',()=>select(b.dataset.skill));
  $('speed').addEventListener('change',()=>{const playing=fx.playing;pause();fx.setSpeed(Number($('speed').value));if(playing)void play()});
  $('suit').addEventListener('change',()=>void configure());$('weapon').addEventListener('change',()=>void configure());
  $('audio').addEventListener('change',async()=>{audio.setEnabled($('audio').checked);if(audio.enabled&&fx.playing){const token=playEpoch;await audio.unlock();if(token===playEpoch&&fx.playing)audio.schedule(fx.key,fx.time,fx.speed)}});
  $('gunfire').addEventListener('change',()=>{$('gunfire').checked?normalFire():stopNormalFire()});
  $('shake').addEventListener('change',()=>{fx.shake=$('shake').checked;fx.render(fx.time)});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()});
  window.addEventListener('resize',()=>{pause();requestAnimationFrame(()=>fx?.render(fx.time))});
  engine.app.canvas.addEventListener('webglcontextlost',()=>{pause();controls(false);$('health').textContent='WebGL이 중단되었습니다. 새로고침해 주세요.'});
  window.addEventListener('pagehide',()=>void dispose(),{once:true});
}
async function dispose(){
  if(disposing)return;disposing=true;pause();fx?.destroy();renderer?.destroy();window.ProjectVPixiBattle?.destroy();await audio.destroy();
}
function diagnostics(){return {ready:Boolean(fx&&!changing&&!disposing),scope:'INDEPENDENT_PREVIEW_ONLY',fx:fx?.diagnostics(),audio:audio.diagnostics(),normalShots,normalFireTimer:Boolean(normalFireTimer),deckIds:deck?.map(c=>c.cardId),cardCount:document.querySelectorAll('[data-v3-roster-card]').length,account:engine?.diagnostics().accountBattleUnit,engine:engine?.diagnostics(),source:'UNMODIFIED_V3_ENGINE',networkPolicy:'STATIC_GET_ONLY'}}
async function boot(){
  try{
    await loadFixture();
    const loads=SkillChipFX.preload();
    // Capture the actual engine returned by its public mount. The wrapper itself,
    // renderer, roster markup and complete adapter chain remain untouched.
    const api=window.ProjectVPixiBattle;
    api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine};
    const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'HUNT',playerName:'스킬칩 검수',opponentName:monster.name,autoText:'승인 V3 진형과 스킬칩 효과 준비 중'});
    renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload(),mode:'HUNT',playerName:'스킬칩 검수'});
    api.mountForBattle=mountForBattle;
    await engine.deployCards({instant:true,force:true});
    await engine.accountBattleUnit.prepareRangedFireEffects();
    textures=await loads;fx=new SkillChipFX(engine,textures,update);
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){fx.shake=false;$('shake').checked=false}
    $('lab-boot').hidden=true;prepared.phase.textContent='SKILL CHIP LAB';
    prepared.stage.querySelector('#pvBattleStatus').textContent='연출 검수 · 실제 피해·소모·저장 없음';
    bind();controls(true);update(0);
    $('health').textContent='V3 WebGL · PixiJS 8.20 / GSAP 3.13 · 재생 준비 완료';
    // Audio has no autoplay. Decode on first trusted playback gesture.
    window.SkillChipLab={play,pause,seek,select,diagnostics,dispose,get engine(){return engine},get fx(){return fx},get audio(){return audio},configure};
    window.parent.SkillChipLab=window.SkillChipLab;
  }catch(error){console.error('[SkillChipLab]',error);$('lab-boot').textContent=`프리뷰 준비 실패: ${error.message}`;$('health').textContent='자산 또는 WebGL 준비 오류';}
}
if(window.parent===window)location.replace('./');
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void boot(),{once:true});else void boot();
