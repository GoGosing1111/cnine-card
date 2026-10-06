import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {loadSXAssets,SXBodyFX} from './SXBodyFX.js';
import {MODES} from '../motion.mjs';
const doc=parent.document,$=id=>doc.getElementById(id),ROOT='/preview/battle-suit-sx-v1/';let engine,fx;
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('time').textContent=f.time.toFixed(2)+' / '+MODES[f.mode].duration.toFixed(2)+' s';$('seek').max=MODES[f.mode].duration;$('seek').value=f.time;$('frame').textContent=String(f.state.frame+1).padStart(2,'0')+' / '+MODES[f.mode].poses.length;
 $('health').textContent=JSON.stringify(f.diagnostics(),null,2);
 for(const b of doc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.mode));
}
function gallery(mode){$('frames').innerHTML=MODES[mode].poses.map((p,i)=>'<button class="frame-card" data-frame="'+i+'"><img loading="lazy" src="assets/runtime/thumbs/'+p.bank+'-'+String(p.index+1).padStart(2,'0')+'.png" alt="'+(i+1)+'번 동작"'+(p.facing<0?' style="transform:scaleX(-1)"':'')+'><span>'+p.at.toFixed(2)+'s</span></button>').join('');for(const b of doc.querySelectorAll('[data-frame]'))b.onclick=()=>fx.seek(MODES[mode].steps[Number(b.dataset.frame)]);}
async function boot(){
 const font=new FontFace('SXTitleSerif','url('+ROOT+'assets/fonts/NotoSerifKR-blue-reaper-900.ttf)',{weight:'900'});await font.load();document.fonts.add(font);
 const [manifest,payload]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/z-body-live-v1/fixture.json').then(r=>r.json())]);window.cnineCardCatalog=()=>payload.cards;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'SX슈트 연출 검수',opponentName:payload.monster.name});await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:'SX슈트'});}finally{api.mountForBattle=mount;}
 await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();engine.accountBattleUnitIsPaused=()=>true;
 const unit=engine.accountBattleUnit,target=engine.enemies[0];if(!unit||!target)throw Error('공용 V3 지원 유닛이 준비되지 않았습니다.');
 const assets=await loadSXAssets(manifest);fx=new SXBodyFX(engine,unit,target,assets,manifest,update);
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();$('seek').oninput=()=>fx.seek(Number($('seek').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
 $('contact').onclick=()=>{const hits=MODES[fx.mode].contacts;fx.seek(hits.find(t=>t>fx.time+.005)??hits[0]??.46);};$('zoom').onclick=()=>{fx.zoom=!fx.zoom;$('zoom').setAttribute('aria-pressed',String(fx.zoom));fx.render(fx.time);};
 $('effects').onchange=()=>{fx.setEffects($('effects').checked);};
 for(const b of doc.querySelectorAll('[data-mode]'))b.onclick=()=>{fx.setMode(b.dataset.mode);gallery(fx.mode);fx.play();};
 for(const b of doc.querySelectorAll('button,select,input'))b.disabled=false;
 $('status').textContent='SX슈트 · 이동 잔상 · 검무 · 궁극기 검수';gallery('idle');fx.seek(0);
 const review={fx,engine,manifest,diagnostics:()=>fx.diagnostics(),dispose:()=>{fx.destroy();engine.destroy();}};window.SXBodyPreview=review;parent.SXBodyPreview=review;
 engine.app.renderer.on('resize',()=>{fx.pause();fx.capture();fx.render(fx.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(error=>{$('status').textContent='준비 실패: '+error.message;$('health').textContent=error.stack;console.error(error);});
