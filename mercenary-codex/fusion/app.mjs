import { escapeHtml as esc, asset, thumb, FRAME } from '../model.mjs?v=2098&art=20260915';
import { MATERIAL_COUNT, RANKS, TIMING, nextRank, materialRows, addMaterial, autoMaterials, demoMaterials, demoResult, phaseAt, validateMaterials } from './model.mjs?v=20260925-on';
import {createFusionClient,fusionToken} from './client.mjs?v=20260925-on';
import {jointAccountRequest as api} from '../../js/joint-account-transport.mjs';
import { FusionFX } from './fx.mjs?v=20260925-loading';
import { withMercenaryDeadline } from '../../shared/mercenary-loading-v1.mjs?v=20260925';

let vendorPromise,vendorAttempt=0;
function loadVendor() {
  if (globalThis.CNineUiFxVendor?.pixi && globalThis.CNineUiFxVendor?.gsap) return Promise.resolve();
  if (vendorPromise) return vendorPromise;
  const script = document.createElement('script'); script.src = '/js/ui-fx-vendor-v2045.bundle.js?v=2045'+(vendorAttempt?'&fusionRetry='+vendorAttempt:'');
  vendorPromise = withMercenaryDeadline(() => new Promise((resolve, reject) => {
    script.onload = () => globalThis.CNineUiFxVendor?.pixi && globalThis.CNineUiFxVendor?.gsap ? resolve() : reject(Error('연출 엔진을 확인하지 못했습니다. 다시 시도해 주세요.'));
    script.onerror = () => reject(Error('연출 엔진을 불러오지 못했습니다. 다시 시도해 주세요.'));
    document.head.append(script);
  })).catch(error => { vendorPromise = null; vendorAttempt++; script.remove(); throw error; })
    .finally(() => { script.onload = null; script.onerror = null; });
  return vendorPromise;
}
function loadStyles() {
  if (document.getElementById('mercenaryFusionStyles')) return;
  const link = document.createElement('link'); link.id = 'mercenaryFusionStyles'; link.rel = 'stylesheet';
  link.href = '/mercenary-codex/fusion/style.css?v=20260925-on'; document.head.append(link);
}

