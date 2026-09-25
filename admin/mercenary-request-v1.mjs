import {withMercenaryDeadline} from '../shared/mercenary-loading-v1.mjs?v=20260925';

export async function mercenaryCmsRequest(options={},endpoint='/api/admin/mercenaries') {
  const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  const controller=new AbortController();
  try {
    return await withMercenaryDeadline(async()=>{
      const response=await fetch(endpoint,{...options,signal:controller.signal,cache:'no-store',headers:{'content-type':'application/json',authorization:`Bearer ${token}`}});
      let value;
      try{value=await response.json();}catch{
        throw Object.assign(Error('서버 응답을 확인하지 못했습니다. 다시 불러오거나 저장 결과 재확인을 눌러 주세요.'),{code:'CMS_RESPONSE_INVALID'});
      }
      if(!response.ok)throw Object.assign(Error(value?.error||`요청 실패 (${response.status})`),{status:response.status,code:value?.code});
      if(!value||!Number.isSafeInteger(value.revision)||value.revision<1||!(endpoint.endsWith('/draw')?value.policy:value.document))
        throw Object.assign(Error('운영 데이터를 확인하지 못했습니다. 다시 불러오거나 저장 결과 재확인을 눌러 주세요.'),{code:'CMS_RESPONSE_INVALID'});
      return value;
    },{timeoutMs:20000,message:'응답 확인이 지연됩니다. 다시 불러오거나 저장 결과 재확인을 눌러 주세요.'});
  } finally {controller.abort();}
}
