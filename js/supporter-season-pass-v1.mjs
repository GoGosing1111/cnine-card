import {jointAccountRequest} from './joint-account-transport.mjs';
import {passImage} from '../shared/supporter-season-pass-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n).toLocaleString('ko-KR');
const labels={CLAIMED:'수령 완료',CLOSED:'오픈 준비 중',INACTIVE:'후원자 전용',MISSED:'수령 종료',UPCOMING:'아직 열리지 않음',DAILY_LIMIT:'오늘 수령 완료',AVAILABLE:'수령하기',EMPTY:'보상 준비 중'};
const gift='<img src="/assets/ui/season-pass-v1/reward-chest.webp" alt="" loading="lazy">';
const crown='<img src="/assets/ui/season-pass-v1/supporter-crest.webp" alt="" width="96" height="96">';
const art=r=>passImage(r?.image)?`<img src="${esc(passImage(r.image))}" alt="" loading="lazy">`:gift;
export function mountSeasonPass(root,{data,userId,previewOnly=false,request=jointAccountRequest,signal,onRefresh=()=>{}}){
  let state=data,selected=Math.min(30,Math.max(1,state.currentDay||1)),busy=false,disposed=false,pending=null,offset=state.serverNow-Date.now();
  const storageKey='cnine_season_pass_pending_v1:'+Number(userId);
  try{pending=JSON.parse(localStorage.getItem(storageKey)||'null');}catch{}
  function message(text,error=false){const el=root.querySelector('[data-pass-status]');if(el){el.textContent=text;el.classList.toggle('is-error',error);}}
  function render(){
    if(disposed)return;
    const day=state.days[selected-1],ready=day.status==='AVAILABLE'&&!previewOnly;
    root.innerHTML=`<section class="sp-pass" aria-label="30일 후원자 시즌패스"><header class="sp-hero"><div class="sp-hero-crest">${crown}<span>30일의 선물</span></div><div class="sp-hero-copy"><span class="sp-eyebrow">후원자 전용 · 30일 출석 보상</span><h2>${esc(state.title)}</h2><p>오늘의 선물을 열고, 내일의 모험을 준비하세요.</p><div class="sp-period">${state.startDate?`${state.startDate} — ${state.endDate}`:'후원자 적용일부터 30일'}<span>${state.enabled?'매일 00:00 KST 갱신':'보상표 준비 중'}</span></div></div><div class="sp-hero-treasure" aria-hidden="true"><img src="/assets/ui/season-pass-v1/reward-chest.webp" alt="" width="300" height="300"></div><div class="sp-progress"><span>수령 완료</span><strong>${state.claimedCount}<small> / 30</small></strong><div role="progressbar" aria-label="시즌패스 수령 진행" aria-valuenow="${state.claimedCount}" aria-valuemin="0" aria-valuemax="30"><i style="width:${state.claimedCount/30*100}%"></i></div></div></header>
      <div class="sp-rule"><span>✦ 당일 보상만 수령 가능</span><span>지난 날짜의 보상은 이월되지 않습니다.</span><time data-pass-countdown></time></div>
      <section class="sp-featured" aria-label="선택한 날짜의 보상"><img class="sp-featured-chest" src="/assets/ui/season-pass-v1/reward-chest.webp" alt="" width="96" height="96"><div class="sp-featured-label"><span>${selected===30?'피날레 보상':selected%7===0?'특별한 하루':day.date===state.today?'오늘의 선물':'선택한 선물'}</span><strong>DAY ${String(selected).padStart(2,'0')}</strong><small>${day.date||'적용 후 날짜 표시'}</small></div><div class="sp-detail-rewards">${day.rewards.map(r=>`<div class="sp-detail-item"><span>${art(r)}</span><div><b>${esc(r.name)}</b><strong>× ${number(r.quantity)}</strong>${r.type==='VEHICLE'?'<small>이미 보유한 이동수단은 보유 유지</small>':''}</div></div>`).join('')||'<p class="sp-empty">보상이 등록되면 아이템과 수량이 여기에 표시됩니다.</p>'}</div><button type="button" class="sp-claim" data-pass-claim="${selected}" ${!ready||busy||pending?'disabled':''}>${busy?'지급 확인 중…':labels[day.status]}</button></section>
      ${pending?'<div class="sp-recovery"><span>이전 수령 요청의 결과를 확인해 주세요.</span><button type="button" data-pass-retry '+(busy?'disabled':'')+'>수령 결과 확인</button></div>':''}<p class="sp-status" role="status" aria-live="polite" data-pass-status></p>
      <div class="sp-calendar-heading"><h3>30일 보상 달력</h3><div><span class="sp-legend-today">오늘</span><span class="sp-legend-done">수령 완료</span><span>✦ 7·14·21·28·30일</span></div></div>
      <div class="sp-calendar">${state.days.map(d=>{const milestone=d.day===30||d.day%7===0;return `<article class="sp-day ${milestone?'is-milestone':''} ${d.day===30?'is-finale':''} ${d.date===state.today?'is-today':''} ${d.status==='CLAIMED'?'is-claimed':''} ${d.status==='MISSED'?'is-missed':''} ${d.day===selected?'is-selected':''}"><button type="button" class="sp-day-select" data-pass-day="${d.day}" aria-pressed="${d.day===selected}" aria-label="${d.day}일차, ${esc(d.rewards.map(r=>r.name+' '+number(r.quantity)+'개').join(', ')||'보상 준비 중')}, ${labels[d.status]}"><span class="sp-day-top"><b>DAY ${String(d.day).padStart(2,'0')}</b><small>${d.date?.slice(5).replace('-','.')||'—'}</small></span><span class="sp-day-art">${art(d.rewards[0])}${d.status==='CLAIMED'?'<i>✓</i>':''}${milestone?'<em>✦</em>':''}</span><span class="sp-day-name">${esc(d.rewards[0]?.name||'보상 준비 중')}</span><strong class="sp-day-quantity">${d.rewards.length?'× '+number(d.rewards[0].quantity):'—'}</strong>${d.rewards.length>1?`<small class="sp-more">외 ${d.rewards.length-1}종 · 눌러서 보기</small>`:'<small class="sp-more">&nbsp;</small>'}</button><button type="button" data-pass-claim="${d.day}" class="sp-day-action" ${d.status!=='AVAILABLE'||previewOnly||busy||pending?'disabled':''}>${labels[d.status]}</button></article>`;}).join('')}</div>
      <footer class="sp-footer"><span>✦</span><p>매일의 응원이 모여 더 빛나는 숲켓몬이 됩니다.<small>후원 적용일을 1일차로 계산합니다. 연장은 다음 30일 달력으로 이어지며, 이미 받은 보상을 초기화하지 않습니다.</small></p><span>✦</span></footer></section>`;
    countdown();
  }
  async function refresh(){
    const info=await request('server-support/info',{signal});if(disposed)return;
    state=info.seasonPass;previewOnly=info.previewOnly;offset=info.serverNow-Date.now();onRefresh(info);render();
  }
  async function claim(day){
    if(busy||disposed||previewOnly)return;
    if(!pending){if(state.days[day-1]?.status!=='AVAILABLE')return;pending={cycle:state.cycle,day,expectedRevision:state.revision};
      try{localStorage.setItem(storageKey,JSON.stringify(pending));}catch{pending=null;message('수령 요청을 보관하지 못했습니다. 브라우저 저장 공간을 확인하세요.',true);return;}}
    busy=true;render();message('오늘의 선물을 지급하고 있습니다.');
    try{
      const result=await request('server-support/pass/claim',{method:'POST',body:pending,signal});if(disposed)return;
      localStorage.removeItem(storageKey);pending=null;selected=result.day;
      const row=state.days[result.day-1];if(state.cycle===result.cycle&&row){row.status='CLAIMED';row.rewards=result.rewards;state.claimedCount=state.days.filter(d=>d.status==='CLAIMED').length;}
      busy=false;render();message(`${result.day}일차 보상 수령 완료 · ${result.rewards.map(r=>r.name+' × '+number(r.quantity)).join(', ')}`);
      root.querySelector('.sp-featured')?.classList.add('is-revealed');
      try{await refresh();message(`${result.day}일차 선물이 지급되었습니다. 보유 목록에서 확인하세요.`);root.querySelector('.sp-featured')?.classList.add('is-revealed');}catch{message('보상 지급이 완료되었습니다. 다음에 열면 최신 달력이 표시됩니다.');}
    }catch(error){
      if(disposed)return;
      if(!error.retryable&&error.status&&error.status<500&&![408,429].includes(error.status)){localStorage.removeItem(storageKey);pending=null;}
      busy=false;render();message(error.message||'수령 결과를 다시 확인해 주세요.',true);
      if(error.status===409||error.status===403){try{await refresh();message(error.message,true);}catch{}}
    }finally{busy=false;}
  }
  const click=e=>{const day=e.target.closest('[data-pass-day]');if(day){selected=Number(day.dataset.passDay);render();root.querySelector(`[data-pass-day="${selected}"]`)?.focus({preventScroll:true});}const button=e.target.closest('[data-pass-claim]');if(button&&!button.disabled)void claim(Number(button.dataset.passClaim));if(e.target.closest('[data-pass-retry]'))void claim();};
  let refreshing=false;
  function countdown(){
    const left=Math.max(0,state.nextResetAt-Date.now()-offset),el=root.querySelector('[data-pass-countdown]');
    if(el)el.textContent=`다음 날짜까지 ${String(Math.floor(left/3600000)).padStart(2,'0')}:${String(Math.floor(left/60000)%60).padStart(2,'0')}:${String(Math.floor(left/1000)%60).padStart(2,'0')}`;
    if(left===0&&!busy&&!refreshing&&!document.hidden){refreshing=true;void refresh().catch(()=>message('날짜가 바뀌었습니다. 다시 열어 최신 보상을 확인하세요.',true)).finally(()=>{setTimeout(()=>{refreshing=false;},60000);});}
  }
  root.addEventListener('click',click);const timer=setInterval(countdown,1000);render();
  return {dispose(){disposed=true;clearInterval(timer);root.removeEventListener('click',click);}};
}
