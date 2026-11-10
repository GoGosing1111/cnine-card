import {AUCTION_QUICK_BIDS,AUCTION_MAX_BID,AUCTION_ASSET_TYPES,AUCTION_DURATION_MINUTES,AUCTION_DEFAULT_MINUTES,AUCTION_ITEM_LISTING_LIMIT,auctionDurationLabel,AUCTION_TICKET_IMAGE,auctionCoinLabel,auctionProceeds} from '../shared/auction-user-policy-v1.mjs?v=20261110-auction-duration-v1';
import {createAuctionBgmPlayer} from './auction-user-bgm-v1.mjs?v=20261107-exact-bgm-v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number.isSafeInteger(Number(v||0))&&Number(v||0)>=0?auctionCoinLabel(Number(v||0)):'금액 확인';
const integer=v=>Number(v||0).toLocaleString('ko-KR');
export function exactBgmRange(r){
 if(!r.maxBid)return integer(r.minBid)+'코인 이상';
 return (r.minBid===r.maxBid?integer(r.minBid):integer(r.minBid)+' ~ '+integer(r.maxBid))+'코인';
}
export function findBgmRule(rules,amount){
 if(!Number.isSafeInteger(amount)||amount<1||amount>AUCTION_MAX_BID)return null;
 const ordered=rules.filter(r=>amount>=r.minBid&&(!r.maxBid||amount<=r.maxBid)).sort((a,b)=>(a.sortOrder??a.order)-(b.sortOrder??b.order)||b.minBid-a.minBid||a.order-b.order);
 return ordered[0]?.playable!==false?ordered[0]||null:null;
}
const triggerLabel=(rules,amount)=>{const match=findBgmRule(rules,amount);return match?'발동 BGM: '+match.name:'발동 BGM 없음';};
const bidBgmHint=(rules,amount)=>integer(amount)+'코인 · '+triggerLabel(rules,amount);
const inputHint=(rules,value)=>{const n=Number(value);return !value?'퀵 버튼으로 금액을 더할 수 있습니다.':Number.isSafeInteger(n)&&n>0&&n<=AUCTION_MAX_BID?bidBgmHint(rules,n):'1~100조 사이의 정확한 코인 수량을 입력하세요.';};
export function inspectBgmGuide(rules,text){
 const query=String(text??'').trim(),names=key=>rules.filter(r=>r.name.toLocaleLowerCase().includes(key.toLocaleLowerCase()));
 if(!query)return {rows:rules,message:'전체 '+rules.length+'개 발동 조건'};
 if(!/^[\d,]+$/.test(query)){const rows=names(query);return {rows,message:rows.length?'곡명 검색 결과 '+rows.length+'개':'일치하는 곡명이 없습니다.'};}
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(query))return {rows:[],message:'쉼표 없이 숫자로 입력하거나 188,888처럼 입력하세요.'};
 const amount=Number(query.replaceAll(',',''));if(!Number.isSafeInteger(amount)||amount<1||amount>AUCTION_MAX_BID)return {rows:[],message:'1~100조 사이의 정수 코인 금액을 입력하세요.'};
 const match=findBgmRule(rules,amount);if(match)return {rows:[match],message:bidBgmHint(rules,amount)};
 const related=names(String(amount));if(related.length)return {rows:related,message:integer(amount)+'코인 · 발동 없음. 아래는 번호가 일치하는 곡의 등록 금액입니다.'};
 const nearest=rules.map(r=>Math.min(Math.max(amount,r.minBid,1),r.maxBid||AUCTION_MAX_BID)).sort((a,b)=>Math.abs(a-amount)-Math.abs(b-amount)||a-b).find(n=>findBgmRule(rules,n));
 return {rows:nearest===undefined?[]:[findBgmRule(rules,nearest)],message:integer(amount)+'코인 · 발동 없음.'+(nearest===undefined?'':' 가장 가까운 등록 금액: '+integer(nearest)+'코인')};
}
function receiptText(amount,result){
 const prefix=integer(amount)+'코인 입찰 접수';
 if(!result||!Object.hasOwn(result,'bgm'))return prefix;
 const e=result.bgm;if(!e)return prefix+' · 발동 BGM 없음';
 if(e.startsMs>=e.lotEndsMs)return prefix+' · '+e.name+': 앞 곡의 대기 시간으로 경매 종료 전에는 재생되지 않습니다.';
 if(result.serverNow>=Math.min(e.endsMs,e.lotEndsMs))return prefix+' · '+e.name+': 재생 시간이 지났습니다.';
 if(e.startsMs<=result.serverNow)return prefix+' · '+e.name+' 재생 차례입니다.';
 const time=new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(e.startsMs);
 return prefix+' · '+e.name+' 대기 중 · '+time+'(한국시간) 재생 예정';
}
const requestId=()=>`AUC_${crypto.randomUUID()}`;
const art=a=>`<img src="${esc(a.image||'/assets/ui/tactical-20261030/auction.webp')}" alt="${esc(a.name)}" loading="lazy">`;
const countdown=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':');};

