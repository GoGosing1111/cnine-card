import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {ICON_CARD_ROSTER} from '../../../shared/icon-card-roster-v1.mjs';
import {IconEffectPlayback,loadIconSequence,releaseIconSequence} from './IconEffectPlayback.js';

const doc=window.parent.document,$=id=>doc.getElementById(id)||document.getElementById(id);
const ROOT='/preview/icon-battle-assets-v1/';
const FIXTURE_IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async path=>{const response=await fetch(path);if(!response.ok)throw Error(`자산 오류 ${response.status}: ${path}`);return response.json()};
let manifest,engine,renderer,fx,sequence,displayCharacters,disposed=false,epoch=0,assetQueue=Promise.resolve(),selected=0,selectedEffect='diim-skill',changing=true;
const buttons=()=>doc.querySelectorAll('.player-controls button,.player-controls select,.scrubber input');
const enabled=value=>buttons().forEach(button=>button.disabled=!value);
function publish(){
  if(!engine)return;
  const state={ready:!changing&&!disposed&&!!fx,selectedCharacter:manifest.characters[selected].id,...fx?.diagnostics(),
    regularCards:engine.allies.length,mercenarySlotsUsed:0,canvases:document.querySelectorAll('canvas').length,
    effectLayers:engine.effectLayer.children.filter(layer=>layer.label==='ICON_PREVIEW_EFFECT').length,
    loadedPrivateAtlases:sequence?1:0};
  $('health').dataset.diagnostics=JSON.stringify(state);
}
function update(instance){
  if(disposed)return;
  $('play').textContent=instance.playing?'일시정지':'재생';
  $('scrub').max=instance.effect.duration;$('scrub').value=instance.time;
  $('time').textContent=`${instance.time.toFixed(2)} / ${instance.effect.duration.toFixed(2)}초`;
  $('cue').textContent=instance.sample?.phase||'대기';
  for(const button of doc.querySelectorAll('#frameStrip [data-frame]'))button.classList.toggle('active',Number(button.dataset.frame)===instance.sample?.frame);
  publish();
}
function showCharacters(){
  const list=$('characters');list.replaceChildren();
  manifest.characters.forEach((card,index)=>{
    const button=doc.createElement('button');button.className='character';button.type='button';button.dataset.character=card.id;
    button.setAttribute('aria-label',`${card.name} SD 선택`);button.setAttribute('aria-pressed',String(index===selected));
    const image=doc.createElement('img');image.src=ROOT+card.runtime;image.alt=`${card.name} ${card.weapon} 전투 SD`;image.decoding='async';
    const number=doc.createElement('span');number.className='number';number.textContent=`ICON / 0${index+1}`;
    const caption=doc.createElement('span');caption.className='caption';const name=doc.createElement('strong');name.textContent=card.name;
    const weapon=doc.createElement('small');weapon.textContent=card.weapon;caption.append(name,weapon);button.append(number,image,caption);
    button.addEventListener('click',()=>{
      if(!displayCharacters.some(c=>c.id===card.id)){
        dispose();const url=new URL(doc.location.href);url.searchParams.set('character',card.id);doc.location.href=url.href;return;
      }
      selected=index;selectedEffect=card.skillEffect;void configure();
    });list.append(button);
  });
}
function showSelection(){
  const card=manifest.characters[selected],effect=manifest.effects.find(e=>e.id===selectedEffect);
  $('sdOriginal').href=ROOT+card.source;$('sdOriginal').setAttribute('aria-label',`${card.name} SD 원본 보기`);
  $('characterName').textContent=`${card.name} · ${card.weapon}`;$('effectHeading').textContent=effect.name.split(' · ').at(-1);
  for(const button of doc.querySelectorAll('[data-character]'))button.setAttribute('aria-pressed',String(button.dataset.character===card.id));
  const picker=$('effectPicker');picker.replaceChildren();
  const choices=manifest.effects.filter(e=>[card.hitEffect,card.skillEffect].includes(e.id)||e.kind==='UNIQUE');
  choices.forEach(e=>{
    const button=doc.createElement('button');button.type='button';button.dataset.effect=e.id;
    button.className=e.kind==='UNIQUE'?'new':'';button.setAttribute('aria-pressed',String(e.id===selectedEffect));
    button.textContent=e.kind==='HIT'?'평타':e.kind==='SKILL'?'전용 스킬':e.name.split(' · ').at(-1);
    button.addEventListener('click',()=>{selectedEffect=e.id;void configure()});picker.append(button);
  });
  $('frameStrip').replaceChildren();
  effect.frames.forEach(frame=>{
    const button=doc.createElement('button');button.type='button';button.dataset.frame=frame.index;
    button.setAttribute('aria-label',`${frame.index+1}번 프레임`);const image=doc.createElement('img');image.src=ROOT+frame.file;
    image.alt='';image.loading='lazy';image.decoding='async';button.append(image,doc.createTextNode(String(frame.index+1).padStart(2,'0')));
    button.addEventListener('click',()=>fx?.seek(frame.index/15*effect.duration));$('frameStrip').append(button);
  });
  $('sequenceRecord').textContent=`16개 독립 프레임 · ${effect.cellSize}px · 충돌 ${effect.collisionFrame+1}번`;
}
async function configure(){
  const token=++epoch,index=selected,id=selectedEffect;changing=true;enabled(false);fx?.destroy();fx=null;showSelection();publish();
  $('health').textContent='선택한 개별 효과를 준비하고 있습니다…';
  assetQueue=assetQueue.catch(()=>{}).then(async()=>{
    if(disposed||token!==epoch)return;
    try{
      if(sequence){const previous=sequence;sequence=null;await releaseIconSequence(previous)}
      const effect=manifest.effects.find(e=>e.id===id),next=await loadIconSequence(effect);
      if(disposed||token!==epoch){await releaseIconSequence(next);return}
      sequence=next;
      const actorIndex=displayCharacters.findIndex(c=>c.id===manifest.characters[index].id);
      fx=new IconEffectPlayback(engine,{actor:engine.allies[actorIndex],target:engine.enemies[actorIndex%engine.enemies.length],effect,sequence},update);
      fx.setSpeed(Number($('speed').value));changing=false;enabled(true);
      $('health').classList.remove('error');$('health').textContent='PixiJS 8.20.0 · GSAP 3.13.0 · 16프레임 · 무음 / 피해 계산 없음';
      publish();
    }catch(error){
      if(token!==epoch||disposed)return;changing=false;$('health').classList.add('error');$('health').textContent='효과 준비 실패: '+error.message;publish();console.error('[ICON FX]',error);
    }
  });
  return assetQueue;
}
function decorateIconDock(){
  for(const card of document.querySelectorAll('.battle-v3-roster-frame.grade-ICON')){
    const art=card.querySelector('.card-art img');
    const portrait=ICON_CARD_ROSTER.find(row=>art?.getAttribute('src')?.split('?')[0]==='/'+row.sourceArt);
    if(portrait)art.style.objectPosition=`${portrait.focusX}% ${portrait.focusY}%`;
    if(card.querySelector('.icon-prepared-frame'))continue;
    const frame=document.createElement('img');frame.className='icon-prepared-frame';frame.src='/assets/ui/card-frames/icon-streamer-frame-v1.png';
    frame.alt='';frame.setAttribute('aria-hidden','true');card.append(frame);
  }
}
function resize(){if(disposed)return;fx?.pause();fx?.render(fx.time)}
function dispose(){
  if(disposed)return;disposed=true;epoch++;enabled(false);engine?.app.renderer.off('resize',resize);fx?.destroy();fx=null;
  const previous=sequence;sequence=null;void releaseIconSequence(previous).catch(()=>{});
  renderer?.destroy();window.ProjectVPixiBattle?.destroy();
}
async function boot(){
  try{
    const [data,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
    manifest=data;
    selected=Math.max(0,manifest.characters.findIndex(c=>c.id===new URL(doc.location.href).searchParams.get('character')));
    selectedEffect=manifest.characters[selected].skillEffect;
    // Exactly five regular slots even as the review catalog grows beyond four.
    displayCharacters=[manifest.characters[selected],...manifest.characters.filter((_,i)=>i!==selected)].slice(0,4);
    showCharacters();showSelection();
    const available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
    const targets=FIXTURE_IDS.map(id=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('승인 표적 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:'ATTACK',hp:100,maxHp:100}});
    const cards=displayCharacters.map(c=>{
      const photo=ICON_CARD_ROSTER.find(p=>p.code===c.code);
      return {...photo,id:c.code,cardId:c.code,grade:'ICON',title:c.name,image:'/'+photo.sourceArt,sourceArt:'/'+photo.sourceArt,originalCardArt:'/'+photo.sourceArt,
        power_type:'ATTACK',hp:100,maxHp:100,previewOnly:true,releaseEnabled:false,
        projectVBattleArt:{kind:'ICON_PREVIEW_ONLY',primaryUrl:ROOT+c.runtime,sourceArtUrl:'/'+photo.sourceArt,scaleMultiplier:1.15}};
    });
    // ICON is a regular streamer card. Fifth slot is an existing approved card;
    // this visual-only payload never becomes a saved deck or a mercenary slot.
    const deck=[...cards,targets[4]];window.cnineCardCatalog=()=>[...deck,...targets];
    const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:targets}},result:{timeline:[]}}};
    const api=window.ProjectVPixiBattle;
    api.mountForBattle=async(value,host)=>{engine=await mountForBattle(value,host);return engine};
    try{
      const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'아이콘 리소스 검수',opponentName:'승인 카드 모의 표적',autoText:'공용 V3 전장 준비 중'});
      renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'아이콘 리소스 검수'});
      prepared.phase.textContent='ICON · SD / 스킬 시연';
    }finally{api.mountForBattle=mountForBattle}
    await engine.deployCards({instant:true,force:true});
    engine.updateStatus('시각 검수 전용 · 계정·전투 결과 변경 없음');
    document.querySelector('.battle-v3-header strong').textContent='ICON 리소스 검수';
    displayCharacters.forEach((c,index)=>engine.allies[index].fullBodySprite.anchor.set(c.footAnchor.x,c.footAnchor.y));
    decorateIconDock();
    $('play').onclick=()=>fx?.playing?fx.pause():fx?.play();$('restart').onclick=()=>{fx?.seek(0);fx?.play()};
    $('impact').onclick=()=>fx?.seek(fx.effect.contactAt);$('cancel').onclick=()=>fx?.cancel();
    $('scrub').oninput=()=>fx?.seek(Number($('scrub').value));$('speed').onchange=()=>fx?.setSpeed(Number($('speed').value));
    engine.app.renderer.on('resize',resize);window.addEventListener('pagehide',dispose,{once:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)fx?.cancel()});
    engine.app.canvas.addEventListener('webglcontextlost',()=>{fx?.cancel();enabled(false);$('health').textContent='WebGL 연결이 중단되었습니다. 새로고침해 주세요.'});
    await configure();
  }catch(error){enabled(false);$('health').classList.add('error');$('health').textContent='전투 준비 실패: '+error.message;console.error('[ICON Preview]',error)}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
