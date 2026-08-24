(() => {
  'use strict';
  const VERSION='1844-public-mobile';
  const bridge=()=>window.CNineEscortBridge;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const requestId=()=>globalThis.crypto?.randomUUID?.()||`escort-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const number=value=>Math.max(0,Number(value)||0);
  const percent=value=>Math.max(0,Math.min(100,Number(value)||0));
  const imageUrl=value=>{const raw=String(value||'').trim().replace(/\\/g,'/');if(!raw)return '/assets/ui/cninelogo.png';if(/^(?:data:|blob:|https?:\/\/|\/)/i.test(raw))return raw;return `/${raw.replace(/^\.\//,'')}`};
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
    if(tickets)parts.push(`폐차장 출입 허가증 ${tickets.toLocaleString()}장`);
    return parts.length?parts.join(' · '):'없음';
  };
  let data=null,busy=false,discoveryPromise=null;

  async function api(path,options={}){
    if(!bridge()?.apiRequest)throw new Error('게임 연결 모듈을 불러오지 못했습니다.');
    return bridge().apiRequest(path,options,{ttl:0,replaceInflight:true});
  }

  function setBusy(next,label='처리 중'){
    busy=Boolean(next);
    document.querySelectorAll('#pveEscortView button[data-escort-action]').forEach(button=>{button.disabled=busy;// V1838: 내부에 요소가 있는 버튼(전술 카드)은 textContent 를 건드리면 안 된다.
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

  function routeMarkup(settings,run){
    const active=Number(run?.sectorIndex||0),history=Array.isArray(run?.history)?run.history:[];
    return settings.sectors.map((sector,index)=>{
      const cleared=history.some(entry=>Number(entry.sectorIndex)===index&&entry.result==='WIN'),failed=history.some(entry=>Number(entry.sectorIndex)===index&&entry.result==='LOSE');
      // V1840: 각 구간이 얼마짜리인지 눈에 보여야 '여기까지는 가자' 가 생긴다.
      const ticket=number(sector.rewardTickets),coin=number(sector.rewardCoin);
      const prize=`${coin?`${Math.round(coin/10000).toLocaleString()}만`:''}${ticket?`${coin?' · ':''}허가증 ${ticket}장`:''}`;
      return `<li class="${cleared?'is-cleared':''} ${failed?'is-failed':''} ${run&&index===active?'is-active':''}"><span>${String(index+1).padStart(2,'0')}</span><i></i><div><small>${esc(sector.label)}</small><b>${esc(sector.name)}</b>${prize?`<em style="display:block;margin-top:4px;font-style:normal;font-size:11px;letter-spacing:.02em;opacity:${cleared?'1':'.72'};color:${cleared?'#7dffb2':'inherit'}">${cleared?'획득 ':'보상 '}${esc(prize)}</em>`:''}</div></li>`;
    }).join('');
  }

  function tacticMarkup(run,settings){
    if(run?.phase!=='TACTIC')return '';
    const catalog=new Map((settings?.tactics||[]).map(tactic=>[String(tactic.key||'').toUpperCase(),tactic]));
    const choices=(run.choices||[]).map(choice=>({...choice,...(catalog.get(String(choice.key||'').toUpperCase())||{})}));
    return `<section class="escort-tactic-panel"><header><div><small>ROUTE COMMAND / TACTICAL BUFFER</small><h3>다음 구간 전술 선택</h3></div><p>두 전술 중 하나만 적용됩니다. 효과 범위와 유지 시간을 확인하십시오.</p></header><div class="escort-v1833-tactic-grid">${choices.map((tactic,index)=>`<button type="button" class="escort-v1833-tactic-card is-${esc(String(tactic.key||'').toLowerCase())}" data-escort-action="tactic" data-tactic="${esc(tactic.key)}" data-escort-primary="${index===0?'1':'0'}" aria-label="${esc(`${tactic.name} 선택`)}"><span class="escort-v1833-tactic-number">0${index+1}</span><div class="escort-v1833-tactic-icon"><img src="${esc(imageUrl(TACTIC_ICONS[String(tactic.key||'').toUpperCase()]||tactic.icon))}?v=1835" alt="" width="256" height="256" decoding="async"></div><div class="escort-v1833-tactic-copy"><div class="escort-v1833-tactic-meta"><small>${esc(tactic.type)}</small><em>${esc(tactic.duration||'다음 1구간')}</em></div><b>${esc(tactic.name)}</b><p>${esc(tactic.description)}</p><u>전술 적용</u></div><i class="escort-v1833-tactic-arrow" aria-hidden="true"></i></button>`).join('')}</div></section>`;
  }

  function actionMarkup(run,weekly,settings){
    if(!run)return `<div class="escort-action-block"><div><small>WEEKLY DEPLOYMENT</small><b>${number(weekly.startedCount)} / ${number(settings.weeklyRunLimit)} 출전</b><span>완료 보상 ${number(weekly.rewardCount)} / ${number(settings.weeklyRewardLimit)}</span></div><button type="button" data-escort-action="start" data-escort-primary="1">호송작전 개시</button></div>`;
    if(run.status==='CLAIMING')return '<div class="escort-action-block is-wait"><div><small>REWARD PROCESSING</small><b>보상 지급 처리 중</b><span>중복 지급을 방지하고 있습니다. 잠시 후 작전 정보를 새로고침하세요.</span></div></div>';
    // V1840: 도중에 실패해도 통과한 구간의 보상은 남아 있다. 상태가
    //   COMPLETED_PENDING 이면 완주든 중도 실패든 수령 화면을 띄운다.
    if(run.status==='COMPLETED_PENDING'){
      const done=run.phase!=='FAILED',cleared=number(run.clearedSectors);
      return `<div class="escort-action-block ${done?'is-reward':'is-failed'}"><div><small>${done?'MISSION COMPLETE':'MISSION ABORTED'}</small><b>${done?`완주 · 수송차 생존 ${Math.round(run.vehiclePercent)}%`:`${cleared}구간 돌파 · 수송차 파괴`}</b><span>확보한 보상 — ${esc(rewardText(run.reward))}</span></div><button type="button" data-escort-action="claim" data-escort-primary="1">확보 보상 수령</button></div>`;
    }
    if(run.status==='FAILED'||run.phase==='FAILED')return `<div class="escort-action-block is-failed"><div><small>MISSION FAILED</small><b>호송 작전 실패</b><span>1구간도 통과하지 못해 확보한 보상이 없습니다.</span></div><button type="button" data-escort-action="abandon" data-escort-primary="1">작전 기록 정리</button></div>`;
    if(run.phase==='TACTIC')return '<div class="escort-action-block is-wait"><div><small>TACTICAL DECISION</small><b>전술 선택 대기</b><span>다음 구간으로 이동할 전술을 선택하십시오.</span></div></div>';
    return `<div class="escort-action-block"><div><small>SECTOR ${Number(run.sectorIndex)+1} / 5</small><b>${esc(run.sector?.label||'구간 전투')}</b><span>${esc(run.pendingTactic?`${run.pendingTactic} 적용 · `:'')}통과 보상 ${esc(rewardText({coin:run.sector?.rewardCoin,shards:run.sector?.rewardShards,tickets:run.sector?.rewardTickets}))} · 확보분 ${esc(rewardText(run.reward))}</span></div><button type="button" data-escort-action="fight" data-escort-primary="1">구간 전투 시작</button></div>`;
  }

  function render(){
    const root=document.getElementById('pveEscortView');if(!root||root.hidden)return;
    if(!data){root.innerHTML='<div class="escort-operation-loading"><i></i><b>호송 경로를 불러오는 중입니다.</b></div>';return}
    const settings=data.settings||{},run=data.run,weekly=data.weekly||{},sector=run?.sector||settings.sectors?.[0]||{},vehiclePercent=run?percent(run.vehiclePercent):100;
    root.innerHTML=`<main class="escort-operation" data-version="${VERSION}">
      <section class="escort-hero">
        <div class="escort-hero-copy"><span class="escort-test-flag">${data.ownerTest?'OWNER TEST':'LIVE OPERATION'}</span><small>SOOPKETMON / PVE ESCORT</small><h2>${esc(settings.title||'철벽 호송작전')}</h2><p>${esc(settings.description||'')}</p><div class="escort-rule-strip"><span>5 SECTORS</span><span>PERSISTENT HP</span><span>V3 PIXIJS</span><span>4–6 MIN MISSION</span></div></div>
        <div class="escort-carrier-stage"><div class="escort-carrier-aura"></div><img src="/assets/ui/escort/escort-armored-carrier-v1.webp?v=1830" alt="장갑 수송차"><div class="escort-vehicle-hud"><div><small>ARMORED CARRIER</small><b>${run?`${number(run.vehicleHp).toLocaleString()} / ${number(run.vehicleMaxHp).toLocaleString()}`:'STANDBY'}</b></div><span>${run?`${Math.round(vehiclePercent)}%`:'100%'}</span><i><u style="width:${vehiclePercent}%"></u></i></div></div>
      </section>
      <ol class="escort-route-map">${routeMarkup(settings,run)}</ol>
      <section class="escort-command-grid">
        <article class="escort-sector-panel">
          <header><div><small>CURRENT CONTACT</small><h3>${esc(run?sector.name:'작전 브리핑')}</h3></div><span>${run?`SECTOR ${Number(run.sectorIndex)+1}`:'READY'}</span></header>
          ${run?`<div class="escort-enemy"><div class="escort-enemy-art"><img src="${esc(imageUrl(sector.enemyImage))}" alt=""></div><div><small>${esc(sector.label)}</small><h4>${esc(sector.enemyName)}</h4><p>${esc(sector.brief)}</p><dl><div><dt>적 전투력</dt><dd>${number(sector.enemyPower).toLocaleString()}</dd></div><div><dt>차량 위험도</dt><dd>${number(sector.hazardPercent)}%</dd></div><div><dt>통과 보상</dt><dd>${esc(rewardText({coin:sector.rewardCoin,shards:sector.rewardShards,tickets:sector.rewardTickets}))}</dd></div></dl></div></div>`:`<div class="escort-briefing"><b>저장된 PVE 덱 5장으로 출전합니다.</b><p>카드가 입은 피해와 수송차 내구도는 다음 구간으로 이어지며, 매 구간 종료 후 두 가지 전술 중 하나를 선택합니다.</p><ul><li>공격형 · 방벽 및 보스 화력 증폭</li><li>방어형 · 수송차 피해 경감</li><li>속도형 · 매복·추격 피해 경감</li><li>HP형 · 생존 카드와 차량 회복</li></ul></div>`}
        </article>
        <article class="escort-roster-panel"><header><div><small>ESCORT DETAIL</small><h3>호위 편성</h3></div><span>${run?`${(run.deck||[]).filter(card=>number(card.hpPercent)>0).length} / 5 생존`:'PVE DECK'}</span></header>${run?`<ol class="escort-roster">${run.deck.map(cardMarkup).join('')}</ol>`:'<div class="escort-roster-empty"><i></i><b>PVE 덱을 확인한 뒤 출전합니다.</b><span>작전 시작 시 5장 편성을 한 번만 스냅샷으로 저장합니다.</span></div>'}</article>
      </section>
      ${tacticMarkup(run,settings)}
      ${actionMarkup(run,weekly,settings)}
      <footer class="escort-foot"><span>구간 종료 시 진행 상황이 자동 저장됩니다.</span><button type="button" data-escort-action="reload">작전 정보 새로고침</button>${run&&['ACTIVE','COMPLETED_PENDING'].includes(run.status)?'<button type="button" data-escort-action="abandon" class="escort-abandon">작전 포기</button>':''}</footer>
    </main>`;
    bindActions();setBusy(busy);
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

  async function start(){setBusy(true,'작전 편성 중');try{data=await api('escort/start',{method:'POST',body:JSON.stringify({requestId:requestId()})});render()}finally{setBusy(false)}}
  async function chooseTactic(key){setBusy(true,'전술 적용 중');try{const result=await api('escort/tactic',{method:'POST',body:JSON.stringify({requestId:requestId(),tactic:key})});data={...data,run:result.run};render()}finally{setBusy(false)}}
  async function claim(){setBusy(true,'보상 지급 중');try{const result=await api('escort/claim',{method:'POST',body:JSON.stringify({requestId:requestId()})});const user=bridge()?.loadUser?.();if(user){user.coin=number(result.coinAfter);user.cardShards=number(result.cardShardsAfter);bridge()?.saveUser?.(user)}alert(`호송작전 보상 (${number(result.clearedSectors)}구간 확보)\n${rewardText(result.reward)}`);await load()}finally{setBusy(false)}}
  async function abandon(){
    // V1840: 포기하면 구간별로 쌓아둔 보상까지 같이 날아간다. 액수를 보여주고 묻는다.
    const banked=data?.run?.reward,worth=number(banked?.coin)+number(banked?.shards)+number(banked?.tickets);
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
    try{const response=await api('escort/fight',{method:'POST',body:JSON.stringify({requestId:requestId()})});data={...data,run:response.run};render();if(response.battleV2)await playBattle(response);else await load()}
    catch(error){const modal=document.getElementById('modal');if(modal){try{modal.__battleV2Renderer?.destroy?.()}catch(_){}modal.__battleV2Renderer=null;modal.className='modal';modal.innerHTML=''}throw error}
    finally{setBusy(false)}
  }

  function bindActions(){
    document.querySelectorAll('#pveEscortView [data-escort-action]').forEach(button=>button.addEventListener('click',async()=>{
      if(busy)return;
      try{
        const action=button.dataset.escortAction;if(action==='start')await start();else if(action==='fight')await fight();else if(action==='tactic')await chooseTactic(button.dataset.tactic);else if(action==='claim')await claim();else if(action==='abandon')await abandon();else if(action==='reload'){setBusy(true,'갱신 중');try{await load()}finally{setBusy(false)}}
      }catch(error){alert(error?.message||'호송작전 요청을 처리하지 못했습니다.');}
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
