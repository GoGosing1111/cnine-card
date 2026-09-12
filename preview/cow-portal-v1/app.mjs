import {cowPortalPrompt} from '../../js/cow-room-portal.mjs';
const status=document.getElementById('status'),buttons=[...document.querySelectorAll('button')];
if(location.hostname==='127.0.0.1'){
  localStorage.setItem('cnine_card_api_token','local-account-7');
  localStorage.setItem('cnine_admin_token','local-account-7');
}
for(const button of document.querySelectorAll('[data-event]'))button.onclick=async()=>{
  buttons.forEach(b=>b.disabled=true);status.textContent='완료된 전투의 포탈을 확인합니다…';
  try{
    const response=await fetch('/__qa/cow-portal-result',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer local-account-7'},body:JSON.stringify({event:button.dataset.event})});
    if(!response.ok)throw Error('로컬 계정 검수 서버에서 열어주세요.');
    const result=await response.json();status.textContent=`${result.cowPortals.length}개 포탈 발견 · ${result.event==='APOCALYPSE'?'아포칼립스 3%':'일반 PVE 2%'} 기준`;
    await cowPortalPrompt.offer(result.cowPortals);
  }catch(error){status.textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
};
document.getElementById('restore').onclick=()=>void cowPortalPrompt.recover();
