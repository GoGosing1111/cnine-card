(()=>{
  let state=null,loading=null,lastFetch=0;
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const remaining=ms=>{ms=Math.max(0,Number(ms)||0);const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000);return d?`${d}일 ${h}시간`:`${h}시간 ${m}분`};
  async function load(fresh=false){
    if(typeof API_MODE==='undefined'||!API_MODE||typeof loadUser!=='function'||!loadUser())return null;
    if(loading)return loading;if(!fresh&&state&&Date.now()-lastFetch<15000)return state;
    lastFetch=Date.now();loading=apiRequest('chief/status',{}, {ttl:0,timeoutMs:7000}).then(d=>state=d).catch(()=>state).finally(()=>loading=null);return loading;
  }
  function powerButton(type,label,sub,used){return `<button type="button" class="chief-power${used?' is-used':''}" data-chief-power="${type}" data-chief-used="${used?'1':'0'}" aria-disabled="${used?'true':'false'}"><span>${label}</span><small>${used?sub+' · 사용 완료':sub}</small></button>`}
  function markup(){
    const c=state?.chief;if(!c?.active)return `<section class="chief-main-card vacant"><div><small>FOREST COUNCIL</small><h2>족장 선출 대기</h2><p>와이고수 투표 결과에 따라 CMS에서 차기 족장을 임명합니다.</p></div></section>`;
    const u={...(c.usage||{})};
    const actualBurningToday=Number(u.burningToday||0),actualTowerResets=Number(u.towerResetCount||0);
    if(actualBurningToday===1)u.burningToday=0;
    u.towerResetUsed=actualTowerResets>=2;
    return `<section class="chief-main-card${c.isChief?' is-chief':''}"><div class="chief-art"><img src="assets/chief-council-election-v1.png" alt="대의회에서 족장이 선출되는 장면"><i></i></div><div class="chief-copy"><small>THE ELECTED CHIEF · 와이고수 투표 선출</small><h2><em>제${c.inaugurationVersion?' '+String(c.inaugurationVersion).slice(-3):''}대 족장</em> ${esc(c.nickname)}</h2><p>숲켓몬 대의회의 뜻을 받들어 7일간 부족을 이끕니다.</p><div class="chief-term"><span><b>${remaining(c.remainingMs)}</b> 남음</span><time>${new Date(c.endsAt).toLocaleString('ko-KR')}까지</time></div></div>${c.isChief?`<div class="chief-console"><header><span>족장 권한</span><small>모든 제한은 서버에서 검증됩니다</small></header><div class="chief-power-grid">${powerButton('HYPER','하이퍼 버닝','오늘 1시간',u.hyperToday>=1)}${powerButton('BURNING','숲켓몬 버닝','오늘 3시간',u.burningToday>=1)}${powerButton('TOWER_RESET','무한의 탑 초기화','임기 중 1회',u.towerResetUsed)}</div></div>`:`<div class="chief-public-powers"><span>매일 버닝 선포</span><span>임기 1회 탑 초기화</span></div>`}</section>`;
  }
  function mount(){
    if(typeof runtimeCommandContext==='undefined'||runtimeCommandContext!=='buy')return;
    const page=document.querySelector('.page'),summary=page?.querySelector('.summary-bar');if(!page||!summary)return;
    let root=document.getElementById('chiefMainRoot');if(!root){root=document.createElement('div');root.id='chiefMainRoot';summary.insertAdjacentElement('afterend',root)}const nextMarkup=markup();if(root.innerHTML!==nextMarkup)root.innerHTML=nextMarkup;
    const u=state?.chief?.usage||{},burning=root.querySelector('[data-chief-power="BURNING"]'),tower=root.querySelector('[data-chief-power="TOWER_RESET"]');
    if(burning)burning.querySelector('small').textContent=`오늘 ${Number(u.burningToday||0)}/2회 · 3시간${Number(u.burningToday||0)>=2?' · 사용 완료':''}`;
    if(tower)tower.querySelector('small').textContent=`임기 중 ${Number(u.towerResetCount||0)}/2회${Number(u.towerResetCount||0)>=2?' · 사용 완료':''}`;
    const publicPowers=root.querySelectorAll('.chief-public-powers span');if(publicPowers[0])publicPowers[0].textContent='매일 버닝 2회';if(publicPowers[1])publicPowers[1].textContent='임기 2회 탑 초기화';
    const strip=page.querySelector(':scope > .burning-event-strip');if(strip){let dock=page.querySelector('.chief-event-dock');if(!dock){dock=document.createElement('div');dock.className='chief-event-dock';const nav=page.querySelector('.main-nav');(nav||summary).insertAdjacentElement('afterend',dock)}dock.replaceChildren(strip)}
  }
  function actionStatus(message,error=false){let el=document.getElementById('chiefActionStatus');if(!el){const consolePanel=document.querySelector('#chiefMainRoot .chief-console');if(!consolePanel)return;el=document.createElement('p');el.id='chiefActionStatus';el.className='chief-action-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');consolePanel.appendChild(el)}el.textContent=message||'';el.classList.toggle('error',error)}
  async function activate(type,button){
    const names={HYPER:'하이퍼 버닝 1시간',BURNING:'숲켓몬 버닝 3시간',TOWER_RESET:'모든 유저의 무한의 탑 진행도 초기화'};
    if(button.dataset.chiefUsed==='1'){actionStatus(`${names[type]} 권한은 이미 사용했습니다.`,true);alert(`${names[type]} 권한은 이미 사용했습니다.`);return}
    if(!confirm(`${names[type]} 권한을 지금 발동할까요?\n발동 후에는 사용 횟수를 되돌릴 수 없습니다.`))return;
    if(button.dataset.chiefBusy==='1')return;button.dataset.chiefBusy='1';button.disabled=true;actionStatus(`${names[type]} 발동 요청을 처리하고 있습니다.`);
    try{
      const activated=await apiRequest('chief/activate',{method:'POST',body:JSON.stringify({type})});
      actionStatus(`${names[type]} 권한이 발동되었습니다.`);alert(`${names[type]} 권한이 발동되었습니다.`);
      if(typeof clearApiCache==='function'){clearApiCache('packs');clearApiCache('equipment/supply-box/config');clearApiCache('equipment/supply-box/config?fresh=1');clearApiCache('vehicle-draw/config')}
      try{await load(true);mount();if(typeof refreshBurningEventState==='function')await refreshBurningEventState({forceFresh:true,rerender:true});if(typeof renderShell==='function')renderShell('buy')}catch(refreshError){console.warn('족장 권한 발동 후 화면 갱신 실패:',refreshError)}
    }catch(e){actionStatus(e.message||'권한 발동에 실패했습니다.',true);alert(e.message||'권한 발동에 실패했습니다.');button.disabled=false;delete button.dataset.chiefBusy}
  }
  function popup(){
    const c=state?.chief;if(!c?.active||Date.now()-Date.parse(c.startsAt)>86400000)return;const key=`cnine-chief-hide-day:${c.inaugurationVersion}`,sessionKey=`cnine-chief-seen-session:${c.inaugurationVersion}`,until=Number(localStorage.getItem(key)||0);if(until>Date.now()||sessionStorage.getItem(sessionKey)||document.getElementById('chiefElectionPopup'))return;
    const el=document.createElement('div');el.id='chiefElectionPopup';el.className='chief-election-popup';el.innerHTML=`<div class="chief-election-dialog" role="dialog" aria-modal="true" aria-labelledby="chiefElectionTitle"><div class="chief-election-image"><img src="assets/chief-council-election-v1.png" alt="숲의 대의회 족장 선출식"></div><div class="chief-election-body"><small>THE GRAND COUNCIL HAS SPOKEN</small><h2 id="chiefElectionTitle">새로운 족장이 선출되었습니다</h2><h3>${esc(c.nickname)}</h3><p>와이고수 투표의 뜻에 따라 숲켓몬의 족장으로 부임합니다.<br>앞으로 7일간 부족의 특별 권한을 행사합니다.</p><div><span>🔥 매일 버닝</span><span>🗼 탑 초기화</span></div><label><input type="checkbox" id="chiefHideToday"> 오늘 하루 보지 않기</label><button type="button" id="chiefPopupClose">대의회의 뜻을 확인했습니다</button></div></div>`;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));el.querySelector('#chiefPopupClose').onclick=()=>{sessionStorage.setItem(sessionKey,'1');if(el.querySelector('#chiefHideToday').checked)localStorage.setItem(key,String(Date.now()+86400000));el.classList.remove('show');setTimeout(()=>el.remove(),250)};
  }
  async function sync(){await load();mount();popup()}
  let mountQueued=false;
  const observer=new MutationObserver(()=>{if(typeof runtimeCommandContext!=='undefined'&&runtimeCommandContext==='buy'&&!mountQueued){mountQueued=true;requestAnimationFrame(()=>{mountQueued=false;mount()})}});
  const onPowerClick=event=>{const button=event.target.closest?.('[data-chief-power]');if(!button||!document.getElementById('chiefMainRoot')?.contains(button))return;event.preventDefault();activate(button.dataset.chiefPower,button)};
  const boot=()=>{document.addEventListener('click',onPowerClick);observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});setTimeout(sync,500)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
  setInterval(()=>{if(typeof runtimeCommandContext!=='undefined'&&runtimeCommandContext==='buy')sync()},30000);
})();
