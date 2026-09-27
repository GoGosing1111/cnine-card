import {STAGES,MATERIALS} from './model.mjs';
import {mountEnhancementFx} from './fx.mjs';
import {TROPHY_CATALOG} from '/js/player-card-model-v2052.js';

const $=selector=>document.querySelector(selector);
const profile={
 version:2052,
 player:{id:0,nickname:'별을걷는사람',title:{badgeText:'챌린저★★★★'},clan:{name:'AURORA',role:'클랜원'},avatar:{name:'테란여제 조은',image:'/assets/ui/avatars-v1/lobby-v1/avatar-f09-terran-empress-joeun-lobby-v1-640.webp'}},
 ranked:{season:'시즌 12',state:'RANKED',tier:{id:'challenger',name:'챌린저',color:'#79c8ef'},rank:3,score:3850,wins:124,losses:38,bestRank:1,completedSeasons:8,longestStreak:3,currentStreak:3,history:[{season:'시즌 11',tierId:'challenger',tier:'챌린저',rank:1,settledAt:'2026-09-01'},{season:'시즌 10',tierId:'challenger',tier:'챌린저',rank:6,settledAt:'2026-08-01'},{season:'시즌 9',tierId:'challenger',tier:'챌린저',rank:8,settledAt:'2026-07-01'}]},
 clanHistory:[{clan:'AURORA',season:3,settledAt:'2026-09-01'}],
 trophies:TROPHY_CATALOG.filter(t=>['CLAN_CHAMPION','CHALLENGER_STREAK_3','RANKED_CHAMPION'].includes(t.code)).map((t,i)=>({...t,owned:true,count:i?1:2,acquiredAt:'2026-09-01',progress:3,goal:3,effectEnabled:false})),
 frame:{name:'옵시디언',level:0,enhancement:{enabled:false}},effects:{enabled:false,modifiers:[]},historyLimit:12
};
let fx,sequencer=null,destroyed=false,selectedMaterial='crystal';
const controller=new AbortController(),listen=(node,event,handler)=>node.addEventListener(event,handler,{signal:controller.signal});

