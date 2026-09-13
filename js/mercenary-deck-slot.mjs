import {jointAccountRequest as request} from './joint-account-transport.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,flight=null,lastRead=0,error='';
const deployedCard=()=>state?.available?state.cards?.find(c=>c.code===state.loadout?.mercenaryCode&&c.canDeploy):null;
globalThis.MercenaryDeckSlot=Object.freeze({power:()=>Number(deployedCard()?.basePower||0)});
function render(){
  for(const host of document.querySelectorAll('[data-mercenary-deck-slot]')){
    const code=state?.loadout?.mercenaryCode,card=state?.cards?.find(c=>c.code===code);
    const label=card?card.name:state?'용병을 선택하세요':'용병 편성 확인 중';
    const signature=JSON.stringify([state?.accountId,code,card?.name,card?.rank,card?.basePower,card?.pendingSkillCount,error,state?.available]);
    if(host.dataset.signature===signature)continue;host.dataset.signature=signature;
    host.innerHTML=`${card?`<img src="/assets/ui/project-v/mercenaries/codex-v1/${esc(card.code.toLowerCase())}-art-320.webp" alt="${esc(card.name)} 카드 원화">`:'<span class="mercenary-slot-emblem" aria-hidden="true">V</span>'}<div><small>용병 전용 슬롯 · ${card?'1':'0'}/1</small><strong>${esc(label)}</strong><p>${esc(error||('PVE·PVP 공통 · 일반 카드 5장과 별도로 출전'+(card?.pendingSkillCount?' · 스킬 수치 설정 대기':'')))}</p></div><a href="/mercenary-hangar/">${card?'용병 변경':'용병 편성'} <span aria-hidden="true">→</span></a>`;
  }
}
function refresh(){
  if(flight)return flight;lastRead=Date.now();error='';const before=globalThis.MercenaryDeckSlot.power();
  flight=request('mercenaries/v3/state').then(value=>{state=value;}).catch(e=>{state=null;error=e.status===401?'로그인 후 용병을 편성할 수 있습니다.':e.message;}).finally(()=>{flight=null;render();if(before!==globalThis.MercenaryDeckSlot.power())dispatchEvent(new Event('mercenary-deployment:changed'));});return flight;
}
function mount(){
  let added=false;
  for(const [id,mode] of [['battleDeck','PVE'],['pvpDeckSlots','PVP']]){
    const deck=document.getElementById(id);if(!deck||deck.parentElement.querySelector('[data-mercenary-deck-slot]'))continue;
    const host=document.createElement('section');host.className='mercenary-deck-slot';host.dataset.mercenaryDeckSlot=mode;host.setAttribute('aria-label',`${mode} 용병 전용 슬롯`);deck.after(host);added=true;
  }
  if(added)render();if((added||document.getElementById('pvpContent'))&&!state&&Date.now()-lastRead>3000)void refresh();
}
const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});mount();
addEventListener('focus',()=>{if(document.querySelector('[data-mercenary-deck-slot]'))void refresh();});
addEventListener('pageshow',event=>{if(event.persisted){observer.observe(document.body,{childList:true,subtree:true});mount();if(document.querySelector('[data-mercenary-deck-slot]'))void refresh();}});
addEventListener('storage',event=>{if(event.key==='cnine.mercenary.loadout.changed'&&document.querySelector('[data-mercenary-deck-slot]'))void refresh();});
addEventListener('pagehide',()=>observer.disconnect());
