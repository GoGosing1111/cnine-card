import {mercenaryLoadoutCodes} from '../shared/mercenary-dual-client-v1.mjs';
import {jointAccountRequest as request} from './joint-account-transport.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=null,flight=null,lastRead=0,error='';
const loadout=(mode='PVE')=>state?.loadouts?.[mode]||state?.loadout;
const deployedCard=(mode='PVE')=>state?.available?state.cards?.find(c=>c.code===loadout(mode)?.mercenaryCode&&c.canDeploy):null;
const deployedCards=(mode='PVE')=>state?.available?mercenaryLoadoutCodes(loadout(mode)).map(code=>state.cards?.find(c=>c.code===code&&c.canDeploy)).filter(Boolean):[];
globalThis.MercenaryDeckSlot=Object.freeze({power:(mode='PVE')=>deployedCards(mode).reduce((sum,c)=>sum+Number(c.basePower||0)+Number(state?.equipmentPower?.[mode]||0),0)});
function render(){
  for(const host of document.querySelectorAll('[data-mercenary-deck-slot]')){
    const mode=host.dataset.mercenaryDeckSlot,code=loadout(mode)?.mercenaryCode,card=state?.cards?.find(c=>c.code===code);
    const label=card?card.name:state?'용병을 선택하세요':'용병 편성 확인 중';
    const signature=JSON.stringify([loadout(mode)?.mercenaryCodes,state?.accountId,code,card?.name,card?.rank,card?.basePower,card?.pendingSkillCount,error,state?.available]);
    if(host.dataset.signature===signature)continue;host.dataset.signature=signature;
    if(Array.isArray(loadout(mode)?.mercenaryCodes)){
      const rows=deployedCards(mode);host.innerHTML=`<div class="dual-mercenary-portraits" style="display:flex;flex-shrink:0;gap:4px">${rows.map(c=>`<img style="width:38px" src="${esc(c.edition==='LIMITED'?'/'+String(c.sourceArt).replace(/^\/+/, ''):'/assets/ui/project-v/mercenaries/codex-v1/'+c.code.toLowerCase()+'-art-320.webp')}" alt="${esc(c.name)}">`).join('')}</div><div><small>${mode} 용병 전용 슬롯 · ${rows.length}/2</small><strong>${esc(rows.map(c=>c.name).join(' · ')||'용병을 선택하세요')}</strong><p>${esc(error||'SSS·SS 각각 최대 1명 · 리미티드 포함')}</p></div><a href="/mercenary-codex/?view=owned&amp;mode=${mode}">용병 편성 →</a><a class="mercenary-gear-link" href="/mercenary-codex/equipment/?mode=${mode}">용병 장비</a>`;continue;
    }
    const portrait=card?.edition==='LIMITED'?'/'+String(card.sourceArt).replace(/^\/+/, ''):`/assets/ui/project-v/mercenaries/codex-v1/${card?.code.toLowerCase()}-art-320.webp`;
    host.innerHTML=`${card?`<img src="${esc(portrait)}" alt="${esc(card.name)} 카드 원화">`:'<span class="mercenary-slot-emblem" aria-hidden="true">V</span>'}<div><small>${mode} 용병 전용 슬롯 · ${card?'1':'0'}/1</small><strong>${esc(label)}</strong><p>${esc(error||('일반 카드 5장과 별도로 출전'+(card?.pendingSkillCount?' · 스킬 수치 설정 대기':'')))}</p></div><a href="/mercenary-codex/?view=owned&amp;mode=${mode}">${card?'용병 변경':'용병 편성'} <span aria-hidden="true">→</span></a><a class="mercenary-gear-link" href="/mercenary-codex/equipment/?mode=${mode}">용병 장비</a>`;
  }
}
addEventListener('cnine:account-sync',event=>{if(event.detail?.domains?.some(d=>['collection','loadout'].includes(d))){lastRead=0;if(document.querySelector('[data-mercenary-deck-slot]')){const pending=flight||Promise.resolve();void pending.finally(()=>refresh());}else state=null;}});
function refresh(){
  if(flight)return flight;lastRead=Date.now();error='';const signature=()=>JSON.stringify(['PVE','PVP'].map(mode=>[mercenaryLoadoutCodes(loadout(mode)),globalThis.MercenaryDeckSlot.power(mode)])),before=signature();
  flight=request('mercenaries/v3/state').then(value=>{state=value;}).catch(e=>{state=null;error=e.status===401?'로그인 후 용병을 편성할 수 있습니다.':e.message;}).finally(()=>{flight=null;render();if(before!==signature())dispatchEvent(new Event('mercenary-deployment:changed'));});return flight;
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
