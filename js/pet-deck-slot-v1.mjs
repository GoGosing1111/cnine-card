import {openPetEquipment,petUiIcon} from './pet-equipment-window-v1.mjs?v=20261003-pet-buffs1';

function mount(){
  for(const [id,mode]of [['battleDeck','PVE'],['pvpDeckSlots','PVP']]){
    const deck=document.getElementById(id);if(!deck||deck.parentElement.querySelector(`[data-pet-deck-slot="${mode}"]`))continue;
    const slot=document.createElement('section');slot.className='pet-deck-slot';slot.dataset.petDeckSlot=mode;slot.setAttribute('aria-label',`${mode} 펫 지원 슬롯`);
    slot.innerHTML=`<span class="pe-slot-icon" aria-hidden="true">${petUiIcon('paw')}</span><div><small>지원 편성 · 펫 1마리</small><strong>전투 시작 버프 준비 중</strong></div><button type="button"><span>펫 장착창</span>${petUiIcon('arrow')}</button>`;
    slot.querySelector('button').addEventListener('click',()=>openPetEquipment());const mercenary=deck.parentElement.querySelector('[data-mercenary-deck-slot]');(mercenary||deck).after(slot);
  }
}
const observer=new MutationObserver(mount);
function observe(){observer.observe(document.body,{childList:true,subtree:true});mount();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
addEventListener('pageshow',event=>{if(event.persisted)observe();});addEventListener('pagehide',()=>observer.disconnect());
