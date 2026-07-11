const app = document.getElementById('app');
const STORAGE_KEY = 'cnine_card_user_v10';
const LEGACY_STORAGE_KEYS = ['cnine_card_user_v08', 'cnine_card_user'];
const TEST_COIN = 5000;
let cards = [];
let selectedPackId = 'basic';

const gradeOrder = { LIMITED: 10, FUR: 9, MA: 8, SSR: 7, UR: 6, HR: 5, SR: 4, R: 3, U: 2, C: 1 };
const gradeScore = { LIMITED: 3000, FUR: 5000, MA: 1500, SSR: 500, UR: 200, HR: 100, SR: 50, R: 20, U: 5, C: 1 };
const baseRates = { FUR: 0, MA: 0, SSR: 1, UR: 4, HR: 7, SR: 13, R: 20, U: 25, C: 30 };
const shardReward = { LIMITED:180, FUR:250, MA:120, SSR:60, UR:30, HR:15, SR:8, R:4, U:2, C:1 };
const breakthroughCosts = [50,100,200,350,550,800,1100,1450,1850,2300];
const breakthroughRates = [100,100,100,80,65,50,35,25,15,8];
const breakthroughMinGrade = 'SR';

let PACKS = [
  {
    id: 'basic', name: '일반 카드팩', subtitle: 'STANDARD PACK', theme: 'basic',
    description: '모든 등급이 등장하는 기본 카드팩', range: 'C ~ FUR', price: 10,
    allowed: ['C','U','R','SR','HR','UR','SSR','MA','FUR'], guarantee10: 'R', guarantee20: 'SR'
  },
  {
    id: 'advanced', name: '고급 카드팩', subtitle: 'ADVANCED PACK', theme: 'advanced',
    description: '커먼을 제외한 U 이상 카드팩', range: 'U ~ FUR', price: 25,
    allowed: ['U','R','SR','HR','UR','SSR','MA','FUR'], guarantee10: 'SR', guarantee20: 'HR'
  },
  {
    id: 'premium', name: '프리미엄 카드팩', subtitle: 'PREMIUM PACK', theme: 'premium',
    description: 'R 이상만 등장하는 고급 수집팩', range: 'R ~ FUR', price: 60,
    allowed: ['R','SR','HR','UR','SSR','MA','FUR'], guarantee10: 'HR', guarantee20: 'UR'
  },
  {
    id: 'pickup', name: '리미티드팩', subtitle: 'LIMITED PACK', theme: 'pickup',
    description: '별도 확률로 한정판 카드 등장', range: 'C ~ FUR + LIMITED', price: 30,
    allowed: ['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'], guarantee10: 'R', guarantee20: 'SR', limitedRate: 1
  }
];

function packRangeFromAllowed(allowed = []) {
  const ordered = ['C','U','R','SR','HR','UR','SSR','MA','FUR'];
  const normal = ordered.filter(g => allowed.includes(g));
  if (!normal.length) return allowed.includes('LIMITED') ? 'LIMITED' : '-';
  const base = normal.length === 1 ? normal[0] : `${normal[0]} ~ ${normal.at(-1)}`;
  return allowed.includes('LIMITED') ? `${base} + LIMITED` : base;
}

function applyServerPacks(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return;
  PACKS = rows.map(row => {
    let allowed = row.allowed;
    if (!Array.isArray(allowed)) {
      try { allowed = JSON.parse(row.allowed_rarities || '[]'); } catch { allowed = []; }
    }
    return {
      id: String(row.id),
      name: row.name || '카드팩',
      subtitle: row.subtitle || 'CARD PACK',
      theme: row.theme || 'basic',
      description: row.description || '',
      range: packRangeFromAllowed(allowed),
      price: Math.max(0, Number(row.price) || 0),
      allowed,
      guarantee10: row.guarantee10 || row.guarantee_10 || 'R',
      guarantee20: row.guarantee20 || row.guarantee_20 || 'SR',
      limitedRate: Number(row.limitedRate || row.limited_rate || 0) || 0
    };
  });
  if (!PACKS.some(pack => pack.id === selectedPackId)) selectedPackId = PACKS[0].id;
}

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
    user.cardShards ??= 0;
    user.breakthroughs ??= {};
    user.quantities ??= {};
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
function cardScore(user) { const owned = ownedIds(user); return cards.reduce((sum, card) => { if(!owned.has(card.id)) return sum; const level=Number(user.breakthroughs?.[card.id]||0); return sum + gradeScore[card.grade] + Math.round(gradeScore[card.grade] * level * 0.12); }, 0); }
function scoreBreakdown(user) {
  const owned = ownedIds(user);
  return ['LIMITED','FUR','MA','SSR','UR','HR','SR','R','U','C'].map(grade => ({ grade, count: cards.filter(c => c.grade === grade && owned.has(c.id)).length, score: gradeScore[grade] }));
}

function pickGrade(allowedGrades) {
  const filtered = allowedGrades.map(grade => ({ grade, rate: baseRates[grade] || 0 })).filter(x => x.rate > 0);
  let roll = Math.random() * filtered.reduce((sum, x) => sum + x.rate, 0);
  for (const item of filtered) { roll -= item.rate; if (roll < 0) return item.grade; }
  return filtered.at(-1)?.grade || 'C';
}

function pickCard(pack, guaranteed = null) {
  if (pack.id === 'pickup' && !guaranteed && Math.random() * 100 < (pack.limitedRate || 0)) {
    const limitedPool = cards.filter(c => c.limitedTotal !== null && c.limitedTotal !== undefined);
    if (limitedPool.length) return limitedPool[Math.floor(Math.random() * limitedPool.length)];
  }
  let allowed = [...pack.allowed].filter(g => g !== 'LIMITED');
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
  if(tab==='pvp'&&!pvpFeatureEnabled)tab='buy';
  const user = loadUser();
  if (!user) return renderLogin();
  const views = { buy: buyView, dex: dexView, battle: battleView, pvp: pvpView, attendance: attendanceView, rank: rankView };
  app.innerHTML = `<main class="page"><div class="ambient-lines"></div><header class="header"><div class="brand"><img class="brand-logo" src="assets/ui/cninelogo.png" alt="CNINE"><div><p class="eyebrow">CNINE CARD COLLECTION</p><h1>씨켓몬 카드뽑기</h1></div></div><nav class="tabs"><button class="tab ${tab==='buy'?'active':''}" data-tab="buy">카드팩</button><button class="tab ${tab==='dex'?'active':''}" data-tab="dex">도감</button><button class="tab ${tab==='battle'?'active':''}" data-tab="battle">PVE</button>${pvpFeatureEnabled?`<button class="tab ${tab==='pvp'?'active':''}" data-tab="pvp">PVP</button>`:''}<button class="tab ${tab==='attendance'?'active':''}" data-tab="attendance">접속보상</button><button class="tab ${tab==='rank'?'active':''}" data-tab="rank">랭킹</button></nav></header>${(views[tab]||buyView)(user)}</main><div id="modal" class="modal"></div>`;
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => renderShell(b.dataset.tab));
  bindView(tab);
  loadRecentHighGradeFeed();
}

function summaryBar(user) {
  return `<section class="summary-bar"><div class="login-summary"><span>로그인 중</span><div class="login-summary-row"><i class="login-dot"></i><b>${escapeHtml(user.nickname)}</b><button id="playerAccountBtn" type="button">내 정보</button></div></div><div><span>COIN</span><b class="coin-value">◈ ${Number(user.coin||0).toLocaleString()}</b><small class="shard-value">🧩 카드 조각 ${Number(user.cardShards||0).toLocaleString()}</small></div><div><span>COLLECTION</span><b>${ownedIds(user).size} / ${cards.length}</b></div><div><span>CARD SCORE</span><b>${cardScore(user).toLocaleString()}점</b></div></section><section class="high-grade-feed" aria-live="polite"><span class="high-grade-label">UR+ 획득 소식</span><div class="high-grade-viewport"><div id="highGradeTrack" class="high-grade-track"><span class="high-grade-empty">최근 UR 이상 획득 기록을 불러오는 중...</span></div></div></section>`;
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
  return `${summaryBar(user)}<section class="dex-cover"><div><p class="eyebrow">MY COLLECTION ALBUM</p><h2>씨켓몬 도감</h2><p>멤버별 앨범을 펼쳐 수집한 카드를 확인하세요.</p></div><div class="dex-total"><b>${owned.size}</b><span>/ ${cards.length} CARDS</span></div></section><div class="dex-search"><input id="dexSearch" placeholder="카드명 또는 멤버 검색"><select id="gradeFilter"><option value="">전체 등급</option>${['LIMITED','FUR','MA','SSR','UR','HR','SR','R','U','C'].map(g=>`<option>${g}</option>`).join('')}</select></div><div id="dexSections">${names.map((name,index)=>dexSection(name,owned,index)).join('')}</div>`;
}
function dexSection(name, owned, index=0) {
  const list = cards.filter(c=>c.name===name); const got=list.filter(c=>owned.has(c.id)).length;
  return `<section class="dex-section ${index>1?'collapsed':''}" data-member="${escapeHtml(name)}"><button class="dex-section-head"><span><i class="fold-icon">⌄</i><strong>${escapeHtml(name)}</strong><small>COLLECTION ALBUM</small></span><b>${got} / ${list.length}</b></button><div class="album-grid">${list.map(c=>cardHtml(c,owned.has(c.id),'small')).join('')}</div></section>`;
}


function battleView(user){
  return `${summaryBar(user)}<section class="battle-cover"><div><p class="eyebrow">CNINE PVE BATTLE</p><h2>몬스터 토벌전</h2><p>보유한 멤버 카드 5장을 편성하세요. 등급과 돌파 단계만으로 전투력이 계산됩니다.</p></div><div class="battle-cover-side"><div class="battle-energy-card"><div><span>⚔ 전투 횟수</span><b id="battleEnergyCount">- / -</b></div><div class="battle-energy-track"><i id="battleEnergyFill"></i></div><small id="battleEnergyTimer">불러오는 중...</small></div><div class="battle-total"><span>편성 전투력</span><b id="battleDeckPower">0</b></div></div></section><section class="battle-layout"><div class="battle-panel"><div class="panel-title"><div><p class="eyebrow">MY DECK</p><h2>멤버 카드 5장 편성</h2></div><button class="text-btn" id="clearBattleDeck">초기화</button></div><div id="battleDeck" class="battle-deck"></div><div id="battleCards" class="battle-card-picker"><div class="empty-recent">전투 정보를 불러오는 중...</div></div></div><aside class="battle-panel monster-panel"><div class="panel-title"><div><p class="eyebrow">PVE ENEMY</p><h2>몬스터 선택</h2></div></div><div id="battleMonsters" class="battle-monsters"></div><button class="btn battle-start" id="battleStart" disabled>전투 시작</button></aside></section>`;
}
let battleState={config:null,monsters:[],selectedMonster:null,deck:[],energy:null,energyTimer:null,serverOffset:0};

