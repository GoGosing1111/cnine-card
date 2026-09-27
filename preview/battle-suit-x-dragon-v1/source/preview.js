import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {loadXAssets,XBodyFX} from '../../battle-suit-x-v1/source/XBodyFX.js';
import {MODES} from '../../battle-suit-x-v1/motion.mjs';
import {loadDragonAssets,DragonFX} from './DragonFX.js';
import {DURATION,CONTACTS,POSES} from '../motion.mjs';
const doc=parent.document,$=id=>doc.getElementById(id),ROOT='/preview/battle-suit-x-dragon-v1/';let engine,fx,oldFX,dragon;
const spec=f=>f.mode==='dragon'?{duration:DURATION,poses:POSES,contacts:CONTACTS}:MODES[f.mode];
function update(f){
 if(f!==fx)return;const s=spec(f);
 $('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('time').textContent=f.time.toFixed(2)+' / '+s.duration.toFixed(2)+' s';
 $('seek').max=s.duration;$('seek').value=f.time;$('frame').textContent=String(f.state.frame+1).padStart(2,'0')+' / '+s.poses.length;
 $('health').textContent=JSON.stringify(f.diagnostics(),null,2);
 for(const b of doc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.mode));
}
function gallery(){
 $('frames').innerHTML=spec(fx).poses.map((p,i)=>'<button class="frame-card" data-frame="'+i+'"><img loading="lazy" src="'+(p.bank==='dragon'?'assets/':'/preview/battle-suit-x-v1/assets/')+'thumbs/'+p.bank+'-'+String(p.index+1).padStart(2,'0')+'.png" alt="'+(i+1)+'번 동작"'+(p.facing<0?' style="transform:scaleX(-1)"':'')+'><span>'+p.at.toFixed(2)+'s</span></button>').join('');
 for(const b of doc.querySelectorAll('[data-frame]'))b.onclick=()=>fx.seek(spec(fx).poses[Number(b.dataset.frame)].at);
}
function select(mode,play=true){
 fx?.cancel();engine.camera.reset(true);engine.enemies.forEach(t=>t.view.position.set(0,0));
 if(mode==='dragon'){oldFX?.cancel();fx=dragon;fx.cancel();}
 else{dragon.cancel();fx=oldFX;fx.setMode(mode);}
 fx.setSpeed(Number($('speed').value));fx.setEffects($('effects').checked);
 gallery();fx.seek(0);if(play)fx.play();
}
async function boot(){
 const [manifest,baseManifest,fixtures]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/battle-suit-x-v1/manifest.json').then(r=>r.json()),fetch('/preview/z-body-thunder-v3/fixtures.json').then(r=>r.json())]);
 const payload=fixtures.multi;window.cnineCardCatalog=()=>payload.cards;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'X-BODY',opponentName:'광역기 검수'});
 prepared.stage.querySelector('.battle-v3-canvas-host').style.backgroundImage='none';
 await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:'X-BODY'});}
 finally{api.mountForBattle=mount;}
 await engine.setBattlePayload(payload);await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();engine.accountBattleUnitIsPaused=()=>true;
 const unit=engine.accountBattleUnit,targets=engine.enemies;if(!unit||targets.length<2)throw Error('공용 V3 다중 전장이 준비되지 않았습니다.');
 const oldAssets=await loadXAssets(baseManifest),assets=await loadDragonAssets(manifest,oldAssets);
 oldFX=new XBodyFX(engine,unit,targets[0],oldAssets,baseManifest,update);
 dragon=new DragonFX(engine,unit,targets,assets,manifest,baseManifest,update);fx=dragon;fx.seek(0);
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};
 $('cancel').onclick=()=>fx.cancel();$('seek').oninput=()=>fx.seek(Number($('seek').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
 $('contact').onclick=()=>{const hits=spec(fx).contacts;fx.seek(hits.find(t=>t>fx.time+.005)??hits[0]??.46);};
 $('zoom').onclick=()=>{fx.zoom=!fx.zoom;$('zoom').setAttribute('aria-pressed',String(fx.zoom));fx.render(fx.time);};
 $('effects').onchange=()=>fx.setEffects($('effects').checked);
 for(const b of doc.querySelectorAll('[data-mode]'))b.onclick=()=>select(b.dataset.mode);
 for(const b of doc.querySelectorAll('button,select,input'))b.disabled=false;
 $('status').textContent='천룡 강림 · 5개 대상 광역 연출';gallery();update(fx);
 let disposed=false;
 const review={get fx(){return fx;},engine,manifest,dragon,oldFX,select,diagnostics:()=>fx.diagnostics(),dispose:()=>{if(disposed)return;disposed=true;dragon.destroy();oldFX.destroy();engine.destroy();}};
 window.XBodyDragonPreview=review;parent.XBodyDragonPreview=review;
 engine.app.renderer.on('resize',()=>{fx.pause();oldFX.capture();dragon.capture();fx.render(fx.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(error=>{$('status').textContent='준비 실패: '+error.message;$('health').textContent=error.stack;console.error(error);});
