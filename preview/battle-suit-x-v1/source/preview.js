import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {loadXAssets,XBodyFX} from './XBodyFX.js';
import {MODES} from '../motion.mjs';
const doc=parent.document,$=id=>doc.getElementById(id),ROOT='/preview/battle-suit-x-v1/';let engine,fx;
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('time').textContent=f.time.toFixed(2)+' / '+MODES[f.mode].duration.toFixed(2)+' s';$('seek').max=MODES[f.mode].duration;$('seek').value=f.time;$('frame').textContent=String(f.state.frame+1).padStart(2,'0')+' / 08';
 $('health').textContent=JSON.stringify(f.diagnostics(),null,2);
 for(const b of doc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.mode));
}
function gallery(mode){$('frames').innerHTML=Array.from({length:8},(_,i)=>'<button class="frame-card" data-frame="'+i+'"><img loading="lazy" src="assets/thumbs/'+mode+'-'+String(i+1).padStart(2,'0')+'.png" alt="'+(i+1)+'번 동작"><span>'+String(i+1).padStart(2,'0')+'</span></button>').join('');for(const b of doc.querySelectorAll('[data-frame]'))b.onclick=()=>fx.seek(MODES[mode].steps[Number(b.dataset.frame)]);}
async function boot(){
 const [manifest,payload]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/z-body-live-v1/fixture.json').then(r=>r.json())]);window.cnineCardCatalog=()=>payload.cards;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'X-BODY 연출 검수',opponentName:payload.monster.name});await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:'X-BODY'});}finally{api.mountForBattle=mount;}
 await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();engine.accountBattleUnitIsPaused=()=>true;
 const unit=engine.accountBattleUnit,target=engine.enemies[0];if(!unit||!target)throw Error('공용 V3 지원 유닛이 준비되지 않았습니다.');
 const assets=await loadXAssets(manifest);fx=new XBodyFX(engine,unit,target,assets,manifest,update);
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();$('seek').oninput=()=>fx.seek(Number($('seek').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
 $('contact').onclick=()=>fx.seek(MODES[fx.mode].contact??.46);$('zoom').onclick=()=>{fx.zoom=!fx.zoom;$('zoom').setAttribute('aria-pressed',String(fx.zoom));fx.render(fx.time);};
 $('effects').onchange=()=>{fx.front.visible=$('effects').checked;};
 for(const b of doc.querySelectorAll('[data-mode]'))b.onclick=()=>{fx.setMode(b.dataset.mode);gallery(fx.mode);fx.play();};
 for(const b of doc.querySelectorAll('button,select,input'))b.disabled=false;
 $('status').textContent='검수 준비 완료';gallery('skill');fx.seek(.42);
 const review={fx,engine,manifest,diagnostics:()=>fx.diagnostics(),dispose:()=>{fx.destroy();engine.destroy();}};window.XBodyPreview=review;parent.XBodyPreview=review;
 engine.app.renderer.on('resize',()=>{fx.pause();fx.capture();fx.render(fx.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(error=>{$('status').textContent='준비 실패: '+error.message;$('health').textContent=error.stack;console.error(error);});