const html = `<header class="fusion-head"><div class="fusion-head-main"><span class="fusion-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="8" y="5" width="12" height="16" rx="1.5"/><path d="M5 18H4V2h12v1M11 10h6m-6 4h6m-6 4h3"/></svg></span><div><p class="fusion-kicker">용병도감<span>/</span>카드 합성</p><h2 id="fusionTitle">용병 중복 합성</h2></div></div><div class="fusion-head-actions"><span class="fusion-status-tag" data-live-status><i></i>상태 확인 중</span><button type="button" data-action="sound" aria-pressed="false">소리 켜기</button><button type="button" data-action="close" class="fusion-close" aria-label="중복 합성 닫기">×</button></div></header>
<div class="fusion-body"><div class="fusion-main"><section class="fusion-stage" aria-label="용병 합성 연출"><div class="fusion-renderer"></div><div class="fusion-stage-top"><span>계약의 성소</span><small>VIII MEMORIES · ONE COVENANT</small></div><div class="fusion-stage-message"><p data-stage-title>봉인 너머, 새로운 운명이 기다립니다</p><small data-stage-subtitle>중복 카드 8장으로 완성하는 하나의 계약</small></div><div class="fusion-stage-vignette"></div><div class="fusion-result"><div class="fusion-result-rank"></div><h3></h3><p></p><small>연출 시연 결과 · 실제 지급 없음</small></div><div class="fusion-loading" role="status">성소를 불러오고 있습니다…</div><div class="fusion-playback" hidden><button type="button" data-action="pause" aria-label="연출 일시정지">일시정지</button><button type="button" data-action="replay" aria-label="연출 처음부터 다시 재생">처음부터</button><input class="fusion-scrub" type="range" min="0" max="8.4" step="0.05" value="0" aria-label="합성 연출 시간 탐색"></div></section>
<section class="fusion-tray" aria-label="합성 재료 8개 슬롯"><div class="fusion-tray-head"><div><b>합성 재료</b><em><span data-selected-count>0</span><small> / 8</small></em></div><button type="button" data-action="clear">선택 해제 ↺</button></div><div class="fusion-slots"></div><p class="fusion-tray-note">기본 보유 1장은 보존하며, 중복 카드만 재료로 선택합니다.</p></section></div>
<aside class="fusion-pool" aria-label="합성 재료 선택"><header class="fusion-pool-heading"><h3>중복 카드 선택</h3><span>같은 등급 8장</span></header><div class="fusion-mode-tabs" role="group" aria-label="합성 재료 목록"><button type="button" data-action="owned" aria-pressed="true">내 중복 카드</button><button type="button" data-action="demo" aria-pressed="false">연출 시연</button></div><div class="fusion-filter"><label><span class="sr-only">재료 등급</span><select data-material-rank aria-label="재료 등급"></select></label><button type="button" data-action="auto">8장 자동 선택</button></div><p class="fusion-pool-note"></p><div class="fusion-materials"></div><section class="fusion-policy" aria-label="합성 정보"><div class="fusion-rate-summary"><span>승급 성공률</span><strong>10<small>%</small></strong></div><div class="fusion-rate-bar" aria-hidden="true"><i></i></div><dl><div><dt>성공 10%</dt><dd>한 단계 상위 등급 랜덤 1장</dd></div><div><dt>실패 90%</dt><dd>재료와 같은 등급 랜덤 1장</dd></div><div><dt>추가 비용</dt><dd><b>없음</b></dd></div></dl></section></aside></div>
<p class="fusion-error" role="status" aria-live="polite" hidden></p><footer class="fusion-controls"><div class="fusion-controls-note"><b>연출 시연 · 카드 소모 없음</b><p>같은 등급 중복 8장 · 기본 보유 1장 보존</p></div><button type="button" data-action="recover" class="fusion-recover" hidden>이전 결과 확인</button><button type="button" data-action="refresh-owned" class="fusion-recover" hidden>보유 새로고침</button><button type="button" data-action="play" class="fusion-play" disabled>8장 합성 연출 보기</button></footer>`;

