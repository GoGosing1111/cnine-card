import {iconLiveCardHtml} from './icon-fusion-v1.mjs';
import {ICON_CHOICE_ITEM as ITEM,ICON_CHOICE_VERSION} from '../shared/icon-card-choice-v1.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cardHtml=card=>iconLiveCardHtml(card).replaceAll('/'+card.sourceArt,'/assets/items/icon-card-choice-20261020/'+card.code.toLowerCase()+'.webp');
export async function openIconCardChoice({userId,dialog,body,token,refresh,onClose}){
 if(!document.querySelector('[data-icon-choice-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/css/icon-card-choice-v1.css?v=20261020-v1';style.dataset.iconChoiceStyle='';document.head.append(style);}
 const originalClass=body.className,key='cnine.icon-choice.v1:'+userId;
 let active=true,busy=false,target=null,pending=null,state;
 dialog.classList.add('ic-choice-dialog');body.className='ic-choice-content';
 dialog.addEventListener('close',()=>{active=false;body.className=originalClass;dialog.classList.remove('ic-choice-dialog');onClose?.();},{once:true});
 const api=async(path,data)=>{
  const r=await fetch('/api/icons/choice/'+path,{method:data?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});
  const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'사용 결과를 확인하지 못했습니다.'),{status:r.status,code:value.code,retryable:value.retryable});return value;
 };
 const forget=()=>{localStorage.removeItem(key);pending=null;};
 const saved=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&typeof value.requestId==='string')return value;}catch{}return null;};
 const header=()=>`<header class="ic-choice-heading"><img src="/${ITEM.image}" alt="" width="96" height="96"><div><small>ICON CARD SELECT</small><h2>아이콘 카드 선택권</h2><p>원하는 아이콘 카드 1장을 확정 획득하세요.</p></div></header>`;
 const resultView=async result=>{
  forget();await refresh().catch(()=>{});if(!active)return;
  body.innerHTML=header()+`<section class="ic-choice-result"><p role="status">선택권 1개 사용 · 카드 지급 완료</p>${cardHtml(result.reward)}<h3>${esc(result.reward.name)} 획득</h3><p>아이콘 카드 1장이 보유 카드에 추가되었습니다.</p><button type="button" class="ic-choice-action" data-choice-done>확인</button></section>`;
  body.querySelector('[data-choice-done]').onclick=()=>dialog.close();body.querySelector('[data-choice-done]').focus();
 };
 const render=()=>{
  if(!active)return;
  body.innerHTML=header()+`<p class="ic-choice-explanation">선택권 <b>${state.quantity.toLocaleString()}개</b> 보유 · 사용 시 1개 소모<br>코인·마스터의 별·재료 카드는 소모하지 않습니다.</p><div class="ic-choice-grid" aria-label="받을 아이콘 선택">${state.choices.map(card=>`<button type="button" class="ic-choice-target" data-choice="${esc(card.code)}" aria-pressed="${card.code===target}" ${pending?'disabled':''}>${cardHtml(card)}<span class="ic-choice-owned">보유 ${card.quantity.toLocaleString()}장</span></button>`).join('')||'<p>현재 선택 가능한 아이콘이 없습니다.</p>'}</div><footer class="ic-choice-footer"><p data-choice-summary aria-live="polite"></p><button type="button" class="ic-choice-action" data-choice-confirm></button><output role="status" aria-live="polite"></output></footer><p class="ic-choice-note">일반 아이콘 8종 대상 · 제우스 철구 및 신규 준비 아이콘 제외</p>`;
  const confirm=body.querySelector('[data-choice-confirm]'),status=body.querySelector('output'),summary=body.querySelector('[data-choice-summary]');
  const update=()=>{const card=state.choices.find(c=>c.code===target);summary.textContent=pending?'이전 선택권 사용 결과를 확인해 주세요.':card?card.name+' · 아이콘 카드 1장':'받을 카드를 선택하세요.';confirm.textContent=pending?'이전 사용 결과 확인':card?card.name+' 받기 · 선택권 1개 사용':'카드를 선택하세요';confirm.disabled=!pending&&(!card||!state.enabled||state.quantity<1);if(!state.enabled)status.textContent='현재 선택권 사용이 중지되어 있습니다.';else if(state.quantity<1&&!pending)status.textContent='보유한 선택권이 없습니다.';};
  body.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>{if(busy||pending)return;target=button.dataset.choice;body.querySelectorAll('[data-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.choice===target)));update();});
  confirm.onclick=async()=>{
   if(busy||!target)return;busy=true;confirm.disabled=true;body.querySelectorAll('[data-choice]').forEach(b=>b.disabled=true);status.textContent='카드 지급을 확인하고 있습니다…';
   try{
    const request=pending||{requestId:crypto.randomUUID(),targetCode:target,version:ICON_CHOICE_VERSION};
    // Never spend a ticket unless its recovery ID has been saved first.
    localStorage.setItem(key,JSON.stringify(request));pending=request;
    await resultView(await api('use',request));
   }catch(error){
    const terminal=error.code==='JOINT_OPERATION_SUPERSEDED'||String(error.code||'').startsWith('ICON_CHOICE_')&&error.retryable!==true;
    if(terminal)forget();if(!active)return;
    status.textContent=error.message;confirm.disabled=false;confirm.textContent=pending?'같은 요청 결과 다시 확인':'다시 사용';body.querySelectorAll('[data-choice]').forEach(b=>b.disabled=Boolean(pending));
   }finally{busy=false;}
  };update();
 };
 body.innerHTML=header()+'<p role="status">선택 가능한 카드와 보유 수량을 확인하고 있습니다…</p>';if(!dialog.open)dialog.showModal();
 try{
  state=await api('options');if(!active)return;pending=saved();
  const id=pending?.requestId||state.pendingRequestId;
  if(id){
   try{const receipt=await api('receipt?requestId='+encodeURIComponent(id));if(receipt.status==='COMPLETED'){await resultView(receipt);return;}pending={requestId:id,...receipt.input};localStorage.setItem(key,JSON.stringify(pending));}
   catch(error){if(error.code==='JOINT_NOT_FOUND'&&pending){/* Saved before the request reached the server. */}else if(error.code==='JOINT_OPERATION_SUPERSEDED')forget();else throw error;}
  }
  target=pending?.targetCode||null;render();
 }catch(error){if(active)body.innerHTML=header()+'<p role="alert">'+esc(error.message)+'</p><p>창을 닫고 다시 열면 보유 수량과 이전 사용 결과를 확인합니다.</p>';}
}
