(()=>{
  const originalOpenUser=window.openUser;
  if(typeof originalOpenUser!=='function'||typeof api!=='function')return;
  let selectedCard=null,searchTimer=null;
  const byId=id=>document.getElementById(id);
  const escapeHtml=value=>String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

  function ensureGrantBlock(){
    let block=byId('userCardGrantBlock');
    if(block)return block;
    const anchor=byId('inventoryGrantBlock')||[...document.querySelectorAll('#userDialog .actionBlock')].find(node=>node.querySelector('h3')?.textContent.includes('계정 관리'));
    if(!anchor)return null;
    anchor.insertAdjacentHTML('beforebegin',`<div class="actionBlock userCardGrantBlock" id="userCardGrantBlock">
      <div class="userCardGrantHead"><div><h3>카드 개별 수동 지급</h3><p>PRESTIGE 지급 가능 · LIMITED 제외 · 공개 활성 카드만 지급 · 기존 보유 카드는 동일 강화 수치일 때만 수량이 증가합니다.</p></div><span>PRESTIGE READY</span></div>
      <div class="userCardGrantSearch"><input id="userCardGrantSearch" maxlength="60" placeholder="카드명, 멤버명, 카드 ID, 등급 검색"><button type="button" id="userCardGrantSearchBtn" class="ghost">카드 검색</button></div>
      <select id="userCardGrantCardSelect"><option value="">카드를 검색하세요.</option></select>
      <div id="userCardGrantPreview" class="userCardGrantPreview">선택한 유저의 카드 보유 상태와 허용 강화 범위를 서버에서 확인합니다.</div>
      <div class="two"><label class="field"><span>지급 강화 수치</span><input id="userCardGrantLevel" type="number" min="0" max="0" step="1" value="0" disabled></label><label class="field"><span>지급 사유</span><input id="userCardGrantReason" maxlength="200" value="관리자 카드 수동 지급" placeholder="지급 사유"></label></div>
      <button type="button" id="userCardGrantSubmit" disabled>선택 카드 지급</button>
      <div id="userCardGrantStatus" class="userCardGrantStatus"></div>
    </div>`);
    block=byId('userCardGrantBlock');
    byId('userCardGrantSearchBtn').onclick=()=>loadGrantCards();
    byId('userCardGrantSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();loadGrantCards();}};
    byId('userCardGrantSearch').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadGrantCards(),300);};
    byId('userCardGrantCardSelect').onchange=selectGrantCard;
    byId('userCardGrantLevel').oninput=refreshGrantPreview;
    byId('userCardGrantSubmit').onclick=grantSelectedCard;
    return block;
  }

  function selectedUser(){
    const userId=Number(byId('selectedUserId')?.value||0);
    const user=Array.isArray(state?.users)?state.users.find(row=>Number(row.id)===userId):null;
    return {userId,nickname:user?.nickname||byId('userDialogTitle')?.textContent?.replace(/ 관리$/,'')||''};
  }

  function renderCardOptions(cards){
    const select=byId('userCardGrantCardSelect');
    select._cards=Array.isArray(cards)?cards:[];
    select.innerHTML='<option value="">지급할 카드를 선택하세요.</option>'+select._cards.map(card=>{
      const owned=Number(card.ownedQuantity||0)>0?`보유 ${Number(card.ownedQuantity)}장 · +${Number(card.breakthroughLevel||0)}`:'미보유';
      return `<option value="${escapeHtml(card.id)}">[${escapeHtml(card.grade)}] ${escapeHtml(card.name)} · ${escapeHtml(card.title)} — ${owned}</option>`;
    }).join('');
    selectedCard=null;
    byId('userCardGrantLevel').value='0';
    byId('userCardGrantLevel').max='0';
    byId('userCardGrantLevel').disabled=true;
    byId('userCardGrantSubmit').disabled=true;
    byId('userCardGrantPreview').textContent=select._cards.length?'검색 결과에서 지급할 카드를 선택하세요.':'검색 조건에 맞는 지급 가능 카드가 없습니다.';
  }

  async function loadGrantCards(){
    const {userId}=selectedUser();
    if(!userId)return;
    const q=byId('userCardGrantSearch')?.value.trim()||'';
    const status=byId('userCardGrantStatus'),button=byId('userCardGrantSearchBtn');
    button.disabled=true;status.textContent='카드 목록 확인 중...';status.className='userCardGrantStatus loading';
    try{
      const data=await api(`admin/users/card-grant?userId=${userId}&q=${encodeURIComponent(q)}`);
      renderCardOptions(data.cards||[]);
      status.textContent=`PRESTIGE 포함 · LIMITED 제외 · 지급 가능 카드 ${Number(data.cards?.length||0)}개`;
      status.className='userCardGrantStatus ok';
    }catch(error){
      renderCardOptions([]);status.textContent=error.message;status.className='userCardGrantStatus error';
    }finally{button.disabled=false;}
  }

  function selectGrantCard(){
    const select=byId('userCardGrantCardSelect');
    selectedCard=(select._cards||[]).find(card=>String(card.id)===select.value)||null;
    const level=byId('userCardGrantLevel');
    if(!selectedCard){level.value='0';level.max='0';level.disabled=true;byId('userCardGrantSubmit').disabled=true;refreshGrantPreview();return;}
    const max=Math.max(0,Number(selectedCard.maxBreakthrough||0));
    level.max=String(max);
    level.value=Number(selectedCard.ownedQuantity||0)>0?String(Number(selectedCard.breakthroughLevel||0)):'0';
    level.disabled=max===0;
    byId('userCardGrantSubmit').disabled=false;
    refreshGrantPreview();
  }

  function refreshGrantPreview(){
    const preview=byId('userCardGrantPreview');
    if(!selectedCard){preview.textContent='선택한 유저의 카드 보유 상태와 허용 강화 범위를 서버에서 확인합니다.';return;}
    const owned=Number(selectedCard.ownedQuantity||0),current=Number(selectedCard.breakthroughLevel||0),max=Number(selectedCard.maxBreakthrough||0),requested=Number(byId('userCardGrantLevel').value||0);
    if(owned>0){
      preview.innerHTML=`<b>${escapeHtml(selectedCard.grade)} · ${escapeHtml(selectedCard.name)} · ${escapeHtml(selectedCard.title)}</b><span>현재 ${owned}장 · 강화 +${current}</span><em class="${requested===current?'safe':'blocked'}">같은 카드의 별도 강화 행은 생성되지 않습니다. ${requested===current?'동일 강화값으로 수량 1장 증가 가능':'현재 강화값과 달라 서버에서 지급 차단'}</em>`;
    }else{
      preview.innerHTML=`<b>${escapeHtml(selectedCard.grade)} · ${escapeHtml(selectedCard.name)} · ${escapeHtml(selectedCard.title)}</b><span>현재 미보유 · 지정 강화 +${requested}로 신규 지급</span><em class="safe">허용 범위 +0 ~ +${max}</em>`;
    }
  }

  async function grantSelectedCard(){
    const {userId,nickname}=selectedUser(),level=Number(byId('userCardGrantLevel').value),reason=byId('userCardGrantReason').value.trim();
    if(!userId||!selectedCard)return alert('유저와 카드를 선택하세요.');
    if(!Number.isInteger(level)||level<0||level>Number(selectedCard.maxBreakthrough||0))return alert(`강화 수치는 0~${Number(selectedCard.maxBreakthrough||0)} 사이의 정수로 입력하세요.`);
    if(!reason)return alert('지급 사유를 입력하세요.');
    const owned=Number(selectedCard.ownedQuantity||0),current=Number(selectedCard.breakthroughLevel||0);
    if(owned>0&&level!==current)return alert(`현재 보유 카드가 +${current}이므로 +${level} 지급은 불가능합니다. 동일 강화 수치로 지정하세요.`);
    const duplicateText=owned>0?`\n기존 보유 ${owned}장(+${current})에 수량 1장을 추가합니다.`:`\n신규 카드 +${level}로 지급합니다.`;
    if(!confirm(`${nickname} 유저에게 아래 카드를 지급할까요?\n\n[${selectedCard.grade}] ${selectedCard.name} · ${selectedCard.title}${duplicateText}\n사유: ${reason}`))return;
    const button=byId('userCardGrantSubmit'),status=byId('userCardGrantStatus');
    button.disabled=true;button.textContent='지급 처리 중...';status.textContent='서버 검증 및 관리자 로그 기록 중...';status.className='userCardGrantStatus loading';
    try{
      const result=await api('admin/users/card-grant',{method:'POST',body:JSON.stringify({requestId:crypto.randomUUID(),userId,cardId:selectedCard.id,breakthroughLevel:level,reason})});
      status.textContent=`지급 완료 · ${result.quantityBefore}장 → ${result.quantityAfter}장 · +${result.breakthroughLevel}`;status.className='userCardGrantStatus ok';
      alert(`${result.user.nickname} 카드 지급 완료\n[${result.card.grade}] ${result.card.name} · ${result.card.title}\n수량 ${result.quantityBefore}장 → ${result.quantityAfter}장\n강화 +${result.breakthroughLevel}`);
      await loadGrantCards();
      if(typeof loadUsers==='function')await loadUsers();
    }catch(error){status.textContent=error.message;status.className='userCardGrantStatus error';alert(error.message);}
    finally{button.disabled=false;button.textContent='선택 카드 지급';}
  }

  window.openUser=function(id){
    originalOpenUser(id);
    ensureGrantBlock();
    selectedCard=null;
    byId('userCardGrantSearch').value='';
    byId('userCardGrantReason').value='관리자 카드 수동 지급';
    byId('userCardGrantStatus').textContent='';
    renderCardOptions([]);
    loadGrantCards();
  };
})();
