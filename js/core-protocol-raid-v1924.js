(()=>{
  'use strict';
  const VERSION='2.0.0-test-gated-live-v2021';
  const TAB_KEY='cnine:raid-content-v1924';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number=value=>Math.max(0,Number(value)||0);
  const percent=(value,max)=>Math.max(0,Math.min(100,number(value)/Math.max(1,number(max))*100));
  const requestId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)));
  const bridge=()=>globalThis.CNineCoreRaidBridge||null;
  let data=null,feature=null,busy=false,selectedOperation='BREAK',activeTab=sessionStorage.getItem(TAB_KEY)==='core'?'core':'world',pollTimer=null,lastError=null;

  async function api(path,options={}){if(!bridge()?.apiRequest)throw new Error('붕괴 코어 레이드 연결 모듈을 불러오지 못했습니다.');return bridge().apiRequest(path,options,{ttl:0,replaceInflight:true})}
  async function loadFeature(){feature=await api('raid/core/feature');const tab=document.getElementById('coreRaidTab'),visible=feature?.visible===true;if(tab){tab.hidden=!visible;tab.setAttribute('aria-hidden',visible?'false':'true')}return feature}
  function stopPoll(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null}}
  function schedulePoll(){stopPoll();if(activeTab!=='core'||document.hidden)return;pollTimer=setTimeout(()=>load().catch(error=>console.warn('[CORE RAID] poll failed',error)),8000)}
  function setBusy(next){busy=Boolean(next);document.querySelectorAll('#pveCoreRaidView button').forEach(button=>button.disabled=busy||button.dataset.coreLocked==='1')}

  function operationCards(operations=[],me=null){
    return (operations||[]).map(operation=>{const selected=(me?.operation||selectedOperation)===operation.key,locked=Boolean(me);return `<button type="button" class="core-operation ${selected?'is-selected':''}" data-core-operation="${esc(operation.key)}" ${locked?'data-core-locked="1" disabled':''}><small>${esc(operation.label)}</small><b>${esc(operation.name)}</b><p>${esc(operation.description)}</p><span>${(operation.roles||[]).map(role=>esc(role)).join(' + ')}</span></button>`}).join('');
  }

  const mechanicIcons=Object.freeze({
    analysis:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="2"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M16.8 7.2l2.1-2.1"></path></svg>',
    break:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13h6l-1 9 9-12h-6z"></path></svg>',
    block:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.8c0 4.6 3 7.6 7.5 9.2 4.5-1.6 7.5-4.6 7.5-9.2V6z"></path><path d="M9 12l2 2 4-5"></path></svg>',
    stabilize:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 3 10 2-5h7"></path><path d="M12 21C7 18.2 4 15.4 4 10.8 4 7.8 6.1 6 8.5 6c1.5 0 2.8.7 3.5 1.9C12.7 6.7 14 6 15.5 6 17.9 6 20 7.8 20 10.8"></path></svg>',
    suppression:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"></circle><circle cx="12" cy="12" r="3"></circle><path d="M12 1v4M12 19v4M1 12h4M19 12h4"></path></svg>'
  });

  function orbGauge(kind,label,value,max,size=''){
    const current=number(value),target=Math.max(1,number(max)),ratio=percent(current,target),ready=current>=target;
    return `<article class="core-orb-card is-${esc(kind)} ${size} ${ready?'is-ready':''}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${current}"><div class="core-orb-ring" style="--core-angle:${(ratio*3.6).toFixed(2)}deg"><div class="core-orb-center">${mechanicIcons[kind]||''}<strong>${Math.round(ratio)}<small>%</small></strong></div></div><footer><em>${ready?'COMPLETE':'IN PROGRESS'}</em><b>${esc(label)}</b><span>${current.toLocaleString()} / ${target.toLocaleString()}</span></footer></article>`;
  }

  function mechanicFlow(current={}){
    return `<div class="core-mechanic-flow"><section class="core-flow-phase is-analysis"><header><small>PHASE 01 · SCAN</small><b>약점 탐색망</b></header>${orbGauge('analysis','약점 분석',current.analysisScore,current.analysisRequired,'is-major')}</section><div class="core-flow-link" aria-hidden="true"><i></i><span></span></div><section class="core-flow-phase is-triple"><header><small>PHASE 02 · TRIPLE CORE</small><b>삼중 코어 분리</b></header><div class="core-triple-orbs">${orbGauge('break','파쇄 코어',current.coreScores?.BREAK,current.coreRequired)}${orbGauge('block','차단 코어',current.coreScores?.BLOCK,current.coreRequired)}${orbGauge('stabilize','안정화 코어',current.coreScores?.STABILIZE,current.coreRequired)}</div></section><div class="core-flow-link" aria-hidden="true"><i></i><span></span></div><section class="core-flow-phase is-suppression"><header><small>PHASE 03 · LOCKDOWN</small><b>멸절 제압망</b></header>${orbGauge('suppression','공동 제압',current.suppressionScore,current.suppressionRequired,'is-major')}</section></div>`;
  }

  function bossBuffMarkup(current={}){
    if(!current.analysisReady)return '';
    const buffs=Array.isArray(current.bossBuffs)?current.bossBuffs:[];
    if(!buffs.length)return '<section class="core-boss-buffs is-clear"><header><div><small>CORE ENHANCEMENT STATUS</small><b>삼중 코어 완전 무력화</b></div><span>보스 강화 효과 없음</span></header></section>';
    const coreName={BREAK:'파쇄',BLOCK:'차단',STABILIZE:'안정화'};
    return `<section class="core-boss-buffs"><header><div><small>ACTIVE BOSS ENHANCEMENTS</small><b>생존 코어 ${buffs.length}개 · 보스 강화 활성</b></div><span>공유 누적 피해 ${number(current.bossDamageReductionPct)}% 경감</span></header><div>${buffs.map(buff=>`<article data-core-buff="${esc(buff.core)}"><small>${esc(coreName[buff.core]||buff.core)} 코어 생존</small><b>${esc(buff.name)}</b><span>${esc(buff.effect)}</span></article>`).join('')}</div></section>`;
  }

  function actionMarkup(state){
    const {current,me,entry}=state;
    if(current?.status==='CLEAR'&&me){
      if(me.rewardStatus==='COMPLETED')return `<div class="core-action"><div><small>REWARD SETTLED</small><b>붕괴 코어 제압 보상 수령 완료</b><span>이 작전의 보상은 서버 영수증으로 지급 완료되었습니다.</span></div><button type="button" data-core-action="reload">작전 정보 갱신</button></div>`;
      if(current.rewardLocked)return `<div class="core-action"><div><small>TEST REWARD LOCK</small><b>붕괴 코어 제압 완료 · 보상 잠금</b><span>유저 테스트 중에는 재화가 지급되지 않습니다. 전황과 기믹 기록만 보존됩니다.</span></div><button type="button" data-core-action="reload">작전 정보 갱신</button></div>`;
      return `<div class="core-action"><div><small>CORE REWARD READY</small><b>제압 보상 수령 가능</b><span>코인 ${number(current.reward?.coin).toLocaleString()} · 카드조각 ${number(current.reward?.shards).toLocaleString()}</span></div><button type="button" data-core-action="claim">제압 보상 수령</button></div>`;
    }
    if(current&&['CLEAR','FAILED'].includes(String(current.status)))return `<div class="core-action"><div><small>OPERATION CLOSED</small><b>${current.status==='CLEAR'?'붕괴 코어 제압 완료':'작전 시간 종료'}</b><span>다음 작전 주기에 다시 출전할 수 있습니다.</span></div><button type="button" data-core-action="reload">작전 정보 갱신</button></div>`;
    if(!me){const disabled=!number(entry?.remaining);return `<div class="core-action"><div><small>TACTICAL DEPLOYMENT</small><b>${esc((state.operations||[]).find(row=>row.key===selectedOperation)?.name||'파쇄')} 작전으로 출전</b><span>오늘 남은 출전 ${number(entry?.remaining)} / ${number(entry?.limit)}회 · PVE 덱 5장 스냅샷</span></div><button type="button" data-core-action="join" ${disabled?'data-core-locked="1" disabled':''}>작전 확정</button></div>`}
    if(me.status==='JOINED')return `<div class="core-action"><div><small>PERSONAL MECHANIC READY</small><b>${esc(me.operation==='BREAK'?'파쇄':me.operation==='BLOCK'?'차단':'안정화')} 담당 · V3 기믹 전투 대기</b><span>약점 분석, 방향키 해독, 연타 탈출 결과가 공동 전황에 합산됩니다.</span></div><button type="button" data-core-action="battle">V3 기믹 전투 시작</button></div>`;
    return `<div class="core-action"><div><small>CONTRIBUTION VERIFIED</small><b>개인 기믹 수행 완료</b><span>분석 ${number(me.analysisScore)} · 코어 ${number(me.coreScore)} · 제압 ${number(me.suppressionScore)} · 피해 ${number(me.totalDamage).toLocaleString()}</span></div><button type="button" data-core-action="reload">공동 전황 갱신</button></div>`;
  }

  function render(){
    const root=document.getElementById('pveCoreRaidView');if(!root||root.hidden)return;
    if(lastError){root.innerHTML=`<section class="core-raid core-raid-error"><small>CORE PROTOCOL LINK ERROR</small><h2>붕괴 코어 작전을 불러오지 못했습니다.</h2><p>${esc(lastError.message||lastError)}</p><button type="button" data-core-action="reload">다시 시도</button></section>`;bindActions();return}
    if(!data){root.innerHTML='<section class="core-raid core-raid-loading"><i></i><b>심연 관측소와 동기화 중입니다.</b></section>';return}
    const settings=data.settings||{},current=data.current||{phase:1,phaseLabel:'코어 탐색',bossHp:settings.bossMaxHp,bossMaxHp:settings.bossMaxHp,analysisScore:0,analysisRequired:settings.analysisRequired,coreScores:{BREAK:0,BLOCK:0,STABILIZE:0},coreRequired:settings.coreRequired,suppressionScore:0,suppressionRequired:settings.suppressionRequired,participantCount:0,status:'READY'},me=data.me,phase=Math.max(1,Math.min(3,number(current.phase)||1)),hp=number(current.bossHp??settings.bossMaxHp),maxHp=number(current.bossMaxHp??settings.bossMaxHp),hpPct=percent(hp,maxHp),participants=Array.isArray(data.participants)?data.participants:[];
    root.innerHTML=`<main class="core-raid" data-core-raid-version="${VERSION}">
      <section class="core-raid-hero"><div class="core-raid-brief"><small>${esc(settings.subtitle||'ABYSS OBSERVATORY / CORE PROTOCOL')}</small><h2>${esc(settings.title||'심연 관측소: 붕괴 코어')}</h2><p>${esc(settings.description||'')}</p><div class="core-raid-statusline"><span>${settings.mode==='TEST'?'LIMITED USER TEST':'LIVE RAID'}</span><span>PHASE ${phase} · ${esc(current.phaseLabel||'코어 탐색')}</span><span>${number(current.participantCount)} / ${number(settings.maxParticipants)} PARTICIPANTS</span><span>${settings.rewardLocked?'보상 검수 잠금':'보상 활성'}</span></div></div><div class="core-raid-boss"><img src="${esc(settings.bossImage)}" alt="${esc(settings.bossName)}"><div class="core-raid-boss-label"><small>CORE ENTITY / RAID BOSS</small><b>${esc(settings.bossName)}</b></div></div></section>
      <section class="core-boss-hp" style="--core-progress:${hpPct}%"><header><div><small>SHARED BOSS INTEGRITY</small><b>${hp.toLocaleString()} / ${maxHp.toLocaleString()}</b></div><strong>${hpPct.toFixed(1)}%</strong></header><i><u></u></i></section>
      ${bossBuffMarkup(current)}
      <section class="core-phase-rail"><article class="${phase===1?'is-active':phase>1?'is-complete':''}"><span>PHASE 01</span><b>코어 탐색</b><small>공격·방어·속도·생명 약점 순환 분석</small></article><article class="${phase===2?'is-active':phase>2?'is-complete':''}"><span>PHASE 02</span><b>삼중 코어 분리</b><small>파쇄·차단·안정화 작전 인원 분담</small></article><article class="${phase===3?'is-active':''}"><span>PHASE 03</span><b>멸절 프로토콜</b><small>방향키 해독·연타 탈출·공동 제압</small></article></section>
      <section class="core-command-grid"><article class="core-panel"><header><div><small>PARTY MECHANIC STATUS</small><b>공동 기믹 전황</b></div><span>딜보다 기믹 성공이 우선</span></header>${mechanicFlow(current)}<header><div><small>OPERATION ASSIGNMENT</small><b>${me?'확정된 개인 작전':'출전 작전 선택'}</b></div><span>${me?'작전 변경 불가':'팀 분포를 고려해 선택'}</span></header><div class="core-operation-grid">${operationCards(data.operations,me)}</div>${actionMarkup(data)}</article>
      <aside class="core-panel"><header><div><small>CONTRIBUTION RANKING</small><b>기믹 기여 순위</b></div><span>${participants.length}명</span></header><div class="core-ranking">${participants.length?participants.slice(0,15).map((row,index)=>`<div class="core-rank-row"><i>${index+1}</i><span><b>${esc(row.nickname||`MEMBER ${index+1}`)}${row.isMe?' · 나':''}</b><small>${esc(row.operation==='BREAK'?'파쇄':row.operation==='BLOCK'?'차단':'안정화')} · 기믹 ${number(row.mechanicScore)}</small></span><strong>${number(row.totalDamage).toLocaleString()}</strong></div>`).join(''):'<div class="core-rank-empty">아직 전송된 기믹 기록이 없습니다.</div>'}</div></aside></section>
    </main>`;
    bindActions();setBusy(busy);schedulePoll();
  }

  async function load(){lastError=null;try{data=await api('raid/core/status');render();return data}catch(error){lastError=error;render();throw error}}
  async function join(){setBusy(true);try{data=await api('raid/core/join',{method:'POST',body:JSON.stringify({operation:selectedOperation})});render()}finally{setBusy(false)}}
  async function claim(){const instanceId=data?.current?.id;if(!instanceId)throw new Error('수령할 붕괴 코어 작전을 찾지 못했습니다.');setBusy(true);try{const result=await api('raid/core/claim',{method:'POST',body:JSON.stringify({instanceId,requestId:requestId()})});if(result.user)bridge()?.saveUser?.(bridge()?.apiUserToLocal?.(result.user)||result.user);await load();return result}finally{setBusy(false)}}

  function mountMechanicResult(stage,success,verified){
    stage.querySelector('.core-v3-mechanic-result')?.remove();
    const node=document.createElement('section');node.className=`core-v3-mechanic-result ${success?'is-success':'is-failure'}`;node.setAttribute('role','dialog');node.setAttribute('aria-modal','true');node.innerHTML=`<small>CORE PROTOCOL / VERIFIED RESULT</small><strong>${success?'멸절 프로토콜 차단':'멸절 프로토콜 발동'}</strong><span>방향 해독 ${verified?.sequence?.success?'성공':'실패'} · 구속 파쇄 ${verified?.mash?.success?'성공':'실패'} · 공동 제압 +${number(verified?.suppressionScore)}</span><button type="button" class="btn core-v3-return">공동 전황으로 돌아가기</button>`;stage.appendChild(node);return node;
  }

  function raidEventMeta(event={}){
    const type=String(event.type||'').toUpperCase();
    const phase=Math.max(1,Math.min(3,number(event.phase)||1));
    const phaseNames={1:'코어 탐색',2:'삼중 코어 분리',3:'멸절 프로토콜'};
    const operationNames={BREAK:'파쇄',BLOCK:'차단',STABILIZE:'안정화'};
    if(type==='RAID_PHASE_CHANGE')return {eyebrow:`CORE PROTOCOL / PHASE 0${phase}`,title:event.label||phaseNames[phase],detail:`${phaseNames[phase]} 기믹 전환`,tone:phase===3?'danger':phase===2?'violet':''};
    if(type==='RAID_WEAKNESS_REVEAL')return {eyebrow:'WEAKNESS ANALYSIS',title:event.label||'약점 속성 분석',detail:event.matched?'공명 속성 일치 · 분석 기여 상승':'비공명 공격 · 기믹 기여 감소',tone:event.matched?'success':''};
    if(type==='RAID_OPERATION_REVEAL')return {eyebrow:'TACTICAL OPERATION',title:event.label||`${operationNames[String(event.operation||'').toUpperCase()]||'선택'} 작전 전개`,detail:'라이브 V3 진형을 유지한 채 작전 판정만 적용',tone:'violet'};
    if(type==='RAID_CORE_BREAK')return {eyebrow:'CORE CONTRIBUTION',title:event.label||'코어 기여 신호 전송',detail:'공동 코어 게이지에 개인 기여 반영',tone:'violet'};
    if(type==='RAID_BOSS_BUFF')return {eyebrow:'BOSS ENHANCEMENT',title:event.label||'생존 코어 강화 활성',detail:event.effect||'미파괴 코어가 보스를 강화합니다.',tone:'danger'};
    if(type==='RAID_STAGGER')return {eyebrow:'TOTAL SUPPRESSION',title:event.label||'멸절 프로토콜 차단',detail:'공동 제압 성공 · 장시간 그로기 진입',tone:'success'};
    return null;
  }

  async function showRaidEvent(event,context={}){
    const stage=context.stage,meta=raidEventMeta(event);if(!stage||!meta)return false;
    stage.querySelector('.core-v3-event-banner')?.remove();
    const node=document.createElement('aside');node.className=`core-v3-event-banner ${meta.tone?`is-${meta.tone}`:''}`;node.setAttribute('role','status');node.setAttribute('aria-live','polite');node.innerHTML=`<small>${esc(meta.eyebrow)}</small><strong>${esc(meta.title)}</strong><span>${esc(meta.detail)}</span>`;stage.appendChild(node);await wait(850);node.remove();return true;
  }

  async function battle(){
    const instanceId=data?.current?.id;if(!instanceId)throw new Error('진행 중인 붕괴 코어 작전이 없습니다.');setBusy(true);let renderer=null,modal=document.getElementById('modal');
    try{
      const response=await api(`raid/core/battle?instanceId=${encodeURIComponent(instanceId)}`);await bridge()?.ensureFeatureResources?.('battleV2');
      const live=globalThis.ProjectVBattleV3Live?.prepareLoading?.({modal,mode:'RAID',playerName:bridge()?.loadUser?.()?.nickname||'CORE MEMBER',opponentName:response.monster?.name||data.settings?.bossName||'CORE ENTITY',autoText:'서버 기믹 시드와 V3 입력 타임라인을 동기화합니다.'});if(!live)throw new Error('V3 붕괴 코어 전장을 준비하지 못했습니다.');
      renderer=await globalThis.playRaidBattleV3Live({...live,modal,data:response,preserveServerTimeline:true,onRaidEvent:showRaidEvent,onInteractiveEvent:(event,context)=>globalThis.ProjectVRaidQteV1924?.run?.(event,context)});
      const qte=renderer.getInteractiveResults?.()||{},results={sequence:{inputs:qte.SEQUENCE?.inputs||[],durationMs:qte.SEQUENCE?.durationMs||0},mash:{presses:qte.MASH?.presses||[],durationMs:qte.MASH?.durationMs||0}};
      const status=live.stage.querySelector('#pvBattleStatus');if(status)status.textContent='입력 기록 검증 및 공동 전황 반영 중';
      const resolved=await api('raid/core/resolve',{method:'POST',body:JSON.stringify({instanceId,requestId:requestId(),results})});const success=resolved.personalResult==='SUCCESS';renderer.showResult();mountMechanicResult(live.stage,success,resolved.verified);
      const close=()=>{try{renderer?.destroy?.()}catch(_){}modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';void load()};live.stage.querySelector('.core-v3-return')?.addEventListener('click',event=>{event.stopPropagation();close()});
    }catch(error){try{renderer?.destroy?.()}catch(_){}if(modal){modal.__battleV2Renderer=null;modal.className='modal';modal.innerHTML=''}throw error}finally{setBusy(false)}
  }

  function bindActions(){
    document.querySelectorAll('#pveCoreRaidView [data-core-operation]').forEach(button=>button.addEventListener('click',()=>{if(busy||data?.me)return;selectedOperation=button.dataset.coreOperation||'BREAK';render()}));
    document.querySelectorAll('#pveCoreRaidView [data-core-action]').forEach(button=>button.addEventListener('click',async()=>{if(busy)return;try{const action=button.dataset.coreAction;if(action==='join')await join();else if(action==='battle')await battle();else if(action==='claim')await claim();else if(action==='reload'){setBusy(true);try{await load()}finally{setBusy(false)}}}catch(error){alert(error?.message||'붕괴 코어 요청을 처리하지 못했습니다.')}}));
  }

  async function activate(tab='world'){
    const previousTab=activeTab;activeTab=tab==='core'&&feature?.visible===true?'core':'world';sessionStorage.setItem(TAB_KEY,activeTab);const legacy=document.getElementById('pveRaidView'),core=document.getElementById('pveCoreRaidView');document.querySelectorAll('[data-raid-content]').forEach(button=>{const selected=button.dataset.raidContent===activeTab;button.classList.toggle('active',selected);button.setAttribute('aria-selected',selected?'true':'false')});
    if(legacy)legacy.hidden=activeTab!=='world';if(core)core.hidden=activeTab!=='core';stopPoll();
    if(activeTab==='world'){if(previousTab==='core')bridge()?.activateLegacyRaid?.();return}
    bridge()?.stopLegacyRaid?.();if(!data)render();try{await load()}catch(_){ }
  }

  function wire(){
    const hub=document.getElementById('pveRaidHubView');if(!hub)return false;hub.querySelectorAll('[data-raid-content]').forEach(button=>{if(button.dataset.coreRaidBound==='1')return;button.dataset.coreRaidBound='1';button.addEventListener('click',()=>void activate(button.dataset.raidContent))});return true;
  }
  async function openActive(){if(!wire())return false;try{await loadFeature()}catch(error){console.warn('[CORE RAID] feature gate unavailable',error);feature={visible:false,accessible:false}}await activate(activeTab);return true}
  function deactivate(){stopPoll();globalThis.ProjectVRaidQteV1924?.cancel?.()}
  const observer=new MutationObserver(()=>wire());observer.observe(document.documentElement,{subtree:true,childList:true});addEventListener('load',wire);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPoll();else if(activeTab==='core')void load().catch(()=>{})});
  globalThis.CoreProtocolRaidV1924=Object.freeze({version:VERSION,openActive,activate,deactivate,refresh:load});
})();
