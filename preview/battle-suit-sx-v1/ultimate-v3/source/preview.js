import '../../../project-v-v3/source/project-v-pixi-battle.src.js';
import {loadSXAssets} from '../../source/SXBodyFX.js';
import {SXUltimateFX,loadUltimateAssets} from './SXUltimateFX.js';
import {DURATION,POSES} from '../motion.mjs';
const ROOT='/preview/battle-suit-sx-v1/ultimate-v3/',doc=parent.document,$=id=>doc.getElementById(id);
let engine,fx;
function update(f){
 $('play').textContent=f.playing?'일시정지':'재생';
 $('phase').textContent=f.state.phase;$('time').textContent=f.time.toFixed(2)+' / '+DURATION.toFixed(2)+' s';
 $('seek').value=f.time;$('frame').textContent='광역 반응 '+(f.state.contactCount||0)+' / '+f.targets.length;
 $('health').textContent=JSON.stringify(f.diagnostics(),null,2);
}
async function boot(){
 const font=new FontFace('SXTitleSerif','url(/preview/battle-suit-sx-v1/assets/fonts/NotoSerifKR-blue-reaper-900.ttf)',{weight:'900'});
 await font.load();document.fonts.add(font);
 const [base,manifest,fixtures]=await Promise.all([
  fetch(ROOT+'../manifest.json').then(r=>r.json()),fetch(ROOT+'manifest.json').then(r=>r.json()),fetch('/preview/z-body-thunder-v3/fixtures.json').then(r=>r.json())
 ]);
 const payload=structuredClone(fixtures.multi);delete payload.monster;payload.wideGridPreview={scenario:'PVE'};
 // A visual-only five-actor formation: bypass the live one-monster hunt selection,
 // while retaining each real approved monster sprite, ID and native V3 actor.
 payload.battleV2.teams.B.cards=payload.battleV2.teams.B.cards.slice(0,5).map((card,index)=>({
  ...card,cardId:'SX_AOE_REVIEW:'+index,grade:'PREVIEW',
  projectVMonsterArt:{kind:'SX_ULTIMATE_REVIEW',primaryUrl:payload.continuousEncounter.instances.find(row=>row.id===card.id)?.battleSprite,name:card.name||card.title,scaleMultiplier:1}
 }));
 payload.equippedBattleSuit={code:'PREVIEW_SX_GROUNDSTRIKE',name:'SX슈트',battleSprite:'/preview/battle-suit-sx-v1/'+base.sourceArt,appearance:{battleSprite:'/preview/battle-suit-sx-v1/'+base.sourceArt,battleHeight:333.70859375}};
 payload.equippedWeapon=null;window.cnineCardCatalog=()=>payload.cards;
 await new Promise(r=>document.readyState==='complete'?r():window.addEventListener('load',r,{once:true}));
 const api=window.ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{engine=await mount(...args);return engine;};
 try{
  const prepared=window.ProjectVBattleV3Live.prepareLoading({modal:document.getElementById('modal'),mode:'HUNT',playerName:'SX슈트',opponentName:'창천멸진 · 광역기 검수'});
  await window.ProjectVBattleV3Live.createRenderer({...prepared,modal:document.getElementById('modal'),data:payload,mode:'HUNT',playerName:'SX슈트'});
 }finally{api.mountForBattle=mount;}
 engine.audio?.destroy?.();
 engine.battlefieldAsset=()=>'/assets/ui/project-v/battlefields/v3-nightmare-forest-battlefield-v1.png';
 await engine.setBattlePayload(payload);await engine.deployCards({instant:true,force:true});
 engine.accountBattleUnitIsPaused=()=>true;
 if(engine.bottomShade)engine.bottomShade.visible=false;
 const unit=engine.accountBattleUnit,targets=engine.enemies.filter(t=>t.battleActive&&t.root.visible&&t.root.alpha>0);
 if(!unit||targets.length!==5)throw Error('SX 광역 검수 전장 미준비: 지원 유닛 '+Boolean(unit)+', 대상 '+targets.length);
 const [assets,area]=await Promise.all([loadSXAssets(base),loadUltimateAssets(manifest)]);
 fx=new SXUltimateFX(engine,unit,targets,assets,base,area,manifest,update);
 $('play').onclick=()=>fx.playing?fx.pause():fx.play();
 $('restart').onclick=()=>{fx.seek(0);fx.play();};$('cancel').onclick=()=>fx.cancel();
 $('seek').oninput=()=>fx.seek(Number($('seek').value));$('speed').onchange=()=>fx.setSpeed(Number($('speed').value));
 $('effects').onchange=()=>fx.setEffects($('effects').checked);
 $('contact').onclick=()=>fx.seek([2.02,2.20,2.52,3.02].find(t=>t>fx.time+.005)??2.02);
 $('zoom').onclick=()=>{fx.zoom=!fx.zoom;$('zoom').setAttribute('aria-pressed',String(fx.zoom));fx.render(fx.time);};
 $('frames').innerHTML=POSES.map((p,i)=>'<button class="frame-card" data-frame="'+i+'"><img loading="lazy" src="../assets/runtime/thumbs/'+p.bank+'-'+String(p.index+1).padStart(2,'0')+'.png" alt="'+(i+1)+'번 전신 자세"><span>'+p.at.toFixed(2)+'s</span></button>').join('');
 for(const button of doc.querySelectorAll('[data-frame]'))button.onclick=()=>fx.seek(POSES[Number(button.dataset.frame)].at);
 for(const control of doc.querySelectorAll('button,select,input'))control.disabled=false;
 $('status').textContent='궁극기 재검수 · 창천멸진 · 적 진형 5개 대상';
 fx.seek(1.32);
 let disposed=false;
 const review={fx,engine,manifest,diagnostics:()=>fx.diagnostics(),dispose(){if(disposed)return;disposed=true;fx.destroy();engine.destroy();}};
 window.SXUltimatePreview=parent.SXUltimatePreview=review;
 engine.app.renderer.on('resize',()=>{if(disposed)return;fx.pause();fx.capture();fx.render(fx.time);});
 window.addEventListener('pagehide',()=>review.dispose(),{once:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)fx.cancel();});
 engine.app.canvas.addEventListener('webglcontextlost',()=>{fx.cancel();$('status').textContent='그래픽 연결이 끊겼습니다. 새로고침해 주세요.';});
}
boot().catch(error=>{$('status').textContent='준비 실패: '+error.message;$('health').textContent=error.stack;console.error(error);});
