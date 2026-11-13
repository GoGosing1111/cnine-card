(()=>{
  function boot(){
    const grid=document.querySelector('.burningCmsGrid');
    if(!grid)return;
    const panel=document.createElement('section');
    panel.id='extremeBurningCms';panel.className='miracleCmsPanel';
    panel.innerHTML='<div class="miracleCmsArt" aria-hidden="true"></div><header><h2>리버스콜 익스트림 버닝</h2><strong data-state>OFF</strong></header><p class="miracleCmsAccess">핑크빛유두 전용</p><div class="miracleCmsBenefits"><span><b>드랍 확률 ×2</b>최대 100%</span><span><b>군단토벌 행동력 +1</b>발동 시 1회</span><span><b>파티 군단토벌</b>발동 시 재입장 대기 해제</span></div><form><div class="formgrid"><label class="field">전투 코인 배율<input name="multiplier" type="number" min="1" max="1000" step="any" value="100" required></label><label class="field">진행 시간<select name="duration"></select></label></div><div class="miracleCmsActions"><button type="submit" data-start>발동</button><button type="button" data-stop>종료</button><button type="button" data-preview>팝업 미리보기</button></div></form><p class="miracleStatus" role="status"></p>';
    (document.getElementById('miracleBurningCms')||grid).after(panel);
    const el=k=>panel.querySelector(k),form=el('form'),status=el('[role=status]'),stateLabel=el('[data-state]');
    const syncKey='cnine:burning-event-sync-v1310';
    let allowed=false,busy=false,settings=null,pending=null,sequence=0,offset=0,timer;
    function state(){
      clearTimeout(timer);
      const seconds=Math.ceil((Date.parse(settings?.endsAt||'')-Date.now()-offset)/1000);
      const live=Boolean(settings?.enabled&&seconds>0);
      stateLabel.textContent=live?'ON · '+[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':'):'OFF';
      form.querySelectorAll('button,input,select').forEach(control=>control.disabled=!allowed||busy||!settings);
      el('[data-stop]').disabled=!allowed||busy||!live;
      if(live&&!document.hidden&&panel.getClientRects().length)timer=setTimeout(state,1000);
    }
    function apply(data){
      settings=data.settings;offset=Date.parse(data.serverNow)-Date.now();
      form.elements.duration.replaceChildren(...data.allowedDurations.map(n=>new Option(n%60===0?n/60+'시간':n+'분',String(n))));
      form.elements.duration.value=String(settings.durationMinutes);form.elements.multiplier.value=String(settings.battleRewardMultiplier);state();
    }
    async function request(method='GET',body){
      const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
      const r=await fetch('../api/admin/extreme-burning-event',{method,cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});
      const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'설정을 확인할 수 없습니다.'),{status:r.status});return data;
    }
    async function load(){
      if(!allowed||busy)return;const seq=++sequence;
      try{const d=await request();if(allowed&&seq===sequence&&!busy)apply(d);}catch(e){if(seq===sequence)status.textContent=e.message;}
    }
    async function save(enabled){
      if(!allowed||!settings||busy||!form.reportValidity())return;
      const draft={enabled,battleRewardMultiplier:Number(form.elements.multiplier.value),durationMinutes:Number(form.elements.duration.value),revision:settings.revision};
      const signature=JSON.stringify(draft);
      if(!pending||pending.signature!==signature)pending={signature,requestId:crypto.randomUUID()};
      busy=true;sequence++;state();
      try{
        const d=await request('PATCH',{...draft,requestId:pending.requestId});pending=null;
        if(!allowed)return;apply(d);status.textContent=d.replayed?'이 요청은 이미 처리되었습니다.':enabled?'익스트림 버닝이 발동되었습니다.':'익스트림 버닝이 종료되었습니다.';
        localStorage.setItem(syncKey,JSON.stringify({at:Date.now(),mode:d.settings.enabled?'EXTREME':'NONE',generation:d.settings.generation}));
        window.dispatchEvent(new Event('soop:burning-updated'));
      }catch(e){status.textContent=e.message;if(e.status===409){pending=null;settings=null;}}
      finally{busy=false;state();if(allowed&&!settings)void load();}
    }
    function identity(u={}){
      sequence++;allowed=u.role==='OWNER'&&u.nickname==='핑크빛유두';settings=null;pending=null;state();
      status.textContent=allowed?'':'핑크빛유두 계정에서 관리할 수 있습니다.';if(allowed)void load();
    }
    form.onsubmit=e=>{e.preventDefault();void save(true);};el('[data-stop]').onclick=()=>void save(false);
    el('[data-preview]').onclick=()=>{if(!form.reportValidity())return;window.CNineMiracleBurning?.show({manual:true,state:{...settings,mode:'EXTREME',enabled:true,battleRewardMultiplier:Number(form.elements.multiplier.value)},remainingText:()=>form.elements.duration.selectedOptions[0].textContent});};
    window.addEventListener('soop:cms-identity',e=>identity(e.detail));
    window.addEventListener('soop:burning-updated',()=>void load());window.addEventListener('storage',e=>{if(e.key===syncKey)void load();});
    new IntersectionObserver(state).observe(panel);
    document.addEventListener('visibilitychange',()=>{state();if(!document.hidden)void load();});
    identity(window.__SOOP_CMS_IDENTITY__);
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
