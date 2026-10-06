import {openPetEquipment,petUiIcon} from './pet-equipment-window-v1.mjs?v=20261006-pet-live-v1';
import {jointAccountRequest} from './joint-account-transport.mjs';
let refreshing=false;
async function refresh(){
  if(refreshing)return;refreshing=true;
  try{const state=await jointAccountRequest('pets/v1/state'),pet=state.cards?.find(p=>p.code===state.loadout?.petCode);
    for(const slot of document.querySelectorAll('[data-pet-deck-slot]')){slot.querySelector('strong').textContent=pet?`${pet.name}${pet.potential==='MAGNET'?' · 자석':''}`:'펫을 장착하세요';slot.dataset.petCode=pet?.code||'';}
  }catch{for(const slot of document.querySelectorAll('[data-pet-deck-slot]'))slot.querySelector('strong').textContent='펫 장착 정보 확인';}finally{refreshing=false;}
}

function mount(){
  let added=false;
  for(const [id,mode]of [['battleDeck','PVE'],['pvpDeckSlots','PVP']]){
    const deck=document.getElementById(id);if(!deck||deck.parentElement.querySelector(`[data-pet-deck-slot="${mode}"]`))continue;
    const slot=document.createElement('section');slot.className='pet-deck-slot';slot.dataset.petDeckSlot=mode;slot.setAttribute('aria-label',`${mode} 펫 지원 슬롯`);
    slot.innerHTML=`<span class="pe-slot-icon" aria-hidden="true">${petUiIcon('paw')}</span><div><small>지원 편성 · 펫 1마리</small><strong>장착 정보 확인 중…</strong></div><button type="button"><span>펫 장착창</span>${petUiIcon('arrow')}</button>`;
    slot.querySelector('button').addEventListener('click',()=>openPetEquipment());const mercenary=deck.parentElement.querySelector('[data-mercenary-deck-slot]');(mercenary||deck).after(slot);
    added=true;
  }
  if(added)void refresh();
}
const observer=new MutationObserver(mount);
function observe(){observer.observe(document.body,{childList:true,subtree:true});mount();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
addEventListener('pageshow',event=>{if(event.persisted)observe();});addEventListener('pagehide',()=>observer.disconnect());
addEventListener('cnine:pet-equipment-changed',event=>{if(!event.detail?.reviewOnly)void refresh();});
