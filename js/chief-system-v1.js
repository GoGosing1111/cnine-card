(()=>{
  let state=null,loading=null,lastFetch=0,runtimeStatus='LOADING';
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const remaining=ms=>{ms=Math.max(0,Number(ms)||0);const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000);return d?`${d}일 ${h}시간`:`${h}시간 ${m}분`};
  const ordinal=value=>{if(typeof value!=='number'&&typeof value!=='string')return null;const text=String(value).trim();if(!/^[1-9]\d{0,3}$/.test(text))return null;const number=Number(text);return Number.isSafeInteger(number)&&number<=9999?number:null};
  const chiefArt=(alt,avatar)=>{const desktop=String(avatar?.lobbyImage||''),mobile=String(avatar?.lobbyMobileImage||desktop);return desktop?`<picture><source media="(max-width:820px)" srcset="${esc(mobile)}"><img src="${esc(desktop)}" alt="${esc(avatar?.name||alt)}" fetchpriority="high" decoding="async"></picture>`:`<picture><source type="image/avif" srcset="/assets/responsive/ui/chief-council-election-v1-768.avif 768w, /assets/responsive/ui/chief-council-election-v1-1280.avif 1280w" sizes="(max-width:820px) 100vw, 900px"><source type="image/webp" srcset="/assets/responsive/ui/chief-council-election-v1-768.webp 768w, /assets/responsive/ui/chief-council-election-v1-1280.webp 1280w" sizes="(max-width:820px) 100vw, 900px"><img src="assets/chief-council-election-v1.png" alt="${esc(alt)}" fetchpriority="high" decoding="async"></picture>`};
  async function load(fresh=false){
    if(typeof API_MODE==='undefined'||!API_MODE||typeof loadUser!=='function'||!loadUser()){runtimeStatus='UNAVAILABLE';return null}
    if(loading)return loading;if(!fresh&&state&&Date.now()-lastFetch<45000)return state;
    if(!state)runtimeStatus='LOADING';
    lastFetch=Date.now();loading=apiRequest('chief/status',{}, {ttl:0,timeoutMs:7000}).then(d=>{if(!d?.chief||typeof d.chief.active!=='boolean')throw new Error('INVALID_CHIEF_STATUS_CONTRACT');state=d;runtimeStatus=d.chief.active?'ACTIVE':'VACANT';return state}).catch(()=>{runtimeStatus='UNAVAILABLE';return state}).finally(()=>loading=null);return loading;
  }
  function powerButton(type,label,sub,used){return `<button type="button" class="chief-power${used?' is-used':''}" data-chief-power="${type}" data-chief-used="${used?'1':'0'}" aria-disabled="${used?'true':'false'}"><span>${label}</span><small>${used?sub+' · 사용 완료':sub}</small></button>`}
  function markup(){
    if(runtimeStatus==='LOADING')return `<section class="chief-main-card vacant is-loading" data-chief-status="LOADING"><div><small>FOREST COUNCIL</small><h2>족장 정보 불러오는 중</h2><p>운영 서버에서 현재 임기 정보를 확인하고 있습니다.</p></div></section>`;
    if(runtimeStatus==='UNAVAILABLE')return `<section class="chief-main-card vacant is-unavailable" data-chief-status="UNAVAILABLE"><div><small>FOREST COUNCIL</small><h2>족장 정보 확인 불가</h2><p>통신 상태를 확인한 뒤 화면을 새로고침해 주세요.</p></div></section>`;
    const c=state?.chief;if(runtimeStatus==='VACANT'||!c?.active)return `<section class="chief-main-card vacant" data-chief-status="VACANT"><div><small>FOREST COUNCIL</small><h2>족장 선출 대기</h2><p>PLAY DK 투표 결과에 따라 CMS에서 차기 족장을 임명합니다.</p></div></section>`;
    const u=c.usage||{},l=c.limits||{};
    const burningToday=Number(u.burningToday||0),burningLimit=Math.max(1,Number(l.burningPerDay||2)),burningMinutes=Math.max(1,Number(l.burningDurationMinutes||180));
    const hyperToday=Number(u.hyperToday||0),hyperLimit=Math.max(1,Number(l.hyperPerDay||1)),hyperMinutes=Math.max(1,Number(l.hyperDurationMinutes||60));
    const towerResetCount=Number(u.towerResetCount||0),towerResetLimit=Math.max(1,Number(l.towerResetsPerTerm||2));
    const chiefOrdinal=ordinal(c.ordinal),chiefTitle=chiefOrdinal?`제 ${chiefOrdinal}대 족장`:'현임 족장';
    return `<section class="chief-main-card${c.isChief?' is-chief':''}" data-chief-status="ACTIVE"><div class="chief-art">${chiefArt('대의회에서 족장이 선출되는 장면',c.avatar)}<i></i></div><div class="chief-copy"><small>THE ELECTED CHIEF · PLAY DK 투표 선출</small><h2><em>${chiefTitle}</em> ${esc(c.nickname)}</h2><p>숲켓몬 대의회의 뜻을 받들어 7일간 부족을 이끕니다.</p><div class="chief-term"><span><b>${remaining(c.remainingMs)}</b> 남음</span><time>${new Date(c.endsAt).toLocaleString('ko-KR')}까지</time></div></div>${c.isChief?`<div class="chief-console"><header><span>족장 권한</span><small>모든 사용 제한은 서버에서 검증됩니다</small></header><div class="chief-power-grid">${powerButton('BURNING','버닝 발동',`${burningMinutes}분 · 오늘 ${burningToday}/${burningLimit}회`,burningToday>=burningLimit)}${powerButton('HYPER','하이퍼 버닝 발동',`${hyperMinutes}분 · 오늘 ${hyperToday}/${hyperLimit}회`,hyperToday>=hyperLimit)}${powerButton('TOWER_RESET','무한의 탑 초기화',`임기 중 ${towerResetCount}/${towerResetLimit}회`,towerResetCount>=towerResetLimit)}</div></div>`:`<div class="chief-public-powers"><span>매일 ${burningMinutes}분 버닝 ${burningLimit}회</span><span>매일 ${hyperMinutes}분 하이퍼 버닝 ${hyperLimit}회</span><span>임기 ${towerResetLimit}회 탑 초기화</span></div>`}</section>`;
  }
  function mount(){
    if(typeof runtimeCommandContext==='undefined'||runtimeCommandContext!=='buy')return;
    const page=document.querySelector('.page'),summary=page?.querySelector('.summary-bar');if(!page||!summary)return;
    let root=document.getElementById('chiefMainRoot');if(!root){root=document.createElement('div');root.id='chiefMainRoot';summary.insertAdjacentElement('afterend',root)}const nextMarkup=markup();if(root.innerHTML!==nextMarkup)root.innerHTML=nextMarkup;
  }
  function actionStatus(message,error=false){let el=document.getElementById('chiefActionStatus');if(!el){const consolePanel=document.querySelector('#chiefMainRoot .chief-console');if(!consolePanel)return;el=document.createElement('p');el.id='chiefActionStatus';el.className='chief-action-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');consolePanel.appendChild(el)}el.textContent=message||'';el.classList.toggle('error',error)}
  async function activate(type,button){
    const names={BURNING:'전체 서버 3시간 버닝 발동',HYPER:'전체 서버 1시간 하이퍼 버닝 발동',TOWER_RESET:'모든 유저의 무한의 탑 진행도 초기화'};
    if(button.dataset.chiefUsed==='1'){actionStatus(`${names[type]} 권한은 이미 사용했습니다.`,true);alert(`${names[type]} 권한은 이미 사용했습니다.`);return}
    if(!confirm(`${names[type]} 권한을 지금 발동할까요?\n발동 후에는 사용 횟수를 되돌릴 수 없습니다.`))return;
    if(button.dataset.chiefBusy==='1')return;button.dataset.chiefBusy='1';button.disabled=true;actionStatus(`${names[type]} 발동 요청을 처리하고 있습니다.`);
    try{
      const activated=await apiRequest('chief/activate',{method:'POST',body:JSON.stringify({type})});
      actionStatus(`${names[type]} 권한이 발동되었습니다.`);alert(`${names[type]} 권한이 발동되었습니다.`);
      if(typeof clearApiCache==='function'){clearApiCache('packs');clearApiCache('equipment/supply-box/config');clearApiCache('equipment/supply-box/config?fresh=1');clearApiCache('vehicle-draw/config')}
      try{await load(true);mount();if(typeof refreshBurningEventState==='function')await refreshBurningEventState({forceFresh:true,rerender:true});if(typeof renderShell==='function')renderShell('buy')}catch(refreshError){console.warn('족장 권한 발동 후 화면 갱신 실패:',refreshError)}
    }catch(e){actionStatus(e.message||'권한 발동에 실패했습니다.',true);alert(e.message||'권한 발동에 실패했습니다.')}finally{if(button.isConnected){button.disabled=false;delete button.dataset.chiefBusy}}
  }
  function popup(){
    const c=state?.chief;if(runtimeStatus!=='ACTIVE'||!c?.active||Date.now()-Date.parse(c.startsAt)>86400000)return;const key=`cnine-chief-hide-day:${c.inaugurationVersion}`,sessionKey=`cnine-chief-seen-session:${c.inaugurationVersion}`,until=Number(localStorage.getItem(key)||0);if(until>Date.now()||sessionStorage.getItem(sessionKey)||document.getElementById('chiefElectionPopup'))return;
    const chiefOrdinal=ordinal(c.ordinal),ordinalLabel=chiefOrdinal?`제${chiefOrdinal}대 `:'';
    const el=document.createElement('div');el.id='chiefElectionPopup';el.className='chief-election-popup';el.innerHTML=`<div class="chief-election-dialog" role="dialog" aria-modal="true" aria-labelledby="chiefElectionTitle"><div class="chief-election-image">${chiefArt('숲의 대의회 족장 선출식',c.avatar)}</div><div class="chief-election-body"><small>THE GRAND COUNCIL HAS SPOKEN</small><h2 id="chiefElectionTitle">새로운 족장이 선출되었습니다</h2><h3>${ordinalLabel}${esc(c.nickname)}</h3><p>PLAY DK 투표의 뜻에 따라 숲켓몬의 족장으로 부임합니다.<br>앞으로 7일간 부족의 특별 권한을 행사합니다.</p><div><span>🔥 매일 3시간 버닝 2회</span><span>⚡ 매일 1시간 하이퍼 버닝 1회</span><span>🗼 임기 중 탑 초기화 2회</span></div><label><input type="checkbox" id="chiefHideToday"> 오늘 하루 보지 않기</label><button type="button" id="chiefPopupClose">대의회의 뜻을 확인했습니다</button></div></div>`;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));el.querySelector('#chiefPopupClose').onclick=()=>{sessionStorage.setItem(sessionKey,'1');if(el.querySelector('#chiefHideToday').checked)localStorage.setItem(key,String(Date.now()+86400000));el.classList.remove('show');setTimeout(()=>el.remove(),250)};
  }
  async function sync(){mount();await load();mount();popup()}
  let mountQueued=false;
  const observer=new MutationObserver(()=>{if(typeof runtimeCommandContext!=='undefined'&&runtimeCommandContext==='buy'&&!mountQueued){mountQueued=true;requestAnimationFrame(()=>{mountQueued=false;mount()})}});
  const onPowerClick=event=>{const button=event.target.closest?.('[data-chief-power]');if(!button||!document.getElementById('chiefMainRoot')?.contains(button))return;event.preventDefault();activate(button.dataset.chiefPower,button)};
  const boot=()=>{document.addEventListener('click',onPowerClick);observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});sync();setTimeout(sync,500)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
  setInterval(()=>{if(!document.hidden&&typeof runtimeCommandContext!=='undefined'&&runtimeCommandContext==='buy')sync()},60000);
})();
