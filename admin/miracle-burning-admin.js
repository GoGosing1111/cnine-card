(()=>{
  let panel,allowed=false,busy=false,settings=null,serverOffset=0,timer=null,requestSequence=0;
  const $=id=>panel?.querySelector('#'+id);
  const syncKey='cnine:burning-event-sync-v1310';
  const clock=()=>Date.now()+serverOffset;
  function status(message,error=false){const node=$('miracleSaveState');if(node){node.textContent=message;node.classList.toggle('error',error)}}
  function controls(){panel?.querySelectorAll('input,select,button').forEach(node=>node.disabled=!allowed||busy)}
  function countdown(){
    const left=Date.parse(settings?.endsAt||'')-clock(),active=settings?.enabled&&left>0,total=Math.max(0,Math.ceil(left/1000));
    $('miracleCmsState').textContent=active?'ON · '+[Math.floor(total/3600),Math.floor(total%3600/60),total%60].map(n=>String(n).padStart(2,'0')).join(':'):'OFF';
    $('miracleCmsState').classList.toggle('off',!active);
    if(settings?.enabled&&left<=0){settings.enabled=false;void load()}
  }
  async function request(method='GET',body){
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
    const response=await fetch('../api/admin/miracle-burning-event?_='+Date.now(),{method,cache:'no-store',headers:{'content-type':'application/json',authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'미라클 버닝 요청에 실패했습니다.');
    const now=Date.parse(data.serverNow);if(Number.isFinite(now))serverOffset=now-Date.now();return data;
  }
  function apply(data){
    settings=data.settings;$('miracleEnabled').value=settings.enabled?'1':'0';
    $('miracleDuration').value=String(settings.durationMinutes||60);
    $('miracleMultiplier').value=String(settings.battleRewardMultiplier||100);
    $('miracleTitle').value=settings.title||'숲켓몬 미라클 버닝이 발동되었습니다';
    countdown();
  }
  async function load(){
    if(!allowed||busy)return;const seq=++requestSequence;
    try{const data=await request();if(seq!==requestSequence||!allowed||busy)return;apply(data);status('서버 설정과 동기화되었습니다.')}
    catch(error){if(seq===requestSequence)status(error.message,true)}
  }
  async function save(event){
    event.preventDefault();if(!allowed||busy)return;
    const draft={enabled:$('miracleEnabled').value==='1',durationMinutes:Number($('miracleDuration').value),battleRewardMultiplier:Number($('miracleMultiplier').value),title:$('miracleTitle').value.trim()};
    if(!draft.title||!Number.isFinite(draft.battleRewardMultiplier)||draft.battleRewardMultiplier<1||draft.battleRewardMultiplier>100){status('알림 문구와 코인 배율 1~100을 확인하세요.',true);return}
    if(draft.enabled&&!confirm('미라클 버닝을 '+draft.durationMinutes+'분 동안 발동할까요?\n코인 ×'+draft.battleRewardMultiplier+' · 드랍 확률 ×1.3\n아포칼립스 10회 / 5분, PVE 30회 / 1분 · 랭크전 행동력 제외\n진행 중인 일반·하이퍼 버닝은 종료됩니다.'))return;
    busy=true;requestSequence++;controls();status('서버에 저장하는 중입니다.');
    try{
      const data=await request('PATCH',{settings:draft});if(!allowed)return;apply(data);
      status(draft.enabled?'미라클 버닝이 발동되었습니다.':'미라클 버닝이 OFF로 저장되었습니다.');
      localStorage.setItem(syncKey,JSON.stringify({at:Date.now(),mode:data.activeMode,generation:Number(data.settings.generation)}));
      window.dispatchEvent(new Event('soop:burning-updated'));
    }catch(error){status(error.message,true)}
    finally{busy=false;controls()}
  }
  function identity(value={}){
    allowed=String(value.role||'').trim().toUpperCase()==='OWNER'&&value.nickname==='핑크빛유두';requestSequence++;
    panel.classList.toggle('is-locked',!allowed);controls();
    $('miracleAccess').textContent=allowed?'OWNER 핑크빛유두 전용 관리 권한이 확인되었습니다.':'미라클 버닝 발동·설정은 OWNER 핑크빛유두만 가능합니다.';
    clearInterval(timer);timer=null;
    if(allowed){void load();if(!document.hidden)timer=setInterval(countdown,1000)}else{settings=null;$('miracleCmsState').textContent='접근 제한';status('전용 운영자 계정으로 접속하세요.')}
  }
  function boot(){
    const grid=document.querySelector('.burningCmsGrid');if(!grid)return;
    panel=document.createElement('section');panel.className='miracleCmsPanel';panel.id='miracleBurningCms';
    panel.innerHTML=`<div class="miracleCmsArt" aria-hidden="true"></div><header><div><small>CELESTIAL AWAKENING</small><h2>미라클 버닝</h2><p>하늘빛 기적으로 전장을 깨우는 최상위 버닝</p></div><span class="statusPill off" id="miracleCmsState">OFF</span></header><p id="miracleAccess" class="miracleCmsAccess">전용 권한 확인 중</p><div class="miracleCmsBenefits"><span><b>아포칼립스 10회</b>5분마다 1회</span><span><b>PVE (랭크전 제외) 각 30회</b>1분마다 1회</span><span><b>드랍률 +30%</b>기존 확률 ×1.3</span><span><b>코인 최대 ×100</b>배율 직접 설정</span></div><form id="miracleForm"><div class="formgrid"><label class="field"><span>운영 상태</span><select id="miracleEnabled"><option value="0">OFF</option><option value="1">ON</option></select></label><label class="field"><span>진행 시간</span><select id="miracleDuration"><option value="30">30분</option><option value="60" selected>1시간</option><option value="120">2시간</option></select></label><label class="field"><span>코인 보상 배율 (1~100)</span><input id="miracleMultiplier" type="number" min="1" max="100" step="0.1" value="100" required></label><label class="field"><span>발동 알림 문구</span><input id="miracleTitle" maxlength="80" value="숲켓몬 미라클 버닝이 발동되었습니다" required></label></div><p class="miracleCmsNote">ON 저장 시 선택한 시간으로 시작합니다. 다른 버닝과 중복 적용되지 않으며, 종료되면 기존 행동력·충전·보상 규칙으로 돌아갑니다. 드랍 수량과 일일 제한은 유지됩니다.</p><div class="miracleCmsActions"><button type="submit">미라클 버닝 설정 저장</button><button type="button" id="miraclePreview">발동 화면 미리보기</button></div></form><p class="burningSaveState" id="miracleSaveState" role="status">서버 설정을 확인하고 있습니다.</p>`;
    grid.after(panel);$('miracleForm').addEventListener('submit',save);
    $('miraclePreview').onclick=()=>window.CNineMiracleBurning?.show({state:{enabled:true,mode:'MIRACLE',title:$('miracleTitle').value,battleRewardMultiplier:Number($('miracleMultiplier').value)||100},remainingText:()=>$('miracleDuration').value+'분 · 미리보기',manual:true});
    window.addEventListener('soop:cms-identity',event=>identity(event.detail||{}));
    window.addEventListener('storage',event=>{if(event.key===syncKey)void load()});
    window.addEventListener('soop:burning-updated',()=>void load());
    document.addEventListener('visibilitychange',()=>{clearInterval(timer);timer=null;if(!document.hidden&&allowed){void load();timer=setInterval(countdown,1000)}});
    identity(globalThis.__SOOP_CMS_IDENTITY__||{});
  }
  document.addEventListener('DOMContentLoaded',boot);
})();