export async function openFusion({ catalog, account, onClose, onAccount, preview=false } = {}) {
  if (document.querySelector('.fusion-dialog')) return;
  loadStyles();
  const opener = document.activeElement, previousOverflow = document.body.style.overflow;
  const dialog = document.createElement('dialog'); dialog.className = 'fusion-dialog';
  dialog.setAttribute('aria-labelledby', 'fusionTitle'); dialog.innerHTML = html; document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector), controller = new AbortController(), signal = controller.signal;
  let mode = preview ? 'demo' : 'owned', selection = [], sampleCards = [], loaded = false, busy = false, closed = false, played = false, refreshId = 0, outcome = 'success';
  let rows = materialRows(catalog, account),feature=null,transactionBusy=false,accountReady=false,receipt=null,receiptCards=[],stateFlight=null,liveFlight=null;
  let client=null;try{if(account?.accountId)client=createFusionClient({accountId:account.accountId,signal});}catch{}
  const auth=fusionToken();
  const pending=()=>{try{return client?.pending()||null;}catch(e){error(e.message);return {invalid:true};}};
  let rank = rows.find(c => c.rank === 'SS')?.rank || rows[0]?.rank || 'SS';
  let resultRank = nextRank(rank);
  const stage = $('.fusion-stage'), result = $('.fusion-result'), loading = $('.fusion-loading');
  const retry = document.createElement('button'); retry.type = 'button'; retry.dataset.action = 'retry'; retry.textContent = '다시 불러오기'; retry.hidden = true;
  $('.fusion-error').after(retry);
  const error = (message,retryable=false) => { const el = $('.fusion-error'); el.textContent = message || ''; el.hidden = !message; retry.hidden = !message || !retryable; };
  const chosenCards = () => receipt ? receiptCards : mode === 'demo' ? sampleCards : selection.map(code => rows.find(c => c.code === code)).filter(Boolean);
  const currentResult = () => receipt ? {...catalog.cards.find(c=>c.code===receipt.result.mercenaryCode),...receipt.result,code:receipt.result.mercenaryCode,rank:receipt.result.resultRank} : mode==='demo' ? demoResult(catalog, outcome === 'success' ? resultRank : rank) : null;
  let fx = new FusionFX($('.fusion-renderer'), {
    progress(time) {
      const title = outcome === 'failure' && time >= TIMING.impact ? time < TIMING.reveal ? '봉인의 힘이 잦아듭니다' : '계약이 다시 맺어집니다' : phaseAt(time);
      if ($('[data-stage-title]').textContent !== title) $('[data-stage-title]').textContent = title;
      result.classList.toggle('is-visible', time >= TIMING.reveal + .65); result.setAttribute('aria-hidden', String(time < TIMING.reveal + .65));
      stage.classList.toggle('has-result',time >= TIMING.reveal + .65);
      $('.fusion-scrub').value = String(time);
      const pause = $('[data-action="pause"]'); pause.textContent = fx.paused ? '계속' : '일시정지';
      pause.setAttribute('aria-label', fx.paused ? '연출 계속 재생' : '연출 일시정지'); pause.disabled = time >= TIMING.end;
    },
    complete() { if (closed) return; busy = false; stage.classList.remove('is-playing'); stage.classList.add('has-result'); dialog.classList.remove('is-cinematic'); updateControls(); result.classList.add('is-visible'); result.setAttribute('aria-hidden','false'); },
  });
  function updateControls() {
    const p=pending(),live=mode==='owned',locked=busy||transactionBusy;
    const button=$('[data-action="play"]');
    button.disabled=locked||(live?receipt?!accountReady:!loaded||!accountReady||feature?.enabled!==true||Boolean(p)||!validateMaterials(selection,rows).ok:!loaded||chosenCards().length!==MATERIAL_COUNT||!currentResult());
    button.textContent=transactionBusy?'합성 결과 확인 중…':busy?'계약이 깨어나는 중…':live?receipt?'다음 합성 준비':feature?.enabled===false?'합성 운영 중지':'중복 8장 합성':played?'합성 연출 다시 보기':'8장 합성 연출 보기';
    $('[data-action="recover"]').hidden=!p||Boolean(receipt);$('[data-action="recover"]').disabled=locked||p?.invalid;
    $('[data-action="refresh-owned"]').hidden=!live||!client||(accountReady&&feature!==null);$('[data-action="refresh-owned"]').disabled=locked||Boolean(stateFlight||liveFlight);
    $('[data-action="refresh-owned"]').textContent=accountReady?'상태 다시 확인':'보유 새로고침';
    $('[data-live-status]').textContent=feature?feature.enabled?'합성 ON':'합성 OFF':'상태 확인 필요';
    $('.fusion-controls-note b').textContent=live?receipt?'합성 완료 · 결과 용병 1장 지급':p?'이전 합성 결과 확인 필요':'선택한 중복 카드 8장 소모 · 추가 비용 없음':'연출 시연 · 카드 소모 없음';
    for (const b of dialog.querySelectorAll('[data-action="owned"],[data-action="demo"],[data-action="auto"],[data-action="clear"],[data-material],[data-slot]')) b.disabled=locked||Boolean(p&&!receipt);
    $('[data-material-rank]').disabled=locked||Boolean(p&&!receipt);
    const rr=$('[data-result-rank]');if(rr)rr.disabled=locked;
    const ro=$('[data-outcome]');if(ro)ro.disabled=locked;
  }
  function renderTray() {
    const cards = chosenCards(); $('[data-selected-count]').textContent = String(cards.length);
    $('.fusion-slots').innerHTML = Array.from({ length: MATERIAL_COUNT }, (_, i) => {
      const c = cards[i]; return `<button type="button" class="fusion-slot ${c ? 'is-filled' : ''}" data-slot="${i}" aria-label="${i + 1}번 합성 재료${c ? ' ' + esc(c.name) + ' 제거' : ' 비어 있음'}">${c ? `<img class="slot-art" src="${thumb(c.code)}" alt=""><img class="slot-frame" src="${FRAME}" alt=""><span class="slot-number">${String(i + 1).padStart(2, '0')}</span><span class="slot-name">${esc(c.name)}</span>` : `<span class="empty">${String(i + 1).padStart(2, '0')}</span>`}</button>`;
    }).join('');
    $('.fusion-tray-note').textContent = mode === 'demo' ? '시연용 카드 8장 · 보유 수량과 무관하며 실제 소모되지 않습니다.' : '기본 보유 1장은 보존하며, 중복 카드만 재료로 선택합니다.';
    updateControls();
  }
  function renderPool() {
    $('[data-action="owned"]').setAttribute('aria-pressed', String(mode === 'owned'));
    $('[data-action="demo"]').setAttribute('aria-pressed', String(mode === 'demo'));
    const options = mode === 'demo' ? RANKS.filter(r => nextRank(r) && catalog?.cards.some(c => c.rank === r && !c.artOnly)) : RANKS.filter(nextRank);
    $('[data-material-rank]').innerHTML = options.map(r => `<option value="${r}"${rank === r ? ' selected' : ''}>${r} 등급${mode === 'owned' ? ' · 중복 ' + rows.filter(c => c.rank === r).reduce((n, c) => n + c.duplicates, 0) + '장' : ' 시연 재료'}</option>`).join('');
    if (!options.includes(rank)) rank = options[0] || 'SS';
    $('[data-material-rank]').value = rank;
    const pool = mode === 'owned' ? rows.filter(c => c.rank === rank) : (catalog?.cards || []).filter(c => c.rank === rank && !c.artOnly);
    $('.fusion-pool-note').textContent = mode === 'demo' ? '시연 카드 8장입니다. 원하는 등급과 결과를 골라 연출을 확인하세요.' : account ? '같은 등급이면 서로 다른 용병도 섞을 수 있습니다.' : '로그인 후 내 중복 카드를 확인할 수 있습니다. 연출 시연은 바로 이용할 수 있습니다.';
    $('.fusion-materials').innerHTML = pool.length ? pool.map(c => {
      const count = mode === 'demo' ? sampleCards.filter(x => x.code === c.code).length : selection.filter(x => x === c.code).length;
      return `<button type="button" class="fusion-material ${count ? 'is-selected' : ''}" data-material="${c.code}" aria-label="${esc(c.name)} ${mode === 'demo' ? '시연 카드 추가' : '중복 ' + c.duplicates + '장 중 선택 ' + count + '장, 재료 추가'}"><span class="fusion-material-art"><img src="${thumb(c.code)}" alt="" loading="lazy"><img src="${FRAME}" alt=""><span class="fusion-material-rank rank-chip" data-rank="${c.rank}">${c.rank}</span><span class="fusion-material-count">${mode === 'demo' ? count ? '선택 ' + count : '시연' : count + ' / ' + c.duplicates}</span></span><span class="fusion-material-name">${esc(c.name)}</span>${mode === 'demo' ? '<span class="fusion-demo-marker">시연 카드</span>' : ''}</button>`;
    }).join('') : `<p class="fusion-empty">${account ? '이 등급에 합성할 중복 카드가 없습니다.' : '보유 중복 카드를 불러오지 못했습니다.'}<br>연출 시연에서 8장 합성을 미리 보세요.</p>`;
    const existing = $('.fusion-result-choice'); existing?.remove(); $('.fusion-outcome-choice')?.remove();
    const choice = document.createElement('label'); choice.className = 'fusion-filter fusion-result-choice';
    choice.innerHTML = `<span>시연 등급</span><select data-result-rank aria-label="승급 도전 등급">${['S','SS','SSS'].filter(r => demoResult(catalog, r)).map(r => `<option value="${r}"${r === resultRank ? ' selected' : ''}>${r} · ${r === 'SSS' ? '천공 강림' : r === 'SS' ? '성소 개방' : '금빛 각성'}</option>`).join('')}</select>`;
    if (mode === 'demo') $('.fusion-policy').before(choice);
    const outcomes = document.createElement('label'); outcomes.className = 'fusion-filter fusion-outcome-choice';
    outcomes.innerHTML = `<span>시연 결과</span><select data-outcome aria-label="시연 결과 종류"><option value="success"${outcome === 'success' ? ' selected' : ''}>승급 성공 · 10%</option><option value="failure"${outcome === 'failure' ? ' selected' : ''}>동일 등급 · 90%</option></select>`;
    if(mode==='demo')$('.fusion-policy').before(outcomes);
    updateControls();
  }
  async function syncScene() {
    if (!fx.ready || closed) return;
    const generation = ++refreshId; loaded = false; busy = false; played = false; fx.reset();
    dialog.classList.remove('is-cinematic'); stage.classList.remove('is-playing','has-result'); result.classList.remove('is-visible'); result.setAttribute('aria-hidden','true');
    $('.fusion-playback').hidden = true; loading.hidden = false; error(''); updateControls();
    $('[data-stage-title]').textContent = '봉인 너머, 새로운 운명이 기다립니다';
    $('[data-stage-subtitle]').textContent = '중복 카드 8장으로 완성하는 하나의 계약';
    try {
      const card = currentResult();
      await fx.setCards(chosenCards(), card, {promoted:outcome === 'success'});
      if (closed || generation !== refreshId) return;
      $('.fusion-result-rank').textContent = (card?.rank || '') + (outcome === 'failure' ? ' · 동일 등급' : '');
      result.classList.toggle('is-same-rank',outcome === 'failure');
      $('.fusion-result h3').textContent = card?.name || '';
      $('.fusion-result p').textContent = card?.title || '';
      $('.fusion-result small').textContent=receipt?'지급 완료 · '+(receipt.result.isDuplicate?'중복 수량 +1':'새 용병 획득'):'연출 시연 결과 · 실제 지급 없음';
      loaded = true; loading.hidden = true; updateControls();
      return true;
    } catch { if (closed || generation !== refreshId) return; loading.hidden = true; error('카드 원화를 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.',true); }
  }
  function acknowledge(){if(receipt){client?.acknowledge(receipt.requestId);receipt=null;receiptCards=[];}}
  function selectionChanged() { acknowledge();renderPool(); renderTray(); void syncScene(); }
  function play() {
    if (!loaded || busy || chosenCards().length !== MATERIAL_COUNT) return;
    error(''); busy = true; played = true; result.classList.remove('is-visible');
    dialog.classList.add('is-cinematic'); stage.classList.add('is-playing');
    $('[data-stage-subtitle]').textContent = receipt?'서버 확정 결과 · 용병 1장 지급 완료':'연출 시연 · 카드 소모 없음';
    $('.fusion-playback').hidden = fx.reduced; $('.fusion-scrub').value = '0'; updateControls();
    $('.fusion-body').scrollTo({top:0,behavior:'instant'});
    if (!fx.play()) { busy = false; dialog.classList.remove('is-cinematic'); stage.classList.remove('is-playing'); error('연출을 준비하고 있습니다. 잠시 후 다시 시도하세요.'); updateControls(); }
  }
  function showPlainResult(){
    const card=currentResult();if(!card)return;
    $('.fusion-result-rank').textContent=card.rank+(outcome==='failure'?' · 동일 등급':' · 승급 성공');
    $('.fusion-result h3').textContent=card.name;$('.fusion-result p').textContent=card.title||'';
    $('.fusion-result small').textContent='지급 완료 · '+(receipt.result.isDuplicate?'중복 수량 +1':'새 용병 획득');
    loading.hidden=true;busy=false;stage.classList.remove('is-playing');stage.classList.add('has-result');
    dialog.classList.remove('is-cinematic');result.classList.add('is-visible');result.setAttribute('aria-hidden','false');
    updateControls();
  }
  async function showReceipt(animate){
    mode='owned';outcome=receipt.result.promoted?'success':'failure';rank=receipt.result.inputRank;resultRank=receipt.result.resultRank;
    receiptCards=receipt.consumed.flatMap(m=>Array.from({length:m.quantity},()=>({...catalog.cards.find(c=>c.code===m.code),code:m.code,rank})));
    selection=[];renderPool();renderTray();
    const ready=await syncScene();if(closed)return;
    if(ready&&animate){play();return;}
    if(ready){fx.clock.time=TIMING.end;fx.render();}
    showPlainResult();
  }
  function refreshOwned(){
    if(!client)return Promise.resolve();if(stateFlight)return stateFlight;
    accountReady=false;
    stateFlight=client.state().then(value=>{if(closed)return;account=value;rows=materialRows(catalog,account);accountReady=true;onAccount?.(account);renderPool();renderTray();})
      .catch(e=>{if(!closed)error(e.message||'보유 용병을 다시 확인해 주세요.');})
      .finally(()=>{stateFlight=null;if(!closed)updateControls();});
    updateControls();return stateFlight;
  }
  function loadLive(){
    if(liveFlight)return liveFlight;
    const featureLoad=withMercenaryDeadline(api('mercenaries/v3/fusion/feature',{signal,timeoutMs:12000}),{signal})
      .then(value=>{if(!closed){if(typeof value?.enabled!=='boolean')throw Error('합성 상태를 확인하지 못했습니다.');feature=value;}})
      .catch(e=>{if(!closed){feature=null;error(e.message||'합성 상태를 다시 확인해 주세요.');}});
    liveFlight=Promise.all([featureLoad,refreshOwned()]).finally(()=>{liveFlight=null;if(!closed)updateControls();});return liveFlight;
  }
  async function runTransaction(recover=false,submit=true){
    if(transactionBusy||busy||!client||closed)return;
    if(!recover&&(!accountReady||feature?.enabled!==true||!validateMaterials(selection,rows).ok))return;
    transactionBusy=true;error('');loading.hidden=false;loading.textContent='합성 결과를 확인하고 있습니다…';updateControls();
    try{
      const value=await client.run(recover?undefined:selection,{submit});if(closed)return;
      if(value?.status!=='COMPLETED'){error('아직 완료되지 않은 합성 요청입니다. 이전 결과 확인을 눌러 같은 요청을 이어서 처리하세요.');return;}
      receipt=value;
      void refreshOwned();
      await showReceipt(!recover);
    }catch(e){if(!closed){error(e.message||'연결을 확인하고 이전 결과 확인을 눌러 주세요.');if(!pending())void refreshOwned();}}
    finally{if(!closed){transactionBusy=false;loading.hidden=true;loading.textContent='성소를 불러오고 있습니다…';updateControls();}}
  }
  function close() {
    if (closed) return;if(receipt&&result.classList.contains('is-visible')){try{client?.acknowledge(receipt.requestId);}catch{}} closed = true; refreshId++; controller.abort(); fx.destroy();
    dialog.close(); dialog.remove(); document.body.style.overflow = previousOverflow;
    opener?.isConnected && opener.focus(); onClose?.();
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal });
  dialog.addEventListener('click', async event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.action === 'close') { close(); return; }
    if (b.dataset.action === 'recover') {void runTransaction(true);return;}
    if (b.dataset.action === 'refresh-owned') {void loadLive();return;}
    if (b.dataset.action === 'retry') {if(transactionBusy)return;if(receipt){void showReceipt(false);return;}if (fx.ready && !fx.destroyed) void syncScene(); else void initialize(); return; }
    if (b.dataset.action === 'sound') {
      b.disabled = true; const enabled = await fx.sound.enable(!fx.sound.enabled);
      if (closed) return; b.disabled = false; b.setAttribute('aria-pressed', String(enabled)); b.textContent = enabled ? '소리 끄기' : '소리 켜기';
      if (enabled && fx.active) fx.sound.schedule(fx.getClock()); return;
    }
    if (b.dataset.action === 'pause') { fx.pause(); return; }
    if (b.dataset.action === 'replay') {if(transactionBusy)return;busy = false; play(); return; }
    if (busy||transactionBusy) return;
    if (b.dataset.action === 'play') {if(mode==='demo')play();else if(receipt){selection=[];selectionChanged();}else void runTransaction();return;}
    if(pending()&&!receipt)return;
    if (b.dataset.action === 'owned' || b.dataset.action === 'demo') {
      mode = b.dataset.action; selection = []; sampleCards = [];
      if (mode === 'demo') sampleCards = demoMaterials(catalog, rank);
      selectionChanged(); return;
    }
    if (b.dataset.action === 'auto') {
      if (mode === 'demo') sampleCards = demoMaterials(catalog, rank); else selection = autoMaterials(rows, rank);
      selectionChanged(); if (chosenCards().length < MATERIAL_COUNT) error('이 등급의 중복 카드가 8장보다 적습니다. 연출 시연은 재료 소모 없이 이용할 수 있습니다.'); return;
    }
    if (b.dataset.action === 'clear') { selection = []; sampleCards = []; selectionChanged(); return; }
    if (b.hasAttribute('data-slot')) {
      const index = Number(b.dataset.slot); mode === 'demo' ? sampleCards.splice(index, 1) : selection.splice(index, 1); selectionChanged(); return;
    }
    if (b.dataset.material) {
      if (mode === 'demo') {
        if (sampleCards.length >= MATERIAL_COUNT) { error('8장이 모두 선택되어 있습니다. 슬롯을 눌러 재료를 빼세요.'); return; }
        const card = catalog.cards.find(c => c.code === b.dataset.material && c.rank === rank && !c.artOnly);
        if (card) sampleCards.push(card);
      } else {
        const next = addMaterial(selection, b.dataset.material, rows);
        if (!next.ok) { error(next.message); return; } selection = next.selection;
      }
      selectionChanged();
    }
  }, { signal });
  dialog.addEventListener('change', event => {
    if (busy||transactionBusy||pending()&&!receipt) return;
    if (event.target.hasAttribute('data-material-rank')) { rank = event.target.value; resultRank = nextRank(rank); selection = []; sampleCards = mode === 'demo' ? demoMaterials(catalog, rank) : []; selectionChanged(); }
    if (event.target.hasAttribute('data-result-rank')) { resultRank = event.target.value; rank = RANKS[RANKS.indexOf(resultRank) - 1]; sampleCards = demoMaterials(catalog, rank); selectionChanged(); }
    if (event.target.hasAttribute('data-outcome')) { outcome = event.target.value; void syncScene(); }
  }, { signal });
  $('.fusion-scrub').addEventListener('input', event => { fx.seek(Number(event.target.value)); busy = false; dialog.classList.remove('is-cinematic'); updateControls(); }, { signal });
  document.addEventListener('visibilitychange', () => fx.setVisible(!document.hidden), { signal });
  window.addEventListener('pagehide', close, { signal });
  window.addEventListener('storage',event=>{if(fusionToken()!==auth){close();return;}if(event.key===client?.key)updateControls();},{signal});
  window.addEventListener('focus',()=>{if(fusionToken()!==auth)close();},{signal});
  document.body.style.overflow = 'hidden'; dialog.showModal();
  if(mode==='demo')sampleCards=demoMaterials(catalog,rank);
  renderPool(); renderTray();
  let initializing = false;
  async function initialize() {
    if (initializing || closed) return;
    initializing = true; loading.hidden = false; error('');
    if (fx.destroyed) fx = new FusionFX($('.fusion-renderer'),fx.callbacks);
    try {
      await withMercenaryDeadline(loadVendor(),{signal}); if (closed) return;
      await fx.init(); if (closed) return;
      await syncScene();
    } catch (e) { if (!closed) { fx.destroy(); loading.hidden = true; error(e.name === 'TimeoutError' ? e.message : '연출을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.',true); } }
    finally { initializing = false; }
  }
  await Promise.all([initialize(),loadLive()]);
  if(!closed&&pending()&&!pending().invalid)await runTransaction(true,false);
}
