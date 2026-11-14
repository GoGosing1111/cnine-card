import {jointAccountRequest} from './joint-account-transport.mjs';
export function createLivePetGrowthAdapter(request=jointAccountRequest){
 let ownerId=null,policy=null,cached=null,cachedAt=0,cachedIdentity='';
 const identity=()=>{try{return localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';}catch{return '';}};
 const key=()=>`cnine_pet_growth_pending_v2:${ownerId}`;
 const accept=value=>{if(!value?.policy||!Array.isArray(value.instances)||!Number.isSafeInteger(value.ownerId))throw Error('펫 결과를 확인하지 못했습니다.');ownerId=value.ownerId;policy=value.policy;cached=value;cachedAt=Date.now();cachedIdentity=identity();return value;};
 async function execute(body){
  if(!ownerId)throw Error('펫 정보를 먼저 불러와 주세요.');
  const storageKey=key();
  try{localStorage.setItem(storageKey,JSON.stringify(body));}catch{throw Object.assign(Error('요청을 안전하게 보관하지 못했습니다. 저장 공간을 확인해 주세요.'),{code:'LOCAL_STORAGE'});}
  try{const value=accept(await request('pets/v2/growth',{method:'POST',body}));localStorage.removeItem(storageKey);return value;}
  catch(error){cached=null;if(error.status&&error.status<500&&![408,429].includes(error.status)&&!error.retryable)localStorage.removeItem(storageKey);else error.retryable=true;throw error;}
 }
 return {get policy(){return policy;},execute,invalidate(){cached=null;},async read(){
  const value=cached&&cachedIdentity===identity()&&Date.now()-cachedAt<3000?structuredClone(cached):accept(await request('pets/v2/growth'));let pending;
  try{pending=JSON.parse(localStorage.getItem(key())||'null');}catch{throw Error('이전 요청 기록을 확인하지 못했습니다.');}
  return pending?execute(pending):value;
 }};
}
