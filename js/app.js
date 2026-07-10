const app = document.getElementById('app');
const STORAGE_KEY = 'cnine_card_user_v10';
const LEGACY_STORAGE_KEYS = ['cnine_card_user_v08', 'cnine_card_user'];
const TEST_COIN = 5000;
let cards = [];
let selectedPackId = 'basic';

const gradeOrder = { SSR: 7, UR: 6, HR: 5, SR: 4, R: 3, U: 2, C: 1 };
const gradeScore = { SSR: 500, UR: 200, HR: 100, SR: 50, R: 20, U: 5, C: 1 };
const baseRates = { SSR: 1, UR: 4, HR: 7, SR: 13, R: 20, U: 25, C: 30 };

const PACKS = [
  {
    id: 'basic', name: '일반 카드팩', subtitle: 'STANDARD PACK', theme: 'basic',
    description: '모든 등급이 등장하는 기본 카드팩', range: 'C ~ SSR', price: 10,
    allowed: ['C','U','R','SR','HR','UR','SSR'], guarantee10: 'R', guarantee20: 'SR'
  },
  {
    id: 'advanced', name: '고급 카드팩', subtitle: 'ADVANCED PACK', theme: 'advanced',
    description: '커먼을 제외한 U 이상 카드팩', range: 'U ~ SSR', price: 25,
    allowed: ['U','R','SR','HR','UR','SSR'], guarantee10: 'SR', guarantee20: 'HR'
  },
  {
    id: 'premium', name: '프리미엄 카드팩', subtitle: 'PREMIUM PACK', theme: 'premium',
    description: 'R 이상만 등장하는 고급 수집팩', range: 'R ~ SSR', price: 60,
    allowed: ['R','SR','HR','UR','SSR'], guarantee10: 'HR', guarantee20: 'UR'
  },
  {
    id: 'pickup', name: '남수댕 픽업팩', subtitle: 'MEMBER PICK-UP', theme: 'pickup',
    description: '남수댕 카드 등장 확률 3배', range: 'C ~ SSR', price: 30,
    allowed: ['C','U','R','SR','HR','UR','SSR'], guarantee10: 'R', guarantee20: 'SR', pickupMember: '남수댕', pickupMultiplier: 3
  }
];

function migrateLegacyUser() {
  if (localStorage.getItem(STORAGE_KEY)) return;
  for (const key of LEGACY_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value) { localStorage.setItem(STORAGE_KEY, value); return; }
  }
}

async function init() {
  migrateLegacyUser();
  renderLoading();
  try {
    const response = await fetch('data/cards.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('cards.json load failed');
    cards = await response.json();
  } catch (error) {
    console.error(error);
    cards = [];
  }
  setTimeout(() => loadUser() ? renderShell('buy') : renderLogin(), 350);
}

function renderLoading() {
  app.innerHTML = `<div class="loading-screen"><div class="loading-orbit"></div><img src="assets/ui/cninelogo.png" class="loading-logo" alt="CNINE"><strong>씨켓몬 카드뽑기</strong><div class="loading-bar"><i></i></div></div>`;
}

function generateKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `CN-${part()}-${part()}-${part()}`;
}

