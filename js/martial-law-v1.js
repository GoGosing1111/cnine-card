(()=>{
'use strict';
let state=null,offset=0,timer=null,hudVisible=false,pending=false,noticed=0,noticeAfter=0,overlay=null,returnFocus=null;
const now=()=>Date.now()+offset;
const live=()=>state?.enabled===true&&Date.parse(state.endsAt)>now();
const remaining=()=>{
 const seconds=Math.max(0,Math.ceil((Date.parse(state?.endsAt||'')-now())/1000)||0);
 return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
};
function close(){
 if(!overlay)return;overlay.remove();overlay=null;document.removeEventListener('keydown',keys);
 document.documentElement.classList.remove('martial-law-dialog-open');returnFocus?.focus?.();returnFocus=null;
}
function keys(event){
 if(event.key==='Escape'){event.preventDefault();close();return}
 if(event.key==='Tab'&&overlay){const focus=[...overlay.querySelectorAll('button:not(:disabled),[tabindex="0"]')],first=focus[0],last=focus.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 }
}
function show({preview=false,durationMinutes=60}={}){
 if(!preview&&!live())return;
 if(overlay)close();returnFocus=document.activeElement;
 overlay=document.createElement('div');overlay.className='martialLawOverlay';overlay.id='martialLawNotice';
 overlay.innerHTML='<section class="martialLawDialog martialPanel" role="dialog" aria-modal="true" aria-labelledby="martialNoticeTitle"><div class="martialHero" aria-hidden="true"></div><div class="martialNoticeContent"><small>REVERSE CALL · EMERGENCY ORDER</small><h2 id="martialNoticeTitle">계엄령 선포</h2><p class="martialLead">도시 전역에 비상 통제가 시작됩니다.</p><div class="martialBadge" data-martial-remaining></div><div class="martialEffects"><p><strong>전투 코인 −10%</strong><span>전투 보상에 ×0.9 적용</span></p><p><strong>행동력 충전 간격 ×3</strong><span>PVE · 랭크전 · 아포칼립스</span></p></div><p class="martialFine">진행 중인 버닝에도 적용됩니다.<br>남은 시간이 끝나면 자동으로 해제됩니다.</p><button type="button" class="martialButton" data-martial-close>확인</button></div></section>';
 overlay.querySelector('[data-martial-remaining]').textContent=preview?durationMinutes+'분 · 미리보기':remaining()+' 후 해제';
 overlay.dataset.preview=String(preview);
 overlay.querySelector('[data-martial-close]').onclick=close;
 overlay.onclick=event=>{if(event.target===overlay)close()};
 document.body.append(overlay);document.documentElement.classList.add('martial-law-dialog-open');
 document.addEventListener('keydown',keys);overlay.querySelector('button').focus({preventScroll:true});
}
function tryNotice(){
 if(!pending||now()<noticeAfter||!live()||!hudVisible||document.hidden||!document.querySelector('.page')||document.querySelector('#modal.show,#burningActivationNotice,[aria-modal="true"]'))return;
 pending=false;noticed=Number(state.generation)||0;
 try{sessionStorage.setItem('cnine:martial-notice',String(noticed))}catch{}
 show();
}
function mount({visible=hudVisible}={}){
 hudVisible=visible;
 let hud=document.getElementById('martialLawHud');
 if(!live()||!visible){hud?.remove();return}
 const page=document.querySelector('.page');if(!page)return;
 // The current lobby hides the legacy header; use its visible operations slot.
 const operations=page.querySelector('soop-adventure-lobby > [slot="operations"]');
 const target=operations||page.querySelector(':scope > .top-hud')||page;
 if(!hud||hud.parentElement!==target){
  hud?.remove();hud=document.createElement('button');hud.type='button';hud.id='martialLawHud';hud.className='martialBanner';
  hud.setAttribute('aria-haspopup','dialog');hud.innerHTML='<span><small>비상 통제 중</small><strong>리버스콜 계엄령</strong></span><span class="martialHudEffects">전투 코인 −10%<br>행동력 충전 간격 ×3</span><span data-martial-remaining></span>';hud.onclick=()=>show();
  if(operations)target.prepend(hud);else target.append(hud);
 }
 hud.querySelector('[data-martial-remaining]').textContent=remaining();
 tryNotice();
}
function tick(){
 if(state?.enabled&&!live()){
  state={...state,enabled:false};pending=false;close();mount();
  window.dispatchEvent(new Event('cnine:martial-changed'));
  window.refreshBurningEventState?.({forceFresh:true,rerender:true});
  clearInterval(timer);timer=null;return;
 }
 const label=remaining();
 document.querySelectorAll('#martialLawHud [data-martial-remaining],#martialLawNotice:not([data-preview="true"]) [data-martial-remaining]').forEach(node=>node.textContent=label+' 후 해제');
 mount();
}
function apply(next,{announce=true,now:serverNow}={}){
 if(!next||typeof next!=='object'||Number(next.revision||0)<Number(state?.revision||0))return;
 if(Number.isFinite(serverNow))offset=serverNow-Date.now();
 const previous=state,changed=!previous||Number(previous.revision)!==Number(next.revision)||previous.enabled!==next.enabled;
 state={...next};if(!live())state.enabled=false;
 if(announce&&live()&&Number(state.generation)>noticed&&!pending){pending=true;noticeAfter=now()+700;}
 if(!live()){pending=false;if(overlay?.dataset.preview!=='true')close()}
 mount();clearInterval(timer);timer=null;if(live()&&!document.hidden)timer=setInterval(tick,1000);
 if(changed)window.dispatchEvent(new Event('cnine:martial-changed'));
}
try{noticed=Number(sessionStorage.getItem('cnine:martial-notice'))||0}catch{}
document.addEventListener('visibilitychange',()=>{
 clearInterval(timer);timer=null;if(!document.hidden){tick();mount();if(live())timer=setInterval(tick,1000)}
});
window.CNineMartialLaw={apply,mount,show,close};
})();