export function createAuctionOpeningNotice({api,getContext,onEnter}){
 let latest=null,dialog=null,pending=false,destroyed=false,shown=null;
 const close=()=>{dialog?.close();dialog?.remove();dialog=null;};
 async function update(state){
  latest=state;const ctx=getContext(),a=state?.active;
  if(dialog&&(!ctx.inLobby||ctx.userId!==shown.userId||a?.id!==shown.id)){close();}
  if(destroyed||dialog||pending||!ctx.inLobby||!ctx.userId||!a||document.hidden||document.querySelector('dialog[open]')||Number(a.endsMs)<=Number(state.serverNow))return;
  pending=true;
  try{
   const claimed=await api('notice',{lotId:a.id});
   const fresh=getContext();if(!claimed.show||destroyed||!fresh.inLobby||fresh.userId!==ctx.userId||latest?.active?.id!==a.id)return;
   const node=document.createElement('dialog'),previous=document.activeElement;node.className='auc-opening auc-skin';node.setAttribute('aria-labelledby','auc-opening-title');
   node.innerHTML=`<div class="auc-opening-art">${art(a.asset)}</div><div class="auc-opening-copy"><span class="auc-eyebrow">NEW AUCTION</span><h2 id="auc-opening-title">새 경매가 열렸습니다</h2><p><b>${esc(a.sellerName)}</b> 님의 경매</p><h3>${esc(a.asset.name)}</h3><p>${integer(a.asset.quantity)}개 · 시작가 <strong>${money(a.startPrice)} 코인</strong></p><p class="auc-muted">실제 시작부터 ${auctionDurationLabel(a.durationMinutes)} 동안 입찰할 수 있습니다.</p><button class="auc-button auc-primary" data-enter>경매장 입장 <span>→</span></button><button class="auc-button" data-close autofocus>닫기</button></div>`;
   node.querySelector('[data-enter]').onclick=()=>{close();onEnter(a.id);};node.querySelector('[data-close]').onclick=close;node.addEventListener('cancel',e=>{e.preventDefault();close();});node.addEventListener('close',()=>previous?.isConnected&&previous.focus({preventScroll:true}),{once:true});
   document.body.append(node);node.showModal();dialog=node;shown={id:a.id,userId:ctx.userId};
  }finally{pending=false;}
 }
 return {update,destroy(){destroyed=true;close();}};
}

