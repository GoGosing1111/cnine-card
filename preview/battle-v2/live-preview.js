(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const modal=$('#battleV2PreviewModal'),consoleBox=$('.live-preview-console'),status=$('#magicPreviewStatus'),cards=$('#magicPreviewCards'),mode=$('#magicPreviewMode'),replay=$('#magicPreviewReplay'),reroll=$('#magicPreviewReroll');
  const labels={OPENING_ATTACK:'선봉 공격',GUARD_BARRIER:'수호 결계',LIFE_AMPLIFY:'생명 증폭',CRISIS_HEAL:'위기 회복',PUNISH_TRAP:'응징 함정',ARCANE_COUNTER:'비전 반격',FOLLOWUP_HASTE:'연계 가속',ARCANE_SEAL:'마법 봉인',DOOM_MARK:'파멸 낙인',SHIELD_SIPHON:'보호막 강탈',TIME_DISTORTION:'시간 왜곡',PHOENIX_REVIVE:'불사조 부활',PURIFY_LIGHT:'성광 정화',CHAIN_ECHO:'연쇄 잔영'};
  let payload=null,runId=0,busy=false,lastSeed=Date.now();
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const asset=value=>{const raw=String(value||'').trim().replaceAll('\\','/');return /^(?:https?:|data:|blob:)/i.test(raw)?raw:`/${raw.replace(/^\/+/, '')}`};
  const token=()=>localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||localStorage.getItem('cnine_admin_token')||sessionStorage.getItem('cnine_admin_token')||'';
  const setBusy=value=>{busy=value;replay.disabled=value;reroll.disabled=value;mode.disabled=value};
  const setStatus=(text,type='')=>{status.textContent=text;status.className=`live-preview-status${type?` is-${type}`:''}`};
  const allMagic=data=>data?.magicPreview?.mode==='EXAMPLES'&&Array.isArray(data?.magicPreview?.registeredExamples)&&data.magicPreview.registeredExamples.length
    ? data.magicPreview.registeredExamples
    : [...(data?.magicPreview?.teamA||[]),...(data?.magicPreview?.teamB||[])];
  function renderMagic(data){
    const list=allMagic(data);cards.innerHTML=list.map((card,index)=>`<button type="button" class="live-preview-magic-card" data-magic-effect-index="${index}" title="${esc(card.name)} · ${esc(labels[card.effectType]||card.effectType)} 발동 이펙트 보기"><img src="${esc(asset(card.imageUrl))}" alt="${esc(card.name)}"><span>${esc(labels[card.effectType]||card.effectType)}</span>${card.registered===false?'':`<em title="CMS 등록됨"></em>`}</button>`).join('');
  }
  function resultText(data){
    const result=data?.result||{},winner=result.winner==='A'?'승리':result.winner==='B'?'패배':'무승부',magicCount=(result.timeline||[]).filter(event=>event.type==='MAGIC_CARD').length;
    return `<strong>${winner}</strong><span>${Number(result.actions||0).toLocaleString()}회 행동 · 마법카드 ${magicCount}회 발동 · 실전 V2 렌더러</span>`;
  }
  async function fetchBattle(seed){
    const auth=token();if(!auth)throw new Error('OWNER 로그인이 필요합니다. 메인 또는 CMS에 로그인한 뒤 다시 열어주세요.');
    const response=await fetch(`/api/battle-v2/preview?seed=${encodeURIComponent(seed)}&magicMode=${encodeURIComponent(mode.value)}`,{headers:{authorization:`Bearer ${auth}`},cache:'no-store'});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`전투 데이터 요청 실패 (${response.status})`);return data;
  }
  async function play(data){
    const current=++runId;modal.__battleV2Renderer?.destroy?.();modal.innerHTML='';
    window.loadUser=()=>({nickname:String(data?.player?.nickname||'OWNER')});
    const view=window.prepareBattleV2LiveLoading({modal,mode:'PVP',playerName:data.player?.nickname||'OWNER',opponentName:data.opponent?.nickname||'OPPONENT',autoText:'실전 마법카드 V2 전투 계산 완료'});
    modal.classList.add('battle-v2-preview-host');
    const liveData={battleV2:{teams:data.teams,result:data.result},opponent:data.opponent};
    await window.playPvpBattleV2Live({...view,modal,data:liveData});
    if(current!==runId)return;
    view.msg.innerHTML=resultText(data);view.msg.classList.add('is-visible');
  }
  async function calculate(seed=Date.now()){
    if(busy)return;setBusy(true);setStatus('실제 전투 덱과 마법카드를 계산하고 있습니다.');
    try{lastSeed=seed;payload=await fetchBattle(seed);renderMagic(payload);setStatus(`${payload.magicPreview?.mode==='LOADOUT'?'내 장착 덱':'CMS 예시 14종'} · ${allMagic(payload).length}장 · 서버 계산 완료`,'ok');await play(payload)}
    catch(error){console.error(error);setStatus(String(error.message||error),'error');modal.innerHTML=''}
    finally{setBusy(false)}
  }
  replay.addEventListener('click',async()=>{if(!payload||busy)return;setBusy(true);setStatus('같은 결과를 실전 렌더러로 다시 재생합니다.');try{await play(payload);setStatus('같은 전투 재생 완료','ok')}catch(error){setStatus(String(error.message||error),'error')}finally{setBusy(false)}});
  cards.addEventListener('click',async event=>{const button=event.target.closest('[data-magic-effect-index]');if(!button||busy||!payload)return;const card=allMagic(payload)[Number(button.dataset.magicEffectIndex)],renderer=modal.__battleV2Renderer;if(!card||!renderer?.previewMagicEffect)return;setBusy(true);button.classList.add('is-playing');setStatus(`${card.name} · 이전 발동 이펙트 리소스 재생 중`);try{await renderer.previewMagicEffect(card);setStatus(`${card.name} · 실전 V2 발동 이펙트 확인 완료`,'ok')}catch(error){setStatus(String(error.message||error),'error')}finally{button.classList.remove('is-playing');setBusy(false)}});
  reroll.addEventListener('click',()=>calculate(Date.now()));mode.addEventListener('change',()=>calculate(Date.now()));
  $('.live-preview-console-toggle').addEventListener('click',event=>{const collapsed=consoleBox.classList.toggle('is-collapsed');event.currentTarget.setAttribute('aria-expanded',String(!collapsed))});
  calculate(lastSeed);
})();
