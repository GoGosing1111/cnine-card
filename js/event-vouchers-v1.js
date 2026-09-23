// Previously awarded vouchers remain usable after the axe event is retired.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function openEventVoucher({itemCode,userId,dialog,body,token,refresh}){
 let busy=false,target=null,pending=null;const key=`cnine.golden-axe.item.v1:${userId}:${itemCode}`,isUpgrade=itemCode==='SUPERSTAR_UPGRADE_13_TICKET';
 const api=async(path,data)=>{const r=await fetch('/api/events/golden-axe/'+path,{method:data?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(30000)}),v=await r.json();if(!r.ok)throw Object.assign(Error(v.error||'사용 결과 확인 실패'),{status:r.status});return v;};
 body.innerHTML='<h2>선택권 사용</h2><p>보유 아이템과 대상을 확인하고 있습니다…</p>';dialog.showModal();
 try{
  const data=await api('item-options?itemCode='+encodeURIComponent(itemCode));try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  body.innerHTML=`<h2>${isUpgrade?'슈퍼스타 +13 강화권':'차량부품 150개 선택권'}</h2><p>이벤트 종료와 관계없이 보유한 선택권을 사용할 수 있습니다.<br>${isUpgrade?'보유한 +0~+12 슈퍼스타 카드 1종을 선택하세요. 카드 수량과 다른 재료는 소모하지 않습니다.':'부품 하나를 골라 150개를 받으세요. 선택권 1개가 소모됩니다.'}</p><div class="ck-vouchers">${data.choices.map(c=>`<button type="button" data-target="${esc(c.code)}" aria-pressed="false"><img src="${esc(c.image)}" alt=""><span>${esc(c.name)} ${isUpgrade?'+'+c.level:'×150'}</span></button>`).join('')||'<p>사용 가능한 대상이 없습니다.</p>'}</div><button class="ck-primary" data-confirm disabled>대상을 선택하세요</button><output role="status"></output>`;
  const confirm=body.querySelector('[data-confirm]'),output=body.querySelector('output');
  const select=code=>{target=code;body.querySelectorAll('[data-target]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.target===target)));confirm.disabled=false;confirm.textContent=pending?'이전 사용 결과 확인':isUpgrade?'선택 카드 +13으로 강화':'선택 부품 150개 받기';};
  body.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{if(!busy&&!pending)select(b.dataset.target);});if(pending)select(pending.target);
  confirm.onclick=async()=>{if(busy||!target)return;busy=true;confirm.disabled=true;body.querySelectorAll('[data-target]').forEach(b=>b.disabled=true);
   try{const request=pending||{requestId:crypto.randomUUID(),itemCode,target};localStorage.setItem(key,JSON.stringify(request));pending=request;const result=await api('use-item',request);localStorage.removeItem(key);pending=null;body.innerHTML=`<h2>${isUpgrade?'강화 완료':'부품 지급 완료'}</h2><p>${esc(result.reward.name)} ${isUpgrade?'+13':'150개'}<br>인벤토리와 카드 정보에 반영되었습니다.</p><a class="ck-quiet" href="/?screen=${isUpgrade?'dex':'inventory'}">보유 상품 확인 ↗</a>`;await refresh().catch(()=>{});}
   catch(e){if(e.status>=400&&e.status<500&&![408,429].includes(e.status)){localStorage.removeItem(key);pending=null;}output.textContent=e.message;confirm.disabled=false;confirm.textContent=pending?'같은 요청 결과 다시 확인':'다시 사용';body.querySelectorAll('[data-target]').forEach(b=>b.disabled=Boolean(pending));}finally{busy=false;}
  };
 }catch(e){body.innerHTML='<h2>선택권 사용</h2><p>'+esc(e.message)+'</p>';}
}