export function mountUserAuction({root,api,onLobby=()=>{},pollMs=10000}){
 let data=null,destroyed=false,timer=null,clock=null,dialog=null,draft='',messageDraft='',bidPending=null,hostPending=null,busy=false,offset=0,tab='LIVE',bgm=null;
 const error=message=>{const node=root.querySelector('[data-error]');if(node){node.textContent=message;node.hidden=!message;}};
 const closeDialog=()=>{dialog?.close();dialog?.remove();dialog=null;};
 function shell(){
  root.className='auction-user';root.innerHTML=`<header class="auc-header"><div><p class="auc-eyebrow">REVERSE CALL / MARKET</p><h1>유저 경매장</h1><p class="auc-muted">보유한 물품을 내놓고, 다음 주인을 만나세요.</p></div><button class="auc-back" data-lobby>로비로 돌아가기 ↗</button></header>
  <section class="auc-ticket-strip auc-skin"><img src="${AUCTION_TICKET_IMAGE}" alt="경매 개최 티켓"><div><strong>나의 경매를 열어 보세요</strong><p>개최 티켓 1장 · 30분 / 1시간 / 2시간 · 판매 수수료 20%</p></div><span data-tickets>보유 확인 중</span><button class="auc-button auc-primary" data-host>경매 개최 <span>＋</span></button></section>
  <nav class="auc-tabs" aria-label="경매 목록"><button data-tab="LIVE" aria-selected="true">진행 중 <b>01</b></button><button data-tab="QUEUE">예약 순서 <b data-queue-count>0</b></button><button data-tab="MINE">내 판매 내역</button><span>동시에 1건 진행 · 예약 순서대로 시작</span></nav>
  <p class="auc-error" data-error role="alert" hidden></p><main data-content><p class="auc-loading">경매 정보를 불러오는 중입니다.</p></main>`;
  root.querySelector('[data-host]').onclick=()=>void openHost();root.querySelector('[data-lobby]').onclick=onLobby;
  root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
  const guide=document.createElement('button');guide.type='button';guide.className='auc-text-button auc-bgm-guide-link';guide.textContent='♪ BGM 발동표';guide.onclick=showBgmGuide;root.querySelector('.auc-tabs').append(guide);
 }
 function row(a,index,{cancel=false}={}){return `<article class="auc-queue-row"><span class="auc-queue-number">${String(index+1).padStart(2,'0')}</span>${art(a.asset)}<div><small>${esc(AUCTION_ASSET_TYPES[a.asset.kind])} · ${esc(a.sellerName)}</small><h3>${esc(a.asset.name)}</h3><p>${integer(a.asset.quantity)}개 · 시작가 ${money(a.startPrice)} · ${auctionDurationLabel(a.durationMinutes)}</p></div><span class="auc-queue-status">${a.status==='QUEUED'?'예약 대기':a.status==='SOLD'?`낙찰 ${money(a.winningBid)}`:a.status==='ACTIVE'?'진행 중':a.status==='UNSOLD'?'유찰 · 물품 반환':'예약 취소'}${cancel?`<button class="auc-text-button" data-cancel="${esc(a.id)}">예약 취소</button>`:''}</span></article>`;}
 function render(){
  if(!data||destroyed)return;const content=root.querySelector('[data-content]'),a=data.active;
  const previousReceipt=root.querySelector('[data-bid-receipt]');if(previousReceipt&&previousReceipt.dataset.lot!==a?.id)previousReceipt.remove();
  root.querySelector('[data-tickets]').textContent=`보유 ${integer(data.tickets)}장`;root.querySelector('[data-queue-count]').textContent=data.queue.length;
  root.querySelector('[data-host]').disabled=!data.enabled||data.tickets<1;root.querySelector('[data-host]').innerHTML=data.enabled?'경매 개최 <span>＋</span>':'유저 개최 OFF';root.querySelector('.auc-ticket-strip strong').textContent=data.enabled?'나의 경매를 열어 보세요':'유저 경매 개최는 현재 OFF입니다';root.querySelector('.auc-ticket-strip p').textContent=data.enabled?'개최 티켓 1장 · 30분 / 1시간 / 2시간 · 판매 수수료 20%':'운영자가 개최한 경매에는 입찰할 수 있습니다.';
  root.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
  if(tab==='QUEUE'||tab==='MINE'){
   const items=tab==='QUEUE'?data.queue:[a,...data.queue,...data.history].filter(x=>x?.sellerId===data.userId);
   content.innerHTML=`<section class="auc-list auc-skin"><div class="auc-section-title"><h2>${tab==='QUEUE'?'예약된 경매':'내 판매 내역'}</h2><span>${items.length}건</span></div>${items.map((x,i)=>row(x,i,{cancel:x.status==='QUEUED'&&x.sellerId===data.userId})).join('')||'<p class="auc-empty">등록된 경매가 없습니다.</p>'}<p class="auc-note">예약 경매는 앞선 경매가 끝난 뒤 시작되며, 실제 시작부터 선택한 시간 동안 진행됩니다.</p></section>`;
   if(tab==='MINE'&&data.returns?.length)content.insertAdjacentHTML('beforeend',`<section class="auc-list auc-skin"><h2>반환 대기 물품</h2><p class="auc-muted">같은 이동수단을 이미 보유해 반환하지 못한 물품을 안전하게 보관하고 있습니다.</p>${data.returns.map(r=>`<p>${esc(r.asset.name)} <button class="auc-button" data-return="${esc(r.lotId)}">반환 물품 수령</button></p>`).join('')}</section>`);
   content.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{try{await api('cancel',{lotId:b.dataset.cancel});await refresh();}catch(e){error(e.message);}});
   content.querySelectorAll('[data-return]').forEach(b=>b.onclick=async()=>{try{await api('return',{lotId:b.dataset.return});await refresh();}catch(e){error(e.message);}});return;
  }
  if(!a){content.innerHTML=`<section class="auc-empty auc-skin"><img src="${AUCTION_TICKET_IMAGE}" alt="경매 개최 티켓"><h2>${data.legacyActive?'기존 경매 종료를 기다리고 있습니다':data.enabled?'첫 경매의 주인공이 되어 보세요':'현재 진행 중인 경매가 없습니다'}</h2><p>${data.legacyActive?'예약된 경매는 기존 경매가 종료된 뒤 시작됩니다.':data.enabled?'개최 티켓으로 내 물품을 경매에 등록할 수 있습니다.':'운영자가 경매를 열면 여기에서 입찰할 수 있습니다.'}</p></section>`;return;}
  const mine=data.bidders.find(b=>b.user_id===data.userId)?.total||0,top=data.bidders[0]?.total||0,own=a.sellerId===data.userId;
  content.innerHTML=`<div class="auc-layout"><section class="auc-live auc-skin"><div class="auc-live-heading"><span class="auc-live-label">● 진행 중</span><span>${auctionDurationLabel(a.durationMinutes)} 경매</span><time data-clock></time></div><div class="auc-lot"><div class="auc-art">${art(a.asset)}<span class="auc-art-type">${esc(AUCTION_ASSET_TYPES[a.asset.kind])} / ${integer(a.asset.quantity)}개</span></div><div class="auc-bid-panel"><p class="auc-eyebrow">PLAYER AUCTION</p><h2>${esc(a.asset.name)}</h2><p class="auc-seller">판매자 <b>${esc(a.sellerName)}</b></p><p class="auc-growth">기본 개체 거래 · 성장 정보는 각 계정에 유지</p><div class="auc-current"><span>${top?'현재 최고 누적 입찰':'낙찰 시작가'}</span><strong title="${integer(top||a.startPrice)}">${money(top||a.startPrice)} <small>코인</small></strong></div><div class="auc-mine"><span>나의 누적 입찰</span><b>${money(mine)} 코인</b></div><form data-bid-form><label for="auc-amount">추가 입찰 금액</label><div class="auc-input-wrap"><input id="auc-amount" type="text" inputmode="numeric" autocomplete="off" aria-describedby="auc-amount-label" placeholder="코인 수량 입력" value="${esc(draft)}" ${own?'disabled':''}><span>코인</span></div><p id="auc-amount-label" class="auc-amount-label"></p><div class="auc-quick">${AUCTION_QUICK_BIDS.map(x=>`<button type="button" data-add="${x.amount}" ${own?'disabled':''}>+${x.label}</button>`).join('')}</div><button class="auc-button auc-primary auc-bid" ${own?'disabled':''}>${own?'내가 개최한 경매입니다':'누적 입찰하기'} <span>→</span></button></form><p class="auc-note">최고 누적 입찰자에게 낙찰됩니다.<br>낙찰되지 않은 입찰금은 전액 반환됩니다.</p></div></div><section class="auc-leaderboard"><div class="auc-section-title"><h3>입찰 현황</h3><span>${data.bidders.length}명 참여</span></div>${data.bidders.slice(0,5).map((b,i)=>`<div class="auc-rank"><i>${String(i+1).padStart(2,'0')}</i><span>${esc(b.nickname)} ${b.user_id===data.userId?'<small>나</small>':''}</span><b>${money(b.total)} 코인</b></div>`).join('')||'<p class="auc-muted">첫 입찰자를 기다리고 있습니다.</p>'}</section></section>
  <aside class="auc-side"><section class="auc-queue auc-skin"><div class="auc-section-title"><h2>다음 경매</h2><span>${data.queue.length}건 예약</span></div>${data.queue.slice(0,3).map((x,i)=>row(x,i)).join('')||'<p class="auc-muted auc-side-empty">다음 경매를 예약해 보세요.</p>'}<button class="auc-text-button" data-all-queue>예약 순서 모두 보기 →</button></section><section class="auc-guide auc-skin"><p class="auc-eyebrow">AUCTION GUIDE</p><h3>경매 이용 안내</h3><dl><div><dt>개최 비용</dt><dd>개최 티켓 1장</dd></div><div><dt>진행 시간</dt><dd>30분 / 1시간 / 2시간</dd></div><div><dt>판매 수수료</dt><dd>낙찰가의 20%</dd></div></dl><p>카드 · 용병 · 펫 · 장비 · 이동수단<br>아이템 · 마스터의 별</p><p class="auc-note">고급 전리품 상점 500피그코인<br>랭크전 상점 300랭크코인</p></section></aside></div>`;
  const input=content.querySelector('#auc-amount');
  content.querySelector('.auc-bid').insertAdjacentHTML('beforebegin',`<label class="auc-message-label" for="auc-bid-message">입찰 메시지 <small>BGM 발동 시 표시 · 40자</small></label><input id="auc-bid-message" class="auc-message-input" maxlength="40" placeholder="한마디를 남겨보세요" value="${esc(messageDraft)}" ${own?'disabled':''}>`);
  content.querySelector('#auc-bid-message').oninput=e=>{messageDraft=e.target.value;bidPending=null;};
  const hint=content.querySelector('#auc-amount-label');hint.textContent=inputHint(data.bgmGuide||[],draft);hint.setAttribute('aria-live','polite');
  input.oninput=()=>{draft=input.value.replace(/[^0-9]/g,'');input.value=draft;hint.textContent=inputHint(data.bgmGuide||[],draft);bidPending=null;};
  content.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const value=Number(draft||0)+Number(b.dataset.add);if(!Number.isSafeInteger(value)||value>AUCTION_MAX_BID)return error('1회 추가 입찰은 최대 100조 코인입니다.');input.value=String(value);input.dispatchEvent(new Event('input'));error('');});
  content.querySelector('[data-bid-form]').onsubmit=e=>{e.preventDefault();void confirmBid(a.id,Number(draft));};content.querySelector('[data-all-queue]').onclick=()=>{tab='QUEUE';render();};tickClock();
 }
 function makeDialog(title,body){
  closeDialog();const node=document.createElement('dialog'),previous=document.activeElement;node.className='auc-dialog auc-skin';node.setAttribute('aria-labelledby','auc-dialog-title');
  node.innerHTML=`<header><div><p class="auc-eyebrow">PLAYER AUCTION</p><h2 id="auc-dialog-title">${esc(title)}</h2></div><button class="auc-close" aria-label="닫기" autofocus>×</button></header>${body}<p class="auc-error" data-dialog-error role="alert" hidden></p>`;
  node.querySelector('.auc-close').onclick=closeDialog;node.addEventListener('cancel',e=>{if(busy){e.preventDefault();return;}closeDialog();});node.addEventListener('close',()=>previous?.isConnected&&previous.focus({preventScroll:true}),{once:true});document.body.append(node);node.showModal();dialog=node;return node;
 }
 function showBgmGuide(){
  const rules=data?.bgmGuide||[];
  const node=makeDialog('BGM 발동표','<p class="auc-muted">한 번에 추가 입찰하는 금액이 아래 조건과 맞으면 음악이 순서대로 재생됩니다.</p><div class="auc-bgm-lookup"><label for="auc-bgm-lookup">추가 입찰 금액 또는 곡명 확인</label><input id="auc-bgm-lookup" type="search" placeholder="예: 188,888 또는 골타69" autocomplete="off" maxlength="90"><p data-bgm-lookup-status role="status"></p></div><section class="auc-bgm-volume-settings"><strong>경매 BGM 음량</strong><div data-bgm-settings></div><p class="auc-muted">내 기기에 저장되며, 다음 BGM에도 적용됩니다.</p></section><div class="auc-bgm-guide-list"></div>');
  const input=node.querySelector('#auc-bgm-lookup'),list=node.querySelector('.auc-bgm-guide-list'),status=node.querySelector('[data-bgm-lookup-status]');
  function lookup(){const result=inspectBgmGuide(rules,input.value);status.textContent=result.message;
   list.innerHTML=result.rows.map(r=>'<article><b>'+String(r.order).padStart(2,'0')+'</b><div><strong>'+esc(r.name)+'</strong><p>'+exactBgmRange(r)+' · '+integer(r.duration)+'초'+(r.playable===false?' · 음원 미등록':'')+'</p></div></article>').join('');}
  input.addEventListener('input',lookup);input.addEventListener('search',lookup);lookup();
  const dispose=bgm?.mountVolumeControl(node.querySelector('[data-bgm-settings]'));
  if(dispose)node.addEventListener('close',dispose,{once:true});
 }
 async function confirmBid(lotId,amount){
  if(!Number.isSafeInteger(amount)||amount<1||amount>AUCTION_MAX_BID)return error('추가 입찰액은 1~100조 코인 사이로 입력하세요.');
  const node=makeDialog('입찰 금액 확인',`<div class="auc-confirm"><p>이 경매에 추가 입찰합니다.</p><strong>${integer(amount)} 코인</strong><small>${esc(triggerLabel(data?.bgmGuide||[],amount))}</small><p class="auc-muted">기존 누적 입찰액에 더해집니다. 지정곡은 앞선 곡이 끝난 뒤 재생됩니다.</p><button class="auc-button auc-primary" data-submit>입찰 확정</button></div>`);
  node.querySelector('[data-submit]').onclick=async()=>{
   if(busy)return;busy=true;node.querySelector('[data-submit]').disabled=true;bidPending??={lotId,amount,message:messageDraft,requestId:requestId()};
   try{const result=await api('bid',bidPending);bidPending=null;draft='';closeDialog();if(destroyed)return;
    let receipt=root.querySelector('[data-bid-receipt]');if(!receipt){receipt=document.createElement('p');receipt.dataset.bidReceipt='';receipt.className='auc-bid-receipt';receipt.setAttribute('role','status');root.querySelector('[data-content]').before(receipt);}
    receipt.textContent=receiptText(amount,result);receipt.dataset.lot=lotId;receipt.scrollIntoView({block:'nearest'});void bgm?.poll();await refresh();
   }catch(e){dialogError(node,e.message);}finally{busy=false;if(node.isConnected)node.querySelector('[data-submit]').disabled=false;}
  };
 }
 function dialogError(node,message){const e=node.querySelector('[data-dialog-error]');e.textContent=message;e.hidden=false;}
 async function openHost(){
  if(!data?.tickets||!data.enabled)return;
  const node=makeDialog('경매 개최',`<p class="auc-muted">같은 물품은 경매장 전체에서 최근 24시간에 ${AUCTION_ITEM_LISTING_LIMIT}건까지 등록할 수 있습니다. 취소한 예약도 포함됩니다.</p><p class="auc-loading">보유 물품을 확인하는 중입니다.</p>`);
  try{
   const {assets}=await api('catalog');if(!node.isConnected)return;
   node.querySelector('.auc-loading').outerHTML=`<div class="auc-host-tabs" role="group" aria-label="물품 종류">${Object.entries(AUCTION_ASSET_TYPES).map(([k,v])=>`<button type="button" data-kind="${k}">${v}</button>`).join('')}</div><div class="auc-host-assets"></div><form class="auc-host-form"><div class="auc-form-fields"><label>판매 수량<input name="quantity" type="number" min="1" max="10000000000" value="1" required></label><label>시작가 (코인)<input name="startPrice" type="text" inputmode="numeric" value="10000000" required></label><label class="auc-duration">진행 시간<select name="durationMinutes" required>${AUCTION_DURATION_MINUTES.map(m=>`<option value="${m}" ${m===AUCTION_DEFAULT_MINUTES?'selected':''}>${auctionDurationLabel(m)}</option>`).join('')}</select></label></div><div class="auc-host-summary"><p data-selected>판매할 물품을 선택하세요.</p><p data-net></p><p>개최 티켓 1장 사용</p></div><p class="auc-note">카드·용병·펫의 기본 개체만 이전됩니다. 강화·레벨·잠재력은 각 계정에 남습니다. 물품과 티켓은 예약 등록 시 함께 보관됩니다.</p><button class="auc-button auc-primary" data-submit disabled>${data.active||data.queue.length||data.legacyActive?'순서대로 경매 예약':'지금 경매 개최'}</button></form>`;
   let selected=null,kind='CARD';const form=node.querySelector('form'),list=node.querySelector('.auc-host-assets');
   function summary(){const q=Number(form.quantity.value),price=Number(form.startPrice.value);node.querySelector('[data-selected]').textContent=selected?`${selected.name} · ${integer(q)}개 / 보유 ${integer(selected.quantity)}개`:'판매할 물품을 선택하세요.';node.querySelector('[data-net]').textContent=Number.isSafeInteger(price)&&price>0&&price<=AUCTION_MAX_BID?`시작가 ${money(price)} · 해당 금액 낙찰 시 수령 ${money(auctionProceeds(price).net)} 코인`:'시작가는 1~100조 코인 사이입니다.';node.querySelector('[data-submit]').disabled=!selected||!Number.isSafeInteger(q)||q<1||q>selected.quantity||!Number.isSafeInteger(price)||price<1||price>AUCTION_MAX_BID;}
   function chooseKind(){node.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));list.innerHTML=assets.filter(a=>a.kind===kind).map((a,i)=>`<button type="button" class="auc-select-asset auc-skin" data-asset="${assets.indexOf(a)}">${art(a)}<span><b>${esc(a.name)}</b><small>보유 ${integer(a.quantity)}개</small></span></button>`).join('')||'<p class="auc-empty">등록 가능한 보유 물품이 없습니다.</p>';list.querySelectorAll('[data-asset]').forEach(b=>b.onclick=()=>{selected=assets[Number(b.dataset.asset)];list.querySelectorAll('[data-asset]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));hostPending=null;summary();});}
   node.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;selected=null;chooseKind();summary();});chooseKind();summary();form.oninput=()=>{hostPending=null;summary();};
   form.onsubmit=async e=>{e.preventDefault();if(busy||!selected)return;busy=true;node.querySelector('[data-submit]').disabled=true;hostPending??={kind:selected.kind,ref:selected.ref,quantity:Number(form.quantity.value),startPrice:Number(form.startPrice.value),durationMinutes:Number(form.durationMinutes.value),requestId:requestId()};
    try{await api('host',hostPending);hostPending=null;closeDialog();tab=data.active?'QUEUE':'LIVE';await refresh();}catch(e){dialogError(node,e.message);}finally{busy=false;if(node.isConnected)summary();}
   };
  }catch(e){dialogError(node,e.message);}
 }
 function tickClock(){const node=root.querySelector('[data-clock]');if(node&&data?.active)node.textContent=countdown(data.active.endsMs-Date.now()-offset);}
 async function refresh(){if(destroyed)return;try{const value=await api('state');if(destroyed)return;data=value;offset=value.serverNow-Date.now();const focused=['auc-amount','auc-bid-message'].includes(document.activeElement?.id)?document.activeElement.id:null;render();bgm?.update(value);if(focused)root.querySelector('#'+focused)?.focus({preventScroll:true});}catch(e){error(e.message);}}
 shell();bgm=createAuctionBgmPlayer({root,api});void refresh();timer=setInterval(()=>{if(!document.hidden&&!dialog&&!busy)void refresh();},pollMs);clock=setInterval(tickClock,1000);
 return {refresh,destroy(){destroyed=true;bgm?.destroy();clearInterval(timer);clearInterval(clock);closeDialog();}};
}
