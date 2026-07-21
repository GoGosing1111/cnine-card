/* CNINE LIMITED ACQUISITION AUDIT · v1109 */
(()=>{
  const rootId='view-limitedaudit';
  const statusLabels={
    COMPLETED:'지급 완료',LEGACY_CONFIRMED:'기존 기록 확인',COMPLETED_WITH_WARNING:'지급 완료·경고',MANUAL_COMPLETED:'수동 지급 완료',
    PENDING:'처리 대기',STOCK_RESERVED:'재고 예약',FAILED_ROLLED_BACK:'실패·원복',SOLD_OUT_REPLACED:'재고 소진·대체',FAILED:'실패',MANUAL_FAILED:'수동 지급 실패'
  };
  const sourceLabels={PACK:'카드팩',INVENTORY:'큐브·확정팩',ADMIN_MANUAL:'관리자 수동'};
  const h=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const number=value=>Number(value||0).toLocaleString();
  const date=value=>{if(!value)return '-';const raw=String(value).includes('T')?String(value):String(value).replace(' ','T')+'Z';const d=new Date(raw);return Number.isNaN(d.getTime())?h(value):d.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})};
  const el=id=>document.getElementById(id);
  let currentRole='';

  function build(){
    if(el(rootId))return;
    const nav=document.getElementById('nav');
    if(nav){
      const button=document.createElement('button');
      button.type='button';button.dataset.view='limitedaudit';button.id='limitedAuditNav';
      button.innerHTML='리미티드 감사·복구 <span class="buildBadge">NEW</span>';
      const before=nav.querySelector('[data-view="logs"]');nav.insertBefore(button,before||null);
      button.onclick=open;
    }
    const section=document.createElement('section');
    section.className='view';section.id=rootId;section.hidden=true;
    section.innerHTML=`
      <div class="sectionIntro limitedAuditIntro"><div><small>LIMITED ACQUISITION AUDIT</small><h2>리미티드 감사·복구</h2><p>리미티드 당첨, 재고 예약, 카드 지급 결과를 요청 단위로 확인합니다. 상세 정보와 수동 지급 도구는 기본적으로 접혀 있습니다.</p></div><button type="button" id="laRefreshBtn" class="ghost">새로고침</button></div>
      <div id="laStats" class="stats limitedAuditStats"></div>
      <details class="panel limitedAuditFold" open>
        <summary><span><b>감사 로그 검색</b><small>유저·카드·요청 ID로 기록 확인</small></span><em>펼치기 / 접기</em></summary>
        <div class="limitedAuditBody">
          <div class="limitedAuditFilters">
            <label><span>통합 검색</span><input id="laQuery" placeholder="닉네임, 카드명, 카드 ID, 요청 ID"></label>
            <label><span>상태</span><select id="laStatus"><option value="">전체 상태</option><option value="COMPLETED">지급 완료</option><option value="LEGACY_CONFIRMED">기존 기록 확인</option><option value="MANUAL_COMPLETED">수동 지급 완료</option><option value="FAILED_ROLLED_BACK">실패·원복</option><option value="SOLD_OUT_REPLACED">재고 소진·대체</option><option value="MANUAL_FAILED">수동 지급 실패</option></select></label>
            <label><span>획득 경로</span><select id="laSource"><option value="">전체 경로</option><option value="PACK">카드팩</option><option value="INVENTORY">큐브·확정팩</option><option value="ADMIN_MANUAL">관리자 수동</option></select></label>
            <label><span>시작일</span><input id="laFrom" type="date"></label>
            <label><span>종료일</span><input id="laTo" type="date"></label>
            <button type="button" id="laSearchBtn">검색</button>
          </div>
          <div id="laLogs" class="limitedAuditLogList"><div class="muted">기록을 불러오는 중입니다.</div></div>
        </div>
      </details>
      <details class="panel limitedAuditFold" id="laManualFold">
        <summary><span><b>수동 리미티드 카드 지급</b><small>증거 확인 후 OWNER가 직접 복구 또는 신규 지급</small></span><em>펼치기 / 접기</em></summary>
        <div class="limitedAuditBody" id="laManualBody">
          <div id="laOwnerNotice" class="inlineNotice">권한을 확인하는 중입니다.</div>
          <div id="laManualForm" hidden>
            <div class="limitedManualGrid">
              <div class="limitedSearchBox"><label><span>유저 검색</span><div><input id="laUserQuery" placeholder="닉네임 또는 유저 ID"><button type="button" id="laUserSearchBtn" class="ghost">검색</button></div></label><select id="laUserSelect" size="5"><option value="">검색 결과가 여기에 표시됩니다.</option></select></div>
              <div class="limitedSearchBox"><label><span>리미티드 카드 검색</span><div><input id="laCardQuery" placeholder="카드명, 멤버명 또는 카드 ID"><button type="button" id="laCardSearchBtn" class="ghost">검색</button></div></label><select id="laCardSelect" size="5"><option value="">카드를 불러오는 중입니다.</option></select></div>
            </div>
            <div id="laPreview" class="limitedGrantPreview muted">유저와 카드를 선택하면 현재 보유량과 한정 재고를 확인합니다.</div>
            <div class="limitedGrantFields">
              <label><span>지급 유형</span><select id="laGrantMode"><option value="RECOVERY">누락 복구 · 재고 추가 차감 없음</option><option value="ISSUE">운영 신규 지급 · 재고 1장 차감</option></select></label>
              <label><span>원본 요청 ID·참고번호</span><input id="laReferenceId" maxlength="120" placeholder="확인된 요청 ID가 있으면 입력"></label>
              <label class="wide"><span>지급 사유 <b>필수</b></span><input id="laReason" maxlength="300" placeholder="예: 2026-07-22 리미티드 획득 스크린샷 및 코인 차감 확인"></label>
              <label class="wide"><span>증거·확인 메모</span><textarea id="laEvidence" rows="3" maxlength="500" placeholder="스크린샷 시각, 확인한 로그, 민원 내용 등을 기록"></textarea></label>
              <label class="limitedDuplicateCheck wide"><input id="laAllowDuplicate" type="checkbox"><span>이미 보유 중이어도 중복 지급을 허용합니다. 보유 카드가 확인된 경우에만 사용하세요.</span></label>
            </div>
            <div class="limitedGrantActions"><button type="button" id="laGrantBtn" class="danger">리미티드 카드 1장 지급</button><small>모든 수동 지급은 관리자 로그와 리미티드 감사 로그에 영구 기록됩니다.</small></div>
          </div>
        </div>
      </details>`;
    document.getElementById('cms')?.appendChild(section);
    bind();
  }

  function bind(){
    el('laRefreshBtn').onclick=()=>loadLogs().catch(showError);
    el('laSearchBtn').onclick=()=>loadLogs().catch(showError);
    el('laQuery').onkeydown=e=>{if(e.key==='Enter')loadLogs().catch(showError)};
    el('laUserSearchBtn').onclick=()=>searchUsers().catch(showError);
    el('laUserQuery').onkeydown=e=>{if(e.key==='Enter')searchUsers().catch(showError)};
    el('laCardSearchBtn').onclick=()=>searchCards().catch(showError);
    el('laCardQuery').onkeydown=e=>{if(e.key==='Enter')searchCards().catch(showError)};
    el('laUserSelect').onchange=loadPreview;
    el('laCardSelect').onchange=loadPreview;
    el('laGrantMode').onchange=loadPreview;
    el('laGrantBtn').onclick=grantLimited;
  }

  function showError(error){alert(error?.message||'처리 중 오류가 발생했습니다.');}

  async function open(){
    document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==rootId);
    document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view==='limitedaudit'));
    const title=el('pageTitle');if(title)title.textContent='리미티드 감사·복구';
    await Promise.all([loadLogs(),searchCards()]).catch(showError);
  }

  function filters(){
    const p=new URLSearchParams();
    const values={q:el('laQuery').value.trim(),status:el('laStatus').value,source:el('laSource').value,from:el('laFrom').value,to:el('laTo').value};
    Object.entries(values).forEach(([k,v])=>{if(v)p.set(k,v)});p.set('limit','100');return p.toString();
  }

  async function loadLogs(){
    el('laLogs').innerHTML='<div class="muted">감사 기록을 불러오는 중입니다.</div>';
    const d=await api('admin/limited-audit?'+filters());currentRole=String(d.role||'').toUpperCase();
    renderStats(d.stats||{});renderLogs(d.logs||[]);renderRole();
  }

  function renderStats(stats){
    el('laStats').innerHTML=[['전체 기록',stats.total||0,'기존 LIMITED 기록 포함'],['정상 지급',stats.completed||0,'카드 지급 확인'],['실패·대체',stats.failed||0,'원복 또는 재고 소진'],['수동 지급',stats.manual||0,'OWNER 처리 건']].map(x=>`<div class="stat"><small>${x[0]}</small><b>${number(x[1])}</b><span>${x[2]}</span></div>`).join('');
  }

  function statusClass(status){return String(status||'').includes('FAILED')||status==='SOLD_OUT_REPLACED'?'fail':String(status||'').includes('PENDING')||status==='STOCK_RESERVED'?'pending':'ok'}
  function renderLogs(logs){
    if(!logs.length){el('laLogs').innerHTML='<div class="muted limitedAuditEmpty">조건에 맞는 리미티드 기록이 없습니다.</div>';return;}
    el('laLogs').innerHTML=logs.map(row=>{
      const status=statusLabels[row.status]||row.status,source=sourceLabels[row.source_type]||row.source_type,stockBefore=row.stock_before==null?'-':number(row.stock_before),stockAfter=row.stock_after==null?'-':number(row.stock_after),qtyBefore=row.quantity_before==null?'-':number(row.quantity_before),qtyAfter=row.quantity_after==null?'-':number(row.quantity_after);
      const canPrefill=currentRole==='OWNER'&&row.user_id&&row.card_id;
      return `<details class="limitedAuditRow ${statusClass(row.status)}">
        <summary><span class="limitedAuditStatus">${h(status)}</span><span class="limitedAuditMain"><b>${h(row.currentNickname||row.user_nickname||('#'+row.user_id))}</b><strong>${h(row.currentCardTitle||row.card_title||row.card_id)}</strong><small>${h(source)} · ${date(row.created_at)}</small></span><code>${h(row.request_id||row.draw_group_id||row.event_key)}</code></summary>
        <div class="limitedAuditDetail">
          <dl><div><dt>유저 ID</dt><dd>${number(row.user_id)}</dd></div><div><dt>카드 ID</dt><dd>${h(row.card_id)}</dd></div><div><dt>현재 보유</dt><dd>${number(row.currentOwnedQuantity)}장</dd></div><div><dt>당시 보유 변화</dt><dd>${qtyBefore} → ${qtyAfter}</dd></div><div><dt>재고 발급 변화</dt><dd>${stockBefore} → ${stockAfter}</dd></div><div><dt>현재 서버 재고</dt><dd>${row.currentLimitedTotal==null?'-':`${number(row.currentIssuedCount)} / ${number(row.currentLimitedTotal)}`}</dd></div><div><dt>팩·출처</dt><dd>${h(row.pack_id||row.source_id||'-')}</dd></div><div><dt>코인 비용</dt><dd>${number(row.coin_cost)}</dd></div><div><dt>카드 지급</dt><dd>${row.card_granted?'완료':'미완료'}</dd></div><div><dt>재고 예약</dt><dd>${row.stock_reserved?'처리됨':'미처리'}</dd></div></dl>
          ${row.error_message?`<p class="limitedAuditError"><b>오류</b>${h(row.error_message)}</p>`:''}
          ${row.admin_reason||row.evidence_note?`<p class="limitedAuditMemo"><b>${h(row.adminNickname||'관리자')} 기록</b>${h(row.admin_reason||'')} ${h(row.evidence_note||'')}</p>`:''}
          ${canPrefill?`<button type="button" class="ghost limitedPrefillBtn" data-user-id="${row.user_id}" data-user-name="${h(row.currentNickname||row.user_nickname)}" data-card-id="${h(row.card_id)}" data-card-title="${h(row.currentCardTitle||row.card_title)}" data-request-id="${h(row.request_id||row.draw_group_id||'')}">수동 복구 양식에 불러오기</button>`:''}
        </div></details>`;
    }).join('');
    document.querySelectorAll('.limitedPrefillBtn').forEach(btn=>btn.onclick=()=>prefill(btn.dataset));
  }

  function renderRole(){
    const owner=currentRole==='OWNER';el('laManualForm').hidden=!owner;
    el('laOwnerNotice').textContent=owner?'OWNER 전용 지급 도구입니다. 누락 복구는 기존 재고를 추가 차감하지 않으며, 운영 신규 지급만 재고를 차감합니다.':'현재 계정은 조회만 가능합니다. 리미티드 수동 지급은 OWNER 전용입니다.';
    el('laOwnerNotice').classList.toggle('warn',!owner);
  }

  async function searchUsers(){
    const q=el('laUserQuery').value.trim();if(!q)return alert('유저 닉네임 또는 ID를 입력하세요.');
    const d=await api('admin/limited-audit/options?type=users&q='+encodeURIComponent(q));
    el('laUserSelect').innerHTML=d.users?.length?d.users.map(u=>`<option value="${u.id}" data-name="${h(u.nickname)}">#${u.id} · ${h(u.nickname)} · ${h(u.role)}</option>`).join(''):'<option value="">검색 결과 없음</option>';
    if(d.users?.length===1)el('laUserSelect').selectedIndex=0;loadPreview();
  }

  async function searchCards(){
    const q=el('laCardQuery')?.value.trim()||'';
    const d=await api('admin/limited-audit/options?type=cards&q='+encodeURIComponent(q));
    el('laCardSelect').innerHTML=d.cards?.length?d.cards.map(c=>`<option value="${h(c.id)}" data-title="${h(c.title)}">${h(c.title)} · ${h(c.name)} · 잔여 ${number(c.remaining)}</option>`).join(''):'<option value="">검색 결과 없음</option>';
    loadPreview();
  }

  async function loadPreview(){
    const userId=Number(el('laUserSelect').value||0),cardId=el('laCardSelect').value,box=el('laPreview');
    if(!userId||!cardId){box.className='limitedGrantPreview muted';box.textContent='유저와 카드를 선택하면 현재 보유량과 한정 재고를 확인합니다.';return;}
    try{
      const d=await api(`admin/limited-audit/preview?userId=${userId}&cardId=${encodeURIComponent(cardId)}`),p=d.preview,mode=el('laGrantMode').value;
      const issueBlocked=mode==='ISSUE'&&Number(p.remaining||0)<=0,owned=Number(p.ownedQuantity||0)>0;
      box.className='limitedGrantPreview '+(issueBlocked||owned?'warn':'ok');
      box.innerHTML=`<div><small>대상 유저</small><b>#${p.userId} ${h(p.nickname)}</b><span>${h(p.status)}</span></div><div><small>선택 카드</small><b>${h(p.title)}</b><span>${h(p.name)} · ${h(p.cardStatus)}</span></div><div><small>현재 보유</small><b>${number(p.ownedQuantity)}장</b><span>${owned?'중복 지급 확인 필요':'미보유'}</span></div><div><small>한정 재고</small><b>${number(p.remaining)}장</b><span>${number(p.issuedCount)} / ${number(p.limitedTotal)}</span></div>${issueBlocked?'<p>운영 신규 지급은 잔여 재고가 없어 진행할 수 없습니다. 실제 누락 복구 건만 재고 미차감 유형으로 처리하세요.</p>':''}`;
    }catch(error){box.className='limitedGrantPreview fail';box.textContent=error.message;}
  }

  function prefill(data){
    el('laManualFold').open=true;
    el('laUserSelect').innerHTML=`<option value="${h(data.userId)}" selected>#${h(data.userId)} · ${h(data.userName)}</option>`;
    el('laCardSelect').innerHTML=`<option value="${h(data.cardId)}" selected>${h(data.cardTitle)} · ${h(data.cardId)}</option>`;
    el('laReferenceId').value=data.requestId||'';
    el('laReason').value='기존 리미티드 획득 기록 확인 후 누락 복구';
    el('laEvidence').value=`감사 로그 요청 ID: ${data.requestId||'없음'}`;
    el('laGrantMode').value='RECOVERY';
    loadPreview();el('laManualFold').scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function grantLimited(){
    const userId=Number(el('laUserSelect').value||0),cardId=el('laCardSelect').value,grantMode=el('laGrantMode').value,reason=el('laReason').value.trim(),referenceRequestId=el('laReferenceId').value.trim(),evidenceNote=el('laEvidence').value.trim(),allowDuplicate=el('laAllowDuplicate').checked;
    if(!userId||!cardId)return alert('유저와 리미티드 카드를 선택하세요.');
    if(reason.length<3)return alert('수동 지급 사유를 3자 이상 입력하세요.');
    const userText=el('laUserSelect').selectedOptions[0]?.textContent||userId,cardText=el('laCardSelect').selectedOptions[0]?.textContent||cardId,modeText=grantMode==='RECOVERY'?'누락 복구·재고 미차감':'운영 신규 지급·재고 1장 차감';
    if(!confirm(`${userText}\n${cardText}\n\n${modeText}\n리미티드 카드 1장을 지급할까요?`))return;
    const btn=el('laGrantBtn');btn.disabled=true;const old=btn.textContent;btn.textContent='지급 처리 중...';
    try{
      const d=await api('admin/limited-audit',{method:'POST',body:JSON.stringify({action:'MANUAL_GRANT',requestId:crypto.randomUUID(),referenceRequestId,userId,cardId,grantMode,reason,evidenceNote,allowDuplicate})});
      alert(`${d.nickname} 유저에게 ${d.title} 1장을 지급했습니다.\n보유량 ${d.quantityBefore} → ${d.quantityAfter}\n재고 발급 ${d.stockBefore} → ${d.stockAfter}`);
      el('laAllowDuplicate').checked=false;await Promise.all([loadLogs(),loadPreview()]);
    }catch(error){showError(error)}finally{btn.disabled=false;btn.textContent=old}
  }

  build();
})();
