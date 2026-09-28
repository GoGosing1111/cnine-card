(function(global){
  'use strict';
  const DAY=86400000,seen=new Set();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const storage=(kind,method,key,value)=>{try{return global[kind][method](key,value);}catch{return null;}};
  function describe(chief,now=Date.now()){
    const start=Date.parse(chief?.startsAt),end=Date.parse(chief?.endsAt);
    const active=chief?.active===true&&!['SUSPENDED','REMOVED'].includes(chief.status)&&Number.isFinite(start)&&start<=now&&(!Number.isFinite(end)||end>now);
    const value=String(chief?.ordinal??'').trim(),ordinal=/^[1-9]\d{0,3}$/.test(value)?Number(value):null;
    return {active,newlyCrowned:active&&now-start<DAY,ordinal,title:ordinal?`제${ordinal}대 여왕`:'현임 여왕',version:String(chief?.inaugurationVersion||chief?.startsAt||'')};
  }
  function show(chief,{automatic=false,returnFocus=null}={}){
    const view=describe(chief),doc=global.document;
    if(!view.active||doc.getElementById('chiefElectionPopup'))return false;
    const hideKey=`cnine-chief-hide-day:${view.version}`,sessionKey=`cnine-chief-seen-session:${view.version}`;
    if(automatic&&(!view.newlyCrowned||seen.has(sessionKey)||Number(storage('localStorage','getItem',hideKey))>Date.now()||storage('sessionStorage','getItem',sessionKey)))return false;
    const previousFocus=returnFocus||doc.activeElement,dialog=doc.createElement('dialog');
    const termEnd=Number.isFinite(Date.parse(chief.endsAt))?new Date(chief.endsAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+'까지 재위':'재위 정보는 왕실 명패에서 확인하세요';
    dialog.id='chiefElectionPopup';dialog.className='queen-coronation';
    dialog.setAttribute('aria-labelledby','chiefElectionTitle');dialog.setAttribute('aria-describedby','queenCoronationDescription');
    dialog.innerHTML=`<div class="queen-coronation-scene">
      <picture class="queen-coronation-art"><img src="/assets/ui/chief/queen-coronation-v1-1536.webp" width="1536" height="1024" alt="숲의 왕궁에서 루비 왕관과 아이보리 예복을 갖추고 즉위하는 여왕" decoding="async" fetchpriority="high"></picture>
      <div class="queen-coronation-shade" aria-hidden="true"></div><div class="queen-coronation-rays" aria-hidden="true"></div>
      <div class="queen-coronation-motes" aria-hidden="true">${Array.from({length:12},(_,i)=>`<i style="--x:${7+i*7.8}%;--delay:${(i%5)*.21}s;--rise:${60+(i%4)*24}px"></i>`).join('')}</div>
      <header class="queen-coronation-header"><span>SOOPKETMON <b>THE CORONATION</b></span><div><button type="button" class="queen-skip">연출 건너뛰기</button><button type="button" class="queen-close" aria-label="즉위식 닫기">×</button></div></header>
      <div class="queen-coronation-copy"><img class="queen-coronation-crown" src="/assets/ui/chief/queen-crown-v1.svg" width="80" height="56" alt="">
        <p class="queen-coronation-eyebrow">THE FOREST WELCOMES HER QUEEN</p>
        <h2 id="chiefElectionTitle"><span class="queen-gold-word">여왕</span><span class="queen-coronation-subtitle">즉위</span></h2>
        <div class="queen-coronation-name"><small>${view.ordinal?`제 ${view.ordinal}대 여왕`:'숲켓몬의 여왕'}</small><strong>${esc(chief.nickname)}</strong></div>
        <p id="queenCoronationDescription">숲의 뜻을 이어, 새로운 시대를 열다.</p><p class="queen-coronation-term">${esc(termEnd)} · KST</p>
        <footer><label><input type="checkbox" id="chiefHideToday"> 오늘 하루 보지 않기</label><button type="button" id="chiefPopupClose">여왕의 시대를 맞이합니다 <span aria-hidden="true">→</span></button></footer>
      </div>
    </div>`;
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
    dialog.querySelector('.queen-skip').onclick=()=>{dialog.classList.add('is-settled');dialog.querySelector('#chiefPopupClose').focus({preventScroll:true});};
    dialog.showModal();dialog.querySelector('.queen-close').focus({preventScroll:true});
    return true;
  }
  async function open({returnFocus=null}={}){
    if(typeof global.apiRequest!=='function')throw new Error('여왕 정보를 불러올 수 없습니다.');
    const result=await global.apiRequest('chief/status',{}, {ttl:0,microcache:false,replaceInflight:true,timeoutMs:7000});
    if(!describe(result?.chief).active)throw new Error('현재 즉위식을 볼 수 있는 여왕이 없습니다.');
    return show(result.chief,{returnFocus});
  }
  global.QueenCoronation=Object.freeze({describe,show,open});
})(window);
