(()=>{
  const $=selector=>document.querySelector(selector);
  const SYNC_KEY='cnine:burning-event-sync-v1310';
  const OPERATOR_NICKNAME='핑크빛유두';
  const ALLOWED_DURATIONS=Object.freeze([30,60,120]);
  const stateByPrefix={burning:null,hyperBurning:null};
  let activeMode='NONE',serverOffsetMs=0,loadSequence=0,saveSequence=0,saveLocked=false,accessAllowed=false,identityKey='',countdownTimer=null,expiryRefreshPending=false;
  const controllerByKind=new Map();

  function ensureControlUi(){
    const grid=$('.burningCmsGrid');
    if(!grid)return false;
    grid.id='burningCmsControl';
    if(!$('#burningCmsAccessState')){
      const notice=document.createElement('div');
      notice.id='burningCmsAccessState';notice.className='inlineNotice burningAccessNotice';
      notice.textContent='버닝 전용 운영 계정을 확인하는 중입니다.';
      grid.before(notice);
    }
    for(const [prefix,enabledId] of [['burning','burningEnabled'],['hyperBurning','hyperBurningEnabled']]){
      if($(`#${prefix}DurationMinutes`))continue;
      const enabledField=$(`#${enabledId}`)?.closest('.field');
      if(!enabledField)continue;
      enabledField.insertAdjacentHTML('afterend',`<label class="field burningDurationField"><span>진행 시간</span><select id="${prefix}DurationMinutes"><option value="30">30분</option><option value="60" selected>1시간</option><option value="120">2시간</option></select><small>ON 저장 시 선택 시간으로 타이머가 시작·재시작됩니다.</small></label>`);
    }
    return true;
  }

  function setAccessUi(allowed,message=''){
    accessAllowed=allowed===true;
    const grid=$('#burningCmsControl');
    grid?.classList.toggle('is-locked',!accessAllowed);
    grid?.setAttribute('aria-disabled',String(!accessAllowed));
    grid?.querySelectorAll('input,select,button').forEach(control=>{control.disabled=!accessAllowed});
    const notice=$('#burningCmsAccessState');
    if(notice){
      notice.classList.toggle('allowed',accessAllowed);notice.classList.toggle('denied',!accessAllowed);
      notice.textContent=message||(accessAllowed?'OWNER 핑크빛유두 전용 권한이 확인되었습니다.':'버닝·하이퍼 버닝은 OWNER 핑크빛유두 계정만 관리할 수 있습니다.');
    }
  }

  async function request(path,opt={},kind='load'){
    controllerByKind.get(kind)?.abort();
    const controller=new AbortController();controllerByKind.set(kind,controller);
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
    const separator=path.includes('?')?'&':'?';
    const response=await fetch(`../api/${path}${separator}_=${Date.now()}`,{...opt,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','authorization':'Bearer '+token,'cache-control':'no-store',...(opt.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error||'요청 실패');error.status=response.status;error.code=data.code;throw error}
    return data;
  }

  const value=(id,fallback=0)=>{const number=Number($(id)?.value);return Number.isFinite(number)?number:fallback};
  const durationLabel=minutes=>minutes===30?'30분':minutes===60?'1시간':minutes===120?'2시간':`${minutes}분`;
  const serverNow=()=>Date.now()+serverOffsetMs;
  const syncServerClock=value=>{const time=Date.parse(String(value||''));if(Number.isFinite(time))serverOffsetMs=time-Date.now()};
  function remainingMs(settings={}){const end=Date.parse(String(settings.endsAt||''));return Number.isFinite(end)?end-serverNow():NaN}
  function countdownText(milliseconds){
    if(!Number.isFinite(milliseconds))return '--:--:--';
    const total=Math.max(0,Math.ceil(milliseconds/1000)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
    return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  }
  function localEndText(value){const time=Date.parse(String(value||''));return Number.isFinite(time)?new Date(time).toLocaleString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'-'}

  function updateCountdownUi(){
    let hasLiveTimer=false,expired=false;
    for(const [prefix,mode] of [['burning','BURNING'],['hyperBurning','HYPER']]){
      const settings=stateByPrefix[prefix]||{},enabled=settings.enabled===true,isActive=activeMode===mode&&enabled,remaining=remainingMs(settings);
      const badge=$(prefix==='hyperBurning'?'#hyperBurningCmsState':'#burningCmsState');
      const status=$(prefix==='hyperBurning'?'#hyperBurningSaveState':'#burningSaveState');
      if(isActive&&Number.isFinite(remaining)&&remaining>0){
        hasLiveTimer=true;
        if(badge){badge.textContent=`ON · ${countdownText(remaining)}`;badge.classList.remove('off')}
        if(status&&!saveLocked){status.textContent=`진행 중 · ${countdownText(remaining)} 남음 · ${localEndText(settings.endsAt)} 종료`;status.classList.add('saved');status.classList.remove('error')}
      }else{
        if(badge){badge.textContent=enabled?'대기 설정':'OFF';badge.classList.toggle('off',!enabled)}
        if(status&&!saveLocked&&enabled&&Number.isFinite(remaining)&&remaining<=0){status.textContent='타이머 종료 · 서버 상태를 확인하는 중입니다.';status.classList.remove('saved');expired=true}
      }
    }
    if(!hasLiveTimer||document.hidden){clearInterval(countdownTimer);countdownTimer=null}
    else if(!countdownTimer)countdownTimer=setInterval(updateCountdownUi,1000);
    if(expired&&accessAllowed&&!expiryRefreshPending){expiryRefreshPending=true;setTimeout(()=>load().finally(()=>{expiryRefreshPending=false}),100)}
  }

  function setState(prefix,settings={},nextActiveMode=activeMode){
    const hyper=prefix==='hyperBurning',enabled=settings.enabled===true,duration=Number(settings.durationMinutes||60);
    stateByPrefix[prefix]={...settings,durationMinutes:ALLOWED_DURATIONS.includes(duration)?duration:60};activeMode=nextActiveMode||'NONE';
    $(`#${prefix}Enabled`).value=enabled?'1':'0';
    $(`#${prefix}DurationMinutes`).value=String(stateByPrefix[prefix].durationMinutes);
    $(`#${prefix}Title`).value=String(settings.title||(hyper?'숲켓몬 하이퍼 버닝이 발동 되었습니다':'숲켓몬 버닝이 발동 되었습니다')).replaceAll('\uC528\uCF13\uBAAC','숲켓몬');
    $(`#${prefix}PveMax`).value=Number(settings.pveMaxEnergy??(hyper?30:15));
    $(`#${prefix}PvpMax`).value=Number(settings.pvpMaxEnergy??(hyper?30:15));
    $(`#${prefix}Recharge`).value=Number(settings.rechargeMinutes??(hyper?1:2));
    $(`#${prefix}RewardMultiplier`).value=Number(settings.battleRewardMultiplier??(hyper?2.5:1.5));
    updateCountdownUi();
  }

  function draft(prefix){
    const hyper=prefix==='hyperBurning';
    return {enabled:$(`#${prefix}Enabled`).value==='1',durationMinutes:value(`#${prefix}DurationMinutes`,60),title:String($(`#${prefix}Title`).value||'').trim().replaceAll('\uC528\uCF13\uBAAC','숲켓몬'),pveMaxEnergy:value(`#${prefix}PveMax`,hyper?30:15),pvpMaxEnergy:value(`#${prefix}PvpMax`,hyper?30:15),rechargeMinutes:value(`#${prefix}Recharge`,hyper?1:2),duplicateShardMultiplier:1,packDiscountPercent:0,equipmentBoxDiscountPercent:0,battleRewardMultiplier:value(`#${prefix}RewardMultiplier`,hyper?2.5:1.5)};
  }

  function validate(settings,hyper=false){
    if(!settings.title)return '발동 알림 문구를 입력하세요.';
    if(!ALLOWED_DURATIONS.includes(settings.durationMinutes))return '진행 시간은 30분, 1시간, 2시간 중 하나를 선택하세요.';
    if(settings.pveMaxEnergy<1||settings.pveMaxEnergy>999||settings.pvpMaxEnergy<1||settings.pvpMaxEnergy>999)return 'PVE·PVP 최대 횟수는 1~999로 입력하세요.';
    if(settings.rechargeMinutes<1||settings.rechargeMinutes>1440)return '충전 시간은 1~1,440분으로 입력하세요.';
    const rewardMultiplierMax=hyper?30:10;
    if(settings.battleRewardMultiplier<1||settings.battleRewardMultiplier>rewardMultiplierMax)return `코인 보상 배율은 1~${rewardMultiplierMax}으로 입력하세요.`;
    return '';
  }

  function setSaveUi(hyper,text,error=false,busy=false){
    const status=$(hyper?'#hyperBurningSaveState':'#burningSaveState'),button=$(hyper?'#saveHyperBurningEventBtn':'#saveBurningEventBtn');
    if(status){status.textContent=text;status.classList.toggle('error',error);status.classList.toggle('saved',!error&&!busy)}
    if(button){button.disabled=busy||!accessAllowed;button.textContent=busy?'저장 확인 중...':hyper?'하이퍼 버닝 설정 저장':'기존 버닝 설정 저장'}
  }

  async function load(){
    if(!accessAllowed)return;
    const seq=++loadSequence;
    try{
      const [normal,hyper]=await Promise.all([request('admin/burning-event',{},'load-normal'),request('admin/hyper-burning-event',{},'load-hyper')]);
      if(seq!==loadSequence||saveLocked)return;
      syncServerClock(hyper.serverNow||normal.serverNow);
      const nextActiveMode=hyper.activeMode||normal.activeMode||'NONE';
      setState('burning',normal.settings||{},nextActiveMode);setState('hyperBurning',hyper.settings||{},nextActiveMode);
      if(nextActiveMode==='NONE'){setSaveUi(false,'서버 저장값과 동기화되었습니다.');setSaveUi(true,'서버 저장값과 동기화되었습니다.')}
      updateCountdownUi();
    }catch(error){
      if(error.name==='AbortError')return;
      if(error.code==='BURNING_OPERATOR_ONLY'||error.status===403)setAccessUi(false,error.message);
      setSaveUi(false,error.message,true);setSaveUi(true,error.message,true);
    }
  }

  async function save(hyper){
    if(saveLocked)return;
    if(!accessAllowed)return alert('버닝·하이퍼 버닝은 OWNER 핑크빛유두 계정만 관리할 수 있습니다.');
    const prefix=hyper?'hyperBurning':'burning',settings=draft(prefix),error=validate(settings,hyper);if(error)return alert(error);
    if(settings.enabled&&!confirm(`${hyper?'하이퍼 버닝':'기존 버닝'}을 ${durationLabel(settings.durationMinutes)} 동안 시작할까요?\n이미 진행 중이면 선택한 시간으로 타이머가 재시작되고, 다른 버닝은 자동으로 OFF 됩니다.`))return;
    saveLocked=true;const seq=++saveSequence;setSaveUi(hyper,'서버 시각으로 종료 타이머를 계산하고 있습니다.',false,true);
    try{
      const data=await request(hyper?'admin/hyper-burning-event':'admin/burning-event',{method:'PATCH',body:JSON.stringify({settings})},'save');
      if(seq!==saveSequence)return;
      syncServerClock(data.serverNow);
      const nextActiveMode=data.activeMode||'NONE';
      if(hyper){setState('hyperBurning',data.settings||{},nextActiveMode);if(data.otherSettings)setState('burning',data.otherSettings,nextActiveMode)}
      else{setState('burning',data.settings||{},nextActiveMode);if(data.otherSettings)setState('hyperBurning',data.otherSettings,nextActiveMode)}
      setSaveUi(hyper,settings.enabled?`저장 완료 · ${durationLabel(settings.durationMinutes)} 타이머가 시작되었습니다.`:'저장 완료 · 이벤트가 종료되었습니다.');
      try{localStorage.setItem(SYNC_KEY,JSON.stringify({at:Date.now(),mode:nextActiveMode,generation:Number(data.activeEvent?.generation||0)}))}catch{}
      alert(settings.enabled?`${hyper?'하이퍼 버닝':'기존 버닝'}이 ${durationLabel(settings.durationMinutes)} 동안 발동되었습니다.`:`${hyper?'하이퍼 버닝':'기존 버닝'}이 OFF 되었습니다.`);
    }catch(error){
      if(error.name!=='AbortError'){
        if(error.code==='BURNING_OPERATOR_ONLY'||error.status===403)setAccessUi(false,error.message);
        setSaveUi(hyper,error.message,true);alert(error.message);
      }
    }finally{
      saveLocked=false;
      const button=$(hyper?'#saveHyperBurningEventBtn':'#saveBurningEventBtn');
      if(button){button.disabled=!accessAllowed;button.textContent=hyper?'하이퍼 버닝 설정 저장':'기존 버닝 설정 저장'}
      updateCountdownUi();
    }
  }

  function applyIdentity(identity={}){
    const role=String(identity.role||'').trim().toUpperCase(),nickname=String(identity.nickname||''),key=`${role}:${nickname}`;
    if(key===identityKey)return;identityKey=key;
    const allowed=role==='OWNER'&&nickname===OPERATOR_NICKNAME;
    setAccessUi(allowed,allowed?'OWNER 핑크빛유두 전용 권한이 확인되었습니다.':'버닝·하이퍼 버닝은 OWNER 핑크빛유두 계정만 관리할 수 있습니다.');
    if(allowed)void load();
    else{clearInterval(countdownTimer);countdownTimer=null;setSaveUi(false,'접근 권한이 없습니다.',true);setSaveUi(true,'접근 권한이 없습니다.',true)}
  }

  function boot(){
    if(!ensureControlUi())return;
    setAccessUi(false,'버닝 전용 운영 계정을 확인하는 중입니다.');
    $('#saveBurningEventBtn')?.addEventListener('click',()=>save(false));
    $('#saveHyperBurningEventBtn')?.addEventListener('click',()=>save(true));
    window.addEventListener('soop:cms-identity',event=>applyIdentity(event.detail||{}));
    document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(countdownTimer);countdownTimer=null}else{updateCountdownUi();if(accessAllowed)void load()}});
    if(globalThis.__SOOP_CMS_IDENTITY__)applyIdentity(globalThis.__SOOP_CMS_IDENTITY__);
  }

  document.addEventListener('DOMContentLoaded',boot);
})();