function stopBattleEnergyTimer(){if(battleState.energyTimer){clearInterval(battleState.energyTimer);battleState.energyTimer=null}}
function battleEnergyText(ms){const sec=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function renderBattleEnergy(){const e=battleState.energy,count=document.getElementById('battleEnergyCount'),fill=document.getElementById('battleEnergyFill'),timer=document.getElementById('battleEnergyTimer');if(!e||!count)return;count.textContent=e.unlimited?'∞ 무제한':`${e.energy} / ${e.maxEnergy}`;if(fill)fill.style.width=`${e.unlimited?100:Math.max(0,Math.min(100,e.energy/e.maxEnergy*100))}%`;if(timer){if(e.unlimited)timer.textContent='관리자';else if(e.energy>=e.maxEnergy)timer.textContent='충전 완료';else if(e.nextRechargeAt){const remain=Date.parse(e.nextRechargeAt)-(Date.now()+battleState.serverOffset);timer.textContent=remain<=0?'충전 갱신 중...':`다음 충전 ${battleEnergyText(remain)}`;}else timer.textContent='충전 대기';}const start=document.getElementById('battleStart');if(start){const noEnergy=!e.unlimited&&e.energy<e.costPerBattle;start.disabled=battleState.deck.length!==5||!battleState.selectedMonster||noEnergy;start.textContent=noEnergy?'전투 횟수 부족':'전투 시작';}}
function startBattleEnergyTimer(){stopBattleEnergyTimer();renderBattleEnergy();battleState.energyTimer=setInterval(()=>{if(!document.getElementById('battleEnergyCount'))return stopBattleEnergyTimer();const e=battleState.energy;if(e&&!e.unlimited&&e.nextRechargeAt&&Date.parse(e.nextRechargeAt)<=(Date.now()+battleState.serverOffset)){loadBattleEnergyOnly();return}renderBattleEnergy()},1000)}
async function loadBattleEnergyOnly(){try{const d=await apiRequest('battle/config');battleState.energy=d.energy;battleState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();startBattleEnergyTimer()}catch(_){renderBattleEnergy()}}

function battleCardPower(card,user,settings){const base=Number(settings?.powerByGrade?.[card.grade]||0),lv=Number(user.breakthroughs?.[card.id]||0),pct=Number(settings?.breakthroughBonus?.[lv]||0);return Math.floor(base*(1+pct/100));}
async function loadBattleView(){
  if(!API_MODE){document.getElementById('battleCards').innerHTML='<div class="empty-recent">전투 콘텐츠는 D1 서버 연결 모드에서 이용할 수 있습니다.</div>';return;}
  try{const d=await apiRequest('battle/config');battleState={config:d.settings,monsters:d.monsters||[],selectedMonster:d.monsters?.[0]?.id||null,deck:[],energy:d.energy||null,energyTimer:null,serverOffset:Date.parse(d.serverNow||new Date().toISOString())-Date.now()};renderBattleBuilder();startBattleEnergyTimer();}catch(e){document.getElementById('battleCards').innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`;}
}
function renderBattleBuilder(){const user=loadUser(),owned=cards.filter(c=>ownedIds(user).has(c.id)).sort((a,b)=>battleCardPower(b,user,battleState.config)-battleCardPower(a,user,battleState.config));const deckSet=new Set(battleState.deck),power=battleState.deck.reduce((n,id)=>{const c=cards.find(x=>x.id===id);return n+(c?battleCardPower(c,user,battleState.config):0)},0);document.getElementById('battleDeckPower').textContent=power.toLocaleString();document.getElementById('battleDeck').innerHTML=battleState.deck.length?battleState.deck.map(id=>{const c=cards.find(x=>x.id===id);return `<button class="battle-deck-card" data-remove="${c.id}"><img src="${c.image}"><span>${escapeHtml(c.title)}</span><b>${battleCardPower(c,user,battleState.config).toLocaleString()}</b></button>`}).join('')+Array.from({length:5-battleState.deck.length},()=>'<div class="battle-empty-slot">+</div>').join(''):Array.from({length:5},()=>'<div class="battle-empty-slot">+</div>').join('');document.getElementById('battleCards').innerHTML=owned.map(c=>`<button class="battle-pick-card ${deckSet.has(c.id)?'selected':''}" data-pick="${c.id}" ${deckSet.has(c.id)?'disabled':''}><img src="${c.image}" style="object-position:${c.focusX}% ${c.focusY}%"><span><b>${escapeHtml(c.title)}</b><small>${c.grade} · ★${Number(user.breakthroughs?.[c.id]||0)}</small></span><strong>${battleCardPower(c,user,battleState.config).toLocaleString()}</strong></button>`).join('')||'<div class="empty-recent">보유 카드가 없습니다.</div>';document.getElementById('battleMonsters').innerHTML=battleState.monsters.map(m=>`<button class="monster-choice ${Number(battleState.selectedMonster)===Number(m.id)?'active':''}" data-monster="${m.id}">${m.image?`<img src="${m.image}">`:'<div class="monster-placeholder">👹</div>'}<span><small>${m.isBoss?'BOSS':'MONSTER'}</small><b>${escapeHtml(m.name)}</b><em>전투력 ${Number(m.battlePower).toLocaleString()}</em><strong>승리 보상 ◈ ${Number(m.rewardCoin).toLocaleString()}</strong></span></button>`).join('');document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{if(battleState.deck.length<5){battleState.deck.push(b.dataset.pick);renderBattleBuilder()}});document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{battleState.deck=battleState.deck.filter(x=>x!==b.dataset.remove);renderBattleBuilder()});document.querySelectorAll('[data-monster]').forEach(b=>b.onclick=()=>{battleState.selectedMonster=Number(b.dataset.monster);renderBattleBuilder()});document.getElementById('clearBattleDeck').onclick=()=>{battleState.deck=[];renderBattleBuilder()};const start=document.getElementById('battleStart');const noEnergy=battleState.energy&&!battleState.energy.unlimited&&battleState.energy.energy<battleState.energy.costPerBattle;start.disabled=battleState.deck.length!==5||!battleState.selectedMonster||noEnergy;start.textContent=noEnergy?'전투 횟수 부족':'전투 시작';start.onclick=startBattle;renderBattleEnergy();}
function battleSleep(ms){return new Promise(r=>setTimeout(r,ms));}
function battleTone(freq=180,duration=.08,type='sine',volume=.04){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const ctx=new C(),o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(volume,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+duration);setTimeout(()=>ctx.close(),(duration+0.1)*1000)}catch(_){}}
function battleBurst(stage,x='50%',y='50%',count=18){const layer=stage.querySelector('.battle-fx-layer');if(!layer)return;for(let i=0;i<count;i++){const p=document.createElement('i');p.className='battle-particle';p.style.left=x;p.style.top=y;p.style.setProperty('--a',`${Math.random()*360}deg`);p.style.setProperty('--d',`${45+Math.random()*95}px`);p.style.animationDelay=`${Math.random()*80}ms`;layer.appendChild(p);setTimeout(()=>p.remove(),900)}}
function battleDamage(stage,text,target='enemy',critical=false){const box=document.createElement('b');box.className=`battle-damage ${target} ${critical?'critical':''}`;box.textContent=text;stage.appendChild(box);setTimeout(()=>box.remove(),900)}
function battleSetHp(stage,target,percent){
  const value=Math.max(0,Math.min(100,Number(percent)||0));
  const bar=stage.querySelector(`[data-hp-fill="${target}"]`), label=stage.querySelector(`[data-hp-text="${target}"]`);
  if(bar)bar.style.width=`${value}%`;
  if(label)label.textContent=`${Math.ceil(value)}%`;
}
function battleGradeTier(grade){const n=gradeOrder[String(grade||'C').toUpperCase()]||1;return n>=9?'mythic':n>=7?'legendary':n>=5?'epic':n>=4?'rare':'normal'}
function battleActivateCard(stage,index,grade){stage.querySelectorAll('.battle-card-fighter').forEach((el,i)=>{el.classList.toggle('active-attacker',i===index);el.classList.remove('skill-normal','skill-rare','skill-epic','skill-legendary','skill-mythic')});const card=stage.querySelectorAll('.battle-card-fighter')[index];if(card)card.classList.add(`skill-${battleGradeTier(grade)}`)}
async function startBattle(){
  const modal=document.getElementById('modal'),monster=battleState.monsters.find(m=>Number(m.id)===Number(battleState.selectedMonster));
  const user=loadUser(),deckCards=battleState.deck.map(id=>cards.find(x=>x.id===id)).filter(Boolean);
  const previewPower=deckCards.reduce((sum,c)=>sum+battleCardPower(c,user,battleState.config),0);
  modal.className='modal show battle-modal';
  modal.innerHTML=`<div class="modal-panel battle-stage intro">
    <div class="battle-backdrop"></div><div class="battle-fx-layer"></div>
    <div class="battle-topline"><span>CNINE PVE BATTLE</span><b id="battlePhase">ENCOUNTER</b></div>
    <div class="battle-hud">
      <div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>MEMBER TEAM</b><span data-hp-text="team">100%</span></div><div class="battle-hp-track"><i data-hp-fill="team"></i></div><small>전투력 ${previewPower.toLocaleString()}</small></div>
      <div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${escapeHtml(monster.name)}</b><span data-hp-text="enemy">100%</span></div><div class="battle-hp-track"><i data-hp-fill="enemy"></i></div><small>전투력 ${Number(monster.battlePower||0).toLocaleString()}</small></div>
    </div>
    <div class="battle-arena">
      <div class="battle-side player-side"><div class="battle-team">${deckCards.map((c,i)=>`<div class="battle-card-fighter grade-${String(c.grade||'C').toLowerCase()}" data-fighter="${i}" style="--i:${i}"><div class="fighter-aura"></div><img src="${c.image}" style="object-position:${c.focusX||50}% ${c.focusY||50}%"><div class="fighter-grade">${c.grade}</div><span>${escapeHtml(c.title)}</span></div>`).join('')}</div><small>MEMBER TEAM</small></div>
      <div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div>
      <div class="battle-side enemy-side"><div class="battle-enemy-card ${monster.isBoss?'boss':''}"><div class="enemy-card-badge">${monster.isBoss?'BOSS':'MONSTER'}</div><div class="battle-enemy-visual">${monster.image?`<img src="${monster.image}">`:'<div class="monster-placeholder">👹</div>'}</div><div class="battle-enemy-title">${escapeHtml(monster.name)}</div><div class="enemy-card-power">POWER ${Number(monster.battlePower||0).toLocaleString()}</div></div></div>
    </div>
    <div class="battle-impact"><i></i><i></i><i></i></div>
    <div id="battleMessage" class="battle-message"><span>전투 준비 중...</span></div>
  </div>`;
  const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('battlePhase'),count=document.getElementById('battleCountdown'),msg=document.getElementById('battleMessage');
  try{
    battleTone(90,.18,'sawtooth',.035); await battleSleep(500);
    stage.classList.add('cards-enter'); phase.textContent='TEAM DEPLOY'; await battleSleep(900);
    stage.classList.add('enemy-enter'); phase.textContent=monster.isBoss?'BOSS APPEARS':'ENEMY APPEARS'; battleTone(monster.isBoss?52:105,.34,'square',.055); if(navigator.vibrate)navigator.vibrate(monster.isBoss?[100,50,150]:70); await battleSleep(950);
    count.textContent='READY'; stage.classList.add('ready'); await battleSleep(650); count.textContent='FIGHT'; battleTone(440,.18,'square',.075); stage.classList.add('fight'); await battleSleep(520); count.textContent='';
    const fightPromise=apiRequest('battle/fight',{method:'POST',body:JSON.stringify({monsterId:battleState.selectedMonster,cardIds:battleState.deck})});
    const d=await fightPromise;
    let enemyHp=100,teamHp=100;
    const win=d.result==='WIN';
    const enemySteps=win?[14,17,18,20,31]:[9,11,13,15,17];
    const teamCounter=win?[8,10]:[18,25,31];
    for(let i=0;i<deckCards.length;i++){
      const c=deckCards[i],tier=battleGradeTier(c.grade),high=gradeOrder[c.grade]>=gradeOrder.UR;
      battleActivateCard(stage,i,c.grade);phase.textContent=`${c.grade} MEMBER STRIKE`;
      stage.classList.remove('member-strike','member-skill');void stage.offsetWidth;stage.classList.add(high?'member-skill':'member-strike');
      const dmg=enemySteps[i]||15; enemyHp=Math.max(win&&i<4?4:0,enemyHp-dmg); battleSetHp(stage,'enemy',enemyHp);
      battleBurst(stage,'73%','43%',high?30:16); battleDamage(stage,high?`${c.grade} BURST!`:`-${Math.max(120,Math.round(d.monsterPower*dmg/100))}`,'enemy',high);
      battleTone(high?360+gradeOrder[c.grade]*28:170+i*24,high?.18:.09,high?'sawtooth':'square',high?.075:.045);if(navigator.vibrate)navigator.vibrate(high?[45,25,70]:28);
      await battleSleep(high?760:580);
      if((i===1||i===3||(!win&&i===4))&&teamHp>0){
        stage.classList.remove('member-strike','member-skill');stage.classList.add('monster-heavy-attack');phase.textContent=monster.isBoss?'BOSS RAGE':'MONSTER COUNTER';
        const hit=teamCounter.shift()||18;teamHp=Math.max(win?12:0,teamHp-hit);battleSetHp(stage,'team',teamHp);
        battleBurst(stage,'28%','43%',monster.isBoss?34:24);battleDamage(stage,monster.isBoss?'HEAVY HIT!':`-${Math.max(100,Math.round(d.playerPower*hit/100))}`,'player',monster.isBoss);
        battleTone(monster.isBoss?55:78,.24,'sawtooth',.08);if(navigator.vibrate)navigator.vibrate(monster.isBoss?[120,40,150]:[70,30,80]);await battleSleep(monster.isBoss?900:720);
        stage.classList.remove('monster-heavy-attack');
      }
    }
    stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('active-attacker'));
    phase.textContent=win?'FINAL STRIKE':'MONSTER FINISH';stage.classList.add(win?'final-strike-v863':'final-fail-v863');
    if(win){battleSetHp(stage,'enemy',0);battleBurst(stage,'74%','43%',55);battleDamage(stage,'FINISH!','enemy',true);battleTone(620,.32,'sawtooth',.09);if(navigator.vibrate)navigator.vibrate([70,30,180]);}
    else{battleSetHp(stage,'team',0);battleBurst(stage,'26%','43%',48);battleDamage(stage,'K.O.','player',true);battleTone(48,.38,'square',.09);if(navigator.vibrate)navigator.vibrate([160,50,160]);}
    await battleSleep(1050);
    stage.classList.add(win?'battle-win-v863':'battle-lose-v863');phase.textContent=win?'MISSION CLEAR':'MISSION FAILED';
    msg.innerHTML=win?`<strong>VICTORY</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><div class="battle-reward-pop"><small>REWARD</small><b>◈ ${d.reward.toLocaleString()}</b></div><em>화면을 눌러 돌아가기</em>`:`<strong>DEFEAT</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><div class="battle-defeat-tip">돌파 단계로 전투력을 높여보세요.</div><em>화면을 눌러 돌아가기</em>`;
    battleState.energy=d.energy||battleState.energy;battleState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();saveUser(apiUserToLocal(d.user));setTimeout(()=>{modal.onclick=()=>renderShell('battle')},700);
  }catch(e){if(e.energy)battleState.energy=e.energy;msg.innerHTML=`<span>${escapeHtml(e.message)}</span><em>화면을 눌러 돌아가기</em>`;modal.onclick=()=>renderShell('battle')}
}

function attendanceView(user) {
  const claimable = canClaimAttendance(user);
  return `${summaryBar(user)}<section class="attendance-panel"><div class="attendance-glow"></div><div class="attendance-copy"><p class="eyebrow">DAILY LOGIN REWARD</p><h2>오늘의 접속 보상</h2><p>매일 접속해서 카드팩에 사용할 코인을 받아가세요.<br>날짜 판정은 한국 시간 기준입니다.</p><div class="attendance-stats"><span>누적 출석 <b>${user.attendance.totalDays || 0}일</b></span><span>오늘 상태 <b>${claimable?'수령 가능':'수령 완료'}</b></span></div><button class="btn attendance-claim" id="claimAttendance" ${claimable?'':'disabled'}>${claimable?'500코인 받기':'오늘 보상 수령 완료'}</button></div><div class="attendance-reward"><span>DAILY</span><strong>◈ 500</strong><small>COIN REWARD</small></div></section><section class="coupon-panel"><div><p class="eyebrow">COUPON REWARD</p><h2>쿠폰 코드 입력</h2><p>관리자가 발급한 쿠폰 코드를 입력하면 보상이 즉시 지급됩니다.</p></div><div class="coupon-form"><input id="couponCode" maxlength="40" placeholder="쿠폰 코드"><button class="btn" id="redeemCoupon">쿠폰 사용</button></div></section>`;
}

function tierEmblem(tier,size='normal'){
  const id=escapeHtml(tier?.id||'bronze'),name=escapeHtml(tier?.name||'브론즈'),color=escapeHtml(tier?.color||'#b87333');
  const basicShield=`<path class="metal-dark" d="M60 13 91 25v31c0 22-13 38-31 48-18-10-31-26-31-48V25z"/><path class="metal-mid" d="M60 22 82 31v24c0 15-8 27-22 36-14-9-22-21-22-36V31z"/><path class="metal-light" d="M60 30 74 37v17c0 10-5 18-14 25-9-7-14-15-14-25V37z"/><circle class="gem" cx="60" cy="52" r="10"/><path class="gem-shadow" d="m60 42 7 10-7 10-7-10z"/>`;
  const wings=`<path class="wing-shadow" d="M34 37 7 21l9 27-12 8 30 13 12-12z"/><path class="wing" d="M38 39 12 25l10 20-10 7 29 11 8-11z"/><path class="wing-shadow" d="m86 37 27-16-9 27 12 8-30 13-12-12z"/><path class="wing" d="m82 39 26-14-10 20 10 7-29 11-8-11z"/>`;
  const doubleWings=`<path class="wing-shadow" d="M31 31 3 10l9 31-10 8 29 14 13-10z"/><path class="wing" d="M36 35 9 16l10 25-10 7 29 11 10-12z"/><path class="wing-shadow" d="m89 31 28-21-9 31 10 8-29 14-13-10z"/><path class="wing" d="m84 35 27-19-10 25 10 7-29 11-10-12z"/>`;
  const crown=`<path class="crown" d="m43 28 6-18 11 11 11-11 6 18-8-4-9 9-9-9z"/><path class="crown" d="M45 28h30l-3 9H48z"/>`;
  const gem=`<path class="gem-shadow" d="M60 28 82 48 72 82 60 96 48 82 38 48z"/><path class="gem" d="M60 31 77 49 69 78 60 90 51 78 43 49z"/><path fill="#fff9" d="m60 34 5 16-5 30-5-30z"/><path fill="#fff5" d="m45 50 10 0 5 30-10-5z"/>`;
  const star=`<path class="gem" d="m60 32 7 14 16 2-12 11 4 16-15-8-15 8 4-16-12-11 16-2z"/>`;
  let art='';
  if(id==='bronze') art=basicShield;
  else if(id==='silver') art=wings+basicShield;
  else if(id==='gold') art=crown+basicShield;
  else if(id==='platinum') art=wings+gem;
  else if(id==='diamond') art=wings+`<path class="metal-dark" d="M60 18 91 38 81 82 60 103 39 82 29 38z"/>`+gem;
  else if(id==='master') art=doubleWings+crown+`<path class="metal-dark" d="M60 22 86 39 79 81 60 101 41 81 34 39z"/>`+gem;
  else art=doubleWings+crown+`<path class="metal-dark" d="M60 19 89 37 81 83 60 105 39 83 31 37z"/>`+star+`<circle class="gem" cx="60" cy="56" r="7"/>`;
  return `<div class="tier-emblem tier-${id} ${tier?.aura?'has-aura':''} ${size}" style="--tier-color:${color}"><span class="tier-stage"><span class="tier-aura"></span><span class="tier-ring tier-ring-one"></span><span class="tier-ring tier-ring-two"></span><svg class="tier-svg" viewBox="0 0 120 112" aria-hidden="true">${art}</svg><span class="tier-spark s1"></span><span class="tier-spark s2"></span><span class="tier-spark s3"></span></span><em>${name}</em></div>`;
}
function pvpTierGuideHtml(tiers=[],currentTier=null){return `<section class="pvp-tier-guide"><div class="pvp-tier-guide-head"><p class="eyebrow">PVP TIER ROAD</p><h3>시즌 티어 구간</h3><span>CMS 시즌 티어 설정과 자동 연동</span></div><div class="pvp-tier-road">${tiers.map(t=>`<div class="pvp-tier-road-item ${currentTier&&String(currentTier.id)===String(t.id)?'current':''}">${tierEmblem(t,'small')}<b>${Number(t.min||0).toLocaleString()}점+</b></div>`).join('')}</div></section>`}
let rankHubMode='pvp';
function rankView(user) {
  return `${summaryBar(user)}<section class="rank-hub"><nav class="rank-switch"><button type="button" data-rank-mode="pvp" class="active">PvP 시즌 랭킹</button><button type="button" data-rank-mode="card">카드점수 랭킹</button></nav><div id="rankHubContent" class="rank-hub-content"><div class="empty-recent">랭킹을 불러오는 중...</div></div></section>`;
}
async function loadRankHub(mode=rankHubMode){
  rankHubMode=mode;
  document.querySelectorAll('[data-rank-mode]').forEach(b=>b.classList.toggle('active',b.dataset.rankMode===mode));
  const root=document.getElementById('rankHubContent');if(!root)return;
  if(mode==='card'){
    root.innerHTML=`<section class="rank-panel rank-panel-v2"><div class="rank-main"><p class="eyebrow">TOTAL CARD POWER TIER</p><h2>카드점수 토탈 티어</h2><p>보유 카드의 등급 기본 전투력과 현재 돌파 보너스를 모두 합산합니다.</p><div id="myTierCard" class="my-tier-card"><div class="tier-loading">내 티어 계산 중...</div></div><div id="serverRanking" class="server-ranking">${API_MODE?'랭킹 불러오는 중...':'D1 연결 후 전체 랭킹이 표시됩니다.'}</div></div><div class="tier-guide"><p class="eyebrow">TIER ROAD</p><h3>티어 구간</h3><div id="tierRoad" class="tier-road"></div></div></section>`;
    await loadServerRanking();return;
  }
  if(!API_MODE){root.innerHTML='<div class="empty-recent">D1 연결 후 PvP 시즌 랭킹이 표시됩니다.</div>';return}
  try{const d=await apiRequest('pvp/ranking');root.innerHTML=`<section class="rank-pvp-panel"><div class="pvp-section-head"><div><p class="eyebrow">PVP SEASON RANKING</p><h2>${escapeHtml(d.settings?.seasonName||'PvP 시즌')} 랭킹</h2></div></div>${pvpTierGuideHtml(d.settings?.tiers||[],d.me?.tier)}${d.me?`<div class="pvp-my-rank">${tierEmblem(d.me.tier,'tiny')}<span>내 순위 <b>${d.me.rank}위</b><small>${escapeHtml(d.me.tier.name)} · ${Number(d.me.season_score).toLocaleString()}점</small></span></div>`:''}<div class="pvp-ranking">${(d.ranking||[]).map(r=>`<div class="pvp-rank-row"><b>${r.rank}</b>${tierEmblem(r.tier,'tiny')}<span>${escapeHtml(r.nickname)}<small>${escapeHtml(r.tier.name)} · ${r.wins}승 ${r.losses}패</small></span><strong>${Number(r.season_score).toLocaleString()}</strong></div>`).join('')||'<div class="empty-recent">아직 시즌 랭킹 데이터가 없습니다.</div>'}</div></section>`}catch(e){root.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}
}
async function loadServerRanking(){
  if(!API_MODE)return;const target=document.getElementById('serverRanking'),mine=document.getElementById('myTierCard'),road=document.getElementById('tierRoad');if(!target)return;
  try{const data=await apiRequest('ranking'),user=loadUser(),me=data.ranking.find(x=>x.nickname===user.nickname)||{rank:'-',score:0,card_count:0,max_breakthrough:0,tier:data.tiers[0]};mine.innerHTML=`${tierEmblem(me.tier,'large')}<div><span>내 총 카드점수</span><strong>${Number(me.score).toLocaleString()}점</strong><small>전체 ${me.rank}위 · 보유 ${me.card_count}장 · 최고 ★${me.max_breakthrough}</small></div>`;road.innerHTML=data.tiers.map(t=>`<div class="tier-road-item">${tierEmblem(t,'small')}<b>${Number(t.min).toLocaleString()}점+</b></div>`).join('');target.innerHTML=`<div class="rank-list rank-list-v2">${data.ranking.slice(0,30).map(row=>`<div class="rank-list-row rank-pos-${row.rank}"><b class="rank-number">${row.rank<=3?'<i>♛</i>':''}${row.rank}</b>${tierEmblem(row.tier,'tiny')}<span>${escapeHtml(row.nickname)}<small>${row.card_count}장 · 최고 ★${row.max_breakthrough}</small></span><strong>${Number(row.score).toLocaleString()}점</strong></div>`).join('')}</div>`}catch(error){target.textContent=error.message}
}

function bindView(tab) {
  const accountBtn=document.getElementById('playerAccountBtn'); if(accountBtn) accountBtn.onclick=showAccountPanel;
  document.querySelectorAll('.pack-choice').forEach(button => button.onclick = () => { selectedPackId = button.dataset.packId; renderShell('buy'); });
  document.querySelectorAll('.draw').forEach(b => b.onclick = () => openPack(b.dataset.packId, Number(b.dataset.count), Number(b.dataset.cost)));
  document.querySelectorAll('.recent-item').forEach(b => b.onclick = () => showDetail(b.dataset.cardId));
  const goDex=document.getElementById('goDex'); if(goDex)goDex.onclick=()=>renderShell('dex');
  const claim = document.getElementById('claimAttendance');
  if (claim) claim.onclick = claimAttendance;
  const couponBtn=document.getElementById('redeemCoupon'); if(couponBtn) couponBtn.onclick=redeemCoupon;
  if(tab==='rank'){document.querySelectorAll('[data-rank-mode]').forEach(b=>b.onclick=()=>loadRankHub(b.dataset.rankMode));loadRankHub('pvp');}
  if(tab==='battle') loadBattleView();
  if(tab==='pvp') loadPvpView();
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
    const owned=ownedIds(user), results=draws.map(card=>{ const duplicate=owned.has(card.id); const shardGained=duplicate?(shardReward[card.grade]||0):0; user.history.push({cardId:card.id,packId:pack.id,at:new Date().toISOString(),duplicate}); user.quantities[card.id]=(user.quantities[card.id]||0)+1; if(duplicate) user.cardShards=(user.cardShards||0)+shardGained; if(!duplicate){user.owned.push(card.id);owned.add(card.id);} return {card,duplicate,shardGained}; });
    saveUser(user);
    modal.className='modal show results-modal';
    modal.innerHTML=`<div class="modal-panel multi-result-panel"><div class="result-head"><div><p class="eyebrow">PACK RESULT</p><h2>${escapeHtml(pack.name)} · ${count}장 획득</h2></div><button class="icon-close" id="closeResult">×</button></div><div class="result-grid count-${count}">${results.map(({card,duplicate,shardGained=0})=>`<div class="result-item"><span class="result-label ${duplicate?'dupe':'new'}">${duplicate?`+${shardGained} 조각`:'NEW'}</span>${cardHtml(card,true,'result-card',user)}</div>`).join('')}</div><div class="result-actions"><button class="btn" id="drawAgain">같은 팩 다시 뽑기</button><button class="btn secondary" id="confirmResult">확인</button></div></div>`;
    document.querySelectorAll('.result-card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
    document.getElementById('closeResult').onclick=document.getElementById('confirmResult').onclick=()=>renderShell('buy');
    document.getElementById('drawAgain').onclick=()=>{ modal.className='modal'; openPack(pack.id,count,cost); };
  },1550);
}

function cardHtml(card, owned, classes='', user=loadUser()) {
  if(!owned)return `<article class="card-frame locked ${classes}" data-id="${card.id}"><div class="card-inner"><div class="card-art"><span class="missing">?</span></div><div class="card-footer"><div class="card-title">미획득 카드</div></div></div></article>`;
  const limited=card.limitedTotal!==null&&card.limitedTotal!==undefined;
  const remain=limited?Math.max(0,Number(card.limitedTotal)-Number(card.issuedCount||0)):null;
  const level=Number(user?.breakthroughs?.[card.id]||0);
  const breakthrough=level>0?` breakthrough-${level}`:'';
  return `<article class="card-frame grade-${card.grade}${breakthrough} ${classes}" data-id="${card.id}">${limited?`<div class="limited-badge">한정판 ${remain}/${card.limitedTotal}</div>`:''}${level>0?`<div class="breakthrough-badge">★${level}</div>`:''}<div class="card-holo"></div><div class="breakthrough-effect"></div><div class="card-inner"><div class="card-header"><span>${card.grade}</span><b>CNINE</b></div><div class="card-art"><img loading="lazy" src="${card.image}" alt="${escapeHtml(card.title)}" style="object-position:${card.focusX}% ${card.focusY}%"></div><div class="card-footer"><div><small>${escapeHtml(card.name)}</small><div class="card-title">${escapeHtml(card.title)}</div></div><img src="assets/ui/cninelogo.png" class="card-mini-logo" alt="CNINE"></div></div></article>`;
}

function showDetail(id) {
  const user=loadUser(), card=cards.find(c=>c.id===id); if(!card)return;
  const owned=ownedIds(user).has(id), history=user.history.find(x=>x.cardId===id), modal=document.getElementById('modal');
  const level=Number(user.breakthroughs?.[id]||0), canBreak=owned&&gradeOrder[card.grade]>=gradeOrder[breakthroughMinGrade], rule=user.breakthroughConfig?.[card.grade]?.[level]||{cost:breakthroughCosts[level],rate:breakthroughRates[level]}, cost=level<10?Number(rule.cost):null, successRate=level<10?Number(rule.rate):null;
  modal.className='modal show detail-modal';
  modal.innerHTML=`<div class="modal-panel detail-panel"><button class="icon-close detail-close" id="closeDetail">×</button><div class="detail-layout">${cardHtml(card,owned,'detail-card',user)}<div class="detail-info"><p class="eyebrow">CARD PROFILE</p><span class="detail-grade">${owned?card.grade:'?'}</span><h2>${owned?escapeHtml(card.title):'미획득 카드'}</h2><p>${owned?escapeHtml(card.name):'아직 획득하지 못했습니다.'}</p>${owned?`<div class="breakthrough-info"><span>돌파 단계</span><strong>${level>=10?'★10 MAX':`★${level}`}</strong><small>보유 카드 조각 ${Number(user.cardShards||0).toLocaleString()}개</small>${canBreak?(level<10?`<button class="btn breakthrough-btn" id="breakthroughBtn" ${Number(user.cardShards||0)<cost?'disabled':''}>카드 조각 ${cost.toLocaleString()}개 · 성공 ${successRate}%<br>★${level+1} 돌파</button>`:'<b class="max-breakthrough">LEGEND · 최대 돌파</b>'):'<small>SR 등급 이상부터 돌파할 수 있습니다.</small>'}</div>`:''}${history?`<p class="obtained-date">최초 획득<br><strong>${new Date(history.at).toLocaleString('ko-KR')}</strong></p>`:''}<button class="btn dark" id="closeDetail2">닫기</button></div></div></div>`;
  document.getElementById('closeDetail').onclick=document.getElementById('closeDetail2').onclick=()=>modal.className='modal';
  const button=document.getElementById('breakthroughBtn'); if(button) button.onclick=()=>breakthroughCard(id);
}

async function breakthroughCard(cardId){
  const user=loadUser(), level=Number(user.breakthroughs?.[cardId]||0), cost=breakthroughCosts[level];
  if(level>=10)return;
  const card=cards.find(c=>c.id===cardId),rule=user.breakthroughConfig?.[card?.grade]?.[level]||{cost,rate:breakthroughRates[level]};
  if(!confirm(`카드 조각 ${Number(rule.cost).toLocaleString()}개를 사용해 ★${level+1} 돌파를 시도하시겠습니까?\n성공 확률: ${rule.rate}%\n실패해도 단계는 유지되며 조각은 소모됩니다.`))return;
  try{
    if(API_MODE){const d=await apiRequest('card/breakthrough',{method:'POST',body:JSON.stringify({cardId})});saveUser(apiUserToLocal(d.user));alert(d.success?`돌파 성공! ★${d.level}`:`돌파 실패\n단계는 ★${d.level}로 유지됩니다.`);showDetail(cardId);}
    else{const actualCost=Number(rule.cost);if(Number(user.cardShards||0)<actualCost)return alert('카드 조각이 부족합니다.');user.cardShards-=actualCost;const success=Math.random()*100<Number(rule.rate);if(success)user.breakthroughs[cardId]=level+1;saveUser(user);alert(success?`돌파 성공! ★${level+1}`:`돌파 실패\n단계는 ★${level}로 유지됩니다.`);showDetail(cardId);}
  }catch(e){alert(e.message)}
}



function clearPlayerLogin() {
  API_TOKEN = '';
  localStorage.removeItem('cnine_card_api_token');
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
}

function showAccountPanel() {
  const user=loadUser();
  if(!user) return renderLogin();
  const modal=document.getElementById('modal');
  if(!modal) return;
  const keyText=user.key||'현재 브라우저에 개인키가 저장되어 있지 않습니다.';
  modal.className='modal show account-modal';
  modal.innerHTML=`<div class="modal-panel account-panel">
    <button class="icon-close account-close" id="closeAccount">×</button>
    <p class="eyebrow">PLAYER ACCOUNT</p>
    <div class="account-login-state"><span class="login-dot"></span><div><small>현재 로그인된 계정</small><h2>${escapeHtml(user.nickname)}</h2></div></div>
    <div class="account-info-grid">
      <div><span>보유 코인</span><b>◈ ${Number(user.coin||0).toLocaleString()}</b></div>
      <div><span>수집 카드</span><b>${ownedIds(user).size} / ${cards.length}</b></div><div><span>카드 조각</span><b>🧩 ${Number(user.cardShards||0).toLocaleString()}</b></div>
    </div>
    <div class="account-key-box"><label>로그인 복구용 개인키</label><div><input id="accountKey" value="${escapeHtml(keyText)}" readonly><button type="button" id="copyAccountKey" ${user.key?'':'disabled'}>복사</button></div><p>다른 기기나 로그아웃 후 다시 접속할 때 필요합니다. 외부에 공개하지 마세요.</p></div>
    <div class="account-actions"><button class="btn secondary" id="closeAccount2">계속 이용하기</button><button class="btn danger" id="logoutPlayer">로그아웃</button></div>
  </div>`;
  const close=()=>modal.className='modal';
  document.getElementById('closeAccount').onclick=close;
  document.getElementById('closeAccount2').onclick=close;
  const copy=document.getElementById('copyAccountKey');
  if(copy) copy.onclick=async()=>{try{await navigator.clipboard.writeText(user.key);alert('개인키가 복사되었습니다.')}catch{document.getElementById('accountKey').select();document.execCommand('copy');alert('개인키가 복사되었습니다.')}};
  document.getElementById('logoutPlayer').onclick=async()=>{
    if(!confirm('로그아웃하시겠습니까?\n\n다시 접속하려면 개인키가 필요합니다. 로그아웃 전에 개인키를 복사해 두세요.')) return;
    const logoutToken=API_TOKEN;
    try{
      if(API_MODE&&logoutToken){
        await apiRequest('auth/logout',{method:'POST',headers:{authorization:`Bearer ${logoutToken}`}}, {allowEmpty:true});
      }
    }catch(error){
      console.warn('서버 로그아웃 요청 실패(로컬 로그아웃은 계속 진행):',error);
    }finally{
      clearPlayerLogin();
      modal.className='modal';
      renderLogin();
    }
  };
}

// ===== V1.4 D1 API bridge: API가 없으면 기존 LocalStorage 모드로 자동 전환 =====
let API_MODE=false, API_TOKEN=localStorage.getItem('cnine_card_api_token')||'';
async function apiRequest(path, options={}, config={}) {
  const response=await fetch(`/api/${String(path).replace(/^\/+/, '')}`,{
    ...options,
    headers:{
      'content-type':'application/json',
      'authorization':API_TOKEN?`Bearer ${API_TOKEN}`:'',
      ...(options.headers||{})
    }
  });
  const contentType=(response.headers.get('content-type')||'').toLowerCase();
  const text=await response.text();
  let data={};
  if(text){
    if(contentType.includes('application/json')){
      try{data=JSON.parse(text)}catch{throw new Error('서버 JSON 응답 형식이 올바르지 않습니다.')}
    }else{
      // Cloudflare 404/오류 HTML을 JSON으로 파싱해 Unexpected token '<' 경고가 뜨는 문제 방지
      if(response.ok&&config.allowEmpty) return {};
      throw new Error(response.ok?'서버가 잘못된 형식으로 응답했습니다.':'API 경로 또는 Cloudflare Functions 연결을 확인해주세요.');
    }
  }else if(!response.ok&&!config.allowEmpty){
    throw new Error('서버 요청에 실패했습니다.');
  }
  if(!response.ok){const error=new Error(data.error||'서버 요청 실패');Object.assign(error,data);throw error;}
  return data;
}
async function detectApi(){try{const r=await fetch('api/health',{cache:'no-store'});API_MODE=r.ok}catch{API_MODE=false}}
async function fetchServiceStatus(){
  if(!API_MODE)return {maintenance:{active:false},bypass:false};
  const adminToken=localStorage.getItem('cnine_admin_token')||'';
  const authToken=API_TOKEN||adminToken;
  const response=await fetch('api/service/status',{cache:'no-store',headers:{'authorization':authToken?`Bearer ${authToken}`:''}});
  const data=await response.json().catch(()=>({maintenance:{active:false},bypass:false}));
  if(data.bypass&&!API_TOKEN&&adminToken) API_TOKEN=adminToken;
  return data;
}
function maintenanceTime(v){if(!v)return'';return String(v).replace('T',' ').slice(0,16)}
function renderMaintenance(m={},service={}){
  const period=[maintenanceTime(m.startAt),maintenanceTime(m.endAt)].filter(Boolean).join(' ~ ');
  const local=loadUser();
  const nickname=service.user?.nickname||local?.nickname||'';
  const key=local?.key||'';
  app.innerHTML=`<div class="maintenance-screen"><div class="maintenance-card game-panel"><img src="assets/ui/cninelogo.png" class="maintenance-logo" alt="CNINE"><p class="eyebrow">SERVER MAINTENANCE</p><h1>${escapeHtml(m.title||'씨켓몬 서버 점검 중')}</h1><p class="maintenance-message">${escapeHtml(m.message||'안정적인 서비스 제공을 위해 점검을 진행하고 있습니다.')}</p>${period?`<div class="maintenance-period"><span>점검 시간</span><b>${escapeHtml(period)}</b></div>`:''}${nickname?`<div class="maintenance-session"><span><i class="login-dot"></i> 로그인 상태 유지 중</span><b>${escapeHtml(nickname)}</b>${key?`<div><input id="maintenanceKey" value="${escapeHtml(key)}" readonly><button id="maintenanceCopyKey">개인키 복사</button></div>`:'<small>현재 브라우저에 개인키가 저장되어 있지 않습니다.</small>'}</div>`:'<div class="maintenance-session logged-out"><b>로그인 상태가 아닙니다.</b><small>점검 중에도 개인키 로그인은 가능하며 로그인 후 세션이 유지됩니다.</small><button class="btn secondary" id="maintenanceLogin">개인키 로그인</button></div>'}<div class="maintenance-notice">점검 중에는 카드뽑기·출석·돌파·전투 등 게임 기능만 제한됩니다.<br>로그인 세션은 자동으로 해제되지 않습니다.</div><button class="btn secondary" id="maintenanceRefresh">점검 상태 새로고침</button><a class="maintenance-admin-link" href="admin/">관리자 접속</a></div></div>`;
  document.getElementById('maintenanceRefresh').onclick=()=>location.reload();
  const copy=document.getElementById('maintenanceCopyKey');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(key);alert('개인키가 복사되었습니다.')}catch{document.getElementById('maintenanceKey').select();document.execCommand('copy');alert('개인키가 복사되었습니다.')}};
  const login=document.getElementById('maintenanceLogin');if(login)login.onclick=()=>renderLogin();
}
function apiUserToLocal(u,key){const old=loadUser();return {nickname:u.nickname,key:key||old?.key||'',coin:u.coin,cardShards:Number(u.cardShards||0),owned:u.owned||[],quantities:u.quantities||{},breakthroughs:u.breakthroughs||{},history:Array.isArray(u.history)?u.history:(old?.history||[]),attendance:u.attendance||old?.attendance||{lastClaimDate:null,totalDays:0},breakthroughConfig:u.breakthroughConfig||old?.breakthroughConfig||{},serverUserId:u.id,testCoinGrantedV13:true}}
async function init(){
  migrateLegacyUser();
  renderLoading();
  await detectApi();
  let authenticated=false;
  try{
    if(API_MODE){
      const service=await fetchServiceStatus();
      if(service.maintenance?.active&&!service.bypass){renderMaintenance(service.maintenance,service);return;}
      const [cr,pr]=await Promise.all([apiRequest('cards'),apiRequest('packs')]);
      cards=cr.cards;
      applyServerPacks(pr.packs);
      if(API_TOKEN){
        try{
          const me=await apiRequest('me');
          saveUser(apiUserToLocal(me.user));
          authenticated=true;
          try{const pc=await apiRequest('pvp/config');pvpFeatureEnabled=Boolean(pc.settings?.enabled||pc.bypass)}catch{pvpFeatureEnabled=false}
        }catch{
          clearPlayerLogin();
        }
      }else{
        clearPlayerLogin();
      }
    }else{
      const response=await fetch('data/cards.json',{cache:'no-store'});
      cards=await response.json();
      authenticated=Boolean(loadUser());
    }
  }catch(e){
    console.error(e);
    try{cards=await (await fetch('data/cards.json')).json()}catch{cards=[]}
    if(API_MODE) clearPlayerLogin();
  }
  setTimeout(()=>authenticated?renderShell('buy'):renderLogin(),250);
}
function renderLogin(){app.innerHTML=`<div class="login-wrap"><div class="login-box game-panel player-login-box"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CNINE COLLECTION GAME</p><h1>씨켓몬 로그인</h1><div class="logged-out-notice"><span>로그아웃 상태</span><p>기존 계정은 아래에 개인키를 입력하면 다시 접속할 수 있습니다.</p></div><div class="field key-login-field"><label for="key">기존 계정으로 로그인</label><input id="key" autocomplete="off" autocapitalize="characters" placeholder="CN-XXXX-XXXX-XXXX"></div><button class="btn" id="login">개인키로 로그인</button><p class="login-help">개인키를 분실했다면 관리자에게 재발급을 요청하세요.</p><div class="login-divider"><span>처음 이용하시나요?</span></div><div class="field"><label for="nickname">신규 닉네임</label><input id="nickname" maxlength="20" placeholder="와이고수 닉네임을 입력하세요"></div><button class="btn secondary" id="start">새 계정 만들기</button></div></div>`;document.getElementById('start').onclick=async()=>{const nickname=document.getElementById('nickname').value.trim();if(!nickname)return alert('닉네임을 입력해주세요.');if(!API_MODE){const user={nickname,key:generateKey(),coin:TEST_COIN,owned:[],history:[],attendance:{lastClaimDate:null,totalDays:0},testCoinGrantedV13:true};saveUser(user);return renderCreated(user)}try{const d=await apiRequest('auth/register',{method:'POST',body:JSON.stringify({nickname})});API_TOKEN=d.token;localStorage.setItem('cnine_card_api_token',API_TOKEN);const user=apiUserToLocal(d.user,d.privateKey);saveUser(user);renderCreated(user)}catch(e){alert(e.message)}};document.getElementById('login').onclick=async()=>{const key=document.getElementById('key').value.trim();if(!API_MODE){const u=loadUser();if(!u||u.key!==key)return alert('저장된 개인키와 일치하지 않습니다.');return renderShell('buy')}try{const normalizedKey=key.trim().toUpperCase();const d=await apiRequest('auth/login',{method:'POST',body:JSON.stringify({privateKey:normalizedKey})});API_TOKEN=d.token;localStorage.setItem('cnine_card_api_token',API_TOKEN);saveUser(apiUserToLocal(d.user,normalizedKey));if(d.maintenance&&!d.bypass)renderMaintenance(d.maintenance,{user:d.user});else renderShell('buy')}catch(e){alert(e.message)}};document.getElementById('key').onkeydown=e=>{if(e.key==='Enter')document.getElementById('login').click()};document.getElementById('nickname').onkeydown=e=>{if(e.key==='Enter')document.getElementById('start').click()}}
async function claimAttendance(){if(!API_MODE){const user=loadUser();if(!canClaimAttendance(user))return alert('오늘 접속 보상은 이미 받았습니다.');user.coin+=500;user.attendance.lastClaimDate=kstDateKey();user.attendance.totalDays=(user.attendance.totalDays||0)+1;saveUser(user);alert('오늘의 접속 보상 500코인을 받았습니다.');return renderShell('attendance')}try{const d=await apiRequest('attendance/claim',{method:'POST'});const u=apiUserToLocal(d.user);u.attendance={lastClaimDate:kstDateKey(),totalDays:(loadUser()?.attendance?.totalDays||0)+1};saveUser(u);alert(`오늘의 접속 보상 ${d.reward}코인을 받았습니다.`);renderShell('attendance')}catch(e){alert(e.message)}}

async function redeemCoupon(){
  if(!API_MODE)return alert('쿠폰은 서버 연결 상태에서만 사용할 수 있습니다.');
  const code=document.getElementById('couponCode')?.value.trim();
  if(!code)return alert('쿠폰 코드를 입력하세요.');
  try{const d=await apiRequest('coupon/redeem',{method:'POST',body:JSON.stringify({code})});saveUser(apiUserToLocal(d.user));alert(`쿠폰 사용 완료! ${Number(d.rewardCoin).toLocaleString()}코인을 받았습니다.`);renderShell('attendance')}catch(e){alert(e.message)}
}

const localOpenPack=openPack;
function criticalTone(success=false){
  try{
    const C=window.AudioContext||window.webkitAudioContext,ctx=new C();
    const now=ctx.currentTime, notes=success?[180,360,720]:[220,280];
    notes.forEach((freq,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=success?'sawtooth':'sine';o.frequency.setValueAtTime(freq,now+i*.08);g.gain.setValueAtTime(.0001,now+i*.08);g.gain.exponentialRampToValueAtTime(success?.11:.035,now+i*.08+.01);g.gain.exponentialRampToValueAtTime(.0001,now+i*.08+.16);o.connect(g).connect(ctx.destination);o.start(now+i*.08);o.stop(now+i*.08+.18)});
  }catch{}
}
function showCriticalBurst(stage,bonus){
  stage.classList.add('critical-hit');
  const burst=document.createElement('div');
  burst.className='critical-burst';
  burst.innerHTML=`<div class="critical-bolts"></div><div class="critical-ring"></div><strong>CRITICAL OPEN!</strong><span>상위 등급 가중치 +${Number(bonus||0).toFixed(0)}%</span><div class="critical-particles">${Array.from({length:28},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>`;
  stage.appendChild(burst);
  criticalTone(true);
  if(navigator.vibrate) navigator.vibrate([70,40,140]);
}
function openingMarkup(pack,count){
  return `<div class="modal-panel draw-stage opening-panel critical-opening-stage"><p class="eyebrow">PACK OPENING</p><h2>${escapeHtml(pack.name)} · ${count}장</h2><div class="tap-counter"><b id="tapCount">0</b><span>/ 5 TAP</span></div><div class="pack-open pack-opening" id="criticalTapZone">${packArt(pack)}<div class="tear-line"></div><div class="flash"></div><div class="tap-ripple-layer"></div></div><p class="message opening-message" id="openingMessage">팩을 빠르게 5회 이상 연타하세요!</p><div class="tap-progress"><i id="tapProgress"></i></div><small class="tap-rule">5회 이상부터 동일한 크리티컬 확률이 적용됩니다.</small></div>`;
}
async function runCriticalOpening(pack,count,requestDraw){
  const modal=document.getElementById('modal');
  modal.className='modal show opening-modal';
  modal.innerHTML=openingMarkup(pack,count);
  const stage=modal.querySelector('.critical-opening-stage'),zone=modal.querySelector('#criticalTapZone'),counter=modal.querySelector('#tapCount'),progress=modal.querySelector('#tapProgress'),message=modal.querySelector('#openingMessage');
  let taps=0,locked=false;
  const tap=e=>{
    if(locked)return;
    taps++;
    counter.textContent=taps;
    progress.style.width=`${Math.min(100,taps/5*100)}%`;
    zone.classList.remove('tap-punch'); void zone.offsetWidth; zone.classList.add('tap-punch');
    const r=document.createElement('i');r.className='tap-ripple';const rect=zone.getBoundingClientRect();r.style.left=`${(e.clientX||rect.left+rect.width/2)-rect.left}px`;r.style.top=`${(e.clientY||rect.top+rect.height/2)-rect.top}px`;zone.querySelector('.tap-ripple-layer').appendChild(r);setTimeout(()=>r.remove(),500);
    if(taps===5){stage.classList.add('tap-ready');message.textContent='크리티컬 판정 준비 완료!';criticalTone(false);if(navigator.vibrate)navigator.vibrate(40)}
  };
  zone.addEventListener('pointerdown',tap);
  await new Promise(r=>setTimeout(r,1450));
  locked=true;zone.removeEventListener('pointerdown',tap);stage.classList.add('judging');message.textContent=taps>=5?'크리티컬 판정 중...':'일반 개봉 진행 중...';
  let data;
  try{data=await requestDraw(taps)}catch(e){modal.className='modal';throw e}
  await new Promise(r=>setTimeout(r,260));
  if(data.critical?.success){showCriticalBurst(stage,data.critical.bonus);message.textContent='CRITICAL! 가중치 보너스 적용!';await new Promise(r=>setTimeout(r,data.critical.effects===false?500:1450));}
  else{zone.classList.add('tearing');message.textContent=data.critical?.eligible?'크리티컬은 발생하지 않았습니다.':'일반 개봉!';await new Promise(r=>setTimeout(r,620));}
  return data;
}
openPack=async function(packId,count,cost){
  if(!API_MODE){
    const pack=getPack(packId),user=loadUser();
    if(!user||user.coin<cost)return alert('코인이 부족합니다.');
    try{
      const d=await runCriticalOpening(pack,count,async taps=>{
        const critical=taps>=5&&Math.random()*100<3;
        const draws=makeDraws(pack,count);return {local:true,draws,critical:{eligible:taps>=5,success:critical,bonus:critical?10:0,tapCount:taps,effects:true}};
      });
      user.coin-=cost;const owned=ownedIds(user),results=d.draws.map(card=>{const duplicate=owned.has(card.id),shardGained=duplicate?(shardReward[card.grade]||0):0;user.history.push({cardId:card.id,packId:pack.id,at:new Date().toISOString(),duplicate});user.quantities[card.id]=(user.quantities[card.id]||0)+1;if(duplicate)user.cardShards=(user.cardShards||0)+shardGained;if(!duplicate){user.owned.push(card.id);owned.add(card.id)}return {card,duplicate,shardGained}});saveUser(user);renderDrawResults(pack,count,cost,results,user,d.critical);
    }catch(e){alert(e.message)}
    return;
  }
  const pack=getPack(packId);
  try{
    const d=await runCriticalOpening(pack,count,tapCount=>apiRequest('draw',{method:'POST',body:JSON.stringify({packId,count,tapCount})}));
    const next=apiUserToLocal(d.user);saveUser(next);renderDrawResults(pack,count,pack.price*count,d.results,next,d.critical);
  }catch(e){alert(e.message)}
}
const SPECIAL_REVEAL_ORDER={SSR:1,MA:2,FUR:3};
function getTopSpecialResult(results=[]){
  return results.map(x=>x?.card).filter(c=>SPECIAL_REVEAL_ORDER[c?.grade]).sort((a,b)=>SPECIAL_REVEAL_ORDER[b.grade]-SPECIAL_REVEAL_ORDER[a.grade])[0]||null;
}
function specialRevealTone(grade){
  try{const C=window.AudioContext||window.webkitAudioContext,ctx=new C(),now=ctx.currentTime;const notes=grade==='FUR'?[110,220,440,880]:grade==='MA'?[180,360,540,720]:[240,360,520];notes.forEach((freq,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=grade==='FUR'?'sawtooth':grade==='MA'?'triangle':'sine';o.frequency.setValueAtTime(freq,now+i*.11);g.gain.setValueAtTime(.0001,now+i*.11);g.gain.exponentialRampToValueAtTime(grade==='FUR'?.12:.075,now+i*.11+.015);g.gain.exponentialRampToValueAtTime(.0001,now+i*.11+.34);o.connect(g).connect(ctx.destination);o.start(now+i*.11);o.stop(now+i*.11+.38)})}catch{}
}
async function showSpecialCardReveal(card,user){
  const modal=document.getElementById('modal'),grade=card.grade;
  modal.className=`modal show special-reveal-modal reveal-${grade.toLowerCase()}`;
  modal.innerHTML=`<div class="special-reveal-stage grade-${grade.toLowerCase()}" role="dialog" aria-label="${grade} 카드 특별 연출"><div class="special-reveal-bg"></div><div class="special-reveal-rays"></div><div class="special-reveal-ring ring-a"></div><div class="special-reveal-ring ring-b"></div><div class="special-reveal-particles">${Array.from({length:42},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="special-reveal-copy"><small>LEGENDARY SIGNAL DETECTED</small><strong>${grade}</strong><span>${grade==='FUR'?'최고 등급의 존재가 모습을 드러냅니다':grade==='MA'?'마스터의 기운이 전장을 뒤덮습니다':'희귀한 기운이 폭발합니다'}</span></div><div class="special-reveal-card">${cardHtml(card,true,'special-reveal-card-ui',user)}</div><button type="button" class="special-skip" id="specialRevealSkip">건너뛰기</button></div>`;
  const stage=modal.querySelector('.special-reveal-stage');
  specialRevealTone(grade);if(navigator.vibrate)navigator.vibrate(grade==='FUR'?[80,35,140,40,220]:grade==='MA'?[70,35,140]:[50,30,90]);
  await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;resolve()};document.getElementById('specialRevealSkip').onclick=finish;stage.onclick=e=>{if(e.target.closest('.special-reveal-card-ui'))return;finish()};setTimeout(()=>stage.classList.add('reveal-card-now'),grade==='SSR'?850:grade==='MA'?1150:1450);setTimeout(finish,grade==='SSR'?2800:grade==='MA'?3600:4400)});
}
async function renderDrawResults(pack,count,cost,results,user,critical){
  const special=getTopSpecialResult(results);
  if(special)await showSpecialCardReveal(special,user);
  const modal=document.getElementById('modal');
  modal.className='modal show results-modal';
  const badge=critical?.success?`<div class="critical-result-badge">CRITICAL BONUS +${Number(critical.bonus||0).toFixed(0)}%</div>`:'';
  modal.innerHTML=`<div class="modal-panel multi-result-panel ${critical?.success?'critical-result-panel':''}">${badge}<div class="result-head"><div><p class="eyebrow">PACK RESULT</p><h2>${escapeHtml(pack.name)} · ${count}장 획득</h2></div><button class="icon-close" id="closeResult">×</button></div><div class="result-grid count-${count}">${results.map(({card,duplicate,shardGained=0})=>`<div class="result-item"><span class="result-label ${duplicate?'dupe':'new'}">${duplicate?`+${shardGained} 조각`:'NEW'}</span>${cardHtml(card,true,'result-card',user)}</div>`).join('')}</div><div class="result-actions"><button class="btn" id="drawAgain">같은 팩 다시 뽑기</button><button class="btn secondary" id="confirmResult">확인</button></div></div>`;
  document.querySelectorAll('.result-card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
  document.getElementById('closeResult').onclick=document.getElementById('confirmResult').onclick=()=>renderShell('buy');
  document.getElementById('drawAgain').onclick=()=>{modal.className='modal';openPack(pack.id,count,cost)};
}


let pvpFeatureEnabled=true;
let pvpState={tab:'match',config:null,profile:null,deck:[],opponents:[],history:[],ranking:[],energy:null,energyTimer:null,serverOffset:0};
function pvpView(user){return `${summaryBar(user)}<section class="pvp-cover"><div class="pvp-cover-intro"><p class="eyebrow">ASYNC PVP SEASON</p><h2 id="pvpSeasonTitle">PvP 시즌</h2><p>저장한 PvP 덱으로 비동기 대전을 진행합니다.</p></div><div class="pvp-me"><div id="pvpMyTierBadge" class="pvp-tier-badge"></div><span id="pvpMyTier">-</span><b id="pvpMyScore">-</b><small id="pvpSeasonTime">시즌 정보 불러오는 중</small></div><div class="battle-energy-card pvp-energy-card"><div class="pvp-energy-head"><span>⚔ PvP 전투 횟수</span><b id="pvpEnergyCount">- / -</b></div><div class="battle-energy-track"><i id="pvpEnergyFill"></i></div><small id="pvpEnergyTimer">불러오는 중...</small></div></section><nav class="pvp-tabs"><button data-pvp="match" class="active">대전</button><button data-pvp="deck">덱 편성</button><button data-pvp="history">전투 기록</button><button data-pvp="ranking">시즌 랭킹</button><button data-pvp="reward">시즌 보상</button></nav><section id="pvpContent" class="pvp-content"><div class="empty-recent">PvP 정보를 불러오는 중...</div></section>`}
function pvpCardMini(c,user=loadUser()){const level=Number(user?.breakthroughs?.[c.id]||0),limited=c.limitedTotal!==null&&c.limitedTotal!==undefined;return `<div class="pvp-card-mini-full">${cardHtml(c,true,'pvp-card-display',user)}<div class="pvp-card-extra"><b>${escapeHtml(c.grade||c.rarity||'C')}</b><span>${limited?'한정판':'일반'} · ★${level}</span></div></div>`}
function stopPvpEnergyTimer(){if(pvpState.energyTimer){clearInterval(pvpState.energyTimer);pvpState.energyTimer=null}}
function pvpEnergyText(ms){const total=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(total/60),s=total%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function renderPvpEnergy(){const e=pvpState.energy,count=document.getElementById('pvpEnergyCount'),fill=document.getElementById('pvpEnergyFill'),timer=document.getElementById('pvpEnergyTimer');if(!e||!count)return;count.textContent=e.unlimited?'무제한':`${e.energy} / ${e.maxEnergy}`;if(fill)fill.style.width=`${e.unlimited?100:Math.max(0,Math.min(100,e.energy/e.maxEnergy*100))}%`;if(timer){if(e.unlimited)timer.textContent='관리자·테스트 계정 무제한';else if(e.energy>=e.maxEnergy)timer.textContent='충전 완료';else if(e.nextRechargeAt){const remain=Date.parse(e.nextRechargeAt)-(Date.now()+pvpState.serverOffset);timer.textContent=remain<=0?'충전 갱신 중...':`다음 충전 ${pvpEnergyText(remain)}`;}else timer.textContent='충전 대기';}document.querySelectorAll('.pvp-fight').forEach(b=>{const blocked=!e.unlimited&&e.energy<e.costPerBattle;b.disabled=blocked;b.textContent=blocked?'횟수 부족':'도전';});}
function startPvpEnergyTimer(){stopPvpEnergyTimer();renderPvpEnergy();pvpState.energyTimer=setInterval(()=>{if(!document.getElementById('pvpEnergyCount'))return stopPvpEnergyTimer();const e=pvpState.energy;if(e&&!e.unlimited&&e.nextRechargeAt&&Date.parse(e.nextRechargeAt)<=(Date.now()+pvpState.serverOffset)){loadPvpEnergyOnly();return}renderPvpEnergy()},1000)}
async function loadPvpEnergyOnly(){try{const d=await apiRequest('pvp/config');pvpState.energy=d.energy;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();startPvpEnergyTimer()}catch(_){renderPvpEnergy()}}
async function loadPvpView(){if(!API_MODE){document.getElementById('pvpContent').innerHTML='<div class="empty-recent">PvP는 D1 서버 연결 상태에서 이용할 수 있습니다.</div>';return}try{const d=await apiRequest('pvp/config');pvpFeatureEnabled=Boolean(d.settings?.enabled||d.bypass);pvpState.config=d.settings;pvpState.profile=d.profile;pvpState.deck=d.deck||[];pvpState.energy=d.energy||null;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();if(!pvpFeatureEnabled){document.getElementById('pvpContent').innerHTML='<div class="empty-recent pvp-disabled-notice"><b>PvP 운영 중지</b><span>관리자가 PvP 콘텐츠를 OFF 상태로 설정했습니다.</span></div>';document.querySelectorAll('[data-pvp]').forEach(b=>b.disabled=true);return;}document.getElementById('pvpSeasonTitle').textContent=d.settings.seasonName||'PvP 시즌';document.getElementById('pvpMyTier').textContent=d.profile.tier?.name||'브론즈';const tierBadge=document.getElementById('pvpMyTierBadge');if(tierBadge)tierBadge.innerHTML=tierEmblem(d.profile.tier||{id:'bronze',name:'브론즈',color:'#b87333'},'small');document.getElementById('pvpMyScore').textContent=`시즌 ${Number(d.profile.season_score).toLocaleString()}점 · 카드 ${Number(d.cardScore).toLocaleString()}점`;document.getElementById('pvpSeasonTime').textContent=d.settings.endsAt?`${String(d.settings.endsAt).slice(0,16)} 종료`:'상시 시즌';startPvpEnergyTimer();document.querySelectorAll('[data-pvp]').forEach(b=>b.onclick=()=>{pvpState.tab=b.dataset.pvp;document.querySelectorAll('[data-pvp]').forEach(x=>x.classList.toggle('active',x===b));renderPvpTab()});renderPvpTab()}catch(e){document.getElementById('pvpContent').textContent=e.message}}
async function renderPvpTab(){const box=document.getElementById('pvpContent');if(!box)return;box.innerHTML='<div class="empty-recent">불러오는 중...</div>';try{if(pvpState.tab==='match'){const d=await apiRequest('pvp/opponents');pvpState.opponents=d.opponents||[];box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">RECOMMENDED OPPONENTS</p><h2>추천 상대</h2></div><button class="text-btn" id="pvpRefresh">새로고침</button></div><div class="pvp-opponents">${pvpState.opponents.map(o=>`<article class="pvp-opponent"><div class="pvp-op-head"><b>${escapeHtml(o.nickname)}</b><span>${escapeHtml(o.tier?.name||'브론즈')}</span></div><div class="pvp-op-scores"><span>시즌 <b>${Number(o.season_score).toLocaleString()}</b></span><span>카드 <b>${Number(o.cardScore).toLocaleString()}</b></span></div><div class="pvp-op-meta"><span>${o.wins}승 ${o.losses}패</span><em>${Number(o.diffPercent)>=0?'+':''}${Number(o.diffPercent).toFixed(1)}%</em></div><button class="btn pvp-fight" data-oid="${o.id}">도전</button></article>`).join('')||'<div class="empty-recent">PvP 덱을 저장한 다른 유저가 아직 없습니다.</div>'}</div>`;document.getElementById('pvpRefresh').onclick=renderPvpTab;document.querySelectorAll('.pvp-fight').forEach(b=>b.onclick=()=>fightPvp(Number(b.dataset.oid)));renderPvpEnergy();}
else if(pvpState.tab==='deck'){const owned=ownedIds(loadUser()),list=cards.filter(c=>owned.has(c.id)).sort((a,b)=>(gradeOrder[b.grade]||0)-(gradeOrder[a.grade]||0)||String(a.name||'').localeCompare(String(b.name||''),'ko')||String(a.title||'').localeCompare(String(b.title||''),'ko'));const grouped=[...new Set(list.map(c=>c.grade))].map(g=>({grade:g,cards:list.filter(c=>c.grade===g)}));box.innerHTML=`<div class="pvp-section-head pvp-deck-head"><div><p class="eyebrow">MY PVP DECK</p><h2>PvP 덱 편성</h2></div><div class="pvp-deck-actions"><span class="pvp-deck-guide">5장 선택 · 덱 카드를 누르면 제외</span><button class="pvp-reset-badge" id="resetPvpDeck"><i>↺</i> 덱 초기화</button></div></div><div id="pvpDeckSlots" class="pvp-deck-slots"></div><div id="pvpCardPicker" class="pvp-card-picker grouped">${grouped.map(group=>`<section class="pvp-grade-group grade-${String(group.grade).toLowerCase()}"><div class="pvp-grade-title"><b>${escapeHtml(group.grade)}</b><span>${group.cards.length}장</span></div><div class="pvp-grade-grid">${group.cards.map(c=>`<button class="pvp-pick ${pvpState.deck.includes(c.id)?'selected':''}" data-cid="${c.id}">${pvpCardMini(c,loadUser())}</button>`).join('')}</div></section>`).join('')}</div><button class="btn" id="savePvpDeck">PvP 덱 저장</button>`;renderPvpDeckSlots();document.querySelectorAll('.pvp-pick').forEach(b=>b.onclick=async()=>{const id=b.dataset.cid,i=pvpState.deck.indexOf(id);if(i>=0)pvpState.deck.splice(i,1);else if(pvpState.deck.length<5)pvpState.deck.push(id);else return alert('PvP 덱은 5장까지 편성할 수 있습니다.');await rerenderPvpDeckPreserveScroll()});document.getElementById('resetPvpDeck').onclick=async()=>{if(!pvpState.deck.length)return;pvpState.deck=[];await rerenderPvpDeckPreserveScroll()};document.getElementById('savePvpDeck').onclick=savePvpDeck;}
else if(pvpState.tab==='history'){const d=await apiRequest('pvp/history');box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">BATTLE HISTORY</p><h2>전투 기록</h2></div></div><div class="pvp-history">${d.history.map(h=>`<div class="pvp-history-row ${h.result.toLowerCase()}"><b>${h.result==='WIN'?'승리':'패배'}</b><span>${escapeHtml(h.opponent)}<small>${h.direction==='ATTACK'?'내가 도전':'상대가 도전'} · ${String(h.created_at).slice(0,16)}</small></span><strong>${h.result==='WIN'?'+':'-'}${h.score_change}</strong></div>`).join('')||'<div class="empty-recent">아직 전투 기록이 없습니다.</div>'}</div>`;}
else if(pvpState.tab==='ranking'){const d=await apiRequest('pvp/ranking');box.innerHTML=`<nav class="rank-switch pvp-rank-switch"><button type="button" class="active">PvP 시즌 랭킹</button><button type="button" id="cardRankLink">카드점수 랭킹</button></nav><div class="pvp-section-head"><div><p class="eyebrow">SEASON RANKING</p><h2>${escapeHtml(d.settings.seasonName)} 랭킹</h2></div></div>${pvpTierGuideHtml(d.settings?.tiers||[],d.me?.tier)}${d.me?`<div class="pvp-my-rank">${tierEmblem(d.me.tier,'tiny')}<span>내 순위 <b>${d.me.rank}위</b><small>${escapeHtml(d.me.tier.name)} · ${Number(d.me.season_score).toLocaleString()}점</small></span></div>`:''}<div class="pvp-ranking">${d.ranking.map(r=>`<div class="pvp-rank-row"><b>${r.rank}</b>${tierEmblem(r.tier,'tiny')}<span>${escapeHtml(r.nickname)}<small>${escapeHtml(r.tier.name)} · ${r.wins}승 ${r.losses}패</small></span><strong>${Number(r.season_score).toLocaleString()}</strong></div>`).join('')}</div>`;document.getElementById('cardRankLink').onclick=()=>{renderShell('rank');setTimeout(()=>loadRankHub('card'),0)};}
else{const t=pvpState.profile.tier,tiers=pvpState.config.tiers||[],rankRewards=pvpState.config.rankRewards||[],endAt=pvpState.config.endsAt?new Date(String(pvpState.config.endsAt).replace(' ','T')).getTime():0,seasonEnded=Boolean(endAt&&Number.isFinite(endAt)&&Date.now()>=endAt);box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">SEASON REWARD</p><h2>시즌 보상</h2></div></div><div class="pvp-reward-current"><span>현재 최고 달성</span><b>${escapeHtml(t.name)}</b><strong>◈ ${Number(t.rewardCoin||0).toLocaleString()} · 조각 ${Number(t.rewardShards||0).toLocaleString()}</strong><button class="btn" id="claimPvpReward" ${pvpState.config.tierRewardsEnabled===false?'disabled':''}>티어 보상 받기</button></div><div class="pvp-tier-rewards">${tiers.map(x=>`<div><span>${escapeHtml(x.name)}</span><b>${Number(x.min).toLocaleString()}점+</b><strong>◈ ${Number(x.rewardCoin||0).toLocaleString()} · 조각 ${Number(x.rewardShards||0).toLocaleString()}</strong></div>`).join('')}</div><div class="pvp-section-head pvp-rank-reward-head"><div><p class="eyebrow">FINAL RANK REWARD</p><h2>최종 랭킹 보상</h2></div></div><div class="pvp-tier-rewards">${rankRewards.map(x=>`<div><span>${x.from===x.to?`${x.from}위`:`${x.from}~${x.to}위`}</span><b>시즌 종료 기준</b><strong>◈ ${Number(x.rewardCoin||0).toLocaleString()} · 조각 ${Number(x.rewardShards||0).toLocaleString()}</strong></div>`).join('')||'<div class="empty-recent">등록된 랭킹 보상이 없습니다.</div>'}</div>${seasonEnded?`<div class="pvp-final-reward-ready"><span>시즌이 종료되었습니다. 확정된 최종 순위 보상은 계정당 1회만 받을 수 있습니다.</span><button class="btn pvp-rank-claim" id="claimPvpRankReward" ${pvpState.config.rankRewardsEnabled===false?'disabled':''}>최종 랭킹 보상 받기</button></div>`:`<div class="pvp-final-reward-wait"><b>시즌 종료 후 지급</b><span>최종 랭킹 보상은 시즌 종료 시점의 확정 순위를 기준으로 1회 수령할 수 있습니다.</span></div>`}`;document.getElementById('claimPvpReward').onclick=claimPvpReward;const rankClaim=document.getElementById('claimPvpRankReward');if(rankClaim)rankClaim.onclick=claimPvpRankReward;}}catch(e){box.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}}
async function rerenderPvpDeckPreserveScroll(){const picker=document.getElementById('pvpCardPicker'),pickerTop=picker?.scrollTop||0,pageTop=window.scrollY;await renderPvpTab();requestAnimationFrame(()=>{const next=document.getElementById('pvpCardPicker');if(next)next.scrollTop=pickerTop;window.scrollTo({top:pageTop,left:0,behavior:'auto'})})}
function renderPvpDeckSlots(){const el=document.getElementById('pvpDeckSlots');if(!el)return;el.innerHTML=Array.from({length:5},(_,i)=>{const c=cards.find(x=>x.id===pvpState.deck[i]);return c?`<button type="button" class="pvp-deck-slot filled" data-pvp-remove="${c.id}" title="클릭해서 덱에서 제외">${pvpCardMini(c,loadUser())}<span class="pvp-remove-hint">덱에서 빼기</span></button>`:`<div class="pvp-deck-slot empty"><div class="pvp-empty-slot"><span>${i+1}</span></div></div>`}).join('');el.querySelectorAll('[data-pvp-remove]').forEach(b=>b.onclick=async()=>{pvpState.deck=pvpState.deck.filter(id=>id!==b.dataset.pvpRemove);await rerenderPvpDeckPreserveScroll()})}
async function savePvpDeck(){if(pvpState.deck.length!==5)return alert('보유 카드 5장을 선택하세요.');try{await apiRequest('pvp/deck',{method:'POST',body:JSON.stringify({cardIds:pvpState.deck})});alert('PvP 덱이 저장되었습니다.')}catch(e){alert(e.message)}}
async function fightPvp(id){if(pvpState.energy&&!pvpState.energy.unlimited&&pvpState.energy.energy<pvpState.energy.costPerBattle)return alert('PvP 전투 횟수가 부족합니다. 30분마다 1회 충전됩니다.');if(!confirm('이 상대에게 도전할까요?'))return;const target=pvpState.opponents.find(o=>Number(o.id)===Number(id));const mine=pvpState.deck.map(cid=>cards.find(c=>c.id===cid)).filter(Boolean);if(mine.length!==5)return alert('먼저 PvP 덱 5장을 저장하세요.');const modal=document.getElementById('modal');modal.className='modal show battle-modal pvp-battle-modal';modal.innerHTML=`<div class="modal-panel battle-stage pvp-battle-stage intro"><div class="battle-backdrop"></div><div class="battle-fx-layer"></div><div class="battle-topline"><span>CNINE ASYNC PVP</span><b id="battlePhase">MATCH FOUND</b></div><div class="battle-hud"><div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>MY PVP DECK</b><span data-hp-text="team">100%</span></div><div class="battle-hp-track"><i data-hp-fill="team"></i></div><small>시즌 ${Number(pvpState.profile?.season_score||0).toLocaleString()}점</small></div><div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${escapeHtml(target?.nickname||'OPPONENT')}</b><span data-hp-text="enemy">100%</span></div><div class="battle-hp-track"><i data-hp-fill="enemy"></i></div><small>시즌 ${Number(target?.season_score||0).toLocaleString()}점</small></div></div><div class="battle-arena pvp-arena"><div class="battle-side player-side"><div class="battle-team">${mine.map((c,i)=>`<div class="battle-card-fighter grade-${String(c.grade||'C').toLowerCase()}" data-fighter="${i}" style="--i:${i}"><div class="fighter-aura"></div><img src="${c.image}" style="object-position:${c.focusX||50}% ${c.focusY||50}%"><div class="fighter-grade">${c.grade}</div><span>${escapeHtml(c.title)}</span></div>`).join('')}</div><small>MY TEAM</small></div><div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div><div class="battle-side enemy-side"><div id="pvpEnemyTeam" class="battle-team enemy-team pvp-enemy-loading">상대 덱 불러오는 중...</div><small>${escapeHtml(target?.nickname||'OPPONENT')}</small></div></div><div class="battle-impact"><i></i><i></i><i></i></div><div id="battleMessage" class="battle-message"><span>사나이 간 치열한 대결 중</span></div></div>`;const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('battlePhase'),count=document.getElementById('battleCountdown'),msg=document.getElementById('battleMessage');try{battleTone(90,.18,'sawtooth',.035);await battleSleep(450);stage.classList.add('cards-enter');phase.textContent='MY TEAM DEPLOY';await battleSleep(700);const fightPromise=apiRequest('pvp/fight',{method:'POST',body:JSON.stringify({opponentId:id})});count.textContent='READY';await battleSleep(650);count.textContent='FIGHT';stage.classList.add('fight');battleTone(440,.18,'square',.075);const d=await fightPromise;count.textContent='';const enemyCards=(d.defenderDeck||[]).map(x=>({id:String(x.id),title:x.title||x.card_title||'상대 카드',grade:x.rarity||x.grade||'C',image:x.image||x.image_url||'',focusX:50,focusY:50}));const enemyBox=document.getElementById('pvpEnemyTeam');enemyBox.classList.remove('pvp-enemy-loading');enemyBox.innerHTML=enemyCards.map((c,i)=>`<div class="battle-card-fighter grade-${String(c.grade||'C').toLowerCase()}" data-enemy-fighter="${i}" style="--i:${i}"><div class="fighter-aura"></div>${c.image?`<img src="${c.image}">`:'<div class="monster-placeholder">?</div>'}<div class="fighter-grade">${c.grade}</div><span>${escapeHtml(c.title)}</span></div>`).join('');stage.classList.add('enemy-enter');phase.textContent='OPPONENT DEPLOY';await battleSleep(850);let myHp=100,enemyHp=100;const myWin=d.result==='WIN';const myHit=Math.max(12,Math.min(28,Math.round((Number(d.attackerPower)||1)/(Number(d.defenderPower)||1)*18)));const enemyHit=Math.max(12,Math.min(28,Math.round((Number(d.defenderPower)||1)/(Number(d.attackerPower)||1)*18)));for(let i=0;i<5;i++){battleActivateCard(stage,i,mine[i]?.grade);phase.textContent=`${mine[i]?.grade||'CARD'} MEMBER STRIKE`;stage.classList.add('player-attack');await battleSleep(220);enemyHp=Math.max(myWin&&i<4?4:0,enemyHp-myHit);battleSetHp(stage,'enemy',enemyHp);battleBurst(stage,'74%','43%',gradeOrder[mine[i]?.grade]>=gradeOrder.UR?30:18);battleDamage(stage,`-${Math.max(100,Math.round((Number(d.defenderPower)||0)*myHit/100))}`,'enemy',gradeOrder[mine[i]?.grade]>=gradeOrder.UR);battleTone(190+i*25,.1,'square',.05);await battleSleep(520);stage.classList.remove('player-attack');if(i<enemyCards.length&&(enemyHp>0||!myWin)){phase.textContent=`${enemyCards[i]?.grade||'CARD'} COUNTER`;const ef=stage.querySelector(`[data-enemy-fighter="${i}"]`);if(ef)ef.classList.add('active-attacker');await battleSleep(180);myHp=Math.max(!myWin&&i<4?4:0,myHp-enemyHit);battleSetHp(stage,'team',myHp);battleBurst(stage,'27%','43%',gradeOrder[enemyCards[i]?.grade]>=gradeOrder.UR?30:18);battleDamage(stage,`-${Math.max(100,Math.round((Number(d.attackerPower)||0)*enemyHit/100))}`,'player',gradeOrder[enemyCards[i]?.grade]>=gradeOrder.UR);battleTone(78,.18,'sawtooth',.07);await battleSleep(560);if(ef)ef.classList.remove('active-attacker')}}stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('active-attacker'));if(myWin){battleSetHp(stage,'enemy',0);battleBurst(stage,'74%','43%',56);battleDamage(stage,'FINISH!','enemy',true);battleTone(620,.32,'sawtooth',.09)}else{battleSetHp(stage,'team',0);battleBurst(stage,'26%','43%',50);battleDamage(stage,'K.O.','player',true);battleTone(48,.38,'square',.09)}await battleSleep(950);stage.classList.add(myWin?'battle-win-v863':'battle-lose-v863');phase.textContent=myWin?'PVP VICTORY':'PVP DEFEAT';msg.innerHTML=`<strong>${myWin?'VICTORY':'DEFEAT'}</strong><span>${Number(d.attackerPower).toLocaleString()} VS ${Number(d.defenderPower).toLocaleString()}</span><div class="battle-reward-pop"><small>SEASON SCORE</small><b>${d.scoreChange>0?'+':''}${d.scoreChange}</b>${d.scoreAdjustment?`<em>${escapeHtml(d.scoreAdjustment.label)} · ${Number(d.scoreAdjustment.multiplier)}%</em>`:''}</div><button type="button" class="btn pvp-result-confirm" id="pvpResultConfirm">PvP 화면으로 돌아가기</button><em>화면을 눌러도 돌아갑니다</em>`;pvpState.profile.season_score=d.scoreAfter;pvpState.energy=d.energy||pvpState.energy;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();const exitPvpBattle=()=>{modal.onclick=null;modal.className='modal';modal.innerHTML='';pvpState.tab='match';renderShell('pvp')};setTimeout(()=>{modal.onclick=()=>exitPvpBattle();const confirmBtn=document.getElementById('pvpResultConfirm');if(confirmBtn)confirmBtn.onclick=e=>{e.stopPropagation();exitPvpBattle()}},250)}catch(e){if(e.energy)pvpState.energy=e.energy;msg.innerHTML=`<span>${escapeHtml(e.message)}</span><button type="button" class="btn pvp-result-confirm" id="pvpErrorConfirm">PvP 화면으로 돌아가기</button>`;const close=()=>{modal.onclick=null;modal.className='modal';modal.innerHTML='';pvpState.tab='match';renderShell('pvp')};modal.onclick=close;const b=document.getElementById('pvpErrorConfirm');if(b)b.onclick=e=>{e.stopPropagation();close()}}}
async function claimPvpReward(){try{const d=await apiRequest('pvp/reward/claim',{method:'POST'});saveUser(apiUserToLocal(d.user));alert(`${d.tier.name} 달성 보상으로 ${Number(d.rewardCoin||0).toLocaleString()}코인과 카드조각 ${Number(d.rewardShards||0).toLocaleString()}개를 받았습니다.`);renderShell('pvp')}catch(e){alert(e.message)}}
async function claimPvpRankReward(){try{const d=await apiRequest('pvp/rank-reward/claim',{method:'POST'});saveUser(apiUserToLocal(d.user));alert(`${d.rank}위 시즌 랭킹 보상으로 ${Number(d.rewardCoin||0).toLocaleString()}코인과 카드조각 ${Number(d.rewardShards||0).toLocaleString()}개를 받았습니다.`);renderShell('pvp')}catch(e){alert(e.message)}}

init();
