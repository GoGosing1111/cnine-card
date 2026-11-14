import {jointAdminRequest} from '../js/joint-account-transport.mjs';
export function mountSupportApplicationAdmin(root,{request=jointAdminRequest,onConfig=()=>{}}={}){
  const key='cnine_support_application_settings_pending_v1:1';
  let config=null,pending=null,busy=false,disposed=false,message='';
  try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  function render(){
    if(disposed)return;
    root.innerHTML=`<section class="ss-application-admin"><div><h3>시즌패스 구매 및 계좌 안내</h3><p>구매를 끄면 해당 월의 신규 신청과 결제 확인이 중단됩니다. 기존 구매자는 이용 기간 동안 보상을 받을 수 있습니다.</p></div><div class="ss-application-admin-controls"><label><input type="checkbox" role="switch" data-application-enabled ${pending?.enabled??config?.enabled?'checked':''} ${busy||pending||!config?'disabled':''}> 계좌 안내 ON</label><label><input type="checkbox" role="switch" data-first-month-sale ${(pending?.firstMonthSalesOpen??config?.firstMonthSalesOpen)?'checked':''} ${busy||pending||!config?'disabled':''}> 1개월차 판매 ON</label><label><input type="checkbox" role="switch" data-second-month-sale ${(pending?.secondMonthSalesOpen??config?.secondMonthSalesOpen)?'checked':''} ${busy||pending||!config?'disabled':''}> 2개월차 구매 ON</label><button type="button" class="ss-primary" data-application-save ${busy||!config?'disabled':''}>${pending?'이전 저장 결과 확인':'설정 저장'}</button><button type="button" class="ss-secondary" data-application-reload ${busy||pending?'disabled':''}>새로고침</button></div><p data-application-status role="status"></p></section>`;
    root.querySelector('[data-application-status]').textContent=message;
  }
  async function load(){
    if(busy||disposed)return;busy=true;render();
    try{config=(await request('admin/server-support/application')).config;onConfig(config);message=pending?'이전 저장 결과를 같은 요청으로 확인하세요.':`2개월차 구매 ${config.secondMonthSalesOpen?'ON':'OFF'} · 계좌 안내 ${config.enabled?'ON':'OFF'}`;}
    catch(e){message=e.message;}finally{busy=false;render();}
  }
  async function save(){
    if(busy||!config||disposed)return;
    if(!pending){pending={enabled:root.querySelector('[data-application-enabled]').checked,firstMonthSalesOpen:root.querySelector('[data-first-month-sale]').checked,secondMonthSalesOpen:root.querySelector('[data-second-month-sale]').checked,expectedRevision:config.revision,requestId:crypto.randomUUID()};try{localStorage.setItem(key,JSON.stringify(pending));}catch{pending=null;message='저장 요청을 보관하지 못했습니다.';render();return;}}
    busy=true;render();
    try{const value=await request('admin/server-support/application',{method:'POST',body:pending});
      config=value.replayed?(await request('admin/server-support/application')).config:value.config;
      localStorage.removeItem(key);pending=null;onConfig(config);message=`2개월차 구매 ${config.secondMonthSalesOpen?'ON':'OFF'} · 설정 저장 완료${value.replayed?' · 이전 저장 결과':''}`;}
    catch(e){message=e.message;if(!e.retryable&&e.code!=='JOINT_LOCK_BUSY'&&e.status&&e.status<500&&![408,429].includes(e.status)){localStorage.removeItem(key);pending=null;}}
    finally{busy=false;render();}
  }
  const click=e=>{if(e.target.closest('[data-application-save]'))void save();else if(e.target.closest('[data-application-reload]'))void load();};
  root.addEventListener('click',click);void load();
  return {dispose(){disposed=true;root.removeEventListener('click',click);root.replaceChildren();}};
}
