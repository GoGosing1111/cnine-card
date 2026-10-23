import {ensureIconEnhancementCss,iconEnhancementTable} from '../js/icon-enhancement-v1.mjs?v=20261024-v1';
import {withMercenaryDeadline} from '../shared/mercenary-loading-v1.mjs';
async function adminRequest(options={}){
  const controller=new AbortController();
  try{return await withMercenaryDeadline(async()=>{
    const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
    const response=await fetch('/api/admin/icons/enhancement',{...options,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}}),data=await response.json();
    if(!response.ok)throw Object.assign(Error(data.error||'설정을 확인하지 못했습니다.'),{status:response.status,code:data.code});
    if(!Number.isSafeInteger(data.settings?.revision)||data.settings.steps?.length!==10)throw Error('설정 응답을 확인하세요.');return data;
  },{timeoutMs:20000,message:'응답이 지연됩니다. 같은 설정으로 저장 결과를 확인하세요.'});}finally{controller.abort();}
}
export function mountIconEnhancementSettings(root,{request=adminRequest}={}){
  ensureIconEnhancementCss();let current=null,pending=null,busy=false,disposed=false;
  root.innerHTML=`<section class="ie-panel ie-admin" aria-label="아이콘 강화 설정"><header><small>ICON / +10 ENHANCEMENT</small><h3>아이콘 강화 · 비용 설정</h3></header><p class="ie-note">성공률 전 단계 10% 고정 · 단계마다 전투력 +20% · +10 전투력 540,000<br>실패 시 두 재료 소모·단계 유지. 중복 카드·천장 없음.<br>두 비용이 모두 입력된 단계만 이용 가능하며, 빈칸은 미설정으로 저장됩니다.</p><label class="ie-switch"><input type="checkbox" data-ie-enabled> 아이콘 강화 운영 ON</label><div class="ie-cost-rows">${Array.from({length:10},(_,i)=>`<fieldset data-ie-level="${i}"><legend>+${i} → +${i+1} · 성공률 10%</legend><label>마스터의 별<input data-ie-stars type="number" min="1" max="1000000000" step="1" placeholder="미설정" inputmode="numeric"></label><label>코인<input data-ie-coins type="number" min="1" max="100000000000000" step="1" placeholder="미설정" inputmode="numeric"></label></fieldset>`).join('')}</div><p role="status" data-ie-status>설정을 불러오는 중…</p><button type="button" class="ie-button" data-ie-save disabled>강화 설정 저장</button><button type="button" class="ie-reload" data-ie-reload>최신 설정 불러오기</button>${iconEnhancementTable()}</section>`;
  const $=s=>root.querySelector(s),status=$('[data-ie-status]'),save=$('[data-ie-save]');
  function controls(){root.querySelectorAll('input').forEach(x=>x.disabled=busy||!current||!!pending);save.disabled=busy||!current;$('[data-ie-reload]').disabled=busy;save.textContent=pending?'같은 설정 저장 재확인':'강화 설정 저장';}
  function display(settings){current=settings;pending=null;$('[data-ie-enabled]').checked=settings.enabled;root.querySelectorAll('[data-ie-level]').forEach((row,i)=>{row.querySelector('[data-ie-stars]').value=settings.steps[i].masterStarCost??'';row.querySelector('[data-ie-coins]').value=settings.steps[i].coinCost??'';});status.textContent=`저장 버전 ${settings.revision} · 운영 ${settings.enabled?'ON':'OFF'}`;}
  async function load(){if(busy||disposed)return;busy=true;controls();try{const data=await request();if(!disposed)display(data.settings);}catch(error){if(!disposed)status.textContent=error.message;}finally{busy=false;if(!disposed)controls();}}
  save.onclick=async()=>{
    if(busy||!current||disposed)return;
    if(!pending){
      if(![...root.querySelectorAll('input')].every(x=>x.reportValidity()))return;
      pending={requestId:crypto.randomUUID(),expectedRevision:current.revision,enabled:$('[data-ie-enabled]').checked,steps:[...root.querySelectorAll('[data-ie-level]')].map(row=>({masterStarCost:row.querySelector('[data-ie-stars]').value===''?null:Number(row.querySelector('[data-ie-stars]').value),coinCost:row.querySelector('[data-ie-coins]').value===''?null:Number(row.querySelector('[data-ie-coins]').value)}))};
    }
    busy=true;controls();status.textContent='설정을 저장하고 있습니다.';
    try{const data=await request({method:'PATCH',body:JSON.stringify(pending)});if(!disposed)display(data.settings);}
    catch(error){if(disposed)return;if(error.status>=400&&error.status<500)pending=null;status.textContent=error.message;}
    finally{busy=false;if(!disposed)controls();}
  };
  $('[data-ie-reload]').onclick=load;controls();void load();return {dispose(){disposed=true;root.replaceChildren();}};
}
