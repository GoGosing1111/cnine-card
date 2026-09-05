(()=>{
  'use strict';

  const VERSION='2043';
  const ENDPOINT='card/unique-advancement';
  const FEATURE_ENDPOINT=`${ENDPOINT}/feature`;
  const ELIGIBLE_GRADES=Object.freeze(['FUR','ZENITH','SUPERSTAR']);
  const MIN_BREAKTHROUGH=13;
  const MASTER_STAR_COST=3000;
  const SUCCESS_CHANCE_PERCENT=10;
  const TYPE_ORDER=Object.freeze(['ATTACK','DEFENSE','SPEED','HP']);
  const CLIENT_MODES=Object.freeze(['OFF','TEST','ON']);
  const CLOSED_FEATURE_STATUS=Object.freeze({mode:'OFF',enabledForUser:false,testAccess:false,ready:false});
  const TYPE_META=Object.freeze({
    ATTACK:Object.freeze({name:'파쇄자',label:'공격',index:'01'}),
    DEFENSE:Object.freeze({name:'반격자',label:'방어',index:'02'}),
    SPEED:Object.freeze({name:'잔영자',label:'속도',index:'03'}),
    HP:Object.freeze({name:'불멸자',label:'생명',index:'04'})
  });
  const rootStates=new WeakMap();
  let featureStatus=CLOSED_FEATURE_STATUS,featureSyncVersion=0;

  const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const normalizedGrade=value=>String(value||'').trim().toUpperCase();
  const normalizedType=value=>{
    const type=String(value||'').trim().toUpperCase();
    return TYPE_ORDER.includes(type)?type:'';
  };
  const finiteNumber=value=>{
    if(value===null||value===undefined||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  };
  const formatNumber=value=>Math.max(0,Math.floor(Number(value)||0)).toLocaleString('ko-KR');
  const uniqueStrings=value=>[...new Set((Array.isArray(value)?value:[value]).map(item=>String(item||'').trim()).filter(Boolean))];
  const requestId=()=>globalThis.crypto?.randomUUID?.()||`unique-advancement-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function normalizeCurrent(value){
    if(value===null||value===undefined||value===false||value==='')return null;
    if(typeof value==='string')return value.trim()?{code:value.trim(),type:'',name:''}:null;
    if(typeof value!=='object')return null;
    const code=String(value.code||value.classCode||value.class_code||value.awakenClass||'').trim();
    const type=normalizedType(value.type||value.dominantType||value.dominant_type);
    const name=String(value.name||value.className||value.class_name||'').trim();
    const status=String(value.status||'').trim().toUpperCase();
    const active=value.active===true||value.advanced===true||value.completed===true||['ACTIVE','ADVANCED','COMPLETED'].includes(status);
    return code||type||name||active?{...value,code,type,name}:null;
  }

  function normalizeFeatureStatus(raw={}){
    const source=raw?.feature&&typeof raw.feature==='object'?raw.feature:raw;
    const requestedMode=String(source?.mode||'OFF').trim().toUpperCase();
    const mode=CLIENT_MODES.includes(requestedMode)?requestedMode:'OFF';
    const ready=source?.ready===true;
    const enabledForUser=ready&&mode!=='OFF'&&source?.enabledForUser===true;
    return Object.freeze({mode,enabledForUser,testAccess:enabledForUser&&mode==='TEST'&&source?.testAccess===true,ready});
  }

  function applyFeatureStatus(raw={}){
    featureStatus=normalizeFeatureStatus(raw);
    return featureStatus;
  }

  function resetFeatureStatus(){
    featureSyncVersion++;
    featureStatus=CLOSED_FEATURE_STATUS;
    return featureStatus;
  }

  async function syncFeatureStatus(apiRequest){
    const syncVersion=++featureSyncVersion;
    featureStatus=CLOSED_FEATURE_STATUS;
    if(typeof apiRequest!=='function')return featureStatus;
    try{
      const response=await apiRequest(FEATURE_ENDPOINT,{}, {ttl:0,timeoutMs:10000,replaceInflight:true});
      if(syncVersion!==featureSyncVersion)return featureStatus;
      return applyFeatureStatus(response);
    }catch(_){
      if(syncVersion===featureSyncVersion)featureStatus=CLOSED_FEATURE_STATUS;
      return featureStatus;
    }
  }

  function getFeatureStatus(){return featureStatus}

  function requirementMismatch(requirements){
    if(!requirements||typeof requirements!=='object')return false;
    if(Array.isArray(requirements.eligibleGrades)){
      const grades=[...new Set(requirements.eligibleGrades.map(normalizedGrade).filter(Boolean))].sort();
      if(grades.join('|')!==[...ELIGIBLE_GRADES].sort().join('|'))return true;
    }
    const min=finiteNumber(requirements.minBreakthrough);
    if(min!==null&&min!==MIN_BREAKTHROUGH)return true;
    const cost=finiteNumber(requirements.costMasterStars);
    if(cost!==null&&cost!==MASTER_STAR_COST)return true;
    const successChance=finiteNumber(requirements.successChancePercent);
    return successChance!==null&&successChance!==SUCCESS_CHANCE_PERCENT;
  }

  function normalizeOverview(raw={},context={}){
    const directRequirements=raw.requirements&&typeof raw.requirements==='object'?raw.requirements:{};
    const config=raw.config&&typeof raw.config==='object'?raw.config:{};
    const requirements={
      eligibleGrades:directRequirements.eligibleGrades??config.allowedGrades,
      minBreakthrough:directRequirements.minBreakthrough??config.minimumBreakthrough,
      costMasterStars:directRequirements.costMasterStars??config.costMasterStars,
      successChancePercent:directRequirements.successChancePercent??config.successChancePercent
    };
    const recommendedClass=raw.recommendedClass&&typeof raw.recommendedClass==='object'?raw.recommendedClass:{};
    const directClassInfo=raw.classInfo&&typeof raw.classInfo==='object'?raw.classInfo:{};
    const grade=normalizedGrade(raw.grade||raw.card?.grade||raw.eligibility?.grade||context.grade||context.card?.grade);
    const breakthroughLevel=Math.max(0,Math.floor(finiteNumber(raw.breakthroughLevel)??finiteNumber(raw.card?.breakthroughLevel)??finiteNumber(raw.eligibility?.breakthroughLevel)??finiteNumber(context.level)??0));
    const walletValue=finiteNumber(raw.wallet?.masterStars??raw.masterStars??raw.material?.balanceAfter);
    const normalizedCurrent=normalizeCurrent(raw.current!==undefined?raw.current:raw.uniqueAdvancement);
    const configuredClasses=Array.isArray(config.classes)?config.classes.filter(item=>item&&typeof item==='object'):[];
    const currentDefinition=normalizedCurrent?configuredClasses.find(item=>{
      const code=String(item.code||item.classCode||'').trim();
      return code&&code===normalizedCurrent.code;
    })||null:null;
    const currentCandidate=[directClassInfo,recommendedClass].find(item=>{
      const code=String(item?.code||item?.classCode||'').trim();
      return normalizedCurrent&&code&&code===normalizedCurrent.code;
    })||null;
    const currentType=normalizedType(normalizedCurrent?.type||currentDefinition?.dominantType||currentCandidate?.dominantType);
    const current=normalizedCurrent?{...normalizedCurrent,type:currentType}:null;
    const passQuantity=finiteNumber(raw.advancementPass?.quantity)??0;
    const passWillUse=!current&&passQuantity>0;
    const successChancePercent=finiteNumber(raw.effectiveSuccessChancePercent)??(passWillUse?100:SUCCESS_CHANCE_PERCENT);
    const passMismatch=!Number.isSafeInteger(passQuantity)||passQuantity<0||(!current&&successChancePercent!==(passWillUse?100:SUCCESS_CHANCE_PERCENT));
    const recommendedType=normalizedType(raw.dominantType||raw.recommendedType||directClassInfo.dominantType||recommendedClass.dominantType||raw.eligibility?.dominant?.dominantType);
    const dominantType=current?currentType:recommendedType;
    const classSource=current?(currentDefinition||currentCandidate||current):{...recommendedClass,...directClassInfo};
    const classCode=String(current?.code||classSource.code||classSource.classCode||'').trim();
    const localRequirementsMet=ELIGIBLE_GRADES.includes(grade)&&breakthroughLevel>=MIN_BREAKTHROUGH;
    const contractMismatch=requirementMismatch(requirements)||passMismatch;
    const serverEligible=raw.eligibility?.eligible===true;
    const walletEnough=walletValue!==null&&walletValue>=MASTER_STAR_COST;
    const canAdvance=raw.canAdvance===true&&serverEligible&&localRequirementsMet&&walletEnough&&!contractMismatch&&!current&&Boolean(dominantType&&classCode);
    return {
      raw,
      cardId:String(raw.cardId||raw.card?.id||context.cardId||context.card?.id||''),
      grade,
      breakthroughLevel,
      dominantType,
      classInfo:{
        code:classCode,
        name:String(classSource.name||current?.name||'').trim(),
        subtitle:String(classSource.subtitle||'').trim(),
        effect:String(classSource.effect||classSource.description||'').trim(),
        tradeoff:String(classSource.tradeoff||'').trim(),
        fxKey:String(classSource.fxKey||classSource.fx_key||'').trim()
      },
      current,
      wallet:{masterStars:walletValue},
      advancementPass:{quantity:passQuantity,willConsume:passWillUse},
      successChancePercent,
      requirements:{eligibleGrades:[...ELIGIBLE_GRADES],minBreakthrough:MIN_BREAKTHROUGH,costMasterStars:MASTER_STAR_COST,successChancePercent:SUCCESS_CHANCE_PERCENT},
      eligibility:{eligible:serverEligible,reasons:uniqueStrings(raw.eligibility?.reasons||raw.eligibility?.reason||[])},
      localRequirementsMet,
      contractMismatch,
      canAdvance
    };
  }

  function routeModels(overview){
    const currentType=normalizedType(overview?.current?.type)||(!overview?.current?.type&&overview?.current?overview.dominantType:'');
    return TYPE_ORDER.map(type=>{
      const meta=TYPE_META[type],completed=Boolean(overview?.current&&currentType===type),recommended=!overview?.current&&overview?.dominantType===type;
      return {
        type,
        index:meta.index,
        label:meta.label,
        name:(recommended||completed)&&overview?.classInfo?.name?overview.classInfo.name:meta.name,
        recommended,
        completed,
        effect:(recommended||completed)?overview?.classInfo?.effect||'':'',
        tradeoff:(recommended||completed)?overview?.classInfo?.tradeoff||'':''
      };
    });
  }

  function featureVisibleTo(status=featureStatus){
    const normalized=status===featureStatus?featureStatus:normalizeFeatureStatus(status);
    return normalized.ready===true&&normalized.enabledForUser===true&&normalized.mode!=='OFF';
  }

  function shouldExpose({card,owned,level,grade,status=featureStatus}={}){
    const cardGrade=normalizedGrade(grade||card?.grade),breakthroughLevel=Math.max(0,Math.floor(Number(level)||0));
    return featureVisibleTo(status)&&owned===true&&ELIGIBLE_GRADES.includes(cardGrade)&&breakthroughLevel>=MIN_BREAKTHROUGH;
  }

  function requirementCards(overview){
    const completed=Boolean(overview.current),gradeReady=ELIGIBLE_GRADES.includes(overview.grade),levelReady=overview.breakthroughLevel>=MIN_BREAKTHROUGH,walletKnown=overview.wallet.masterStars!==null,walletReady=completed||(walletKnown&&overview.wallet.masterStars>=MASTER_STAR_COST),walletStatus=completed?'전직 완료':walletKnown?`보유 ${formatNumber(overview.wallet.masterStars)}`:'서버 잔액 확인 필요';
    return `<div class="ua-requirements" aria-label="고유효과 전직 조건"><article class="${gradeReady?'is-ready':'is-locked'}"><small>CARD GRADE</small><b>FUR / ZENITH / SUPERSTAR</b><span>${gradeReady?`${escapeHtml(overview.grade)} 확인`:'대상 등급 아님'}</span></article><article class="${levelReady?'is-ready':'is-locked'}"><small>BREAKTHROUGH</small><b>+${MIN_BREAKTHROUGH}</b><span>현재 +${overview.breakthroughLevel}</span></article><article class="${walletReady?'is-ready':'is-locked'}"><small>MASTER STAR</small><b>${formatNumber(MASTER_STAR_COST)}</b><span>${walletStatus}</span></article></div>`;
  }

  function routeGrid(overview){
    const routes=routeModels(overview);
    return `<div class="ua-route-grid" aria-label="고유효과 전직 4종">${routes.map(route=>{
      const status=route.completed?'전직 완료':route.recommended?'자동 결정':'현재 조건 비활성';
      return `<article class="ua-route type-${route.type.toLowerCase()}${route.recommended?' is-recommended':''}${route.completed?' is-completed':''}" data-route-type="${route.type}"${route.recommended?' data-recommended="true"':''}${route.completed?' data-completed="true"':''}${route.recommended||route.completed?' aria-current="true"':''}><header><span>${route.index}</span><small>${escapeHtml(route.label)} 계열</small></header><h3>${escapeHtml(route.name)}</h3><p>${route.completed?'저장된 서버 전직 기록이 적용 중입니다.':route.recommended?'카드의 최고 고유효과를 기준으로 서버가 자동 결정했습니다.':'다른 효과를 선택해 변경할 수 없습니다.'}</p><strong>${escapeHtml(status)}</strong></article>`;
    }).join('')}</div>`;
  }

  function classProfile(overview){
    if(!overview.dominantType)return `<div class="ua-class-profile is-unavailable"><small>SERVER CLASS PROFILE</small><b>전직 계열 판정 대기</b><p>서버에서 최고 고유효과를 확인한 뒤 전직 계열을 표시합니다.</p></div>`;
    const route=routeModels(overview).find(item=>item.completed||item.recommended),rows=[];
    if(overview.classInfo.effect)rows.push(`<div><dt>고유 효과</dt><dd>${escapeHtml(overview.classInfo.effect)}</dd></div>`);
    if(overview.classInfo.tradeoff)rows.push(`<div><dt>전직 대가</dt><dd>${escapeHtml(overview.classInfo.tradeoff)}</dd></div>`);
    return `<div class="ua-class-profile"><small>SERVER CLASS PROFILE / ${escapeHtml(overview.dominantType)}</small><h3>${escapeHtml(route?.name||TYPE_META[overview.dominantType]?.name||'전직 계열')}</h3>${rows.length?`<dl>${rows.join('')}</dl>`:'<p>효과와 대가 설명은 서버 설정이 등록되면 표시됩니다.</p>'}</div>`;
  }

  function statusMessages(overview){
    if(overview.current)return ['이 카드는 고유효과 전직을 완료했습니다.'];
    const messages=[...overview.eligibility.reasons];
    if(overview.contractMismatch)messages.unshift('서버 전직 조건이 고정 계약과 일치하지 않아 실행을 차단했습니다.');
    if(!ELIGIBLE_GRADES.includes(overview.grade))messages.push('FUR, ZENITH 또는 SUPERSTAR 등급 카드만 전직할 수 있습니다.');
    if(overview.breakthroughLevel<MIN_BREAKTHROUGH)messages.push(`강화 +${MIN_BREAKTHROUGH} 달성 후 전직할 수 있습니다.`);
    if(overview.wallet.masterStars===null)messages.push('마스터의 별 잔액을 서버에서 확인하지 못했습니다.');
    else if(overview.wallet.masterStars<MASTER_STAR_COST)messages.push(`마스터의 별 ${formatNumber(MASTER_STAR_COST-overview.wallet.masterStars)}개가 더 필요합니다.`);
    if(!overview.dominantType)messages.push('서버 최고 고유효과 판정이 준비되지 않았습니다.');
    if(!overview.classInfo.code)messages.push('서버 전직 코드가 준비되지 않았습니다.');
    if(overview.canAdvance)messages.push(overview.advancementPass.willConsume
      ?`전직 패스권 1개 자동 사용 · 100% 성공. 마스터의 별 ${formatNumber(MASTER_STAR_COST)}개도 소모됩니다.`
      :`성공 확률은 ${SUCCESS_CHANCE_PERCENT}%이며, 실패해도 마스터의 별 ${formatNumber(MASTER_STAR_COST)}개가 소모됩니다.`);
    return uniqueStrings(messages);
  }

  function actionMarkup(overview,{confirming=false,pending=false,refreshRequired=false}={}){
    if(refreshRequired)return `<button type="button" class="ua-secondary ua-retry" data-ua-retry${pending?' disabled':''}>최신 전직 상태 다시 확인</button>`;
    if(confirming){
      const route=routeModels(overview).find(item=>item.recommended);
      const costCopy=overview.advancementPass.willConsume
        ?`전직 패스권 1개와 마스터의 별 ${formatNumber(MASTER_STAR_COST)}개가 소모되며 100% 성공합니다. 전직 계열은 서버가 다시 계산합니다.`
        :`성공 확률은 ${SUCCESS_CHANCE_PERCENT}%입니다. 성공 여부와 관계없이 마스터의 별 ${formatNumber(MASTER_STAR_COST)}개가 소모되며, 전직 계열은 서버가 다시 계산합니다.`;
      return `<div class="ua-confirm" role="group" aria-labelledby="uaConfirmTitle"><small>FINAL SERVER CONFIRMATION / ${overview.successChancePercent}%</small><h3 id="uaConfirmTitle">${escapeHtml(route?.name||'고유효과 전직')} 전직을 진행할까요?</h3><p>${costCopy}</p><div><button type="button" class="ua-secondary" data-ua-cancel${pending?' disabled':''}>취소</button><button type="button" class="ua-primary" data-ua-submit${pending?' disabled':''}>${pending?'서버 처리 중…':`${escapeHtml(route?.name||'전직')} 확정`}</button></div></div>`;
    }
    const disabled=!overview.canAdvance,buttonLabel=overview.current?'전직 완료':overview.canAdvance?'고유효과 전직 진행':'전직 조건 미충족';
    return `<button type="button" class="ua-primary ua-advance" data-ua-advance${disabled?' disabled':''}><span><small>MASTER STAR ${formatNumber(MASTER_STAR_COST)} · SUCCESS ${overview.successChancePercent}%${overview.advancementPass.willConsume?' · PASS ×1':''}</small><b>${escapeHtml(buttonLabel)}</b></span><strong>${overview.canAdvance?'READY':overview.current?'COMPLETE':'LOCKED'}</strong></button>`;
  }

  function renderOverview(overview,view={}){
    const messages=statusMessages(overview),notice=view.error||view.failure||view.success||'',noticeTone=view.error||view.failure?'error':view.success?'success':'info';
    const passNotice=overview.current?'':`<div class="ua-notice${overview.advancementPass.willConsume?' is-success':''}" data-ua-pass>전직 패스권 보유 ${formatNumber(overview.advancementPass.quantity)}개 · ${overview.advancementPass.willConsume?'전직 시 1개 자동 사용 · 100% 성공':'미보유 시 기본 성공률 10%'}</div>`;
    return `<header class="ua-heading"><div><small>UNIQUE EFFECT / AUTOMATIC ADVANCEMENT</small><h2>고유효과 전직</h2><p>최고 고유효과 1종을 기준으로 계열이 자동 결정되며 전직 성공 확률은 ${overview.successChancePercent}%입니다.</p></div><span><small>CARD STATUS</small><b>${escapeHtml(overview.grade||'?')} · +${overview.breakthroughLevel}</b></span></header>${requirementCards(overview)}${passNotice}${routeGrid(overview)}${classProfile(overview)}<div class="ua-status ${overview.canAdvance?'is-ready':''}" aria-live="polite"><b>${overview.canAdvance?'전직 준비 완료':overview.current?'전직 완료':'전직 상태 확인'}</b><ul>${messages.map(message=>`<li>${escapeHtml(message)}</li>`).join('')}</ul></div>${notice?`<div class="ua-notice is-${noticeTone}" role="status">${escapeHtml(notice)}</div>`:''}${actionMarkup(overview,view)}`;
  }

  function initialRootMarkup(context={}){
    const grade=normalizedGrade(context.card?.grade),level=Math.max(0,Math.floor(Number(context.level)||0));
    const empty=normalizeOverview({grade,breakthroughLevel:level,wallet:{}},{card:context.card,level});
    return `<div class="ua-loading-state" aria-busy="true"><div class="ua-loading-copy"><small>SERVER ELIGIBILITY CHECK</small><b>전직 정보를 확인하고 있습니다.</b><span>카드 등급, 강화 단계, 보유 재료와 자동 전직 계열을 서버에서 검증합니다.</span></div>${requirementCards(empty)}${routeGrid(empty)}</div>`;
  }

  function panelHtml({card,user,level,active=false}={}){
    const cardId=String(card?.id||'');
    return `<section class="cpv2-panel ua-panel${active?' is-active':''}" data-profile-panel="advancement"${active?'':' hidden'}><div class="ua-root" data-unique-advancement-root data-card-id="${escapeHtml(cardId)}" aria-live="polite">${initialRootMarkup({card,user,level})}</div></section>`;
  }

  function errorMessage(error,fallback){
    return String(error?.error||error?.message||fallback||'서버 요청을 완료하지 못했습니다.').trim();
  }

  function loadingMarkup(state){
    state.root.innerHTML=initialRootMarkup(state.context);
  }

  function errorMarkup(state,message){
    const grade=normalizedGrade(state.context.card?.grade),level=Math.max(0,Math.floor(Number(state.context.level)||0));
    const empty=normalizeOverview({grade,breakthroughLevel:level,wallet:{}},{card:state.context.card,level});
    state.root.innerHTML=`<header class="ua-heading"><div><small>UNIQUE EFFECT / AUTOMATIC ADVANCEMENT</small><h2>고유효과 전직</h2><p>서버 확인을 완료해야 전직할 수 있습니다.</p></div></header>${requirementCards(empty)}${routeGrid(empty)}<div class="ua-notice is-error" role="alert">${escapeHtml(message)}</div><button type="button" class="ua-secondary ua-retry" data-ua-retry>다시 확인</button>`;
  }

  function renderState(state){
    if(!state.overview)return;
    state.root.innerHTML=renderOverview(state.overview,{confirming:state.confirming,pending:state.pending,error:state.error,failure:state.failure,success:state.success,refreshRequired:state.refreshRequired});
  }

  async function loadOverview(state,{force=false}={}){
    if(state.loadingPromise&&!force)return state.loadingPromise;
    if(state.loaded&&!force)return state.overview;
    const api=state.dependencies.apiRequest;
    if(typeof api!=='function'){
      const message='서버 API 연결을 찾을 수 없습니다.';state.error=message;errorMarkup(state,message);return null;
    }
    state.error='';state.failure='';state.success='';state.refreshRequired=false;state.confirming=false;loadingMarkup(state);
    const cardId=String(state.context.card?.id||state.root.dataset.cardId||'');
    const task=(async()=>{
      try{
        const raw=await api(`${ENDPOINT}?cardId=${encodeURIComponent(cardId)}`,{}, {ttl:0,timeoutMs:12000,replaceInflight:force});
        if(raw?.feature)applyFeatureStatus(raw.feature);
        state.overview=normalizeOverview(raw,{card:state.context.card,cardId,level:state.context.level});
        state.loaded=true;state.error='';renderState(state);return state.overview;
      }catch(error){
        state.loaded=false;state.error=errorMessage(error,'전직 정보를 불러오지 못했습니다.');errorMarkup(state,state.error);return null;
      }finally{state.loadingPromise=null}
    })();
    state.loadingPromise=task;
    return task;
  }

  function saveReturnedUser(state,result){
    const {apiUserToLocal,saveUser,loadUser}=state.dependencies;
    if(result?.user&&typeof saveUser==='function'){
      const next=typeof apiUserToLocal==='function'?apiUserToLocal(result.user):result.user;
      saveUser(next);return;
    }
    const balance=finiteNumber(result?.masterStarsAfter??result?.material?.balanceAfter??result?.masterStars);
    if(balance===null||typeof loadUser!=='function'||typeof saveUser!=='function')return;
    const current=loadUser();
    if(current){current.masterStars=balance;saveUser(current)}
  }

  async function submitAdvancement(state){
    if(state.pending||!state.overview?.canAdvance)return;
    const api=state.dependencies.apiRequest;
    if(typeof api!=='function')return;
    state.pending=true;state.error='';renderState(state);
    const expectedClassCode=state.overview.classInfo.code,expectedType=state.overview.dominantType,cardId=state.overview.cardId||String(state.context.card?.id||'');
    try{
      const result=await api(ENDPOINT,{method:'POST',body:JSON.stringify({cardId,requestId:state.operationRequestId,expectedPassUse:state.operationPassUse})},{timeoutMs:30000});
      state.dependencies.clearApiCache?.('inventory');
      const returned=result?.overview||result?.status||result;
      const outcome=String(result?.outcome||returned?.outcome||'').trim().toUpperCase();
      const explicitFailure=result?.success===false||returned?.success===false||outcome==='FAILED';
      if(explicitFailure){
        saveReturnedUser(state,result);
        state.dependencies.clearApiCache?.(`${ENDPOINT}?cardId=${encodeURIComponent(cardId)}`);
        const fallbackWallet=finiteNumber(result?.masterStarsAfter??result?.material?.balanceAfter??result?.masterStars)??state.overview.wallet.masterStars;
        state.overview=normalizeOverview({...state.overview.raw,...returned,wallet:returned?.wallet||{masterStars:fallbackWallet},current:null,uniqueAdvancement:null,canAdvance:false,eligibility:{eligible:false,reasons:[`전직 실패 · 마스터의 별 ${formatNumber(MASTER_STAR_COST)}개가 소모되었습니다.`]}},{card:state.context.card,cardId,level:state.context.level});
        state.failure=`전직 실패 · 재료 ${formatNumber(MASTER_STAR_COST)}개 소모`;
        state.confirming=false;state.loaded=false;state.refreshRequired=true;state.operationRequestId='';renderState(state);return;
      }
      const returnedCurrent=normalizeCurrent(returned?.current!==undefined?returned.current:returned?.uniqueAdvancement);
      if(!returnedCurrent||!returnedCurrent.code||!normalizedType(returnedCurrent.type))throw new Error('서버 전직 결과를 확인하지 못했습니다. 같은 요청 번호로 다시 확인해 주세요.');
      const serverReclassified=returnedCurrent.code!==expectedClassCode||normalizedType(returnedCurrent.type)!==expectedType;
      saveReturnedUser(state,result);
      state.dependencies.clearApiCache?.(`${ENDPOINT}?cardId=${encodeURIComponent(cardId)}`);
      const fallbackWallet=finiteNumber(result?.masterStarsAfter??result?.material?.balanceAfter??result?.masterStars)??state.overview.wallet.masterStars;
      state.overview=normalizeOverview({...state.overview.raw,...returned,wallet:returned?.wallet||{masterStars:fallbackWallet},current:returnedCurrent,canAdvance:false},{card:state.context.card,cardId,level:state.context.level});
      state.success=serverReclassified?'서버 최신 고유효과 판정으로 전직이 완료되었습니다.':'고유효과 전직이 완료되었습니다.';state.failure='';state.refreshRequired=false;state.confirming=false;state.loaded=true;renderState(state);
      if(result?.advancementPass?.spent===1){state.success+=' 전직 패스권 1개를 사용했습니다.';renderState(state)}
    }catch(error){
      if(error?.payload?.code==='ADVANCEMENT_PASS_STATE_CHANGED'||error?.code==='ADVANCEMENT_PASS_STATE_CHANGED'){
        state.error=errorMessage(error);state.confirming=false;state.loaded=false;state.refreshRequired=true;state.operationRequestId='';renderState(state);return;
      }
      state.error=errorMessage(error,'전직 요청을 완료하지 못했습니다.');state.confirming=true;renderState(state);
    }finally{
      state.pending=false;
      if(state.root.isConnected&&(state.confirming||state.refreshRequired))renderState(state);
    }
  }

  function bind(modal,options={}){
    const root=modal?.querySelector?.('[data-unique-advancement-root]');
    if(!root)return null;
    if(rootStates.has(root))return rootStates.get(root).controller;
    const context={card:options.card||{},user:options.user||{},level:Math.max(0,Math.floor(Number(options.level)||0))};
    const state={root,context,dependencies:options,overview:null,loaded:false,loadingPromise:null,confirming:false,pending:false,error:'',failure:'',success:'',refreshRequired:false,operationRequestId:'',operationPassUse:false};
    const controller={load:force=>loadOverview(state,{force:Boolean(force)}),get overview(){return state.overview}};
    rootStates.set(root,{state,controller});
    root.addEventListener('click',event=>{
      const target=event.target.closest?.('[data-ua-retry],[data-ua-advance],[data-ua-cancel],[data-ua-submit]');
      if(!target)return;
      event.preventDefault();event.stopPropagation();
      if(target.hasAttribute('data-ua-retry')){void loadOverview(state,{force:true});return}
      if(target.hasAttribute('data-ua-advance')&&state.overview?.canAdvance){state.confirming=true;state.error='';state.success='';state.operationRequestId=requestId();state.operationPassUse=state.overview.advancementPass.willConsume;renderState(state);return}
      if(target.hasAttribute('data-ua-cancel')&&!state.pending){state.confirming=false;state.error='';state.operationRequestId='';renderState(state);return}
      if(target.hasAttribute('data-ua-submit'))void submitAdvancement(state);
    });
    const tab=modal.querySelector?.('[data-profile-tab="advancement"]');
    tab?.addEventListener('click',()=>void loadOverview(state));
    if(tab?.getAttribute('aria-selected')==='true')void loadOverview(state);
    return controller;
  }

  function mountPreview(root,raw,context={}){
    if(!root)return null;
    const overview=normalizeOverview(raw,context);
    root.innerHTML=renderOverview(overview,context.view||{});
    return overview;
  }

  const api=Object.freeze({
    VERSION,
    ENDPOINT,
    FEATURE_ENDPOINT,
    ELIGIBLE_GRADES,
    MIN_BREAKTHROUGH,
    MASTER_STAR_COST,
    SUCCESS_CHANCE_PERCENT,
    TYPE_ORDER,
    TYPE_META,
    normalizeFeatureStatus,
    applyFeatureStatus,
    resetFeatureStatus,
    syncFeatureStatus,
    getFeatureStatus,
    featureVisibleTo,
    normalizeOverview,
    routeModels,
    shouldExpose,
    panelHtml,
    renderOverview,
    bind,
    mountPreview
  });
  globalThis.CNineCardUniqueAdvancementV1937=api;
})();
