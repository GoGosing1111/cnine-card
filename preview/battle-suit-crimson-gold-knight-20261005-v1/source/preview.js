import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {loadKnightAssets,KnightFX} from './KnightFX.js';
import {MODES} from '../motion.mjs';
import {APPEARANCE_OPTIONS,AURA_PALETTES,DEFAULT_AURA_PALETTE,resolveAuraPaletteId} from './appearance-options.js';
const doc=parent.document,$=id=>doc.getElementById(id),ROOT='/preview/battle-suit-crimson-gold-knight-20261005-v1/';
let engine,fx,checkReport,recording=false;
const spec=()=>MODES[fx.mode];
function choosePalette(value,remember=true){
 const id=resolveAuraPaletteId(value);fx.setAuraPalette(id);$('palette').value=id;
 if(remember)try{parent.localStorage.setItem(APPEARANCE_OPTIONS.selection.previewStorageKey,id);}catch{}
}
function storedPalette(){try{return resolveAuraPaletteId(parent.localStorage.getItem(APPEARANCE_OPTIONS.selection.previewStorageKey));}catch{return DEFAULT_AURA_PALETTE;}}
function update(f){
 if(f!==fx)return;
 $('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('frame').textContent=String(f.state.frame+1).padStart(2,'0')+' / '+spec().poses.length;
 $('seek').max=spec().duration;$('seekNumber').max=spec().duration;$('seek').value=f.time;
 if(doc.activeElement!==$('seekNumber'))$('seekNumber').value=f.time.toFixed(3);
 $('time').textContent=f.time.toFixed(2)+' / '+spec().duration.toFixed(2)+' s';$('health').textContent=JSON.stringify(f.diagnostics(),null,2);
 if(!recording)$('status').textContent=(f.matteEnabled?'차분한 금빛 갑주':'원본 반사광')+' · '+(f.aura.enabled?f.aura.diagnostics().label:'주변광 OFF');
 for(const b of doc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.mode));
}
function gallery(){
 const standing=fx.mode==='look'||fx.mode==='idle';
 $('frames').innerHTML=spec().poses.map((p,i)=>'<button class="frame-card" data-frame="'+i+'"><img loading="lazy" src="'+(standing?'assets/sources/knight-approved-20261005.png':'assets/thumbs/'+p.bank+'-'+String(p.index+1).padStart(2,'0')+'.png')+'" alt="'+(standing?'서 있는 원본 자세':(i+1)+'번 동작')+'"><span>'+p.at.toFixed(2)+'s</span></button>').join('');
 for(const b of doc.querySelectorAll('[data-frame]'))b.onclick=()=>fx.seek(spec().poses[Number(b.dataset.frame)].at);
}
function select(mode,play=true){fx.setMode(mode);gallery();update(fx);if(play)fx.play();}
let downloadURL;
function save(blob,name){if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=URL.createObjectURL(blob);const a=$('download');a.href=downloadURL;a.download=name;a.textContent=name+' 받기';a.hidden=false;a.click();}
async function record(all=false){
 if(recording)return;recording=true;const canvas=engine.app.canvas,modes=all?Object.keys(MODES):[fx.mode],oldMode=fx.mode,oldSpeed=fx.speed;
 const stream=canvas.captureStream(60),chunks=[],type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t)),rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:8000000});
 const done=new Promise(resolve=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});
 try{
  fx.setSpeed(1);rec.start();
  for(const mode of modes){select(mode,false);fx.play();$('status').textContent='녹화 중 · '+MODES[mode].label;await new Promise(resolve=>setTimeout(resolve,(MODES[mode].duration+.2)*1000));}
  rec.stop();save(await done,'knight-'+(all?'all':oldMode)+'-'+innerWidth+'w.webm');
 }finally{stream.getTracks().forEach(t=>t.stop());fx.setSpeed(oldSpeed);select(oldMode,false);recording=false;$('status').textContent='영상 저장 완료';}
}
function checks(){
 const mode=fx.mode,time=fx.time,results=[];
 for(const key of Object.keys(MODES)){
  select(key,false);
  if(key==='idle'){
   const snapshots=[0,.6,1.2,1.8,2.4].map(t=>{fx.seek(t);const u=fx.unit,b=u.bodySprite;return {time:t,sourceMatches:b.texture===fx.assets.idle,transform:[u.root.x,u.root.y,u.view.x,u.view.y,u.view.scale.x,u.view.scale.y,b.x,b.y,b.scale.x,b.scale.y,b.rotation,b.anchor.x,b.anchor.y]};});
   results.push({mode:key,check:'standing source and body transform stay fixed across the whole idle loop',snapshots,pass:snapshots.every(s=>s.sourceMatches&&s.transform.every((v,i)=>Math.abs(v-snapshots[0].transform[i])<.000001))});
  }
  for(const at of MODES[key].contacts){fx.seek(at);const d=fx.diagnostics();results.push({mode:key,time:at,contactCount:d.contactCount,groundError:d.groundError,bladeIntersects:key==='aoe'?null:d.bladeContact.intersects,pass:d.groundError<.001&&(key==='aoe'||d.bladeContact.intersects)});}
  for(const at of [0,MODES[key].duration/2,MODES[key].duration]){fx.seek(at);const d=fx.diagnostics();results.push({mode:key,time:at,check:'finite grounded sample and pose-following aura',pass:Number.isFinite(d.groundError)&&d.groundError<.001&&d.aura.poseMatched&&d.aura.independentClock===false});}
  fx.play();fx.pause();const held=fx.time;fx.seek(held);fx.cancel();const d=fx.diagnostics();results.push({mode:key,check:'cancel cleanup',pass:d.visibleEffects===0&&d.visibleGhosts===0&&d.registeredTimelines===0&&d.time===0});
 }
 results.push({check:'five visible distinct native enemies',pass:engine.enemies.filter(t=>t.battleActive&&t.root.visible&&t.root.alpha>0).length===5&&new Set(engine.enemies.map(t=>t.root.baseX+','+t.root.baseY)).size===5});
 checkReport={at:new Date().toISOString(),viewport:{width:innerWidth,height:innerHeight},canvas:{width:engine.app.canvas.width,height:engine.app.canvas.height},passed:results.every(r=>r.pass),results};$('checks').textContent=JSON.stringify(checkReport,null,2);select(mode,false);fx.seek(time);return checkReport;
}
async function boot(){
 const [manifest,fixtures]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/z-body-thunder-v3/fixtures.json').then(r=>r.json())]);
 const payload=structuredClone(fixtures.multi);delete payload.monster;payload.wideGridPreview={scenario:'PVE'};window.cnineCardCatalog=()=>payload.cards;
 // Use this review's body directly so the borrowed encounter does not load Z-BODY's unrelated motion/FX pack.
 payload.equippedBattleSuit={code:'PREVIEW_CRIMSON_GOLD_KNIGHT',name:APPEARANCE_OPTIONS.displayName,battleSprite:ROOT+manifest.sourceArt,appearance:{battleSprite:ROOT+manifest.sourceArt,battleHeight:278}};
 payload.equippedWeapon=null;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 // The shared first-frame watchdog needs animation frames; background tabs do not receive them.
 if(document.hidden){
  $('status').textContent='화면을 열면 전장을 준비합니다';
  await new Promise(resolve=>{const visible=()=>{if(document.hidden)return;document.removeEventListener('visibilitychange',visible);resolve();};document.addEventListener('visibilitychange',visible);});
 }
 $('status').textContent='전장과 동작 리소스를 준비하고 있습니다';
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:APPEARANCE_OPTIONS.displayName,opponentName:'백호멸진'});
  prepared.stage.querySelector('.battle-v3-canvas-host').style.backgroundImage='none';
  await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:APPEARANCE_OPTIONS.displayName});
 }finally{api.mountForBattle=mount;}
 if(!engine)throw Error('현재 V3 엔진 연결을 확인해 주세요.');
 engine.audio?.destroy?.();engine.battlefieldAsset=()=>'/assets/ui/project-v/battlefields/v3-nightmare-forest-battlefield-v1.png';await engine.setBattlePayload(payload);await engine.deployCards({instant:true,force:true});engine.accountBattleUnitIsPaused=()=>true;if(engine.bottomShade)engine.bottomShade.visible=false;
 const unit=engine.accountBattleUnit;if(!unit||engine.enemies.length<2)throw Error('V3 다중 전장 미준비');
 const assets=await loadKnightAssets(manifest);fx=new KnightFX(engine,unit,engine.enemies,assets,manifest,update);
 $('palette').replaceChildren(...APPEARANCE_OPTIONS.paletteOrder.map(id=>{const option=doc.createElement('option');option.value=id;option.textContent=AURA_PALETTES[id].label+(id===DEFAULT_AURA_PALETTE?' (기본)':'');return option;}));
 select('look',true);choosePalette(storedPalette(),false);
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();
 $('seek').oninput=()=>fx.seek(Number($('seek').value));$('seekNumber').oninput=()=>fx.seek(Number($('seekNumber').value));
 $('speed').onchange=()=>fx.setSpeed(Number($('speed').value));$('effects').onchange=()=>{fx.setEffects($('effects').checked);fx.render(fx.time);};
 $('zoom').onchange=()=>{fx.zoom=$('zoom').checked;fx.render(fx.time);};
 $('matte').onchange=()=>fx.setMatte($('matte').checked);$('aura').onchange=()=>fx.setAura($('aura').checked);$('palette').onchange=()=>choosePalette($('palette').value);$('paletteReset').onclick=()=>choosePalette(DEFAULT_AURA_PALETTE);
 $('contact').onclick=()=>fx.seek(spec().contacts.find(t=>t>fx.time+.005)??spec().contacts[0]??.6);
 for(const b of doc.querySelectorAll('[data-mode]'))b.onclick=()=>select(b.dataset.mode);
 $('capture').onclick=()=>{engine.app.render();engine.app.canvas.toBlob(blob=>save(blob,'knight-'+fx.mode+'-'+fx.aura.palette+'-'+(fx.matteEnabled?'satin':'original')+'-'+fx.time.toFixed(2)+'.png'));};
 $('record').onclick=()=>record();$('recordAll').onclick=()=>record(true);$('runChecks').onclick=checks;$('saveChecks').onclick=()=>save(new Blob([JSON.stringify(checkReport??checks(),null,2)],{type:'application/json'}),'knight-runtime-qa-'+innerWidth+'w.json');
 for(const b of doc.querySelectorAll('button,select,input'))b.disabled=false;
 update(fx);
 let disposed=false;const review={engine,fx,manifest,select,checks,dispose(){if(disposed)return;disposed=true;fx.destroy();engine.destroy();if(downloadURL)URL.revokeObjectURL(downloadURL);}};window.KnightPreview=review;
 engine.app.renderer.on('resize',()=>{if(disposed)return;fx.pause();fx.capture();fx.render(fx.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!recording)fx.cancel();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(e=>{$('status').textContent='준비 실패: '+e.message;$('health').textContent=e.stack;console.error(e);});
