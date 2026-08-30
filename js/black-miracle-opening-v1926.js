(()=>{
  'use strict';

  const PACK_SMALL='/assets/ui/packs/black-miracle-pack-v1485-384.jpg?v=1485';
  const PACK_LARGE='/assets/ui/packs/black-miracle-pack-v1485-768.jpg?v=1485';
  const BLACK_MIRACLE_CHOICE_COUNT=5;
  const PHASES_WITH_SAFE_CLOSE=new Set(['intro','error','revealed']);
  let activeOpening=null;

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const requestId=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const numberFrom=(...values)=>{for(const value of values){const number=Number(value);if(Number.isFinite(number))return number}return null};
  const formatRate=value=>{
    const rate=Number(value);
    if(!Number.isFinite(rate))return '';
    if(rate<.01)return rate.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
    if(rate<1)return rate.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
    return rate.toLocaleString('ko-KR',{maximumFractionDigits:2});
  };
  const packPicture=(className,alt='')=>`<img class="${className}" src="${PACK_SMALL}" srcset="${PACK_SMALL} 384w, ${PACK_LARGE} 768w" sizes="(max-width:760px) 150px, 210px" width="768" height="1376" alt="${escapeHtml(alt)}">`;

  function normalizeReward(data={}){
    const reward=data.reward||{},item=reward.item||{},type=String(reward.type||item.type||'UNKNOWN').toUpperCase();
    const amount=numberFrom(reward.amount,item.amount);
    const totalPower=numberFrom(item.totalPower,item.total_power,reward.totalPower,reward.total_power);
    const pvePower=numberFrom(item.pvePower,item.pve_power,reward.pvePower,reward.pve_power);
    const pvpPower=numberFrom(item.pvpPower,item.pvp_power,reward.pvpPower,reward.pvp_power);
    const dropRate=numberFrom(item.dropRate,item.drop_rate,reward.dropRate,reward.drop_rate,data.dropRate,data.drop_rate);
    const typeLabel={MYTHIC_EQUIPMENT:'신화 장비',MYTHIC_VEHICLE:'신화 이동수단',MASTER_STAR:'마스터의 별',COIN:'코인'}[type]||reward.label||'블랙 미라클 보상';
    return {
      type,
      typeClass:type.toLowerCase().replace(/[^a-z0-9_-]/g,'-'),
      typeLabel:String(reward.label||typeLabel),
      name:String(item.name||reward.name||reward.label||typeLabel),
      image:String(item.image||item.imageUrl||item.image_url||''),
      rarity:String(item.rarity||reward.rarity||(type.startsWith('MYTHIC_')?'MYTHIC':'')),
      slot:String(item.slotLabel||item.slot_label||item.slot||''),
      amount,
      totalPower,
      pvePower,
      pvpPower,
      dropRate,
      remaining:Math.max(0,Number(data.remaining||0))
    };
  }

  function rewardSymbol(reward){
    if(reward.type==='MASTER_STAR')return '★';
    if(reward.type==='COIN')return '<span>SOOP</span><b>COIN</b>';
    return '✦';
  }

  function powerBadges(reward,{compact=false}={}){
    const badges=[];
    if(reward.totalPower!==null)badges.push(`<span><small>전투력</small><b>+${reward.totalPower.toLocaleString()}</b></span>`);
    if(!compact&&reward.pvePower!==null)badges.push(`<span><small>PVE</small><b>+${reward.pvePower.toLocaleString()}</b></span>`);
    if(!compact&&reward.pvpPower!==null)badges.push(`<span><small>PVP</small><b>+${reward.pvpPower.toLocaleString()}</b></span>`);
    if(reward.dropRate!==null)badges.push(`<span class="rate"><small>획득률</small><b>${formatRate(reward.dropRate)}%</b></span>`);
    return badges.length?`<div class="black-miracle-power${compact?' compact':''}">${badges.join('')}</div>`:'';
  }

  function rewardFaceMarkup(reward){
    const hasImage=Boolean(reward.image),amount=reward.amount!==null?`<strong>+${reward.amount.toLocaleString()}</strong>`:'';
    return `<span class="black-miracle-reward-face type-${reward.typeClass}"><small>${escapeHtml(reward.rarity||reward.typeLabel)}</small><span class="black-miracle-reward-visual">${hasImage?`<img src="${escapeHtml(reward.image)}" alt="">`:`<i>${rewardSymbol(reward)}</i>`}</span><b>${escapeHtml(reward.name)}</b>${amount}${powerBadges(reward,{compact:true})}</span>`;
  }

  function resultStatusMarkup(reward){
    const secondary=[];
    if(reward.slot)secondary.push(escapeHtml(reward.slot));
    if(reward.rarity)secondary.push(escapeHtml(reward.rarity));
    return `<div class="black-miracle-result-copy"><small>JACKPOT RESULT SECURED</small><h3>${escapeHtml(reward.name)}</h3>${secondary.length?`<p>${secondary.join(' · ')}</p>`:''}${powerBadges(reward)}<span>남은 블랙 미라클 팩 <b>${reward.remaining.toLocaleString()}개</b></span></div><div class="black-miracle-result-actions"><button type="button" class="black-miracle-secondary" data-black-miracle-done>인벤토리로 돌아가기</button><button type="button" class="black-miracle-primary" data-black-miracle-again ${reward.remaining>0?'':'disabled'}>한 번 더 개봉</button></div>`;
  }

  function introMarkup(ownedQuantity){
    return `<div class="black-miracle-vault" aria-hidden="true"><div class="black-miracle-orbits"><i></i><i></i><i></i></div><div class="black-miracle-pack-sealed">${packPicture('black-miracle-pack-half half-left')}${packPicture('black-miracle-pack-half half-right')}<span class="black-miracle-seal">✦</span></div></div><div class="black-miracle-pool" aria-label="등장 보상"><span>신화 장비</span><span>신화 이동수단</span><span>마스터의 별</span><span>코인</span></div><button type="button" class="black-miracle-primary black-miracle-open" data-black-miracle-open>봉인 해제</button><small class="black-miracle-balance">보유 ${Math.max(0,Number(ownedQuantity||0)).toLocaleString()}개 · 서버 판정 완료 후 봉인 카드 1장을 선택합니다.</small>`;
  }

  function choicesMarkup(requestedCount=BLACK_MIRACLE_CHOICE_COUNT){
    const count=Math.max(3,Math.min(7,Math.trunc(Number(requestedCount)||BLACK_MIRACLE_CHOICE_COUNT))),center=(count-1)/2;
    const cards=Array.from({length:count},(_,index)=>`<button type="button" class="black-miracle-choice" data-black-miracle-choice="${index}" aria-label="봉인 카드 ${index+1} 선택" aria-pressed="false" style="--choice-index:${index-center};--choice-depth:${Math.abs(index-center)};--choice-order:${index}"><span class="black-miracle-choice-inner"><span class="black-miracle-choice-face black-miracle-choice-back">${packPicture('black-miracle-choice-image')}</span><span class="black-miracle-choice-face black-miracle-choice-front" aria-hidden="true"></span></span><small>${String(index+1).padStart(2,'0')}</small></button>`).join('');
    return `<div class="black-miracle-fate-stage"><div class="black-miracle-fate-ring" aria-hidden="true"><i></i><i></i><i></i></div><div class="black-miracle-card-fan" role="group" aria-label="블랙 미라클 봉인 카드 선택" style="--choice-count:${count}">${cards}</div></div>`;
  }

  function shellMarkup(ownedQuantity){
    const motes=Array.from({length:18},(_,index)=>`<i style="--mote:${index};--mote-x:${(index*37)%101}%;--mote-delay:${(index%7)*-.31}s"></i>`).join('');
    return `<section class="black-miracle-experience" data-phase="intro" role="dialog" aria-modal="true" aria-labelledby="blackMiracleTitle" aria-describedby="blackMiracleDescription" tabindex="-1"><div class="black-miracle-atmosphere" aria-hidden="true"><span></span><span></span><span></span><div class="black-miracle-motes">${motes}</div></div><button type="button" class="black-miracle-close" data-black-miracle-close aria-label="블랙 미라클 개봉 화면 닫기">×</button><header class="black-miracle-heading"><small>BLACK MIRACLE / MYTHIC JACKPOT</small><h2 id="blackMiracleTitle">운명의 봉인을 선택하세요</h2><p id="blackMiracleDescription">팩을 깨우면 다섯 장의 봉인 카드가 나타납니다.</p></header><main class="black-miracle-body">${introMarkup(ownedQuantity)}</main><footer class="black-miracle-status black-miracle-live" aria-live="polite" aria-atomic="true"><i></i><b>봉인 대기</b><span>개봉 전에는 팩이 차감되지 않습니다.</span></footer></section>`;
  }

  async function preloadRewardImage(reward,reducedMotion){
    if(!reward.image)return;
    const image=new Image();image.src=reward.image;
    try{await Promise.race([typeof image.decode==='function'?image.decode():new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject}),sleep(reducedMotion?80:900)])}catch(_){/* Result copy still renders if the optional art fails. */}
  }

  function previewPayload(kind='equipment'){
    const payloads={
      equipment:{reward:{type:'MYTHIC_EQUIPMENT',label:'신화 장비',dropRate:.01,item:{name:'천공의 심판검',rarity:'MYTHIC',slotLabel:'무기',image:'../../assets/items/sovereign-weapon-v1.webp',totalPower:428000,pvePower:286000,pvpPower:142000}},remaining:3},
      vehicle:{reward:{type:'MYTHIC_VEHICLE',label:'신화 이동수단',dropRate:.025,item:{name:'아포칼립스 레이스',rarity:'MYTHIC',image:'../../assets/ui/escort/escort-armored-carrier-v1.webp',totalPower:615000,pvePower:360000,pvpPower:255000}},remaining:2},
      stars:{reward:{type:'MASTER_STAR',label:'마스터의 별',amount:100,dropRate:.1},remaining:5},
      coin:{reward:{type:'COIN',label:'100만 코인',amount:1000000,dropRate:.1},remaining:1}
    };
    return payloads[kind]||payloads.equipment;
  }

  function open(options={}){
    const modal=options.modal||document.getElementById('modal');
    if(!modal)throw new Error('블랙 미라클 개봉 모달을 찾을 수 없습니다.');
    if(activeOpening){activeOpening.stage?.focus({preventScroll:true});return activeOpening.controller}

    const invoker=document.activeElement,preview=options.preview===true,reducedMotion=options.reducedMotion===true||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches===true;
    const scrollLock={rootOverflow:document.documentElement.style.overflow,bodyOverflow:document.body.style.overflow,rootOverscroll:document.documentElement.style.overscrollBehavior,bodyOverscroll:document.body.style.overscrollBehavior};
    document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';
    document.documentElement.style.overscrollBehavior='none';document.body.style.overscrollBehavior='none';
    const dependencies={
      apiRequest:options.apiRequest,
      clearApiCache:options.clearApiCache,
      saveUser:options.saveUser,
      apiUserToLocal:options.apiUserToLocal,
      renderShell:options.renderShell
    };
    modal.className='modal show black-miracle-modal black-miracle-v1926';
    modal.innerHTML=shellMarkup(options.ownedQuantity||0);
    const stage=modal.querySelector('.black-miracle-experience'),body=stage.querySelector('.black-miracle-body'),heading=stage.querySelector('.black-miracle-heading'),status=stage.querySelector('.black-miracle-status'),closeButton=stage.querySelector('[data-black-miracle-close]');
    const state={phase:'intro',granted:false,reward:null,response:null,cardCount:BLACK_MIRACLE_CHOICE_COUNT,requestId:requestId(),stage,body,status,closeButton,preview,options};

    const setPhase=phase=>{state.phase=phase;stage.dataset.phase=phase;closeButton.disabled=!PHASES_WITH_SAFE_CLOSE.has(phase)};
    const announce=(title,detail)=>{status.className='black-miracle-status black-miracle-live';status.innerHTML=`<i></i><b>${escapeHtml(title)}</b><span>${escapeHtml(detail)}</span>`};
    const destroy=({navigate=false,force=false}={})=>{
      if(!force&&!PHASES_WITH_SAFE_CLOSE.has(state.phase))return false;
      document.removeEventListener('keydown',onKeyDown);
      window.removeEventListener('resize',onResize);
      document.documentElement.style.overflow=scrollLock.rootOverflow;document.body.style.overflow=scrollLock.bodyOverflow;
      document.documentElement.style.overscrollBehavior=scrollLock.rootOverscroll;document.body.style.overscrollBehavior=scrollLock.bodyOverscroll;
      modal.className='modal';modal.innerHTML='';
      if(activeOpening?.state===state)activeOpening=null;
      if(navigate&&!preview&&typeof dependencies.renderShell==='function')dependencies.renderShell('inventory');
      else if(invoker&&typeof invoker.focus==='function'&&document.contains(invoker))invoker.focus({preventScroll:true});
      return true;
    };
    const centerChoice=(choice,fan)=>{
      if(!choice||!fan)return;
      choice.style.setProperty('--selected-x',`${Math.round(fan.clientWidth/2-choice.offsetLeft-choice.offsetWidth/2)}px`);
      choice.style.setProperty('--selected-y',`${Math.round(fan.clientHeight/2-choice.offsetTop-choice.offsetHeight/2)}px`);
    };
    const onResize=()=>requestAnimationFrame(()=>centerChoice(stage.querySelector('.black-miracle-choice.is-selected'),stage.querySelector('.black-miracle-card-fan')));
    const onKeyDown=event=>{
      if(event.key==='Escape'){event.preventDefault();destroy({navigate:state.granted})}
      if(event.key==='Tab'){
        const focusable=[...stage.querySelectorAll('button:not([disabled])')].filter(element=>element.getClientRects().length);
        if(!focusable.length){event.preventDefault();stage.focus({preventScroll:true});return}
        const first=focusable[0],last=focusable.at(-1);
        if(event.shiftKey&&(document.activeElement===first||!stage.contains(document.activeElement))){event.preventDefault();last.focus({preventScroll:true})}
        else if(!event.shiftKey&&(document.activeElement===last||!stage.contains(document.activeElement))){event.preventDefault();first.focus({preventScroll:true})}
      }
      if(state.phase==='choice'&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        const choices=[...stage.querySelectorAll('[data-black-miracle-choice]')],current=Math.max(0,choices.indexOf(document.activeElement));let next=current;
        if(event.key==='ArrowLeft')next=(current-1+choices.length)%choices.length;
        if(event.key==='ArrowRight')next=(current+1)%choices.length;
        if(event.key==='Home')next=0;
        if(event.key==='End')next=choices.length-1;
        event.preventDefault();choices[next]?.focus({preventScroll:true});
      }
    };

    function renderChoices(){
      setPhase('choice');
      heading.querySelector('small').textContent='FATE ARRAY / REWARD SECURED';
      heading.querySelector('h2').textContent=`${state.cardCount}장의 봉인 중 하나를 선택하세요`;
      heading.querySelector('p').textContent='보상 판정은 안전하게 완료되었습니다. 선택한 봉인을 뒤집어 결과를 확인하세요.';
      body.innerHTML=choicesMarkup(state.cardCount);
      announce('보상 판정 완료','봉인 카드 한 장을 선택하세요.');
      const choices=[...stage.querySelectorAll('[data-black-miracle-choice]')],fan=stage.querySelector('.black-miracle-card-fan');
      choices.forEach(choice=>choice.onclick=()=>revealChoice(choice,choices,fan));
      requestAnimationFrame(()=>{stage.classList.add('choices-ready');choices[Math.floor(choices.length/2)]?.focus({preventScroll:true})});
    }

    async function revealChoice(choice,choices,fan){
      if(state.phase!=='choice')return;
      setPhase('revealing');
      choices.forEach(item=>{item.disabled=true;item.setAttribute('aria-pressed',String(item===choice));item.classList.toggle('is-selected',item===choice);item.classList.toggle('is-dismissed',item!==choice)});
      centerChoice(choice,fan);
      const front=choice.querySelector('.black-miracle-choice-front');front.innerHTML=rewardFaceMarkup(state.reward);front.removeAttribute('aria-hidden');
      announce('선택한 봉인 해제 중',`${Number(choice.dataset.blackMiracleChoice)+1}번 카드의 결과를 공개합니다.`);
      if(navigator.vibrate&&!preview&&!reducedMotion)navigator.vibrate([45,30,80]);
      await sleep(reducedMotion?20:180);choice.classList.add('is-centered');
      await sleep(reducedMotion?20:230);choice.classList.add('is-flipped');
      await sleep(reducedMotion?30:780);
      setPhase('revealed');stage.classList.add('result-revealed');
      heading.querySelector('small').textContent='JACKPOT RESULT / INVENTORY SECURED';
      heading.querySelector('h2').textContent='운명이 응답했습니다';
      heading.querySelector('p').textContent='획득 보상은 인벤토리에 안전하게 반영되었습니다.';
      status.className='black-miracle-status black-miracle-result-status black-miracle-live';status.innerHTML=resultStatusMarkup(state.reward);
      status.querySelector('[data-black-miracle-done]').onclick=()=>destroy({navigate:true});
      status.querySelector('[data-black-miracle-again]').onclick=()=>{
        const remaining=state.reward.remaining,nextOptions={...options,ownedQuantity:remaining};
        if(!destroy({force:true}))return;
        queueMicrotask(()=>open(nextOptions));
      };
      if(navigator.vibrate&&!preview&&!reducedMotion)navigator.vibrate([70,35,110,35,180]);
      status.querySelector('[data-black-miracle-done]')?.focus({preventScroll:true});
    }

    async function requestOpening(){
      if(!['intro','error'].includes(state.phase))return;
      if(typeof dependencies.apiRequest!=='function'){
        announce('개봉 모듈 연결 오류','보상 요청 함수를 찾을 수 없습니다.');setPhase('error');return;
      }
      setPhase('processing');stage.classList.remove('opening-error');
      const openButton=stage.querySelector('[data-black-miracle-open]');if(openButton){openButton.disabled=true;openButton.textContent='운명의 봉인 해제 중'}
      announce('서버 보상 판정 중','팩 차감과 보상을 하나의 영수증으로 확정하고 있습니다.');
      try{
        const minimumMotion=sleep(reducedMotion?40:920);
        const response=await dependencies.apiRequest('inventory/use',{method:'POST',body:JSON.stringify({itemCode:'BLACK_MIRACLE_PACK',requestId:state.requestId})});
        await minimumMotion;
        state.response=response;state.reward=normalizeReward(response);state.granted=true;
        state.cardCount=Math.max(3,Math.min(7,Math.trunc(Number(response?.presentation?.cardCount??response?.cardCount)||BLACK_MIRACLE_CHOICE_COUNT)));
        if(typeof dependencies.clearApiCache==='function'){dependencies.clearApiCache('inventory');dependencies.clearApiCache('shell/summary')}
        if(response.user&&typeof dependencies.saveUser==='function'&&typeof dependencies.apiUserToLocal==='function')dependencies.saveUser(dependencies.apiUserToLocal(response.user));
        await preloadRewardImage(state.reward,reducedMotion);
        renderChoices();
      }catch(error){
        if(Number(error?.status)>=400&&Number(error?.status)<500)state.requestId=requestId();
        setPhase('error');stage.classList.add('opening-error');
        const retry=stage.querySelector('[data-black-miracle-open]');if(retry){retry.disabled=false;retry.textContent='다시 개봉 시도'}
        announce('봉인 해제 중단',error?.message||'보상 결과를 확인하지 못했습니다. 다시 시도해주세요.');
      }
    }

    closeButton.onclick=()=>destroy({navigate:state.granted});
    stage.querySelector('[data-black-miracle-open]').onclick=requestOpening;
    document.addEventListener('keydown',onKeyDown);
    window.addEventListener('resize',onResize,{passive:true});
    requestAnimationFrame(()=>{stage.classList.add('ready');stage.focus({preventScroll:true})});

    const controller=Object.freeze({
      close:force=>destroy({navigate:state.granted,force:Boolean(force)}),
      get phase(){return state.phase},
      get granted(){return state.granted}
    });
    activeOpening={state,stage,controller,destroy};
    return controller;
  }

  function preview(kind='equipment',options={}){
    if(activeOpening)activeOpening.destroy({force:true});
    let modal=options.modal||document.getElementById('modal');
    if(!modal){modal=document.createElement('div');modal.id='modal';modal.className='modal';document.body.append(modal)}
    const payload=typeof kind==='object'?kind:previewPayload(kind);
    return open({...options,modal,preview:true,ownedQuantity:Number(options.ownedQuantity||4),apiRequest:async()=>{await sleep(Number(options.delayMs??420));return JSON.parse(JSON.stringify(payload))},clearApiCache:()=>{},saveUser:()=>{},apiUserToLocal:user=>user,renderShell:()=>{}});
  }

  window.BlackMiracleOpeningV1926=Object.freeze({open,preview,choiceCount:BLACK_MIRACLE_CHOICE_COUNT});
})();
