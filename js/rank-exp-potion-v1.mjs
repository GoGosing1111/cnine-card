import {rankPotionItem,RANK_POTION_VERSION} from '../shared/rank-exp-potion-v1.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const duration=seconds=>{const n=Math.max(0,Math.ceil(seconds));return Math.floor(n/3600)+'시간 '+Math.floor(n%3600/60)+'분 '+n%60+'초';};
export async function openRankExpPotion({itemCode,userId,dialog,body,token,refresh,onApplied,onClose}){
 if(!rankPotionItem(itemCode)||!userId)return;
 if(!document.querySelector('[data-rank-potion-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/css/rank-exp-potion-v1.css?v=20261020-v1';link.dataset.rankPotionStyle='';document.head.append(link);}
 const originalClass=body.className,key='cnine.rank-potion.v1:'+userId,sessionToken=token();
 let active=true,busy=false,pending=null,state,item=rankPotionItem(itemCode),offset=0,clock=0;
 dialog.classList.add('rank-potion-dialog');body.className='rank-potion-content';
 dialog.addEventListener('close',()=>{active=false;clearInterval(clock);body.className=originalClass;dialog.classList.remove('rank-potion-dialog');onClose?.();},{once:true});
 const api=async(path,data)=>{
  const response=await fetch('/api/rank-exp-potion/'+path,{method:data?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+sessionToken,'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});
  const value=await response.json();if(!response.ok)throw Object.assign(Error(value.error||'물약 사용 결과를 확인하지 못했습니다.'),{code:value.code,status:response.status,retryable:value.retryable});return value;
 };
 const forget=()=>{localStorage.removeItem(key);pending=null;};
 const saved=()=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');if(value&&typeof value.requestId==='string'&&rankPotionItem(value.itemCode))return value;}catch{}return null;};
 const setState=value=>{state=value;offset=Date.parse(state.buff.serverNow)-Date.now();onApplied?.(state.buff);};
 const remaining=()=>Math.max(0,(Date.parse(state.buff.expiresAt)-(Date.now()+offset))/1000);
 const heading=()=>`<header class="rank-potion-heading"><img src="/${item.image}" alt="" width="112" height="112"><div><small>RANK EXPERIENCE</small><h2>${item.name}</h2><p>획득 계급 경험치 <b>×${item.multiplier}</b> · <b>60분</b></p></div></header>`;
 const resultView=async result=>{
  forget();clearInterval(clock);onApplied?.(result.buff);await refresh().catch(()=>{});if(!active)return;
  item=result.item;
  const action={START:'효과 적용 완료',EXTEND:'60분 연장 완료',REPLACE:'배율 교체 완료'}[result.applied.action];
  body.innerHTML=heading()+`<section class="rank-potion-result"><h3 role="status">${action}</h3><p>물약 1개를 사용했습니다.<br>현재 배율과 남은 시간은 <b>콘텐츠 현황</b>에서 확인할 수 있습니다.</p><button type="button" class="rank-potion-action" data-potion-done>확인</button></section>`;
  body.querySelector('[data-potion-done]').onclick=()=>dialog.close();body.querySelector('[data-potion-done]').focus();
 };
 const render=(message='')=>{
  if(!active)return;clearInterval(clock);
  if(pending)item=rankPotionItem(pending.itemCode);
  const stock=state.items.find(x=>x.code===item.code);
  body.innerHTML=heading()+`<section class="rank-potion-current" aria-label="사용 후 효과"><p data-potion-current></p><strong data-potion-next></strong><p data-potion-replace></p></section><p class="rank-potion-rules">같은 배율은 남은 시간에 60분 추가<br>다른 배율은 새 배율로 교체 후 60분 적용<br>로그아웃 중에도 시간이 흐릅니다.</p><p class="rank-potion-stock">보유 <b>${stock.quantity.toLocaleString()}개</b> · 사용 시 1개 소모</p><div class="rank-potion-actions"><button type="button" class="rank-potion-action secondary" data-potion-cancel>취소</button><button type="button" class="rank-potion-action" data-potion-use></button></div><output role="status" aria-live="polite">${esc(message)}</output>`;
  const use=body.querySelector('[data-potion-use]'),status=body.querySelector('output');
  const update=()=>{
   const seconds=remaining(),current=state.buff.active&&seconds>0,same=current&&state.buff.multiplier===item.multiplier;
   body.querySelector('[data-potion-current]').textContent=current?'현재 ×'+state.buff.multiplier+' 적용 중 · '+duration(seconds)+' 남음':'현재 적용 중인 계급 경험치 물약 없음';
   body.querySelector('[data-potion-next]').textContent=pending?'이전 사용 결과를 먼저 확인하세요.':same?'×'+item.multiplier+' 유지 · 60분 추가':'×'+item.multiplier+' · 60분 시작';
   body.querySelector('[data-potion-replace]').textContent=current&&!same?'기존 ×'+state.buff.multiplier+'의 남은 시간은 사라지고 새 배율로 교체됩니다.':'';
   use.textContent=pending?'이전 사용 결과 확인':same?'60분 연장 · 1개 사용':current?'배율 교체 · 1개 사용':'60분 적용 · 1개 사용';
   use.disabled=busy||!pending&&(!stock.enabled||stock.quantity<1);
  };
  body.querySelector('[data-potion-cancel]').onclick=()=>dialog.close();
  use.onclick=async()=>{
   if(busy)return;busy=true;update();status.textContent='물약 사용 결과를 확인하고 있습니다…';
   try{
    const request=pending||{requestId:crypto.randomUUID(),itemCode:item.code,version:RANK_POTION_VERSION,expectedRevision:state.buff.revision};
    // Persist before spending the last item; inventory exposes this receipt even at zero stock.
    localStorage.setItem(key,JSON.stringify(request));pending=request;
    await resultView(await api('use',request));
   }catch(error){
    const terminal=error.code==='JOINT_OPERATION_SUPERSEDED'||String(error.code||'').startsWith('RANK_POTION_')&&error.retryable!==true;
    if(terminal){forget();try{setState(await api('options'));}catch{}}
    busy=false;render(error.message);
   }finally{busy=false;}
  };
  update();clock=setInterval(update,1000);
 };
 body.innerHTML=heading()+'<p role="status">보유 물약과 적용 중인 효과를 확인하고 있습니다…</p>';if(!dialog.open)dialog.showModal();
 try{
  const options=await api('options');if(!active)return;setState(options);pending=saved();
  const id=pending?.requestId||state.pendingRequestId;
  if(id){
   try{const receipt=await api('receipt?requestId='+encodeURIComponent(id));if(receipt.status==='COMPLETED'){await resultView(receipt);return;}pending={requestId:id,...receipt.input};localStorage.setItem(key,JSON.stringify(pending));}
   catch(error){if(error.code==='JOINT_NOT_FOUND'&&pending){/* Saved before reaching the server. */}else if(error.code==='JOINT_OPERATION_SUPERSEDED')forget();else throw error;}
  }
  render();
 }catch(error){if(active)body.innerHTML=heading()+'<p role="alert">'+esc(error.message)+'</p><p>창을 닫고 다시 열면 이전 사용 결과를 확인합니다.</p>';}
}
