(() => {
  'use strict';

  const api=(path,options={},control={})=>window.apiRequest(path,options,control);
  const esc=value=>String(value??'').replace(/[&<>"']/g,token=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[token]));
  const fmt=value=>Math.max(0,Number(value)||0).toLocaleString('ko-KR');
  const typeLabels={PERSONAL:'족장 개인 집행',PREDICTION_SUBSIDY:'승부예측 지원금',TOP_CLAN_DIVIDEND:'1위 클랜 균등 지급'};
  let state=null,pollTimer=0,busy=false;

  function view(){
    return `<section class="at-shell" data-administration-treasury>
      <header class="at-command">
        <div class="at-command-mark" aria-hidden="true"><span></span><i></i></div>
        <div><small>SOOPKETMON / PUBLIC FINANCE OFFICE</small><h1>행정부 재정금고</h1><p>상점의 실제 코인 판매액을 투명하게 집계하고 승인된 예산만 집행합니다.</p></div>
        <button type="button" class="at-refresh" data-at-refresh aria-label="재정 현황 새로고침">새로고침</button>
      </header>
      <main class="at-stage" id="atStage"><div class="at-loading"><span></span><b>재정 원장을 확인하는 중입니다</b></div></main>
    </section>`;
  }

  function proposalCard(proposal){
    const status=String(proposal.status||''),pending=status==='PENDING',approved=status==='APPROVED',amount=approved?proposal.executed_amount:proposal.requested_amount;
    return `<article class="at-proposal is-${status.toLowerCase()}">
      <header><div><small>${esc(typeLabels[proposal.type]||proposal.label||proposal.type)}</small><h3>${fmt(amount)} <em>COIN</em></h3></div><span>${status==='PENDING'?'OWNER 승인 대기':status==='APPROVED'?'집행 완료':status==='REJECTED'?'반려':'처리 중'}</span></header>
      <dl><div><dt>상신</dt><dd>${esc(proposal.proposer_nickname)}</dd></div><div><dt>대상</dt><dd>${esc(proposal.target_label||proposal.target_nickname||'—')}</dd></div>${Number(proposal.recipient_count||0)>1?`<div><dt>분배</dt><dd>${fmt(proposal.per_recipient_amount)} × ${fmt(proposal.recipient_count)}명</dd></div>`:''}</dl>
      <p>${esc(proposal.reason||'')}</p>
      <footer><time>${esc(String(proposal.created_at||'').replace('T',' ').slice(0,19))}</time>${pending&&state?.access?.canDecide?`<div><button type="button" data-at-decision="REJECT" data-at-proposal="${esc(proposal.id)}">반려</button><button type="button" class="is-approve" data-at-decision="APPROVE" data-at-proposal="${esc(proposal.id)}">최종 승인</button></div>`:''}</footer>
    </article>`;
  }

  function proposalForm(){
    if(!state?.access?.canSubmit)return `<section class="at-authority-note"><span>CHIEF AUTHORITY</span><b>예산 상신은 현재 임기의 족장만 가능합니다.</b><p>모든 유저는 원장과 승인 내역을 볼 수 있으며, 실제 집행은 OWNER 핑크빛유두의 최종 승인이 있어야 합니다.</p></section>`;
    const eventOptions=(state.events||[]).map(event=>`<option value="${Number(event.id)}">#${Number(event.id)} ${esc(event.title)} · ${esc(event.status)}</option>`).join('');
    return `<form class="at-proposal-form" id="atProposalForm">
      <header><small>CHIEF BUDGET PROPOSAL</small><h2>예산안 상신</h2><p>족장은 집행하지 않고 안건만 상신합니다. 잔액과 항목별 상한은 승인 시점에 다시 검사합니다.</p></header>
      <div class="at-field-grid"><label><span>예산 항목</span><select name="type" id="atProposalType"><option value="PERSONAL">족장 개인 집행</option><option value="PREDICTION_SUBSIDY">승부예측 지원금</option><option value="TOP_CLAN_DIVIDEND">1위 클랜 균등 지급</option></select></label><label><span>신청 금액</span><input name="amount" type="number" min="1" step="1" inputmode="numeric" placeholder="코인 금액"></label></div>
      <label class="at-target-field" data-at-event-field hidden><span>지원할 승부예측</span><select name="targetEventId"><option value="">이벤트 선택</option>${eventOptions}</select></label>
      <label><span>집행 사유</span><textarea name="reason" maxlength="300" rows="3" placeholder="유저가 확인할 수 있는 구체적인 사유를 입력하세요."></textarea></label>
      <div class="at-form-limit" id="atFormLimit"></div><button type="submit" class="at-submit">OWNER에게 최종 승인 요청</button>
    </form>`;
  }

  function render(){
    const host=document.getElementById('atStage');if(!host||!state)return;
    const account=state.account||{},policy=state.policy||{},chief=state.chief||{},reserveRate=account.balance?Math.min(100,account.reserve/account.balance*100):20;
    const pending=(state.proposals||[]).filter(item=>item.status==='PENDING'||item.status==='APPROVING'),history=(state.proposals||[]).filter(item=>!['PENDING','APPROVING'].includes(item.status));
    host.innerHTML=`
      <section class="at-hero">
        <div class="at-hero-copy"><span class="at-live"><i></i> LIVE PUBLIC LEDGER</span><p>현재 재정금고</p><strong>${fmt(account.balance)}<small> COIN</small></strong><div><b>실제 코인 판매액의 1%</b><span>구매자 추가 부담 없음</span><span>배포 이후 정상 완료 건만 집계</span></div></div>
        <div class="at-reserve" style="--reserve:${(reserveRate*3.6).toFixed(2)}deg"><div><small>의무 보유</small><strong>${fmt(account.reserve)}</strong><em>20% RESERVE</em></div></div>
        <dl class="at-hero-ledger"><div><dt>누적 징수</dt><dd>+${fmt(account.totalCollected)}</dd></div><div><dt>집행 완료</dt><dd>-${fmt(account.totalDisbursed)}</dd></div><div><dt>가용 예산</dt><dd>${fmt(account.spendable)}</dd></div></dl>
      </section>

      <section class="at-governance"><header><small>GOVERNANCE PROTOCOL</small><h2>상신과 집행 권한 분리</h2></header><div class="at-chain"><article><span>01</span><small>PROPOSAL</small><b>${chief.active?esc(chief.nickname):'족장 공석'}</b><p>족장 예산안 상신</p></article><i>→</i><article><span>02</span><small>PUBLIC REVIEW</small><b>공개 원장</b><p>전 유저 내역 확인</p></article><i>→</i><article class="is-owner"><span>03</span><small>FINAL AUTHORITY</small><b>OWNER 핑크빛유두</b><p>게임 내 최종 승인·반려</p></article></div></section>

      <section class="at-policy-grid">${Object.entries(state.limits||{}).map(([type,limit])=>`<article><small>${type.replace('_',' ')}</small><h3>${esc(typeLabels[type]||limit.label)}</h3><strong>${fmt(limit.limit)}<em> COIN</em></strong><p>현재 가용 예산의 최대 ${(Number(limit.capBps||0)/100).toFixed(0)}% · 의무 보유액 침범 불가</p></article>`).join('')}</section>

      <div class="at-columns"><div>${proposalForm()}</div><section class="at-queue"><header><div><small>APPROVAL QUEUE</small><h2>승인 대기 ${pending.length}건</h2></div>${state.access?.canDecide?'<span class="at-owner-key">FINAL KEY ACTIVE</span>':''}</header><div class="at-proposal-list">${pending.length?pending.map(proposalCard).join(''):'<div class="at-empty"><b>대기 중인 예산안이 없습니다.</b><span>새 안건이 상신되면 이곳에 표시됩니다.</span></div>'}</div></section></div>

      <section class="at-ledger-section"><header><div><small>REVENUE SOURCES</small><h2>실제 코인 상점 징수 내역</h2></div><span>세율 ${(Number(policy.taxBps||100)/100).toFixed(2)}%</span></header><div class="at-source-grid">${(state.sources||[]).length?(state.sources||[]).map(source=>`<article><small>${esc(source.label)}</small><strong>${fmt(source.tax_coin)}</strong><p>실결제 ${fmt(source.gross_coin)} · ${fmt(source.sale_count)}건</p></article>`).join(''):'<div class="at-empty"><b>배포 이후 집계된 판매가 없습니다.</b><span>과거 매출은 추정해 소급하지 않습니다.</span></div>'}</div></section>

      <section class="at-history"><header><small>DECISION ARCHIVE</small><h2>결정 기록</h2></header><div class="at-proposal-list">${history.length?history.map(proposalCard).join(''):'<div class="at-empty"><b>완료된 결정 기록이 없습니다.</b></div>'}</div></section>`;
    bindDynamic();
  }

  function updateForm(){
    const type=document.getElementById('atProposalType')?.value||'PERSONAL',limit=state?.limits?.[type],eventField=document.querySelector('[data-at-event-field]');
    if(eventField)eventField.hidden=type!=='PREDICTION_SUBSIDY';const target=document.getElementById('atFormLimit');
    if(target)target.innerHTML=`<span>현재 1회 승인 상한</span><b>${fmt(limit?.limit)} COIN</b>${type==='TOP_CLAN_DIVIDEND'?`<small>최근 1위 ${esc(state?.champion?.clanName||'확인 대기')} · ${fmt(state?.champion?.memberCount)}명에게 1/N</small>`:''}`;
  }

  async function submitProposal(event){
    event.preventDefault();if(busy)return;const form=event.currentTarget,data=new FormData(form),type=String(data.get('type')||''),amount=Number(data.get('amount')),reason=String(data.get('reason')||'').trim(),targetEventId=Number(data.get('targetEventId')||0);
    if(!Number.isSafeInteger(amount)||amount<1)return alert('신청 금액을 1코인 이상의 정수로 입력하세요.');
    if(reason.length<3)return alert('집행 사유를 3자 이상 입력하세요.');
    if(type==='PREDICTION_SUBSIDY'&&!targetEventId)return alert('지원할 승부예측을 선택하세요.');
    if(!confirm(`${typeLabels[type]} ${fmt(amount)}코인을 OWNER에게 상신합니까?`))return;
    busy=true;const button=form.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='예산안 상신 중'};
    try{const result=await api('administration/treasury/proposals',{method:'POST',body:JSON.stringify({type,amount,reason,targetEventId,requestId:`TREASURY-${Date.now()}-${crypto.randomUUID()}`})},{timeoutMs:30000});state=result.state;render()}
    catch(error){alert(error.message||'예산안을 상신하지 못했습니다.')}finally{busy=false}
  }

  async function decide(button){
    if(busy)return;const action=button.dataset.atDecision,proposalId=button.dataset.atProposal,label=action==='APPROVE'?'최종 승인':'반려';
    if(!confirm(`이 예산안을 ${label}합니까? ${action==='APPROVE'?'승인 즉시 실제 집행됩니다.':''}`))return;
    busy=true;document.querySelectorAll('[data-at-decision]').forEach(item=>item.disabled=true);
    try{const result=await api('administration/treasury/decision',{method:'POST',body:JSON.stringify({proposalId,action})},{timeoutMs:30000});state=result.state;render()}
    catch(error){alert(error.message||'예산안을 처리하지 못했습니다.');await load() }finally{busy=false}
  }

  function bindDynamic(){
    document.getElementById('atProposalType')?.addEventListener('change',updateForm);document.getElementById('atProposalForm')?.addEventListener('submit',submitProposal);updateForm();
    document.querySelectorAll('[data-at-decision]').forEach(button=>button.addEventListener('click',()=>decide(button)));
  }

  async function load(){
    try{state=await api('administration/treasury/state',{}, {ttl:0,replaceInflight:true,timeoutMs:20000});render()}
    catch(error){const host=document.getElementById('atStage');if(host)host.innerHTML=`<div class="at-load-error"><b>재정금고를 불러오지 못했습니다.</b><span>${esc(error.message||'잠시 후 다시 시도해 주세요.')}</span><button type="button" data-at-refresh>다시 확인</button></div>`;document.querySelector('[data-at-refresh]')?.addEventListener('click',load)}
  }

  function bind(){
    document.querySelector('[data-at-refresh]')?.addEventListener('click',load);load();clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden&&!busy&&!document.querySelector('.at-proposal-form :focus'))load()},30000);
  }

  window.administrationTreasuryView=view;
  window.bindAdministrationTreasuryView=bind;
  window.stopAdministrationTreasuryView=()=>clearInterval(pollTimer);
})();
