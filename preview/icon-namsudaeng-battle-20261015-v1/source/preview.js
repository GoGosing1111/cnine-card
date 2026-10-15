import {Assets,Texture,Rectangle} from 'pixi.js';
import {mountForBattle} from '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {IconEffectPlayback,releaseIconSequence} from '../../icon-battle-assets-v1/source/IconEffectPlayback.js';
const ROOT='/preview/icon-namsudaeng-battle-20261015-v1/',doc=window.parent.document,$=id=>doc.getElementById(id)||document.getElementById(id);
let engine,renderer,fx,sequence,disposed=false,fxVisible=true,ready=false;
const controls=()=>doc.querySelectorAll('.controls button,.controls select,.scrubber input');
const get=async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error(`리소스를 불러오지 못했습니다 (${r.status})`);return r.json();};
const phase=t=>t===0?'대기':t<.31?'추출':t<.76?'이동':t<1?'귀속':'완료';
class CrownPlayback extends IconEffectPlayback{
 render(time){
  super.render(time);if(!this.sprites)return;
  const progress=this.sample.time/this.effect.duration,p=this.engine.effectLayer.toLocal(this.target.root.toGlobal({x:0,y:-this.target.fullBodyHeight*.54})),q=this.engine.effectLayer.toLocal(this.actor.root.toGlobal({x:0,y:-this.actor.fullBodyHeight*.54}));
  const raw=Math.max(0,Math.min(1,(progress-.31)/.45)),travel=raw*raw*(3-2*raw),arc=Math.sin(raw*Math.PI)*52;
  for(const sprite of this.sprites){sprite.position.set(p.x+(q.x-p.x)*travel,p.y+(q.y-p.y)*travel-arc);sprite.visible=this.sample.visible&&fxVisible;const size=320+(progress>.76?Math.sin((progress-.76)/.24*Math.PI)*65:0);sprite.width=size;sprite.height=size;}
 }
}
function publish(){const d={ready,releaseEnabled:false,cardId:null,techniqueCode:'CROWN_USURP',regularCards:engine?.allies.filter(a=>a.battleActive).length||0,mercenarySlotsUsed:0,canvases:document.querySelectorAll('canvas').length,fxVisible,...fx?.diagnostics()};window.__namsudaengDiagnostics=d;$('health').dataset.diagnostics=JSON.stringify(d);return d;}
function update(instance){$('play').textContent=instance.playing?'일시정지':'재생';$('scrub').max=instance.effect.duration;$('scrub').value=instance.time;$('time').textContent=`${instance.time.toFixed(2)} / ${instance.effect.duration.toFixed(2)}초`;$('cue').textContent=phase(instance.time/instance.effect.duration);for(const b of doc.querySelectorAll('[data-frame]'))b.classList.toggle('active',Number(b.dataset.frame)===instance.sample?.frame);publish();}
function dispose(){if(disposed)return;disposed=true;ready=false;controls().forEach(b=>b.disabled=true);fx?.destroy();fx=null;const prior=sequence;sequence=null;void releaseIconSequence(prior).catch(()=>{});renderer?.destroy();window.ProjectVPixiBattle?.destroy();publish();}
async function boot(){
 try{
  const manifest=await get(ROOT+'manifest.json');if(disposed)return;
  if(!manifest.character||!manifest.effect||manifest.status!=='BUILT_VISUAL_REVIEW_PENDING'){$('health').textContent='SD·왕관 찬탈 효과 생성 대기 중입니다. 준비가 끝난 뒤 새로고침하면 시연할 수 있습니다.';publish();return;}
  const catalogs=await Promise.all(['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].map(p=>get('/assets/ui/project-v/characters/'+p))),ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'],available=catalogs.flatMap(m=>m.characters.map(c=>({...c,grade:m.rarity})));
  if(disposed)return;
  const targets=ids.map(id=>{const c=available.find(c=>c.cardId===id);if(!c)throw Error('기존 시연 표적 카드 누락');return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,power_type:'ATTACK',hp:100,maxHp:100};});
  const sd=manifest.character,photo=ROOT+manifest.sourceArt.file,character={id:'PREVIEW:NAMSUDAENG',cardId:'PREVIEW:NAMSUDAENG',name:'남수댕',title:'왕관 찬탈',grade:'ICON',image:photo,sourceArt:photo,originalCardArt:photo,power_type:'ATTACK',hp:100,maxHp:100,previewOnly:true,releaseEnabled:false,projectVBattleArt:{kind:'ICON_PREVIEW_ONLY',primaryUrl:ROOT+sd.runtime,sourceArtUrl:photo,scaleMultiplier:1.15}};
  const deck=[character,...targets.slice(1)],enemies=targets.map((c,i)=>({...c,id:'PREVIEW:TARGET:'+i}));window.cnineCardCatalog=()=>[...deck,...enemies];
  const payload={previewOnly:true,mode:'PVP',battlefieldMode:'PVP',battleV2:{mode:'PVP',teams:{A:{cards:deck},B:{cards:enemies}},result:{timeline:[]}}};
  const api=window.ProjectVPixiBattle;api.mountForBattle=async(value,host)=>{engine=await mountForBattle(value,host);return engine;};
  try{const shell=window.ProjectVBattleV3Live.prepareLoading({modal:$('lab-modal'),mode:'PVP',playerName:'남수댕 · 왕관 찬탈',opponentName:'리소스 검수 표적',autoText:'공용 V3 전장 준비 중'});renderer=await window.ProjectVBattleV3Live.createRenderer({...shell,modal:$('lab-modal'),data:payload,mode:'PVP',playerName:'남수댕 · 왕관 찬탈'});}finally{api.mountForBattle=mountForBattle;}
  if(disposed){renderer?.destroy();window.ProjectVPixiBattle?.destroy();return;}
  await engine.deployCards({instant:true,force:true});if(disposed)return;engine.allies[0].fullBodySprite.anchor.set(sd.footAnchor.x,sd.footAnchor.y);engine.allies[0].captureNeutralAvatarPose();engine.updateStatus('리소스 검수 · 실제 계정 변화 없음');
  for(const card of document.querySelectorAll('.battle-v3-roster-frame.grade-ICON')){const img=document.createElement('img');img.className='icon-prepared-frame';img.src='/assets/ui/card-frames/icon-streamer-frame-v1.png';img.alt='';card.append(img);}
  await Promise.all(Array.from(document.querySelectorAll('img[data-v3-roster-art]')).map(async img=>{img.loading='eager';await img.decode().catch(()=>{});}));
  if(disposed)return;
  const url=ROOT+manifest.effect.runtime,texture=await Assets.load(url),e=manifest.effect;if(disposed){await Assets.unload(url);return;}sequence={url,frames:Array.from({length:e.frameCount},(_,i)=>new Texture({source:texture.source,frame:new Rectangle(i%4*e.cellSize,Math.floor(i/4)*e.cellSize,e.cellSize,e.cellSize)}))};
  fx=new CrownPlayback(engine,{actor:engine.allies[0],target:engine.enemies[0],effect:e,sequence},update);fx.setSpeed(Number($('speed').value));ready=true;controls().forEach(b=>b.disabled=false);
  $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('impact').onclick=()=>fx.seek(e.contactAt);$('cancel').onclick=()=>fx.cancel();$('scrub').oninput=()=>fx.seek(Number($('scrub').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));$('fx-toggle').onclick=()=>{fxVisible=!fxVisible;$('fx-toggle').setAttribute('aria-pressed',String(fxVisible));$('fx-toggle').textContent=fxVisible?'FX ON':'FX OFF';fx.render(fx.time);publish();};
  engine.app.renderer.on('resize',()=>{fx?.pause();fx?.render(fx.time);});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx?.cancel();});engine.app.canvas.addEventListener('webglcontextlost',()=>{fx?.cancel();controls().forEach(b=>b.disabled=true);$('health').textContent='WebGL 연결이 중단되었습니다. 새로고침해 주세요.';});
  $('health').textContent='추출 → 이동 → 귀속 · 실제 16프레임 · 정지 SD · 무음 시연';window.__namsudaengEngine=engine;publish();
 }catch(error){if(disposed)return;$('health').classList.add('error');$('health').textContent='준비 실패: '+error.message;console.error('[Namsudaeng preview]',error);}
}
window.NamsudaengPreview={seekFrame:i=>fx?.seek(Number(i)/15*fx.effect.duration),seek:t=>fx?.seek(t),play:()=>fx?.play(),pause:()=>fx?.pause(),cancel:()=>fx?.cancel(),diagnostics:publish,dispose};window.addEventListener('pagehide',dispose,{once:true});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
