import {withMercenaryDeadline} from '../shared/mercenary-loading-v1.mjs?v=20260925';
async function fusionRequest(options={}){
 const controller=new AbortController();
 try{return await withMercenaryDeadline(async()=>{
  const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  const response=await fetch('/api/admin/icons/fusion',{...options,signal:controller.signal,cache:'no-store',headers:{'content-type':'application/json',authorization:`Bearer ${token}`}}),data=await response.json();
  if(!response.ok)throw Object.assign(Error(data.error||'운영 설정을 확인하지 못했습니다.'),{status:response.status,code:data.code});
  if(!data.policy||!Number.isSafeInteger(data.settings?.revision))throw Error('운영 설정 응답을 확인해 주세요.');return data;
 },{timeoutMs:20000,message:'응답 확인이 지연됩니다. 저장 결과를 다시 확인해 주세요.'});}finally{controller.abort();}
}
export function mountIconFusionSettings(root,{request=fusionRequest}={}){
  let current=null,pending=null,disposed=false;
  root.innerHTML=`<section class="ic-fusion-settings"><header><div><small>ICON SYNTHESIS / LIVE</small><h3>아이콘 합성 · 성공 영상</h3></div><label><input type="checkbox" data-if-enabled> 합성 운영 ON</label></header><p>SUPERSTAR +13 1장 + FUR +13 1장 · 마스터의 별 <b>500만</b> · 코인 <b>1천억</b><br>성공률 <b>10%</b> · 실패 시 전체 소모 · 아이콘 7종 중 유저 선택</p><div class="ic-fusion-fields"><label>성공 영상 경로<input data-if-video type="text" maxlength="500" placeholder="assets/videos/icon-fusion-success.mp4"></label><label>영상 최대 길이 (초)<input data-if-duration type="number" min="1" max="60" value="12"></label><button type="button" data-if-save disabled>영상·운영 설정 저장</button></div><p>빈 경로는 기본 합성 연출을 사용합니다. MP4·WebM을 등록하면 합성 화면 안에서 재생합니다.</p><output role="status" data-if-status>운영 설정을 불러오는 중…</output></section>`;
  const $=q=>root.querySelector(q),status=$('[data-if-status]'),button=$('[data-if-save]');
  const display=settings=>{current=settings;$('[data-if-enabled]').checked=settings.enabled;$('[data-if-video]').value=settings.successVideoUrl;$('[data-if-duration]').value=settings.successVideoDurationMs/1000;button.disabled=false;button.textContent='영상·운영 설정 저장';status.textContent=`저장 버전 ${settings.revision} · 성공 영상 ${settings.successVideoUrl?'연결됨':'등록 대기'}`;};
  const reload=document.createElement('button');reload.type='button';reload.textContent='운영 설정 다시 불러오기';reload.className='ic-fusion-reload';root.querySelector('section').append(reload);
  const load=()=>{button.disabled=true;return request().then(data=>{if(!disposed){pending=null;display(data.settings);}}).catch(error=>{if(!disposed)status.textContent=error.message;});};reload.onclick=load;void load();
  button.onclick=async()=>{
    if(!current||disposed)return;
    if(!pending){if(!$('[data-if-duration]').reportValidity())return;pending={requestId:crypto.randomUUID(),expectedRevision:current.revision,enabled:$('[data-if-enabled]').checked,successVideoUrl:$('[data-if-video]').value.trim(),successVideoDurationMs:Math.round(Number($('[data-if-duration]').value)*1000)};}
    button.disabled=true;status.textContent='설정을 저장하고 있습니다.';
    try{const result=await request({method:'PATCH',body:JSON.stringify(pending)});if(disposed)return;pending=null;display(result.settings);}
    catch(error){if(disposed)return;if(error.status>=400&&error.status<500)pending=null;status.textContent=error.message;button.textContent=pending?'같은 설정 저장 재확인':'영상·운영 설정 저장';button.disabled=false;}
  };
  return {dispose(){disposed=true;root.replaceChildren();}};
}
