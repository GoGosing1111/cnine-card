(() => {
  'use strict';
  const VERSION='20261128-field-v3-daily5';
  const bridge=()=>window.CNineEscortBridge;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const requestId=()=>globalThis.crypto?.randomUUID?.()||`escort-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const number=value=>Math.max(0,Number(value)||0);
  const percent=value=>Math.max(0,Math.min(100,Number(value)||0));
  const imageUrl=value=>{const raw=String(value||'').trim().replace(/\\/g,'/');if(!raw)return '/assets/ui/brand/reverse-call-20261016/icon-512.png';if(/^(?:data:|blob:|https?:\/\/|\/)/i.test(raw))return raw;return `/${raw.replace(/^\.\//,'')}`};
  const TACTIC_ICONS=Object.freeze({
    REPAIR:'/assets/ui/escort/tactics/tactic-field-repair-v1835.webp',
    BARRIER:'/assets/ui/escort/tactics/tactic-aegis-barrier-v1835.webp',
    AIRSTRIKE:'/assets/ui/escort/tactics/tactic-carpet-strike-v1835.webp',
    OVERCHARGE:'/assets/ui/escort/tactics/tactic-core-overdrive-v1835.webp',
    JAMMING:'/assets/ui/escort/tactics/tactic-signal-jammer-v1835.webp'
  });
  // V1840: 보상이 '전체 클리어 일괄' 에서 '구간별 적립' 으로 바뀌었다.
  //   구간을 통과할 때마다 쌓이고, 도중에 실패해도 쌓인 만큼은 수령한다.
  const rewardText=reward=>{
    const coin=number(reward?.coin),shards=number(reward?.shards),tickets=number(reward?.tickets);
    const parts=[];
    if(coin)parts.push(`코인 ${coin.toLocaleString()}`);
    if(shards)parts.push(`카드 조각 ${shards.toLocaleString()}`);
    if(number(reward?.stars))parts.push(`마스터의 별 ${number(reward.stars).toLocaleString()}개`);
    if(tickets)parts.push(`폐차장 출입 허가증 ${tickets.toLocaleString()}장`);
    return parts.length?parts.join(' · '):'없음';
  };
  let data=null,busy=false,discoveryPromise=null,claimPollTimer=null;
  let selectedContract='RELIEF',inspectSector=null,pendingStartId='',deliveryReceipt=null;
  const sectorReward=sector=>({coin:sector.rewardCoin,shards:sector.rewardShards,stars:sector.rewardStars,tickets:sector.rewardTickets});
  function baseManifest(settings,run){
    if(run && !run.contract)return {...settings,sectors:settings.sectors.map(sector=>({...sector,rewardStars:0}))};
    return run?.contract || settings.contracts?.find(row=>row.key===selectedContract) || settings;
  }

  async function api(path,options={}){
    if(!bridge()?.apiRequest)throw new Error('게임 연결 모듈을 불러오지 못했습니다.');
    return bridge().apiRequest(path,options,{ttl:0,replaceInflight:true});
  }

  function setBusy(next,label='처리 중'){
    busy=Boolean(next);
    document.querySelectorAll('#pveEscortView button[data-escort-action]').forEach(button=>{button.disabled=busy||button.dataset.unavailable==='1';// V1838: 내부에 요소가 있는 버튼(전술 카드)은 textContent 를 건드리면 안 된다.
      //   textContent 대입은 자식 요소를 전부 지우고 텍스트 노드 하나로 바꾼다.
      //   그래서 아이콘·제목·설명 DOM 이 통째로 사라지고 글자만 남았다.
      //   (전술 카드가 한 글자씩 세로로 쏟아지던 진짜 원인. CSS 문제가 아니었다.)
      if(button.children.length){button.classList.toggle('is-busy',busy);return}
      button.dataset.defaultLabel||=(button.textContent||'');if(busy&&button.dataset.escortPrimary==='1')button.textContent=label;else if(!busy&&button.dataset.defaultLabel)button.textContent=button.dataset.defaultLabel});
  }

  function cardMarkup(card,index){
    const normalized={...card,grade:String(card.grade||card.rarity||'C').toUpperCase(),rarity:String(card.rarity||card.grade||'C').toUpperCase(),image:imageUrl(card.image||card.image_url),image_url:imageUrl(card.image_url||card.image)};
    let frame='';
    try{frame=bridge()?.cardHtml?.(normalized,true,'escort-deck-card',bridge()?.loadUser?.())||''}catch(_){frame=''}
    if(!frame)frame=`<article class="escort-fallback-card grade-${esc(normalized.grade.toLowerCase())}"><img src="${esc(normalized.image)}" alt=""><b>${esc(normalized.title||normalized.name||`CARD ${index+1}`)}</b><small>${esc(normalized.grade)}</small></article>`;
    const hp=percent(card.hpPercent??100);
    return `<li class="escort-roster-card ${hp<=0?'is-ko':''}" style="--escort-hp:${hp}%"><div class="escort-card-frame">${frame}</div><div class="escort-card-hp"><i></i><span>${hp<=0?'전투 불능':`HP ${Math.round(hp)}%`}</span></div></li>`;
  }

  function routeMarkup(manifest,run,selected) {
    const history=run?.history||[];
    return manifest.sectors.map((sector,i)=>{
      const result=history.find(entry=>Number(entry.sectorIndex)===i)?.result;
      const label=result==='WIN'?'통과':result==='LOSE'?'저지':i===run?.sectorIndex?'현재 구간':sector.label;
      return `<li><button type="button" data-escort-action="inspect" data-sector="${i}" aria-pressed="${selected===i}" class="${result==='WIN'?'eo-cleared':''}">
        <span>${String(i+1).padStart(2,'0')}</span><b>${esc(sector.name)}</b><small>${esc(label)}</small></button></li>`;
    }).join('');
  }

  function contractPicker(settings,manifest) {
    if(!settings.contracts?.length)return '';
    return `<section class="eo-cargo" aria-label="화물 계약"><h3>수송할 화물</h3><div>${settings.contracts.map(contract=>
      `<button type="button" data-escort-action="contract" data-contract="${esc(contract.key)}" aria-pressed="${contract.key===manifest.key}">
        <small>${esc(contract.difficulty)}</small><b>${esc(contract.name)}</b><span>기본 보수 ${number(contract.payPercent)}%</span></button>`).join('')}</div></section>`;
  }

  function tacticMarkup(run,settings){
    if(run?.phase!=='TACTIC')return '';
    const catalog=new Map((settings?.tactics||[]).map(tactic=>[String(tactic.key||'').toUpperCase(),tactic]));
    const choices=(run.choices||[]).map(choice=>({...(catalog.get(String(choice.key||'').toUpperCase())||{}),...choice}));
    return `<section class="escort-tactic-panel"><header><div><h3>다음 구간 전술 선택</h3></div><p>다음 교전을 준비할 전술을 하나 선택하세요.</p></header><div class="escort-v1833-tactic-grid">${choices.map((tactic,index)=>`<button type="button" class="escort-v1833-tactic-card is-${esc(String(tactic.key||'').toLowerCase())}" data-escort-action="tactic" data-tactic="${esc(tactic.key)}" data-escort-primary="${index===0?'1':'0'}" aria-label="${esc(`${tactic.name} 선택`)}"><span class="escort-v1833-tactic-number">0${index+1}</span><div class="escort-v1833-tactic-icon"><img src="${esc(imageUrl(TACTIC_ICONS[String(tactic.key||'').toUpperCase()]||tactic.icon))}?v=1835" alt="" width="256" height="256" decoding="async"></div><div class="escort-v1833-tactic-copy"><div class="escort-v1833-tactic-meta"><small>${esc(tactic.type)}</small><em>${esc(tactic.duration||'다음 1구간')}</em></div><b>${esc(tactic.name)}</b><p>${esc(tactic.description)}</p><u>전술 적용</u></div><i class="escort-v1833-tactic-arrow" aria-hidden="true"></i></button>`).join('')}</div></section>`;
  }

  function actionMarkup(run,daily,settings){
    if(!run){
      const left=Math.max(0,daily.runLimit-number(daily.startedCount)),claims=Math.max(0,daily.rewardLimit-number(daily.rewardCount));
      return `<section class="eo-command"><div><b>출발 준비</b><p>오늘 도전 ${left}회 · 보상 수령 ${claims}회 남음</p></div><button type="button" data-escort-action="start" data-escort-primary="1" data-unavailable="${left&&claims?'0':'1'}">${left&&claims?'화물 싣고 출발':'오늘 작전 종료'}</button></section>`;
    }
    if(run.status==='CLAIMING')return '<section class="eo-command"><div><b>보상 지급 확인 중</b><p>지급 상태를 자동으로 확인합니다.</p></div><button type="button" data-escort-action="reload" data-escort-primary="1">지급 상태 확인</button></section>';
    if(run.status==='COMPLETED_PENDING'){
      if(daily.rewardCount>=daily.rewardLimit)return '<section class="eo-command"><div><b>오늘의 보상을 모두 수령했습니다</b><p>한국 시간 내일 오전 0시부터 이 작전의 보상을 받을 수 있습니다.</p></div></section>';
      const title=run.phase==='DELIVERED'?'중간 인계 완료':run.phase==='FAILED'?'호송 중단':`목적지 도착${run.deliveryGrade?' · '+run.deliveryGrade.name+' 인계':''}`;
      return `<section class="eo-command"><div><b>${esc(title)}</b><p>${number(run.clearedSectors)}구간 확보 · ${esc(rewardText(run.reward))}</p></div><button type="button" data-escort-action="claim" data-escort-primary="1">확보 보상 수령</button></section>`;
    }
    if(run.phase==='FAILED')return '<section class="eo-command"><div><b>호송 종료</b><p>첫 구간에서 화물을 잃었습니다.</p></div><button type="button" data-escort-action="reload">배차판으로 돌아가기</button></section>';
    if(run.phase==='TACTIC'){
      if(!run.contract)return '';
      return `<section class="eo-command eo-handoff"><div><b>검문소에서 인계</b><p>${esc(rewardText(run.reward))} 확보 · 지금 인계하면 오늘 보상 수령 1회를 사용합니다.</p></div><button type="button" data-escort-action="deliver">중간 인계</button></section>`;
    }
    const tactic=settings.tactics?.find(row=>row.key===run.pendingTactic);
    return `<section class="eo-command"><div><b>${esc(run.sector.name)} 출발</b><p>${tactic?esc(tactic.name)+' 적용 · ':''}통과 보상 ${esc(rewardText(sectorReward(run.sector)))}</p></div><button type="button" data-escort-action="fight" data-escort-primary="1">구간 전투 시작</button></section>`;
  }

  function render(){
    clearTimeout(claimPollTimer);claimPollTimer=null;
    const root=document.getElementById('pveEscortView');if(!root||root.hidden)return;
    if(!data){root.innerHTML='<div class="escort-operation-loading"><i></i><b>호송 경로를 불러오는 중입니다.</b></div>';return}
    if(data.fieldOperations&&!data.run){
      const state=data;
      void import('/pve/field-operations/entry.mjs?v=20261128-daily5').then(({renderOperationEntry})=>{
        if(!root.hidden&&state===data)renderOperationEntry(root,{mode:'escort',state,api,refresh:load});
      }).catch(error=>{root.textContent=error.message;});
      return;
    }
    const settings=data.settings,run=data.run,daily=data.daily||{},manifest=baseManifest(settings,run);
    const current=number(run?.sectorIndex),next=run?.phase==='TACTIC'?current+1:current;
    const selected=Math.min(manifest.sectors.length-1,inspectSector??next),sector=manifest.sectors[selected];
    const hp=run?percent(run.vehiclePercent):100;
    const full=manifest.sectors.reduce((sum,row)=>({coin:sum.coin+row.rewardCoin,shards:sum.shards+row.rewardShards,stars:sum.stars+(row.rewardStars||0),tickets:sum.tickets+(row.rewardTickets||0)}),
      {coin:manifest.clearBonusCoin||0,shards:manifest.clearBonusShards||0,stars:0,tickets:0});
    const owner=bridge()?.loadUser?.();
    const received=!run && deliveryReceipt?.ownerId===(owner?.serverUserId??owner?.id) && deliveryReceipt;
    root.innerHTML=`<main class="escort-operation eo-dispatch" data-version="${VERSION}">
      <header class="eo-mast"><div><h2>${esc(settings.title||'호송작전')}</h2><p>${run?`${esc(manifest.name||'수송차')} · ${number(run.clearedSectors)} / ${manifest.sectors.length}구간 통과`:'장갑 수송차를 호위하고 검문소마다 화물을 인계하세요.'}</p>
        <div class="eo-hull"><span>차량 내구도 <b>${Math.round(hp)}%</b></span><progress value="${hp}" max="100" aria-label="수송차 내구도"></progress></div></div>
        <img src="/assets/ui/escort/escort-armored-carrier-v1.webp?v=1830" alt="장갑 수송차"></header>
      ${received?`<section class="eo-receipt" role="status"><b>보상 수령 완료</b><span>${esc(rewardText(received.reward))}</span></section>`:''}
      ${run?'':contractPicker(settings,manifest)}
      ${run?.phase==='TACTIC'?tacticMarkup(run,settings):''}
      ${actionMarkup(run,daily,settings)}
      <section class="eo-itinerary"><h3>운행 경로</h3><ol class="eo-stops">${routeMarkup(manifest,run,selected)}</ol>
        <div class="eo-contact"><img src="${esc(imageUrl(sector.enemyImage))}" alt=""><div><small>${esc(sector.name)}</small><h4>${esc(sector.enemyName)}</h4><p>${esc(sector.brief)}</p>
        <dl><div><dt>적 전투력</dt><dd>${number(sector.enemyPower).toLocaleString()}</dd></div><div><dt>차량 위험도</dt><dd>${number(sector.hazardPercent)}%</dd></div></dl></div></div>
        <p class="eo-payline"><b>구간 통과 보상</b> ${esc(rewardText(sectorReward(sector)))}</p>
      </section>
      <section class="eo-ledger"><div><h3>${run?'현재 적립한 보상':'완주 시 최대 기본 보상'}</h3><p>${esc(rewardText(run?run.reward:full))}</p></div>
        <small>${run?.contract||!run?'완주 보너스는 도착 내구도 80% 이상이면 전액, 50% 이상이면 80%, 그 아래는 60%입니다.':'구간을 통과할 때마다 보상을 적립합니다.'}</small></section>
      <details class="eo-detail"><summary>${run?'호위 편성 · '+run.deck.filter(card=>number(card.hpPercent)>0).length+' / 5 생존':'출전 편성 안내'}</summary>
        ${run?`<ol class="escort-roster">${run.deck.map(cardMarkup).join('')}</ol>`:'<p>저장한 PVE 덱 5장이 출전합니다. 방어형은 수송차 피해를 낮추고 HP형은 구간 통과 후 정비를 돕습니다.</p>'}</details>
      <footer class="escort-foot"><button type="button" data-escort-action="reload">작전 정보 새로고침</button>${run?.status==='ACTIVE'?'<button type="button" data-escort-action="abandon" class="escort-abandon">작전 포기</button>':''}</footer>
    </main>`;
    bindActions();setBusy(busy);
    if(run?.status==='CLAIMING')claimPollTimer=setTimeout(()=>{claimPollTimer=null;if(root.isConnected&&!root.hidden)load().catch(error=>console.warn('[ESCORT] 지급 상태 자동 확인 실패',error))},5000);
  }

  async function load(){data=await api('escort/status');render();return data;}

  const revealTab=tab=>{tab.hidden=false;};

  async function discover(){
    const tab=document.getElementById('pveEscortTab');if(!tab||['done','off'].includes(tab.dataset.escortDiscovery)||discoveryPromise)return;
    revealTab(tab);
    tab.dataset.escortDiscovery='pending';
    discoveryPromise=api('escort/status').then(result=>{data=result;revealTab(tab);tab.dataset.escortDiscovery='done';}).catch(error=>{
      const code=String(error?.code||'').toUpperCase();
      if(code==='ESCORT_OFF'){tab.hidden=true;tab.dataset.escortDiscovery='off';return}
      // 공개 콘텐츠 탭은 일시적인 API/DB 오류로 사라지지 않는다. 진입 화면에서
      // 원인을 표시하고 사용자가 직접 재시도할 수 있게 유지한다.
      revealTab(tab);tab.dataset.escortDiscovery='error';console.warn('[ESCORT] 상태 조회 실패',error);
    }).finally(()=>{discoveryPromise=null});
    await discoveryPromise;
  }

  async function start(){
    setBusy(true,'화물 적재 중');
    try{
      pendingStartId ||= requestId();
      data=await api('escort/start',{method:'POST',body:JSON.stringify({requestId:pendingStartId,contract:selectedContract})});
      pendingStartId='';deliveryReceipt=null;inspectSector=null;render();
    }finally{setBusy(false)}
  }
  function sectorAction(action,extra={}){
    const run=data.run;
    return {requestId:`${action}-${run.runId}-${run.sectorIndex}`,runId:run.runId,sectorIndex:run.sectorIndex,...extra};
  }
  async function chooseTactic(key){
    setBusy(true,'전술 적용 중');
    try{const result=await api('escort/tactic',{method:'POST',body:JSON.stringify(sectorAction('tactic',{tactic:key}))});if(result.replayed)await load();else data={...data,run:result.run};inspectSector=null;render()}finally{setBusy(false)}
  }
  async function deliver(){
    if(!confirm(`지금 확보한 보상을 인계하고 호송을 마칠까요?\n${rewardText(data.run.reward)}`))return;
    setBusy(true,'화물 인계 중');
    try{const result=await api('escort/deliver',{method:'POST',body:JSON.stringify(sectorAction('deliver'))});data={...data,run:result.run};inspectSector=null;render()}finally{setBusy(false)}
  }
  async function claim(){
    setBusy(true,'보상 지급 중');
    try{
      const result=await api('escort/claim',{method:'POST',body:JSON.stringify(sectorAction('claim'))});
      const user=bridge()?.loadUser?.();
      if(user){user.coin=result.coinAfter;user.cardShards=number(result.cardShardsAfter);if(result.masterStarsAfter!=null)user.masterStars=number(result.masterStarsAfter);bridge()?.saveUser?.(user)}
      deliveryReceipt={...result,ownerId:user?.serverUserId??user?.id};inspectSector=null;await load();
    }finally{setBusy(false)}
  }
  async function abandon(){
    // V1840: 포기하면 구간별로 쌓아둔 보상까지 같이 날아간다. 액수를 보여주고 묻는다.
    const banked=data?.run?.reward,worth=number(banked?.coin)+number(banked?.shards)+number(banked?.tickets)+number(banked?.stars);
    const message=worth?`확보한 보상(${rewardText(banked)})을 버리고 작전을 종료할까요?\n수령하지 않고 종료하면 되돌릴 수 없습니다.`:'현재 호송작전을 종료할까요? 진행 상황은 복구되지 않습니다.';
    if(!confirm(message))return;setBusy(true,'작전 정리 중');try{data=await api('escort/abandon',{method:'POST',body:'{}'});render()}finally{setBusy(false)}}

  function escortBattleHud(stage,response){
    const summary=response.sectorSummary||{},objective=response.objective||{},maxHp=number(objective.maxHp||response.run?.vehicleMaxHp),startHp=number(objective.hp??response.run?.vehicleHp),hud=document.createElement('div');hud.className='escort-v3-objective-hud';hud.innerHTML=`<small>ESCORT OBJECTIVE · ABSOLUTE PRIORITY</small><b>장갑 수송차 ${startHp.toLocaleString()} / ${maxHp.toLocaleString()}</b><i><u style="width:${percent(startHp/Math.max(1,maxHp)*100)}%"></u></i><span>몬스터 선제 공격 대기</span>`;hud.dataset.finalDamage=String(number(summary.vehicleDamage));stage.appendChild(hud);
  }

  async function playBattle(response){
    const modal=document.getElementById('modal'),user=bridge()?.loadUser?.()||{};
    await bridge().ensureFeatureResources('battleV2');
    const live=window.ProjectVBattleV3Live?.prepareLoading?.({modal,mode:'ESCORT',playerName:user.nickname||'ESCORT TEAM',opponentName:response.monster?.name||'HOSTILE FORCE',autoText:'카드 체력·수송차 내구도·서버 전투 타임라인을 동기화합니다.'});
    if(!live)throw new Error('V3 호송 전장을 준비하지 못했습니다.');
    const payload={...response,mode:'ESCORT',battlefieldMode:'ESCORT',contentType:'ESCORT'};
    const renderer=await window.ProjectVBattleV3Live.createRenderer({...live,modal,data:payload,mode:'ESCORT',monster:response.monster});modal.__battleV2Renderer=renderer;
    // V1837: HP 게이지는 Pixi UiLayer가 직접 그린다. 구형 번들이 섞인 캐시
    // 상태에서만 DOM 게이지를 안전망으로 남기고, 정상 번들에서는 중복 출력하지 않는다.
    if(!window.ProjectVPixiBattle?.diagnostics?.()?.objectiveHud?.native)escortBattleHud(live.stage,response);
    await renderer.play();
    const won=String(response.sectorSummary?.result||'LOSE')==='WIN',message=live.stage.querySelector('#battleMessage');
    if(message)message.innerHTML=`<strong>${won?'구간 돌파':'호송 저지'}</strong><span>${esc(response.sectorSummary?.sectorName||'구간 전투')} · 차량 피해 ${number(response.sectorSummary?.vehicleDamage).toLocaleString()} · 카드 ${number(response.sectorSummary?.aliveCards)}명 생존</span><button type="button" class="btn escort-v3-return">호송 지휘실로 돌아가기</button>`;
    renderer.showResult();
    const close=()=>{try{renderer.destroy?.()}catch(_){}modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';data={...data,run:response.run};render()};
    live.stage.querySelector('.escort-v3-return')?.addEventListener('click',event=>{event.stopPropagation();close()});
  }

  async function fight(){
    setBusy(true,'전장 연결 중');
    try{const response=await api('escort/fight',{method:'POST',body:JSON.stringify(sectorAction('fight'))});data={...data,run:response.run};inspectSector=null;render();if(response.battleV2)await playBattle(response);else await load()}
    catch(error){const modal=document.getElementById('modal');if(modal){try{modal.__battleV2Renderer?.destroy?.()}catch(_){}modal.__battleV2Renderer=null;modal.className='modal';modal.innerHTML=''}throw error}
    finally{setBusy(false)}
  }

  function bindActions(){
    document.querySelectorAll('#pveEscortView [data-escort-action]').forEach(button=>button.addEventListener('click',async()=>{
      if(busy)return;
      try{
        const action=button.dataset.escortAction;
        if(action==='contract'||action==='inspect'){
          if(action==='contract'){selectedContract=button.dataset.contract;inspectSector=null}
          else inspectSector=number(button.dataset.sector);
          render();document.querySelector(`#pveEscortView [data-escort-action="${action}"][aria-pressed="true"]`)?.focus({preventScroll:true});return;
        }
        if(action==='deliver')await deliver();else if(action==='start')await start();else if(action==='fight')await fight();else if(action==='tactic')await chooseTactic(button.dataset.tactic);else if(action==='claim')await claim();else if(action==='abandon')await abandon();else if(action==='reload'){setBusy(true,'갱신 중');try{await load()}finally{setBusy(false)}}
      }catch(error){alert(error?.message||'호송작전 요청을 처리하지 못했습니다.');await load().catch(()=>{});}
    }));
  }

  async function open(){
    const root=document.getElementById('pveEscortView');if(!root)return;
    root.hidden=false;if(!data)render();
    try{await load()}catch(error){root.innerHTML=`<section class="escort-operation-error"><small>ESCORT LINK ERROR</small><h2>호송 경로를 불러오지 못했습니다.</h2><p>${esc(error?.message||error)}</p><button type="button" data-escort-retry>다시 시도</button></section>`;root.querySelector('[data-escort-retry]')?.addEventListener('click',()=>open())}
  }

  const observer=new MutationObserver(()=>{void discover()});observer.observe(document.documentElement,{subtree:true,childList:true});
  addEventListener('load',()=>void discover());
  window.EscortOperationV1830=Object.freeze({version:VERSION,open,refresh:load});
})();
