import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {loadKnightAssets,KnightFX} from './KnightFX.js';
import {MODES} from '../motion.mjs';
const doc=parent.document,$=id=>doc.getElementById(id),ROOT='/preview/mercenary-cyan-knight-battle-20261020-v1/';let engine,fx;
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('time').textContent=f.time.toFixed(2)+' / '+MODES[f.mode].duration.toFixed(2)+' s';$('seek').max=MODES[f.mode].duration;$('seek').value=f.time;$('frame').textContent=String(f.state.frame+1).padStart(2,'0')+' / '+MODES[f.mode].poses.length;
 $('health').textContent=JSON.stringify(f.diagnostics(),null,2);
 for(const b of doc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.mode));
}
function gallery(mode){$('frames').innerHTML=MODES[mode].poses.map((p,i)=>'<button class="frame-card" data-frame="'+i+'"><img loading="lazy" src="assets/thumbs/'+p.bank+'-'+String(p.index+1).padStart(2,'0')+'.png" alt="'+(i+1)+'번 동작"'+(p.facing<0?' style="transform:scaleX(-1)"':'')+'><span>'+p.at.toFixed(2)+'s</span></button>').join('');for(const b of doc.querySelectorAll('[data-frame]'))b.onclick=()=>fx.seek(MODES[mode].steps[Number(b.dataset.frame)]);}
async function boot(){
 const [manifest,payload]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/z-body-live-v1/fixture.json').then(r=>r.json())]);window.cnineCardCatalog=()=>payload.cards;
 // Reuse the real V3 hunt target and card formation; this page only previews choreography.
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:manifest.displayName+' 연출 검수',opponentName:payload.monster.name});await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:manifest.displayName});}finally{api.mountForBattle=mount;}
 await engine.deployCards({instant:true,force:true});engine.audio?.stop?.();engine.accountBattleUnitIsPaused=()=>true;document.getElementById('pvBattleStatus').style.display='none';
 const unit=engine.accountBattleUnit,targets=engine.enemies.filter(e=>e.battleActive!==false&&e.root.visible);if(!unit||!targets.length)throw Error('공용 V3 유닛이 준비되지 않았습니다.');
 const assets=await loadKnightAssets(manifest);fx=new KnightFX(engine,unit,targets,assets,manifest,update);
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();$('seek').oninput=()=>fx.seek(Number($('seek').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
 $('contact').onclick=()=>{const hits=MODES[fx.mode].contacts;fx.seek(hits.find(t=>t>fx.time+.005)??hits[0]??.4);};$('zoom').onclick=()=>{fx.zoom=!fx.zoom;$('zoom').setAttribute('aria-pressed',String(fx.zoom));fx.render(fx.time);};
 $('effects').onchange=()=>fx.setEffects($('effects').checked);
 for(const b of doc.querySelectorAll('[data-mode]'))b.onclick=()=>{fx.setMode(b.dataset.mode);gallery(fx.mode);fx.play();};
 for(const b of doc.querySelectorAll('button,select,input'))b.disabled=false;
 $('status').textContent='일반 기술 3개 · 광역기 2개 준비됨';gallery('array');fx.seek(.55);
 const review={fx,engine,manifest,modes:MODES,diagnostics:()=>fx.diagnostics(),dispose:()=>{fx.destroy();engine.destroy();}};window.CyanKnightPreview=review;parent.CyanKnightPreview=review;
 engine.app.renderer.on('resize',()=>{fx.pause();fx.capture();fx.render(fx.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(error=>{$('status').textContent='준비 실패: '+error.message;$('health').textContent=error.stack;console.error(error);});
