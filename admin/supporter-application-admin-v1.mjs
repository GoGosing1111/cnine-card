import {jointAdminRequest} from '../js/joint-account-transport.mjs';
export function mountSupportApplicationAdmin(root,{request=jointAdminRequest}={}){
  const key='cnine_support_application_settings_pending_v1:1';
  let config=null,pending=null,busy=false,disposed=false,message='';
  try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  function render(){
    if(disposed)return;
    root.innerHTML=`<section class="ss-application-admin"><div><h3>후원 신청 버튼 <strong>${config?.enabled?'ON':'OFF'}</strong></h3><p>ON이면 유저의 후원 화면에 신청하기 버튼이 표시되고 계좌 안내를 발송합니다.<br>OFF이면 버튼과 발급 API가 함께 차단됩니다. 기존 후원 혜택에는 영향을 주지 않습니다.</p></div><div class="ss-application-admin-controls"><label><input type="checkbox" role="switch" data-application-enabled ${pending?.enabled??config?.enabled?'checked':''} ${busy||pending||!config?'disabled':''}> 신청 버튼 ON</label><button type="button" class="ss-primary" data-application-save ${busy||!config?'disabled':''}>${pending?'이전 저장 결과 확인':'설정 저장'}</button><button type="button" class="ss-secondary" data-application-reload ${busy||pending?'disabled':''}>새로고침</button></div><p data-application-status role="status"></p></section>`;
    root.querySelector('[data-application-status]').textContent=message;
  }
  async function load(){
    if(busy||disposed)return;busy=true;render();
    try{config=(await request('admin/server-support/application')).config;message=pending?'이전 저장 결과를 같은 요청으로 확인하세요.':`현재 신청 기능 ${config.enabled?'ON':'OFF'} · 기본값 OFF`;}
    catch(e){message=e.message;}finally{busy=false;render();}
  }
  async function save(){
    if(busy||!config||disposed)return;
    if(!pending){pending={enabled:root.querySelector('[data-application-enabled]').checked,expectedRevision:config.revision,requestId:crypto.randomUUID()};try{localStorage.setItem(key,JSON.stringify(pending));}catch{pending=null;message='저장 요청을 보관하지 못했습니다.';render();return;}}
    busy=true;render();
    try{const value=await request('admin/server-support/application',{method:'POST',body:pending});localStorage.removeItem(key);pending=null;config=value.config;message=`신청 버튼 ${config.enabled?'ON':'OFF'} 저장 완료${value.replayed?' · 이전 저장 결과':''}`;}
    catch(e){message=e.message;if(!e.retryable&&e.code!=='JOINT_LOCK_BUSY'&&e.status&&e.status<500&&![408,429].includes(e.status)){localStorage.removeItem(key);pending=null;}}
    finally{busy=false;render();}
  }
  const click=e=>{if(e.target.closest('[data-application-save]'))void save();else if(e.target.closest('[data-application-reload]'))void load();};
  root.addEventListener('click',click);void load();
  return {dispose(){disposed=true;root.removeEventListener('click',click);root.replaceChildren();}};
}
