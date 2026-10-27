(() => {
  const ROLE = {
    ATTACK: { label: '파괴 봉인', icon: '⚔', description: '보스의 외피와 핵을 파괴합니다.' },
    GUARD: { label: '수호 봉인', icon: '◆', description: '보스의 광역 공격을 억제합니다.' },
    PURIFY: { label: '정화 봉인', icon: '✦', description: '오염된 마력을 정화합니다.' }
  };
  const SEAL_ORB_IMAGE = key => `/assets/ui/seal-battle/orbs-20261022/${({ATTACK:'attack',GUARD:'guard',PURIFY:'purify'})[key]||'attack'}.webp`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const api = (path, options = {}) => window.apiRequest(path, options, { ttl: 0 });
  let active = false;
  let loading = false;
  let latest = null;
  let chargeTimer = null;
  const DRAGON_ART = '/assets/ui/seal-battle/dragon-20261022';
  const bossPhase = event => Boolean(event?.bossStage && (event.phase === 'BOSS' || event.phase === 'COMPLETED' || event.bossStage.openedAt));

  function journey(event) {
    const step=event.status==='CLEARED'?3:bossPhase(event)?2:1;
    return `<ol class="seal-journey" aria-label="봉인전 진행 단계">${[['세 봉인 해제','ATTACK'],['용 보스 본체전','GUARD'],['공동 완료 보상','PURIFY']].map(([label,key],index)=>`<li ${step===index+1?'aria-current="step"':''} class="${step>index+1?'done':''}"><span class="seal-journey-marker"><img src="${roleImage(key)}" alt="" width="32" height="32"><small>0${index+1}</small></span><span class="seal-journey-label">${label}</span></li>`).join('')}</ol>`;
  }

  function dragonHero(data) {
    const event=data.event,boss=event.bossStage,opened=bossPhase(event),done=event.status==='CLEARED',failed=event.status==='FAILED';
    const complete=Object.values(event.roles).filter(r=>r.completed).length;
    return `${journey(event)}<section class="seal-sanctum seal-dragon-sanctum ${opened?'awakened':'sealed'} ${done?'cleared':''}"><div class="seal-sanctum-copy"><span class="seal-state">${done?'공동 토벌 완료':failed?'도전 종료':opened?'02 · 용 보스 본체전':'01 · 세 봉인 해제'}</span><h2>${esc(boss.name)}</h2><p>${done?'원정대의 힘으로 봉인룡을 쓰러뜨렸습니다.':failed?'제한 시간 내 공동 목표를 완료하지 못했습니다.':opened?'봉인이 해제되었습니다. 서버 전체가 함께 본체 체력을 소진하세요.':'파괴·수호·정화 세 봉인을 해제하면 봉인룡이 깨어납니다.'}</p>${opened?`<div class="seal-dragon-health"><div><span>서버 공동 본체 HP</span><strong>${number(boss.hp)} <small>/ ${number(boss.maxHp)}</small></strong></div><div class="seal-progress-track" role="progressbar" aria-label="용 보스 남은 체력" aria-valuemin="0" aria-valuemax="${Number(boss.maxHp)}" aria-valuenow="${Number(boss.hp)}"><i style="width:${percent(boss.hp/boss.maxHp*100)}%"></i></div></div>`:`<div class="seal-completion"><strong>${complete}<small>/ 3</small></strong><span>해제한 봉인<small>본체전은 세 봉인 해제 후 개방</small></span></div>`}<p class="seal-deadline">종료 ${formatTime(event.endsAt)}</p></div><div class="seal-sanctum-caption"><span>${number(data.stats?.participants)}명 참여</span><span>${number(data.stats?.attempts)}회 전투</span></div></section>`;
  }

  function dragonCommand(data) {
    const event=data.event,boss=event.bossStage,attempts=Number(data.progress?.availableAttempts??0);
    const canAct=data.availability?.open&&data.deck?.ready&&attempts>0&&event.phase==='BOSS';
    const hint=!data.availability?.open?data.availability?.message:!data.deck?.ready?'PvE 덱에 카드 5장을 편성해 주세요.':attempts<1?'도전 횟수가 충전되면 참여할 수 있습니다.':'도전 횟수 1회 사용 · 봉인 단계와 공격 횟수 합산';
    return `<section class="seal-dragon-command seal-tablet"><div class="seal-opened-sigils">${Object.keys(ROLE).map(key=>`<span><img src="${roleImage(key)}" width="56" height="56" alt="">${ROLE[key].label} 해제</span>`).join('')}</div><div class="seal-dragon-portrait"><img src="${DRAGON_ART}/portrait.webp" alt="검은 비늘과 청록빛 균열을 가진 봉인룡 네르가온" width="768" height="512"></div><header><small>최종 공동 목표</small><h2>${esc(boss.name)}</h2><p>본체를 처치하면 참여 조건을 충족한 원정대원이 완료 보상을 받습니다.</p></header><dl class="seal-combat-facts"><div><dt>상대 전투력</dt><dd>${number(boss.battlePower)}</dd></div><div><dt>패배 시 피해 반영</dt><dd>${number(event.defeatContributionPercent)}%</dd></div><div><dt>내 본체 피해</dt><dd>${number(data.progress?.bossContribution)}</dd></div></dl>${buttonHtml(event.status==='CLEARED'?'공동 토벌 완료':'용 보스 공격',`data-seal-role="BOSS" ${canAct?'':'disabled'} aria-describedby="sealActionHint"`)}<p id="sealActionHint" class="seal-action-hint">${esc(hint||'')}</p></section>`;
  }

  function source(value, version = '') {
    let text = String(value || '').trim().replace(/\\/g, '/');
    if (!text) return '';
    if (!/^(?:https?:|data:|blob:|\/)/i.test(text)) text = '/' + text.replace(/^\.\//, '');
    if (version && !/^(?:data:|blob:)/i.test(text)) text += `${text.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
    return text;
  }

  function requestId() {
    let random = Math.random().toString(36).slice(2);
    try { random = crypto.randomUUID(); } catch {}
    return `seal:${Date.now()}:${random}`;
  }

  function number(value) {
    return Math.max(0, Number(value || 0)).toLocaleString();
  }

  function percent(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function formatTime(value) {
    if (!value) return '별도 종료 시각 없음';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return esc(value);
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Asia/Seoul'
    }).format(new Date(time));
  }

  function clearChargeTimer() {
    if (chargeTimer) clearInterval(chargeTimer);
    chargeTimer = null;
  }

  function countdownText(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function startChargeTimer(progress) {
    clearChargeTimer();
    const label = document.getElementById('sealRechargeTimer');
    if (!label) return;
    const maxAttempts = Math.max(1, Number(progress?.maxAttempts || 5));
    const available = Math.max(0, Number(progress?.availableAttempts ?? progress?.remainingAttempts ?? 0));
    const rechargeMinutes = Math.max(1, Number(progress?.rechargeMinutes || 60));
    const next = progress?.nextRechargeAt ? Date.parse(progress.nextRechargeAt) : NaN;
    if (available >= maxAttempts || !Number.isFinite(next)) {
      label.textContent = `최대 충전 완료 · ${rechargeMinutes}분마다 1회 충전`;
      return;
    }
    const tick = () => {
      const remain = next - Date.now();
      if (remain <= 0) {
        label.textContent = '도전 횟수 갱신 중...';
        clearChargeTimer();
        if (active && !loading) load();
        return;
      }
      label.textContent = `다음 충전 ${countdownText(remain)} · ${rechargeMinutes}분마다 1회`;
    };
    tick();
    chargeTimer = setInterval(tick, 1000);
  }

  function updateBalances(balances) {
    if (!balances || typeof window.loadUser !== 'function' || typeof window.saveUser !== 'function') return;
    const saved = window.loadUser();
    if (!saved) return;
    if (balances.coin != null) saved.coin = Number(balances.coin);
    if (balances.cardShards != null) saved.cardShards = Number(balances.cardShards);
    window.saveUser(saved);
  }

  function statusLabel(data) {
    const event = data?.event;
    if (!event) return ['미운영', '현재 진행 중인 봉인전이 없습니다.'];
    if (event.status === 'CLEARED') return ['봉인 완료', '서버 전체가 세 개의 봉인을 완성했습니다.'];
    if (event.status === 'FAILED') return ['봉인 실패', '제한 시간 안에 세 봉인을 완성하지 못해 보스가 봉인진을 돌파했습니다.'];
    if (event.status === 'ENDED') return ['종료', '이번 봉인전은 종료되었습니다.'];
    if (data?.availability?.code === 'NOT_STARTED') return ['시작 대기', data.availability.message];
    if (!data?.availability?.open) return ['운영 중지', data?.availability?.message || '현재 참여할 수 없습니다.'];
    return ['진행 중', '서버 공동 봉인 의식이 진행 중입니다.'];
  }

  const ART = '/assets/ui/seal-battle/ritual-20261021/';
  const ROLE_ART = { ATTACK: 'attack-seal', GUARD: 'guard-seal', PURIFY: 'purify-seal' };
  let selectedRole = 'ATTACK';
  const roleImage = key => `${ART}${ROLE_ART[key]}.webp`;
  const buttonHtml = (label, attributes = '') => `<button type="button" class="seal-button" ${attributes}><span>${label}</span></button>`;
  function rewardHtml(reward = {}) {
    return [['코인',reward.coin],['카드 조각',reward.shards],['마스터의 별',reward.masterStar]]
      .filter(([,value])=>Number(value)>0).map(([label,value])=>`<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join('') || '<div><dt>설정된 보상 없음</dt></div>';
  }

  function emptyView(message, detail = '', busy = false) {
    return `<section class="seal-empty seal-tablet" ${busy ? 'aria-busy="true"' : ''}><img src="${roleImage('GUARD')}" alt="" width="112" height="112"><h2>${esc(message)}</h2><p>${esc(detail)}</p>${busy ? '' : buttonHtml('다시 확인','id="sealRefresh"')}</section>`;
  }

  function roleTab(key, data) {
    const role=data.event.roles[key], selected=key===selectedRole, support=(data.lowestRoleKeys||[]).includes(key)&&!role.completed;
    return `<button type="button" role="tab" id="sealTab${key}" aria-selected="${selected}" aria-controls="sealRoleDetail" tabindex="${selected?0:-1}" data-seal-select="${key}" class="seal-sigil-tab role-${key.toLowerCase()} ${selected?'selected':''} ${role.completed?'completed':''}"><img src="${SEAL_ORB_IMAGE(key)}" width="112" height="112" alt=""><strong>${ROLE[key].label}</strong><span>${role.completed?'봉인 완료':`${percent(role.percent).toFixed(1)}%`}</span><small>${support?`지원 +${number(data.event.lowestRoleBonusPercent)}%`:role.completed?'공동 목표 달성':'공동 봉인 진행'}</small></button>`;
  }

  function roleDetail(data) {
    const key=selectedRole,role=data.event.roles[key],meta=ROLE[key];
    const attempts=Number(data.progress?.availableAttempts??data.progress?.remainingAttempts??0);
    const canAct=Boolean(data.availability?.open&&data.deck?.ready&&attempts>0&&!role.completed);
    const disabledReason=role.completed?'이 봉인은 완성되었습니다.':!data.availability?.open?data.availability?.message||'지금은 참여할 수 없습니다.':!data.deck?.ready?'PvE 덱에 카드 5장을 편성해 주세요.':attempts<=0?'도전 횟수가 충전되면 참여할 수 있습니다.':'';
    return `<section id="sealRoleDetail" class="seal-role-detail seal-tablet role-${key.toLowerCase()}" role="tabpanel" aria-labelledby="sealTab${key}"><header><div><small>선택한 봉인</small><h3>${meta.label}</h3><p>${meta.description}</p></div><img class="seal-orb-portrait" src="${SEAL_ORB_IMAGE(key)}" alt="${meta.label} 봉인구" width="176" height="176"></header><div class="seal-progress-caption"><span>서버 공동 진행도</span><strong>${percent(role.percent).toFixed(2)}<small>%</small></strong></div><div class="seal-progress-track" role="progressbar" aria-label="${meta.label} 공동 진행도" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(role.percent)}"><i style="width:${percent(role.percent)}%"></i></div><div class="seal-progress-values"><b>${number(role.progress)}</b><span>/ ${number(role.target)}</span></div><dl class="seal-combat-facts"><div><dt>상대 전투력</dt><dd>${number(role.battlePower)}</dd></div><div><dt>패배 시 공헌</dt><dd>${number(data.event.defeatContributionPercent??10)}%</dd></div><div><dt>궁극기</dt><dd>사용 불가</dd></div></dl>${buttonHtml(role.completed?'봉인 완료':`${meta.label} 전투 시작`,`data-seal-role="${key}" ${canAct?'':'disabled'} aria-describedby="sealActionHint"`)}<p id="sealActionHint" class="seal-action-hint">${esc(disabledReason||'도전 횟수 1회 사용 · 저장된 PvE 덱으로 출전')}</p></section>`;
  }

  function bindRoleControls(root) {
    root.querySelectorAll('[data-seal-select]').forEach(tab=>{
      tab.onclick=()=>selectRole(tab.dataset.sealSelect);
      tab.onkeydown=event=>{
        const keys=Object.keys(ROLE),index=keys.indexOf(tab.dataset.sealSelect);
        const next=event.key==='ArrowRight'?(index+1)%3:event.key==='ArrowLeft'?(index+2)%3:event.key==='Home'?0:event.key==='End'?2:null;
        if(next===null)return;event.preventDefault();selectRole(keys[next]);root.querySelector(`[data-seal-select="${keys[next]}"]`)?.focus();
      };
    });
    root.querySelector('[data-seal-role]')?.addEventListener('click',event=>participate(event.currentTarget.dataset.sealRole,event.currentTarget));
  }
  function selectRole(key) {
    if(!ROLE[key]||!latest?.event)return;selectedRole=key;
    const root=document.getElementById('pveSealBattleView');
    root.querySelectorAll('[data-seal-select]').forEach(tab=>{const chosen=tab.dataset.sealSelect===key;tab.classList.toggle('selected',chosen);tab.setAttribute('aria-selected',String(chosen));tab.tabIndex=chosen?0:-1;});
    root.querySelector('#sealRoleDetail').outerHTML=roleDetail(latest);bindRoleControls(root);
  }

  function render(data = latest) {
    const root=document.getElementById('pveSealBattleView');if(!root||!active)return;latest=data;
    if(!data?.event){clearChargeTimer();root.innerHTML=emptyView('다음 봉인전을 기다리고 있습니다.','봉인진이 열리면 이곳에서 참여할 수 있습니다.');root.querySelector('#sealRefresh')?.addEventListener('click',load);return;}
    const event=data.event,progress=data.progress||{},clear=data.clearReward||{},[badge,line]=statusLabel(data);
    const completed=Object.values(event.roles).filter(role=>role.completed).length;
    const minimum=Math.max(1,Number(event.minRewardAttempts||1)),remaining=Math.max(0,minimum-Number(progress.totalAttempts||0));
    const attempts=Number(progress.availableAttempts??progress.remainingAttempts??0),maximum=Number(progress.maxAttempts||event.maxAttempts||event.dailyAttempts||5);
    const canClaim=clear.eligible&&!clear.claimed&&!clear.processing;
    const claimLabel=clear.claimed?'수령 완료':clear.processing?'처리 중':event.status==='FAILED'?'이번 봉인 실패':event.status==='CLEARED'?(clear.eligible?'완료 보상 받기':`공격 ${number(minimum)}회 필요`):(event.bossStage?'용 보스 처치 후 수령':'봉인 완료 후 수령');
    root.innerHTML=`<section class="seal-battle-shell">
      <header class="seal-page-heading"><div><img src="${roleImage('GUARD')}" width="46" height="46" alt=""><div><small>서버 협력전</small><h1>${esc(event.title||'봉인전')}</h1></div></div><nav aria-label="봉인전 메뉴">${buttonHtml('전황 갱신','id="sealRefresh"')}${buttonHtml('공헌 기록','id="sealRankings"')}</nav></header>
      ${event.bossStage?dragonHero(data):`<section class="seal-sanctum ${String(event.status||'').toLowerCase()}"><div class="seal-sanctum-copy"><span class="seal-state">${esc(badge)}</span><h2>${esc(event.bossName||'심연의 봉인')}</h2><p>${esc(line)}</p><div class="seal-completion"><strong>${completed}<small>/ 3</small></strong><span>완성된 봉인<small>파괴 · 수호 · 정화</small></span></div><p class="seal-deadline">종료 ${formatTime(event.endsAt)}</p></div><div class="seal-sanctum-caption"><span>${number(data.stats?.participants)}명 참여</span><span>${number(data.stats?.attempts)}회 전투</span></div></section>`}
      <div class="seal-command-layout">${bossPhase(event)?dragonCommand(data):`<section class="seal-role-command" aria-label="봉인 선택"><div class="seal-section-heading"><h2>봉인을 선택하세요</h2><span>세 역할의 힘을 모아 완성합니다.</span></div><div class="seal-sigil-tabs" role="tablist" aria-label="봉인 역할">${Object.keys(ROLE).map(key=>roleTab(key,data)).join('')}</div>${roleDetail(data)}</section>`}
      <aside class="seal-expedition seal-tablet"><header><small>내 원정대</small><h2>출전 준비</h2></header><div class="seal-charge"><span>보유 도전 횟수</span><strong>${attempts}<small>/ ${maximum}</small></strong><p id="sealRechargeTimer">충전 정보 확인 중</p></div><dl class="seal-personal-facts"><div><dt>PvE 전투력</dt><dd>${data.deck?.ready?number(data.deck.power):'편성 필요'}</dd></div><div><dt>PvE 용병</dt><dd>${(data.deck?.mercenaries||[data.deck?.mercenary]).filter(Boolean).map(m=>`${esc(m.name)} · Lv.${number(m.mercenaryLevel?.level||m.level||1)}`).join('<br>')||'미편성'}</dd></div><div><dt>이번 회차 공격</dt><dd>${number(progress.totalAttempts)}회</dd></div><div><dt>내 공헌도</dt><dd>${number(progress.totalContribution)}</dd></div></dl>${!data.deck?.ready?`<p class="seal-inline-note">${esc(data.deck?.error||'PvE 덱에 카드 5장을 저장해 주세요.')}</p>`:''}<div class="seal-qualification"><strong>${remaining?`완료 보상까지 ${number(remaining)}회`:'완료 보상 참여 조건 충족'}</strong><p>회차 내 ${number(minimum)}회 이상 공격<br>${event.bossStage?'봉인·본체전, 승패와 관계없이 합산':'승패와 관계없이 합산'}</p></div><div class="seal-attempt-reward"><h3>전투 참여 보상</h3><dl>${rewardHtml(event.attemptReward)}</dl></div></aside></div>
      ${data.pendingClearReward?`<section class="seal-reward-panel seal-tablet previous"><div><small>지난 회차</small><h2>${esc(data.pendingClearReward.title)} 완료 보상</h2><p>아직 받지 않은 공동 완료 보상이 있습니다.</p></div><dl>${rewardHtml({...data.pendingClearReward.reward,masterStar:data.pendingClearReward.reward.masterStar})}</dl>${buttonHtml(data.pendingClearReward.processing?'처리 중':'지난 보상 받기',`data-seal-pending-claim="${Number(data.pendingClearReward.eventId)}" ${data.pendingClearReward.processing?'disabled':''}`)}</section>`:''}
      <section class="seal-reward-panel seal-tablet ${event.status==='CLEARED'?'ready':''}"><div><small>서버 공동 목표</small><h2>${event.status==='FAILED'?'봉인 실패':'공동 완료 보상'}</h2><p>${event.status==='FAILED'?'제한 시간 내 공동 목표를 완료하지 못했습니다.':`${event.bossStage?'용 보스를 처치하면':'세 봉인을 완성하면'} ${number(minimum)}회 이상 공격한 참여자가 받습니다.`}</p></div><dl>${rewardHtml(event.clearReward)}</dl>${buttonHtml(claimLabel,`id="sealClearClaim" ${canClaim?'':'disabled'}`)}</section>
      <details class="seal-rules seal-tablet"><summary>봉인전 참여 방법</summary><div><p><b>01. 역할 선택</b> 파괴·수호·정화 중 참여할 봉인을 선택합니다. 부족한 역할을 지원하면 설정된 보너스가 적용됩니다.</p><p><b>02. 전투와 공헌</b> 저장된 PvE 덱으로 전투합니다. 승리는 100%, 패배는 ${number(event.defeatContributionPercent??10)}% 공헌하며 궁극기는 사용할 수 없습니다.</p><p><b>03. 공동 목표 달성</b> ${event.bossStage?'세 봉인을 해제한 뒤 용 보스 본체 HP를 0으로 만드세요. 두 단계의 공격 횟수를 합산하며, 처치 후 참여 조건을 충족하면 보상을 한 번 받습니다.':'종료 시각 전에 세 봉인을 모두 완성하고 참여 조건을 충족하면 완료 보상을 받습니다.'}</p></div></details>
    </section>`;
    bindRoleControls(root);root.querySelector('#sealRefresh').onclick=load;root.querySelector('#sealRankings').onclick=showRankings;
    root.querySelector('#sealClearClaim').onclick=claimClearReward;root.querySelector('[data-seal-pending-claim]')?.addEventListener('click',claimClearReward);startChargeTimer(progress);
  }

  function confirmSeal(title, detail, label='확인', notice=false) {
    return new Promise(resolve=>{
      const modal=document.getElementById('modal');if(!modal){resolve(false);return;}
      const focus=document.activeElement;let settled=false;
      const finish=value=>{if(settled)return;settled=true;modal.className='modal';modal.innerHTML='';modal.onclick=null;modal.removeAttribute('role');modal.removeAttribute('aria-modal');modal.removeAttribute('aria-label');document.body.classList.remove('seal-dialog-open');document.removeEventListener('keydown',keys);focus?.focus();resolve(value);};
      const keys=event=>{if(event.key==='Escape')finish(false);if(event.key==='Tab'){const buttons=[...modal.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
      modal.className='modal show seal-dialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',title);document.body.classList.add('seal-dialog-open');
      modal.innerHTML=`<section class="seal-dialog-panel seal-tablet"><img src="${roleImage(selectedRole)}" width="96" height="96" alt=""><h2>${esc(title)}</h2><p>${esc(detail)}</p><div>${notice?'':buttonHtml('취소','data-seal-cancel')}${buttonHtml(esc(label),'data-seal-confirm')}</div></section>`;
      modal.querySelector('[data-seal-cancel]')?.addEventListener('click',()=>finish(false));modal.querySelector('[data-seal-confirm]').onclick=()=>finish(true);modal.onclick=event=>{if(event.target===modal)finish(false);};document.addEventListener('keydown',keys);modal.querySelector('button').focus();
    });
  }


  async function revealDragon(eventId) {
    const key=`seal-dragon-reveal:${eventId}`;
    try { if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1'); } catch {}
    const shown=confirmSeal('봉인룡이 깨어났습니다','세 봉인이 모두 해제되었습니다. 이제 서버 공동 본체 체력을 소진하세요.','본체전으로',true);
    const panel=document.querySelector('.seal-dialog-panel');
    if(panel){panel.classList.add('seal-dragon-reveal');panel.querySelector(':scope > img').remove();panel.insertAdjacentHTML('afterbegin',`<img class="seal-reveal-art" src="${DRAGON_ART}/hero.webp" alt="봉인에서 깨어난 용"><div class="seal-reveal-sigils" aria-hidden="true">${Object.keys(ROLE).map(key=>`<img src="${roleImage(key)}" alt="" width="80" height="80">`).join('')}</div>`);}
    await shown;
  }

  async function participate(roleKey, button) {
    if (loading) return;
    const isBoss=roleKey==='BOSS';
    const meta = isBoss?{label:'용 보스 본체'}:ROLE[roleKey];
    const round=latest.event;
    const role = latest?.event?.roles?.[roleKey];
    const defeatPercent = Number(latest?.event?.defeatContributionPercent ?? 10);
    const rechargeMinutes = Number(latest?.progress?.rechargeMinutes || latest?.event?.rechargeMinutes || 60);
    if (!await confirmSeal(`${meta.label} 출전`, `도전 횟수 1회 사용 · ${rechargeMinutes}분마다 충전\n패배 시 ${defeatPercent}% 공헌 · 궁극기 사용 불가`, '전투 시작')) return;
    loading = true;
    button.disabled = true;
    const modal = document.getElementById('modal');
    if (!modal) {
      loading = false;
      button.disabled = false;
      return;
    }
    modal.className = `modal show battle-modal seal-combat-modal role-${roleKey.toLowerCase()}`;
    modal.innerHTML = `<div class="modal-panel seal-v3-preflight seal-tablet"><img src="${isBoss?DRAGON_ART+'/portrait.webp':SEAL_ORB_IMAGE(roleKey)}" alt="${isBoss?esc(round.bossName):'봉인 수정구'}"><small>봉인전 출전 준비</small><b>${isBoss?'용 보스':'봉인 수정구'}와 전장을 연결하고 있습니다.</b></div>`;
    let renderer = null;
    try {
      const resourcePromise = typeof globalThis.ensureFeatureResources === 'function'
        ? globalThis.ensureFeatureResources('battleV2')
        : Promise.resolve();
      await resourcePromise;
      if (!globalThis.ProjectVBattleV3Live?.ready?.() || typeof globalThis.playSealBattleV3Live !== 'function') {
        throw new Error('V3 봉인전 렌더러를 불러오지 못했습니다. 다시 시도해 주세요.');
      }
      if(isBoss) await globalThis.ProjectVBattleV3Live.prepareSealDragon();
      else await globalThis.ProjectVBattleV3Live.prepareSealOrb(roleKey);
      globalThis.ProjectVBattleV3Live.prepareLoading({
        modal,
        mode: 'SEAL',
        playerName: '봉인 원정대',
        opponentName: isBoss?round.bossName:meta.label+'구',
        autoText: '상대와 저장된 PvE 덱을 동기화하고 있습니다.'
      });
      const result = await api('seal-battle/participate', {
        method: 'POST', body: JSON.stringify({ requestId: requestId(), role: roleKey, ...(round.bossStage?{eventId:round.id,phase:round.phase}:{}) })
      });
      updateBalances(result.balances);
      latest = result.state || latest;
      render(latest);
      renderer = await globalThis.playSealBattleV3Live({
        modal,
        data: result,
        roleKey,
        roleLabel: role?.label || meta.label
      });
      modal.classList.add('seal-combat-modal');
      const stage = modal.querySelector('.battle-v3-live-shell');
      const phase = stage?.querySelector('#battlePhase');
      const message = stage?.querySelector('#battleMessage');
      if (message) message.classList.add('seal-result-message','seal-tablet');
      const win = result.result === 'WIN';
      if (phase) phase.textContent = result.bossDefeated?'공동 토벌 완료':result.bossOpened?'세 봉인 해제 · 본체전 개방':isBoss?'용 보스 공격 완료':win?'SEAL BATTLE VICTORY':'SEAL BATTLE DEFEAT';
      if (message) {
        const lossLine = isBoss?`서버 공동 HP ${number(result.bossHpBefore)} → ${number(result.bossHpAfter)}`:win ? '전투 승리로 봉인 공헌도가 100% 반영되었습니다.' : `전투 패배지만 ${Number(result.defeatContributionPercent ?? latest?.event?.defeatContributionPercent ?? 10)}% 공헌도가 반영되었습니다.`;
        message.innerHTML = `<strong>${result.bossDefeated?'공동 토벌 완료':result.bossOpened?'용 보스가 깨어났습니다':isBoss?'본체 피해 반영 완료':win?'BATTLE VICTORY':'BATTLE DEFEAT'}</strong><span>${number(result.totalBattleDamage || result.playerPower)} VS ${number(result.bossPower)} · ${esc(lossLine)}</span><div class="seal-result-reward"><small>${meta.label} 공헌</small><b>+${number(result.contribution)}</b><small>참여 보상</small><b>◈ ${number(result.reward?.coin)} · 조각 ${number(result.reward?.shards)}</b>${Number(result.bonusPercent || 0) > 0 ? `<em>부족 역할 지원 +${Number(result.bonusPercent)}%</em>` : ''}</div><button type="button" class="seal-battle-return seal-button">봉인전으로 돌아가기</button>`;
        message.classList.add('is-visible');
        message.querySelector('.seal-battle-return').onclick = event => {
          event.stopPropagation();
          renderer?.destroy?.();
          modal.className = 'modal';
          modal.innerHTML = '';
          if(result.bossOpened)revealDragon(round.id);
        };
      }
    } catch (error) {
      renderer?.destroy?.();
      modal.classList.remove('battle-v3-preparing');
      modal.querySelectorAll('.battle-v3-loader').forEach(element => element.remove());
      modal.className = 'modal show';
      modal.innerHTML = `<div class="modal-panel seal-v3-error seal-tablet"><strong>봉인전 연결 실패</strong><span>${esc(error.message)}</span><button type="button">봉인전으로 돌아가기</button></div>`;
      modal.querySelector('button').onclick = () => { modal.className = 'modal'; modal.innerHTML = ''; };
      await load();
    } finally {
      loading = false;
      if (button.isConnected) button.disabled = false;
    }
  }

  async function claimClearReward(event) {
    const button = event.currentTarget;
    if (!await confirmSeal('공동 완료 보상', `${button.dataset.sealPendingClaim?'지난':'이번'} 회차의 완료 보상을 수령합니다.`, '보상 받기')) return;
    button.disabled = true;
    try {
      const eventId = Number(button.dataset.sealPendingClaim || 0);
      const result = await api('seal-battle/clear-reward', { method: 'POST', body: JSON.stringify(eventId ? { eventId } : {}) });
      updateBalances(result.balances);
      await confirmSeal('봉인 완료 보상 수령', `코인 ${number(result.reward?.coin)} · 카드 조각 ${number(result.reward?.shards)}${Number(result.reward?.masterStar)>0?`\n마스터의 별 ${number(result.reward.masterStar)}개`:''}`, '확인', true);
      await load();
    } catch (error) {
      await confirmSeal('보상 수령 확인', error.message, '확인', true);
      button.disabled = false;
    }
  }

  function rankingRows(rows, valueKey = 'total_contribution') {
    return (rows||[]).map((row,index)=>`<tr><td>${Number(row.rank||index+1)}</td><th scope="row">${esc(row.nickname||'-')}<small>${number(row.total_attempts)}회 참여</small></th><td>${number(row[valueKey])}</td></tr>`).join('')||'<tr><td colspan="3" class="seal-ranking-empty">아직 공헌 기록이 없습니다.</td></tr>';
  }
  async function showRankings() {
    const modal=document.getElementById('modal');if(!modal)return;const focus=document.activeElement;
    const close=()=>{modal.className='modal';modal.innerHTML='';modal.onclick=null;modal.removeAttribute('role');modal.removeAttribute('aria-modal');modal.removeAttribute('aria-label');document.body.classList.remove('seal-dialog-open');document.removeEventListener('keydown',keys);focus?.focus();};
    const keys=event=>{if(event.key==='Escape')close();if(event.key==='Tab'){const buttons=[...modal.querySelectorAll('button')];if(!buttons.length)return;const first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
    modal.className='modal show seal-dialog seal-ranking-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','봉인전 공헌 기록');document.body.classList.add('seal-dialog-open');document.addEventListener('keydown',keys);modal.onclick=event=>{if(event.target===modal)close();};
    modal.innerHTML=`<section class="seal-ranking-panel seal-tablet"><header><div><small>이번 회차</small><h2>공헌 기록</h2></div>${buttonHtml('닫기','id="sealRankingClose"')}</header><div class="seal-ranking-content" aria-live="polite"><p>공헌 기록을 불러오고 있습니다.</p></div></section>`;
    const panel=modal.querySelector('.seal-ranking-panel');panel.querySelector('#sealRankingClose').onclick=close;panel.querySelector('#sealRankingClose').focus();
    try {
      const data=await api('seal-battle/rankings');if(!panel.isConnected)return;
      panel.querySelector('.seal-ranking-content').innerHTML=`${data.myRank?`<p class="seal-my-rank"><b>내 기록 ${number(data.myRank.rank)}위</b><span>공헌도 ${number(data.myRank.totalContribution)} · ${number(data.myRank.totalAttempts)}회 참여</span></p>`:''}<nav class="seal-ranking-tabs" aria-label="공헌 기록 분류">${[['overall','전체'],['ATTACK','파괴'],['GUARD','수호'],['PURIFY','정화']].map(([key,label])=>buttonHtml(label,`data-rank-tab="${key}" aria-pressed="${key==='overall'}"`)).join('')}</nav><div class="seal-ranking-scroll"><table><thead><tr><th>순위</th><th>참여자</th><th>공헌도</th></tr></thead><tbody id="sealRankingList">${rankingRows(data.overall)}</tbody></table></div>`;
      panel.querySelectorAll('[data-rank-tab]').forEach(button=>{button.onclick=()=>{panel.querySelectorAll('[data-rank-tab]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));const key=button.dataset.rankTab;panel.querySelector('#sealRankingList').innerHTML=key==='overall'?rankingRows(data.overall):rankingRows(data.roles?.[key],'contribution');};});
    }catch(error){if(panel.isConnected)panel.querySelector('.seal-ranking-content').innerHTML=`<p class="seal-inline-note">${esc(error.message)}</p>`;}
  }

  async function load() {
    const root = document.getElementById('pveSealBattleView');
    if (!root || !active || loading) return;
    loading = true;
    root.innerHTML = emptyView('봉인진을 확인하고 있습니다.', '공동 진행도와 내 출전 준비를 불러옵니다.', true);
    try {
      const previous=latest?.event;
      latest = await api('seal-battle/status');
      render(latest);
      if(previous?.id===latest?.event?.id && previous.phase==='SEALS' && latest.event.phase==='BOSS')void revealDragon(latest.event.id);
    } catch (error) {
      root.innerHTML = emptyView('봉인전 정보를 불러오지 못했습니다.', error.message);
      root.querySelector('#sealRefresh')?.addEventListener('click', load);
    } finally {
      loading = false;
    }
  }

  function deactivate() {
    active = false;
    clearChargeTimer();
    const view = document.getElementById('pveSealBattleView');
    if (view) view.hidden = true;
  }

  function activate(button) {
    active = true;
    const hunt = document.getElementById('pveHuntView');
    const raidHub = document.getElementById('pveRaidHubView');
    const raid = document.getElementById('pveRaidView');
    const rift = document.getElementById('pveRiftView');
    const escort = document.getElementById('pveEscortView');
    const view = document.getElementById('pveSealBattleView');
    if (hunt) hunt.hidden = true;
    if (raidHub) raidHub.hidden = true;
    else if (raid) raid.hidden = true;
    if (rift) rift.hidden = true;
    if (escort) escort.hidden = true;
    if (view) view.hidden = false;
    document.querySelectorAll('.pve-mode-btn').forEach(item => item.classList.toggle('active', item === button));
    load();
  }

  function install() {
    const tabs = document.querySelector('.pve-mode-tabs');
    const raidView = document.getElementById('pveRaidView');
    if (!tabs || !raidView) return;
    const placementAnchor = document.getElementById('pveRaidHubView') || raidView;
    let view = document.getElementById('pveSealBattleView');
    if (!view) {
      view = document.createElement('div');
      view.id = 'pveSealBattleView';
      view.className = 'pve-seal-battle-view';
      view.hidden = true;
      placementAnchor.insertAdjacentElement('afterend', view);
    } else if (view.parentElement !== placementAnchor.parentElement) {
      placementAnchor.insertAdjacentElement('afterend', view);
    }
    if (!tabs.querySelector('[data-seal-battle-mode]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pve-mode-btn seal-battle-tab';
      button.dataset.sealBattleMode = '1';
      button.innerHTML = `<img src="${roleImage('GUARD')}" width="24" height="24" alt=""> 봉인전`;
      button.onclick = () => activate(button);
      tabs.appendChild(button);
    }
    tabs.querySelectorAll('.pve-mode-btn:not([data-seal-battle-mode])').forEach(button => {
      if (button.dataset.sealDeactivateBound === '1') return;
      button.dataset.sealDeactivateBound = '1';
      button.addEventListener('click', deactivate, { capture: true });
    });
  }

  window.addEventListener('cnine:force-main', deactivate);
  new MutationObserver(install).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
