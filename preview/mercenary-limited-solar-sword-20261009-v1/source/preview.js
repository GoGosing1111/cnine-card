import '../../project-v-v3/source/project-v-pixi-battle.src.js';
import {loadSolarAssets,SolarFX} from './SolarFX.js';
import {MODES} from '../motion.mjs';
const ROOT='/preview/mercenary-limited-solar-sword-20261009-v1/',doc=parent.document,$=id=>doc.getElementById(id);let fx,engine,playlist=false;
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';$('phase').textContent=f.state.phase;$('time').textContent=f.time.toFixed(2)+' / '+MODES[f.mode].duration.toFixed(2)+'초';$('seek').max=MODES[f.mode].duration;$('seek').value=f.time;
 $('health').textContent=JSON.stringify(f.diagnostics(),null,2);for(const b of doc.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===f.mode));
}
async function boot(){
 localStorage.setItem('cnine_battle_sound','OFF');
 const [manifest,fixtures]=await Promise.all([fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/z-body-thunder-v3/fixtures.json').then(r=>r.json())]);
 const payload=structuredClone(fixtures.multi);delete payload.monster;payload.wideGridPreview={scenario:'PVE'};
 payload.battleV2.teams.B.cards=payload.battleV2.teams.B.cards.slice(0,5).map((card,i)=>({...card,cardId:'SOLAR_VISUAL_REVIEW:'+i,grade:'PREVIEW',projectVMonsterArt:{kind:'SOLAR_REVIEW',primaryUrl:payload.continuousEncounter.instances.find(r=>r.id===card.id)?.battleSprite,name:card.name||card.title,scaleMultiplier:1}}));
 payload.equippedBattleSuit={code:'PREVIEW_SOLAR_SWORD',name:'태양검 군주',battleSprite:ROOT+manifest.motion.idle.frames[0].file,appearance:{battleSprite:ROOT+manifest.motion.idle.frames[0].file,battleHeight:333.70859375}};payload.equippedWeapon=null;window.cnineCardCatalog=()=>payload.cards;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'태양검 군주',opponentName:'태양검 · 전투 연출'});await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:'태양검 군주'});}finally{api.mountForBattle=mount;}
 engine.audio?.destroy?.();engine.battlefieldAsset=()=>'/assets/ui/project-v/battlefields/v3-nightmare-forest-battlefield-v1.png';await engine.setBattlePayload(payload);await engine.deployCards({instant:true,force:true});engine.accountBattleUnitIsPaused=()=>true;if(engine.bottomShade)engine.bottomShade.visible=false;
 const unit=engine.accountBattleUnit,targets=engine.enemies.filter(t=>t.battleActive&&t.root.visible&&t.root.alpha>0);if(!unit||targets.length!==5)throw Error('V3 전장 준비 실패');unit.setName('태양검 군주');const stageStatus=document.querySelector('.battle-v3-status');if(stageStatus)stageStatus.textContent='태양검 군주 · 전투 연출 시연';
 fx=new SolarFX(engine,unit,targets,await loadSolarAssets(manifest),manifest,update);
 const order=['aura','dash','attack','skill','ultimate'];
 fx.onComplete=()=>{if(!playlist)return;const next=order[order.indexOf(fx.mode)+1];if(next){fx.setMode(next);fx.play();}else{playlist=false;$('showcase').setAttribute('aria-pressed','false');}};
 $('showcase').onclick=()=>{playlist=true;$('showcase').setAttribute('aria-pressed','true');fx.setMode('aura');fx.seek(4.3);fx.play();};
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();$('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>{playlist=false;$('showcase').setAttribute('aria-pressed','false');fx.cancel();};
 $('seek').oninput=()=>{playlist=false;fx.seek(Number($('seek').value));};$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));$('effects').onchange=()=>fx.setEffects($('effects').checked);
 $('contact').onclick=()=>fx.seek(MODES[fx.mode].contacts.find(t=>t>fx.time+.01)??MODES[fx.mode].contacts[0]??.5);
 for(const b of doc.querySelectorAll('[data-mode]'))b.onclick=()=>{playlist=false;fx.setMode(b.dataset.mode);fx.play();};
 for(const el of doc.querySelectorAll('button,select,input'))el.disabled=false;
 $('status').textContent='SSS 리미티드 · 원화 확정 / 전투 연출 시안';$('resource-count').textContent=manifest.summary.activeBodyFrames+'개 동작 · '+manifest.summary.activeEffectFrames+'개 이펙트 프레임';fx.seek(.6);
 let disposed=false;const review={fx,engine,manifest,diagnostics:()=>fx.diagnostics(),dispose(){if(disposed)return;disposed=true;playlist=false;fx.destroy();engine.destroy();}};window.SolarPreview=parent.SolarPreview=review;
 engine.app.renderer.on('resize',()=>{if(disposed)return;fx.pause();fx.capture();fx.render(fx.time);});window.addEventListener('pagehide',()=>review.dispose(),{once:true});document.addEventListener('visibilitychange',()=>{if(document.hidden){playlist=false;fx.cancel();}});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{if(disposed)return;fx.cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(e=>{$('status').textContent='준비 실패: '+e.message;$('health').textContent=e.stack;console.error(e);});
