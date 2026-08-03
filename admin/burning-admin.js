(()=>{
  const $=selector=>document.querySelector(selector);
  const SYNC_KEY='cnine:burning-event-sync-v1310';
  let loadSequence=0,saveSequence=0,saveLocked=false;
  const controllerByKind=new Map();
  async function request(path,opt={},kind='load'){
    controllerByKind.get(kind)?.abort();
    const controller=new AbortController();controllerByKind.set(kind,controller);
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
    const separator=path.includes('?')?'&':'?';
    const response=await fetch(`../api/${path}${separator}_=${Date.now()}`,{...opt,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','authorization':'Bearer '+token,'cache-control':'no-store',...(opt.headers||{})}});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'요청 실패');return data;
  }
  const value=(id,fallback=0)=>{const number=Number($(id)?.value);return Number.isFinite(number)?number:fallback};
  function setState(prefix,settings={},activeMode='NONE'){
    const hyper=prefix==='hyperBurning',enabled=settings.enabled===true;
    $(`#${prefix}Enabled`).value=enabled?'1':'0';
    $(`#${prefix}Title`).value=String(settings.title|| (hyper?'숲켓몬 하이퍼 버닝이 발동 되었습니다':'숲켓몬 버닝이 발동 되었습니다')).replaceAll('\uC528\uCF13\uBAAC','숲켓몬');
    $(`#${prefix}PveMax`).value=Number(settings.pveMaxEnergy??(hyper?30:15));
    $(`#${prefix}PvpMax`).value=Number(settings.pvpMaxEnergy??(hyper?30:15));
    $(`#${prefix}Recharge`).value=Number(settings.rechargeMinutes??(hyper?1:2));
    $(`#${prefix}ShardMultiplier`).value=Number(settings.duplicateShardMultiplier??2);
    $(`#${prefix}RewardMultiplier`).value=Number(settings.battleRewardMultiplier??(hyper?2.5:1.5));
    const badge=$(hyper?'#hyperBurningCmsState':'#burningCmsState'),isActive=activeMode===(hyper?'HYPER':'BURNING');
    badge.textContent=isActive?(hyper?'ON · HYPER':'ON · BURNING'):enabled?'대기 설정':'OFF';badge.classList.toggle('off',!isActive);
  }
  function draft(prefix){const hyper=prefix==='hyperBurning';return {enabled:$(`#${prefix}Enabled`).value==='1',title:String($(`#${prefix}Title`).value||'').trim().replaceAll('\uC528\uCF13\uBAAC','숲켓몬'),pveMaxEnergy:value(`#${prefix}PveMax`,hyper?30:15),pvpMaxEnergy:value(`#${prefix}PvpMax`,hyper?30:15),rechargeMinutes:value(`#${prefix}Recharge`,hyper?1:2),duplicateShardMultiplier:value(`#${prefix}ShardMultiplier`,2),packDiscountPercent:0,equipmentBoxDiscountPercent:0,battleRewardMultiplier:value(`#${prefix}RewardMultiplier`,hyper?2.5:1.5)} }
  function validate(settings){
    if(!settings.title)return '발동 알림 문구를 입력하세요.';
        if(settings.pveMaxEnergy<1||settings.pveMaxEnergy>999||settings.pvpMaxEnergy<1||settings.pvpMaxEnergy>999)return 'PVE·PVP 최대 횟수는 1~999로 입력하세요.';
    if(settings.rechargeMinutes<1||settings.rechargeMinutes>1440)return '충전 시간은 1~1,440분으로 입력하세요.';
    if(settings.duplicateShardMultiplier<1||settings.duplicateShardMultiplier>10||settings.battleRewardMultiplier<1||settings.battleRewardMultiplier>10)return '보상 배율은 1~10으로 입력하세요.';
    return '';
  }
  function setSaveUi(hyper,text,error=false,busy=false){const id=hyper?'#hyperBurningSaveState':'#burningSaveState',button=$(hyper?'#saveHyperBurningEventBtn':'#saveBurningEventBtn');if($(id)){$(id).textContent=text;$(id).classList.toggle('error',error);$(id).classList.toggle('saved',!error&&!busy)}if(button){button.disabled=busy;button.textContent=busy?'저장 확인 중...':hyper?'하이퍼 버닝 설정 저장':'기존 버닝 설정 저장'}}
  async function load(){
    const seq=++loadSequence;
    try{
      const [normal,hyper]=await Promise.all([request('admin/burning-event',{},'load-normal'),request('admin/hyper-burning-event',{},'load-hyper')]);
      if(seq!==loadSequence||saveLocked)return;
      const activeMode=hyper.activeMode||normal.activeMode||'NONE';setState('burning',normal.settings||{},activeMode);setState('hyperBurning',hyper.settings||{},activeMode);setSaveUi(false,'서버 저장값과 동기화되었습니다.');setSaveUi(true,'서버 저장값과 동기화되었습니다.');
    }catch(error){if(error.name==='AbortError')return;setSaveUi(false,error.message,true);setSaveUi(true,error.message,true)}
  }
  async function save(hyper){
    if(saveLocked)return;
    const prefix=hyper?'hyperBurning':'burning',settings=draft(prefix),error=validate(settings);if(error)return alert(error);
    if(settings.enabled&&!confirm(`${hyper?'하이퍼 버닝':'기존 버닝'}을 ON 하시겠습니까?\n다른 버닝이 활성화되어 있으면 자동으로 OFF 됩니다.`))return;
    saveLocked=true;const seq=++saveSequence;setSaveUi(hyper,'서버 저장 후 실제 DB 값을 재확인하고 있습니다.',false,true);
    try{
      const data=await request(hyper?'admin/hyper-burning-event':'admin/burning-event',{method:'PATCH',body:JSON.stringify({settings})},'save');
      if(seq!==saveSequence)return;
      const activeMode=data.activeMode||'NONE';
      if(hyper){setState('hyperBurning',data.settings||{},activeMode);if(data.otherSettings)setState('burning',data.otherSettings,activeMode)}
      else{setState('burning',data.settings||{},activeMode);if(data.otherSettings)setState('hyperBurning',data.otherSettings,activeMode)}
      setSaveUi(hyper,'저장 완료 · 서버 재조회 값까지 일치했습니다.');
      try{localStorage.setItem(SYNC_KEY,JSON.stringify({at:Date.now(),mode:activeMode,generation:Number(data.activeEvent?.generation||0)}))}catch{}
      alert(data.activated?`${hyper?'하이퍼 버닝':'기존 버닝'}이 발동되었습니다.`:`${hyper?'하이퍼 버닝':'기존 버닝'} 설정이 저장되었습니다.`);
    }catch(error){if(error.name!=='AbortError'){setSaveUi(hyper,error.message,true);alert(error.message)}}
    finally{saveLocked=false;const button=$(hyper?'#saveHyperBurningEventBtn':'#saveBurningEventBtn');if(button){button.disabled=false;button.textContent=hyper?'하이퍼 버닝 설정 저장':'기존 버닝 설정 저장'}}
  }
  document.addEventListener('DOMContentLoaded',()=>{if(!$('#burningEnabled'))return;load();$('#saveBurningEventBtn')?.addEventListener('click',()=>save(false));$('#saveHyperBurningEventBtn')?.addEventListener('click',()=>save(true))});
})();
