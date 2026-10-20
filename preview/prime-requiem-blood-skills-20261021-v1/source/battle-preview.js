import {mountForBattle,destroy as destroyEngine} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {Assets,NineSliceSprite} from 'pixi.js';
import {BattleCharacter,TEAM} from '../../project-v-v3/source/battle/BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {PrimeRequiemFX,loadPrimeAssets} from './PrimeRequiemFX.js';
import {SKILLS} from './SkillPlan.mjs';
const ROOT='/preview/prime-requiem-blood-skills-20261021-v1/',doc=window.parent.document,$=id=>doc.getElementById(id);
const IDS=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const get=async url=>{const r=await fetch(url);if(!r.ok)throw Error(url+' '+r.status);return r.json();};
let engine,renderer,actor,fx,manifest,disposed=false,sequence=false,queued=false;
const sequences={base:SKILLS.filter(s=>!s.showcase),showcase:SKILLS.filter(s=>s.showcase)};
function update(instance){
  if(!instance||disposed)return;
  $('play').textContent=instance.playing?'일시정지':'재생';$('scrub').max=instance.plan.duration;$('scrub').value=instance.time;
  $('time').textContent=instance.time.toFixed(2)+' / '+instance.plan.duration.toFixed(2)+'초';$('cue').textContent=instance.state.phase;
  $('speed').value=String(instance.speed);
  $('sequence').setAttribute('aria-pressed',String(sequence==='base'));
  $('showcase-sequence').setAttribute('aria-pressed',String(sequence==='showcase'));
  $('idle-view').setAttribute('aria-pressed',String(instance.mode==='ambient'));
  if(sequence&&instance.state.done&&!queued){
    queued=true;queueMicrotask(()=>{queued=false;if(disposed||!sequence)return;const list=sequences[sequence],index=list.findIndex(s=>s.id===fx.plan.id);
      if(index===list.length-1){sequence=false;update(fx);}else select(list[index+1].id,true,false);
    });
  }
}
function select(id,play=false,stopSequence=true){
  if(!fx||disposed)return;if(stopSequence)sequence=false;
  fx.select(id);window.parent.PrimeSelectLabel?.(id);document.getElementById('pvBattleStatus').textContent=fx.plan.name+' · '+fx.plan.type;
  if(play)fx.play();
}
function skinHud(unit,texture){
  unit.namePlate.visible=false;unit.hpShell.visible=false;unit.stateHalo.visible=false;
  const skin=new NineSliceSprite({texture,leftWidth:170,rightWidth:170,topHeight:170,bottomHeight:170,width:220,height:64});
  skin.label='PrimeRequiemGeneratedHUD';unit.hud.addChildAt(skin,0);
}
function resize(){
  if(!fx||disposed)return;
  const resumeIdle=fx.mode==='ambient'&&!fx.timeline.paused(),idleTime=fx.clock.time;
  fx.pause();engine.setFormationMercenaries([actor]);fx.captureFormation();
  fx.render(fx.time,resumeIdle?idleTime:fx.time);engine.isoFloorLayer.visible=false;
  if(resumeIdle)fx.timeline.resume();
}
function dispose(){
  if(disposed)return;sequence=false;disposed=true;engine?.app.renderer.off('resize',resize);fx?.destroy();
  for(const c of engine?.characters||[]){c.animationAdapter?.destroy?.();if(c.animationController!==c.animationAdapter)c.animationController?.destroy?.();}
  if(engine)engine.formationMercenaries=[];actor?.destroy();renderer?.destroy();destroyEngine();
  if(manifest)void Promise.allSettled([...Object.values(manifest.sheets).map(s=>ROOT+s.path),ROOT+manifest.battleSprite.path,ROOT+manifest.sourceArt.path,ROOT+'assets/ui-blood-forged-frame.png',ROOT+'assets/blood-sanctum.png'].map(p=>Assets.unload(p)));
}
async function boot(){
  try{
    const [m,catalogs]=await Promise.all([get(ROOT+'manifest.json'),Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p)))]);
    manifest=m;const entries=catalogs.flatMap(c=>c.characters.map(x=>({...x,grade:c.rarity})));
    const deck=IDS.map((id,i)=>{const c=entries.find(x=>x.cardId===id);if(!c)throw Error('기준 카드 누락');return {...c,id,cardId:id,name:c.member,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
    window.cnineCardCatalog=()=>deck;
    const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:deck}},result:{timeline:[]}}};
    const api=window.ProjectVPixiBattle;api.mountForBattle=async(data,host)=>{engine=await mountForBattle(data,host);return engine;};
    const modal=document.getElementById('lab-modal'),prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'PVP',playerName:'프라임 레퀴엠',opponentName:'전투 시연',autoText:'핏빛 성역을 여는 중'});
    try{renderer=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'PVP',playerName:'프라임 레퀴엠'});}finally{api.mountForBattle=mountForBattle;}
    await engine.deployCards({instant:true,force:true});
    // Render at two physical pixels per CSS pixel even on DPR-1 preview displays.
    // The source art stays unblurred; only the separate red silhouette is blurred.
    engine.app.renderer.resize(engine.app.screen.width,engine.app.screen.height,2);
    // V-999 is a local adapter key only. It is never saved in the game roster or database.
    const entry={code:'V-999',name:manifest.character.name,sourceArt:ROOT+manifest.sourceArt.path,battleSprite:ROOT+manifest.battleSprite.path,battleSpriteSha256:manifest.battleSprite.sha256,battleSpriteFootAnchor:manifest.battleSprite.footAnchor};
    const adapter=createMercenaryBattleArtAdapter({format:'PROJECT_V_MERCENARY_SYSTEM_ROSTER_V1',summary:{battleSpriteReady:1,battleSpritePending:0},cards:[entry]});
    const art=adapter.resolveForConsumer('BATTLE_FIELD','V-999');
    const [body,portrait,assets,backdrop,panel]=await Promise.all([Assets.load(art.spriteUrl),Assets.load(ROOT+manifest.sourceArt.path),loadPrimeAssets(manifest,ROOT),Assets.load(ROOT+'assets/blood-sanctum.png'),Assets.load(ROOT+'assets/ui-blood-forged-frame.png')]);
    engine.activeBattlefieldTexture=backdrop;engine.parallaxLayers.forEach(p=>p.sprite.texture=backdrop);engine.layoutParallax(engine.scene.width,engine.scene.height);
    engine.motes?.forEach(s=>s.visible=false);engine.isoFloorLayer.visible=false;
    if(engine.uiLayer.statusPanel)engine.uiLayer.statusPanel.visible=false;if(engine.uiLayer.status)engine.uiLayer.status.visible=false;
    actor=new BattleCharacter({id:'PRIME_REQUIEM_PREVIEW_ONLY',name:'프라임 레퀴엠',team:TEAM.ALLY,fullBodyTexture:body,cutInTexture:portrait,fullBodyHeight:410,accent:0xe74965});
    actor.art={bodyHeight:410};actor.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);
    engine.combatLayer.addChild(actor.root);engine.setFormationMercenaries([actor]);actor.root.alpha=1;actor.root.visible=true;actor.hud.y=-475;engine.isoFloorLayer.visible=false;
    for(const c of [...engine.characters,actor])skinHud(c,panel);
    const targets=engine.enemies.slice().sort((a,b)=>Math.abs(a.baseY-actor.baseY)-Math.abs(b.baseY-actor.baseY));
    fx=new PrimeRequiemFX(engine,actor,targets,assets,manifest,update);
    doc.querySelectorAll('[data-skill],.playback button,.playback select,#scrub').forEach(e=>e.disabled=false);
    $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{sequence=false;fx.seek(0);fx.play();};
    $('cancel').onclick=()=>{sequence=false;fx.cancel();};$('impact').onclick=()=>{sequence=false;fx.seek(fx.plan.contacts.at(-1)+.035);};
    $('idle-view').onclick=()=>select(fx.plan.id,false);
    $('scrub').oninput=()=>{sequence=false;fx.seek(Number($('scrub').value));};$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
    for(const [id,group]of [['sequence','base'],['showcase-sequence','showcase']]){
      $(id).onclick=()=>{sequence=sequence===group?false:group;if(sequence)select(sequences[group][0].id,true,false);else fx.pause();update(fx);};
    }
    document.querySelector('.battle-v3-header small').textContent='BLOOD SANCTUM';
    document.querySelector('.battle-v3-header strong').textContent='프라임 레퀴엠';prepared.phase.textContent='SSS LIMITED';
    $('health').textContent='정자세: 깨진 적월 · 검은 살기 · 진홍 네온의 느린 맥동. 대기 감상으로 돌아오면 상시 오라를 볼 수 있습니다. 공격 기본 2배속.';
    const review={engine,actor,fx,manifest,select,dispose,diagnostics:()=>({...fx.diagnostics(),disposed,sequence})};
    window.PrimePreview=review;window.parent.PrimePreview=review;engine.app.renderer.on('resize',resize);
    select(SKILLS[0].id,false);window.parent.dispatchEvent(new CustomEvent('prime-preview-ready'));
    window.addEventListener('pagehide',dispose,{once:true});
    let resumeIdleOnVisible=false;
    document.addEventListener('visibilitychange',()=>{
      if(disposed)return;
      if(document.hidden){resumeIdleOnVisible=fx.mode==='ambient'&&!fx.timeline.paused();sequence=false;fx.pause();}
      else if(resumeIdleOnVisible&&fx.mode==='ambient'){resumeIdleOnVisible=false;fx.timeline.resume();}
    });
    engine.app.canvas.addEventListener('webglcontextlost',()=>{sequence=false;fx.cancel();$('health').textContent='그래픽 연결이 끊어졌습니다. 새로고침해 주세요.';});
  }catch(error){$('health').textContent='전장 준비 실패: '+error.message;console.error('[PrimeRequiem]',error);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
