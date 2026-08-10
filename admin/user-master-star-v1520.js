(() => {
  const $ = selector => document.querySelector(selector);
  const authToken = () => localStorage.getItem('cnine_admin_token') || sessionStorage.getItem('cnine_admin_token') || '';
  const block = (id,title,reason) => `<div class="actionBlock" id="${id}Block"><h3>${title} 지급·회수</h3><p class="muted">양수는 지급, 음수는 회수이며 모든 변경은 관리자 로그에 기록됩니다.</p><div class="two"><input id="${id}Amount" type="number" min="-1000000" max="1000000" step="1" placeholder="지급은 +, 회수는 -"><input id="${id}Reason" maxlength="100" value="${reason}" placeholder="처리 사유"></div><button type="button" id="${id}Btn">${title} 지급/회수</button><small id="${id}Balance" class="muted"></small></div>`;
  function mount(){
    const shardBlock=$('#shardAmount')?.closest('.actionBlock');if(!shardBlock||$('#specialCurrencyBlocks'))return;
    shardBlock.insertAdjacentHTML('afterend',`<div id="specialCurrencyBlocks">${block('masterStar','마스터의 별','관리자 마스터의 별 조정')}${block('magicCrystal','마법 결정','관리자 마법 결정 조정')}</div>`);
    $('#masterStarBtn').onclick=()=>adjust('masterStar','master-star','마스터의 별');
    $('#magicCrystalBtn').onclick=()=>adjust('magicCrystal','magic-crystal','마법 결정');
  }
  async function adjust(id,path,label){
    const userId=Number($('#selectedUserId')?.value||0),amount=Number($(`#${id}Amount`)?.value||0),reason=String($(`#${id}Reason`)?.value||'').trim();
    if(!userId)return alert('유저를 다시 선택하세요.');
    if(!Number.isInteger(amount)||amount===0||Math.abs(amount)>1000000)return alert('수량은 -1,000,000~1,000,000 범위의 0이 아닌 정수로 입력하세요.');
    if(!reason)return alert('처리 사유를 입력하세요.');
    if(!confirm(`${label} ${Math.abs(amount).toLocaleString()}개를 ${amount>0?'지급':'회수'}할까요?`))return;
    const button=$(`#${id}Btn`);button.disabled=true;
    try{
      const response=await fetch(`/api/admin/users/${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${authToken()}`},body:JSON.stringify({userId,amount,reason})});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`${label} 조정 실패`);
      $(`#${id}Balance`).textContent=`현재 보유 ${Number(data.balance||0).toLocaleString()}개`;$(`#${id}Amount`).value='';
      if(typeof window.loadUsers==='function')await window.loadUsers();
      alert(`${label} 처리가 완료되었습니다.\n현재 보유 ${Number(data.balance||0).toLocaleString()}개`);
    }catch(error){alert(error.message)}finally{button.disabled=false}
  }
  addEventListener('load',mount);new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true});mount();
})();
