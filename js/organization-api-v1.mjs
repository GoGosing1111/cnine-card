import {organizationPublicOverview} from '../shared/organization-public-v1.mjs?v=20261025-clan-eight';
export const organizationToken=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
export async function organizationApi(path,options={}){
 const auth=organizationToken();
 if(!auth&&path==='organization/overview')return {...organizationPublicOverview(),previewOnly:false,loginRequired:true,releaseEnabled:true};
 if(!auth)throw Object.assign(Error('게임에 로그인한 뒤 이용해 주세요.'),{code:'ORG_AUTH'});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch('/api/'+path,{method:options.method||'GET',headers:{Authorization:'Bearer '+auth,...(options.body?{'Content-Type':'application/json'}:{})},cache:'no-store',signal:controller.signal,...(options.body?{body:JSON.stringify(options.body)}:{})});
  const result=await response.json();if(!response.ok||result.ok===false)throw Object.assign(Error(result.error||'클랜 정보를 불러오지 못했습니다.'),{code:result.code,status:response.status});return result;
 }catch(error){if(error.name==='AbortError')throw Error('응답이 지연되고 있습니다. 접수 현황을 다시 확인해 주세요.');throw error;}finally{clearTimeout(timer);}
}