function loadUser() {
  try {
    const user = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!user) return null;
    user.coin ??= TEST_COIN;
    user.owned ??= [];
    user.history ??= [];
    user.attendance ??= { lastClaimDate: null, totalDays: 0 };
    if (!user.testCoinGrantedV13) {
      user.coin = Math.max(user.coin, TEST_COIN);
      user.testCoinGrantedV13 = true;
      saveUser(user);
    }
    return user;
  } catch { return null; }
}
function saveUser(user) { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); }
function ownedIds(user) { return new Set(user.owned || []); }
function progress(user) { return cards.length ? Math.round((ownedIds(user).size / cards.length) * 1000) / 10 : 0; }
function escapeHtml(value = '') { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function getPack(id) { return PACKS.find(p => p.id === id) || PACKS[0]; }
function kstDateKey(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(date); }
function canClaimAttendance(user) { return user.attendance?.lastClaimDate !== kstDateKey(); }
function cardScore(user) { const owned = ownedIds(user); return cards.reduce((sum, card) => sum + (owned.has(card.id) ? gradeScore[card.grade] : 0), 0); }
function scoreBreakdown(user) {
  const owned = ownedIds(user);
  return ['SSR','UR','HR','SR','R','U','C'].map(grade => ({ grade, count: cards.filter(c => c.grade === grade && owned.has(c.id)).length, score: gradeScore[grade] }));
}

function pickGrade(allowedGrades) {
  const filtered = allowedGrades.map(grade => ({ grade, rate: baseRates[grade] || 0 })).filter(x => x.rate > 0);
  let roll = Math.random() * filtered.reduce((sum, x) => sum + x.rate, 0);
  for (const item of filtered) { roll -= item.rate; if (roll < 0) return item.grade; }
  return filtered.at(-1)?.grade || 'C';
}

function pickCard(pack, guaranteed = null) {
  let allowed = [...pack.allowed];
  if (guaranteed) allowed = allowed.filter(g => gradeOrder[g] >= gradeOrder[guaranteed]);
  const grade = pickGrade(allowed);
  let pool = cards.filter(c => c.grade === grade);
  if (!pool.length) pool = cards.filter(c => allowed.includes(c.grade));
  if (pack.pickupMember && pool.some(c => c.name === pack.pickupMember)) {
    const weighted = [];
    pool.forEach(card => {
      const weight = card.name === pack.pickupMember ? pack.pickupMultiplier : 1;
      for (let i = 0; i < weight; i++) weighted.push(card);
    });
    pool = weighted;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderLogin() {
  app.innerHTML = `<div class="login-wrap"><div class="login-box game-panel"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CNINE COLLECTION GAME</p><h1>씨켓몬 카드뽑기</h1><p>씨나인 멤버들의 순간을 카드로 수집하세요.</p><div class="field"><label for="nickname">와이고수 닉네임</label><input id="nickname" maxlength="20" placeholder="닉네임을 입력하세요"></div><button class="btn" id="start">처음 시작하기</button><div class="login-divider"></div><div class="field"><label for="key">개인키 로그인</label><input id="key" placeholder="CN-XXXX-XXXX-XXXX"></div><button class="btn secondary" id="login">개인키로 로그인</button><p class="login-help">개인키는 최초 생성과 로그인 화면에서만 사용됩니다.</p></div></div>`;
  document.getElementById('start').onclick = () => {
    const nickname = document.getElementById('nickname').value.trim();
    if (!nickname) return alert('닉네임을 입력해주세요.');
    const user = { nickname, key: generateKey(), coin: TEST_COIN, owned: [], history: [], attendance: { lastClaimDate: null, totalDays: 0 }, testCoinGrantedV13: true, createdAt: new Date().toISOString() };
    saveUser(user); renderCreated(user);
  };
  document.getElementById('login').onclick = () => {
    const user = loadUser();
    if (!user || user.key !== document.getElementById('key').value.trim()) return alert('저장된 개인키와 일치하지 않습니다.');
    renderShell('buy');
  };
}

function renderCreated(user) {
  app.innerHTML = `<div class="login-wrap"><div class="login-box game-panel"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">PLAYER CREATED</p><h1>생성 완료</h1><p>개인키는 로그인 복구용입니다. 안전한 곳에 보관하세요.</p><div class="field"><label>닉네임</label><input value="${escapeHtml(user.nickname)}" readonly></div><div class="field"><label>개인키</label><input id="copyKey" value="${user.key}" readonly></div><button class="btn" id="copy">개인키 복사</button><button class="btn secondary" id="go">게임 시작</button></div></div>`;
  document.getElementById('copy').onclick = async () => { await navigator.clipboard.writeText(user.key); alert('개인키가 복사되었습니다.'); };
  document.getElementById('go').onclick = () => renderShell('buy');
}

function renderShell(tab) {
  const user = loadUser();
  if (!user) return renderLogin();
  const views = { buy: buyView, dex: dexView, attendance: attendanceView, rank: rankView };
  app.innerHTML = `<main class="page"><div class="ambient-lines"></div><header class="header"><div class="brand"><img class="brand-logo" src="assets/ui/cninelogo.png" alt="CNINE"><div><p class="eyebrow">CNINE CARD COLLECTION</p><h1>씨켓몬 카드뽑기</h1></div></div><nav class="tabs"><button class="tab ${tab==='buy'?'active':''}" data-tab="buy">카드팩</button><button class="tab ${tab==='dex'?'active':''}" data-tab="dex">도감</button><button class="tab ${tab==='attendance'?'active':''}" data-tab="attendance">접속보상</button><button class="tab ${tab==='rank'?'active':''}" data-tab="rank">랭킹</button></nav></header>${(views[tab]||buyView)(user)}</main><div id="modal" class="modal"></div>`;
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => renderShell(b.dataset.tab));
  bindView(tab);
  loadRecentHighGradeFeed();
}

function summaryBar(user) {
  return `<section class="summary-bar"><div><span>PLAYER</span><b>${escapeHtml(user.nickname)}</b></div><div><span>COIN</span><b class="coin-value">◈ ${user.coin.toLocaleString()}</b></div><div><span>COLLECTION</span><b>${ownedIds(user).size} / ${cards.length}</b></div><div><span>CARD SCORE</span><b>${cardScore(user).toLocaleString()}점</b></div></section><section class="high-grade-feed" aria-live="polite"><span class="high-grade-label">UR+ 획득 소식</span><div class="high-grade-viewport"><div id="highGradeTrack" class="high-grade-track"><span class="high-grade-empty">최근 UR 이상 획득 기록을 불러오는 중...</span></div></div></section>`;
}

async function loadRecentHighGradeFeed(){
  const track=document.getElementById('highGradeTrack');
  if(!track)return;
  if(!API_MODE){track.innerHTML='<span class="high-grade-empty">서버 연결 시 UR 이상 획득 소식이 표시됩니다.</span>';return;}
  try{
    const data=await apiRequest('recent-high-grade');
    const items=Array.isArray(data.items)?data.items:[];
    if(!items.length){track.innerHTML='<span class="high-grade-empty">아직 UR 이상 획득 기록이 없습니다.</span>';return;}
    const messages=items.map(item=>`<span class="high-grade-item grade-${escapeHtml(item.rarity)}"><b>"${escapeHtml(item.nickname)}"</b> 님이 <strong>${escapeHtml(item.card_title)} [${escapeHtml(item.rarity)}]</strong> 카드를 획득했습니다.</span>`).join('');
    track.innerHTML=messages+messages;
    track.classList.toggle('static',items.length===1);
  }catch(error){track.innerHTML='<span class="high-grade-empty">획득 소식을 불러오지 못했습니다.</span>';}
}

function packSelector() {
  return `<section class="pack-selector"><div class="pack-selector-head"><div><p class="eyebrow">SELECT CARD PACK</p><h2>카드팩 선택</h2></div><span>팩마다 가격과 등장 범위가 다릅니다.</span></div><div class="pack-list">${PACKS.map(pack => `<button class="pack-choice ${pack.id===selectedPackId?'active':''}" data-pack-id="${pack.id}"><span class="mini-pack ${pack.theme}"><i></i><b>${pack.subtitle}</b></span><strong>${pack.name}</strong><small>${pack.description}</small><em>${pack.range} · 1장 ${pack.price}코인</em></button>`).join('')}</div></section>`;
}

function buyView(user) {
  const pack = getPack(selectedPackId);
  return `${summaryBar(user)}${packSelector()}<section class="game-hero pack-theme-${pack.theme}"><div class="hero-copy"><p class="eyebrow">${pack.subtitle}</p><h2>${escapeHtml(pack.name)}을<br><em>개봉하세요</em></h2><p>${escapeHtml(pack.description)}<br>10연속 ${pack.guarantee10} 이상 1장 · 20연속 ${pack.guarantee20} 이상 1장 보장</p><div class="draw-options"><button class="btn draw" data-pack-id="${pack.id}" data-count="1" data-cost="${pack.price}"><small>1 CARD</small>${pack.price}코인</button><button class="btn draw hot" data-pack-id="${pack.id}" data-count="10" data-cost="${pack.price*10}"><small>10 CARDS · ${pack.guarantee10}+</small>${(pack.price*10).toLocaleString()}코인</button><button class="btn draw premium-btn" data-pack-id="${pack.id}" data-count="20" data-cost="${pack.price*20}"><small>20 CARDS · ${pack.guarantee20}+</small>${(pack.price*20).toLocaleString()}코인</button></div></div><div class="hero-pack-zone"><div class="pack-aura"></div>${packArt(pack)}</div></section><section class="dashboard-grid"><aside class="side-panel"><div class="panel-title"><div><p class="eyebrow">RECENT DROP</p><h2>최근 획득</h2></div><span>${user.history.length}회</span></div>${recentCards(user)}<button class="text-btn" id="goDex">전체 도감 열기 →</button></aside><aside class="collection-panel"><p class="eyebrow">RANK SCORE</p><h2>내 카드 점수</h2><div class="score-orb"><b>${cardScore(user).toLocaleString()}</b><span>POINT</span></div><p>높은 등급 카드일수록 점수가 큽니다.</p></aside></section>`;
}

function recentCards(user) {
  const items = user.history.slice(-4).reverse();
  if (!items.length) return '<div class="empty-recent">아직 획득한 카드가 없습니다.<br>첫 카드를 뽑아보세요.</div>';
  return `<div class="recent-grid">${items.map(item => { const c=cards.find(x=>x.id===item.cardId); if(!c)return''; return `<button class="recent-item" data-card-id="${c.id}"><img src="${c.image}" style="object-position:${c.focusX}% ${c.focusY}%"><span><b>${escapeHtml(c.title)}</b><small>${c.grade}${item.duplicate?' · 보유중':' · NEW'}</small></span></button>`; }).join('')}</div>`;
}

function packArt(pack) {
  return `<div class="pack-envelope ${pack.theme}"><div class="pack-crimp top"></div><div class="pack-top"></div><div class="pack-shine"></div><div class="pack-energy"></div><img src="assets/ui/cninelogo.png" class="pack-brand-logo" alt="CNINE"><div class="pack-name">${pack.subtitle}</div><div class="pack-range">${pack.range}</div><div class="pack-cut"></div><div class="pack-crimp bottom"></div></div>`;
}

function dexView(user) {
  const owned = ownedIds(user);
  const names = [...new Set(cards.map(c => c.name))];
  return `${summaryBar(user)}<section class="dex-cover"><div><p class="eyebrow">MY COLLECTION ALBUM</p><h2>씨켓몬 도감</h2><p>멤버별 앨범을 펼쳐 수집한 카드를 확인하세요.</p></div><div class="dex-total"><b>${owned.size}</b><span>/ ${cards.length} CARDS</span></div></section><div class="dex-search"><input id="dexSearch" placeholder="카드명 또는 멤버 검색"><select id="gradeFilter"><option value="">전체 등급</option>${['SSR','UR','HR','SR','R','U','C'].map(g=>`<option>${g}</option>`).join('')}</select></div><div id="dexSections">${names.map((name,index)=>dexSection(name,owned,index)).join('')}</div>`;
}
function dexSection(name, owned, index=0) {
  const list = cards.filter(c=>c.name===name); const got=list.filter(c=>owned.has(c.id)).length;
  return `<section class="dex-section ${index>1?'collapsed':''}" data-member="${escapeHtml(name)}"><button class="dex-section-head"><span><i class="fold-icon">⌄</i><strong>${escapeHtml(name)}</strong><small>COLLECTION ALBUM</small></span><b>${got} / ${list.length}</b></button><div class="album-grid">${list.map(c=>cardHtml(c,owned.has(c.id),'small')).join('')}</div></section>`;
}

function attendanceView(user) {
  const claimable = canClaimAttendance(user);
  return `${summaryBar(user)}<section class="attendance-panel"><div class="attendance-glow"></div><div class="attendance-copy"><p class="eyebrow">DAILY LOGIN REWARD</p><h2>오늘의 접속 보상</h2><p>매일 접속해서 카드팩에 사용할 코인을 받아가세요.<br>날짜 판정은 한국 시간 기준입니다.</p><div class="attendance-stats"><span>누적 출석 <b>${user.attendance.totalDays || 0}일</b></span><span>오늘 상태 <b>${claimable?'수령 가능':'수령 완료'}</b></span></div><button class="btn attendance-claim" id="claimAttendance" ${claimable?'':'disabled'}>${claimable?'500코인 받기':'오늘 보상 수령 완료'}</button></div><div class="attendance-reward"><span>DAILY</span><strong>◈ 500</strong><small>COIN REWARD</small></div></section>`;
}

function rankView(user) {
  const breakdown = scoreBreakdown(user);
  return `${summaryBar(user)}<section class="rank-panel"><div class="rank-main"><p class="eyebrow">CARD GRADE SCORE RANKING</p><h2>카드 점수 랭킹</h2><p>보유한 서로 다른 카드의 등급 점수를 모두 합산합니다.</p><div class="my-rank-score"><span>내 카드 점수</span><strong>${cardScore(user).toLocaleString()}점</strong><small>${API_MODE?'전체 이용자 순위를 불러옵니다.':'로컬 테스트 점수입니다.'}</small></div><div id="serverRanking" class="server-ranking">${API_MODE?'랭킹 불러오는 중...':'D1 연결 후 전체 랭킹이 표시됩니다.'}</div></div><div class="score-table"><div class="score-row head"><span>등급</span><span>보유</span><span>장당 점수</span><span>합계</span></div>${breakdown.map(item => `<div class="score-row"><b class="score-grade grade-text-${item.grade}">${item.grade}</b><span>${item.count}장</span><span>${item.score}점</span><strong>${(item.count*item.score).toLocaleString()}점</strong></div>`).join('')}</div></section>`;
}
async function loadServerRanking(){
  if(!API_MODE)return;
  const target=document.getElementById('serverRanking');
  if(!target)return;
  try{const data=await apiRequest('ranking');target.innerHTML=`<div class="rank-list">${data.ranking.slice(0,20).map((row,index)=>`<div class="rank-list-row"><b>${index+1}</b><span>${escapeHtml(row.nickname)}</span><strong>${Number(row.score).toLocaleString()}점</strong></div>`).join('')}</div>`}catch(error){target.textContent=error.message}
}

function bindView(tab) {
  document.querySelectorAll('.pack-choice').forEach(button => button.onclick = () => { selectedPackId = button.dataset.packId; renderShell('buy'); });
  document.querySelectorAll('.draw').forEach(b => b.onclick = () => openPack(b.dataset.packId, Number(b.dataset.count), Number(b.dataset.cost)));
  document.querySelectorAll('.recent-item').forEach(b => b.onclick = () => showDetail(b.dataset.cardId));
  const goDex=document.getElementById('goDex'); if(goDex)goDex.onclick=()=>renderShell('dex');
  const claim = document.getElementById('claimAttendance');
  if (claim) claim.onclick = claimAttendance;
  if(tab==='rank') loadServerRanking();
  if(tab==='dex') {
    document.querySelectorAll('.dex-section-head').forEach(h=>h.onclick=()=>h.closest('.dex-section').classList.toggle('collapsed'));
    document.querySelectorAll('.card-frame').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
    const search=document.getElementById('dexSearch'), filter=document.getElementById('gradeFilter');
    const apply=()=>{ const q=search.value.trim().toLowerCase(), g=filter.value; document.querySelectorAll('.dex-section').forEach(section=>{ let visible=0; section.querySelectorAll('.card-frame').forEach(el=>{ const c=cards.find(x=>x.id===el.dataset.id); const show=(!q||c.title.toLowerCase().includes(q)||c.name.toLowerCase().includes(q))&&(!g||c.grade===g); el.style.display=show?'':'none'; if(show)visible++; }); section.style.display=visible?'':'none'; if(q||g)section.classList.remove('collapsed'); }); };
    search.oninput=apply; filter.onchange=apply;
  }
}

function claimAttendance() {
  const user = loadUser();
  if (!canClaimAttendance(user)) return alert('오늘 접속 보상은 이미 받았습니다.');
  user.coin += 500;
  user.attendance.lastClaimDate = kstDateKey();
  user.attendance.totalDays = (user.attendance.totalDays || 0) + 1;
  saveUser(user);
  alert('오늘의 접속 보상 500코인을 받았습니다.');
  renderShell('attendance');
}

function makeDraws(pack, count) {
  const result=[];
  for(let i=0;i<count;i++) result.push(pickCard(pack));
  const guarantee = count === 10 ? pack.guarantee10 : count === 20 ? pack.guarantee20 : null;
  if (guarantee && !result.some(c => gradeOrder[c.grade] >= gradeOrder[guarantee])) result[result.length-1] = pickCard(pack, guarantee);
  return result.sort((a,b)=>gradeOrder[b.grade]-gradeOrder[a.grade]);
}

function openPack(packId, count, cost) {
  const user=loadUser(), pack=getPack(packId);
  if(!cards.length)return alert('카드 데이터를 불러오지 못했습니다.');
  if(user.coin<cost)return alert('코인이 부족합니다.');
  const draws=makeDraws(pack,count), modal=document.getElementById('modal');
  modal.className='modal show opening-modal';
  modal.innerHTML=`<div class="modal-panel draw-stage opening-panel"><p class="eyebrow">PACK OPENING</p><h2>${escapeHtml(pack.name)} · ${count}장</h2><div class="pack-open pack-opening">${packArt(pack)}<div class="tear-line"></div><div class="flash"></div></div><p class="message opening-message">봉투가 강하게 흔들립니다...</p></div>`;
  setTimeout(()=>{ const el=document.querySelector('.opening-message'); if(el)el.textContent='빛이 터져 나오고 있습니다...'; },650);
  setTimeout(()=>document.querySelector('.pack-opening')?.classList.add('tearing'),1050);
  setTimeout(()=>{
    user.coin-=cost;
    const owned=ownedIds(user), results=draws.map(card=>{ const duplicate=owned.has(card.id); user.history.push({cardId:card.id,packId:pack.id,at:new Date().toISOString(),duplicate}); if(!duplicate){user.owned.push(card.id);owned.add(card.id);} return {card,duplicate}; });
    saveUser(user);
    modal.className='modal show results-modal';
    modal.innerHTML=`<div class="modal-panel multi-result-panel"><div class="result-head"><div><p class="eyebrow">PACK RESULT</p><h2>${escapeHtml(pack.name)} · ${count}장 획득</h2></div><button class="icon-close" id="closeResult">×</button></div><div class="result-grid count-${count}">${results.map(({card,duplicate})=>`<div class="result-item"><span class="result-label ${duplicate?'dupe':'new'}">${duplicate?'보유중':'NEW'}</span>${cardHtml(card,true,'result-card')}</div>`).join('')}</div><div class="result-actions"><button class="btn" id="drawAgain">같은 팩 다시 뽑기</button><button class="btn secondary" id="confirmResult">확인</button></div></div>`;
    document.querySelectorAll('.result-card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
    document.getElementById('closeResult').onclick=document.getElementById('confirmResult').onclick=()=>renderShell('buy');
    document.getElementById('drawAgain').onclick=()=>{ modal.className='modal'; openPack(pack.id,count,cost); };
  },1550);
}

function cardHtml(card, owned, classes='') {
  if(!owned)return `<article class="card-frame locked ${classes}" data-id="${card.id}"><div class="card-inner"><div class="card-art"><span class="missing">?</span></div><div class="card-footer"><div class="card-title">미획득 카드</div></div></div></article>`;
  return `<article class="card-frame grade-${card.grade} ${classes}" data-id="${card.id}"><div class="card-holo"></div><div class="card-inner"><div class="card-header"><span>${card.grade}</span><b>CNINE</b></div><div class="card-art"><img loading="lazy" src="${card.image}" alt="${escapeHtml(card.title)}" style="object-position:${card.focusX}% ${card.focusY}%"></div><div class="card-footer"><div><small>${escapeHtml(card.name)}</small><div class="card-title">${escapeHtml(card.title)}</div></div><img src="assets/ui/cninelogo.png" class="card-mini-logo" alt="CNINE"></div></div></article>`;
}

function showDetail(id) {
  const user=loadUser(), card=cards.find(c=>c.id===id); if(!card)return;
  const owned=ownedIds(user).has(id), history=user.history.find(x=>x.cardId===id), modal=document.getElementById('modal');
  modal.className='modal show detail-modal';
  modal.innerHTML=`<div class="modal-panel detail-panel"><button class="icon-close detail-close" id="closeDetail">×</button><div class="detail-layout">${cardHtml(card,owned,'detail-card')}<div class="detail-info"><p class="eyebrow">CARD PROFILE</p><span class="detail-grade">${owned?card.grade:'?'}</span><h2>${owned?escapeHtml(card.title):'미획득 카드'}</h2><p>${owned?escapeHtml(card.name):'아직 획득하지 못했습니다.'}</p>${history?`<p class="obtained-date">최초 획득<br><strong>${new Date(history.at).toLocaleString('ko-KR')}</strong></p>`:''}<button class="btn dark" id="closeDetail2">닫기</button></div></div></div>`;
  document.getElementById('closeDetail').onclick=document.getElementById('closeDetail2').onclick=()=>modal.className='modal';
}


// ===== V1.4 D1 API bridge: API가 없으면 기존 LocalStorage 모드로 자동 전환 =====
let API_MODE=false, API_TOKEN=localStorage.getItem('cnine_card_api_token')||'';
async function apiRequest(path, options={}) { const response=await fetch(`api/${path}`,{...options,headers:{'content-type':'application/json','authorization':API_TOKEN?`Bearer ${API_TOKEN}`:'',...(options.headers||{})}}); const data=await response.json(); if(!response.ok) throw new Error(data.error||'서버 요청 실패'); return data; }
async function detectApi(){try{const r=await fetch('api/health',{cache:'no-store'});API_MODE=r.ok}catch{API_MODE=false}}
function apiUserToLocal(u,key){const old=loadUser();return {nickname:u.nickname,key:key||old?.key||'',coin:u.coin,owned:u.owned||[],history:old?.history||[],attendance:old?.attendance||{lastClaimDate:null,totalDays:0},serverUserId:u.id,testCoinGrantedV13:true}}
async function init(){migrateLegacyUser();renderLoading();await detectApi();try{if(API_MODE){const cr=await apiRequest('cards');cards=cr.cards;if(API_TOKEN){try{const me=await apiRequest('me');saveUser(apiUserToLocal(me.user));}catch{API_TOKEN='';localStorage.removeItem('cnine_card_api_token')}}}else{const response=await fetch('data/cards.json',{cache:'no-store'});cards=await response.json()}}catch(e){console.error(e);try{cards=await (await fetch('data/cards.json')).json()}catch{cards=[]}}setTimeout(()=>loadUser()?renderShell('buy'):renderLogin(),250)}
function renderLogin(){app.innerHTML=`<div class="login-wrap"><div class="login-box game-panel"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CNINE COLLECTION GAME</p><h1>씨켓몬 카드뽑기</h1><p>${API_MODE?'D1 서버 연결됨':'로컬 테스트 모드'}</p><div class="field"><label for="nickname">와이고수 닉네임</label><input id="nickname" maxlength="20" placeholder="닉네임을 입력하세요"></div><button class="btn" id="start">처음 시작하기</button><div class="login-divider"></div><div class="field"><label for="key">개인키 로그인</label><input id="key" placeholder="CN-XXXX-XXXX-XXXX"></div><button class="btn secondary" id="login">개인키로 로그인</button></div></div>`;document.getElementById('start').onclick=async()=>{const nickname=document.getElementById('nickname').value.trim();if(!nickname)return alert('닉네임을 입력해주세요.');if(!API_MODE){const user={nickname,key:generateKey(),coin:TEST_COIN,owned:[],history:[],attendance:{lastClaimDate:null,totalDays:0},testCoinGrantedV13:true};saveUser(user);return renderCreated(user)}try{const d=await apiRequest('auth/register',{method:'POST',body:JSON.stringify({nickname})});API_TOKEN=d.token;localStorage.setItem('cnine_card_api_token',API_TOKEN);const user=apiUserToLocal(d.user,d.privateKey);saveUser(user);renderCreated(user)}catch(e){alert(e.message)}};document.getElementById('login').onclick=async()=>{const key=document.getElementById('key').value.trim();if(!API_MODE){const u=loadUser();if(!u||u.key!==key)return alert('저장된 개인키와 일치하지 않습니다.');return renderShell('buy')}try{const d=await apiRequest('auth/login',{method:'POST',body:JSON.stringify({privateKey:key})});API_TOKEN=d.token;localStorage.setItem('cnine_card_api_token',API_TOKEN);saveUser(apiUserToLocal(d.user,key));renderShell('buy')}catch(e){alert(e.message)}}}
async function claimAttendance(){if(!API_MODE){const user=loadUser();if(!canClaimAttendance(user))return alert('오늘 접속 보상은 이미 받았습니다.');user.coin+=500;user.attendance.lastClaimDate=kstDateKey();user.attendance.totalDays=(user.attendance.totalDays||0)+1;saveUser(user);alert('오늘의 접속 보상 500코인을 받았습니다.');return renderShell('attendance')}try{const d=await apiRequest('attendance/claim',{method:'POST'});const u=apiUserToLocal(d.user);u.attendance={lastClaimDate:kstDateKey(),totalDays:(loadUser()?.attendance?.totalDays||0)+1};saveUser(u);alert(`오늘의 접속 보상 ${d.reward}코인을 받았습니다.`);renderShell('attendance')}catch(e){alert(e.message)}}
const localOpenPack=openPack;
openPack=async function(packId,count,cost){if(!API_MODE)return localOpenPack(packId,count,cost);const pack=getPack(packId),modal=document.getElementById('modal');modal.className='modal show opening-modal';modal.innerHTML=`<div class="modal-panel draw-stage opening-panel"><p class="eyebrow">PACK OPENING</p><h2>${escapeHtml(pack.name)} · ${count}장</h2><div class="pack-open pack-opening">${packArt(pack)}<div class="tear-line"></div><div class="flash"></div></div><p class="message opening-message">서버에서 카드를 결정하고 있습니다...</p></div>`;try{const d=await apiRequest('draw',{method:'POST',body:JSON.stringify({packId,count})});saveUser(apiUserToLocal(d.user));setTimeout(()=>{modal.className='modal show results-modal';modal.innerHTML=`<div class="modal-panel multi-result-panel"><div class="result-head"><div><p class="eyebrow">PACK RESULT</p><h2>${escapeHtml(pack.name)} · ${count}장 획득</h2></div><button class="icon-close" id="closeResult">×</button></div><div class="result-grid count-${count}">${d.results.map(({card,duplicate})=>`<div class="result-item"><span class="result-label ${duplicate?'dupe':'new'}">${duplicate?'보유중':'NEW'}</span>${cardHtml(card,true,'result-card')}</div>`).join('')}</div><div class="result-actions"><button class="btn" id="drawAgain">같은 팩 다시 뽑기</button><button class="btn secondary" id="confirmResult">확인</button></div></div>`;document.querySelectorAll('.result-card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));document.getElementById('closeResult').onclick=document.getElementById('confirmResult').onclick=()=>renderShell('buy');document.getElementById('drawAgain').onclick=()=>{modal.className='modal';openPack(pack.id,count,pack.price*count)}},900)}catch(e){modal.className='modal';alert(e.message)}}
init();
