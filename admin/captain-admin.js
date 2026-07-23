(()=>{
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const statusKo=value=>({
    WAITING:'매칭 대기',ASSIGNED:'팀 편성 완료',CANCELLED:'참가 취소',
    ACTIVE:'운영 중',DONE:'완료',PENDING:'처리 중'
  }[String(value||'').toUpperCase()]||String(value||'-'));
  const roleClass=position=>['','lead','mid','captain'][Number(position)]||'member';
  const roleLabel=position=>['','선봉','중견','대장'][Number(position)]||'팀원';
  const formatDate=value=>{
    if(!value)return '-';
    const parsed=Date.parse(String(value).replace(' ','T')+'Z');
    if(!Number.isFinite(parsed))return String(value);
    return new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(new Date(parsed));
  };
  const number=value=>Number(value||0).toLocaleString();
  const formatRemaining=seconds=>{
    const total=Math.max(0,Math.floor(Number(seconds||0)));
    const days=Math.floor(total/86400);
    const hours=Math.floor((total%86400)/3600);
    const minutes=Math.floor((total%3600)/60);
    if(days)return `${days}일 ${hours}시간`;
    if(hours)return `${hours}시간 ${minutes}분`;
    return `${Math.max(1,minutes)}분`;
  };

  let loading=false;
  let reloadQueued=false;
  let latestOverview=null;
  let latestCooldownData={cooldowns:[],recentResets:[],activeCount:0};

  async function api(path,opt={}){
    try{
      if(typeof window.api==='function')return await window.api(path,opt);
      const token=localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
      const response=await fetch('../api/'+path,{
        ...opt,
        headers:{
          'content-type':'application/json',
          'authorization':'Bearer '+token,
          ...(opt.headers||{})
        },
        cache:'no-store'
      });
      const text=await response.text();
      let data={};
      try{data=text?JSON.parse(text):{}}catch{throw new Error(`API 응답 형식 오류 (HTTP ${response.status})`)}
      if(!response.ok)throw new Error(data.error||data.detail||`요청 실패 (HTTP ${response.status})`);
      return data;
    }catch(error){
      throw new Error(`${path}: ${error?.message||error}`);
    }
  }

  function tierBadge(tier,score){
    const info=tier||{name:'브론즈',color:'#b87333'};
    return `<span class="captain-tier-badge" style="--tier-color:${esc(info.color||'#b87333')}"><i></i><b>${esc(info.name||'브론즈')}</b><small>${number(score)}점</small></span>`;
  }

  function settlementRow(item={}){
    return `<div class="captainSettlementRow">
      <label><span>시작 순위</span><input data-key="from" type="number" min="1" value="${Number(item.from||1)}"></label>
      <label><span>종료 순위</span><input data-key="to" type="number" min="1" value="${Number(item.to||item.from||1)}"></label>
      <label><span>코인</span><input data-key="coin" type="number" min="0" value="${Number(item.coin||0)}"></label>
      <label><span>카드 조각</span><input data-key="shards" type="number" min="0" value="${Number(item.shards||0)}"></label>
      <button type="button" class="warn" data-remove-settlement>삭제</button>
    </div>`;
  }

  function renderSettlement(items){
    const box=$('#capSettlementRows');
    if(!box)return;
    const source=Array.isArray(items)&&items.length?items:[{from:1,to:1,coin:0,shards:0}];
    box.innerHTML=source.map(settlementRow).join('');
    box.querySelectorAll('[data-remove-settlement]').forEach(button=>{
      button.onclick=()=>{
        button.closest('.captainSettlementRow')?.remove();
        if(!box.children.length)box.insertAdjacentHTML('beforeend',settlementRow());
      };
    });
  }

  function ensure(){
    const nav=$('#nav'),cms=$('#cms');
    if(!nav||!cms)return false;

    if(!nav.querySelector('[data-view="captain"]')){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.view='captain';
      button.innerHTML='대장전 관리 <span class="buildBadge">NEW</span>';
      const tier=nav.querySelector('[data-view="tiers"]');
      nav.insertBefore(button,tier||null);
    }

    if(!$('#view-captain')){
      const view=document.createElement('section');
      view.className='view captain-admin-view';
      view.id='view-captain';
      view.hidden=true;
      view.innerHTML=`
        <div class="captain-admin-hero">
          <div>
            <small>3:3 승자 연전식 비동기 PVP</small>
            <h2>대장전 운영 센터</h2>
            <p>참가 대기열, PVP 덱 전투력 기반 균형 편성, 팀 상태, 경기 기록과 보상을 한 화면에서 관리합니다.</p>
          </div>
          <div class="captain-admin-actions">
            <span id="capCmsModeBadge" class="captain-mode-badge off">운영 중지</span>
            <button type="button" id="capCmsRefresh" class="ghost">새로고침</button>
            <button type="button" id="capCmsReset" class="warn">현재 회차 종료·새 회차 시작</button>
          </div>
        </div>

        <section class="captain-balance-rules">
          <article><span>역할 배정</span><b>덱 전투력 낮은 순</b><small>선봉 → 중견 → 대장</small></article>
          <article><span>티어 제한</span><b>그랜드마스터 제한 없음</b><small>티어 때문에 편성이 지연되지 않음</small></article>
          <article><span>팀 균형</span><b>PVP 덱 전투력 합계</b><small>대기 인원을 가장 약한 팀부터 균등 배분</small></article>
        </section>

        <section class="captain-overview-panel">
          <div class="captain-section-head">
            <div><small id="capCmsWeek">회차 확인 중</small><h3>현재 회차 운영 현황</h3></div>
          </div>
          <div id="capCmsStats" class="captain-stat-grid"></div>
          <div id="capCmsBalanceNotice" class="captain-balance-notice"></div>
        </section>

        <section class="captain-admin-card captain-cooldown-card">
          <div class="captain-section-head">
            <div><small>참가 취소 페널티 관리</small><h3>7일 입장 제한 관리</h3></div>
            <div class="captain-cooldown-actions">
              <span id="capCmsCooldownCount" class="captain-count-pill">0명 제한 중</span>
              <input id="capCmsCooldownSearch" type="search" placeholder="닉네임 검색">
              <button type="button" id="capCmsCooldownResetAll" class="warn">전체 제한 초기화</button>
            </div>
          </div>
          <p class="captain-cooldown-guide">참가 취소 후 적용된 7일 재등록 제한만 해제합니다. 참가 취소 기록과 기존 회차 기록은 삭제하지 않습니다.</p>
          <div class="captain-table-scroll">
            <table class="captain-admin-table captain-cooldown-table">
              <thead><tr><th>유저</th><th>취소 회차</th><th>취소 시각</th><th>제한 종료</th><th>남은 시간</th><th>관리</th></tr></thead>
              <tbody id="capCmsCooldowns"></tbody>
            </table>
          </div>
          <details class="captain-cooldown-history">
            <summary>최근 초기화 기록</summary>
            <div id="capCmsCooldownLogs"></div>
          </details>
        </section>

        <section class="captain-admin-grid">
          <div class="captain-admin-card captain-queue-card">
            <div class="captain-section-head">
              <div><small>참가자 관리</small><h3>등록·대기열</h3></div>
              <div class="captain-table-tools">
                <input id="capCmsQueueSearch" type="search" placeholder="닉네임 검색">
                <select id="capCmsQueueFilter">
                  <option value="ACTIVE">진행 대상</option>
                  <option value="WAITING">매칭 대기</option>
                  <option value="ASSIGNED">팀 편성 완료</option>
                  <option value="CANCELLED">참가 취소</option>
                  <option value="ALL">전체</option>
                </select>
              </div>
            </div>
            <div class="captain-table-scroll">
              <table class="captain-admin-table">
                <thead><tr><th>참가자</th><th>PVP 시즌 티어</th><th>덱 전투력</th><th>상태</th><th>등록·제한 시각</th></tr></thead>
                <tbody id="capCmsRegs"></tbody>
              </table>
            </div>
          </div>

          <div class="captain-admin-card captain-team-card">
            <div class="captain-section-head">
              <div><small>팀 균형 확인</small><h3>팀 관리</h3></div>
              <span id="capCmsTeamCount" class="captain-count-pill">0팀</span>
            </div>
            <div id="capCmsTeams" class="captain-team-list"></div>
          </div>
        </section>

        <section class="captain-admin-card captain-log-card">
          <div class="captain-section-head">
            <div><small>공격·방어 기록</small><h3>최근 경기 로그</h3></div>
          </div>
          <div class="captain-table-scroll">
            <table class="captain-admin-table captain-log-table">
              <thead><tr><th>시각</th><th>대결</th><th>공격자</th><th>결과</th><th>점수 변동</th><th>라운드</th></tr></thead>
              <tbody id="capCmsLogs"></tbody>
            </table>
          </div>
        </section>

        <details class="captain-settings-shell" open>
          <summary><span>운영·보상·배경음 설정</span><small>클릭하여 접기/펼치기</small></summary>
          <div class="captain-settings-content">
            <div class="captain-section-head">
              <div><small>대장전 운영 관리</small><h3>운영 설정</h3></div>
              <button type="button" id="capCmsSave">설정 저장</button>
            </div>
            <div class="formgrid">
              <label class="field"><span>운영 상태</span><select id="capCmsMode"><option value="OFF">운영 중지</option><option value="ON">정식 운영</option><option value="TEST">테스트 운영</option></select></label>
              <label class="field"><span>최대 공격 횟수</span><input id="capCmsEnergyMax" type="number" min="1" value="5"></label>
              <label class="field"><span>충전 시간(분)</span><input id="capCmsEnergyMinutes" type="number" min="1" value="15"></label>
              <label class="field"><span>승리 점수</span><input id="capCmsWinScore" type="number" value="24"></label>
              <label class="field"><span>패배 차감</span><input id="capCmsLoseScore" type="number" value="16"></label>
              <label class="field"><span>팀명 변경 쿨타임(분)</span><input id="capCmsRenameCooldown" type="number" value="60"></label>
              <label class="field"><span>운영자 테스트 참여</span><select id="capCmsAdminTest"><option value="true">허용</option><option value="false">차단</option></select></label>
            </div>

            <div class="captain-settings-subgrid">
              <details class="captain-settings-block" open>
                <summary>승리·주간 정산 보상</summary>
                <div class="captain-settings-inner">
                  <div class="captain-reward-title"><b>경기 승리 보상</b><small>공격을 시작한 유저가 승리할 때 즉시 지급</small></div>
                  <div class="formgrid">
                    <label class="field"><span>승리 코인</span><input id="capVictoryCoin" type="number" min="0" value="0"></label>
                    <label class="field"><span>승리 카드 조각</span><input id="capVictoryShards" type="number" min="0" value="0"></label>
                  </div>
                  <div class="captain-reward-title"><b>지난 주 순위별 정산 보상</b><button type="button" id="capSettlementAdd" class="ghost">구간 추가</button></div>
                  <div id="capSettlementRows"></div>
                </div>
              </details>

              <details class="captain-settings-block">
                <summary>대장전 배경음</summary>
                <div class="captain-settings-inner">
                  <div class="formgrid">
                    <label class="field"><span>배경음 사용</span><select id="capCmsBgmEnabled"><option value="false">사용 안 함</option><option value="true">사용</option></select></label>
                    <label class="field captain-bgm-source"><span>음원 경로 또는 직접 URL</span><input id="capCmsBgmSource" type="text" placeholder="/assets/audio/captain-theme.mp3"></label>
                    <label class="field"><span>기본 음량(0~100)</span><input id="capCmsBgmVolume" type="number" min="0" max="100" value="35"></label>
                    <label class="field"><span>반복 재생</span><select id="capCmsBgmLoop"><option value="true">반복</option><option value="false">한 번</option></select></label>
                    <label class="field"><span>화면 이탈 시 정지</span><select id="capCmsBgmStop"><option value="true">정지</option><option value="false">계속 재생</option></select></label>
                  </div>
                  <div class="captain-preview-actions"><button type="button" id="capCmsBgmPreview" class="ghost">미리듣기</button><button type="button" id="capCmsBgmPreviewStop" class="ghost">정지</button></div>
                </div>
              </details>
            </div>
          </div>
        </details>`;
      cms.appendChild(view);
    }

    const navButton=nav.querySelector('[data-view="captain"]');
    if(navButton&&!navButton.dataset.captainRouteBound){
      navButton.dataset.captainRouteBound='1';
      navButton.addEventListener('click',event=>{
        event.preventDefault();
        show();
      });
    }
    return true;
  }

  function show(){
    if(!ensure())return;
    document.querySelectorAll('.view').forEach(view=>{view.hidden=view.id!=='view-captain'});
    document.querySelectorAll('#nav button').forEach(button=>button.classList.toggle('active',button.dataset.view==='captain'));
    const title=$('#pageTitle');
    if(title)title.textContent='대장전 관리';
    bind();
    load();
  }

  function renderQueue(){
    if(!latestOverview)return;
    const search=String($('#capCmsQueueSearch')?.value||'').trim().toLowerCase();
    const filter=$('#capCmsQueueFilter')?.value||'ACTIVE';
    let rows=Array.isArray(latestOverview.registrations)?latestOverview.registrations:[];
    rows=rows.filter(row=>{
      if(search&&!String(row.nickname||'').toLowerCase().includes(search))return false;
      if(filter==='ALL')return true;
      if(filter==='ACTIVE')return row.status==='WAITING'||row.status==='ASSIGNED';
      return row.status===filter;
    });
    const target=$('#capCmsRegs');
    if(!target)return;
    target.innerHTML=rows.map(row=>{
      const time=row.status==='CANCELLED'&&row.cooldown_until
        ? `<b>재등록 ${formatDate(row.cooldown_until)}까지</b><small>취소 ${formatDate(row.cancelled_at)}</small>`
        : `<b>${formatDate(row.registered_at)}</b><small>${row.assigned_at?`편성 ${formatDate(row.assigned_at)}`:'등록 시각'}</small>`;
      return `<tr>
        <td><div class="captain-user-cell"><span>${esc(String(row.nickname||'?').slice(0,1))}</span><b>${esc(row.nickname||'-')}</b></div></td>
        <td>${tierBadge(row.pvpTier,row.season_score)}</td>
        <td><strong>${number(row.deck_power)}</strong></td>
        <td><span class="captain-status-chip ${String(row.status||'').toLowerCase()}">${esc(statusKo(row.status))}</span></td>
        <td><div class="captain-time-cell">${time}</div></td>
      </tr>`;
    }).join('')||'<tr><td colspan="5" class="captain-empty-cell">조건에 맞는 참가자가 없습니다.</td></tr>';
  }

  async function resetCooldown(scope,userId=0,nickname=''){
    const all=scope==='ALL';
    const message=all
      ? '현재 적용 중인 모든 유저의 7일 입장 제한을 해제합니다. 참가 취소 기록은 유지됩니다. 계속할까요?'
      : `${nickname||'선택한 유저'}님의 7일 입장 제한을 해제할까요?`;
    if(!confirm(message))return;
    if(all){
      const verify=prompt('전체 초기화 확인을 위해 "7일 제한 전체 초기화"를 입력하세요.','');
      if(verify!=='7일 제한 전체 초기화')return alert('문구가 일치하지 않아 취소했습니다.');
    }
    const button=all?$('#capCmsCooldownResetAll'):document.querySelector(`[data-cooldown-user="${Number(userId)}"]`);
    const original=button?.textContent||'';
    if(button){button.disabled=true;button.textContent='처리 중...'}
    try{
      const result=await api('admin/captain/cooldowns',{
        method:'POST',
        body:JSON.stringify({
          scope:all?'ALL':'USER',
          userId:all?undefined:Number(userId),
          requestId:(globalThis.crypto?.randomUUID?.()||`captain-cooldown-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        })
      });
      alert(result.note||'7일 입장 제한을 초기화했습니다.');
      await load();
    }catch(error){
      alert(`7일 입장 제한 초기화 실패\n${error.message}`);
    }finally{
      if(button){button.disabled=false;button.textContent=original}
    }
  }

  function renderCooldowns(data=latestCooldownData){
    latestCooldownData=data||{cooldowns:[],recentResets:[],activeCount:0};
    const search=String($('#capCmsCooldownSearch')?.value||'').trim().toLowerCase();
    const rows=(Array.isArray(latestCooldownData.cooldowns)?latestCooldownData.cooldowns:[])
      .filter(row=>!search||String(row.nickname||'').toLowerCase().includes(search));
    const count=$('#capCmsCooldownCount');
    if(count)count.textContent=`${Number(latestCooldownData.activeCount||0)}명 제한 중`;
    const target=$('#capCmsCooldowns');
    if(target){
      target.innerHTML=rows.map(row=>`<tr>
        <td><div class="captain-user-cell"><span>${esc(String(row.nickname||'?').slice(0,1))}</span><b>${esc(row.nickname||'-')}</b></div></td>
        <td><b>${esc(row.week_key||'-')}</b></td>
        <td>${formatDate(row.cancelled_at)}</td>
        <td><b>${formatDate(row.cooldown_until)}</b></td>
        <td><span class="captain-cooldown-remaining">${formatRemaining(row.remainingSeconds)}</span></td>
        <td><button type="button" class="ghost" data-cooldown-user="${Number(row.user_id)}" data-cooldown-name="${esc(row.nickname||'')}">개인 제한 해제</button></td>
      </tr>`).join('')||'<tr><td colspan="6" class="captain-empty-cell">현재 적용 중인 7일 입장 제한이 없습니다.</td></tr>';
      target.querySelectorAll('[data-cooldown-user]').forEach(button=>{
        button.onclick=()=>resetCooldown('USER',Number(button.dataset.cooldownUser),button.dataset.cooldownName||'');
      });
    }
    const logs=$('#capCmsCooldownLogs');
    if(logs){
      const history=Array.isArray(latestCooldownData.recentResets)?latestCooldownData.recentResets:[];
      logs.innerHTML=history.map(row=>`<div class="captain-cooldown-log">
        <span>${formatDate(row.created_at)}</span>
        <b>${String(row.scope).toUpperCase()==='ALL'?'전체 제한 초기화':`${esc(row.target_nickname||`유저 ${row.target_user_id||''}`)} 개인 해제`}</b>
        <small>${number(row.affected_count)}건 · 실행 ${esc(row.executed_by_name||'-')}</small>
      </div>`).join('')||'<div class="captain-empty-block"><span>아직 초기화 기록이 없습니다.</span></div>';
    }
  }

  function memberRow(member){
    return `<div class="captain-team-member ${roleClass(member.position)}">
      <span class="captain-role-badge">${roleLabel(member.position)}</span>
      <div class="captain-team-member-name"><b>${esc(member.nickname||'-')}</b>${tierBadge(member.pvpTier,member.pvpScore)}</div>
      <div class="captain-team-member-power"><small>PVP 덱</small><strong>${number(member.deck_power)}</strong></div>
    </div>`;
  }

  function renderTeams(teams){
    const target=$('#capCmsTeams');
    if(!target)return;
    $('#capCmsTeamCount').textContent=`${teams.filter(team=>team.status==='ACTIVE').length}팀`;
    target.innerHTML=teams.map(team=>{
      const active=team.status==='ACTIVE';
      const legacy=!team.roleOrderOk;
      return `<article class="captain-team-panel ${active?'active':'inactive'} ${legacy?'warning':''}">
        <header>
          <div><span class="captain-team-state">${active?'운영 중':statusKo(team.status)}</span><h4>${esc(team.name||`팀 ${team.id}`)}</h4><small>${number(team.score)}점 · ${number(team.wins)}승 ${number(team.losses)}패</small></div>
          <div class="captain-team-balance ${legacy?'bad':'good'}"><b>${legacy?'기존 역할 유지':'덱 전투력 역할'}</b><small>${legacy?'회차 초기화 후 신규 기준 적용':`개인 격차 ${number(team.powerSpread)} · 평균 ${number(team.averageDeckPower)}`}</small></div>
        </header>
        <div class="captain-team-members">${(team.members||[]).map(memberRow).join('')}</div>
        <footer>
          <div><span>덱 전투력 평균</span><b>${number(team.averageDeckPower)}</b></div>
          <div><span>덱 전투력 합계</span><b>${number(team.teamPower)}</b></div>
          <label><input value="${esc(team.name||'')}" maxlength="20" aria-label="팀명"><button type="button" data-team="${Number(team.id)}">팀명 저장</button></label>
        </footer>
      </article>`;
    }).join('')||'<div class="captain-empty-block"><b>아직 편성된 팀이 없습니다.</b><span>대기 인원 3명부터 즉시 팀을 편성하며, 여러 팀은 덱 전투력 합계를 균등하게 배분합니다.</span></div>';

    target.querySelectorAll('button[data-team]').forEach(button=>{
      button.onclick=async()=>{
        if(button.disabled)return;
        const panel=button.closest('.captain-team-panel');
        const input=panel?.querySelector('footer input');
        button.disabled=true;
        const original=button.textContent;
        button.textContent='저장 중';
        try{
          await api('admin/captain/team',{method:'PATCH',body:JSON.stringify({teamId:Number(button.dataset.team),name:input?.value||''})});
          await load();
        }catch(error){alert(`팀명 저장 실패\n${error.message}`)}
        finally{button.disabled=false;button.textContent=original}
      };
    });
  }

  function renderLogs(logs){
    const target=$('#capCmsLogs');
    if(!target)return;
    target.innerHTML=logs.map(row=>{
      const battle=row.battle||{};
      const rounds=Array.isArray(battle.rounds)?battle.rounds.length:0;
      const attackWin=Number(row.winner_team_id)===Number(row.attacker_team_id);
      const attackDelta=Number(row.attacker_score_after||0)-Number(row.attacker_score_before||0);
      const defenseDelta=Number(row.defender_score_after||0)-Number(row.defender_score_before||0);
      return `<tr>
        <td>${formatDate(row.created_at)}</td>
        <td><div class="captain-match-cell"><b>${esc(row.attacker_team_name||'-')}</b><span>VS</span><b>${esc(row.defender_team_name||'-')}</b></div></td>
        <td>${esc(row.initiated_by_name||'-')}</td>
        <td><span class="captain-result-chip ${attackWin?'win':'lose'}">${attackWin?'공격팀 승리':'방어팀 승리'}</span></td>
        <td><div class="captain-score-delta"><b class="${attackDelta>=0?'plus':'minus'}">${attackDelta>=0?'+':''}${attackDelta}</b><small>${defenseDelta>=0?'+':''}${defenseDelta}</small></div></td>
        <td>${rounds}라운드</td>
      </tr>`;
    }).join('')||'<tr><td colspan="6" class="captain-empty-cell">아직 대장전 경기 기록이 없습니다.</td></tr>';
  }

  function renderOverview(overview){
    latestOverview=overview;
    const registrations=Array.isArray(overview.registrations)?overview.registrations:[];
    const teams=Array.isArray(overview.teams)?overview.teams:[];
    const logs=Array.isArray(overview.logs)?overview.logs:[];
    const activeRegistrations=registrations.filter(row=>row.status==='WAITING'||row.status==='ASSIGNED');
    const waiting=registrations.filter(row=>row.status==='WAITING');
    const activeTeams=teams.filter(team=>team.status==='ACTIVE');
    const balance=overview.balance||{};

    const round=overview.round||{};
    $('#capCmsWeek').textContent=round.label||`${overview.weekKey} 주차`;
    $('#capCmsStats').innerHTML=[
      ['진행 등록',activeRegistrations.length,'현재 회차 유효 참가자'],
      ['매칭 대기',waiting.length,'팀 편성 대기 중'],
      ['완성 팀',activeTeams.length,'3명 편성 완료'],
      ['최근 경기',logs.length,'최대 100건 표시']
    ].map(([label,value,note])=>`<article><span>${label}</span><b>${number(value)}</b><small>${note}</small></article>`).join('');

    const waitingCount=Number(balance.waitingCount||waiting.length||0);
    const waitingMin=Number(balance.waitingPowerMin||0);
    const waitingMax=Number(balance.waitingPowerMax||0);
    const waitingAverage=Number(balance.waitingPowerAverage||0);
    const legacyTeams=Number(balance.legacyRoleTeams||0);
    $('#capCmsBalanceNotice').innerHTML=`
      <div><b>편성 대기 전투력</b><span>${waitingCount}명 · 최저 ${number(waitingMin)} · 평균 ${number(waitingAverage)} · 최고 ${number(waitingMax)}</span></div>
      <div class="${legacyTeams?'warning':''}"><b>${legacyTeams?'기존 역할 팀 확인':'신규 편성 기준 적용 중'}</b><span>${legacyTeams?`시즌 점수 기준 역할이 남은 기존 팀 ${legacyTeams}개 · 새 회차부터 전투력 순으로 적용`:'그랜드마스터 제한 없이 덱 전투력 합계가 비슷하도록 즉시 편성'}</span></div>`;

    renderQueue();
    renderTeams(teams);
    renderLogs(logs);
  }

  function updateModeBadge(mode){
    const badge=$('#capCmsModeBadge');
    if(!badge)return;
    const labels={OFF:'운영 중지',ON:'정식 운영',TEST:'테스트 운영'};
    badge.textContent=labels[mode]||mode;
    badge.className=`captain-mode-badge ${String(mode||'OFF').toLowerCase()}`;
  }

  async function load(){
    if(!ensure()||$('#view-captain')?.hidden)return;
    if(loading){reloadQueued=true;return}
    loading=true;
    const refresh=$('#capCmsRefresh');
    if(refresh){refresh.disabled=true;refresh.textContent='불러오는 중'}
    try{
      const [settingsResult,overviewResult,cooldownResult]=await Promise.all([
        api('admin/captain/settings'),
        api('admin/captain/overview'),
        api('admin/captain/cooldowns')
      ]);
      const config=settingsResult.settings||{};
      $('#capCmsMode').value=config.mode||'OFF';
      $('#capCmsEnergyMax').value=config.energyMax||5;
      $('#capCmsEnergyMinutes').value=config.energyMinutes||15;
      $('#capCmsWinScore').value=config.winScore||24;
      $('#capCmsLoseScore').value=config.loseScore||16;
      $('#capCmsRenameCooldown').value=config.renameCooldownMinutes||60;
      $('#capCmsAdminTest').value=String(config.adminTestParticipation!==false);
      $('#capCmsBgmEnabled').value=String(Boolean(config.bgm?.enabled));
      $('#capCmsBgmSource').value=config.bgm?.source||'';
      $('#capCmsBgmVolume').value=Number(config.bgm?.volume??35);
      $('#capCmsBgmLoop').value=String(config.bgm?.loop!==false);
      $('#capCmsBgmStop').value=String(config.bgm?.stopOnExit!==false);
      $('#capVictoryCoin').value=Number(config.rewards?.victory?.coin||0);
      $('#capVictoryShards').value=Number(config.rewards?.victory?.shards||0);
      renderSettlement(config.rewards?.settlement||[]);
      updateModeBadge(config.mode||'OFF');
      renderOverview(overviewResult);
      renderCooldowns(cooldownResult);
    }catch(error){
      console.error('captain CMS load failed',error);
      alert(`대장전 CMS 불러오기 실패\n${error.message}`);
    }finally{
      loading=false;
      if(refresh){refresh.disabled=false;refresh.textContent='새로고침'}
      if(reloadQueued){reloadQueued=false;queueMicrotask(load)}
    }
  }

  function bind(){
    if(!ensure())return;
    const save=$('#capCmsSave');
    const refresh=$('#capCmsRefresh');
    const reset=$('#capCmsReset');
    const settlementAdd=$('#capSettlementAdd');
    const queueSearch=$('#capCmsQueueSearch');
    const queueFilter=$('#capCmsQueueFilter');
    const cooldownSearch=$('#capCmsCooldownSearch');
    const cooldownResetAll=$('#capCmsCooldownResetAll');

    if(queueSearch&&!queueSearch.dataset.bound){queueSearch.dataset.bound='1';queueSearch.addEventListener('input',renderQueue)}
    if(queueFilter&&!queueFilter.dataset.bound){queueFilter.dataset.bound='1';queueFilter.addEventListener('change',renderQueue)}
    if(cooldownSearch&&!cooldownSearch.dataset.bound){cooldownSearch.dataset.bound='1';cooldownSearch.addEventListener('input',()=>renderCooldowns())}
    if(cooldownResetAll&&!cooldownResetAll.dataset.captainBound){
      cooldownResetAll.dataset.captainBound='1';
      cooldownResetAll.onclick=()=>resetCooldown('ALL');
    }

    if(settlementAdd&&!settlementAdd.dataset.captainBound){
      settlementAdd.dataset.captainBound='1';
      settlementAdd.onclick=()=>{
        const box=$('#capSettlementRows');
        box?.insertAdjacentHTML('beforeend',settlementRow({from:(box?.children.length||0)+1,to:(box?.children.length||0)+1}));
        const row=box?.lastElementChild;
        row?.querySelector('[data-remove-settlement]')?.addEventListener('click',()=>row.remove());
      };
    }

    if(save&&!save.dataset.captainBound){
      save.dataset.captainBound='1';
      save.onclick=async()=>{
        if(save.disabled)return;
        const original=save.textContent;
        save.disabled=true;
        save.textContent='저장 중...';
        try{
          const settlement=[...document.querySelectorAll('.captainSettlementRow')].map(row=>({
            from:Math.max(1,Math.floor(Number(row.querySelector('[data-key="from"]').value)||1)),
            to:Math.max(1,Math.floor(Number(row.querySelector('[data-key="to"]').value)||1)),
            coin:Math.max(0,Math.floor(Number(row.querySelector('[data-key="coin"]').value)||0)),
            shards:Math.max(0,Math.floor(Number(row.querySelector('[data-key="shards"]').value)||0))
          })).filter(item=>item.to>=item.from);
          const payload={
            mode:$('#capCmsMode').value,
            energyMax:Number($('#capCmsEnergyMax').value),
            energyMinutes:Number($('#capCmsEnergyMinutes').value),
            winScore:Number($('#capCmsWinScore').value),
            loseScore:Number($('#capCmsLoseScore').value),
            renameCooldownMinutes:Number($('#capCmsRenameCooldown').value),
            adminTestParticipation:$('#capCmsAdminTest').value==='true',
            bgm:{
              enabled:$('#capCmsBgmEnabled').value==='true',
              source:$('#capCmsBgmSource').value.trim(),
              volume:Number($('#capCmsBgmVolume').value),
              loop:$('#capCmsBgmLoop').value==='true',
              stopOnExit:$('#capCmsBgmStop').value==='true'
            },
            rewards:{
              victory:{
                coin:Math.max(0,Math.floor(Number($('#capVictoryCoin').value)||0)),
                shards:Math.max(0,Math.floor(Number($('#capVictoryShards').value)||0))
              },
              settlement
            }
          };
          const result=await api('admin/captain/settings',{method:'PATCH',body:JSON.stringify(payload)});
          if(!result?.ok)throw new Error(result?.error||'설정 저장 응답이 올바르지 않습니다.');
          updateModeBadge(payload.mode);
          alert('대장전 설정을 저장했습니다.');
          await load();
        }catch(error){alert(`대장전 설정 저장 실패\n${error.message}`)}
        finally{save.disabled=false;save.textContent=original}
      };
    }

    if(refresh&&!refresh.dataset.captainBound){refresh.dataset.captainBound='1';refresh.onclick=load}

    const preview=$('#capCmsBgmPreview'),previewStop=$('#capCmsBgmPreviewStop');
    if(preview&&!preview.dataset.captainBound){
      preview.dataset.captainBound='1';
      preview.onclick=async()=>{
        const source=$('#capCmsBgmSource').value.trim();
        if(!source)return alert('음원 경로 또는 직접 URL을 입력하세요.');
        if(/(?:youtube\.com|youtu\.be)/i.test(source))return alert('유튜브 페이지 주소는 직접 재생할 수 없습니다. 음원 파일 직접 URL을 사용하세요.');
        window.__captainCmsPreview?.pause();
        const audio=new Audio(source);
        audio.volume=Math.max(0,Math.min(1,(Number($('#capCmsBgmVolume').value)||0)/100));
        audio.loop=$('#capCmsBgmLoop').value==='true';
        window.__captainCmsPreview=audio;
        try{await audio.play();preview.textContent='재생 중'}catch(error){alert(`미리듣기 실패\n${error.message}`)}
      };
    }
    if(previewStop&&!previewStop.dataset.captainBound){
      previewStop.dataset.captainBound='1';
      previewStop.onclick=()=>{
        window.__captainCmsPreview?.pause();
        window.__captainCmsPreview=null;
        if(preview)preview.textContent='미리듣기';
      };
    }

    if(reset&&!reset.dataset.captainBound){
      reset.dataset.captainBound='1';
      reset.onclick=async()=>{
        if(reset.disabled)return;
        if(!latestOverview)return alert('현재 회차 정보를 먼저 불러와 주세요.');
        const currentLabel=latestOverview?.round?.label||latestOverview?.weekKey||'현재 회차';
        const warning=[
          `${currentLabel} 운영을 종료하고 빈 새 회차를 즉시 시작합니다.`,
          '',
          '· 현재 참가자와 대기열은 새 회차로 복사되지 않습니다.',
          '· 현재 팀·승패·공격 횟수는 새 회차 기준으로 초기화되며, 팀 점수는 기본값부터 다시 시작합니다.',
          '· 종료 시 현재 최종 순위 기준 정산 보상을 메시지함으로 지급합니다.',
          '· 기존 랭킹, 경기, 보상 지급 기록은 삭제하지 않고 보존합니다.',
          '· 기존 참가자는 새 회차에서 다시 등록할 수 있는 상태가 됩니다.',
          '',
          '실행 후 되돌릴 수 없습니다. 계속할까요?'
        ].join('\n');
        if(!confirm(warning))return;
        const verify=prompt('실행 확인을 위해 "새 회차 시작"을 입력하세요.','');
        if(verify!=='새 회차 시작')return alert('문구가 일치하지 않아 취소했습니다.');
        const original=reset.textContent;
        reset.disabled=true;
        reset.textContent='정산·새 회차 생성 중...';
        try{
          const result=await api('admin/captain/reset',{
            method:'POST',
            body:JSON.stringify({
              expectedRoundKey:latestOverview?.round?.roundKey||latestOverview?.weekKey||'',
              requestId:(globalThis.crypto?.randomUUID?.()||`captain-reset-${Date.now()}-${Math.random().toString(36).slice(2)}`)
            })
          });
          alert(result.note||'새 회차를 시작했습니다.');
          await load();
        }catch(error){
          alert(`대장전 새 회차 시작 실패\n${error.message}`);
          await load();
        }finally{
          reset.disabled=false;
          reset.textContent=original;
        }
      };
    }
  }

  function init(){ensure();bind()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
