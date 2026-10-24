import {ULTIMATE_BULK,ultimateBulkCost,ultimateBulkKey,ultimateBulkRequestId,validateUltimateBulkReceipt} from '../shared/ultimate-pack-bulk-v1.mjs';
import {SUPERSTAR_BULK,superstarBulkCost,superstarBulkKey,superstarBulkRequestId,validateSuperstarBulkReceipt} from '../shared/superstar-pack-bulk-v1.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Number(value||0).toLocaleString('ko-KR');
const featured=grade=>['SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH','SUPERSTAR','ICON'].includes(grade);
let active=null;
export const mountSuperstarBulk=options=>mountUltimateBulk({...options,mode:'superstar',initialCount:options.initialCount||1000});
export async function mountUltimateBulk({pack,accountId,getAccountId,api,accept,onClose,storage=localStorage,initialCount=100000,mode='ultimate'}){
  if(active)return active;
  const superstar=mode==='superstar',name=superstar?'슈퍼스타팩':'얼티메이트팩',unit=superstar?'회':'장',presets=superstar?SUPERSTAR_BULK.counts:[1000,10000,100000];
  const getCost=superstar?superstarBulkCost:ultimateBulkCost,getKey=superstar?superstarBulkKey:ultimateBulkKey,newId=superstar?superstarBulkRequestId:ultimateBulkRequestId,validate=superstar?validateSuperstarBulkReceipt:validateUltimateBulkReceipt;
  for(const [id,href]of [['command-ui','/css/command-ui-v1.css'],['ultimate-bulk','/css/ultimate-pack-bulk.css?v=20261025-v1']])if(!document.querySelector(`[data-ultimate-style="${id}"]`)){const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.ultimateStyle=id;document.head.append(link);}
  const key=getKey(accountId),previousFocus=document.activeElement,dialog=document.createElement('dialog');dialog.className='ultimate-bulk-dialog cn-command-ui';dialog.dataset.pack=mode;active=dialog;
  let pending=null,busy=false,disposed=false,result=null,featurePage=0,detailPage=0;
  try{const raw=storage.getItem(key);if(raw){pending=JSON.parse(raw);if(!pending?.requestId||pending.userId!==accountId)throw Error('이전 요청 기록을 확인하지 못했습니다.');}}
  catch(error){active=null;onClose?.();throw error;}
  dialog.innerHTML=`<section class="cn-ui-panel ub-panel"><button type="button" class="cn-ui-button ub-close" aria-label="닫기">×</button><header class="ub-head"><img src="/assets/ui/packs/reverse-call-20261016/${mode}-768.webp" alt="${name}" width="120" height="150"><div><p>${superstar?"SUPERSTAR":"ULTIMATE"} PACK</p><h2>한 번에 빠른 개봉</h2><p>${superstar?"1,000회 · 10,000회":"최대 100,000장"} · 연출 없이 결과 바로 확인</p></div></header><div class="ub-order"><label for="ub-count">구매·개봉 수량</label><input id="ub-count" type="number" inputmode="numeric" min="1000" max="${superstar?10000:100000}" step="${superstar?1000:100}" value="${pending?.count||initialCount}"><div class="ub-presets">${presets.map(n=>`<button class="cn-ui-button" type="button" data-ub-count="${n}">${fmt(n)}${unit}</button>`).join('')}</div><p class="ub-quote"></p><p class="ub-policy">${superstar?`매회 독립 판정 · SUPERSTAR ${Number(pack.successRate??10)}% · 꽝 ${Number(pack.missRate??90)}% · 당첨 보장 없음`:"기존 가격·확률 적용 · 10장마다 보장 등급 유지 · 100장 단위 크리티컬·리미티드 판정"}</p><button type="button" class="cn-ui-button primary ub-start">구매하고 바로 개봉</button></div><p class="ub-status" role="status" aria-live="polite"></p><div class="ub-results" hidden></div></section>`;
  document.body.append(dialog);dialog.showModal();const $=s=>dialog.querySelector(s);
  const say=text=>{$('.ub-status').textContent=text;};
  const sync=()=>{
    let cost;try{cost=getCost(pack.price,Number($('#ub-count').value));$('.ub-quote').textContent=fmt(Number($('#ub-count').value))+unit+' · '+fmt(cost)+' 코인';}catch(e){$('.ub-quote').textContent=e.message;}
    $('.ub-start').disabled=busy||(!pending&&!cost);$('.ub-start').textContent=pending?'이전 개봉 결과 확인':'구매하고 바로 개봉';$('.ub-close').disabled=busy;
    $('#ub-count').disabled=busy||Boolean(pending);dialog.querySelectorAll('[data-ub-count]').forEach(b=>{b.disabled=busy||Boolean(pending);b.setAttribute('aria-pressed',String(Number(b.dataset.ubCount)===Number($('#ub-count').value)));});
  };
  function close(){if(busy)return;disposed=true;dialog.close();dialog.remove();active=null;onClose?.();previousFocus?.focus?.();}
  $('.ub-close').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $('#ub-count').oninput=sync;dialog.querySelectorAll('[data-ub-count]').forEach(b=>b.onclick=()=>{$('#ub-count').value=b.dataset.ubCount;sync();});
  const ensureAccount=()=>{if(disposed||Number(getAccountId())!==Number(accountId))throw Error('계정이 변경되었습니다. 이전 계정으로 로그인해 결과를 확인하세요.');};
  function renderFeatures(){
    const rows=result.results.filter(r=>featured(r.card.grade)),pages=Math.max(1,Math.ceil(rows.length/24));featurePage=Math.max(0,Math.min(featurePage,pages-1));
    $('[data-ub-featured]').innerHTML=rows.slice(featurePage*24,(featurePage+1)*24).map(r=>`<article class="ub-card"><span>${esc(r.card.grade)}</span>${r.card.image?`<img src="${esc(r.card.image)}" alt="${esc(r.card.title)}" loading="lazy" decoding="async" width="160" height="210">`:''}<b>${esc(r.card.title)}</b><strong>× ${fmt(r.count)}</strong></article>`).join('');
    $('[data-ub-feature-page]').textContent=`${featurePage+1} / ${pages}`;$('[data-ub-feature-prev]').disabled=featurePage===0;$('[data-ub-feature-next]').disabled=featurePage>=pages-1;
    $('[data-ub-feature-controls]').hidden=rows.length<=24;$('[data-ub-feature-section]').hidden=!rows.length;
  }
  function renderDetails(){
    const rows=result.results,pages=Math.max(1,Math.ceil(rows.length/50));detailPage=Math.max(0,Math.min(detailPage,pages-1));
    $('[data-ub-detail-rows]').innerHTML=rows.slice(detailPage*50,(detailPage+1)*50).map(r=>`<tr><td>${esc(r.card.grade)}</td><td>${esc(r.card.title)}</td><td>${fmt(r.count)}</td></tr>`).join('');
    $('[data-ub-detail-page]').textContent=`${detailPage+1} / ${pages}`;$('[data-ub-detail-prev]').disabled=detailPage===0;$('[data-ub-detail-next]').disabled=detailPage>=pages-1;
  }
  async function present(receipt,request){
    ensureAccount();validate(receipt,{requestId:request.requestId,userId:accountId,count:request.count});
    if(receipt.cost!==request.expectedCost)throw Error('확인한 가격과 결제 기록이 다릅니다.');
    await accept?.(receipt);ensureAccount();result=receipt;featurePage=0;detailPage=0;
    const grades=new Map();for(const row of result.results)grades.set(row.card.grade,(grades.get(row.card.grade)||0)+row.count);
    $('.ub-results').hidden=false;
    $('.ub-results').innerHTML=`<h3>${fmt(result.count)}장 개봉 완료</h3><div class="ub-totals"><span>사용 코인 <b>${fmt(result.cost)}</b></span><span>카드 조각 <b>+${fmt(result.shardTotal)}</b></span><span>마스터의 별 <b>+${fmt(result.masterStarTotal)}</b></span></div><div class="ub-grades">${[...grades].map(([grade,count])=>`<span><b>${esc(grade)}</b> ${fmt(count)}장</span>`).join('')}</div><section data-ub-feature-section><h4>SSR 이상 획득</h4><div class="ub-featured" data-ub-featured></div><div class="ub-pager" data-ub-feature-controls><button class="cn-ui-button" data-ub-feature-prev>이전</button><span data-ub-feature-page></span><button class="cn-ui-button" data-ub-feature-next>다음</button></div></section><details class="ub-details"><summary>전체 ${fmt(result.results.length)}종 이름·수량 상세보기</summary><table><thead><tr><th>등급</th><th>카드</th><th>수량</th></tr></thead><tbody data-ub-detail-rows></tbody></table><div class="ub-pager"><button class="cn-ui-button" data-ub-detail-prev>이전</button><span data-ub-detail-page></span><button class="cn-ui-button" data-ub-detail-next>다음</button></div></details>`;
    if(superstar){
      $('.ub-results h3').textContent=`${fmt(result.count)}회 개봉 완료`;
      $('.ub-totals').innerHTML=`<span>사용 코인 <b>${fmt(result.cost)}</b></span><span>카드 조각 <b>+${fmt(result.shardGained)}</b></span>`;
      $('.ub-grades').innerHTML=`<span><b>SUPERSTAR</b> ${fmt(result.hitCount)}장</span><span><b>꽝</b> ${fmt(result.missCount)}회</span>`;
      $('[data-ub-feature-section] h4').textContent='획득한 슈퍼스타';
    }
    renderFeatures();$('.ub-details').ontoggle=()=>{if($('.ub-details').open)renderDetails();};
    for(const [target,delta]of [['prev',-1],['next',1]]){$(`[data-ub-feature-${target}]`).onclick=()=>{featurePage+=delta;renderFeatures();};$(`[data-ub-detail-${target}]`).onclick=()=>{detailPage+=delta;renderDetails();};}
    // Only discard the durable request after validation, state application and render.
    storage.removeItem(key);pending=null;say(superstar&&!result.hitCount?'모든 판정이 완료되었습니다. 이번 개봉에는 당첨 카드가 없습니다.':'모든 카드와 중복 보상이 지급되었습니다.');$('.ub-results').scrollIntoView({block:'start'});
  }
  async function run(){
    if(busy)return;
    try{
      ensureAccount();
      const recovering=Boolean(pending);
      if(!pending){const count=Number($('#ub-count').value),expectedCost=getCost(pack.price,count);if(!window.confirm(`${name} ${fmt(count)}${unit} 구매하고 바로 개봉할까요?\n총 ${fmt(expectedCost)}코인이 사용됩니다.${superstar?'\n매회 독립 판정이며 당첨 보장은 없습니다.':''}`))return;
        const request={requestId:newId(),userId:accountId,count,expectedCost};storage.setItem(key,JSON.stringify(request));if(storage.getItem(key)!==JSON.stringify(request))throw Error('구매 기록을 저장하지 못했습니다.');pending=request;
      }
      busy=true;sync();const request={...pending};say(`${fmt(request.count)}${unit} 개봉 중입니다. 결과를 한 번에 표시합니다.`);
      let receipt;
      // Query first on recovery; a missing response never means a fresh purchase.
      if(recovering&&!superstar)try{receipt=await api('draw/ultimate-bulk/receipt?requestId='+encodeURIComponent(request.requestId));}
      catch(error){if(error.code!=='JOINT_ULTIMATE_NOT_FOUND')throw error;}
      if(!receipt){ensureAccount();if(!superstar&&Date.now()-Number(request.requestId.split('-')[1])>ULTIMATE_BULK.maxAgeMs)throw Error('이전 요청이 오래되어 자동 재결제를 중단했습니다. 운영자에게 기록 확인을 요청하세요.');receipt=await api(superstar?'superstar-pack/draw':'draw/ultimate-bulk',{method:'POST',body:JSON.stringify({requestId:request.requestId,count:request.count,expectedCost:request.expectedCost})});}
      await present(receipt,request);
    }catch(error){
      if(/^JOINT_ULTIMATE_(COUNT|INPUT|PRICE|COIN|CLOSED)$/.test(error.code||'')||(superstar&&['SUPERSTAR_DRAW_COUNT_INVALID','SUPERSTAR_BULK_INPUT','SUPERSTAR_PACK_OFF','SUPERSTAR_PRICE_CHANGED','SUPERSTAR_DRAW_FAILED','SUPERSTAR_INSUFFICIENT_COIN'].includes(error.code))){storage.removeItem(key);pending=null;}
      say((error.message||'결과 확인이 지연되고 있습니다.')+(pending?' 같은 요청을 보관했습니다. 이전 개봉 결과 확인을 눌러주세요.':''));
    }finally{busy=false;sync();}
  }
  $('.ub-start').onclick=run;sync();if(pending)say('확인하지 못한 개봉이 있습니다. 같은 요청으로 결과를 복구합니다.');return dialog;
}
