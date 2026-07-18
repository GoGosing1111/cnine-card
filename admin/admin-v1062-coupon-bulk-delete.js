/* V1062 - CMS 발급 쿠폰 다중 선택·안전 삭제 */
(()=>{
  const selectedCouponIds=new Set();
  let couponsCache=[];
  let loading=false;

  const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  })[ch]);
  const number=value=>Number(value||0).toLocaleString('ko-KR');
  const shortDate=value=>value?String(value).replace('T',' ').replace(/\.000Z$/,'').slice(0,16):'제한 없음';

  function statusOf(coupon){
    if(Number(coupon.is_active)!==1)return {label:'중지',className:'off'};
    const now=Date.now();
    const starts=coupon.starts_at?Date.parse(String(coupon.starts_at).replace(' ','T')):NaN;
    const ends=coupon.ends_at?Date.parse(String(coupon.ends_at).replace(' ','T')):NaN;
    if(Number.isFinite(starts)&&starts>now)return {label:'대기',className:'wait'};
    if(Number.isFinite(ends)&&ends<now)return {label:'종료',className:'expired'};
    if(Number(coupon.used_count||0)>=Number(coupon.max_uses||0))return {label:'소진',className:'used'};
    return {label:'사용 가능',className:'on'};
  }

  function syncSelectionUi(){
    const root=document.querySelector('#coupons');
    if(!root)return;
    const existingIds=new Set(couponsCache.map(c=>Number(c.id)));
    for(const id of [...selectedCouponIds])if(!existingIds.has(id))selectedCouponIds.delete(id);
    root.querySelectorAll('[data-coupon-select]').forEach(input=>{input.checked=selectedCouponIds.has(Number(input.dataset.couponSelect));});
    const all=root.querySelector('#couponBulkSelectAll');
    if(all){
      all.checked=couponsCache.length>0&&selectedCouponIds.size===couponsCache.length;
      all.indeterminate=selectedCouponIds.size>0&&selectedCouponIds.size<couponsCache.length;
    }
    const count=root.querySelector('#couponBulkSelectedCount');
    if(count)count.textContent=`${selectedCouponIds.size.toLocaleString()}개 선택`;
    const remove=root.querySelector('#couponBulkDeleteBtn');
    if(remove)remove.disabled=selectedCouponIds.size===0;
  }

  function renderCoupons(){
    const root=document.querySelector('#coupons');
    if(!root)return;
    const rows=couponsCache.map(coupon=>{
      const status=statusOf(coupon);
      const id=Number(coupon.id);
      return `<div class="couponBulkRow" data-coupon-row="${id}">
        <label class="couponBulkCheck" title="${escapeHtml(coupon.code)} 선택"><input type="checkbox" data-coupon-select="${id}"><span></span></label>
        <div class="couponBulkCode"><small>COUPON CODE</small><b>${escapeHtml(coupon.code)}</b><em>#${id}</em></div>
        <div class="couponBulkReward"><small>보상 코인</small><strong>${number(coupon.reward_coin)}</strong></div>
        <div class="couponBulkUsage"><small>사용 현황</small><b>${number(coupon.used_count)} / ${number(coupon.max_uses)}</b><div><i style="width:${Math.min(100,Math.max(0,(Number(coupon.used_count||0)/Math.max(1,Number(coupon.max_uses||1)))*100))}%"></i></div></div>
        <div class="couponBulkPeriod"><small>사용 기간</small><span>${shortDate(coupon.starts_at)}</span><span>${shortDate(coupon.ends_at)}</span></div>
        <div class="couponBulkActions"><span class="couponBulkStatus ${status.className}">${status.label}</span><button type="button" class="ghost" data-coupon-toggle="${id}" data-next-active="${Number(coupon.is_active)===1?'0':'1'}">${Number(coupon.is_active)===1?'중지':'재개'}</button></div>
      </div>`;
    }).join('');

    root.innerHTML=`<div class="couponBulkManager">
      <div class="couponBulkToolbar panel">
        <div class="couponBulkToolbarTitle"><small>ISSUED COUPONS</small><h3>발급된 쿠폰 <span>${couponsCache.length.toLocaleString()}</span></h3><p>체크한 쿠폰을 한 번에 삭제할 수 있습니다. 삭제된 쿠폰은 즉시 사용 중지되며 사용 기록은 보존됩니다.</p></div>
        <div class="couponBulkToolbarActions">
          <label class="couponBulkSelectAll"><input id="couponBulkSelectAll" type="checkbox"><span>전체 선택</span></label>
          <b id="couponBulkSelectedCount">0개 선택</b>
          <button type="button" id="couponBulkDeleteBtn" class="danger" disabled>선택 삭제</button>
        </div>
      </div>
      <div class="couponBulkList">${rows||'<div class="couponBulkEmpty"><b>발급된 쿠폰이 없습니다.</b><span>새 쿠폰을 발급하면 이곳에서 관리할 수 있습니다.</span></div>'}</div>
    </div>`;

    root.querySelector('#couponBulkSelectAll')?.addEventListener('change',event=>{
      selectedCouponIds.clear();
      if(event.target.checked)for(const coupon of couponsCache)selectedCouponIds.add(Number(coupon.id));
      syncSelectionUi();
    });
    root.querySelectorAll('[data-coupon-select]').forEach(input=>input.addEventListener('change',()=>{
      const id=Number(input.dataset.couponSelect);
      if(input.checked)selectedCouponIds.add(id);else selectedCouponIds.delete(id);
      syncSelectionUi();
    }));
    root.querySelector('#couponBulkDeleteBtn')?.addEventListener('click',deleteSelectedCoupons);
    root.querySelectorAll('[data-coupon-toggle]').forEach(button=>button.addEventListener('click',()=>toggleCoupon(button)));
    syncSelectionUi();
  }

  async function loadCouponBulkAdmin(){
    if(loading)return;
    const root=document.querySelector('#coupons');
    if(!root||typeof window.api!=='function')return;
    loading=true;
    root.innerHTML='<div class="panel couponBulkLoading">발급 쿠폰을 불러오는 중입니다.</div>';
    try{
      const data=await window.api('admin/coupons');
      couponsCache=Array.isArray(data?.coupons)?data.coupons:[];
      renderCoupons();
    }catch(error){
      root.innerHTML=`<div class="panel couponBulkError"><b>쿠폰 목록을 불러오지 못했습니다.</b><span>${escapeHtml(error?.message||String(error))}</span><button type="button" id="couponBulkRetry">다시 시도</button></div>`;
      root.querySelector('#couponBulkRetry')?.addEventListener('click',loadCouponBulkAdmin);
    }finally{loading=false;}
  }

  async function deleteSelectedCoupons(){
    const ids=[...selectedCouponIds];
    if(!ids.length)return alert('삭제할 쿠폰을 선택하세요.');
    const selected=couponsCache.filter(c=>ids.includes(Number(c.id)));
    const usedCount=selected.filter(c=>Number(c.used_count||0)>0).length;
    const usedNotice=usedCount?`\n이 중 ${usedCount.toLocaleString()}개는 사용 기록이 있습니다. 사용 기록은 삭제하지 않고 보존됩니다.`:'';
    if(!confirm(`선택한 쿠폰 ${ids.length.toLocaleString()}개를 삭제할까요?\n삭제 즉시 해당 쿠폰은 더 이상 사용할 수 없습니다.${usedNotice}`))return;
    const button=document.querySelector('#couponBulkDeleteBtn');
    const original=button?.textContent||'선택 삭제';
    if(button){button.disabled=true;button.textContent='삭제 중...';}
    try{
      const result=await window.api('admin/coupons',{method:'DELETE',body:JSON.stringify({ids})});
      selectedCouponIds.clear();
      alert(`${Number(result?.deletedCount||0).toLocaleString()}개의 쿠폰을 삭제했습니다.`);
      await loadCouponBulkAdmin();
    }catch(error){alert(error?.message||String(error));}
    finally{if(button&&document.body.contains(button)){button.disabled=false;button.textContent=original;}}
  }

  async function toggleCoupon(button){
    const id=Number(button.dataset.couponToggle),isActive=button.dataset.nextActive==='1';
    button.disabled=true;
    try{
      await window.api('admin/coupons',{method:'PATCH',body:JSON.stringify({id,isActive})});
      await loadCouponBulkAdmin();
    }catch(error){alert(error?.message||String(error));button.disabled=false;}
  }

  function installCreateHandler(){
    const button=document.querySelector('#createCouponBtn');
    if(!button||button.dataset.v1062Bound==='1')return;
    button.dataset.v1062Bound='1';
    button.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      const code=String(document.querySelector('#couponCode')?.value||'').trim().toUpperCase().replace(/\s+/g,'');
      const rewardCoin=Number(document.querySelector('#couponReward')?.value||0);
      const maxUses=Number(document.querySelector('#couponMax')?.value||0);
      const startsAt=document.querySelector('#couponStart')?.value||null;
      const endsAt=document.querySelector('#couponEnd')?.value||null;
      if(!/^[A-Z0-9_-]{4,40}$/.test(code))return alert('쿠폰 코드는 영문 대문자·숫자·_·- 조합 4~40자로 입력하세요.');
      if(!Number.isInteger(rewardCoin)||rewardCoin<1)return alert('보상 코인을 확인하세요.');
      if(!Number.isInteger(maxUses)||maxUses<1)return alert('최대 사용 횟수를 확인하세요.');
      const original=button.textContent;button.disabled=true;button.textContent='발급 중...';
      try{
        await window.api('admin/coupons',{method:'POST',body:JSON.stringify({code,rewardCoin,maxUses,startsAt,endsAt})});
        const input=document.querySelector('#couponCode');if(input)input.value='';
        alert(`${code} 쿠폰을 발급했습니다.`);
        selectedCouponIds.clear();
        await loadCouponBulkAdmin();
      }catch(error){alert(error?.message||String(error));}
      finally{button.disabled=false;button.textContent=original;}
    },true);
  }

  function installViewOverride(){
    if(typeof show!=='function'||show.__v1062CouponOverride)return;
    const oldShow=show;
    const patched=function(view,prefetched){
      if(view!=='coupons')return oldShow(view,prefetched);
      if(typeof state==='object'&&state)state.view='coupons';
      document.querySelectorAll('.view').forEach(section=>{section.hidden=section.id!=='view-coupons';});
      document.querySelectorAll('#nav button').forEach(button=>button.classList.toggle('active',button.dataset.view==='coupons'));
      const title=document.querySelector('#pageTitle');if(title)title.textContent='쿠폰관리';
      loadCouponBulkAdmin();
    };
    patched.__v1062CouponOverride=true;
    show=patched;
  }

  function install(){installCreateHandler();installViewOverride();}
  install();
  document.addEventListener('DOMContentLoaded',install,{once:true});
  document.querySelector('[data-view="coupons"]')?.addEventListener('click',()=>setTimeout(loadCouponBulkAdmin,20));
})();