function stopSequence(){sequencer?.kill();sequencer=null;fx?.setSequence(false);$('#sequence').setAttribute('aria-pressed','false')}
function selectStage(index,manual=true){
 if(manual)stopSequence();
 const stage=STAGES[index],material=MATERIALS[selectedMaterial];
 $('.showcase').classList.toggle('is-ultimate',index===4);
 document.querySelectorAll('[data-material]').forEach(button=>{button.disabled=index===4});
 document.documentElement.style.setProperty('--accent',`#${material.color.toString(16).padStart(6,'0')}`);
 document.documentElement.style.setProperty('--accent-rgb',material.rgb.join(','));
 $('#tier-tag').textContent=index===4?'CELESTIAL RELIC':material.tag;$('#tier-number').textContent=`+${stage.level}`;$('#stage-description').textContent=stage.description;
 document.querySelectorAll('[data-tier]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.tier)===index)));
 $('#card-host .pc-frame b').innerHTML=`${index===4?'천상의 성물':material.name} <em>+${stage.level}</em>`;
 $('#material-description').textContent=index===4?'최종 강화 전용 · 천상의 성물 프레임':material.description;
 fx.setStage(index);
}
function showState(s){
 const position=$('#timeline');position.value=String(s.time);$('#time-readout').textContent=`${s.time.toFixed(2)}s`;
 $('#pause').setAttribute('aria-pressed',String(s.paused));$('#pause').textContent=s.paused?'▷ 계속 재생':'Ⅱ 일시정지';
 $('#motion-toggle').setAttribute('aria-pressed',String(s.enabled));$('#motion-toggle').textContent=s.enabled?'효과 켜짐':'효과 꺼짐';
 const label=!s.enabled?'효과 꺼짐':s.paused?'일시정지':s.burstActive?(s.time<.96?'빛을 모으는 중':s.time<1.55?'프레임 점등':'광택이 자리 잡는 중'):'상시 효과';
 if($('#playback-state').textContent!==label)$('#playback-state').textContent=label;
 sequencer?.paused(s.paused||!s.enabled||s.hidden);
}

try{
 if(!window.PlayerCallingCard)throw new Error('명함을 불러오지 못했습니다. 새로고침해 주세요.');
 $('#card-host').innerHTML=window.PlayerCallingCard.render(profile,{demo:true});
 fx=await mountEnhancementFx($('#fx-host'),$('#card-host'),showState);
 selectStage(4);$('#loading').hidden=true;
 // This reference is local-only and exposes no account or operational API.
 window.cardEnhancementPreview={getState:()=>fx.getState(),destroy};
 document.querySelectorAll('[data-tier]').forEach(button=>listen(button,'click',()=>selectStage(Number(button.dataset.tier))));
 document.querySelectorAll('[data-material]').forEach(button=>listen(button,'click',()=>{
  selectedMaterial=button.dataset.material;fx.setMaterial(selectedMaterial);selectStage(fx.getState().stage);
  document.querySelectorAll('[data-material]').forEach(node=>node.setAttribute('aria-pressed',String(node===button)));
 }));
 listen($('#replay'),'click',()=>{stopSequence();fx.replay()});
 listen($('#pause'),'click',()=>fx.setPaused(!fx.getState().paused));
 listen($('#motion-toggle'),'click',()=>fx.setEnabled(!fx.getState().enabled));
 listen($('#speed'),'change',event=>{const speed=Number(event.target.value);fx.setSpeed(speed);sequencer?.timeScale(speed)});
 listen($('#timeline'),'input',event=>{const time=Number(event.target.value);stopSequence();fx.seek(time)});
 listen($('#sequence'),'click',()=>{
  if(sequencer){stopSequence();return}
  fx.setEnabled(true);fx.setPaused(false);selectStage(0,false);fx.replay();
  sequencer=window.CNineUiFxVendor.gsap.timeline({onComplete:stopSequence});
  for(let i=1;i<STAGES.length;i++)sequencer.call(()=>{selectStage(i,false);fx.replay()},[],i*4.9);
  sequencer.to({hold:0},{hold:1,duration:4.7},19.6).timeScale(fx.getState().speed);
  fx.setSequence(true);$('#sequence').setAttribute('aria-pressed','true');
 });
 listen($('#card-host'),'click',event=>{
  const tab=event.target.closest('[data-pc-tab]');
  if(tab){
   document.querySelectorAll('[data-pc-tab]').forEach(node=>{const selected=node===tab;node.setAttribute('aria-selected',String(selected));node.tabIndex=selected?0:-1});
   $('#pc-honors-panel').hidden=tab.dataset.pcTab!=='honors';$('#pc-history-panel').hidden=tab.dataset.pcTab!=='history';
  }
  const trophy=event.target.closest('[data-pc-trophy]');
  if(trophy){
   document.querySelectorAll('[data-pc-trophy]').forEach(node=>node.setAttribute('aria-pressed',String(node===trophy)));
   $('#pc-trophy-detail').innerHTML=window.PlayerCallingCard.detail(profile.trophies[Number(trophy.dataset.pcTrophy)]);
  }
 });
 listen($('#card-host'),'keydown',event=>{
  if(!event.target.matches('[role=tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')],i=tabs.indexOf(event.target);
  const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowLeft'?-1:1)+tabs.length)%tabs.length];next.click();next.focus();
 });
 listen(window,'pagehide',event=>{if(!event.persisted)destroy()});
}catch(error){$('#loading').hidden=true;$('#error').hidden=false;$('#error').textContent=error.message;document.querySelectorAll('.playback button,.playback select,.tier-rail button,.material-picker button,#timeline').forEach(node=>{node.disabled=true});console.error(error)}

function destroy(){if(destroyed)return;destroyed=true;stopSequence();controller.abort();fx?.destroy()}
