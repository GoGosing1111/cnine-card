/* V1073.1: reliable infinite tower operations center */
(()=>{
  const q=(s)=>document.querySelector(s);
  let cache=null;

  function activateTowerView(){
    state.view='tower';
    document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!=='view-tower');
    document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view==='tower'));
    const title=q('#pageTitle');
    if(title) title.textContent='무한의탑 관리';
    return loadTowerAdmin();
  }

  // admin-v984.js uses the global `show()` function, not `showView()`.
  // Capture the tower navigation explicitly so future CMS reorganizations cannot leave this screen on its static loading placeholder.
  const towerNav=q('#nav button[data-view="tower"]');
  if(towerNav){
    towerNav.addEventListener('click',(event)=>{
      event.preventDefault();
      event.stopImmediatePropagation();
      activateTowerView().catch(()=>{});
    },true);
  }

  // Keep programmatic navigation compatible with the rest of the CMS.
  window.openTowerAdmin=activateTowerView;

  const e=(v)=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const n=(v)=>Number(v||0).toLocaleString();
  const activeSeason=(d)=>(d.seasons||[])[0]||{id:1,name:'무한의탑',max_floor:100,status:'ACTIVE'};
  const monsterBadge=(m)=>m.towerOnly?'탑 전용':(m.towerEnabled?'탑 사용':'탑 미사용');

  async function loadTowerAdmin(){
    const root=q('#towerAdminRoot');
    root.innerHTML='<div class="panel towerLoading"><b>무한의탑 운영 데이터를 불러오는 중입니다.</b><small>일부 신규 설정 조회가 실패해도 기존 관리 기능은 계속 표시됩니다.</small></div>';
    try{
      cache=await Promise.race([api('admin/tower'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('무한의탑 관리 API 응답 시간이 초과되었습니다. 서버 상태를 확인한 뒤 다시 시도하세요.')),15000))]);
      renderTower(cache);
    }catch(err){
      root.innerHTML=`<div class="panel towerLoadError"><small>LOAD ERROR</small><h2>무한의탑 데이터를 불러오지 못했습니다.</h2><p>${e(err?.message||err)}</p><div class="towerActionRow"><button id="towerRetry">다시 불러오기</button><button id="towerOpenLegacy" class="ghost">기존 몬스터 관리 열기</button></div></div>`;
      q('#towerRetry').onclick=loadTowerAdmin;
      q('#towerOpenLegacy').onclick=()=>show('monsters');
    }
  }

  function renderTower(d){
    const root=q('#towerAdminRoot'), season=activeSeason(d), monsters=(d.monsters||[]).filter(m=>m.isActive!==false), ranges=(d.ranges||[]).filter(r=>!season||Number(r.season_id)===Number(season.id));
    const warning=(d.warnings||[]).map(x=>`<div class="towerWarning">${e(x)}</div>`).join('');
    root.innerHTML=`
      ${warning}
      <div class="towerOpsHeader panel">
        <div><small>TOWER OPERATIONS CENTER</small><h2>무한의탑 상시 운영</h2><p>몬스터 원본은 몬스터 관리에서 유지하고, 여기서는 층 배치·보스 구간·랭킹을 관리합니다.</p></div>
        <div class="towerOpsStatus"><span class="${d.settings?.enabled!==false?'on':'off'}">${d.settings?.enabled!==false?'운영 중':'운영 중지'}</span><b>${n(season?.max_floor||0)}층</b><small>범위 ${n(ranges.length)}개 · 사용 몬스터 ${n(monsters.filter(m=>m.towerEnabled).length)}종</small></div>
      </div>
      <div class="towerTabs" role="tablist">
        <button class="active" data-tower-tab="overview">운영 현황</button>
        <button data-tower-tab="ranges">층 구간 배치</button>
        <button data-tower-tab="legacy">기존 단일 층</button>
        <button data-tower-tab="ranking">랭킹 관리</button>
      </div>
      <div id="towerTabContent"></div>`;
    root.querySelectorAll('[data-tower-tab]').forEach(btn=>btn.onclick=()=>{
      root.querySelectorAll('[data-tower-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      renderTab(btn.dataset.towerTab,d,season,monsters,ranges);
    });
    renderTab('overview',d,season,monsters,ranges);
  }

  function renderTab(tab,d,season,monsters,ranges){
    const mount=q('#towerTabContent');
    if(tab==='overview') return renderOverview(mount,d,season,monsters,ranges);
    if(tab==='ranges') return renderRanges(mount,d,season,monsters,ranges);
    if(tab==='legacy') return renderLegacy(mount,d,season);
    return renderRanking(mount,d,season);
  }

  function renderOverview(mount,d,season,monsters,ranges){
    const towerMonsters=monsters.filter(m=>m.towerEnabled), towerOnly=towerMonsters.filter(m=>m.towerOnly), bosses=ranges.filter(r=>r.is_boss);
    mount.innerHTML=`<div class="towerDashboardGrid">
      <section class="panel towerMetric"><small>ACTIVE RANGE</small><b>${n(ranges.length)}</b><span>현재 운영 구간 설정</span></section>
      <section class="panel towerMetric"><small>TOWER MONSTER</small><b>${n(towerMonsters.length)}</b><span>무한의탑 사용 몬스터</span></section>
      <section class="panel towerMetric"><small>TOWER ONLY</small><b>${n(towerOnly.length)}</b><span>일반 PVE 차단 몬스터</span></section>
      <section class="panel towerMetric"><small>BOSS FLOOR</small><b>${n(bosses.length)}</b><span>등록된 보스 구간</span></section>
      <section class="panel towerWide"><div class="maintenanceHead"><div><small>QUICK CONTROL</small><h2>운영 상태</h2><p>전투 데이터를 삭제하지 않고 입장만 제어합니다.</p></div><div class="towerInlineControls"><label class="towerCmsSwitch"><input id="towerEnabled" type="checkbox" ${d.settings?.enabled!==false?'checked':''}><span></span></label><b id="towerEnabledLabel">${d.settings?.enabled!==false?'ON':'OFF'}</b><button id="towerSaveSettings">상태 저장</button></div></div></section>
      <section class="panel towerWide"><div class="maintenanceHead"><div><small>MONSTER LINK</small><h2>연동 몬스터</h2><p>이미지·공격·피격·궁극기 연출은 몬스터 관리 수정값을 자동 상속합니다.</p></div><button id="towerOpenMonsterStudio" class="ghost">몬스터 관리 열기</button></div><div class="towerMonsterChips">${towerMonsters.map(m=>`<span class="${m.towerOnly?'only':''}"><b>${e(m.name)}</b><small>${monsterBadge(m)}${m.ultimateEnabled?' · 궁극기':''}</small></span>`).join('')||'<div class="inlineNotice">무한의탑 사용 몬스터가 없습니다.</div>'}</div></section>
    </div>`;
    q('#towerOpenMonsterStudio').onclick=()=>show('monsters');
    q('#towerEnabled').onchange=()=>q('#towerEnabledLabel').textContent=q('#towerEnabled').checked?'ON':'OFF';
    q('#towerSaveSettings').onclick=saveSettings;
  }

  function renderRanges(mount,d,season,monsters,ranges){
    mount.innerHTML=`<div class="towerManageLayout">
      <section class="panel towerRangeEditor">
        <div class="maintenanceHead"><div><small>FLOOR RANGE EDITOR</small><h2>층 구간 일괄 배치</h2><p>1~9층 일반 몬스터, 10층 보스처럼 한 번에 설정합니다.</p></div><button id="towerResetRange" class="ghost">입력 초기화</button></div>
        <input id="towerRangeId" type="hidden">
        <div class="towerRangeForm">
          <label><span>시작 층</span><input id="towerStartFloor" type="number" min="1" value="1"></label>
          <label><span>종료 층</span><input id="towerEndFloor" type="number" min="1" value="9"></label>
          <label class="wide"><span>몬스터 선택</span><select id="towerRangeMonster">${monsters.map(m=>`<option value="${m.id}">${e(m.name)} · ${monsterBadge(m)}${m.ultimateEnabled?' · ULT':''}</option>`).join('')}</select></label>
          <label><span>층 유형</span><select id="towerRangeBoss"><option value="0">일반층</option><option value="1">보스층</option></select></label>
          <label><span>전투력 덮어쓰기</span><input id="towerRangePower" type="number" min="0" placeholder="자동"></label>
          <label><span>코인 보상</span><input id="towerRangeReward" type="number" min="0" value="1000"></label>
          <label class="towerCheck wide"><input id="towerRangeOnly" type="checkbox" checked><span><b>무한의탑 전용으로 지정</b><small>일반 PVE 목록·자동전투·직접 요청에서 서버가 제외합니다.</small></span></label>
        </div>
        <div class="towerEditorFooter"><small>겹치는 층 구간은 저장되지 않습니다. 기존 데이터는 삭제하지 않습니다.</small><button id="towerSaveRange">구간 저장</button></div>
      </section>
      <section class="panel towerRangeListPanel">
        <div class="maintenanceHead"><div><small>FLOOR MAP</small><h2>현재 층 구성</h2><p>상시 운영 층 배치</p></div><button id="towerRefresh" class="ghost">새로고침</button></div>
        <div class="towerRangeCards">${ranges.map(rangeCard).join('')||'<div class="towerEmpty"><b>등록된 구간이 없습니다.</b><span>왼쪽 편집기에서 첫 구간을 추가하세요.</span></div>'}</div>
      </section>
    </div>`;
    q('#towerSaveRange').onclick=()=>saveRange(season);
    q('#towerRefresh').onclick=loadTowerAdmin;
    q('#towerResetRange').onclick=resetRangeForm;
    mount.querySelectorAll('[data-range-edit]').forEach(b=>b.onclick=()=>editRange(ranges.find(r=>Number(r.id)===Number(b.dataset.rangeEdit))));
    mount.querySelectorAll('[data-range-delete]').forEach(b=>b.onclick=()=>deleteRange(Number(b.dataset.rangeDelete)));
  }

  function renderLegacy(mount,d,season){
    const floors=(d.floors||[]).filter(f=>!season||Number(f.season_id)===Number(season.id));
    mount.innerHTML=`<section class="panel"><div class="maintenanceHead"><div><small>LEGACY COMPATIBILITY</small><h2>기존 단일 층 설정</h2><p>기존 데이터는 유지되며 신규 범위가 없는 층에서 자동으로 사용됩니다.</p></div><span class="towerReadOnlyBadge">읽기 전용 안전 보기</span></div><div class="towerLegacyTable"><div class="head"><span>층</span><span>몬스터</span><span>전투력</span><span>보상</span><span>상태</span></div>${floors.map(f=>`<div><b>${n(f.floor_no)}F</b><span>${e(f.monster_name||'-')}</span><span>${f.power_override?n(f.power_override):'자동'}</span><span>${n(f.reward_coin)}</span><small>${f.is_active===0?'비활성':'활성'}</small></div>`).join('')||'<div class="towerEmpty"><b>기존 단일 층 설정이 없습니다.</b></div>'}</div></section>`;
  }

  function renderRanking(mount,d,season){
    const ranking=d.ranking||[];
    mount.innerHTML=`<div class="towerManageLayout">
      <section class="panel"><div class="maintenanceHead"><div><small>PERMANENT RANKING</small><h2>최고층 랭킹</h2><p>시즌 없이 계속 누적됩니다. 초기화는 운영자가 직접 실행합니다.</p></div></div><div class="towerRankingList">${ranking.map((r,i)=>`<div><b>${i+1}</b><span>${e(r.nickname)}</span><strong>${n(r.highest_floor)}F</strong><small>${r.highest_reached_at?(typeof fmt==='function'?fmt(r.highest_reached_at):e(r.highest_reached_at)):'-'}</small></div>`).join('')||'<div class="towerEmpty"><b>아직 기록이 없습니다.</b></div>'}</div></section>
      <section class="panel"><div class="maintenanceHead"><div><small>MANUAL RESET</small><h2>운영자 초기화</h2><p>랭킹 초기화와 진행도 초기화는 서로 다른 작업입니다.</p></div></div><div class="towerResetCards"><article><b>랭킹만 초기화</b><p>최고층과 달성 시간만 0으로 초기화합니다. 현재 도전층은 유지됩니다.</p><button id="towerResetRanking" class="danger">전체 랭킹 초기화</button></article><article><b>진행도까지 초기화</b><p>모든 유저를 1층으로 되돌립니다. 최고층 완료 유저의 재등반이 필요할 때만 사용하세요.</p><button id="towerResetProgress" class="danger">전체 진행도 초기화</button></article></div></section>
    </div>`;
    q('#towerResetRanking').onclick=()=>manualReset('RESET_RANKING','무한의탑 랭킹 초기화','랭킹 기록만 초기화됩니다. 현재 층은 유지됩니다.');
    q('#towerResetProgress').onclick=()=>manualReset('RESET_PROGRESS','무한의탑 진행도 초기화','모든 유저가 1층으로 돌아갑니다.');
  }
  async function manualReset(action,required,message){
    if(!confirm(message+' 계속할까요?'))return;
    const typed=prompt(`확인 문구를 정확히 입력하세요.\n${required}`,'');if(typed===null)return;
    await api('admin/tower',{method:'POST',body:JSON.stringify({action,confirmText:typed})});alert('초기화가 완료되었습니다.');await loadTowerAdmin();
  }

  function rangeCard(r){
    const floor=Number(r.start_floor)===Number(r.end_floor)?`${r.start_floor}층`:`${r.start_floor}~${r.end_floor}층`;
    return `<article class="towerRangeCard ${r.is_boss?'boss':''}"><div class="towerRangeFloor"><small>${r.is_boss?'BOSS':'RANGE'}</small><b>${floor}</b></div><div class="towerRangeInfo"><h3>${e(r.monster_name||'몬스터')}</h3><p>${r.is_boss?'보스층':'일반층'} · ${r.power_override?`전투력 ${n(r.power_override)}`:'자동 전투력'} · 코인 ${n(r.reward_coin)}${r.ultimate_enabled?' · 궁극기 상속':''}</p></div><div class="towerRangeActions"><button class="ghost" data-range-edit="${r.id}">수정</button><button class="danger" data-range-delete="${r.id}">비활성</button></div></article>`;
  }

  function resetRangeForm(){q('#towerRangeId').value='';q('#towerStartFloor').value=1;q('#towerEndFloor').value=9;q('#towerRangePower').value='';q('#towerRangeReward').value=1000;q('#towerRangeBoss').value='0';q('#towerRangeOnly').checked=true;}
  function editRange(r){if(!r)return;q('#towerRangeId').value=r.id;q('#towerStartFloor').value=r.start_floor;q('#towerEndFloor').value=r.end_floor;q('#towerRangeMonster').value=r.monster_id;q('#towerRangePower').value=r.power_override||'';q('#towerRangeReward').value=r.reward_coin||0;q('#towerRangeBoss').value=r.is_boss?'1':'0';q('.towerRangeEditor')?.scrollIntoView({behavior:'smooth',block:'start'});}
  async function saveRange(season){
    if(!season?.id)return alert('무한의탑 운영 기준을 불러오지 못했습니다.');
    const startFloor=Number(q('#towerStartFloor').value),endFloor=Number(q('#towerEndFloor').value),monsterId=Number(q('#towerRangeMonster').value);
    if(!monsterId)return alert('배치할 몬스터를 선택하세요. 몬스터 관리에 활성 몬스터가 없다면 먼저 등록해야 합니다.');
    if(endFloor<startFloor)return alert('종료 층은 시작 층보다 작을 수 없습니다.');
    const towerOnly=q('#towerRangeOnly').checked;
    if(towerOnly&&!confirm('이 몬스터를 무한의탑 전용으로 지정하면 일반 PVE에서 제외됩니다. 계속할까요?'))return;
    await api('admin/tower',{method:'POST',body:JSON.stringify({action:'SAVE_RANGE',id:Number(q('#towerRangeId').value)||null,seasonId:season.id,startFloor,endFloor,monsterId,powerOverride:Number(q('#towerRangePower').value)||null,rewardCoin:Number(q('#towerRangeReward').value)||0,isBoss:q('#towerRangeBoss').value==='1',towerOnly})});
    alert('층 구간을 저장했습니다.');await loadTowerAdmin();
  }
  async function deleteRange(id){if(!confirm('이 범위를 비활성화할까요? 데이터는 삭제되지 않습니다.'))return;await api('admin/tower',{method:'POST',body:JSON.stringify({action:'DELETE_RANGE',id})});await loadTowerAdmin();}
  async function saveSettings(){const enabled=q('#towerEnabled').checked;if(!enabled&&!confirm('무한의탑 입장을 중지할까요?'))return;await api('admin/tower',{method:'POST',body:JSON.stringify({action:'SAVE_SETTINGS',enabled})});alert('운영 상태를 저장했습니다.');await loadTowerAdmin();}
})();
