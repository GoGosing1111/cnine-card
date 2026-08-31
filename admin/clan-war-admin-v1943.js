(()=>{
  'use strict';
  const token=()=>localStorage.getItem('cnine_admin_token')||'';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const num=value=>Number(value||0).toLocaleString('ko-KR');
  const date=value=>{const ms=Date.parse(value||'');return Number.isFinite(ms)?new Date(ms).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'-'};
  const markAsset=key=>`../assets/ui/clan/marks/${({DK:'dk',SAMSUNG:'samsung',T1:'t1',HANWHA:'hanwha',LG:'lg',LOTTE:'lotte',FM:'fm',DC:'dc'}[key]||'dk')}-clan-mark-v1.webp`;
  async function api(path,options={}){const response=await fetch('/api/'+path,{...options,headers:{'content-type':'application/json','authorization':`Bearer ${token()}`,...(options.headers||{})}}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'클랜전 CMS 요청에 실패했습니다.');return data}
  let data=null,loadPromise=null,loadedAt=0,busy=false;
  const root=()=>document.getElementById('clanWarAdminRoot');
  const visible=()=>{const view=document.getElementById('view-clanwar');return Boolean(view&&!view.hidden&&!document.getElementById('cms')?.hidden)};
  const q=id=>document.getElementById(id);
  const field=(id,label,type='number',extra='')=>`<label class="cwadmin-field"><span>${label}</span><input id="${id}" type="${type}" ${extra}></label>`;
  const select=(id,label,options,extra='')=>`<label class="cwadmin-field"><span>${label}</span><select id="${id}" ${extra}>${options.map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select></label>`;
  function shell(){
    const target=root();if(!target||q('clanWarAdminV1943'))return;
    target.innerHTML=`<section id="clanWarAdminV1943" class="cwadmin-shell">
      <header class="cwadmin-hero"><div><small>SOOPKETMON · CLAN WAR CMS</small><h2>클랜전 통합 운영실</h2><p>현재 라이브 계약과 60분 클랜전 출시 설계값을 분리해 관리합니다. 미구현 기능은 READY로 위장하지 않습니다.</p></div><div class="cwadmin-hero-state"><span id="cwModeBadge">LOADING</span><b id="cwSeasonBadge">시즌 확인 중</b><small id="cwServerNow">SERVER SYNC</small></div></header>
      <section class="cwadmin-metrics" id="cwMetrics"><article><small>시즌 참가</small><b>-</b></article><article><small>편성 클랜</small><b>-</b></article><article><small>진행 대진</small><b>-</b></article><article><small>전투 영수증</small><b>-</b></article></section>
      <section class="cwadmin-gates"><header><div><small>RELEASE GATE</small><h3>라이브 연결 상태</h3></div><span>설계값 저장 ≠ 런타임 적용</span></header><div id="cwReleaseGates"></div></section>
      <form id="cwSettingsForm" class="cwadmin-form">
        <section class="cwadmin-panel"><header><div><small>01 · RELEASE & WINDOW</small><h3>공개 상태·60분 대진</h3></div><em>LIVE MODE</em></header><div class="cwadmin-grid cols-3">
          ${select('cwMode','운영 모드',[['OFF','OFF · 완전 비공개'],['TEST','TEST · OWNER 전용'],['ON','ON · 유저 공개']])}
          ${select('cwScheduleEnabled','정시 개방 사용',[['1','사용'],['0','중지']])}
          ${field('cwWarOpenTime','개방 시각 (KST)','time')}
          ${field('cwWarDurationMinutes','대진 지속 시간 (분)','number','min="15" max="180"')}
          ${select('cwFixedOpponent','시간 내 상대 고정',[['1','고정'],['0','변경 허용']])}
          ${field('cwTimezone','시간대','text','readonly')}
        </div><div class="cwadmin-days"><span>개방 요일</span>${['일','월','화','수','목','금','토'].map((label,index)=>`<label><input type="checkbox" class="cwOpenDay" value="${index}"><b>${label}</b></label>`).join('')}</div></section>
        <section class="cwadmin-panel"><header><div><small>02 · ENERGY & MATCHING</small><h3>행동력·전투력 자동 매칭</h3></div><em>DESIGN TARGET</em></header><div class="cwadmin-grid cols-4">
          ${field('cwInitialEnergy','시작 행동력','number','min="1" max="20"')}${field('cwEnergyCap','행동력 상한','number','min="1" max="30"')}${field('cwEnergyRecoverySeconds','1회 회복 (초)','number','min="30" max="3600"')}${field('cwAttackEnergyCost','교전 소모','number','min="1" max="10"')}
          ${field('cwTotalUseLimit','개인 총 사용 상한','number','min="1" max="50"')}${field('cwDefensesPerTarget','대상별 방어 상한','number','min="1" max="50"')}${field('cwRepeatTargetLimit','동일 대상 공격 상한','number','min="1" max="10"')}${select('cwPowerMatchEnabled','자동 매칭',[['1','사용'],['0','중지']])}
          ${field('cwPowerMatchTolerancePct','우선 허용 범위 (%)','number','min="1" max="100"')}${select('cwPowerMatchFallback','범위 밖 대체 규칙',[['NEAREST_LOWEST_DEFENSE','가장 가까운 전투력 · 최저 방어'],['NEAREST_POWER','가장 가까운 전투력'],['LOWEST_DEFENSE','최저 방어 횟수']])}${field('cwPowerSnapshot','전투력 스냅샷','text','readonly')}
        </div><div class="cwadmin-contract-compare" id="cwContractCompare"></div></section>
        <section class="cwadmin-panel"><header><div><small>03 · SEASON & DRAFT</small><h3>시즌·블라인드 드래프트</h3></div><em>8 CLANS · 160 USERS</em></header><div class="cwadmin-grid cols-4">
          ${field('cwMaxClans','공식 클랜','number','readonly')}${field('cwMaxMembers','클랜 정원','number','readonly')}${field('cwMaxParticipants','시즌 참가 상한','number','readonly')}${field('cwRegistrationDays','참가 신청 (일)','number','min="1" max="30"')}
          ${field('cwDraftDays','드래프트 (일)','number','min="1" max="14"')}${field('cwDraftPickSeconds','지명 제한 (초)','number','min="30" max="1800"')}${field('cwSeasonDays','시즌 진행 (일)','number','min="7" max="90"')}${select('cwRosterPolicy','시즌별 재편성',[['1','매 시즌 드래프트 풀 복귀']], 'disabled')}
        </div><div class="cwadmin-lock-row"><span>블라인드 후보</span><b>고정</b><span>스네이크 드래프트</span><b>고정</b><span>공식 클랜 이름·마크</span><b>고정</b><span>클랜 슬로건</span><b>마스터 변경</b></div></section>
        <section class="cwadmin-panel"><header><div><small>04 · SCORE, FX & REWARDS</small><h3>점수·전투 연출·보상 예약값</h3></div><em>REWARD LOCKED</em></header><div class="cwadmin-grid cols-4">
          ${field('cwWarWinScore','대진 승리 점수','number','min="1" max="20"')}${field('cwSeasonWinScore','시즌 승리 점수','number','min="0" max="100"')}${field('cwSeasonLossScore','시즌 패배 점수','number','min="0" max="100"')}${field('cwPlaybackSpeed','V3 재생 배속','number','min="0.5" max="3" step="0.1"')}
          ${field('cwReceiptDays','영수증 보존 (일)','number','min="1" max="180"')}${field('cwWinnerCoin','우승 코인 예약','number','min="0" max="100000000"')}${field('cwRunnerUpCoin','준우승 코인 예약','number','min="0" max="100000000"')}${field('cwParticipationCoin','참여 코인 예약','number','min="0" max="100000000"')}${field('cwParticipationShards','참여 조각 예약','number','min="0" max="1000000"')}
        </div><p class="cwadmin-warning">경제 보상 지급 코드는 아직 연결되지 않았으므로 보상 활성화는 서버에서 강제로 잠겨 있습니다. 수량은 추후 검토용 예약값만 저장합니다.</p></section>
        <footer class="cwadmin-save"><span id="cwSaveState">서버 설정을 불러오는 중입니다.</span><button type="submit" id="cwSaveButton">클랜전 전체 설정 저장</button></footer>
      </form>
      <section class="cwadmin-panel cwadmin-operations"><header><div><small>05 · OWNER TEST CONTROL</small><h3>테스트 시즌 단계 제어</h3></div><button type="button" class="ghost" id="cwReload">현황 새로고침</button></header><div class="cwadmin-operation-summary" id="cwOperationSummary"></div><div class="cwadmin-operation-buttons"><button type="button" data-cw-operation="bootstrap">테스트 풀 구성·드래프트 시작</button><button type="button" data-cw-operation="activate">잔여 지명 완료·클랜전 개막</button><button type="button" data-cw-operation="settle">현재 점수로 테스트 정산</button></div></section>
      <section class="cwadmin-panel"><header><div><small>06 · OFFICIAL CLANS</small><h3>공식 8클랜 현황</h3></div><em id="cwClanCount">0 / 8</em></header><div class="cwadmin-clans" id="cwClans"></div></section>
      <section class="cwadmin-panel"><header><div><small>07 · CURRENT MATCHES</small><h3>현재 대진·점수</h3></div><em id="cwWarCount">0 MATCHES</em></header><div class="cwadmin-wars" id="cwWars"></div></section>
      <section class="cwadmin-panel"><header><div><small>08 · BATTLE RECEIPTS</small><h3>최근 클랜전 처리 현황</h3></div><em>최근 40건 · 상세 타임라인 미보존</em></header><div class="cwadmin-receipts" id="cwReceipts"></div></section>
    </section>`;
    q('cwSettingsForm').addEventListener('submit',save);
    q('cwReload').onclick=()=>load(true);const top=q('clanWarAdminTopReload');if(top)top.onclick=()=>load(true);
    document.querySelectorAll('[data-cw-operation]').forEach(button=>button.onclick=()=>operate(button.dataset.cwOperation,button));
  }
  function setValue(id,value){const element=q(id);if(element)element.value=String(value??'')}
  function populate(settings){
    setValue('cwMode',settings.mode);setValue('cwScheduleEnabled',settings.scheduleEnabled?'1':'0');setValue('cwWarOpenTime',settings.warOpenTime);setValue('cwWarDurationMinutes',settings.warDurationMinutes);setValue('cwFixedOpponent',settings.fixedOpponentPerWindow?'1':'0');setValue('cwTimezone',settings.timezone);
    setValue('cwInitialEnergy',settings.initialEnergy);setValue('cwEnergyCap',settings.energyCap);setValue('cwEnergyRecoverySeconds',settings.energyRecoverySeconds);setValue('cwAttackEnergyCost',settings.attackEnergyCost);setValue('cwTotalUseLimit',settings.totalUseLimit);setValue('cwDefensesPerTarget',settings.defensesPerTarget);setValue('cwRepeatTargetLimit',settings.repeatTargetLimit);setValue('cwPowerMatchEnabled',settings.powerMatchEnabled?'1':'0');setValue('cwPowerMatchTolerancePct',settings.powerMatchTolerancePct);setValue('cwPowerMatchFallback',settings.powerMatchFallback);setValue('cwPowerSnapshot',settings.powerSnapshot);
    setValue('cwMaxClans',settings.maxClans);setValue('cwMaxMembers',settings.maxMembers);setValue('cwMaxParticipants',settings.maxParticipants);setValue('cwRegistrationDays',settings.registrationDays);setValue('cwDraftDays',settings.draftDays);setValue('cwDraftPickSeconds',settings.draftPickSeconds);setValue('cwSeasonDays',settings.seasonDays);setValue('cwWarWinScore',settings.warWinScore);setValue('cwSeasonWinScore',settings.seasonWinScore);setValue('cwSeasonLossScore',settings.seasonLossScore);setValue('cwPlaybackSpeed',settings.playbackSpeed);setValue('cwReceiptDays',settings.battleReceiptRetentionDays);setValue('cwWinnerCoin',settings.winnerCoin);setValue('cwRunnerUpCoin',settings.runnerUpCoin);setValue('cwParticipationCoin',settings.participationCoin);setValue('cwParticipationShards',settings.participationShards);
    const open=new Set(settings.openDays||[]);document.querySelectorAll('.cwOpenDay').forEach(box=>box.checked=open.has(Number(box.value)));
  }
  function draft(){
    const integer=id=>Number(q(id)?.value||0),boolean=id=>q(id)?.value==='1';
    return{mode:q('cwMode').value,scheduleEnabled:boolean('cwScheduleEnabled'),warOpenTime:q('cwWarOpenTime').value,warDurationMinutes:integer('cwWarDurationMinutes'),openDays:[...document.querySelectorAll('.cwOpenDay:checked')].map(box=>Number(box.value)),fixedOpponentPerWindow:boolean('cwFixedOpponent'),initialEnergy:integer('cwInitialEnergy'),energyCap:integer('cwEnergyCap'),energyRecoverySeconds:integer('cwEnergyRecoverySeconds'),attackEnergyCost:integer('cwAttackEnergyCost'),totalUseLimit:integer('cwTotalUseLimit'),defensesPerTarget:integer('cwDefensesPerTarget'),repeatTargetLimit:integer('cwRepeatTargetLimit'),powerMatchEnabled:boolean('cwPowerMatchEnabled'),powerMatchTolerancePct:integer('cwPowerMatchTolerancePct'),powerMatchFallback:q('cwPowerMatchFallback').value,registrationDays:integer('cwRegistrationDays'),draftDays:integer('cwDraftDays'),draftPickSeconds:integer('cwDraftPickSeconds'),seasonDays:integer('cwSeasonDays'),warWinScore:integer('cwWarWinScore'),seasonWinScore:integer('cwSeasonWinScore'),seasonLossScore:integer('cwSeasonLossScore'),playbackSpeed:Number(q('cwPlaybackSpeed').value||1.3),battleReceiptRetentionDays:integer('cwReceiptDays'),winnerCoin:integer('cwWinnerCoin'),runnerUpCoin:integer('cwRunnerUpCoin'),participationCoin:integer('cwParticipationCoin'),participationShards:integer('cwParticipationShards')};
  }
  async function save(event){
    event.preventDefault();if(busy)return;const settings=draft();if(!settings.openDays.length)return alert('클랜전 개방 요일을 하나 이상 선택하세요.');if(settings.initialEnergy>settings.energyCap)return alert('시작 행동력은 행동력 상한보다 클 수 없습니다.');if(settings.totalUseLimit<settings.initialEnergy)return alert('개인 총 사용 상한은 시작 행동력 이상이어야 합니다.');if(settings.mode==='ON'&&!confirm('클랜 시스템을 유저에게 공개하는 ON 설정입니다. 현재 미구현 출시 게이트가 남아 있습니다. 그래도 저장할까요?'))return;
    const button=q('cwSaveButton');busy=true;button.disabled=true;button.textContent='전체 설정 저장 중';q('cwSaveState').textContent='OWNER 설정을 서버에 저장하고 재조회합니다.';
    try{data=await api('admin/clan-war/settings',{method:'PATCH',body:JSON.stringify({settings})});loadedAt=Date.now();render();alert('클랜전 CMS 설정이 저장되었습니다. 라이브 미연결 항목은 출시 게이트에 계속 PENDING으로 표시됩니다.')}catch(error){q('cwSaveState').textContent=error.message;alert(error.message)}finally{busy=false;button.disabled=false;button.textContent='클랜전 전체 설정 저장'}
  }
  async function operate(action,button){
    if(busy)return;const copy={bootstrap:['테스트 풀을 구성하고 블라인드 드래프트를 시작할까요?','clan/admin/test-bootstrap',{limit:160}],activate:['남은 지명을 자동 완료하고 V3 테스트 클랜전을 개막할까요?','clan/admin/test-activate',{}],settle:['현재 점수로 테스트 시즌을 정산할까요? 경제 보상은 지급되지 않습니다.','clan/admin/test-settle',{}]}[action];if(!copy||!confirm(copy[0]))return;
    busy=true;button.disabled=true;const original=button.textContent;button.textContent='처리 중';try{await api(copy[1],{method:'POST',body:JSON.stringify(copy[2])});await load(true)}catch(error){alert(error.message)}finally{busy=false;button.textContent=original;render()}
  }
  function render(){
    if(!data)return;const settings=data.settings||{},season=data.season||{},metrics=data.metrics||{},phase=String(season.phase||'NO SEASON'),mode=String(settings.mode||'TEST');populate(settings);
    q('cwModeBadge').className=`mode-${mode.toLowerCase()}`;q('cwModeBadge').textContent=mode;q('cwSeasonBadge').textContent=season.seasonNo?`SEASON ${season.seasonNo} · ${phase}`:'시즌 없음';q('cwServerNow').textContent=`KST ${date(data.serverNow)}`;
    q('cwMetrics').innerHTML=[['시즌 참가',metrics.registered],['공식 클랜',`${metrics.clansActive||0} / 8`],['진행 대진',metrics.warsActive],['전투 영수증',metrics.battlesTotal]].map(([label,value])=>`<article><small>${label}</small><b>${typeof value==='number'?num(value):esc(value)}</b></article>`).join('');
    q('cwReleaseGates').innerHTML=(data.releaseGates||[]).map(gate=>`<article class="gate-${String(gate.status).toLowerCase()}"><i>${gate.status==='READY'?'✓':gate.status==='LOCKED'?'×':'!'}</i><span><b>${esc(gate.label)}</b><small>${esc(gate.key)}</small></span><em>${esc(gate.status)}</em></article>`).join('');
    const runtime=data.runtimeContract||{},target=data.targetContract||{};q('cwContractCompare').innerHTML=`<article><small>현재 라이브</small><b>작전권 ${num(runtime.attacksPerWar)}회 · 방어 ${num(runtime.defensesPerTarget)}회</b><span>${esc(runtime.roundGeneration||'')} · ${esc(runtime.rewards||'')}</span></article><i>→</i><article class="target"><small>CMS 출시 설계값</small><b>행동력 ${num(target.initialEnergy)} / ${num(target.energyCap)} · ${num(target.energyRecoverySeconds)}초 회복</b><span>총 ${num(target.totalUseLimit)}회 · ±${num(target.powerMatchTolerancePct)}% 자동 매칭</span></article>`;
    q('cwSaveState').textContent=`마지막 동기화 ${new Date(loadedAt).toLocaleTimeString('ko-KR')} · 공개 모드 ${mode}`;
    q('cwOperationSummary').innerHTML=`<span><small>현재 단계</small><b>${esc(phase)}</b></span><span><small>참가 / 대기 / 지명</small><b>${num(metrics.registered)} / ${num(metrics.available)} / ${num(metrics.drafted)}</b></span><span><small>시즌 일정</small><b>${date(season.registrationEndsAt)} → ${date(season.endsAt)}</b></span><span><small>정산 상태</small><b>${esc(data.settlement?.status||'대기')}</b></span>`;
    document.querySelectorAll('[data-cw-operation]').forEach(button=>{const action=button.dataset.cwOperation,allowed=mode==='TEST'&&((action==='bootstrap'&&phase==='REGISTRATION')||(action==='activate'&&phase==='DRAFT')||(action==='settle'&&['ACTIVE','SETTLEMENT'].includes(phase)));button.disabled=!allowed});
    const clans=data.clans||[];q('cwClanCount').textContent=`${clans.filter(clan=>clan.active).length} / 8`;q('cwClans').innerHTML=clans.map(clan=>`<article style="--cw-primary:${esc(clan.primaryColor)};--cw-accent:${esc(clan.accentColor)}"><img src="${markAsset(clan.markKey)}" alt=""><div><small>${esc(clan.markKey)} · ${clan.active?'ACTIVE':'INACTIVE'}</small><b>${esc(clan.name)}</b><span>${esc(clan.masterNickname||'마스터 미배정')} · ${num(clan.memberCount)} / 20명</span><p>${esc(clan.slogan||'슬로건 미등록')}</p></div><dl><dt>시즌 점수</dt><dd>${num(clan.score)}</dd><dt>승 / 패</dt><dd>${num(clan.wins)} / ${num(clan.losses)}</dd><dt>트로피</dt><dd>${num(clan.trophies)}</dd></dl></article>`).join('')||'<p class="cwadmin-empty">공식 클랜을 불러오지 못했습니다.</p>';
    const wars=data.wars||[];q('cwWarCount').textContent=`${wars.length} MATCHES`;q('cwWars').innerHTML=wars.map(war=>`<article><header><span>ROUND ${num(war.roundNo)}</span><em class="status-${String(war.status).toLowerCase()}">${esc(war.status)}</em></header><div><b>${esc(war.clanAName)}</b><strong>${num(war.scoreA)} : ${num(war.scoreB)}</strong><b>${esc(war.clanBName)}</b></div><footer><span>${num(war.battleCount)} BATTLES</span><span>${date(war.startsAt)} — ${date(war.endsAt)}</span>${war.winnerName?`<b>WINNER ${esc(war.winnerName)}</b>`:''}</footer></article>`).join('')||'<p class="cwadmin-empty">현재 생성된 클랜전 대진이 없습니다.</p>';
    const receipts=data.recentBattles||[];q('cwReceipts').innerHTML=receipts.length?`<div class="cwadmin-receipt head"><b>상태</b><b>대진</b><b>공격자 → 방어자</b><b>승자</b><b>처리 시각</b></div>${receipts.map(item=>`<div class="cwadmin-receipt"><span class="status-${String(item.status).toLowerCase()}">${esc(item.status)}</span><b>${esc(item.attackerClan)} vs ${esc(item.defenderClan)}</b><span>${esc(item.attackerNickname)} → ${esc(item.defenderNickname)}</span><span>${esc(item.winnerClan||item.errorMessage||'-')}</span><time>${date(item.updatedAt)}</time></div>`).join('')}`:'<p class="cwadmin-empty">최근 클랜전 영수증이 없습니다.</p>';
  }
  async function load(force=false){
    shell();if(loadPromise)return loadPromise;if(!force&&data&&Date.now()-loadedAt<30000){render();return data}q('cwSaveState').textContent='클랜전 서버 상태를 동기화하는 중입니다.';
    loadPromise=api('admin/clan-war/settings').then(result=>{data=result;loadedAt=Date.now();render();return result}).catch(error=>{q('cwSaveState').textContent=error.message;throw error}).finally(()=>{loadPromise=null});return loadPromise;
  }
  new MutationObserver(()=>{shell();if(visible()){const title=q('pageTitle');if(title)title.textContent='클랜전 관리';void load(false).catch(error=>console.warn('[clan-war-cms]',error.message))}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  addEventListener('load',()=>{shell();if(visible())void load(false).catch(error=>console.warn('[clan-war-cms]',error.message))});shell();
  globalThis.ClanWarAdminV1943={load,render,get data(){return data}};
})();
