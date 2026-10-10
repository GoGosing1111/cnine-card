(function(global){
  'use strict';
  const EVENT='diim-term-extension-20261011',ART='/assets/ui/chief/diim-regime-extension-20261011.webp';
  const completed=new Set(),requests=new Map();
  let pending=null,busy=false,presenting=false,retryTimer=null,lastUser=0;
  const userId=()=>{try{return Number(typeof loadUser==='function'?loadUser()?.serverUserId:0)||0}catch{return 0}};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  const canShow=()=>!document.hidden&&!document.querySelector('dialog[open],#modal.show,.battle-running,.raid-running,.v3-battle-overlay')&&document.body.classList.contains('v21-ui-ready');
  const api=(options={})=>global.apiRequest('chief/extension-notice',options,{ttl:0,microcache:false,timeoutMs:10000});
  function createDialog(notice){
    const dialog=document.createElement('dialog');
    dialog.id='chiefExtensionNotice';dialog.className='chief-extension-notice';
    dialog.setAttribute('aria-labelledby','chiefExtensionTitle');dialog.setAttribute('aria-describedby','chiefExtensionLead');
    dialog.innerHTML=`<div class="chief-extension-layout">
      <figure class="chief-extension-art"><img src="${ART}" width="1024" height="1536" alt="검은 군복 차림으로 붉은 사령부에서 특별 담화를 발표하는 진짜디임 장군"><figcaption><span>SUPREME COMMAND</span><strong>진짜디임</strong><small>제${esc(notice.ordinal||10)}대 장군 · 숲켓몬 최고사령부</small></figcaption></figure>
      <section class="chief-extension-copy"><header><span class="chief-extension-bulletin">최고사령부 특별 담화</span><button type="button" class="chief-extension-close" aria-label="특별 담화 닫기">×</button></header>
        <p class="chief-extension-overline">SOOPKETMON · EMERGENCY DECLARATION</p>
        <h2 id="chiefExtensionTitle">끝나지 않은 통치.<br><em>독재정권 연장</em></h2>
        <p id="chiefExtensionLead"><strong>진짜디임 장군</strong>이 현 정국이 혼란하다는 이유로<br class="chief-extension-desktop"> <strong>장군(족장) 임기를 7일 연장</strong>한다고 밝혔습니다.</p>
        <blockquote>“지금은 권력을 내려놓을 때가 아니다.<br>숲의 질서는 내가 바로잡겠다.”</blockquote>
        <p class="chief-extension-story">최고사령부는 잇따른 정국 불안과 민심의 동요를 수습하기 위해 강력한 통치가 더 필요하다고 발표했습니다. 장군은 남은 혼란을 정리하고 숲켓몬의 질서를 지키겠다는 뜻을 거듭 강조했습니다.</p>
        <p class="chief-extension-story">이에 따라 예정됐던 권력 이양은 뒤로 미뤄졌습니다. 사령부의 붉은 깃발은 다시 올랐고, 진짜디임의 통치는 앞으로도 계속됩니다.</p>
        <div class="chief-extension-term"><span><small>임기 연장</small><b>+7<em>일</em></b></span><div><small>연장된 임기 종료 · 한국 시간</small><strong>${esc(date(notice.endsAt))}</strong><del>기존 ${esc(date(notice.previousEndsAt))}</del></div></div>
        <footer><small>숲켓몬 세계관 소식</small><button type="button" class="chief-extension-confirm">담화 확인 <span aria-hidden="true">→</span></button></footer>
      </section></div>`;
    return dialog;
  }
  function later(){clearTimeout(retryTimer);retryTimer=setTimeout(()=>void present(),3000)}
  async function present(){
    if(!pending||presenting)return;
    const {notice,id}=pending;
    if(userId()!==id){pending=null;return}
    if(!canShow()){later();return}
    presenting=true;
    let dialog=null;
    try{
      const art=new Image();art.src=ART;await art.decode();
      if(!pending||userId()!==id||!canShow()){later();return}
      dialog=createDialog(notice);document.body.appendChild(dialog);
      const requestId=requests.get(id)||crypto.randomUUID();requests.set(id,requestId);
      const result=await api({method:'POST',body:JSON.stringify({id:EVENT,requestId})});
      if(userId()!==id){dialog.remove();pending=null;return}
      if(!result.show){dialog.remove();completed.add(id);pending=null;return}
      // Keep the claimed notice queued if a battle/dialog started during the request.
      if(!canShow()){dialog.remove();later();return}
      const previous=document.activeElement;
      const close=()=>dialog.close();
      dialog.querySelector('.chief-extension-close').onclick=close;
      dialog.querySelector('.chief-extension-confirm').onclick=close;
      dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
      dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true})},{once:true});
      dialog.showModal();dialog.querySelector('.chief-extension-confirm').focus({preventScroll:true});
      completed.add(id);pending=null;requests.delete(id);
    }catch(error){dialog?.remove();later()}
    finally{presenting=false}
  }
  async function check(){
    const id=userId();
    if(id!==lastUser){document.getElementById('chiefExtensionNotice')?.remove();pending=null;lastUser=id}
    if(!id||document.hidden||completed.has(id)||busy||typeof global.apiRequest!=='function')return;
    if(pending){void present();return}
    busy=true;
    try{const state=await api();if(userId()!==id)return;if(state.complete)completed.add(id);else if(state.notice?.id===EVENT){pending={id,notice:state.notice};void present()}}catch(error){}
    finally{busy=false}
  }
  const boot=()=>{void check();setTimeout(check,1200);setTimeout(check,6000);setInterval(check,60000)};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void check()});
  global.addEventListener('focus',()=>void check());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
