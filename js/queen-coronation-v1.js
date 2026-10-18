(function(global){
  'use strict';
  const DAY=86400000,seen=new Set();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storage=(kind,method,key,value)=>{try{return global[kind][method](key,value);}catch{return null;}};
  function describe(chief,now=Date.now()){
    const start=Date.parse(chief?.startsAt),end=Date.parse(chief?.endsAt);
    const active=chief?.active===true&&!['SUSPENDED','REMOVED'].includes(chief.status)&&Number.isFinite(start)&&start<=now&&(!Number.isFinite(end)||end>now);
    const value=String(chief?.ordinal??'').trim(),ordinal=/^[1-9]\d{0,3}$/.test(value)?Number(value):null;
    const coup=chief?.source==='COUP'&&chief.coupSuccession?.status==='APPOINTED';
    const general=chief?.reignStyle==='GENERAL',label=general?'장군':coup?'족장':'여왕';
    return {active,coup,general,label,newlyCrowned:active&&now-start<DAY,ordinal,title:ordinal?`제${ordinal}대 ${label}`:`현임 ${label}`,version:String(chief?.inaugurationVersion||chief?.startsAt||'')};
  }
  function show(chief,{automatic=false,returnFocus=null}={}){
    const view=describe(chief),doc=global.document;
    if(!view.active||doc.getElementById('chiefElectionPopup'))return false;
    const coupGeneral=view.coup&&view.general;
    const hideKey=`cnine-chief-hide-day:${view.version}`,sessionKey=`cnine-chief-seen-session:${view.version}`;
    if(automatic&&(!view.newlyCrowned||seen.has(sessionKey)||Number(storage('localStorage','getItem',hideKey))>Date.now()||storage('sessionStorage','getItem',sessionKey)))return false;
    const previousFocus=returnFocus||doc.activeElement,dialog=doc.createElement('dialog');
    const termEnd=Number.isFinite(Date.parse(chief.endsAt))?new Date(chief.endsAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+'까지 재위':'재위 정보는 왕실 명패에서 확인하세요';
    dialog.id='chiefElectionPopup';dialog.className='queen-coronation'+(coupGeneral?' general-coup-succession':view.general?' general-inauguration':view.coup?' coup-succession':'');
    dialog.setAttribute('aria-labelledby','chiefElectionTitle');dialog.setAttribute('aria-describedby','queenCoronationDescription');
    dialog.innerHTML=`<div class="queen-coronation-scene">
      <picture class="queen-coronation-art"><img src="${coupGeneral?'/assets/ui/coup/coup-general-male-v4-20261018.png':view.general?'/assets/ui/chief/general-command-v1.png':view.coup?'/assets/ui/coup/coup-succession-v2123-20261002.png':'/assets/ui/chief/queen-coronation-v1-1536.webp'}" width="${view.general&&!coupGeneral?1024:1536}" height="${view.general&&!coupGeneral?1536:1024}" alt="${coupGeneral?'점령한 지휘실의 작전대를 짚고 선 두꺼운 군용 코트의 남성 장군':view.general?'붉은 깃발과 철의 요새를 지배하는 냉엄한 여성 장군':view.coup?'어두운 황궁을 장악한 근엄한 여성 지휘관':'숲의 왕궁에서 루비 왕관과 아이보리 예복을 갖추고 즉위하는 여왕'}" decoding="async" fetchpriority="high"></picture>
      <div class="queen-coronation-shade" aria-hidden="true"></div><div class="queen-coronation-rays" aria-hidden="true"></div>
      <div class="queen-coronation-motes" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--x:${7+i*7.8}%;--delay:${(i%5)*.21}s;--rise:${60+(i%4)*24}px"></i>`).join('')}</div>
      <header class="queen-coronation-header"><span>REVERSE CALL <b>${coupGeneral?'COUP · CHANGE OF COMMAND':view.general?'GENERAL REGIME':view.coup?'THE FALL OF THE PALACE':'THE CORONATION'}</b></span><div><button type="button" class="queen-skip">연출 건너뛰기</button><button type="button" class="queen-close" aria-label="${coupGeneral?'쿠데타 장군 교체':view.general?'장군 집권식':view.coup?'쿠데타 결과':'즉위식'} 닫기">${coupGeneral?'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>':'×'}</button></div></header>
      ${coupGeneral?`<div class="coup-removal-sequence" aria-hidden="true">
        <img class="coup-removal-art" src="/assets/ui/coup/coup-prison-escort-female-v4-20261018.png" width="1536" height="1024" alt="" decoding="async" fetchpriority="high">
        <img class="coup-removal-searchlight" src="/assets/ui/coup/coup-searchlight-v3-20261018.png" width="1254" height="1254" alt="" decoding="async">
        <div class="coup-removal-shade"></div>
        <div class="coup-removal-verdict"><small>최고사령부 지휘권 박탈</small><h3>무능한 장군을<br>내렸다</h3><p>${esc(chief.coupSuccession.previousNickname)}</p></div>
        <div class="coup-removal-escort"><small>PRISON TRANSFER</small><h3>전임 장군 감옥 이송</h3><p>${esc(chief.coupSuccession.previousNickname)} · 지휘권 박탈</p></div>
      </div>`:''}
      <div class="queen-coronation-copy">${coupGeneral?`<p class="queen-coronation-eyebrow">반란군 승리 · 새로운 통치의 시작</p>
        <h2 id="chiefElectionTitle"><span class="queen-gold-word">쿠데타</span><span class="queen-coronation-subtitle">성공</span></h2>
        <section class="coup-general-transfer" aria-label="장군 교체">
          <p>장군 교체</p>
          <div class="coup-general-leaders"><div class="coup-general-previous"><small>이전 장군</small><del>${esc(chief.coupSuccession.previousNickname)}</del></div><span class="coup-general-arrow" aria-label="에서">→</span><div class="coup-general-successor"><small>${view.ordinal?`제 ${view.ordinal}대 장군`:'새 장군'}</small><strong>${esc(chief.nickname)}</strong></div></div>
        </section>
        <p id="queenCoronationDescription">전임 장군은 지휘권을 박탈당하고 감옥으로 이송됐습니다.<br>새 장군의 통치가 시작됩니다.</p>
        <p class="queen-coronation-term">${esc(termEnd.replace('재위','집권').replace('왕실 명패','집권 명패'))} · KST</p>
        <footer><label><input type="checkbox" id="chiefHideToday"> 오늘 하루 보지 않기</label><button type="button" id="chiefPopupClose">새 장군 확인 <span aria-hidden="true">→</span></button></footer>`:view.general?`<img class="general-inauguration-insignia" src="/assets/ui/chief/general-insignia-v1.svg" width="80" height="94" alt="최고사령부 휘장">
        <p class="queen-coronation-eyebrow">${view.coup?'쿠데타 성공 · 정권 교체':'최고사령부 · 집권 선포'}</p>
        <h2 id="chiefElectionTitle"><span class="queen-gold-word">장군</span><span class="queen-coronation-subtitle">집권</span></h2>
        <div class="queen-coronation-name"><small>${view.ordinal?`제 ${view.ordinal}대 장군`:'리버스콜의 장군'}</small><strong>${esc(chief.nickname)}</strong></div>
        ${view.coup?`<p class="general-previous-rule">이전 집권자 <span>${esc(chief.coupSuccession.previousNickname)}</span></p>`:''}
        <p id="queenCoronationDescription">철의 명령 아래, 새로운 통치가 시작됩니다.</p><p class="queen-coronation-term">${esc(termEnd.replace('재위','집권').replace('왕실 명패','집권 명패'))} · KST</p>
        <footer><label><input type="checkbox" id="chiefHideToday"> 오늘 하루 보지 않기</label><button type="button" id="chiefPopupClose">최고사령부 확인 <span aria-hidden="true">→</span></button></footer>`:view.coup?`<p class="queen-coronation-eyebrow">THE OLD REGIME HAS FALLEN</p>
        <h2 id="chiefElectionTitle"><span class="queen-gold-word">쿠데타</span><span class="queen-coronation-subtitle">성공</span></h2>
        <div class="coup-succession-transfer"><span>족장 교체</span><div><del>${esc(chief.coupSuccession.previousNickname)}</del><b aria-label="에서">→</b><strong>${esc(chief.nickname)}</strong></div></div>
        <p id="queenCoronationDescription">반란군 지휘관 <strong>${esc(chief.nickname)}</strong>의<br>새로운 통치가 시작됩니다.</p><p class="queen-coronation-term">${esc(termEnd.replace('재위','재임'))} · KST</p>
        <footer><label><input type="checkbox" id="chiefHideToday"> 오늘 하루 보지 않기</label><button type="button" id="chiefPopupClose">새로운 통치의 시작 <span aria-hidden="true">→</span></button></footer>`:`<img class="queen-coronation-crown" src="/assets/ui/chief/queen-crown-v1.svg" width="80" height="56" alt="">
        <p class="queen-coronation-eyebrow">THE FOREST WELCOMES HER QUEEN</p>
        <h2 id="chiefElectionTitle"><span class="queen-gold-word">여왕</span><span class="queen-coronation-subtitle">즉위</span></h2>
        <div class="queen-coronation-name"><small>${view.ordinal?`제 ${view.ordinal}대 여왕`:'리버스콜의 여왕'}</small><strong>${esc(chief.nickname)}</strong></div>
        <p id="queenCoronationDescription">숲의 뜻을 이어, 새로운 시대를 열다.</p><p class="queen-coronation-term">${esc(termEnd)} · KST</p>
        <footer><label><input type="checkbox" id="chiefHideToday"> 오늘 하루 보지 않기</label><button type="button" id="chiefPopupClose">여왕의 시대를 맞이합니다 <span aria-hidden="true">→</span></button></footer>`}
      </div>
    </div>`;
    if(coupGeneral)dialog.classList.add('is-coup-loading');
    doc.body.appendChild(dialog);
    const cleanup=()=>{dialog.remove();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});};
    const close=()=>{
      seen.add(sessionKey);storage('sessionStorage','setItem',sessionKey,'1');
      if(dialog.querySelector('#chiefHideToday').checked)storage('localStorage','setItem',hideKey,String(Date.now()+DAY));
      dialog.close();
    };
    dialog.addEventListener('close',cleanup,{once:true});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
    dialog.querySelector('.queen-close').onclick=close;dialog.querySelector('#chiefPopupClose').onclick=close;
    dialog.querySelector('.queen-skip').onclick=()=>{dialog.classList.add('is-settled');dialog.classList.remove('is-coup-loading');dialog.querySelector('#chiefPopupClose').focus({preventScroll:true});};
    dialog.showModal();dialog.querySelector('.queen-close').focus({preventScroll:true});
    if(coupGeneral)Promise.all(Array.from(dialog.querySelectorAll('img')).map(img=>img.decode().catch(()=>{}))).then(()=>{if(dialog.isConnected)dialog.classList.remove('is-coup-loading');});
    return true;
  }
  async function open({returnFocus=null}={}){
    if(typeof global.apiRequest!=='function')throw new Error('집권 정보를 불러올 수 없습니다.');
    const result=await global.apiRequest('chief/status',{}, {ttl:0,microcache:false,replaceInflight:true,timeoutMs:7000});
    if(!describe(result?.chief).active)throw new Error(describe(result?.chief).general?'현재 집권식을 볼 수 있는 장군이 없습니다.':'현재 즉위식을 볼 수 있는 여왕이 없습니다.');
    return show(result.chief,{returnFocus});
  }
  global.QueenCoronation=Object.freeze({describe,show,open});
})(window);
