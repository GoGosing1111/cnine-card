import {jointAccountRequest} from './joint-account-transport.mjs';

export function createCowPortalPrompt({request=jointAccountRequest,navigate=url=>location.assign(url)}={}){
  let flight=null;
  const offered=new Set();
  const announce=available=>window.dispatchEvent(new CustomEvent('cow-portal:availability',{detail:{available}}));
  async function present(){
    const state=await request('cow-room/v3/state'),count=Number(state.portals?.available||0);
    announce(count);if(count<1)return false;
    if(!document.querySelector('link[data-cow-portal-style]')){
      const link=document.createElement('link');link.rel='stylesheet';link.href='/css/cow-room-portal.css?v=20260913-portal1';link.dataset.cowPortalStyle='';document.head.append(link);
      await new Promise(resolve=>{link.onload=link.onerror=resolve;setTimeout(resolve,1800);});
    }
    const focus=document.activeElement,dialog=document.createElement('dialog');dialog.className='cow-portal-dialog';
    dialog.setAttribute('aria-labelledby','cow-portal-title');dialog.setAttribute('aria-describedby','cow-portal-question');
    dialog.innerHTML=`<div class="cow-portal-art" aria-hidden="true"><div class="cow-portal-rift"><i></i></div><span>THE UNKNOWN PASTURE</span></div>
      <div class="cow-portal-copy"><p class="cow-portal-kicker"><i></i> 숨겨진 차원 발견</p><h2 id="cow-portal-title">미지의 젖소방 포탈이<br>열렸습니다</h2><p id="cow-portal-question">입장하시겠습니까?</p><p class="cow-portal-flavor">붉은 빛 너머, 낯선 목초지에서<br>무언가 당신을 기다리고 있습니다.</p>
      <div class="cow-portal-access"><span>발견한 포탈 <b data-portal-count></b></span><span data-portal-cost></span></div>
      <p class="cow-portal-message" role="status"></p><div class="cow-portal-actions"><button type="button" data-later>나중에</button><button type="button" data-enter autofocus>입장하기 <span aria-hidden="true">↗</span></button></div><small class="cow-portal-note">포탈은 보관되며, 입장할 때 1개를 사용합니다.</small></div>`;
    dialog.querySelector('[data-portal-count]').textContent=`${count.toLocaleString('ko-KR')}개`;
    const cost=Number(state.policy?.entryCoin||0);
    dialog.querySelector('[data-portal-cost]').textContent=cost?`입장 ${cost.toLocaleString('ko-KR')} 코인`:'입장 코인 무료';
    const closed=state.policy?.mode==='OFF'||Number(state.budget?.remaining||0)<1;
    dialog.querySelector('[data-enter]').disabled=closed;
    if(closed)dialog.querySelector('.cow-portal-message').textContent=state.policy?.mode==='OFF'?'현재 입장 준비 중입니다. 발견한 포탈은 보관됩니다.':'오늘 입장 횟수를 모두 사용했습니다. 포탈은 보관됩니다.';
    document.body.append(dialog);
    return new Promise(resolve=>{
      let finished=false;
      const finish=enter=>{if(finished)return;finished=true;dialog.close();dialog.remove();if(!enter&&focus?.isConnected)focus.focus();resolve(enter);if(enter)navigate('/pve-v3/?content=cow-room&enter=1');};
      dialog.querySelector('[data-later]').onclick=()=>finish(false);
      dialog.querySelector('[data-enter]').onclick=()=>finish(true);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      dialog.addEventListener('click',event=>event.stopPropagation());
      dialog.showModal();
    });
  }
  function offer(portals=[],{recover=false}={}){
    const fresh=(Array.isArray(portals)?portals:[]).filter(p=>p?.state==='OPEN'&&typeof p.id==='string'&&!offered.has(p.id));
    if(!recover&&!fresh.length)return Promise.resolve(false);
    if(flight)return flight;
    for(const portal of fresh)offered.add(portal.id);
    flight=present().catch(error=>{for(const portal of fresh)offered.delete(portal.id);console.warn('카우방 포탈 안내를 다시 확인할 수 있습니다.',error?.code||error?.status||'NETWORK');return false;}).finally(()=>flight=null);
    return flight;
  }
  return {offer,recover:()=>offer([],{recover:true})};
}
export const cowPortalPrompt=createCowPortalPrompt();
globalThis.CowRoomPortal=cowPortalPrompt;
