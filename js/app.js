const app = document.getElementById('app');
const STORAGE_KEY = 'cnine_card_user_v10';
const LEGACY_STORAGE_KEYS = ['cnine_card_user_v08', 'cnine_card_user'];
const TEST_COIN = 5000;
let cards = [];
let selectedPackId = 'basic';
let magicSystemState={visible:false,enabled:false,ownerTest:false,magicCrystals:0,settings:{drawEnabled:false,drawCost:100},cards:[],loadouts:[]};
const magicUiState={deckType:'PVE',selectedSlot:1};

const gradeOrder = { FUR: 10, LIMITED: 9, MA: 8, SSR: 7, UR: 6, HR: 5, SR: 4, R: 3, U: 2, C: 1 };
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
    cards = (await response.json()).map(normalizeClientCard);
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
    user.magicCrystals ??= 0;
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
function ownedIds(user) { return new Set((user?.owned || []).map(id=>String(id))); }
function normalizeClientCard(card={}){return {...card,id:String(card.id??card.card_id??''),grade:String(card.grade||card.rarity||'C').toUpperCase(),focusX:Number(card.focusX??card.focus_x??50),focusY:Number(card.focusY??card.focus_y??50)};}
async function refreshCardCatalogForCurrentViewer(){
  if(!API_MODE||!API_TOKEN)return false;
  try{clearApiCache('cards');const data=await apiRequest('cards',{}, {ttl:0,timeoutMs:10000});if(!Array.isArray(data?.cards))return false;cards=data.cards.map(normalizeClientCard);writeStartupSnapshot({cards:data.cards});viewerCatalogWasRefreshed=true;return true}catch(error){console.warn('로그인 후 카드 고유 능력 카탈로그 갱신 실패:',error);return false}
}
function mergeClientCards(incoming=[]){for(const raw of incoming||[]){const card=normalizeClientCard(raw?.card||raw);if(!card.id)continue;const index=cards.findIndex(x=>String(x.id)===card.id);if(index>=0)cards[index]={...cards[index],...card};else cards.push(card);}}
function progress(user) { return cards.length ? Math.round((ownedIds(user).size / cards.length) * 1000) / 10 : 0; }
function escapeHtml(value = '') { return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function powerTypeIndicator(card){const grade=String(card?.grade||card?.rarity||'').toUpperCase();if(grade==='FUR')return '';const type=String(card?.powerType||card?.power_type||'').toUpperCase();return type==='NORMAL'?'⚡':type==='HIGH'?'⚡⚡':type==='TOP'?'⚡⚡⚡':'';}
function powerTypeIndicatorHtml(card,classes=''){const icon=powerTypeIndicator(card);if(!icon)return '';const type=String(card?.powerType||card?.power_type||'').toUpperCase();const tone=type==='NORMAL'?'normal':type==='HIGH'?'advanced':type==='TOP'?'top':'';return `<i class="power-type-indicator power-type-${tone} ${classes}" aria-label="전투력 유형">${icon}</i>`;}
function getPack(id) { return PACKS.find(p => p.id === id) || PACKS[0]; }
function kstDateKey(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(date); }
function canClaimAttendance(user) { return user.attendance?.lastClaimDate !== kstDateKey(); }
function cardScore(user) { const owned = ownedIds(user); return cards.reduce((sum, card) => { if(!owned.has(card.id)) return sum; const level=Number(user.breakthroughs?.[card.id]||0); return sum + gradeScore[card.grade] + Math.round(gradeScore[card.grade] * level * 0.12); }, 0); }
function scoreBreakdown(user) {
  const owned = ownedIds(user);
  return ['FUR','LIMITED','MA','SSR','UR','HR','SR','R','U','C'].map(grade => ({ grade, count: cards.filter(c => c.grade === grade && owned.has(c.id)).length, score: gradeScore[grade] }));
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

function navGroupForTab(tab){
  if(['battle','pvp'].includes(tab))return 'battle';
  if(['attendance','dailyquest','messages'].includes(tab))return 'rewards';
  if(tab==='magic')return 'magic';
  if(tab==='rank')return 'rank';
  if(tab==='mineral')return 'mineral';
  if(['dex','evolution'].includes(tab))return 'dex';
  return 'buy';
}

function renderMainNavigation(tab){
  const group=navGroupForTab(tab);
  const primary=[
    {id:'buy',label:'카드팩'},
    {id:'dex',label:'도감'},
    {id:'battle',label:'전투',tab:group==='battle'?tab:'battle'},
    ...(magicSystemState.visible?[{id:'magic',label:'마법카드'}]:[]),
    {id:'rewards',label:'보상',tab:group==='rewards'?tab:'attendance'},
    {id:'rank',label:'랭킹'},
    {id:'mineral',label:'교환소'}
  ];
  const primaryHtml=`<nav class="tabs primary-tabs" aria-label="메인 메뉴">${primary.map(item=>`<button class="tab ${((item.id===group)||(item.id===tab))?'active':''}" data-tab="${item.tab||item.id}">${item.label}</button>`).join('')}</nav>`;
  if(group==='battle')return `${primaryHtml}<nav class="sub-tabs" aria-label="전투 메뉴"><button class="tab ${tab==='battle'?'active':''}" data-tab="battle">PVE</button>${pvpFeatureEnabled?`<button class="tab ${tab==='pvp'?'active':''}" data-tab="pvp">PVP</button>`:''}</nav>`;
  if(group==='rewards')return `${primaryHtml}<nav class="sub-tabs" aria-label="보상 메뉴"><button class="tab ${tab==='attendance'?'active':''}" data-tab="attendance">접속보상</button><button class="tab ${tab==='dailyquest'?'active':''}" data-tab="dailyquest">일일퀘스트</button><button class="tab ${tab==='messages'?'active':''}" data-tab="messages">메시지함</button></nav>`;
  return `${primaryHtml}<div class="sub-tabs sub-tabs-placeholder" aria-hidden="true"></div>`;
}


function mobileNavigationHtml(tab){
  const group=navGroupForTab(tab);
  const moreActive=['attendance','dailyquest','messages','rank','mineral','inventory'].includes(tab);
  const magicButton=magicSystemState.visible?`<button class="mobile-bottom-item ${tab==='magic'?'active':''}" type="button" data-mobile-tab="magic"><span>✦</span><b>마법카드</b></button>`:'';
  return `<nav class="mobile-bottom-nav" aria-label="모바일 주요 메뉴">
    <button class="mobile-bottom-item ${tab==='buy'?'active':''}" type="button" data-mobile-tab="buy"><span>▣</span><b>카드팩</b></button>
    <button class="mobile-bottom-item ${group==='dex'?'active':''}" type="button" data-mobile-open-sheet="collection"><span>◇</span><b>도감</b></button>
    <button class="mobile-bottom-item mobile-bottom-primary ${group==='battle'?'active':''}" type="button" data-mobile-open-sheet="battle"><span>⚔</span><b>전투</b></button>
    ${magicButton}
    <button class="mobile-bottom-item ${moreActive?'active':''}" type="button" data-mobile-open-sheet="more"><span>•••</span><b>더보기</b></button>
  </nav>
  <div class="mobile-nav-sheet-layer" id="mobileNavSheetLayer" hidden>
    <button type="button" class="mobile-nav-sheet-backdrop" data-mobile-sheet-close aria-label="메뉴 닫기"></button>
    <section class="mobile-nav-sheet" data-mobile-sheet="collection" aria-label="도감 메뉴 선택">
      <header><div><small>COLLECTION MENU</small><h2>도감</h2><p>카드 수집 현황을 확인하거나 진화를 진행하세요.</p></div><button type="button" data-mobile-sheet-close aria-label="닫기">×</button></header>
      <div class="mobile-sheet-action-list">
        <button type="button" data-mobile-tab="dex"><i>◇</i><span><b>카드 도감</b><small>멤버별 수집 카드 확인</small></span><em>열기</em></button>
        <button type="button" data-mobile-tab="evolution"><i>✦</i><span><b>카드 진화</b><small>SSR → MA · MA +13 → PRESTIGE</small></span><em>입장</em></button>
      </div>
    </section>
    <section class="mobile-nav-sheet" data-mobile-sheet="battle" aria-label="전투 콘텐츠 선택">
      <header><div><small>BATTLE CONTENTS</small><h2>전투 콘텐츠</h2><p>진입할 전투를 선택하세요.</p></div><button type="button" data-mobile-sheet-close aria-label="닫기">×</button></header>
      <div class="mobile-sheet-action-list">
        <button type="button" data-mobile-tab="battle"><i>⚔</i><span><b>PVE</b><small>몬스터 토벌 · 월드레이드 · 무한의탑</small></span><em>입장</em></button>
        ${pvpFeatureEnabled?`<button type="button" data-mobile-tab="pvp"><i>◇</i><span><b>PVP</b><small>일반 비동기 대전</small></span><em>입장</em></button>
        <button type="button" data-mobile-captain><i>♛</i><span><b>대장전</b><small>3:3 팀 승자 연전</small></span><em>입장</em></button>`:''}
      </div>
    </section>
    <section class="mobile-nav-sheet" data-mobile-sheet="more" aria-label="더보기 메뉴">
      <header><div><small>MORE MENU</small><h2>더보기</h2><p>보상과 편의 기능을 모았습니다.</p></div><button type="button" data-mobile-sheet-close aria-label="닫기">×</button></header>
      <button type="button" class="mobile-reward-hub-button" data-mobile-switch-sheet="rewards"><i>◆</i><span><b>보상 허브</b><small>접속 보상 · 일일 퀘스트 · 메시지함</small></span><em>열기</em></button>
      <div class="mobile-more-grid">
        <button type="button" data-mobile-tab="rank"><i>♛</i><b>랭킹</b></button>
        <button type="button" data-mobile-tab="mineral"><i>⬡</i><b>교환소</b></button>
        <button type="button" data-mobile-tab="inventory"><i>▱</i><b>인벤토리</b></button>
        <button type="button" data-mobile-account><i>●</i><b>내 정보</b></button>
      </div>
    </section>
    <section class="mobile-nav-sheet" data-mobile-sheet="rewards" aria-label="보상 허브">
      <header><div><small>REWARD HUB</small><h2>보상 허브</h2><p>받을 수 있는 보상을 확인하세요.</p></div><button type="button" data-mobile-sheet-close aria-label="닫기">×</button></header>
      <div class="mobile-sheet-action-list">
        <button type="button" data-mobile-tab="attendance"><i>◈</i><span><b>접속 보상</b><small>매일 접속하고 보상 받기</small></span><em>확인</em></button>
        <button type="button" data-mobile-tab="dailyquest"><i>✓</i><span><b>일일 퀘스트</b><small>오늘의 플레이 목표</small></span><em>확인</em></button>
        <button type="button" data-mobile-tab="messages"><i>✉</i><span><b>메시지함</b><small>운영 메시지와 지급 내역</small></span><em>확인</em></button>
      </div>
      <button type="button" class="mobile-sheet-back" data-mobile-switch-sheet="more">← 더보기로 돌아가기</button>
    </section>
  </div>`;
}

function openCaptainFromMobile(){
  renderShell('pvp');
  let attempts=0;
  const timer=setInterval(()=>{
    attempts+=1;
    const button=document.querySelector('[data-captain-v3],[data-captain]');
    if(button){clearInterval(timer);button.click();return;}
    if(attempts>=30)clearInterval(timer);
  },100);
}

function bindMobileNavigation(){
  const layer=document.getElementById('mobileNavSheetLayer');
  if(!layer)return;
  const sheets=[...layer.querySelectorAll('[data-mobile-sheet]')];
  const close=()=>{
    layer.classList.remove('open');
    document.body.classList.remove('mobile-menu-open');
    setTimeout(()=>{if(!layer.classList.contains('open'))layer.hidden=true},180);
  };
  const open=name=>{
    sheets.forEach(sheet=>sheet.classList.toggle('active',sheet.dataset.mobileSheet===name));
    layer.hidden=false;
    document.body.classList.add('mobile-menu-open');
    requestAnimationFrame(()=>layer.classList.add('open'));
  };
  document.querySelectorAll('[data-mobile-open-sheet]').forEach(button=>button.onclick=()=>open(button.dataset.mobileOpenSheet));
  layer.querySelectorAll('[data-mobile-sheet-close]').forEach(button=>button.onclick=close);
  layer.querySelectorAll('[data-mobile-switch-sheet]').forEach(button=>button.onclick=()=>open(button.dataset.mobileSwitchSheet));
  document.querySelectorAll('[data-mobile-tab]').forEach(button=>button.onclick=()=>{close();renderShell(button.dataset.mobileTab)});
  layer.querySelector('[data-mobile-account]')?.addEventListener('click',()=>{close();document.getElementById('playerAccountBtn')?.click()});
  layer.querySelector('[data-mobile-captain]')?.addEventListener('click',()=>{close();openCaptainFromMobile()});
}

let shellRenderSeq=0;
function renderShell(tab) {
  const renderSeq=++shellRenderSeq;
  document.body.classList.remove('mobile-menu-open');
  if(tab==='pvp'&&!pvpFeatureEnabled)tab='buy';
  runtimeCommandContext=tab;
  const user = loadUser();
  if (!user) return renderLogin();
  const views = { buy: buyView, dex: dexView, evolution:(typeof window.evolutionView==='function'?window.evolutionView:buyView), battle: battleView, pvp: pvpView, magic: magicView, attendance: attendanceView, dailyquest: dailyQuestView, messages: messagesView, rank: rankView, mineral: mineralExchangeView, inventory: inventoryView };
  const battleActive=['battle','pvp'].includes(tab),rewardActive=['attendance','dailyquest','messages'].includes(tab),collectionActive=['dex','evolution'].includes(tab);
  const navHtml=`<nav class="main-nav" aria-label="주요 메뉴">
    <button class="main-nav-item ${tab==='buy'?'active':''}" type="button" data-tab="buy"><span class="main-nav-icon">▣</span><b>카드팩</b></button>
    <div class="main-nav-group ${collectionActive?'active':''}" data-nav-group="collection">
      <button class="main-nav-item main-nav-trigger" type="button" aria-expanded="false"><span class="main-nav-icon">◇</span><b>도감</b><i>⌄</i></button>
      <div class="main-nav-dropdown" role="menu">
        <button type="button" data-tab="dex"><span>멤버별 카드 수집 현황</span><b>카드 도감</b></button>
        <button type="button" data-tab="evolution"><span>상위 등급 카드 진화</span><b>카드 진화</b></button>
      </div>
    </div>
    <div class="main-nav-group ${battleActive?'active':''}" data-nav-group="battle">
      <button class="main-nav-item main-nav-trigger" type="button" aria-expanded="false"><span class="main-nav-icon">⚔</span><b>전투</b><i>⌄</i></button>
      <div class="main-nav-dropdown" role="menu">
        <button type="button" data-tab="battle"><span>몬스터 토벌·레이드</span><b>PVE</b></button>
        ${pvpFeatureEnabled?'<button type="button" data-tab="pvp"><span>비동기 대전·대장전</span><b>PVP</b></button>':''}
      </div>
    </div>
    ${magicSystemState.visible?`<button class="main-nav-item magic-nav-item ${tab==='magic'?'active':''}" type="button" data-tab="magic"><span class="main-nav-icon">✦</span><b>마법카드</b></button>`:''}
    <div class="main-nav-group ${rewardActive?'active':''}" data-nav-group="reward">
      <button class="main-nav-item main-nav-trigger" type="button" aria-expanded="false"><span class="main-nav-icon">◆</span><b>보상</b><i>⌄</i></button>
      <div class="main-nav-dropdown" role="menu">
        <button type="button" data-tab="attendance"><span>접속 보상·쿠폰 입력</span><b>접속 보상</b></button>
        <button type="button" data-tab="dailyquest"><span>오늘의 플레이 목표</span><b>일일 퀘스트</b></button>
        <button type="button" data-tab="messages"><span>운영 메시지</span><b>메시지함</b></button>
      </div>
    </div>
    <button class="main-nav-item ${tab==='rank'?'active':''}" type="button" data-tab="rank"><span class="main-nav-icon">♛</span><b>랭킹</b></button>
    <button class="main-nav-item ${tab==='mineral'?'active':''}" type="button" data-tab="mineral"><span class="main-nav-icon">⬡</span><b>교환소</b></button>
  </nav>`;
  app.innerHTML = `<main class="page"><div class="ambient-lines"></div><header class="header"><div class="brand"><img class="brand-logo" src="assets/ui/cninelogo.png" alt="CNINE"><div><p class="eyebrow">CNINE CARD COLLECTION</p><h1>씨켓몬 카드뽑기</h1></div></div>${navHtml}</header>${mobileNavigationHtml(tab)}${(views[tab]||buyView)(user)}</main><div id="modal" class="modal"></div>`;
  const header=document.querySelector('.header');header?.insertAdjacentHTML('beforeend','<a class="fullscreen-play-link" href="https://cnine-card.pages.dev/" target="_blank" rel="noopener noreferrer" aria-label="씨켓몬 큰 화면으로 열기" title="새 탭에서 큰 화면으로 즐기기"><span>⛶</span><b>크게 보기</b></a>');
  const syncNavOpenState=()=>header?.classList.toggle('nav-menu-open',Boolean(document.querySelector('.main-nav-group.open')));
  const closeNavGroups=(except=null)=>{document.querySelectorAll('.main-nav-group.open').forEach(group=>{if(group!==except){group.classList.remove('open');group.querySelector('.main-nav-trigger')?.setAttribute('aria-expanded','false')}});syncNavOpenState()};
  document.querySelectorAll('.main-nav [data-tab]').forEach(button=>button.onclick=()=>{closeNavGroups();renderShell(button.dataset.tab)});
  document.querySelectorAll('.main-nav-trigger').forEach(button=>button.onclick=event=>{event.stopPropagation();const group=button.closest('.main-nav-group'),willOpen=!group.classList.contains('open');closeNavGroups(group);group.classList.toggle('open',willOpen);button.setAttribute('aria-expanded',String(willOpen));syncNavOpenState()});
  document.addEventListener('click',event=>{if(!event.target.closest('.main-nav'))closeNavGroups()},{once:true});
  bindMobileNavigation();
  bindView(tab);
  const deferShellLoad=(delay,task)=>setTimeout(()=>{if(renderSeq!==shellRenderSeq)return;try{const result=task();if(result&&typeof result.catch==='function')result.catch(()=>{})}catch(_){}},delay);
  // 메인 화면 출력 직후 MA 이상/프리미엄 큐브 소식을 동시에 불러오고, 인벤토리 요약만 짧게 지연한다.
  deferShellLoad(0,()=>Promise.allSettled([
    loadRecentHighGradeFeed(),
    loadRecentPremiumCubeFeed()
  ]));
  deferShellLoad(180,loadInventorySummary);
  if(API_MODE&&API_TOKEN)scheduleRuntimeCommandPoll(runtimeCommandPollDelay());
}

function summaryBar(user) {
  const coin=Number(user.coin||0).toLocaleString(),shards=Number(user.cardShards||0).toLocaleString(),crystals=Number(user.magicCrystals??magicSystemState.magicCrystals??0).toLocaleString();
  return `<section class="summary-bar">
    <div class="summary-card login-summary"><span class="summary-label">내 계정</span><div class="login-summary-row"><i class="login-dot"></i><b>${escapeHtml(user.nickname)}</b><button id="playerAccountBtn" type="button">내 정보</button></div></div>
    <div class="summary-card currency-summary"><span class="summary-label">보유 재화</span><div class="currency-list"><div class="currency-row coin"><i>◇</i><span>코인</span><b>${coin}</b></div><div class="currency-row shard"><i>✣</i><span>카드 조각</span><b>${shards}</b></div><div class="currency-row crystal"><i>✦</i><span>마법 결정</span><b>${crystals}</b></div></div></div>
    <div class="summary-card collection-summary"><span class="summary-label">카드 수집</span><div class="collection-summary-value"><b>${ownedIds(user).size}</b><i>/</i><strong>${cards.length}</strong></div><small>전체 도감 수집 현황</small></div>
    <button type="button" class="summary-card inventory-summary" id="inventorySummary"><i class="inventory-bag-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 8V6a5 5 0 0 1 10 0v2M5 8h14l1 13H4L5 8Z"/></svg></i><span class="inventory-summary-copy"><small class="summary-label">보관함</small><b>인벤토리</b><em id="inventorySummaryMeta">보유 내역 확인</em></span><strong id="inventorySummaryBadge" hidden>NEW</strong></button>
  </section><section class="high-grade-feed" aria-live="polite"><span class="high-grade-label">MA 등급 이상 획득 소식</span><div class="high-grade-viewport"><div id="highGradeTrack" class="high-grade-track"><span class="high-grade-empty">최근 MA 등급 이상 획득 기록을 불러오는 중...</span></div></div></section><section class="high-grade-feed premium-cube-feed" aria-live="polite"><span class="high-grade-label premium-cube-label">프리미엄 큐브 소식</span><div class="high-grade-viewport"><div id="premiumCubeTrack" class="high-grade-track premium-cube-track"><span class="high-grade-empty">최근 프리미엄 큐브 획득 기록을 불러오는 중...</span></div></div></section>`;
}

async function loadInventorySummary(){const card=document.getElementById('inventorySummary');if(!card)return;card.onclick=()=>renderShell('inventory');if(!API_MODE)return;try{const d=await apiRequest('inventory',{}, {ttl:3000}),meta=document.getElementById('inventorySummaryMeta'),badge=document.getElementById('inventorySummaryBadge');if(meta)meta.textContent=d.totalQuantity>0?`보유 ${Number(d.totalQuantity).toLocaleString()}개 · ${Number(d.ownedTypes)}종`:'획득한 특별 보관품 없음';if(badge){badge.hidden=!d.unseenTotal;badge.textContent=d.unseenTotal>99?'99+':`NEW ${d.unseenTotal}`}}catch{}}

async function loadRecentHighGradeFeed(){
  const track=document.getElementById('highGradeTrack');
  if(!track)return;
  if(!API_MODE){track.innerHTML='<span class="high-grade-empty">현재는 실시간 획득 소식을 불러올 수 없습니다.</span>';return;}
  try{
    const data=await apiRequest('recent-high-grade');
    const items=Array.isArray(data.items)?data.items:[];
    if(!items.length){track.innerHTML='<span class="high-grade-empty">아직 MA 등급 이상 획득 기록이 없습니다.</span>';return;}
    const messages=items.map(item=>`<span class="high-grade-item feed-grade-${escapeHtml(item.rarity)}"><b>"${escapeHtml(item.nickname)}"</b> 님이 <strong>${escapeHtml(item.card_title)} [${escapeHtml(item.rarity)}]</strong> 카드를 획득했습니다.</span>`).join('');
    track.innerHTML=messages+messages;
    track.classList.toggle('static',items.length===1);
  }catch(error){track.innerHTML='<span class="high-grade-empty">획득 소식을 불러오지 못했습니다.</span>';}
}

async function loadRecentPremiumCubeFeed(){
  const track=document.getElementById('premiumCubeTrack');
  if(!track)return;
  if(!API_MODE){track.innerHTML='<span class="high-grade-empty">현재는 실시간 큐브 소식을 불러올 수 없습니다.</span>';return;}
  try{
    const data=await apiRequest('recent-premium-cube',{}, {ttl:1000});
    const items=Array.isArray(data.items)?data.items:[];
    if(!items.length){track.innerHTML='<span class="high-grade-empty">아직 프리미엄 큐브 획득 기록이 없습니다.</span>';return;}
    const messages=items.map(item=>`<span class="high-grade-item premium-cube-item"><b>"${escapeHtml(item.nickname)}"</b> 님이 <strong>프리미엄 큐브</strong>를 획득했습니다.<em>${escapeHtml(item.source||'PVE')}</em></span>`).join('');
    track.innerHTML=messages+messages;
    track.classList.toggle('static',items.length===1);
  }catch(error){track.innerHTML='<span class="high-grade-empty">큐브 획득 소식을 불러오지 못했습니다.</span>';}
}

function packImagePath(pack) {
  const files = { basic: 'standard-pack.png', advanced: 'advanced-pack.png', premium: 'premium-pack.png', pickup: 'limited-pack.png' };
  return `assets/ui/packs/${files[pack.id] || files[pack.theme] || files.basic}?v=1018-standard-pack-repair`;
}

function packSelector() {
  return `<section class="pack-selector"><div class="pack-selector-head"><div><p class="eyebrow">SELECT CARD PACK</p><h2>카드팩 선택</h2></div><span>팩마다 가격과 등장 범위가 다릅니다.</span></div><div class="pack-list">${PACKS.map(pack => `<button class="pack-choice pack-choice-${pack.theme} ${pack.id===selectedPackId?'active':''}" data-pack-id="${pack.id}"><span class="mini-pack ${pack.theme}"><img src="${packImagePath(pack)}" alt="${escapeHtml(pack.name)}"><i></i></span><strong>${pack.name}</strong><small>${pack.description}</small><em>${pack.range} · 1장 ${pack.price}코인</em></button>`).join('')}</div></section>`;
}

function buyView(user) {
  const pack = getPack(selectedPackId),weekly=user.weeklyPremiumCube||{currentRate:.1,earnedCount:0,weeklyLimit:2};
  return `${summaryBar(user)}${packSelector()}<section class="game-hero pack-theme-${pack.theme}"><div class="hero-copy"><p class="eyebrow">${pack.subtitle}</p><h2>${escapeHtml(pack.name)}을<br><em>개봉하세요</em></h2><p>${escapeHtml(pack.description)}<br>10연속 ${pack.guarantee10} 이상 1장 · 20연속 ${pack.guarantee20} 이상 1장 보장</p><div class="draw-options"><button class="btn draw" data-pack-id="${pack.id}" data-count="1" data-cost="${pack.price}"><small>1 CARD</small>${pack.price}코인</button><button class="btn draw hot" data-pack-id="${pack.id}" data-count="10" data-cost="${pack.price*10}"><small>10 CARDS · ${pack.guarantee10}+</small>${(pack.price*10).toLocaleString()}코인</button><button class="btn draw premium-btn" data-pack-id="${pack.id}" data-count="20" data-cost="${pack.price*20}"><small>20 CARDS · ${pack.guarantee20}+</small>${(pack.price*20).toLocaleString()}코인</button></div></div><div class="hero-pack-zone"><div class="pack-aura"></div>${packArt(pack)}</div></section><section class="weekly-premium-cube-status"><div class="weekly-premium-cube-visual" aria-hidden="true"><span class="weekly-premium-cube-glow"></span><img src="assets/ui/packs/premium-cube.png" alt=""></div><div class="weekly-premium-cube-copy"><small>WEEKLY PREMIUM CUBE</small><h3>프리미엄 큐브 주간 보장</h3><p>PVE · 무한의탑 · PVP · 대장전<br>참여 시 확률이 상승합니다.</p><div class="weekly-premium-cube-progress"><span style="width:${Math.min(100,Math.max(0,Number(weekly.currentRate||.1)/Math.max(.1,Number(weekly.maxRate||10))*100))}%"></span></div></div><div class="weekly-premium-cube-values"><span><small>현재 획득 확률</small><b>${Number(weekly.currentRate||.1).toFixed(1)}%</b></span><span><small>이번 주 획득</small><b>${Number(weekly.earnedCount||0)} / ${Number(weekly.weeklyLimit||2)}개</b></span></div></section>`;
}

function recentCards(user) {
  const items = user.history.slice(-4).reverse();
  if (!items.length) return '<div class="empty-recent">아직 획득한 카드가 없습니다.<br>첫 카드를 뽑아보세요.</div>';
  return `<div class="recent-grid">${items.map(item => { const c=cards.find(x=>x.id===item.cardId); if(!c)return''; return `<button class="recent-item" data-card-id="${c.id}"><img src="${c.image}" style="object-position:${c.focusX}% ${c.focusY}%"><span><b>${escapeHtml(c.title)}${c.uniqueAbility?`<em class="recent-unique-tag" data-card-profile="${escapeHtml(String(c.id))}">◇ 고유</em>`:''}</b><small>${c.grade}${powerTypeIndicator(c)?` · ${powerTypeIndicator(c)}`:''}${item.duplicate?' · 보유중':' · NEW'}</small></span></button>`; }).join('')}</div>`;
}

function packArt(pack) {
  return `<div class="pack-envelope pack-image-envelope ${pack.theme}"><img src="${packImagePath(pack)}" class="pack-product-image" alt="${escapeHtml(pack.name)}"><div class="pack-image-gloss"></div></div>`;
}

const DEX_PREF_KEY='cnine:dexPreferences:v1';
function loadDexPrefs(){try{return {...{search:'',grade:'',sort:'default',favoriteOnly:false,favoriteMembers:[]},...JSON.parse(localStorage.getItem(DEX_PREF_KEY)||'{}')}}catch(_){return {search:'',grade:'',sort:'default',favoriteOnly:false,favoriteMembers:[]}}}
function saveDexPrefs(prefs){try{localStorage.setItem(DEX_PREF_KEY,JSON.stringify(prefs))}catch(_){}}
function dexMemberStats(name,owned){const list=cards.filter(c=>c.name===name);return {name,list,got:list.filter(c=>owned.has(c.id)).length}}
function sortDexMembers(items,prefs){const favorites=new Set(prefs.favoriteMembers||[]);return [...items].sort((a,b)=>{
  const favoriteDiff=Number(favorites.has(b.name))-Number(favorites.has(a.name));
  if(favoriteDiff)return favoriteDiff;
  if(prefs.sort==='name')return a.name.localeCompare(b.name,'ko');
  if(prefs.sort==='owned')return (b.got-a.got)||(b.list.length-a.list.length)||a.name.localeCompare(b.name,'ko');
  if(prefs.sort==='rate')return ((b.got/Math.max(1,b.list.length))-(a.got/Math.max(1,a.list.length)))||a.name.localeCompare(b.name,'ko');
  if(prefs.sort==='count')return (b.list.length-a.list.length)||a.name.localeCompare(b.name,'ko');
  return 0;
})}
function dexView(user) {
  const owned=ownedIds(user),prefs=loadDexPrefs(),uniqueCount=cards.filter(card=>card.uniqueAbility).length;
  const members=sortDexMembers([...new Set(cards.map(c=>c.name))].map(name=>dexMemberStats(name,owned)),prefs);
  return `${summaryBar(user)}<section class="dex-cover"><div><p class="eyebrow">MY COLLECTION ALBUM</p><h2>씨켓몬 도감</h2><p>멤버별 앨범을 펼쳐 수집한 카드와 고유 능력을 확인하세요.</p>${uniqueCount?`<button type="button" class="dex-unique-legend" data-scroll-unique="1"><i>◇</i><span><b>고유 능력 카드 ${uniqueCount}장</b><small>카드의 ‘고유’ 배지를 누르면 능력치 프로필이 바로 열립니다.</small></span></button>`:''}</div><div class="dex-total"><b>${owned.size}</b><span>/ ${cards.length} CARDS</span></div></section><div class="dex-toolbar"><div class="dex-search"><input id="dexSearch" value="${escapeHtml(prefs.search||'')}" placeholder="카드명 또는 멤버 검색"><select id="gradeFilter"><option value="">전체 등급</option>${['FUR','PRESTIGE','LIMITED','MA','SSR','UR','HR','SR','R','U','C'].map(g=>`<option ${prefs.grade===g?'selected':''}>${g}</option>`).join('')}</select><select id="dexSort"><option value="default" ${prefs.sort==='default'?'selected':''}>기본 순서</option><option value="name" ${prefs.sort==='name'?'selected':''}>멤버 이름순</option><option value="owned" ${prefs.sort==='owned'?'selected':''}>보유 카드 많은순</option><option value="rate" ${prefs.sort==='rate'?'selected':''}>수집률 높은순</option><option value="count" ${prefs.sort==='count'?'selected':''}>전체 카드 많은순</option></select></div><button type="button" id="favoriteMemberOnly" class="dex-favorite-filter ${prefs.favoriteOnly?'active':''}" aria-pressed="${prefs.favoriteOnly?'true':'false'}">★ 즐겨찾기 멤버만</button></div><div class="dex-guide"><span>멤버 이름 옆 별을 눌러 즐겨찾기</span><span>${uniqueCount?'◇ 고유 배지 선택 시 카드 능력치 확인':'즐겨찾기 멤버는 항상 위에 표시'}</span></div><div id="dexSections">${members.map((item,index)=>dexSection(item,owned,index,prefs)).join('')}</div>`;
}
function dexSection(item,owned,index=0,prefs=loadDexPrefs()) {
  const {name,list,got}=item,favorite=(prefs.favoriteMembers||[]).includes(name);
  return `<section class="dex-section ${index>1?'collapsed':''} ${favorite?'favorite-member':''}" data-member="${escapeHtml(name)}" data-total="${list.length}" data-owned="${got}"><div class="dex-section-head"><button type="button" class="dex-fold-button"><span><i class="fold-icon">⌄</i><strong>${escapeHtml(name)}</strong><small>COLLECTION ALBUM</small></span><b>${got} / ${list.length}</b></button><button type="button" class="dex-member-favorite ${favorite?'active':''}" data-favorite-member="${escapeHtml(name)}" aria-label="${escapeHtml(name)} 즐겨찾기" aria-pressed="${favorite?'true':'false'}">★</button></div><div class="album-grid">${list.map(c=>cardHtml(c,owned.has(c.id),'small')).join('')}</div></section>`;
}


function battleView(user){
  const ownerRaid=`<div class="pve-mode-tabs"><button class="pve-mode-btn active" data-pve-mode="hunt">몬스터 토벌</button><button class="pve-mode-btn" data-pve-mode="raid">월드 레이드</button></div>`;
  return `${summaryBar(user)}${ownerRaid}<div id="pveHuntView"><nav class="mobile-pve-tabs" aria-label="모바일 PVE 메뉴"><button type="button" data-pve-tab="deck">내 덱</button><button type="button" data-pve-tab="cards">카드 선택</button><button type="button" data-pve-tab="monsters">몬스터</button></nav><section class="battle-cover"><div><p class="eyebrow">CNINE PVE BATTLE</p><h2>몬스터 토벌전</h2><p>보유한 멤버 카드 5장을 편성하세요. 활성화된 카드 고유 능력도 전투력 계산에 반영됩니다.</p></div><div class="battle-cover-side"><div class="battle-energy-card"><div><span>⚔ 전투 횟수</span><b id="battleEnergyCount">- / -</b></div><div class="battle-energy-track"><i id="battleEnergyFill"></i></div><small id="battleEnergyTimer">불러오는 중...</small></div><div class="battle-total"><span>편성 전투력</span><b id="battleDeckPower">0</b></div></div></section><section class="battle-layout"><div class="battle-panel pve-deck-panel"><div class="pve-mobile-pane" data-pve-pane="deck"><div class="panel-title"><div><p class="eyebrow">MY DECK</p><h2>멤버 카드 5장 편성</h2></div><div class="pve-deck-actions"><button type="button" class="pve-deck-btn save" id="saveBattleDeck"><span>💾</span> 덱 저장</button><button type="button" class="pve-deck-btn reset" id="clearBattleDeck"><span>↺</span> 덱 리셋</button></div></div><div id="battleDeck" class="battle-deck"></div><button type="button" class="pve-mobile-next" data-pve-tab="cards">카드 변경하기</button></div><div class="pve-mobile-pane" data-pve-pane="cards"><div class="pve-mobile-pane-title"><div><p class="eyebrow">CARD SELECT</p><h2>보유 카드 선택</h2></div><button type="button" data-pve-tab="deck">내 덱 보기</button></div><div id="battleCards" class="battle-card-picker"><div class="empty-recent">전투 정보를 불러오는 중...</div></div></div></div><aside class="battle-panel monster-panel pve-mobile-pane" data-pve-pane="monsters"><div class="panel-title"><div><p class="eyebrow">PVE ENEMY</p><h2>몬스터 선택</h2></div></div><div id="battleMonsters" class="battle-monsters"></div><button class="btn battle-start" id="battleStart" disabled>전투 시작</button></aside></section><nav class="mobile-pve-quickbar" aria-label="PVE 빠른 이동"><button type="button" data-pve-tab="deck"><span>🃏</span>내 덱</button><button type="button" data-pve-tab="cards"><span>✚</span>카드</button><button type="button" data-pve-tab="monsters"><span>👹</span>몬스터</button></nav></div><div id="pveRaidView" class="pve-raid-view" hidden></div>`;
}
const MOBILE_PVE_TAB_KEY='cnine:mobilePveTab';
function isMobilePve(){return window.matchMedia('(max-width:760px)').matches}
function getMobilePveTab(){try{return sessionStorage.getItem(MOBILE_PVE_TAB_KEY)||''}catch(_){return ''}}
function saveMobilePveTab(tab){try{sessionStorage.setItem(MOBILE_PVE_TAB_KEY,tab)}catch(_){}}
function setMobilePveTab(tab,{scroll=true}={}){
  if(!['deck','cards','monsters'].includes(tab))tab='monsters';
  saveMobilePveTab(tab);
  const root=document.getElementById('pveHuntView');
  if(!root)return;
  root.dataset.mobilePveTab=tab;
  root.querySelectorAll('[data-pve-tab]').forEach(button=>{
    const active=button.dataset.pveTab===tab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  root.querySelectorAll('[data-pve-pane]').forEach(pane=>{
    pane.classList.toggle('mobile-active',pane.dataset.pvePane===tab);
  });
  if(scroll&&isMobilePve()){
    const target=root.querySelector(`[data-pve-pane="${tab}"]`);
    requestAnimationFrame(()=>target?.scrollIntoView({behavior:'smooth',block:'start'}));
  }
}
function bindMobilePveTabs(){
  const root=document.getElementById('pveHuntView');
  if(!root)return;
  root.querySelectorAll('[data-pve-tab]').forEach(button=>{
    button.onclick=()=>setMobilePveTab(button.dataset.pveTab);
  });
  const requested=getMobilePveTab();
  const initial=requested||((battleState.deck?.length===5)?'monsters':'deck');
  setMobilePveTab(initial,{scroll:false});
}
const LAST_PVE_MONSTER_KEY='cnine:lastPveMonsterId';
function getLastPveMonsterId(){try{const value=Number(localStorage.getItem(LAST_PVE_MONSTER_KEY));return Number.isFinite(value)&&value>0?value:null}catch(_){return null}}
function saveLastPveMonsterId(monsterId){try{const value=Number(monsterId);if(Number.isFinite(value)&&value>0)localStorage.setItem(LAST_PVE_MONSTER_KEY,String(value))}catch(_){}}
let battleState={config:null,monsters:[],selectedMonster:null,deck:[],energy:null,energyTimer:null,serverOffset:0,restoreMonsterCursor:false};

function stopBattleEnergyTimer(){if(battleState.energyTimer){clearInterval(battleState.energyTimer);battleState.energyTimer=null}}
function battleEnergyText(ms){const sec=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function renderBattleEnergy(){const e=battleState.energy,count=document.getElementById('battleEnergyCount'),fill=document.getElementById('battleEnergyFill'),timer=document.getElementById('battleEnergyTimer');if(!e||!count)return;count.textContent=e.unlimited?'∞ 무제한':`${e.energy} / ${e.maxEnergy}`;if(fill)fill.style.width=`${e.unlimited?100:Math.max(0,Math.min(100,e.energy/e.maxEnergy*100))}%`;if(timer){if(e.unlimited)timer.textContent='무제한 적용';else if(e.energy>=e.maxEnergy)timer.textContent='충전 완료';else if(e.nextRechargeAt){const remain=Date.parse(e.nextRechargeAt)-(Date.now()+battleState.serverOffset);timer.textContent=remain<=0?'충전 갱신 중...':`다음 충전 ${battleEnergyText(remain)}`;}else timer.textContent='충전 대기';}const start=document.getElementById('battleStart');if(start){const noEnergy=!e.unlimited&&e.energy<e.costPerBattle,autoChecked=document.getElementById('battleAuto')?.checked;start.disabled=battleState.deck.length!==5||!battleState.selectedMonster||noEnergy;start.textContent=noEnergy?'전투 횟수 부족':autoChecked?'남은 횟수 자동전투':'전투 시작';}}
function startBattleEnergyTimer(){stopBattleEnergyTimer();renderBattleEnergy();battleState.energyTimer=setInterval(()=>{if(!document.getElementById('battleEnergyCount'))return stopBattleEnergyTimer();const e=battleState.energy;if(e&&!e.unlimited&&e.nextRechargeAt&&Date.parse(e.nextRechargeAt)<=(Date.now()+battleState.serverOffset)){loadBattleEnergyOnly();return}renderBattleEnergy()},1000)}
async function loadBattleEnergyOnly(){try{const d=await apiRequest('battle/config');battleState.energy=d.energy;battleState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();startBattleEnergyTimer()}catch(_){renderBattleEnergy()}}

function battleCardPower(card,user,settings){const base=Number(card.basePower||settings?.powerByGrade?.[card.grade]||0),lv=Number(user.breakthroughs?.[card.id]||0),pct=Number(settings?.breakthroughBonus?.[lv]||0);return Math.floor(base*(1+pct/100));}
async function loadBattleView(){
  if(!API_MODE){document.getElementById('battleCards').innerHTML='<div class="empty-recent">현재 전투 콘텐츠를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.</div>';return;}
  try{const d=await apiRequest('battle/config');const owned=ownedIds(loadUser()),savedDeck=(Array.isArray(d.deck)?d.deck.map(String):[]).filter(id=>owned.has(id)&&cards.some(c=>c.id===id)).slice(0,5),monsters=d.monsters||[],lastMonsterId=getLastPveMonsterId(),selectedMonster=monsters.some(m=>Number(m.id)===Number(lastMonsterId))?lastMonsterId:(monsters[0]?.id||null);battleState={config:d.settings,monsters,selectedMonster,deck:savedDeck,energy:d.energy||null,energyTimer:null,serverOffset:Date.parse(d.serverNow||new Date().toISOString())-Date.now(),restoreMonsterCursor:true};renderBattleBuilder();bindMobilePveTabs();startBattleEnergyTimer();}catch(e){document.getElementById('battleCards').innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`;}
}

const PVE_MONSTER_TABS=['NORMAL','HARD','HELL'];
function pveMonsterFilterState(){try{return JSON.parse(localStorage.getItem('cnine_pve_monster_filter')||'{}')}catch{return {}}}
function savePveMonsterFilterState(v){localStorage.setItem('cnine_pve_monster_filter',JSON.stringify(v))}
function monsterCategoryLabel(v){return ({GENERAL:'일반',ELITE:'정예',BOSS:'보스',EVENT:'이벤트',NORMAL:'노말',HARD:'하드',HELL:'헬'})[String(v||'NORMAL').toUpperCase()]||'노말'}
function renderPveMonsterBrowser(){
 const root=document.getElementById('battleMonsters');if(!root)return;
 const saved=pveMonsterFilterState();
 const legacyTabMap={ALL:'NORMAL',GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'};
 const state={tab:'NORMAL',sort:'POWER_ASC',query:'',...saved};
 state.tab=legacyTabMap[String(state.tab||'NORMAL').toUpperCase()]||String(state.tab||'NORMAL').toUpperCase();
 if(!PVE_MONSTER_TABS.includes(state.tab))state.tab='NORMAL';
 const rows=(battleState.monsters||[]).filter(m=>{const raw=String(m.pveTab||m.category||(m.isBoss?'HELL':'NORMAL')).toUpperCase();const tab=({GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'})[raw]||raw;return tab===state.tab&&String(m.name||'').toLowerCase().includes(String(state.query||'').toLowerCase())}).sort((x,y)=>state.sort==='POWER_DESC'?Number(y.battlePower)-Number(x.battlePower):state.sort==='NAME'?String(x.name).localeCompare(String(y.name),'ko'):Number(x.battlePower)-Number(y.battlePower));
 root.innerHTML=`<div class="pve-monster-browser"><div class="pve-monster-tabs">${PVE_MONSTER_TABS.map(t=>`<button type="button" data-monster-tab="${t}" class="${state.tab===t?'active':''}">${monsterCategoryLabel(t)}</button>`).join('')}</div><div class="pve-monster-tools"><label class="pve-tool-field pve-tool-search"><span class="pve-tool-head"><span class="pve-tool-icon" aria-hidden="true">⌕</span><span>몬스터 검색</span></span><input id="pveMonsterSearch" value="${escapeHtml(state.query||'')}" placeholder="몬스터 이름"></label><label class="pve-tool-field pve-tool-sort"><span class="pve-tool-head"><span class="pve-tool-icon" aria-hidden="true">⇅</span><span>정렬 기준</span></span><span class="pve-select-wrap"><select id="pveMonsterSort" aria-label="몬스터 정렬 기준"><option value="POWER_ASC" ${state.sort==='POWER_ASC'?'selected':''}>전투력 낮은순</option><option value="POWER_DESC" ${state.sort==='POWER_DESC'?'selected':''}>전투력 높은순</option><option value="NAME" ${state.sort==='NAME'?'selected':''}>이름순</option></select></span></label></div><div class="pve-monster-grid">${rows.map(m=>`<button class="monster-choice ${Number(battleState.selectedMonster)===Number(m.id)?'active':''}" data-monster="${m.id}">${m.image?`<img src="${m.image}">`:'<div class="monster-placeholder">👹</div>'}<span><small>${monsterCategoryLabel((({GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'})[String(m.pveTab||m.category||(m.isBoss?'HELL':'NORMAL')).toUpperCase()]||String(m.pveTab||m.category||(m.isBoss?'HELL':'NORMAL')).toUpperCase()))}</small><b>${escapeHtml(m.name)}</b><em>전투력 ${Number(m.battlePower).toLocaleString()}</em><strong>승리 보상 ◈ ${Number(m.rewardCoin).toLocaleString()}</strong></span></button>`).join('')||'<div class="empty-recent">조건에 맞는 몬스터가 없습니다.</div>'}</div></div>`;
 root.querySelectorAll('[data-monster-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.monsterTab;const visible=(battleState.monsters||[]).filter(m=>{const raw=String(m.pveTab||m.category||(m.isBoss?'HELL':'NORMAL')).toUpperCase();return (({GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'})[raw]||raw)===state.tab});if(!visible.some(m=>Number(m.id)===Number(battleState.selectedMonster)))battleState.selectedMonster=visible[0]?.id||null;savePveMonsterFilterState(state);if(battleState.selectedMonster)saveLastPveMonsterId(battleState.selectedMonster);renderBattleBuilder()});
 root.querySelector('#pveMonsterSearch').oninput=e=>{state.query=e.target.value;savePveMonsterFilterState(state);renderPveMonsterBrowser()};
 root.querySelector('#pveMonsterSort').onchange=e=>{state.sort=e.target.value;savePveMonsterFilterState(state);renderPveMonsterBrowser()};
 root.querySelectorAll('[data-monster]').forEach(b=>b.onclick=()=>{battleState.selectedMonster=Number(b.dataset.monster);saveLastPveMonsterId(battleState.selectedMonster);battleState.restoreMonsterCursor=false;renderBattleBuilder()});
}

function renderBattleBuilder(){const activeMobileTab=getMobilePveTab()||((battleState.deck?.length===5)?'monsters':'deck');const user=loadUser(),owned=cards.filter(c=>ownedIds(user).has(c.id)).sort((a,b)=>battleCardPower(b,user,battleState.config)-battleCardPower(a,user,battleState.config));const deckSet=new Set(battleState.deck),power=battleState.deck.reduce((n,id)=>{const c=cards.find(x=>x.id===id);return n+(c?battleCardPower(c,user,battleState.config):0)},0);document.getElementById('battleDeckPower').textContent=power.toLocaleString();document.getElementById('battleDeck').innerHTML=battleState.deck.length?battleState.deck.map(id=>{const c=cards.find(x=>x.id===id);return `<button class="battle-deck-card" data-remove="${c.id}"><img src="${c.image}"><span>${escapeHtml(c.title)}${powerTypeIndicatorHtml(c,'battle-deck-stars')}</span><b>${battleCardPower(c,user,battleState.config).toLocaleString()}</b>${c.uniqueAbility?`<small class="deck-unique-open ${c.uniqueAbility.ownerTest?'owner-test':''}" data-card-profile="${escapeHtml(String(c.id))}">◇ 고유</small>`:''}</button>`}).join('')+Array.from({length:5-battleState.deck.length},()=>'<div class="battle-empty-slot">+</div>').join(''):Array.from({length:5},()=>'<div class="battle-empty-slot">+</div>').join('');document.getElementById('battleCards').innerHTML=owned.map(c=>`<button class="battle-pick-card ${deckSet.has(c.id)?'selected':''}" data-pick="${c.id}" ${deckSet.has(c.id)?'disabled':''}><img src="${c.image}" style="object-position:${c.focusX}% ${c.focusY}%"><span><b>${escapeHtml(c.title)}</b><small class="card-status-line"><span class="breakthrough-meta">돌파 ★${Number(user.breakthroughs?.[c.id]||0)}</span><span class="card-grade-meta">${c.grade}</span>${powerTypeIndicatorHtml(c,'card-list-power-type')}</small>${uniqueAbilityInlineHtml(c,'pve-inline')}</span><strong>${battleCardPower(c,user,battleState.config).toLocaleString()}</strong></button>`).join('')||'<div class="empty-recent">보유 카드가 없습니다.</div>';renderPveMonsterBrowser();document.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{if(battleState.deck.length<5){battleState.deck.push(b.dataset.pick);renderBattleBuilder()}});document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{battleState.deck=battleState.deck.filter(x=>x!==b.dataset.remove);renderBattleBuilder()});const saveDeck=document.getElementById('saveBattleDeck');if(saveDeck){saveDeck.disabled=battleState.deck.length!==5;saveDeck.onclick=saveBattleDeck;}const clearDeck=document.getElementById('clearBattleDeck');if(clearDeck)clearDeck.onclick=resetBattleDeck;const start=document.getElementById('battleStart');const noEnergy=battleState.energy&&!battleState.energy.unlimited&&battleState.energy.energy<battleState.energy.costPerBattle;start.disabled=battleState.deck.length!==5||!battleState.selectedMonster||noEnergy;start.textContent=noEnergy?'전투 횟수 부족':'전투 시작';start.onclick=startBattle;renderBattleEnergy();bindMobilePveTabs();setMobilePveTab(activeMobileTab,{scroll:false});if(battleState.restoreMonsterCursor){battleState.restoreMonsterCursor=false;requestAnimationFrame(()=>{const selected=document.querySelector(`#battleMonsters [data-monster="${battleState.selectedMonster}"]`);if(selected&&(!isMobilePve()||activeMobileTab==='monsters')){selected.focus({preventScroll:true});selected.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});}});}}
async function saveBattleDeck(){
  if(battleState.deck.length!==5)return alert('보유 카드 5장을 선택하세요.');
  const button=document.getElementById('saveBattleDeck');if(button)button.disabled=true;
  try{const d=await apiRequest('battle/deck',{method:'POST',body:JSON.stringify({cardIds:battleState.deck})});battleState.deck=Array.isArray(d.deck)?d.deck.map(String):[...battleState.deck];alert('PvE 덱이 저장되었습니다.');renderBattleBuilder()}
  catch(e){alert(e.message);if(button)button.disabled=false}
}
async function resetBattleDeck(){
  if(!battleState.deck.length&&!confirm('저장된 PvE 덱을 리셋하시겠습니까?'))return;
  if(battleState.deck.length&&!confirm('현재 편성과 저장된 PvE 덱을 모두 리셋하시겠습니까?'))return;
  const button=document.getElementById('clearBattleDeck');if(button)button.disabled=true;
  try{await apiRequest('battle/deck',{method:'DELETE'});battleState.deck=[];renderBattleBuilder();alert('PvE 덱이 리셋되었습니다.')}
  catch(e){alert(e.message);if(button)button.disabled=false}
}
function ensureBattleAutoToggle(){
  const start=document.getElementById('battleStart');if(!start||document.getElementById('battleAuto'))return;
  const label=document.createElement('label');label.className='battle-auto-toggle';label.innerHTML='<input type="checkbox" id="battleAuto"><span><b>자동전투</b><small>체크하면 남은 전투 횟수를 자동으로 진행합니다.</small></span>';
  start.before(label);const input=label.querySelector('input');input.onchange=()=>{start.textContent=input.checked?'남은 횟수 자동전투':'전투 시작'};
}
async function startAutoBattle(){
  if(battleState.autoRunning)return;
  const remaining=Math.floor(Number(battleState.energy?.energy||0)/Math.max(1,Number(battleState.energy?.costPerBattle||1)));
  if(battleState.energy?.unlimited)return alert('무제한 상태에서는 남은 횟수 자동전투를 사용할 수 없습니다.');
  if(!remaining)return alert('남은 전투 횟수가 없습니다.');
  if(!confirm(`선택한 몬스터를 남은 ${remaining}회 자동전투할까요?`))return;
  battleState.autoRunning=true;battleState.autoTargetBattles=remaining;battleState.autoRemaining=remaining;battleState.autoSummary={battles:0,wins:0,losses:0,totalReward:0,magicCrystals:0,cardRewards:[]};stopBattleEnergyTimer();
  const toggle=document.getElementById('battleAuto');if(toggle)toggle.checked=false;
  return startBattle();
}
const battleAutoUiObserver=new MutationObserver(ensureBattleAutoToggle);
battleAutoUiObserver.observe(app,{childList:true,subtree:true});
function battleSleep(ms){return new Promise(r=>setTimeout(r,ms));}
let battleAudioContext=null;
function battleSoundEnabled(){return localStorage.getItem('cnine_battle_sound')!=='OFF'}
function battleAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;battleAudioContext??=new C();if(battleAudioContext.state==='suspended')battleAudioContext.resume();return battleAudioContext}catch{return null}}
function unlockBattleAudio(){if(battleSoundEnabled())battleAudio()}
document.addEventListener('pointerdown',unlockBattleAudio,{once:true,capture:true});
function battleOsc(ctx,start,end,duration,type='sine',volume=.04,delay=0){const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(20,start),t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.001,volume),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+duration+.02)}
function battleNoise(ctx,duration=.12,volume=.035,frequency=1200,delay=0){const size=Math.max(1,Math.floor(ctx.sampleRate*duration)),buffer=ctx.createBuffer(1,size,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<size;i++)data[i]=(Math.random()*2-1)*(1-i/size);const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),t=ctx.currentTime+delay;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.7;gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);src.buffer=buffer;src.connect(filter);filter.connect(gain);gain.connect(ctx.destination);src.start(t)}
function battleTone(freq=180,duration=.08,type='sine',volume=.04){if(!battleSoundEnabled())return;const ctx=battleAudio();if(ctx)battleOsc(ctx,freq,Math.max(30,freq*.72),duration,type,volume)}
function battleSfx(kind='hit'){if(!battleSoundEnabled())return;const ctx=battleAudio();if(!ctx)return;if(kind==='swing'){battleNoise(ctx,.1,.022,1800);battleOsc(ctx,760,170,.11,'sawtooth',.018)}else if(kind==='hit'){battleNoise(ctx,.14,.042,720);battleOsc(ctx,150,48,.16,'square',.045)}else if(kind==='heavy'){battleNoise(ctx,.22,.06,330);battleOsc(ctx,92,31,.25,'sawtooth',.075);battleOsc(ctx,46,28,.3,'sine',.08)}else if(kind==='critical'){battleNoise(ctx,.1,.04,2200);battleOsc(ctx,920,240,.1,'sawtooth',.028);battleNoise(ctx,.26,.075,520,.07);battleOsc(ctx,180,38,.3,'square',.085,.07);battleOsc(ctx,1280,620,.22,'sine',.024,.08)}else if(kind==='victory'){[392,494,587,784].forEach((f,i)=>battleOsc(ctx,f,f*1.02,.28,'triangle',.035,i*.12))}else if(kind==='defeat'){[180,145,108,72].forEach((f,i)=>battleOsc(ctx,f,f*.7,.34,'sawtooth',.03,i*.13))}else if(kind==='warning'){battleOsc(ctx,620,480,.14,'square',.022);battleOsc(ctx,620,480,.14,'square',.018,.2)}}
function ensureBattleSoundButton(stage){if(!stage||stage.querySelector('.battle-sound-toggle'))return;const b=document.createElement('button');b.type='button';b.className='battle-sound-toggle';const sync=()=>{b.textContent=battleSoundEnabled()?'🔊 전투음':'🔇 전투음';b.classList.toggle('muted',!battleSoundEnabled())};sync();b.onclick=e=>{e.stopPropagation();localStorage.setItem('cnine_battle_sound',battleSoundEnabled()?'OFF':'ON');if(battleSoundEnabled()){unlockBattleAudio();battleSfx('swing')}sync()};stage.appendChild(b)}
function battleBurst(stage,x='50%',y='50%',count=18){const layer=stage.querySelector('.battle-fx-layer');if(!layer)return;for(let i=0;i<count;i++){const p=document.createElement('i');p.className='battle-particle';p.style.left=x;p.style.top=y;p.style.setProperty('--a',`${Math.random()*360}deg`);p.style.setProperty('--d',`${45+Math.random()*95}px`);p.style.animationDelay=`${Math.random()*80}ms`;layer.appendChild(p);setTimeout(()=>p.remove(),900)}}
function battleDamage(stage,text,target='enemy',critical=false){const box=document.createElement('b'),fx=document.createElement('div');box.className=`battle-damage ${target} ${critical?'critical':''}`;box.textContent=text;fx.className=`combat-hit-fx ${target} ${critical?'critical':''}`;fx.innerHTML='<i></i><i></i><i></i><i></i><u></u>';stage.append(box,fx);stage.classList.remove('combat-impact-shake');void stage.offsetWidth;stage.classList.add('combat-impact-shake');battleSfx(critical?'critical':target==='player'?'heavy':'hit');setTimeout(()=>{box.remove();fx.remove();stage.classList.remove('combat-impact-shake')},critical?1050:850)}
function battleSetHp(stage,target,percent){
  const value=Math.max(0,Math.min(100,Number(percent)||0));
  const bar=stage.querySelector(`[data-hp-fill="${target}"]`), trail=stage.querySelector(`[data-hp-trail="${target}"]`), label=stage.querySelector(`[data-hp-text="${target}"]`),panel=bar?.closest('.battle-hp');
  if(bar)bar.style.width=`${value}%`;
  if(trail)setTimeout(()=>trail.style.width=`${value}%`,260);
  if(label)label.textContent=`${Math.ceil(value)} / 100 · ${Math.ceil(value)}%`;
  if(panel){panel.classList.toggle('hp-critical',value>0&&value<=25);panel.classList.toggle('hp-ko',value<=0);panel.classList.remove('hp-hit');void panel.offsetWidth;panel.classList.add('hp-hit');setTimeout(()=>panel.classList.remove('hp-hit'),420)}
}
function battleGradeTier(grade){const n=gradeOrder[String(grade||'C').toUpperCase()]||1;return n>=9?'mythic':n>=7?'legendary':n>=5?'epic':n>=4?'rare':'normal'}
function battleActivateCard(stage,index,grade){stage.querySelectorAll('.battle-card-fighter').forEach((el,i)=>{el.classList.toggle('active-attacker',i===index);el.classList.remove('skill-normal','skill-rare','skill-epic','skill-legendary','skill-mythic')});const card=stage.querySelectorAll('.battle-card-fighter')[index];if(card)card.classList.add(`skill-${battleGradeTier(grade)}`)}
function combatCardHtml(card,classes='combat-collection-card',level=null){if(!card)return '';const c={...card,id:String(card.id||card.card_id||''),grade:String(card.grade||card.rarity||'C').toUpperCase(),title:card.title||card.card_title||'카드',name:card.name||'',image:card.image||card.image_url||'',focusX:Number(card.focusX??card.focus_x??50),focusY:Number(card.focusY??card.focus_y??50),powerType:card.powerType||card.power_type||''};const lv=Math.max(0,Math.min(13,Number(level??card.breakthroughLevel??card.breakthrough_level??loadUser()?.breakthroughs?.[c.id]??0)));return cardHtml(c,true,classes,{breakthroughs:{[c.id]:lv}})}
function battleFighterHtml(card,index,enemy=false){const lv=Number(card?.breakthroughLevel??card?.breakthrough_level??loadUser()?.breakthroughs?.[card?.id]??0);return `<div class="battle-card-fighter" ${enemy?`data-enemy-fighter="${index}"`:`data-fighter="${index}"`} style="--i:${index}"><div class="fighter-aura"></div>${combatCardHtml(card,'battle-fighter-card',lv)}</div>`}
function normalizeUltimateMediaPath(path){const v=String(path||'/assets/effects/SKILL.gif').trim().replace(/\\/g,'/');if(!v)return '/assets/effects/SKILL.gif';return /^(https?:)?\/\//i.test(v)||v.startsWith('/')?v:`/${v.replace(/^\.\//,'')}`}
async function playBattleUltimate(stage,ultimate,bonusDamage){if(!stage||!ultimate)return;const duration=Math.max(800,Math.min(30000,Number(ultimate.durationMs||3000))),src=normalizeUltimateMediaPath(ultimate.mediaUrl);const isVideo=/\.(webm|mp4)(?:[?#].*)?$/i.test(src);const overlay=document.createElement('div');overlay.className='battle-ultimate-overlay';overlay.innerHTML=`<div class="battle-ultimate-flash"></div><div class="battle-ultimate-title"><small>ULTIMATE SKILL</small><strong>${escapeHtml(ultimate.name||'ULTIMATE')}</strong><span>궁극기 타격 ${Number(bonusDamage||0).toLocaleString()}</span></div><div class="battle-ultimate-media">${isVideo?`<video src="${escapeHtml(src)}" playsinline preload="auto"></video>`:`<img src="${escapeHtml(src)}" alt="${escapeHtml(ultimate.name||'ULTIMATE')}">`}</div></div>`;stage.appendChild(overlay);stage.classList.add('ultimate-playing');battleTone(520,.28,'sawtooth',.08);if(navigator.vibrate)navigator.vibrate([60,30,100]);await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);overlay.classList.add('closing');setTimeout(()=>{overlay.remove();stage.classList.remove('ultimate-playing');resolve()},220)};const timer=setTimeout(finish,duration);const media=overlay.querySelector('video');if(media){media.muted=!battleSoundEnabled();media.volume=1;media.addEventListener('ended',finish,{once:true});media.addEventListener('error',()=>setTimeout(finish,800),{once:true});const playback=media.play();if(playback&&typeof playback.catch==='function')playback.catch(()=>{media.muted=true;media.play().catch(()=>{})})}const img=overlay.querySelector('img');if(img)img.addEventListener('error',()=>{overlay.querySelector('.battle-ultimate-media').innerHTML='<div class="battle-ultimate-fallback">ULTIMATE</div>'},{once:true})})}

async function playBossBattleUltimate(stage,phase,ult){
  if(!stage||!ult)return {teamHpLoss:0,penalty:0};
  const duration=Math.max(800,Math.min(30000,Number(ult.durationMs||3000)));
  const mediaSrc=String(ult.mediaUrl||'').trim()?normalizeUltimateMediaPath(ult.mediaUrl):'';
  const soundSrc=String(ult.soundUrl||'').trim()?normalizeUltimateMediaPath(ult.soundUrl):'';
  const volumePercent=Math.max(0,Math.min(100,Number(ult.volumePercent??35)));
  const volume=volumePercent/100;
  const isVideo=/\.(mp4|webm)(?:[?#].*)?$/i.test(mediaSrc);
  const overlay=document.createElement('div');
  overlay.className='boss-ultimate-overlay';
  overlay.dataset.theme=String(ult.theme||'CRIMSON').toLowerCase();
  overlay.innerHTML=`
    <div class="boss-ultimate-overlay-flash"></div>
    <div class="boss-ultimate-overlay-media">
      ${mediaSrc?(isVideo?`<video src="${escapeHtml(mediaSrc)}" ${soundSrc?'muted':''} playsinline preload="auto"></video>`:`<img src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(ult.name||'BOSS ULTIMATE')}">`):'<div class="boss-ultimate-overlay-fallback">BOSS ULTIMATE</div>'}
    </div>
    <div class="boss-ultimate-overlay-title">
      <small>${escapeHtml(ult.warningText||'BOSS ULTIMATE')}</small>
      <strong>${escapeHtml(ult.name||'ULTIMATE')}</strong>
      ${ult.description?`<span>${escapeHtml(ult.description)}</span>`:''}
    </div>`;
  stage.appendChild(overlay);
  stage.classList.add('boss-ultimate-fullscreen','ultimate-playing');
  if(phase)phase.textContent=ult.warningText||'BOSS ULTIMATE';
  let audio=null;
  if(soundSrc&&battleSoundEnabled()&&volume>0){audio=new Audio(soundSrc);audio.volume=volume;audio.play().catch(()=>{});}
  if(volume>0)battleTone(46,.42,'sawtooth',.11*volume);
  if(navigator.vibrate)navigator.vibrate([140,55,190,60,120]);
  await new Promise(resolve=>{
    let done=false;
    const finish=()=>{
      if(done)return;done=true;clearTimeout(timer);
      overlay.classList.add('closing');
      setTimeout(()=>{overlay.remove();stage.classList.remove('boss-ultimate-fullscreen','ultimate-playing');resolve()},220);
    };
    const timer=setTimeout(finish,duration);
    const video=overlay.querySelector('video');
    if(video){
      video.addEventListener('loadedmetadata',()=>{const portrait=video.videoHeight>video.videoWidth;video.classList.toggle('is-portrait',portrait);video.classList.toggle('is-landscape',!portrait)},{once:true});
      video.volume=volume;
      video.muted=Boolean(soundSrc)||!battleSoundEnabled()||volume<=0;
      video.addEventListener('ended',finish,{once:true});
      video.addEventListener('error',()=>{overlay.classList.add('media-failed');setTimeout(finish,700)},{once:true});
      const play=video.play();
      if(play&&typeof play.catch==='function')play.catch(()=>{video.muted=true;video.play().catch(()=>overlay.classList.add('media-failed'))});
    }
    const img=overlay.querySelector('img');
    if(img){img.addEventListener('load',()=>{const portrait=img.naturalHeight>img.naturalWidth;img.classList.toggle('is-portrait',portrait);img.classList.toggle('is-landscape',!portrait)},{once:true});img.addEventListener('error',()=>{overlay.classList.add('media-failed');overlay.querySelector('.boss-ultimate-overlay-media').innerHTML='<div class="boss-ultimate-overlay-fallback">BOSS ULTIMATE</div>'},{once:true});}
  });
  if(audio){audio.pause();audio.currentTime=0;}
  const penalty=Math.max(0,Number(ult.penalty||0));
  const teamHpLoss=Math.max(12,Math.min(55,Number(ult.damagePercent||15)));
  stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.add('boss-ultimate-hit'));
  battleBurst(stage,'30%','43%',52);
  battleDamage(stage,penalty?`-${Math.floor(penalty).toLocaleString()}`:'ULTIMATE HIT','player',true);
  if(phase)phase.textContent=`${ult.name||'BOSS ULTIMATE'} · HIT`;
  await battleSleep(700);
  stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('boss-ultimate-hit'));
  return {teamHpLoss,penalty};
}

async function startBattle(){
  if(document.getElementById('battleAuto')?.checked)return startAutoBattle();
  const playUltimateCinematics=!battleState.autoRunning||Number(battleState.autoSummary?.battles||0)===0;
  saveLastPveMonsterId(battleState.selectedMonster);
  const modal=document.getElementById('modal'),monster=battleState.monsters.find(m=>Number(m.id)===Number(battleState.selectedMonster));
  const user=loadUser(),deckCards=battleState.deck.map(id=>cards.find(x=>x.id===id)).filter(Boolean);
  const previewPower=deckCards.reduce((sum,c)=>sum+battleCardPower(c,user,battleState.config),0);
  modal.className=`modal show battle-modal${battleState.autoRunning?' auto-battle-modal':''}`;
  modal.innerHTML=`<div class="modal-panel battle-stage intro">
    <div class="battle-backdrop"></div><div class="battle-fx-layer"></div>
    <div class="battle-topline"><span>CNINE PVE BATTLE</span><b id="battlePhase">ENCOUNTER</b></div>
    ${battleState.autoRunning?`<div class="auto-battle-stage-status"><i></i><b>자동전투</b><span>${Number(battleState.autoSummary?.battles||0)+1} / ${Number(battleState.autoTargetBattles||1)}</span><small>전투 연출 진행 중</small></div>`:''}
    <div class="battle-hud">
      <div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>MEMBER TEAM</b><span data-hp-text="team">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="team"></u><i data-hp-fill="team"></i><em>K.O.</em></div><small>전투력 ${previewPower.toLocaleString()}</small></div>
      <div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${escapeHtml(monster.name)}</b><span data-hp-text="enemy">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="enemy"></u><i data-hp-fill="enemy"></i><em>K.O.</em></div><small>전투력 ${Number(monster.battlePower||0).toLocaleString()}</small></div>
    </div>
    <div class="battle-arena">
      <div class="battle-side player-side"><div class="battle-team">${deckCards.map((c,i)=>battleFighterHtml(c,i)).join('')}</div><small>MEMBER TEAM</small></div>
      <div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div>
      <div class="battle-side enemy-side"><div class="battle-enemy-card ${monster.isBoss?'boss':''}"><div class="enemy-card-badge">${monster.isBoss?'BOSS':'MONSTER'}</div><div class="battle-enemy-visual">${monster.image?`<img src="${monster.image}">`:'<div class="monster-placeholder">👹</div>'}</div><div class="battle-enemy-title">${escapeHtml(monster.name)}</div><div class="enemy-card-power">POWER ${Number(monster.battlePower||0).toLocaleString()}</div></div></div>
    </div>
    <div class="battle-impact"><i></i><i></i><i></i></div>
    <div id="battleMessage" class="battle-message"><span>전투 준비 중...</span></div>
  </div>`;
  const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('battlePhase'),count=document.getElementById('battleCountdown'),msg=document.getElementById('battleMessage');ensureBattleSoundButton(stage);
  try{
    battleTone(90,.18,'sawtooth',.035); await battleSleep(500);
    stage.classList.add('cards-enter'); phase.textContent='TEAM DEPLOY'; await battleSleep(900);
    stage.classList.add('enemy-enter'); phase.textContent=monster.isBoss?'BOSS APPEARS':'ENEMY APPEARS'; battleTone(monster.isBoss?52:105,.34,'square',.055); if(navigator.vibrate)navigator.vibrate(monster.isBoss?[100,50,150]:70); await battleSleep(950);
    count.textContent='READY'; stage.classList.add('ready'); await battleSleep(650); count.textContent='FIGHT'; battleTone(440,.18,'square',.075); stage.classList.add('fight'); await battleSleep(520); count.textContent='';
    const fightPromise=apiRequest('battle/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,monsterId:battleState.selectedMonster,cardIds:battleState.deck})});
    const d=await fightPromise;
    let enemyHp=100,teamHp=100,battleEnded=false,enemyDefeated=false,pendingEnemyDefeat=false,pendingTeamDefeat=false;
    const queuedBossUltimate=d.bossUltimate?{...d.bossUltimate}:null;
    const bossUltimateQueued=Boolean(queuedBossUltimate);
    if(d.bossUltimateState&&!bossUltimateQueued)console.warn('[BOSS ULTIMATE] server state',d.bossUltimateState);
    const stopBattleActions=()=>{
      battleEnded=true;
      stage.classList.remove('member-strike','member-skill','monster-heavy-attack');
      stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('active-attacker'));
    };
    const markEnemyDefeated=(label='ENEMY DEFEATED')=>{
      if(enemyDefeated)return;
      enemyDefeated=true;
      enemyHp=0;
      battleSetHp(stage,'enemy',0);
      stopBattleActions();
      stage.classList.add('final-strike-v863');
      phase.textContent=label;
    };
    if(d.activatedUltimate){
      phase.textContent='ULTIMATE READY';
      if(playUltimateCinematics)await playBattleUltimate(stage,d.activatedUltimate,d.bonusDamage);
      else phase.textContent='ULTIMATE · AUTO SKIP';
      const ultimateDamage=Math.max(0,Number((d.ultimateDamage??d.bonusDamage) || 0));
      const ultimateHpPercent=d.monsterPower>0?Math.min(100,ultimateDamage/Number(d.monsterPower)*100):0;
      if(ultimateDamage>0){
        enemyHp=Math.max(0,enemyHp-ultimateHpPercent);
        battleSetHp(stage,'enemy',enemyHp);
        stage.classList.remove('member-strike','member-skill');
        void stage.offsetWidth;
        stage.classList.add('member-skill');
        battleBurst(stage,'73%','43%',42);
        battleDamage(stage,`-${Math.floor(ultimateDamage).toLocaleString()}`,'enemy',true);
        phase.textContent=`ULTIMATE HIT · ${Math.floor(ultimateDamage).toLocaleString()}${d.ultimateSourceCard?.title?` · ${d.ultimateSourceCard.title}`:''}`;
        battleTone(680,.32,'sawtooth',.09);
        if(navigator.vibrate)navigator.vibrate([80,35,140]);
        await battleSleep(850);
        if(enemyHp<=0){
          if(bossUltimateQueued){
            pendingEnemyDefeat=true;
            phase.textContent='ULTIMATE FINISH · BOSS COUNTER';
          }else{
            markEnemyDefeated('ULTIMATE FINISH');
          }
        }
      }
      if(!battleEnded&&!pendingEnemyDefeat){phase.textContent='BATTLE RESUME';await battleSleep(250);}
    }
    // 전투 시작 시 서버가 확정한 보스 궁극기는 유저 궁극기 결과와 관계없이 반드시 실행한다.
    // 영상/사운드 로딩 실패도 배너·피해 연출을 막지 않는다.
    if(queuedBossUltimate){
      const bossHit=playUltimateCinematics
        ?await playBossBattleUltimate(stage,phase,queuedBossUltimate)
        :{teamHpLoss:Math.max(12,Math.min(55,Number(queuedBossUltimate.damagePercent||15))),penalty:Math.max(0,Number(queuedBossUltimate.penalty||0))};
      if(!playUltimateCinematics)phase.textContent=`${queuedBossUltimate.name||'BOSS ULTIMATE'} · AUTO SKIP`;
      teamHp=Math.max(0,teamHp-Number(bossHit.teamHpLoss||0));
      battleSetHp(stage,'team',teamHp);
      if(teamHp<=0)pendingTeamDefeat=true;
    }
    if(pendingEnemyDefeat||pendingTeamDefeat){
      if(d.result==='LOSE'&&pendingTeamDefeat){
        teamHp=0;
        battleSetHp(stage,'team',0);
        stopBattleActions();
        phase.textContent='PARTY DEFEATED';
      }else if(pendingEnemyDefeat){
        markEnemyDefeated('ULTIMATE FINISH');
      }
    }
    const win=d.result==='WIN';
    const enemySteps=win?[14,17,18,20,31]:[9,11,13,15,17];
    const teamCounter=win?[8,10]:[18,25,31];
    for(let i=0;i<deckCards.length&&!battleEnded;i++){
      const c=deckCards[i],tier=battleGradeTier(c.grade),high=gradeOrder[c.grade]>=gradeOrder.UR;
      battleActivateCard(stage,i,c.grade);phase.textContent=`${c.grade} MEMBER STRIKE`;
      stage.classList.remove('member-strike','member-skill');void stage.offsetWidth;stage.classList.add(high?'member-skill':'member-strike');
      const dmg=enemySteps[i]||15; enemyHp=Math.max(win&&i<4?4:0,enemyHp-dmg); battleSetHp(stage,'enemy',enemyHp);
      battleBurst(stage,'73%','43%',high?30:16); battleDamage(stage,high?`${c.grade} BURST!`:`-${Math.max(120,Math.round(d.monsterPower*dmg/100))}`,'enemy',high);
      battleTone(high?360+gradeOrder[c.grade]*28:170+i*24,high?.18:.09,high?'sawtooth':'square',high?.075:.045);if(navigator.vibrate)navigator.vibrate(high?[45,25,70]:28);
      await battleSleep(high?760:580);
      if(enemyHp<=0){markEnemyDefeated('FINAL STRIKE');break;}
      if((i===1||i===3||(!win&&i===4))&&teamHp>0&&!battleEnded){
        stage.classList.remove('member-strike','member-skill');stage.classList.add('monster-heavy-attack');phase.textContent=monster.isBoss?'BOSS RAGE':'MONSTER COUNTER';
        const hit=teamCounter.shift()||18;teamHp=Math.max(win?12:0,teamHp-hit);battleSetHp(stage,'team',teamHp);
        battleBurst(stage,'28%','43%',monster.isBoss?34:24);battleDamage(stage,monster.isBoss?'HEAVY HIT!':`-${Math.max(100,Math.round(d.playerPower*hit/100))}`,'player',monster.isBoss);
        battleTone(monster.isBoss?55:78,.24,'sawtooth',.08);if(navigator.vibrate)navigator.vibrate(monster.isBoss?[120,40,150]:[70,30,80]);await battleSleep(monster.isBoss?900:720);
        stage.classList.remove('monster-heavy-attack');
      }
    }
    stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('active-attacker'));
    if(win){
      if(!enemyDefeated){
        phase.textContent='FINAL STRIKE';stage.classList.add('final-strike-v863');
        battleSetHp(stage,'enemy',0);battleBurst(stage,'74%','43%',55);battleDamage(stage,'FINISH!','enemy',true);battleTone(620,.32,'sawtooth',.09);if(navigator.vibrate)navigator.vibrate([70,30,180]);
        markEnemyDefeated('FINAL STRIKE');
      }
    }else{
      stopBattleActions();phase.textContent='MONSTER FINISH';stage.classList.add('final-fail-v863');
      battleSetHp(stage,'team',0);battleBurst(stage,'26%','43%',48);battleDamage(stage,'K.O.','player',true);battleTone(48,.38,'square',.09);if(navigator.vibrate)navigator.vibrate([160,50,160]);
    }
    await battleSleep(1050);
    stage.classList.add(win?'battle-win-v863':'battle-lose-v863');phase.textContent=win?'MISSION CLEAR':'MISSION FAILED';battleSfx(win?'victory':'defeat');
    if(d.cubeReward&&window.showCubeDropAcquisition){try{await window.showCubeDropAcquisition(d.cubeReward)}catch(cubeFxError){console.warn('큐브 획득 연출을 표시하지 못했습니다.',cubeFxError)}}
    msg.innerHTML=win?`<strong>VICTORY</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><div class="battle-reward-pop"><small>REWARD</small><b>◈ ${d.reward.toLocaleString()}</b>${Number(d.magicReward?.amount||0)>0?`<div class="battle-magic-drop"><strong>✦ 마법 결정 +${Number(d.magicReward.amount).toLocaleString()}</strong><span>확률 드랍 성공</span></div>`:''}${d.cardReward?`<div class="battle-card-drop"><strong>${d.cardReward.card.grade} ${escapeHtml(d.cardReward.card.title)}</strong><span>${d.cardReward.duplicate?`중복 카드 · 조각 +${d.cardReward.shardGained}`:'신규 카드 획득!'}</span></div>`:''}</div><em>화면을 눌러 돌아가기</em>`:`<strong>DEFEAT</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><div class="battle-defeat-tip">돌파 단계로 전투력을 높여보세요.</div><em>화면을 눌러 돌아가기</em>`;
    battleState.energy=d.energy||battleState.energy;battleState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();saveUser(apiUserToLocal(d.user));
    if(battleState.autoRunning){
      const summary=battleState.autoSummary||(battleState.autoSummary={battles:0,wins:0,losses:0,totalReward:0,magicCrystals:0,cardRewards:[]});summary.battles++;summary.totalReward+=Number(d.reward||0);summary.magicCrystals+=Number(d.magicReward?.amount||0);if(win)summary.wins++;else summary.losses++;if(d.cardReward)summary.cardRewards.push(d.cardReward);battleState.autoRemaining=Math.max(0,Number(battleState.autoRemaining||0)-1);
      const available=Math.floor(Number(battleState.energy?.energy||0)/Math.max(1,Number(battleState.energy?.costPerBattle||1))),remaining=Math.min(Number(battleState.autoRemaining||0),available);
      if(remaining>0){msg.insertAdjacentHTML('beforeend',`<em class="auto-battle-next">자동전투 ${summary.battles}회 완료 · ${remaining}회 남음<br>잠시 후 다음 전투가 시작됩니다. 화면을 누르면 중단합니다.</em>`);modal.onclick=()=>{battleState.autoRunning=false;renderShell('battle')};setTimeout(()=>{if(battleState.autoRunning){modal.onclick=null;startBattle()}},1600)}
      else{battleState.autoRunning=false;msg.insertAdjacentHTML('beforeend',`<div class="battle-auto-total"><b>자동전투 ${summary.battles}회 완료</b><span>승리 ${summary.wins} · 패배 ${summary.losses} · 코인 ◈ ${summary.totalReward.toLocaleString()}</span>${summary.magicCrystals>0?`<small>마법 결정 ✦ ${summary.magicCrystals.toLocaleString()}개</small>`:''}${summary.cardRewards.length?`<small>카드 획득 ${summary.cardRewards.length}장</small>`:''}</div>`);setTimeout(()=>{modal.onclick=()=>renderShell('battle')},700)}
    }else setTimeout(()=>{modal.onclick=()=>renderShell('battle')},700);
  }catch(e){battleState.autoRunning=false;if(e.energy)battleState.energy=e.energy;msg.innerHTML=`<span>${escapeHtml(e.message)}</span><em>화면을 눌러 돌아가기</em>`;modal.onclick=()=>renderShell('battle')}
}


function magicView(user){
  return `${summaryBar(user)}<section class="magic-lab-hero"><div><p class="eyebrow">ARCANE CARD LAB</p><h2>마법카드 연구소</h2><p>전투 덱의 카드 5장에 마법카드를 한 장씩 장착합니다. 마법 결정은 인게임 플레이로만 획득합니다.</p></div><div class="magic-balance-card"><span>보유 마법 결정</span><b id="magicBalanceHero">✦ ${Number(user.magicCrystals??magicSystemState.magicCrystals??0).toLocaleString()}</b><small>전용 재화</small></div></section><section id="magicSystemRoot" class="magic-system-root"><div class="empty-recent">마법카드 정보를 불러오는 중...</div></section>`;
}
function magicDeckName(type){return type==='PVP'?'PVP 덱':type==='CAPTAIN'?'대장전 덱':'PVE 덱'}
function magicEffectLabel(value){return ({HEAL:'회복',ATTACK_BUFF:'공격 강화',DEFENSE_BUFF:'방어 강화',HP_BUFF:'최대 HP',TRAP:'함정',SHIELD:'보호막',COUNTER:'반격',OTHER:'기타',NONE:'효과 없음'})[String(value||'').toUpperCase()]||String(value||'기타')}
function magicTriggerLabel(value){return ({BATTLE_START:'전투 시작',BEFORE_ATTACK:'공격 전',AFTER_ATTACK:'공격 후',BEFORE_HIT:'피격 전',AFTER_HIT:'피격 후',LOW_HP:'HP 조건',ON_KILL:'적 처치',ON_DEATH:'카드 사망',NEXT_OPPONENT:'새 상대 출전',PASSIVE:'상시 적용'})[String(value||'').toUpperCase()]||String(value||'상시 적용')}
function magicImage(card){const url=String(card?.imageUrl||'').trim();return `<div class="magic-card-art ${url?'':'empty'}">${url?`<img src="${escapeHtml(url)}" alt="${escapeHtml(card.name)}" onerror="this.remove();this.parentElement.classList.add('empty')">`:''}<span>✦</span></div>`}
function renderMagicSystem(){
  const root=document.getElementById('magicSystemRoot');if(!root)return;const d=magicSystemState;
  if(!d.visible){root.innerHTML='<div class="magic-closed-panel"><b>마법카드 시스템 준비 중</b><span>현재 일반 유저에게는 공개되지 않았습니다.</span></div>';return;}
  const cards=Array.isArray(d.cards)?d.cards:[],loadouts=Array.isArray(d.loadouts)?d.loadouts:[],deckType=magicUiState.deckType;
  const equipped=new Map(loadouts.filter(x=>x.deckType===deckType).map(x=>[Number(x.slotNo),Number(x.magicCardId)]));
  const byId=new Map(cards.map(x=>[Number(x.id),x]));
  root.innerHTML=`<nav class="magic-deck-tabs">${[['PVE','PVE 덱'],['PVP','PVP 덱'],['CAPTAIN','대장전 덱']].map(([id,name])=>`<button type="button" data-magic-deck="${id}" class="${deckType===id?'active':''}">${name}</button>`).join('')}</nav><div class="magic-layout"><section class="magic-loadout-panel"><div class="magic-section-head"><div><p class="eyebrow">${deckType} MAGIC LOADOUT</p><h2>${magicDeckName(deckType)} 장착</h2><p>장착 위치를 선택한 뒤 보유 마법카드를 지정하세요.</p></div><span>최대 5장</span></div><div class="magic-slot-grid">${[1,2,3,4,5].map(slot=>{const card=byId.get(equipped.get(slot));return `<button type="button" class="magic-slot ${magicUiState.selectedSlot===slot?'selected':''} ${card?'filled':''}" data-magic-slot="${slot}"><em>${slot}</em>${card?`${magicImage(card)}<b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.rarity)} · ${escapeHtml(magicEffectLabel(card.effectType))}</small>`:`<i>+</i><b>마법카드 장착</b><small>${slot}번 전투 카드</small>`}</button>`}).join('')}</div><button type="button" id="magicUnequip" class="magic-unequip" ${equipped.has(magicUiState.selectedSlot)?'':'disabled'}>선택 슬롯 장착 해제</button></section><aside class="magic-draw-panel"><p class="eyebrow">MAGIC CARD DRAW</p><div class="magic-draw-pack" aria-hidden="true"><span></span><img src="assets/cards/magiccard.png" alt=""></div><h2>마법카드 소환</h2><p>${escapeHtml(d.settings?.acquisitionNotice||'마법 결정은 인게임 플레이로만 획득합니다.')}</p><div class="magic-draw-cost"><span>1회 소모</span><b>✦ ${Number(d.settings?.drawCost||0).toLocaleString()}</b></div><button type="button" id="magicDrawBtn" class="btn" ${d.settings?.drawEnabled?'':'disabled'}>${d.settings?.drawEnabled?'마법카드 1장 소환':'뽑기 준비 중'}</button><small>쿠폰·접속 사료 지급 경로는 제공하지 않습니다.</small></aside></div><section class="magic-inventory-panel"><div class="magic-section-head"><div><p class="eyebrow">MY MAGIC CARDS</p><h2>보유 마법카드</h2></div><span>${cards.filter(x=>Number(x.quantity)>0).length}종 보유</span></div><div class="magic-card-grid">${cards.length?cards.map(card=>`<article class="magic-card-tile rarity-${escapeHtml(card.rarity)} ${Number(card.quantity)>0?'owned':'locked'}">${magicImage(card)}<div><span>${escapeHtml(card.rarity)}</span><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.description||'효과 설명 준비 중')}</p><small>${escapeHtml(magicTriggerLabel(card.triggerType))} · ${Number(card.triggerChance)}% · 최대 ${Number(card.maxActivations)}회</small></div><footer><b>보유 ${Number(card.quantity||0)}장</b><button type="button" data-equip-magic="${Number(card.id)}" ${Number(card.quantity)>0?'':'disabled'}>${magicUiState.selectedSlot}번 슬롯에 장착</button></footer></article>`).join(''):'<div class="magic-empty-collection">등록된 마법카드가 없습니다.<br>CMS에서 마법카드를 준비해주세요.</div>'}</div></section>`;
  root.querySelectorAll('[data-magic-deck]').forEach(b=>b.onclick=()=>{magicUiState.deckType=b.dataset.magicDeck;magicUiState.selectedSlot=1;renderMagicSystem()});
  root.querySelectorAll('[data-magic-slot]').forEach(b=>b.onclick=()=>{magicUiState.selectedSlot=Number(b.dataset.magicSlot);renderMagicSystem()});
  root.querySelectorAll('[data-equip-magic]').forEach(b=>b.onclick=()=>equipMagicCard(Number(b.dataset.equipMagic)));
  const unequip=document.getElementById('magicUnequip');if(unequip)unequip.onclick=()=>equipMagicCard(null);
  const draw=document.getElementById('magicDrawBtn');if(draw)draw.onclick=drawMagicCard;
}
async function loadMagicView(){
  const root=document.getElementById('magicSystemRoot');if(!root)return;
  if(!API_MODE){root.innerHTML='<div class="magic-closed-panel"><b>서버 연결 필요</b><span>마법카드는 서버 연결 상태에서만 이용할 수 있습니다.</span></div>';return;}
  try{magicSystemState=await apiRequest('magic/status',{}, {ttl:0});const user=loadUser();if(user){user.magicCrystals=Number(magicSystemState.magicCrystals||0);saveUser(user)}const hero=document.getElementById('magicBalanceHero');if(hero)hero.textContent=`✦ ${Number(magicSystemState.magicCrystals||0).toLocaleString()}`;renderMagicSystem()}catch(e){root.innerHTML=`<div class="magic-closed-panel"><b>마법카드 정보를 불러오지 못했습니다.</b><span>${escapeHtml(e.message)}</span></div>`}
}
async function equipMagicCard(magicCardId){
  try{const d=await apiRequest('magic/equip',{method:'POST',body:JSON.stringify({deckType:magicUiState.deckType,slotNo:magicUiState.selectedSlot,magicCardId})});magicSystemState=d.status;renderMagicSystem()}catch(e){alert(e.message)}
}
async function drawMagicCard(){
  const cost=Number(magicSystemState.settings?.drawCost||0);if(Number(magicSystemState.magicCrystals||0)<cost)return alert(`마법 결정이 부족합니다. (${cost.toLocaleString()}개 필요)`);if(!confirm(`마법 결정 ${cost.toLocaleString()}개를 사용해 마법카드 1장을 소환할까요?`))return;
  const btn=document.getElementById('magicDrawBtn');if(btn){btn.disabled=true;btn.textContent='소환 중...'}
  try{const d=await apiRequest('magic/draw',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`})});const current=loadUser();if(current){current.magicCrystals=Number(d.magicCrystals||0);saveUser(current)}alert(d.duplicate?`${d.card.name} 중복 획득\n마법 결정 ${Number(d.refund||0).toLocaleString()}개로 변환되었습니다.`:`새 마법카드 획득: ${d.card.name}`);await loadMagicView()}catch(e){alert(e.message);if(btn){btn.disabled=false;btn.textContent='마법카드 1장 소환'}}
}

function attendanceView(user) {
  const claimable = canClaimAttendance(user),a=user.attendance||{},cfg=a.settings||{enabled:true,rewards:[1000,1200,1400,1600,1800,2000,3000]},nextDay=((Number(a.streak||0)%7)+1),reward=Number(cfg.rewards?.[nextDay-1]||1000);
  return `${summaryBar(user)}<section class="attendance-panel"><div class="attendance-glow"></div><div class="attendance-copy"><p class="eyebrow">DAILY LOGIN REWARD</p><h2>연속 출석 보상</h2><p>하루라도 빠지면 1일차로 초기화되며, 7일 달성 후 다시 1일차부터 반복됩니다.</p><div class="attendance-stats"><span>누적 출석 <b>${a.totalDays||0}일</b></span><span>현재 연속 <b>${a.streak||0}일</b></span><span>오늘 상태 <b>${claimable?'수령 가능':'수령 완료'}</b></span></div><button class="btn attendance-claim" id="claimAttendance" ${(claimable&&cfg.enabled!==false)?'':'disabled'}>${cfg.enabled===false?'출석체크 중지됨':claimable?`${reward.toLocaleString()}코인 받기`:'오늘 보상 수령 완료'}</button></div><div class="attendance-reward"><span>DAY ${nextDay}</span><strong>◈ ${reward.toLocaleString()}</strong><small>COIN REWARD</small></div></section><section class="coupon-panel"><div><p class="eyebrow">COUPON REWARD</p><h2>쿠폰 코드 입력</h2><p>관리자가 발급한 쿠폰 코드를 입력하면 보상이 즉시 지급됩니다.</p></div><div class="coupon-form"><input id="couponCode" maxlength="40" placeholder="쿠폰 코드"><button class="btn" id="redeemCoupon">쿠폰 사용</button></div></section>`;
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
function pvpTierGuideHtml(tiers=[],currentTier=null){return `<section class="pvp-tier-guide"><div class="pvp-tier-guide-head"><p class="eyebrow">PVP TIER ROAD</p><h3>시즌 티어 구간</h3><span>현재 시즌 규칙에 따라 적용됩니다.</span></div><div class="pvp-tier-road">${tiers.map(t=>`<div class="pvp-tier-road-item ${currentTier&&String(currentTier.id)===String(t.id)?'current':''}">${tierEmblem(t,'small')}<b>${Number(t.min||0).toLocaleString()}점+</b></div>`).join('')}</div></section>`}
let rankHubMode='pvp';

function dailyQuestView(user){
  return `${summaryBar(user)}<section class="daily-quest-hub daily-quest-v1072">
    <header class="daily-quest-head">
      <div class="daily-head-copy"><p class="eyebrow">WAGOSU DAILY QUEST</p><h2>SOOP 게시판 일일퀘스트</h2><p>오늘 작성한 게시글을 확인하고 일일 보상을 획득하세요.</p></div>
      <div class="daily-reset-chip"><span>DAILY RESET</span><strong>00:00 KST</strong></div>
    </header>
    <div class="daily-quest-grid daily-quest-grid-single">
      <article class="daily-quest-panel quest-post">
        <div class="daily-quest-copy">
          <div class="daily-mission-top"><span class="quest-kind"><i>✦</i> POST MISSION</span><span id="dailyQuestStateBadge" class="daily-state-badge is-loading">확인 중</span></div>
          <h3 id="dailyQuestPostTitle">SOOP 게시글 설정 불러오는 중</h3>
          <p class="daily-mission-desc">SOOP 게시판 일반글만 인정되며, 와고 2단계 인증 계정의 작성자 검색 결과를 기준으로 집계합니다.</p>
          <div id="dailyQuestPostStatus" class="daily-quest-status"><span>작성글 확인 중...</span></div>
          <div class="daily-progress-wrap" aria-label="일일 퀘스트 진행률"><div class="daily-progress-meta"><span>오늘의 진행도</span><b id="dailyQuestProgressText">0%</b></div><div class="daily-progress-track"><span id="dailyQuestProgressFill"></span></div></div>
          <div class="daily-quest-actions"><button class="btn secondary daily-check-btn" id="dailyQuestPostCheck"><span>↻</span> 작성글 새로 확인</button><button class="btn daily-claim-btn" id="dailyQuestPostClaim" disabled>보상 정보 불러오는 중</button></div>
        </div>
        <aside class="daily-quest-reward" aria-live="polite">
          <span class="daily-reward-label">MISSION REWARD</span>
          <div class="daily-reward-icon"><span>◆</span></div>
          <div class="daily-reward-coin"><b id="dailyQuestRewardCoin">--</b><small>COINS</small></div>
          <div class="daily-reward-goal"><span>목표</span><strong id="dailyQuestRewardRequired">--</strong><small>POSTS</small></div>
          <em>하루 1회 · 인벤토리가 아닌 코인으로 즉시 지급</em>
        </aside>
      </article>
    </div>
    <footer class="daily-quest-note"><span>i</span><p>매일 00:00 KST 초기화 · SOOP 게시판 일반글만 인정 · 게시글 원문 회원번호 기준</p></footer>
  </section>`;
}
async function loadDailyQuest(){
  const postBox=document.getElementById('dailyQuestPostStatus');if(!postBox)return;
  const postCheck=document.getElementById('dailyQuestPostCheck'),postClaim=document.getElementById('dailyQuestPostClaim');
  try{
    const d=await apiRequest('wago-daily-quest/status'),s=d.settings||{};
    const postRequired=Number(s.requiredPosts||15),postReward=Number(s.postRewardCoin||s.rewardCoin||1200),postCount=Number(d.postCount||0);
    const postTitle=document.getElementById('dailyQuestPostTitle'),rewardRequired=document.getElementById('dailyQuestRewardRequired'),rewardCoin=document.getElementById('dailyQuestRewardCoin'),progressFill=document.getElementById('dailyQuestProgressFill'),progressText=document.getElementById('dailyQuestProgressText'),stateBadge=document.getElementById('dailyQuestStateBadge');
    if(postTitle)postTitle.textContent=`SOOP 게시글 ${postRequired.toLocaleString()}개 작성`;
    if(rewardRequired)rewardRequired.textContent=postRequired.toLocaleString();
    if(rewardCoin)rewardCoin.textContent=postReward.toLocaleString();
    const blocked=!d.verified||d.excluded;
    const disabledByAdmin=s.postEnabled===false;
    const progress=Math.max(0,Math.min(100,Math.round((postCount/Math.max(1,postRequired))*100)));
    if(progressFill)progressFill.style.width=`${progress}%`;
    if(progressText)progressText.textContent=`${progress}%`;
    const blockText=!d.verified?'메시지함에서 와고 2단계 인증을 먼저 완료하세요.':'현재 일일 퀘스트를 이용할 수 없습니다.';
    postBox.className=`daily-quest-status ${blocked||disabledByAdmin?'is-blocked':d.postClaimed?'is-claimed':postCount>=postRequired?'is-complete':'is-progress'}`;
    postBox.innerHTML=disabledByAdmin?`<b>현재 게시글 퀘스트가 비활성화되어 있습니다.</b><span>운영 설정이 변경되면 다시 이용할 수 있습니다.</span>`:blocked?`<b>${blockText}</b>`:d.postClaimed?`<b>오늘 보상 수령 완료</b><span>${postCount.toLocaleString()} / ${postRequired.toLocaleString()}개 확인</span>`:`<b>오늘 작성글 ${postCount.toLocaleString()} / ${postRequired.toLocaleString()}개</b><span>${postCount>=postRequired?'목표 달성! 지금 보상을 수령할 수 있습니다.':`${(postRequired-postCount).toLocaleString()}개 더 작성하면 달성됩니다.`}</span>`;
    if(stateBadge){stateBadge.className=`daily-state-badge ${blocked||disabledByAdmin?'is-blocked':d.postClaimed?'is-claimed':postCount>=postRequired?'is-complete':'is-progress'}`;stateBadge.textContent=blocked||disabledByAdmin?'이용 불가':d.postClaimed?'수령 완료':postCount>=postRequired?'달성 완료':'진행 중';}
    if(postCheck)postCheck.disabled=blocked||disabledByAdmin;
    if(postClaim){postClaim.disabled=blocked||d.postClaimed||postCount<postRequired||disabledByAdmin;postClaim.textContent=d.postClaimed?'오늘 보상 수령 완료':postCount>=postRequired?`${postReward.toLocaleString()}코인 수령`:`${postReward.toLocaleString()}코인 보상`;}
  }catch(e){postBox.innerHTML=`<b>${escapeHtml(e.message)}</b>`;}
}
async function checkDailyQuest(){
  const b=document.getElementById('dailyQuestPostCheck');if(b)b.disabled=true;
  try{const d=await apiRequest('wago-daily-quest/check',{method:'POST',body:JSON.stringify({questType:'POST'})});alert(`오늘 SOOP 게시판 작성글 ${Number(d.postCount||0)}개를 확인했습니다.`);}catch(e){alert(e.message)}finally{loadDailyQuest()}
}
async function claimDailyQuest(){
  const b=document.getElementById('dailyQuestPostClaim');if(b)b.disabled=true;
  try{const d=await apiRequest('wago-daily-quest/claim',{method:'POST',body:JSON.stringify({questType:'POST'})});saveUser(apiUserToLocal(d.user));alert(`${Number(d.rewardCoin).toLocaleString()}코인을 받았습니다.`);renderShell('dailyquest')}catch(e){alert(e.message);loadDailyQuest()}
}

function rankView(user) {
  return `${summaryBar(user)}<section class="rank-hub"><nav class="rank-switch"><button type="button" data-rank-mode="pvp" class="active">PvP 시즌 랭킹</button><button type="button" data-rank-mode="card">카드점수 랭킹</button></nav><div id="rankHubContent" class="rank-hub-content"><div class="empty-recent">랭킹을 불러오는 중...</div></div></section>`;
}
async function loadRankHub(mode=rankHubMode){
  rankHubMode=mode;
  document.querySelectorAll('[data-rank-mode]').forEach(b=>b.classList.toggle('active',b.dataset.rankMode===mode));
  const root=document.getElementById('rankHubContent');if(!root)return;
  if(mode==='card'){
    root.innerHTML=`<section class="rank-panel rank-panel-v2"><div class="rank-main"><p class="eyebrow">TOTAL CARD POWER TIER</p><h2>카드점수 토탈 티어</h2><p>보유 카드의 등급 기본 전투력과 현재 돌파 보너스를 모두 합산합니다.</p><div id="myTierCard" class="my-tier-card"><div class="tier-loading">내 티어 계산 중...</div></div><div id="serverRanking" class="server-ranking">${API_MODE?'랭킹 불러오는 중...':'현재 전체 랭킹을 불러올 수 없습니다.'}</div></div><div class="tier-guide"><p class="eyebrow">TIER ROAD</p><h3>티어 구간</h3><div id="tierRoad" class="tier-road"></div></div></section>`;
    await loadServerRanking();return;
  }
  if(!API_MODE){root.innerHTML='<div class="empty-recent">현재 PvP 시즌 랭킹을 불러올 수 없습니다.</div>';return}
  try{const d=await apiRequest('pvp/ranking');root.innerHTML=`<section class="rank-pvp-panel"><div class="pvp-section-head"><div><p class="eyebrow">PVP SEASON RANKING</p><h2>${escapeHtml(d.settings?.seasonName||'PvP 시즌')} 랭킹</h2></div></div>${pvpTierGuideHtml(d.settings?.tiers||[],d.me?.tier)}${d.me?`<div class="pvp-my-rank">${tierEmblem(d.me.tier,'rank')}<span>내 순위 <b>${d.me.rank}위</b><small>${escapeHtml(d.me.tier.name)} · ${Number(d.me.season_score).toLocaleString()}점</small></span></div>`:''}<div class="pvp-ranking">${(d.ranking||[]).map(r=>`<div class="pvp-rank-row"><b>${r.rank}</b>${tierEmblem(r.tier,'rank')}<span>${escapeHtml(r.nickname)}<small>${escapeHtml(r.tier.name)} · ${r.wins}승 ${r.losses}패</small></span><strong>${Number(r.season_score).toLocaleString()}</strong></div>`).join('')||'<div class="empty-recent">아직 시즌 랭킹 데이터가 없습니다.</div>'}</div></section>`}catch(e){root.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}
}
async function loadServerRanking(){
  if(!API_MODE)return;const target=document.getElementById('serverRanking'),mine=document.getElementById('myTierCard'),road=document.getElementById('tierRoad');if(!target)return;
  try{const data=await apiRequest('ranking'),user=loadUser(),me=data.ranking.find(x=>x.nickname===user.nickname)||{rank:'-',score:0,card_count:0,max_breakthrough:0,tier:data.tiers[0]};mine.innerHTML=`${tierEmblem(me.tier,'large')}<div><span>내 총 카드점수</span><strong>${Number(me.score).toLocaleString()}점</strong><small>전체 ${me.rank}위 · 보유 ${me.card_count}장 · 최고 ★${me.max_breakthrough}</small></div>`;road.innerHTML=data.tiers.map(t=>`<div class="tier-road-item">${tierEmblem(t,'small')}<b>${Number(t.min).toLocaleString()}점+</b></div>`).join('');target.innerHTML=`<div class="rank-list rank-list-v2">${data.ranking.slice(0,30).map(row=>`<div class="rank-list-row rank-pos-${row.rank}"><b class="rank-number">${row.rank<=3?'<i>♛</i>':''}${row.rank}</b>${tierEmblem(row.tier,'rank')}<span>${escapeHtml(row.nickname)}<small>${row.card_count}장 · 최고 ★${row.max_breakthrough}</small></span><strong>${Number(row.score).toLocaleString()}점</strong></div>`).join('')}</div>`}catch(error){target.textContent=error.message}
}

function mineralExchangeView(user){
  return `${summaryBar(user)}<section class="mineral-exchange-page"><div class="mineral-exchange-head"><div><p class="eyebrow">MINERAL EXCHANGE</p><h2>💎 미네랄 교환소</h2><p>SOOP 게시판 미네랄 창고에 기부한 뒤 교환을 신청하세요.</p></div><div class="mineral-limit-badge"><span>하루 최대 교환 가능 개수</span><b id="mineralDailyLimit">3,000코인</b><small id="mineralRemaining">남은 한도 확인 중</small></div></div><div class="mineral-exchange-grid"><section class="mineral-form-card"><div id="mineralRateInfo" class="mineral-rate-info">교환 비율을 불러오는 중...</div><div class="mineral-guide"><b>사용법</b><p>1. SOOP 게시판 미네랄 창고에 기부</p><p>2. 와이고수 닉네임과 기부 완료 내용을 입력</p></div><label class="mineral-field"><span>씨켓몬 닉네임</span><input value="${escapeHtml(user.nickname)}" readonly></label><label class="mineral-field"><span>와이고수 닉네임</span><input id="wagoNickname" maxlength="40" placeholder="기부에 사용한 와고 닉네임"></label><label class="mineral-field"><span>기부한 미네랄 수량</span><input id="mineralAmount" type="number" inputmode="numeric" min="0" placeholder="예: 300000000"><small id="mineralStepHelp">1,000코인 단위로만 신청 가능합니다.</small></label><div class="mineral-preview"><span>지급 예정 코인</span><b id="mineralCoinPreview">0코인</b></div><label class="mineral-field"><span>기부 완료 내용</span><textarea id="mineralProof" maxlength="500" rows="4" placeholder="예: 7월 12일 13:00 닉네임 경화수월 3억 기부 완료"></textarea></label><button class="btn mineral-submit" id="mineralSubmit" disabled>💎 교환 신청하기</button></section><aside class="mineral-history-card"><h3>내 교환 신청 내역</h3><div id="mineralMyRequests"><div class="empty-recent">신청 내역을 불러오는 중...</div></div></aside></div></section>`;
}
let mineralExchangeState={settings:null,remainingCoin:0};
async function loadMineralExchange(){
  try{const d=await apiRequest('mineral-exchange/config');mineralExchangeState.settings=d.settings;mineralExchangeState.remainingCoin=Number(d.remainingCoin||0);const rate=document.getElementById('mineralRateInfo'),limit=document.getElementById('mineralDailyLimit'),remain=document.getElementById('mineralRemaining'),amount=document.getElementById('mineralAmount');if(rate)rate.innerHTML=`<b>미네랄 ${Number(d.settings.baseMineral).toLocaleString()}개</b><span>→</span><strong>${Number(d.settings.payoutCoin).toLocaleString()}코인</strong>`;if(limit)limit.textContent=`${Number(d.settings.dailyLimitCoin).toLocaleString()}코인`;if(remain)remain.textContent=`오늘 남은 신청 가능 ${Number(d.remainingCoin).toLocaleString()}코인`;if(amount){const step=Number(d.settings.baseMineral)*1000/Number(d.settings.payoutCoin);if(Number.isInteger(step))amount.step=String(step);amount.oninput=updateMineralPreview;}const submit=document.getElementById('mineralSubmit');if(submit)submit.onclick=submitMineralExchange;renderMineralRequests(d.requests||[]);updateMineralPreview();}catch(e){const box=document.getElementById('mineralMyRequests');if(box)box.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`;}
}
function updateMineralPreview(){const s=mineralExchangeState.settings,amount=Number(document.getElementById('mineralAmount')?.value||0),preview=document.getElementById('mineralCoinPreview'),btn=document.getElementById('mineralSubmit');if(!s)return;const raw=amount*Number(s.payoutCoin)/Number(s.baseMineral),coin=Number.isInteger(raw)?raw:0,valid=amount>0&&Number.isInteger(raw)&&coin%1000===0&&coin<=mineralExchangeState.remainingCoin;if(preview){preview.textContent=coin>0?`${coin.toLocaleString()}코인`:'0코인';preview.classList.toggle('invalid',amount>0&&!valid)}if(btn)btn.disabled=!valid;}
function renderMineralRequests(rows){const box=document.getElementById('mineralMyRequests');if(!box)return;const labels={PENDING:'승인 대기',APPROVED:'승인 완료',REJECTED:'거절'};box.innerHTML=rows.length?rows.map(r=>`<article class="mineral-history-row status-${String(r.status).toLowerCase()}"><div><b>${Number(r.coin_amount).toLocaleString()}코인</b><span>${Number(r.mineral_amount).toLocaleString()} 미네랄 · ${escapeHtml(r.wago_nickname)}</span><small>${new Date(String(r.created_at).replace(' ','T')+'Z').toLocaleString('ko-KR')}</small></div><em>${labels[r.status]||escapeHtml(r.status)}</em>${r.reject_reason?`<p>${escapeHtml(r.reject_reason)}</p>`:''}</article>`).join(''):'<div class="empty-recent">아직 교환 신청 내역이 없습니다.</div>';}
async function submitMineralExchange(){const btn=document.getElementById('mineralSubmit'),wagoNickname=document.getElementById('wagoNickname')?.value.trim(),mineralAmount=Number(document.getElementById('mineralAmount')?.value||0),proofText=document.getElementById('mineralProof')?.value.trim();if(!wagoNickname)return alert('와이고수 닉네임을 입력하세요.');if(!proofText)return alert('기부 완료 내용을 입력하세요.');btn.disabled=true;try{const d=await apiRequest('mineral-exchange/request',{method:'POST',body:JSON.stringify({wagoNickname,mineralAmount,proofText})});alert(`${Number(d.coinAmount).toLocaleString()}코인 교환 신청이 접수되었습니다.\n관리자 확인 후 지급됩니다.`);renderShell('mineral')}catch(e){alert(e.message);updateMineralPreview()}}


let raidState={timer:null,data:null,resultRevealed:new Set(),resultAdvanceTimer:null,revealingResultId:0,selectedRoomId:0,lastSoundTick:-1,lastSoundInstance:0,claimRetryTimer:null,claimInFlight:false};
function stopRaidTimer(){if(raidState.timer){clearTimeout(raidState.timer);raidState.timer=null}}
function stopRaidResultAdvanceTimer(){if(raidState.resultAdvanceTimer){clearTimeout(raidState.resultAdvanceTimer);raidState.resultAdvanceTimer=null}}
function stopRaidClaimRetryTimer(){if(raidState.claimRetryTimer){clearTimeout(raidState.claimRetryTimer);raidState.claimRetryTimer=null}}
function raidClaimedKey(instanceId){return `cnine_raid_claimed_${String(instanceId||'')}`}
function raidResultRevealedKey(instanceId){return `cnine_raid_result_revealed_${String(instanceId||'')}`}
function markRaidClaimed(instanceId){if(!instanceId)return;try{localStorage.setItem(raidClaimedKey(instanceId),'1')}catch(_){}}
function isRaidClaimedLocally(instanceId){if(!instanceId)return false;try{return localStorage.getItem(raidClaimedKey(instanceId))==='1'}catch(_){return false}}
function markRaidResultRevealed(instanceId){const id=Number(instanceId||0);if(!id)return;raidState.resultRevealed.add(id);try{localStorage.setItem(raidResultRevealedKey(id),'1')}catch(_){}}
function isRaidResultRevealed(instanceId){const id=Number(instanceId||0);if(!id)return false;if(raidState.resultRevealed.has(id))return true;try{if(localStorage.getItem(raidResultRevealedKey(id))==='1'){raidState.resultRevealed.add(id);return true}}catch(_){}return false}
function clearRaidResultRevealed(instanceId){const id=Number(instanceId||0);if(!id)return;raidState.resultRevealed.delete(id);try{localStorage.removeItem(raidResultRevealedKey(id))}catch(_){}}
async function revealRaidResult(instanceId){const id=Number(instanceId||raidState.data?.current?.id||0);if(!id||raidState.revealingResultId===id)return;raidState.revealingResultId=id;stopRaidResultAdvanceTimer();markRaidResultRevealed(id);try{if(raidState.data?.current&&Number(raidState.data.current.id)===id)renderRaidView(raidState.data);await loadRaidView()}finally{raidState.revealingResultId=0}}
function bindRaidResultContinue(button,instanceId){if(!button)return;const advance=event=>{event?.preventDefault?.();event?.stopPropagation?.();void revealRaidResult(instanceId)};button.addEventListener('click',advance,{once:true});button.addEventListener('pointerup',event=>{if(event.pointerType==='touch'||event.pointerType==='pen')advance(event)},{once:true});}

function raidCombatCard(card,extra=''){
  if(!card)return '';
  return combatCardHtml(card,`raid-combat-card ${extra}`,card.breakthroughLevel??card.breakthrough_level);
}
function switchPveMode(mode){document.querySelectorAll('.pve-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.pveMode===mode));const hunt=document.getElementById('pveHuntView'),raid=document.getElementById('pveRaidView');if(hunt)hunt.hidden=mode==='raid';if(raid)raid.hidden=mode!=='raid';if(mode==='raid'){stopBattleEnergyTimer();loadRaidView();}else{stopRaidTimer();stopRaidResultAdvanceTimer();loadBattleView();}}
async function loadRaidView(){const box=document.getElementById('pveRaidView');if(!box||box.hidden||document.hidden)return;try{const query=raidState.selectedRoomId?`?instanceId=${Number(raidState.selectedRoomId)}`:'';const d=await apiRequest(`raid/status${query}`,{}, {ttl:0});raidState.data=d;renderRaidView(d);scheduleRaidPoll(d)}catch(e){stopRaidTimer();box.innerHTML=`<section class="raid-empty"><h2>월드 레이드</h2><p>${escapeHtml(e.message)}</p></section>`;}}
function nextRaidOpenAtFromSettings(settings,nowMs=Date.now()){
  const s=settings||{};
  if(String(s.scheduleMode||'ALWAYS').toUpperCase()!=='SCHEDULED')return null;
  const days=(Array.isArray(s.openDays)?s.openDays:[]).map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<=6);
  if(!days.length)return null;
  const openTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.openTime||''))?String(s.openTime):'20:00';
  const nowKst=new Date(nowMs+9*3600000);
  for(let add=0;add<8;add++){
    const day=new Date(nowKst.getTime()+add*86400000);
    if(!days.includes(day.getUTCDay()))continue;
    const y=day.getUTCFullYear(),m=String(day.getUTCMonth()+1).padStart(2,'0'),d=String(day.getUTCDate()).padStart(2,'0');
    const candidate=Date.parse(`${y}-${m}-${d}T${openTime}:00+09:00`);
    if(candidate>nowMs)return new Date(candidate).toISOString();
  }
  return null;
}
function formatRaidOpenAt(value){
  if(!value)return '';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short',hour:'numeric',minute:'2-digit'}).format(date);
}
function renderRaidView(d){
  const box=document.getElementById('pveRaidView');if(!box)return;
  const c=d.current,s=d.settings||{},schedule=d.schedule||{isOpen:true,canEnter:true};
  if(!c&&(d.rooms||[]).length){
    const rooms=d.rooms||[],bosses=d.availableBosses||[],entry=d.dailyEntry||{count:0,limit:Number(s.dailyEntries||1),remaining:Number(s.dailyEntries||1)},used=Boolean(d.dailyEntryUsed);
    box.innerHTML=`<section class="raid-room-browser"><div class="panel-title"><div><p class="eyebrow">RAID ROOM LIST</p><h2>레이드 개설 방</h2><p>참가할 방을 선택하세요 · 동시 최대 10개</p></div><strong>오늘 ${Number(entry.count)} / ${Number(entry.limit)}회</strong></div>${d.cancelledRaid?`<div class="raid-room-refund">최소 인원 미달로 이전 방이 종료되었습니다. 입장 횟수 복구${Number(d.cancelledRaid.refundCoin||0)>0?` · 개설 코인 ${Number(d.cancelledRaid.refundCoin).toLocaleString()} 환불`:''}</div>`:''}<div class="raid-room-grid">${rooms.map((room,i)=>{const remain=Math.max(0,Math.ceil((Date.parse(room.startsAt)-Date.now())/1000));return `<article class="raid-room-card ${room.joinable?'joinable':'locked'}">${room.bossImage?`<img src="${escapeHtml(room.bossImage)}" alt="">`:''}<div><small>ROOM ${String(room.roomNumber||i+1).padStart(2,'0')} · ${escapeHtml(room.status)}</small><h3>${escapeHtml(room.bossName)}</h3><p><b>${Number(room.participantCount||0)} / ${Number(s.maxParticipants||10)}</b> 참가 · 최소 ${Number(s.minParticipants||1)}명</p><span>${room.status==='LOBBY'?`대기 ${String(Math.floor(remain/60)).padStart(2,'0')}:${String(remain%60).padStart(2,'0')}`:'전투 진행 중'}</span><button class="btn raidRoomSelect" data-room-id="${Number(room.id)}" ${!room.joinable||used?'disabled':''}>${used?'오늘 입장 횟수 소진':room.joinable?'이 방 참가':'입장 불가'}</button></div></article>`}).join('')}</div>${bosses.length&&!used?`<div class="raid-room-create"><h3>새 레이드 방 개설</h3>${bosses.map(b=>`<button class="btn raidOpenBtn" data-boss-id="${b.id}" ${!schedule.canEnter?'disabled':''}>${escapeHtml(b.name)} · ${Number(b.openCost||0).toLocaleString()}코인</button>`).join('')}</div>`:''}</section>`;
    const roomHead=box.querySelector('.raid-room-browser>.panel-title');roomHead?.insertAdjacentHTML('beforeend','<button type="button" class="btn ghost raid-refresh-btn" id="raidRoomsRefresh">↻ 방 목록 새로고침</button>');const refresh=document.getElementById('raidRoomsRefresh');if(refresh)refresh.onclick=()=>{raidState.selectedRoomId=0;loadRaidView()};
    document.querySelectorAll('.raidRoomSelect').forEach(btn=>btn.onclick=()=>selectRaidRoom(Number(btn.dataset.roomId)));
    document.querySelectorAll('.raidOpenBtn').forEach(btn=>btn.onclick=()=>openRaid(Number(btn.dataset.bossId),btn));
    return;
  }
  if(!c){const closed=!schedule.isOpen,entryClosed=schedule.reason==='ENTRY_CLOSED',bosses=d.availableBosses||[],used=Boolean(d.dailyEntryUsed),entry=d.dailyEntry||{count:0,limit:Number(s.dailyEntries||1),remaining:Number(s.dailyEntries||1)};const nextOpenAt=schedule.nextOpenAt||nextRaidOpenAtFromSettings(s),nextOpenText=formatRaidOpenAt(nextOpenAt),showNextOpen=String(s.scheduleMode||'ALWAYS').toUpperCase()==='SCHEDULED'&&(closed||used);const scheduleText=showNextOpen&&nextOpenText?`<div class="raid-schedule-notice raid-next-open"><span>다음 개방</span><strong>${escapeHtml(nextOpenText)} (KST)</strong></div>`:'';const statusMessage=closed?(entryClosed?'오늘 레이드 입장이 마감되었습니다.':'현재는 레이드 개방 시간이 아닙니다.'):(used?`오늘의 레이드 입장 횟수 ${Number(entry.limit)}회를 모두 사용했습니다.`:`오늘 ${Number(entry.count)} / ${Number(entry.limit)}회 입장 · ${Number(entry.remaining)}회 남음`);box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">USER OPEN RAID</p><h2>${escapeHtml(s.title||'월드 레이드')}</h2><p>${statusMessage}</p>${scheduleText}${bosses.length?`<div class="raid-open-boss-grid">${bosses.map(b=>`<article class="raid-open-boss">${b.image?`<img src="${escapeHtml(b.image)}" alt="">`:''}<h3>${escapeHtml(b.name)}</h3><p>개방 비용 <b>${Number(b.openCost||0).toLocaleString()} 코인</b></p><p>입장 시 1회 차감 · 일일 최대 ${Number(entry.limit)}회</p><button class="btn raidOpenBtn" data-boss-id="${b.id}" ${used||!schedule.canEnter?'disabled':''}>레이드 개방</button></article>`).join('')}</div>`:`<div class="raid-schedule-notice">현재 유저 개방이 허용된 보스가 없습니다.</div>`}</section>`;document.querySelectorAll('.raidOpenBtn').forEach(btn=>btn.onclick=()=>openRaid(Number(btn.dataset.bossId),btn));return;}
  if(d.raidAccess==='NOT_PARTICIPANT'||(c.status!=='LOBBY'&&!d.me)){
    box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">RAID IN PROGRESS</p><h2>레이드가 진행 중입니다</h2><p>대기실에서 참가 신청을 완료한 유저만<br>전투 화면과 종료 결과를 확인할 수 있습니다.</p><div class="raid-schedule-notice"><span>참가 상태</span><strong>미참가 · 관전 및 보상 대상 아님</strong></div></section>`;
    return;
  }
  const joined=Boolean(d.me),remain=Math.max(0,Date.parse(c.startsAt)-Date.now()),sec=Math.ceil(remain/1000),hpPct=Math.max(0,Math.min(100,Number(c.currentHp)/Math.max(1,Number(c.maxHp))*100));
  const participants=d.participants||[],me=d.me||participants.find(x=>Number(x.userId)===Number(loadUser()?.serverUserId));
  const battle=c.status==='BATTLE',ended=c.status==='ENDED';
  const resultText=c.result==='CLEAR'?'RAID CLEAR':c.result==='FAILED'?'RAID FAILED':'TIME OUT';
  if(c.status==='LOBBY'&&d.dailyEntryUsed&&!joined){
    const entry=d.dailyEntry||{count:Number(s.dailyEntries||1),limit:Number(s.dailyEntries||1),remaining:0};
    box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">RAID LOBBY</p><h2>오늘 입장 횟수를 모두 사용했습니다</h2><p>오늘 ${Number(entry.count)} / ${Number(entry.limit)}회 입장 완료<br>현재 대기실에는 추가로 참가할 수 없습니다.</p><div class="raid-schedule-notice"><span>다음 초기화</span><strong>매일 00:00 (KST)</strong></div></section>`;
    return;
  }
  if(c.status==='LOBBY'){
    box.innerHTML=`<section class="raid-lobby-screen"><div class="raid-lobby-boss">${c.bossImage?`<img src="${c.bossImage}" alt="">`:'<div class="raid-boss-placeholder">👹</div>'}<div><p class="eyebrow">RAID LOBBY</p><h2>${escapeHtml(c.bossName)}</h2><div class="raid-lobby-countdown"><span>전투 시작까지</span><b>${String(Math.floor(Math.max(0,sec)/60)).padStart(2,'0')}:${String(Math.max(0,sec)%60).padStart(2,'0')}</b></div><p>${c.participantCount} / ${s.maxParticipants} 참가 · 최소 ${s.minParticipants}명</p></div></div><div class="raid-lobby-progress"><i style="width:${Math.min(100,c.participantCount/Math.max(1,s.maxParticipants)*100)}%"></i></div><button class="btn raid-lobby-join" id="raidJoin" ${joined||!schedule.canEnter?'disabled':''}>${joined?'참가 완료':!schedule.canEnter?'입장 마감':'레이드 신청'}</button><div class="raid-lobby-deck">${(me?.cards||[]).slice(0,5).map(card=>`<img src="${card.image}" title="${escapeHtml(card.title)}">`).join('')||'<span>신청하면 저장된 PvE 덱 5장이 표시됩니다.</span>'}</div><div class="raid-lobby-members">${participants.map(x=>x.anonymous?`<article class="anonymous"><div class="raid-anonymous-cards">${Array.from({length:5},()=>'<i>?</i>').join('')}</div><b>${escapeHtml(x.nickname)}</b><span>🔒 전투 시작 후 공개</span></article>`:`<article><div>${(x.cards||[]).slice(0,5).map(card=>`<img src="${card.image}" alt="">`).join('')}</div><b>${escapeHtml(x.nickname)}</b><span>${Number(x.totalPower).toLocaleString()}</span></article>`).join('')||'<p>첫 참가자를 기다리는 중...</p>'}</div></section>`;
    const screen=box.querySelector('.raid-lobby-screen');screen?.insertAdjacentHTML('afterbegin',`<div class="raid-lobby-actions"><button type="button" class="btn ghost" id="raidLobbyRefresh">↻ 새로고침</button>${joined?'<button type="button" class="btn danger" id="raidLeave">레이드 퇴장</button>':''}</div>`);const refresh=document.getElementById('raidLobbyRefresh');if(refresh)refresh.onclick=()=>loadRaidView();const leave=document.getElementById('raidLeave');if(leave)leave.onclick=leaveRaid;
    if(!joined&&raidState.selectedRoomId){screen?.insertAdjacentHTML('afterbegin','<button type="button" class="btn ghost" id="raidRoomBack">← 방 목록</button>');const back=document.getElementById('raidRoomBack');if(back)back.onclick=()=>{raidState.selectedRoomId=0;loadRaidView()};}
    const join=document.getElementById('raidJoin');if(join&&!join.disabled)join.onclick=joinRaid;return;
  }
  if(ended){
    if(me&&(Number(me.rewardClaimed||0)===1||isRaidClaimedLocally(c.id))){box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">WORLD RAID</p><h2>${escapeHtml(s.title||'월드 레이드')}</h2><p>이미 보상 정산이 완료되었습니다.<br>현재 열린 레이드가 없습니다.</p></section>`;stopRaidTimer();return;}
    if(!isRaidResultRevealed(c.id)){const outcome=c.result==='CLEAR'?'clear':c.result==='FAILED'?'failed':'timeout',outcomeTitle=outcome==='clear'?'레이드 클리어':outcome==='failed'?'레이드 실패':'시간 초과',outcomeText=outcome==='clear'?'보스 처치에 성공했습니다.':outcome==='failed'?'참가 인원이 모두 전투 불능 상태가 되었습니다.':'제한 시간 안에 보스를 처치하지 못했습니다.',outcomeIcon=outcome==='clear'?'✓':outcome==='failed'?'✕':'⌛',instanceId=Number(c.id||0);box.innerHTML=`<section class="raid-outcome-screen ${outcome}"><div class="raid-outcome-backdrop"></div><div class="raid-outcome-mark">${outcomeIcon}</div><p class="eyebrow">WORLD RAID RESULT</p><span class="raid-outcome-label">${c.result==='CLEAR'?'RAID CLEAR':c.result==='FAILED'?'RAID FAILED':'TIME OUT'}</span><h1>${outcomeTitle}</h1><h2>${escapeHtml(c.bossName)}</h2><p>${outcomeText}</p><div class="raid-outcome-hp"><span>보스 최종 HP</span><b>${Number(c.currentHp||0).toLocaleString()} / ${Number(c.maxHp||0).toLocaleString()}</b></div><button type="button" class="btn raid-result-continue" id="raidResultContinue" data-instance-id="${instanceId}">결과 상세 확인</button><small>버튼을 누르거나 잠시 기다리면 결과 상세 화면으로 이동합니다.</small></section>`;const next=document.getElementById('raidResultContinue');bindRaidResultContinue(next,instanceId);stopRaidTimer();stopRaidResultAdvanceTimer();raidState.resultAdvanceTimer=setTimeout(()=>{void revealRaidResult(instanceId)},8000);return;}
    const rank=me?participants.findIndex(x=>Number(x.userId)===Number(me.userId))+1:0;
    const clear=c.result==='CLEAR';
    const reward=d.claimableReward&&Number(d.claimableReward.instanceId)===Number(c.id)?d.claimableReward:null;
    const rewardCoin=reward?Math.max(0,Number(reward.coin||0)):0;
    const rewardShards=reward?Math.max(0,Number(reward.shards||0)):0;
    const rewardMagicCrystals=reward?Math.max(0,Number(reward.magicCrystals||0)):0;
    const participationMagicCrystals=reward?Math.max(0,Number(reward.participationMagicCrystals||0)):0;
    const rankMagicCrystals=reward?Math.max(0,Number(reward.rankMagicCrystals||0)):0;
    const participationCoin=reward?Math.max(0,Number(reward.participationCoin||0)):0;
    const clearCoin=reward?Math.max(0,Number(reward.clearCoin||0)):0;
    const rewardReady=Boolean(me&&reward&&reward.source==='SERVER_CONFIRMED');
    box.innerHTML=`<section class="raid-result-screen ${clear?'clear':c.result==='FAILED'?'failed':'timeout'}"><div class="raid-result-glow"></div><p class="eyebrow">RAID RESULT DETAIL</p><span class="raid-result-state">${clear?'클리어 성공':c.result==='FAILED'?'레이드 실패':'시간 초과'}</span><h1>${resultText}</h1><h2>${escapeHtml(c.bossName)}</h2><div class="raid-result-stats"><div><span>MY DAMAGE</span><b>${Number(me?.shownDamage||0).toLocaleString()}</b></div><div><span>FINAL RANK</span><b>${rank?rank+'위':'-'}</b></div><div><span>SURVIVAL</span><b>${me?(me.isDefeated?'K.O':'생존'):'-'}</b></div></div>${me?`<div class="raid-reward-stage"><article><div class="raid-reward-icon">◇</div><span>코인</span><b>${rewardReady?'+'+rewardCoin.toLocaleString():'확인 중'}</b></article><article><div class="raid-reward-icon">✦</div><span>카드 조각</span><b>${rewardReady?'+'+rewardShards.toLocaleString():'확인 중'}</b></article><article class="magic"><div class="raid-reward-icon">✧</div><span>마법 결정</span><b>${rewardReady?'+'+rewardMagicCrystals.toLocaleString():'확인 중'}</b></article></div>${rewardReady?`<p class="raid-reward-breakdown">참가 ${participationCoin.toLocaleString()} 코인${clear?` + 클리어 ${clearCoin.toLocaleString()} 코인`:''} = 총 ${rewardCoin.toLocaleString()} 코인${rewardMagicCrystals>0?` · 마법 결정 참가 ${participationMagicCrystals.toLocaleString()}${rankMagicCrystals>0?` + ${rank||'-'}위 ${rankMagicCrystals.toLocaleString()}`:''}`:''}</p>`:''}<button class="btn raid-claim-btn" id="raidClaim" ${!rewardReady||me.rewardClaimed?'disabled':''}>${me.rewardClaimed?'보상 수령 완료':rewardReady?'보상 받기':'서버 보상 확인 중'}</button><p class="raid-result-note">${clear?'클리어 보상과 참가 보상이 함께 지급됩니다.':'클리어 보상은 지급되지 않으며 참가 보상만 지급됩니다.'}</p>`:'<p class="raid-result-note">레이드 참가 기록이 없습니다.</p>'}</section>`;
    const claim=document.getElementById('raidClaim');if(claim&&!claim.disabled)claim.onclick=claimRaidReward;stopRaidTimer();return;
  }
  const active=participants.filter(x=>!x.isDefeated),attacker=active.length?active[(Number(c.attackTicks||0)+Math.floor(Date.now()/Math.max(400,Number(s.attackIntervalMs||800))))%active.length]:null;
  const attackCard=attacker?.cards?.length?attacker.cards[(Number(c.attackTicks||0)+Math.floor(Date.now()/Math.max(400,Number(s.attackIntervalMs||800))))%attacker.cards.length]:null;
  const myHpPct=me?Math.max(0,Math.min(100,Number(me.currentHp)/Math.max(1,Number(me.maxHp))*100)):0;
  box.innerHTML=`<section class="raid-battle-stage is-battle ${c.enraged?'is-enraged':''}" style="--boss-attack-ms:${Math.max(1200,Number(s.bossAttackIntervalMs||5000))}ms"><div class="raid-stage-sky"><span></span><span></span><span></span></div><div class="raid-stage-header"><div><small>${c.enraged?'⚠ ENRAGED':'WORLD RAID'}</small><b>자동 전투 진행 중</b></div><div class="raid-stage-timer">${Math.max(0,Math.ceil((Date.parse(c.endsAt)-Date.now())/1000))}s</div></div><div class="raid-combat-hud"><div class="battle-hp battle-hp-team ${myHpPct>0&&myHpPct<=25?'hp-critical':myHpPct<=0?'hp-ko':''}"><div class="battle-hp-head"><b>MY RAID DECK</b><span>${Number(me?.currentHp||0).toLocaleString()} / ${Number(me?.maxHp||0).toLocaleString()} · ${Math.ceil(myHpPct)}%</span></div><div class="battle-hp-track"><u style="width:${myHpPct}%"></u><i style="width:${myHpPct}%"></i><em>K.O.</em></div><small>${me?`전투력 ${Number(me.totalPower||0).toLocaleString()}`:'레이드 미참가'}</small></div><div class="raid-hud-center"><span>WORLD RAID</span><b>${Math.max(0,Math.ceil((Date.parse(c.endsAt)-Date.now())/1000))}s</b></div><div class="battle-hp battle-hp-enemy ${hpPct>0&&hpPct<=25?'hp-critical':hpPct<=0?'hp-ko':''}"><div class="battle-hp-head"><b>${escapeHtml(c.bossName)}</b><span>${Number(c.currentHp).toLocaleString()} / ${Number(c.maxHp).toLocaleString()} · ${Math.ceil(hpPct)}%</span></div><div class="battle-hp-track"><u style="width:${hpPct}%"></u><i style="width:${hpPct}%"></i><em>K.O.</em></div><small>${c.enraged?'⚠ ENRAGED':'BOSS'}</small></div></div><div class="raid-arena"><div class="raid-party-side"><div class="raid-party-aura"></div>${attackCard?`<div class="raid-attacker-card">${raidCombatCard(attackCard,'raid-main-attacker')}<strong>${escapeHtml(attacker.nickname)}</strong><span>${escapeHtml(attackCard.title)}</span></div>`:'<div class="raid-wait-orb">READY</div>'}</div><div class="raid-boss-side"><div class="raid-boss-aura"></div><div class="raid-enrage-skulls" aria-hidden="true"><i>☠</i><i>☠</i><i>☠</i><i>☠</i><i>☠</i><i>☠</i></div>${c.bossImage?`<img class="raid-stage-boss" src="${c.bossImage}" alt="">`:'<div class="raid-stage-boss placeholder">👹</div>'}<div class="raid-slash-effect"></div><div class="raid-hit-flash"></div><div class="raid-floating-damage">${attacker?Math.max(1,Math.floor(Number(attacker.totalPower||0)*Number(s.damageMultiplier||1)/10)).toLocaleString():''}</div></div></div><div class="raid-my-deck-stage">${(me?.cards||[]).slice(0,5).map((card,i)=>{const pct=me?Math.max(0,Math.min(100,Number(me.currentHp)/Math.max(1,Number(me.maxHp))*100)):0;return `<div class="raid-stage-card ${me?.isDefeated?'dead':''} ${pct<=25?'danger':''}" style="--delay:${i*80}ms;--hp:${pct}%">${raidCombatCard(card,'raid-deck-frame')}<div class="raid-card-hp"><span><b>HP</b><em>${Math.round(pct)}%</em></span><div><i style="width:${pct}%"></i><u style="width:${pct}%"></u></div></div><div class="raid-card-hit"></div></div>`}).join('')||'<div class="raid-stage-empty">레이드 미참가</div>'}</div><div class="raid-boss-cast"><span>보스 공격</span><i style="animation-duration:${Math.max(800,Number(s.bossAttackIntervalMs||5000))}ms"></i></div></section><section class="raid-live-grid"><div class="raid-party"><div class="panel-title"><div><p class="eyebrow">RAID PARTY</p><h2>생존 현황</h2></div></div><div class="raid-participant-list">${participants.map(x=>{const p=Math.max(0,Math.min(100,Number(x.currentHp)/Math.max(1,Number(x.maxHp))*100));return `<article class="${x.isDefeated?'defeated':''}"><div class="raid-mini-cards">${(x.cards||[]).slice(0,5).map(card=>raidCombatCard(card,'raid-mini-frame')).join('')}</div><span><b>${escapeHtml(x.nickname)}</b><small>전투력 ${Number(x.totalPower).toLocaleString()}</small><em class="raid-user-hp"><i style="width:${p}%"></i></em><small>${x.isDefeated?'전투 불능':`${Math.round(p)}%`}</small></span><strong>${Number(x.shownDamage||0).toLocaleString()} DMG</strong></article>`}).join('')}</div></div><aside class="raid-ranking"><div class="panel-title"><div><p class="eyebrow">LIVE DAMAGE</p><h2>딜 체크 미터</h2></div></div>${participants.slice(0,Number(s.rankingSize||10)).map((x,i)=>{const max=Math.max(1,Number(participants[0]?.shownDamage||1)),pct=Math.max(2,Number(x.shownDamage||0)/max*100);return `<div class="raid-rank-row ${x.isDefeated?'defeated':''}"><b>${i+1}</b><span>${escapeHtml(x.nickname)}<i style="width:${pct}%"></i></span><strong>${Number(x.shownDamage||0).toLocaleString()}</strong></div>`}).join('')}<div class="raid-my-damage"><span>내 누적 딜</span><b>${Number(me?.shownDamage||0).toLocaleString()}</b><small>${me?`HP ${Math.round(Number(me.currentHp)/Math.max(1,Number(me.maxHp))*100)}%`:'레이드 미참가'}</small></div></aside></section>`;
  const raidStage=box.querySelector('.raid-battle-stage');ensureBattleSoundButton(raidStage);if(Number(raidState.lastSoundInstance)!==Number(c.id)){raidState.lastSoundInstance=Number(c.id);raidState.lastSoundTick=Number(c.attackTicks||0)}else if(Number(c.attackTicks||0)>Number(raidState.lastSoundTick)){battleSfx(c.enraged?'heavy':'hit');raidStage?.classList.add('combat-impact-shake');setTimeout(()=>raidStage?.classList.remove('combat-impact-shake'),420);raidState.lastSoundTick=Number(c.attackTicks||0)}
}
async function claimRaidReward(attempt=0){
  if(raidState.claimInFlight)return;
  stopRaidClaimRetryTimer();
  raidState.claimInFlight=true;
  const btn=document.getElementById('raidClaim'),instanceId=Number(raidState.data?.current?.id||0);
  if(btn){btn.disabled=true;btn.textContent=attempt>0?'정산 상태 확인 중...':'정산 중...';}
  let retryScheduled=false;
  try{
    const shownReward=raidState.data?.claimableReward&&Number(raidState.data.claimableReward.instanceId)===instanceId?raidState.data.claimableReward:null;
    const d=await apiRequest('raid/claim',{method:'POST',body:JSON.stringify({instanceId,expectedReward:shownReward?{instanceId,coin:Number(shownReward.coin||0),shards:Number(shownReward.shards||0),magicCrystals:Number(shownReward.magicCrystals||0)}:null})});
    const claimedId=Number(d.instanceId||instanceId);
    markRaidClaimed(claimedId);
    clearRaidResultRevealed(claimedId);
    if(d.user)saveUser(apiUserToLocal(d.user));
    const verified=await apiRequest('me');
    if(verified?.user)saveUser(apiUserToLocal(verified.user));
    const actual=loadUser();
    if(Number.isFinite(Number(d.balanceAfter))&&Number(actual?.coin)!==Number(d.balanceAfter)&&String(d.rewardSource||'')!=='SERVER_RECOVERED')throw new Error('레이드 보상 코인 잔액 확인에 실패했습니다. 새로고침 후 다시 확인해주세요.');
    stopRaidTimer();
    stopRaidClaimRetryTimer();
    raidState.data={settings:raidState.data?.settings||{},schedule:raidState.data?.schedule||{},current:null,participants:[],me:null};
    alert(`${Number(d.rewardCoin||0).toLocaleString()}코인, 카드 조각 ${Number(d.rewardShards||0).toLocaleString()}개${Number(d.rewardMagicCrystals||0)>0?`, 마법 결정 ${Number(d.rewardMagicCrystals).toLocaleString()}개`:''}를 수령하였습니다.\n현재 코인 ${Number(actual?.coin||0).toLocaleString()}개 · 마법 결정 ${Number(actual?.magicCrystals||0).toLocaleString()}개`);
    const box=document.getElementById('pveRaidView');
    if(box)renderRaidView(raidState.data);
    await loadRaidView();
  }catch(e){
    if(e?.rewardMismatch){
      alert('결과 화면과 서버 확정 보상이 달라 지급을 중단했습니다. 최신 확정 보상으로 화면을 다시 불러옵니다.');
      raidState.claimInFlight=false;
      await loadRaidView();
      return;
    }
    if(e?.rewardClaimed){
      markRaidClaimed(instanceId);
      clearRaidResultRevealed(instanceId);
      if(e.user)saveUser(apiUserToLocal(e.user));
      raidState.data={settings:raidState.data?.settings||{},schedule:raidState.data?.schedule||{},current:null,participants:[],me:null};
      await loadRaidView();
      return;
    }
    if(e?.settlementPending&&attempt<12){
      const wait=Math.max(1500,Math.min(5000,Number(e.retryAfterMs||2500)));
      if(btn){btn.disabled=true;btn.textContent=`정산 복구 확인 중... (${attempt+1})`;}
      retryScheduled=true;
      raidState.claimRetryTimer=setTimeout(()=>{raidState.claimRetryTimer=null;raidState.claimInFlight=false;void claimRaidReward(attempt+1)},wait);
      return;
    }
    if(btn){btn.disabled=false;btn.textContent='정산 다시 시도';}
    alert(e.message);
  }finally{
    if(!retryScheduled)raidState.claimInFlight=false;
  }
}
async function selectRaidRoom(instanceId){raidState.selectedRoomId=Number(instanceId||0);await loadRaidView()}
async function leaveRaid(){const instanceId=Number(raidState.data?.current?.id||0);if(!instanceId||!confirm('레이드 대기실에서 퇴장할까요?\n사용한 오늘의 입장 횟수는 복구되며 같은 방에는 다시 참가할 수 없습니다.'))return;const btn=document.getElementById('raidLeave');if(btn){btn.disabled=true;btn.textContent='퇴장 중...'}try{const d=await apiRequest('raid/leave',{method:'POST',body:JSON.stringify({instanceId})});raidState.selectedRoomId=0;alert(`레이드 방에서 퇴장했습니다.\n입장 횟수 복구 완료 · 현재 참가자 ${Number(d.participantCount||0)}명`);await loadRaidView()}catch(e){alert(e.message);if(btn){btn.disabled=false;btn.textContent='레이드 퇴장'}}}
async function openRaid(bossId,btn){if(!confirm('이 레이드를 개방하면 코인이 차감되고 오늘의 입장 기회 1회를 사용합니다.\n최소 인원 미달로 취소되면 개설 코인과 입장 횟수가 자동 복구됩니다.\n\n레이드를 개방할까요?'))return;const requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;if(btn){btn.disabled=true;btn.textContent='개방 중...'}try{const d=await apiRequest('raid/open',{method:'POST',body:JSON.stringify({bossId,cardIds:battleState.deck,requestId})});raidState.selectedRoomId=Number(d.instanceId||0);alert(`레이드 방이 개설되었습니다.\n${Number(d.cost||0).toLocaleString()}코인 사용 · 자동 참가 완료`);await loadRaidView()}catch(e){alert(e.message);if(btn){btn.disabled=false;btn.textContent='레이드 개방'}}}
async function joinRaid(){const btn=document.getElementById('raidJoin'),instanceId=Number(raidState.data?.current?.id||raidState.selectedRoomId||0);if(btn)btn.disabled=true;try{const d=await apiRequest('raid/join',{method:'POST',body:JSON.stringify({instanceId,cardIds:battleState.deck})});raidState.selectedRoomId=instanceId;alert(`레이드 신청 완료!\n참가 전투력 ${Number(d.totalPower).toLocaleString()}`);loadRaidView()}catch(e){alert(e.message);if(btn)btn.disabled=false}}

function bindView(tab) {
  if(tab==='inventory')loadInventory();
  if(tab==='evolution'&&typeof window.bindEvolutionView==='function')window.bindEvolutionView();
  if(tab==='magic')loadMagicView();
  if(tab==='messages'){document.getElementById('openWagoVerify')?.addEventListener('click',openWagoVerification);loadMessages();}
  if(tab==='dailyquest'){document.getElementById('dailyQuestPostCheck')?.addEventListener('click',()=>checkDailyQuest());document.getElementById('dailyQuestPostClaim')?.addEventListener('click',()=>claimDailyQuest());loadDailyQuest();}
  const accountBtn=document.getElementById('playerAccountBtn'); if(accountBtn) accountBtn.onclick=showAccountPanel;
  document.querySelectorAll('.pack-choice').forEach(button => button.onclick = () => { selectedPackId = button.dataset.packId; renderShell('buy'); });
  document.querySelectorAll('.draw').forEach(b => b.onclick = () => openPack(b.dataset.packId, Number(b.dataset.count), Number(b.dataset.cost)));
  document.querySelectorAll('.recent-item').forEach(b => b.onclick = () => showDetail(b.dataset.cardId));
  const goDex=document.getElementById('goDex'); if(goDex)goDex.onclick=()=>renderShell('dex');
  const claim = document.getElementById('claimAttendance');
  if (claim) claim.onclick = claimAttendance;
  const couponBtn=document.getElementById('redeemCoupon'); if(couponBtn) couponBtn.onclick=redeemCoupon;
  if(tab==='rank'){document.querySelectorAll('[data-rank-mode]').forEach(b=>b.onclick=()=>loadRankHub(b.dataset.rankMode));loadRankHub('pvp');}
  if(tab==='battle'){document.querySelectorAll('.pve-mode-btn').forEach(b=>b.onclick=()=>switchPveMode(b.dataset.pveMode));loadBattleView();}
  if(tab==='pvp') loadPvpView();
  if(tab==='mineral') loadMineralExchange();
  if(tab==='dex') {
    document.querySelectorAll('.dex-fold-button').forEach(h=>h.onclick=()=>h.closest('.dex-section').classList.toggle('collapsed'));
    document.querySelectorAll('.card-frame').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
    const search=document.getElementById('dexSearch'),filter=document.getElementById('gradeFilter'),sort=document.getElementById('dexSort'),favoriteOnly=document.getElementById('favoriteMemberOnly');
    const apply=()=>{const prefs=loadDexPrefs(),q=search.value.trim().toLowerCase(),g=filter.value;document.querySelectorAll('.dex-section').forEach(section=>{let visible=0;section.querySelectorAll('.card-frame').forEach(el=>{const c=cards.find(x=>x.id===el.dataset.id),show=(!q||c.title.toLowerCase().includes(q)||c.name.toLowerCase().includes(q))&&(!g||c.grade===g);el.style.display=show?'':'none';if(show)visible++});const favoriteMatch=!prefs.favoriteOnly||section.classList.contains('favorite-member');section.style.display=visible&&favoriteMatch?'':'none';if(q||g)section.classList.remove('collapsed')});prefs.search=search.value;prefs.grade=g;saveDexPrefs(prefs)};
    document.querySelectorAll('.dex-member-favorite').forEach(button=>button.onclick=e=>{e.stopPropagation();const prefs=loadDexPrefs(),name=button.dataset.favoriteMember,list=new Set(prefs.favoriteMembers||[]);list.has(name)?list.delete(name):list.add(name);prefs.favoriteMembers=[...list];saveDexPrefs(prefs);renderShell('dex')});
    search.oninput=apply;filter.onchange=apply;sort.onchange=()=>{const prefs=loadDexPrefs();prefs.sort=sort.value;saveDexPrefs(prefs);renderShell('dex')};favoriteOnly.onclick=()=>{const prefs=loadDexPrefs();prefs.favoriteOnly=!prefs.favoriteOnly;saveDexPrefs(prefs);renderShell('dex')};const uniqueLegend=document.querySelector('[data-scroll-unique]');if(uniqueLegend)uniqueLegend.onclick=()=>{const first=document.querySelector('.card-unique-badge');if(first){first.closest('.dex-section')?.classList.remove('collapsed');first.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>first.classList.add('pulse'),300);setTimeout(()=>first.classList.remove('pulse'),1700)}};apply();
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
    modal.innerHTML=`<div class="modal-panel multi-result-panel"><div class="result-head"><div><p class="eyebrow">PACK RESULT</p><h2>${escapeHtml(pack.name)} · ${count}장 획득</h2></div><button class="icon-close" id="closeResult">×</button></div><div class="result-actions result-actions-top"><button class="btn" id="drawAgain">같은 팩 다시 뽑기</button><button class="btn secondary" id="confirmResult">확인</button></div><div class="result-grid count-${count}">${results.map(({card,duplicate,shardGained=0,masterStarGained=0})=>`<div class="result-item"><span class="result-label ${duplicate?'dupe':'new'}">${duplicate?(masterStarGained?`<b>마스터의 별 +${masterStarGained}</b><small>카드 조각 +${shardGained}</small>`:`카드 조각 +${shardGained}`):'NEW'}</span>${cardHtml(card,true,'result-card',user)}</div>`).join('')}</div></div>`;
    document.querySelectorAll('.result-card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
    document.getElementById('closeResult').onclick=document.getElementById('confirmResult').onclick=()=>renderShell('buy');
    document.getElementById('drawAgain').onclick=()=>{ modal.className='modal'; openPack(pack.id,count,cost); };
  },1550);
}

function uniqueAbilityStats(card){
  const x=card?.uniqueAbility;if(!x)return [];
  return [
    {key:'attack',label:'공격',icon:'⚔',value:Number(x.attackPercent||0)},
    {key:'defense',label:'방어',icon:'◆',value:Number(x.defensePercent||0)},
    {key:'hp',label:'HP',icon:'♥',value:Number(x.hpPercent||0)},
    {key:'speed',label:'속도',icon:'↯',value:Number(x.speedPercent||0)}
  ];
}
function uniqueAbilityScopeText(x){
  const scopes=[];if(x?.scopes?.pve)scopes.push('PVE · 무한의탑 · 레이드');if(x?.scopes?.pvp)scopes.push('PVP');if(x?.scopes?.captain)scopes.push('대장전');return scopes.join(' / ')||'적용 콘텐츠 없음';
}
function uniqueAbilityBadgeHtml(card,classes=''){
  const x=card?.uniqueAbility;if(!x||/(?:detail-card|special-reveal|battle-fighter|raid-combat|raid-mini|captain-combat|captain-v3-combat)/.test(String(classes)))return '';
  const top=uniqueAbilityStats(card).filter(stat=>stat.value!==0).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))[0];
  return `<span class="card-unique-badge ${x.ownerTest?'owner-test':''}" data-card-profile="${escapeHtml(String(card.id))}" role="button" tabindex="0" aria-label="${escapeHtml(card.title||'카드')} 고유 능력 보기"><i>◇</i><b>고유</b>${top?`<small>${top.icon}${top.value>0?'+':''}${top.value}%</small>`:''}</span>`;
}
function uniqueAbilityInlineHtml(card,classes=''){
  const x=card?.uniqueAbility;if(!x)return '';
  const stats=uniqueAbilityStats(card).filter(stat=>stat.value!==0).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,2);
  return `<span class="card-ability-inline ${classes} ${x.ownerTest?'owner-test':''}" data-card-profile="${escapeHtml(String(card.id))}" role="button" tabindex="0"><i>◇</i><b>${x.ownerTest?'TEST':'고유 능력'}</b>${stats.map(stat=>`<em>${stat.icon} ${stat.value>0?'+':''}${stat.value}%</em>`).join('')}<u>상세</u></span>`;
}
function uniqueAbilityDetailHtml(card){
  const x=card?.uniqueAbility;if(!x)return '<div class="card-unique-empty"><i>◇</i><b>설정된 고유 능력이 없습니다.</b><span>고유 능력이 활성화된 카드에는 도감과 덱 화면에 전용 배지가 표시됩니다.</span></div>';
  const stat=({key,label,icon,value})=>`<article class="unique-stat unique-${key}"><i>${icon}</i><span>${label}</span><b>${value>0?'+':''}${value}%</b></article>`;
  return `<section class="card-unique-ability ${x.ownerTest?'owner-test':''}"><div class="unique-ability-head"><div><small>${x.ownerTest?'OWNER TEST · ':''}UNIQUE ABILITY</small><h3>${escapeHtml(x.effectName||'카드 고유 능력')}</h3></div><em>${x.ownerTest?'TEST MODE':'ACTIVE'}</em></div>${x.ownerTest?'<div class="unique-owner-notice"><b>OWNER 테스트 중</b><span>일반 유저에게는 아직 공개·적용되지 않는 능력치입니다.</span></div>':''}<div class="unique-ability-stats">${uniqueAbilityStats(card).map(stat).join('')}</div>${x.effectDescription?`<div class="unique-effect-copy"><small>ABILITY DESCRIPTION</small><p>${escapeHtml(x.effectDescription)}</p></div>`:'<div class="unique-effect-copy muted"><small>ABILITY DESCRIPTION</small><p>등록된 고유 효과 설명이 없습니다.</p></div>'}<div class="unique-scope"><small>적용 콘텐츠</small><b>${escapeHtml(uniqueAbilityScopeText(x))}</b></div><footer><span>능력치는 전투 계산에 자동 반영됩니다.</span><b>발동형 특수 효과는 준비 중</b></footer></section>`;
}

function cardHtml(card, owned, classes='', user=loadUser()) {
  const uniqueBadge=uniqueAbilityBadgeHtml(card,classes);
  if(!owned)return `<article class="card-frame locked ${classes}" data-id="${card.id}">${uniqueBadge}<div class="card-inner"><div class="card-art"><span class="missing">?</span></div><div class="card-footer"><div class="card-title">미획득 카드</div></div></div></article>`;
  const limited=card.limitedTotal!==null&&card.limitedTotal!==undefined;
  const remain=limited?Math.max(0,Number(card.limitedTotal)-Number(card.issuedCount||0)):null;
  const level=Number(user?.breakthroughs?.[card.id]||0);
  const breakthrough=level>0?` breakthrough-${level}`:'';
  return `<article class="card-frame grade-${card.grade}${breakthrough} ${classes}" data-id="${card.id}">${uniqueBadge}${limited?`<div class="limited-badge">한정판 ${remain}/${card.limitedTotal}</div>`:''}${level>0?`<div class="breakthrough-badge">★${level}</div>`:''}<div class="card-holo"></div><div class="breakthrough-effect"></div><div class="card-inner"><div class="card-header"><span>${card.grade}${powerTypeIndicatorHtml(card)}</span><b>CNINE</b></div><div class="card-art"><img loading="lazy" src="${card.image}" alt="${escapeHtml(card.title)}" style="object-position:${card.focusX}% ${card.focusY}%"></div><div class="card-footer"><div><small>${escapeHtml(card.name)}</small><div class="card-title">${escapeHtml(card.title)}</div></div><img src="assets/ui/cninelogo.png" class="card-mini-logo" alt="CNINE"></div></div></article>`;
}

function showDetail(id,initialTab='auto') {
  const user=loadUser(), card=cards.find(c=>String(c.id)===String(id)); if(!card)return;
  const normalizedId=String(card.id),owned=ownedIds(user).has(normalizedId),history=user.history.find(x=>String(x.cardId)===normalizedId),modal=document.getElementById('modal');
  const level=Number(user.breakthroughs?.[normalizedId]||0),canBreak=owned&&gradeOrder[card.grade]>=gradeOrder[breakthroughMinGrade],isMa=String(card.grade||'').toUpperCase()==='MA',maxLevel=isMa?13:10,isMaHigh=isMa&&level>=10&&level<13,standardRule=user.breakthroughConfig?.[card.grade]?.[level]||{cost:breakthroughCosts[level],rate:breakthroughRates[level]},highRule=user.maHighBreakthrough?.steps?.[level-10],rule=isMaHigh?highRule:standardRule,cost=level<maxLevel?Number(rule?.cost||0):null,successRate=level<maxLevel?Number(rule?.rate||0):null,materialBalance=isMaHigh?Number(user.masterStars||0):Number(user.cardShards||0),materialName=isMaHigh?'마스터의 별':'카드 조각',highEnabled=user.maHighBreakthrough?.enabled===true;
  const hasUnique=Boolean(card.uniqueAbility),activeTab=hasUnique&&initialTab!=='info'?'ability':'info',basePower=Number(card.basePower||0);
  const infoPanel=`<section class="card-profile-panel ${activeTab==='info'?'active':''}" data-profile-panel="info"><div class="card-profile-facts"><article><small>보유 상태</small><b>${owned?'보유 중':'미획득'}</b></article><article><small>등급</small><b>${escapeHtml(card.grade||'?')}</b></article><article><small>기본 전투력</small><b>${basePower>0?basePower.toLocaleString():'-'}</b></article><article><small>전투력 유형</small><b>${escapeHtml(powerTypeIndicator(card)||'기본')}</b></article></div>${owned?`<div class="breakthrough-info"><span>돌파 단계</span><strong>${level>=maxLevel?`★${maxLevel} MAX`:`★${level}`}</strong><small>보유 ${materialName} ${materialBalance.toLocaleString()}개</small>${canBreak?(level<maxLevel?(isMaHigh&&!highEnabled?'<b class="max-breakthrough">MA 고급 강화 운영 준비 중</b>':`<button type="button" class="btn breakthrough-btn" id="breakthroughBtn" data-breakthrough-card="${escapeHtml(normalizedId)}" ${materialBalance<cost?'disabled':''}>${materialName} ${cost.toLocaleString()}개 · 성공 ${successRate}%<br>★${level+1} 강화</button>`):'<b class="max-breakthrough">LEGEND · 최대 강화</b>'):'<small>SR 등급 이상부터 돌파할 수 있습니다.</small>'}</div>`:'<div class="card-profile-locked-info"><i>LOCKED</i><b>아직 획득하지 않은 카드입니다.</b><span>고유 능력은 미리 확인할 수 있지만 돌파·보유 정보는 획득 후 공개됩니다.</span></div>'}${history?`<p class="obtained-date">최초 획득<br><strong>${new Date(history.at).toLocaleString('ko-KR')}</strong></p>`:''}</section>`;
  const abilityPanel=hasUnique?`<section class="card-profile-panel ${activeTab==='ability'?'active':''}" data-profile-panel="ability">${uniqueAbilityDetailHtml(card)}</section>`:'';
  modal.className='modal show detail-modal card-profile-modal';
  modal.innerHTML=`<div class="modal-panel detail-panel card-profile-v1161"><button type="button" class="icon-close detail-close" id="closeDetail">×</button><div class="detail-layout"><div class="card-profile-visual">${cardHtml(card,owned,'detail-card',user)}${hasUnique?`<div class="profile-ability-mark ${card.uniqueAbility.ownerTest?'owner-test':''}"><i>◇</i><span>${card.uniqueAbility.ownerTest?'OWNER TEST':'UNIQUE ABILITY'}</span></div>`:''}</div><div class="detail-info"><div class="card-profile-heading"><div><p class="eyebrow">CARD PROFILE</p><span class="detail-grade">${owned?`${card.grade}${powerTypeIndicatorHtml(card,'detail-power-stars')}`:'미획득'}</span><h2>${owned?escapeHtml(card.title):'미획득 카드'}</h2><p>${owned?escapeHtml(card.name):'도감에 등록된 고유 능력 정보만 공개됩니다.'}</p></div>${hasUnique?`<span class="profile-status ${card.uniqueAbility.ownerTest?'owner-test':''}"><i>◇</i>${card.uniqueAbility.ownerTest?'TEST':'고유 능력'}</span>`:''}</div><nav class="card-profile-tabs" aria-label="카드 프로필 정보">${hasUnique?`<button type="button" class="${activeTab==='ability'?'active':''}" data-profile-tab="ability"><i>◇</i> 고유 능력</button>`:''}<button type="button" class="${activeTab==='info'?'active':''}" data-profile-tab="info">카드 정보</button></nav><div class="card-profile-panels">${abilityPanel}${infoPanel}</div><button type="button" class="btn dark card-profile-close" id="closeDetail2">닫기</button></div></div></div>`;
  const close=()=>{modal.className='modal';modal.innerHTML=''};
  document.getElementById('closeDetail').onclick=document.getElementById('closeDetail2').onclick=close;
  modal.querySelectorAll('[data-profile-tab]').forEach(button=>button.onclick=()=>{const tab=button.dataset.profileTab;modal.querySelectorAll('[data-profile-tab]').forEach(x=>x.classList.toggle('active',x===button));modal.querySelectorAll('[data-profile-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.profilePanel===tab));});
  const button=document.getElementById('breakthroughBtn');
  if(button){
    button.onclick=async event=>{
      event.preventDefault();event.stopPropagation();
      if(button.dataset.pending==='1')return;
      button.dataset.pending='1';
      const original=button.innerHTML;
      button.disabled=true;button.innerHTML='돌파 처리 중...';
      try{await breakthroughCard(button.dataset.breakthroughCard||normalizedId);}
      finally{if(button.isConnected){button.dataset.pending='0';button.disabled=false;button.innerHTML=original;}}
    };
  }
}

function bindCardProfileDelegation(){
  if(window.__cnineCardProfileDelegation)return;window.__cnineCardProfileDelegation=true;
  const openFromTarget=target=>{const trigger=target?.closest?.('[data-card-profile]');if(!trigger)return false;const id=trigger.dataset.cardProfile;if(!id)return false;showDetail(id,'ability');return true;};
  document.addEventListener('click',event=>{if(!openFromTarget(event.target))return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();},true);
  document.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key))return;if(!openFromTarget(event.target))return;event.preventDefault();event.stopPropagation();},true);
}
bindCardProfileDelegation();

async function breakthroughCard(cardId){
  const user=loadUser(),level=Number(user.breakthroughs?.[cardId]||0),normalizedCardId=String(cardId),card=cards.find(c=>String(c.id)===normalizedCardId),isMa=String(card?.grade||'').toUpperCase()==='MA',maxLevel=isMa?13:10,isMaHigh=isMa&&level>=10;
  if(level>=maxLevel)return;
  const rule=isMaHigh?user.maHighBreakthrough?.steps?.[level-10]:(user.breakthroughConfig?.[card?.grade]?.[level]||{cost:breakthroughCosts[level],rate:breakthroughRates[level]}),materialName=isMaHigh?'마스터의 별':'카드 조각',balance=isMaHigh?Number(user.masterStars||0):Number(user.cardShards||0);
  if(isMaHigh&&user.maHighBreakthrough?.enabled!==true)return alert('MA +11~+13 강화가 아직 운영 준비 중입니다.');
  if(!rule)return alert('강화 설정을 찾을 수 없습니다.');
  if(balance<Number(rule.cost))return alert(`${materialName}이 부족합니다.`);
  if(!confirm(`${materialName} ${Number(rule.cost).toLocaleString()}개를 사용해 ★${level+1} 강화를 시도하시겠습니까?\n성공 확률: ${rule.rate}%\n실패해도 단계는 유지되며 재료는 소모됩니다.`))return;
  try{
    if(API_MODE){const d=await apiRequest('card/breakthrough',{method:'POST',body:JSON.stringify({cardId:normalizedCardId})});saveUser(apiUserToLocal(d.user));alert(d.success?`강화 성공! ★${d.level}${d.guaranteed?'\nSSR 천장 확정 성공':''}`:`강화 실패\n단계는 ★${d.level}로 유지됩니다.${d.pity?.enabled?`\nSSR 천장: ${d.pity.failCount}/${d.pity.threshold}회 실패`:''}`);showDetail(normalizedCardId);}
    else{const actualCost=Number(rule.cost);if(isMaHigh)user.masterStars-=actualCost;else user.cardShards-=actualCost;const success=Math.random()*100<Number(rule.rate);if(success)user.breakthroughs[cardId]=level+1;saveUser(user);alert(success?`강화 성공! ★${level+1}`:`강화 실패\n단계는 ★${level}로 유지됩니다.`);showDetail(normalizedCardId);}
  }catch(e){alert(e.message)}
}


const PLAYER_TOKEN_KEY='cnine_card_api_token';
function persistPlayerToken(token=''){
  API_TOKEN=String(token||'');
  try{if(API_TOKEN)localStorage.setItem(PLAYER_TOKEN_KEY,API_TOKEN);else localStorage.removeItem(PLAYER_TOKEN_KEY)}catch(_){}
  try{if(API_TOKEN)sessionStorage.setItem(PLAYER_TOKEN_KEY,API_TOKEN);else sessionStorage.removeItem(PLAYER_TOKEN_KEY)}catch(_){}
}
function clearPlayerToken(){persistPlayerToken('')}
function clearPlayerLogin() {
  clearPlayerToken();
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
      stopRuntimeCommandPoll();
      clearPlayerLogin();
      modal.className='modal';
      renderLogin();
    }
  };
}

// ===== V1.4 D1 API bridge: API가 없으면 기존 LocalStorage 모드로 자동 전환 =====
let API_MODE=false, API_TOKEN=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
const API_GET_CACHE=new Map(),API_INFLIGHT=new Map();
const API_CACHE_TTL={'cards':120000,'packs':60000,'pvp/config':30000,'recent-high-grade':2000};
function apiCacheKey(path){return String(path).replace(/^\/+|\/+$/g,'')}
function clearApiCache(path=''){const key=apiCacheKey(path);if(key)API_GET_CACHE.delete(key);else API_GET_CACHE.clear()}
const STARTUP_REQUEST_TIMEOUT=10000;
const STARTUP_SNAPSHOT_KEY='cnine_startup_snapshot_v1161';
const STARTUP_SNAPSHOT_MAX_AGE=15*60*1000;
let startupRunId=0,startupWatchdogTimer=null,viewerCatalogWasRefreshed=false;
function readStartupSnapshot(){
  try{
    const raw=sessionStorage.getItem(STARTUP_SNAPSHOT_KEY);if(!raw)return null;
    const data=JSON.parse(raw);if(!data||Date.now()-Number(data.savedAt||0)>STARTUP_SNAPSHOT_MAX_AGE){sessionStorage.removeItem(STARTUP_SNAPSHOT_KEY);return null}
    return data;
  }catch(_){return null}
}
function writeStartupSnapshot(patch={}){
  try{
    let previous={};const raw=sessionStorage.getItem(STARTUP_SNAPSHOT_KEY);if(raw)previous=JSON.parse(raw)||{};
    sessionStorage.setItem(STARTUP_SNAPSHOT_KEY,JSON.stringify({...previous,...patch,savedAt:Date.now()}));
  }catch(error){console.warn('초기 데이터 캐시 저장 실패:',error)}
}
function applyStartupSnapshot(snapshot){
  if(Array.isArray(snapshot?.cards)&&snapshot.cards.length)cards=snapshot.cards.map(normalizeClientCard);
  if(Array.isArray(snapshot?.packs)&&snapshot.packs.length)applyServerPacks(snapshot.packs);
}
async function settled(promise){try{return {ok:true,value:await promise}}catch(error){return {ok:false,error}}}
function refreshBuyShellAfterStartup(runId){
  if(runId!==startupRunId||runtimeCommandContext!=='buy'||!document.querySelector('.page')||document.querySelector('#modal.show'))return;
  const y=window.scrollY;renderShell('buy');requestAnimationFrame(()=>window.scrollTo(0,y));
}
async function refreshStartupCatalog(runId,cardTask,packTask){
  const before=readStartupSnapshot()||{};
  const [cardResult,packResult]=await Promise.all([cardTask,packTask]);
  if(runId!==startupRunId)return;
  let changed=false,cachePatch={};
  if(!viewerCatalogWasRefreshed&&cardResult.ok&&Array.isArray(cardResult.value?.cards)&&cardResult.value.cards.length){
    changed=changed||JSON.stringify(before.cards||[])!==JSON.stringify(cardResult.value.cards);
    cards=cardResult.value.cards.map(normalizeClientCard);cachePatch.cards=cardResult.value.cards;
  }else if(!viewerCatalogWasRefreshed&&!cards.length)console.warn('카드 데이터 백그라운드 갱신 실패:',cardResult.error);
  if(packResult.ok&&Array.isArray(packResult.value?.packs)&&packResult.value.packs.length){
    changed=changed||JSON.stringify(before.packs||[])!==JSON.stringify(packResult.value.packs);
    applyServerPacks(packResult.value.packs);cachePatch.packs=packResult.value.packs;
  }else if(packResult.error)console.warn('카드팩 설정 백그라운드 갱신 실패:',packResult.error);
  if(Object.keys(cachePatch).length)writeStartupSnapshot(cachePatch);
  if(changed)refreshBuyShellAfterStartup(runId);
}
async function verifyStartupSession(){
  if(API_TOKEN){
    try{const me=await apiRequest('me',{}, {timeoutMs:8000});saveUser(apiUserToLocal(me.user));return true}
    catch(error){
      if(Number(error?.status)===401){clearPlayerToken();return recoverPlayerSession()}
      console.warn('유저 인증 확인 일시 실패 - 기존 로그인 정보 유지:',error);return Boolean(loadUser());
    }
  }
  return recoverPlayerSession();
}
async function loadStartupOptionalFeatures(runId){
  await new Promise(resolve=>setTimeout(resolve,1250));
  if(runId!==startupRunId||!API_MODE||!API_TOKEN)return;
  const previousPvp=pvpFeatureEnabled,previousMagic=Boolean(magicSystemState.visible);
  const [pvpResult,magicResult]=await Promise.all([
    settled(apiRequest('pvp/config',{}, {timeoutMs:7000})),
    settled(apiRequest('magic/status',{}, {timeoutMs:7000,ttl:0}))
  ]);
  if(runId!==startupRunId)return;
  if(pvpResult.ok)pvpFeatureEnabled=Boolean(pvpResult.value?.settings?.enabled||pvpResult.value?.bypass);
  else console.warn('PvP 설정 조회 실패 - 로그인은 유지합니다:',pvpResult.error);
  if(magicResult.ok){
    magicSystemState=magicResult.value;
    const current=loadUser();if(current){current.magicCrystals=Number(magicSystemState.magicCrystals||0);saveUser(current)}
    const crystal=document.querySelector('.currency-row.crystal b');if(crystal)crystal.textContent=Number(magicSystemState.magicCrystals||0).toLocaleString();
  }else console.warn('마법카드 설정 조회 실패 - 기존 화면으로 계속합니다:',magicResult.error);
  if(previousPvp!==pvpFeatureEnabled||previousMagic!==Boolean(magicSystemState.visible))refreshBuyShellAfterStartup(runId);
}
function requestTimeoutError(label='서버 요청',timeoutMs=10000){const error=new Error(`${label} 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.`);error.code='REQUEST_TIMEOUT';error.timeout=true;error.timeoutMs=timeoutMs;return error}
async function fetchWithTimeout(input,options={},timeoutMs=15000,label='서버 요청'){
  const controller=new AbortController(),externalSignal=options.signal;let timedOut=false;
  const forwardAbort=()=>controller.abort();
  if(externalSignal){if(externalSignal.aborted)controller.abort();else externalSignal.addEventListener('abort',forwardAbort,{once:true})}
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},Math.max(1000,Number(timeoutMs)||15000));
  try{return await fetch(input,{...options,signal:controller.signal})}
  catch(error){if(timedOut)throw requestTimeoutError(label,timeoutMs);throw error}
  finally{clearTimeout(timer);if(externalSignal)externalSignal.removeEventListener('abort',forwardAbort)}
}
async function loadStaticCardsFallback(){
  try{const response=await fetchWithTimeout('data/cards.json',{cache:'default'},7000,'기본 카드 데이터 확인');if(!response.ok)throw new Error('기본 카드 데이터를 불러오지 못했습니다.');const data=await response.json();return Array.isArray(data)?data:[]}
  catch(error){console.error('기본 카드 데이터 로드 실패:',error);return []}
}
function renderStartupRecovery(message='서버 연결이 지연되고 있습니다.'){
  if(startupWatchdogTimer){clearTimeout(startupWatchdogTimer);startupWatchdogTimer=null}
  const safeMessage=escapeHtml(message||'서버 연결이 지연되고 있습니다.');
  app.innerHTML=`<div class="login-wrap startup-recovery-wrap"><div class="login-box game-panel startup-recovery-box"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CONNECTION RECOVERY</p><h1>씨켓몬 연결 확인</h1><div class="logged-out-notice"><span>로딩이 완료되지 않았습니다.</span><p>${safeMessage}</p></div><button class="btn" id="startupRetry">다시 연결</button><button class="btn secondary" id="startupSessionRetry">로그인 연결 초기화 후 재시도</button><p class="login-help">개인키와 계정 데이터는 삭제되지 않습니다. 연결 토큰만 새로 확인합니다.</p></div></div>`;
  const retry=document.getElementById('startupRetry'),reset=document.getElementById('startupSessionRetry');
  if(retry)retry.onclick=()=>{API_INFLIGHT.clear();clearApiCache();void init()};
  if(reset)reset.onclick=()=>{clearPlayerToken();API_INFLIGHT.clear();clearApiCache();void init()};
}
function scheduleRaidPoll(data){stopRaidTimer();if(document.hidden)return;const view=document.getElementById('pveRaidView');if(!view||view.hidden)return;const state=String(data?.current?.status||data?.current?.state||'').toUpperCase();if(state==='ENDED')return;const delay=state==='BATTLE'||state==='RUNNING'?2000:5000;raidState.timer=setTimeout(()=>loadRaidView(),delay)}

const RETIREMENT_REROLL_META={
  MA_REROLL_TICKET:{title:'MA 재뽑기권',grade:'MA',theme:'ma'},
  LIMITED_REROLL_TICKET:{title:'리미티드 재뽑기권',grade:'LIMITED',theme:'limited'},
  PRESTIGE_REROLL_TICKET:{title:'PRESTIGE 재뽑기권',grade:'PRESTIGE',theme:'prestige'},
  FUR_REROLL_TICKET:{title:'FUR 재뽑기권',grade:'FUR',theme:'fur'}
};
function inventoryView(){return `${summaryBar(loadUser())}<section class="inventory-vault"><div class="inventory-hero"><div class="inventory-hero-copy"><h2>인벤토리</h2><p>획득한 보상 큐브와 특별 아이템을 안전하게 보관합니다.</p><div class="inventory-hero-meta"><b id="inventoryOwnedSummary">보관품 확인 중</b></div></div><div class="inventory-vault-mark" aria-hidden="true"><img src="assets/ui/cninelogo.png" alt=""></div></div><div class="inventory-toolbar" id="inventoryToolbar"><div><button type="button" class="active" data-inventory-filter="ALL">전체</button><button type="button" data-inventory-filter="CUBE">큐브</button><button type="button" data-inventory-filter="REROLL" id="inventoryRerollFilter" hidden>재뽑기권</button></div></div><div id="inventoryGrid" class="inventory-grid"><div class="inventory-loading"><i></i><b>보관함 확인 중</b><span>보유 정보를 확인하고 있습니다.</span></div></div></section>`}
function inventoryItemMarkup(item){
  const owned=Number(item.quantity)>0,kind=String(item.rarity||'normal').toLowerCase(),isCube=item.category==='CUBE',isMasterStar=item.code==='MASTER_STAR',isReroll=item.category==='REROLL';
  const visual=isMasterStar?'<div class="master-star-emblem" aria-hidden="true"><span>★</span><i></i></div>':isReroll?`<div class="inventory-reroll-ticket" aria-hidden="true"><small>${escapeHtml(item.rarity)}</small><b>REROLL</b><span>CNINE</span></div>`:`<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">`;
  const actionLabel=isReroll?'재뽑기':isCube?'큐브 개봉':'아이템 사용';
  return `<article class="inventory-item inventory-item-${kind} ${isMasterStar?'inventory-item-master-star':''} ${isReroll?'inventory-item-reroll':''} ${owned?'owned':'locked'}" data-inventory-category="${escapeHtml(item.category||'ETC')}"><div class="inventory-item-glow"></div>${item.unseenQuantity?`<span class="inventory-new">NEW</span>`:''}<div class="inventory-pack-stage"><span class="inventory-pack-orbit"></span>${visual}<i></i></div><div class="inventory-item-copy"><small>${escapeHtml(item.subtitle||'CNINE INVENTORY')}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="inventory-item-foot"><span>보유 수량 <b>${Number(item.quantity).toLocaleString()}</b></span>${isMasterStar?'<em class="inventory-material-label">MA 중복 보상</em>':`<button type="button" class="inventory-use" data-inventory-use="${escapeHtml(item.code)}" ${owned?'':'disabled'}>${owned?actionLabel:'미보유'}</button>`}</div></div></article>`;
}
function renderInventoryItems(items,filter='ALL'){
  const grid=document.getElementById('inventoryGrid');if(!grid)return;
  const visible=filter==='ALL'?items:items.filter(item=>String(item.category||'').toUpperCase()===filter);
  grid.innerHTML=visible.map(inventoryItemMarkup).join('')||'<div class="inventory-empty"><b>표시할 보관품이 없습니다.</b><span>해당 종류의 보유 아이템이 없습니다.</span></div>';
  grid.querySelectorAll('[data-inventory-use]').forEach(button=>button.onclick=()=>openInventoryPack(button.dataset.inventoryUse));
}
async function loadInventory(){
  const grid=document.getElementById('inventoryGrid');if(!grid)return;
  try{
    const d=await apiRequest('inventory',{}, {ttl:0}),items=Array.isArray(d.items)?d.items:[],summary=document.getElementById('inventoryOwnedSummary'),rerollFilter=document.getElementById('inventoryRerollFilter'),toolbar=document.getElementById('inventoryToolbar');
    if(summary)summary.textContent=`보유 아이템 ${Number(d.totalQuantity).toLocaleString()}개 · ${Number(d.ownedTypes)}종`;
    const hasReroll=items.some(item=>item.category==='REROLL'&&Number(item.quantity)>0);
    if(rerollFilter)rerollFilter.hidden=!hasReroll;
    renderInventoryItems(items,'ALL');
    toolbar?.querySelectorAll('[data-inventory-filter]').forEach(button=>button.onclick=()=>{
      toolbar.querySelectorAll('[data-inventory-filter]').forEach(x=>x.classList.toggle('active',x===button));
      renderInventoryItems(items,button.dataset.inventoryFilter||'ALL');
    });
    if(d.unseenTotal)apiRequest('inventory/seen',{method:'POST',body:'{}'}).then(()=>clearApiCache('inventory')).catch(()=>{});
  }catch(e){
    grid.innerHTML=`<div class="inventory-empty error"><b>인벤토리를 열 수 없습니다.</b><span>${escapeHtml(e.message)}</span><button type="button" class="btn secondary" id="inventoryRetry">다시 확인</button></div>`;
    document.getElementById('inventoryRetry').onclick=loadInventory;
  }
}
async function openInventoryPack(itemCode){
  const reroll=RETIREMENT_REROLL_META[itemCode]||null;
  const cubeItems={NORMAL_CUBE:{title:'일반 큐브',image:'assets/ui/packs/normal-cube.png',range:'C · U · R · SR',theme:'normal'},ADVANCED_CUBE:{title:'고급 큐브',image:'assets/ui/packs/advanced-cube.png',range:'HR · UR · SSR',theme:'advanced'},PREMIUM_CUBE:{title:'프리미엄 큐브',image:'assets/ui/packs/premium-cube.png',range:'MA · FUR · LIMITED',theme:'premium'},GUARANTEED_MA_PACK:{title:'MA 확정 큐브',image:'assets/ui/packs/premium-cube.png',range:'MA 확정',theme:'ma'},GUARANTEED_LIMITED_PACK:{title:'리미티드 확정 큐브',image:'assets/ui/packs/premium-cube.png',range:'LIMITED 확정',theme:'limited'}};
  const meta=reroll?{...reroll,range:`${reroll.grade} 활성 카드`,kind:'reroll'}:{...(cubeItems[itemCode]||cubeItems.NORMAL_CUBE),kind:'cube'},modal=document.getElementById('modal');
  const stageVisual=reroll?`<div class="inventory-open-ticket"><small>${escapeHtml(meta.grade)}</small><b>REROLL</b><span>CNINE RETIREMENT REWARD</span></div>`:`<img src="${meta.image}" alt="${meta.title}">`;
  modal.className=`modal show inventory-open-modal inventory-open-${meta.theme} ${reroll?'inventory-open-reroll':''}`;
  modal.innerHTML=`<div class="modal-panel inventory-open-panel"><button type="button" class="icon-close" id="inventoryOpenClose">×</button><div class="inventory-open-intro"><h2>${meta.title}</h2><p>${reroll?'퇴사 처리된 카드를 대신해 같은 등급의 활성 카드 1장을 다시 뽑습니다.':'큐브 등급 확률에 따라 카드 1장을 획득합니다.'}</p></div><div class="inventory-open-stage"><span class="inventory-open-aura"></span><span class="inventory-open-ring r1"></span><span class="inventory-open-ring r2"></span>${stageVisual}</div><div class="inventory-open-warning"><b>${reroll?'재뽑기 등급':'등장 범위'}</b><span>${meta.range} · 카드 1장</span></div><button type="button" class="btn inventory-open-confirm" id="inventoryOpenConfirm">${reroll?'재뽑기 실행':'큐브 해제'}</button><small>완료되면 ${reroll?'재뽑기권':'인벤토리 수량'} 1개가 차감됩니다.</small></div>`;
  const close=()=>{modal.className='modal';modal.innerHTML=''};
  document.getElementById('inventoryOpenClose').onclick=close;
  document.getElementById('inventoryOpenConfirm').onclick=async()=>{
    const btn=document.getElementById('inventoryOpenConfirm'),panel=modal.querySelector('.inventory-open-panel'),requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    btn.disabled=true;btn.textContent=reroll?'재뽑기 처리 중':'봉인 확인 중';panel.classList.add('opening');
    try{
      const d=await apiRequest('inventory/use',{method:'POST',body:JSON.stringify({itemCode,requestId})});
      clearApiCache('inventory');clearApiCache('cards');mergeClientCards([d.card]);saveUser(apiUserToLocal(d.user));
      await new Promise(resolve=>setTimeout(resolve,950));
      const configuredCard=cards.find(x=>String(x.id)===String(d.card.id))||{},resultCard={...configuredCard,...d.card,id:String(d.card.id),grade:d.card.grade||d.card.rarity,focusX:Number(d.card.focusX??configuredCard.focusX??50),focusY:Number(d.card.focusY??configuredCard.focusY??50)};
      await playConfiguredAcquisitionCutscene(resultCard);
      panel.classList.remove('opening');panel.classList.add('revealed');
      panel.innerHTML=`<div class="inventory-result-head"><h2>${d.duplicate?'카드 중복 획득':reroll?'재뽑기 완료':'새로운 카드 획득'}</h2><span>${escapeHtml(d.card.grade)} 등급 보상</span></div><div class="inventory-result-card-wrap">${cardHtml(resultCard,true,'inventory-result-card',apiUserToLocal(d.user))}</div><div class="inventory-result-info"><b>${escapeHtml(d.card.title)}</b><span>${escapeHtml(d.card.name||'')} · ${escapeHtml(d.card.grade)}</span>${d.duplicate?`<em>중복 보상 · 카드 조각 +${Number(d.shardGained).toLocaleString()}${Number(d.masterStarGained||0)>0?' · 마스터의 별 +1':''}</em>`:'<em>신규 카드 등록</em>'}</div><button type="button" class="btn" id="inventoryResultConfirm">인벤토리로 돌아가기</button>`;
      document.getElementById('inventoryResultConfirm').onclick=()=>{modal.className='modal';modal.innerHTML='';renderShell('inventory')};
    }catch(e){panel.classList.remove('opening');btn.disabled=false;btn.textContent=reroll?'재뽑기 실행':'큐브 해제';alert(e.message)}
  };
}

function messagesView(){return `${summaryBar(loadUser())}<section class="message-center"><div class="message-head"><div><p class="eyebrow">CNINE MESSAGE CENTER</p><h2>메시지함</h2><p>운영 공지, 인증 결과와 개인 귀속 쿠폰을 확인할 수 있습니다.</p></div><button class="btn secondary" id="openWagoVerify">와고 2단계 인증</button></div><div id="wagoVerifyPanel" class="wago-verify-panel" hidden></div><div id="messageList" class="message-list"><div class="empty-recent">메시지를 불러오는 중...</div></div></section>`}
async function loadMessages(){const box=document.getElementById('messageList');if(!box)return;try{const d=await apiRequest('messages');box.innerHTML=d.messages.length?d.messages.map(m=>{const rewardType=String(m.reward_type||'').toUpperCase(),messageReward=['COIN','SHARDS'].includes(rewardType)&&Number(m.reward_amount)>0;return `<article class="user-message ${m.is_read?'read':'unread'}" data-id="${m.id}"><button type="button" class="message-delete" data-hide-message="${m.id}" aria-label="메시지 삭제">삭제</button><div><span>${escapeHtml(m.message_type)}</span><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.body)}</p>${messageReward?`<div class="message-reward"><strong>${rewardType==='SHARDS'?'🧩':'🪙'} ${Number(m.reward_amount).toLocaleString()} ${rewardType==='SHARDS'?'카드 조각':'코인'}</strong><button type="button" data-claim-message="${m.id}" ${m.claimed_at?'disabled':''}>${m.claimed_at?'수령 완료':'보상 받기'}</button></div>`:''}${m.coupon_code?`<div class="message-coupon"><code>${escapeHtml(m.coupon_code)}</code><button type="button" data-use-coupon="${escapeHtml(m.coupon_code)}">쿠폰 사용</button></div>`:''}<small>${escapeHtml(String(m.created_at||'').replace('T',' ').slice(0,16))}</small></div></article>`}).join(''):'<div class="empty-recent">도착한 메시지가 없습니다.</div>';box.querySelectorAll('.user-message').forEach(x=>x.onclick=async()=>{if(!x.classList.contains('unread'))return;await apiRequest('messages',{method:'PATCH',body:JSON.stringify({id:Number(x.dataset.id)})});x.classList.remove('unread');x.classList.add('read')});box.querySelectorAll('[data-claim-message]').forEach(b=>b.onclick=async e=>{e.stopPropagation();try{const d=await apiRequest('messages/claim',{method:'POST',body:JSON.stringify({messageId:Number(b.dataset.claimMessage)})});saveUser(apiUserToLocal(d.user));alert(d.rewardType==='SHARDS'?`${Number(d.rewardAmount).toLocaleString()}개의 카드 조각을 수령했습니다. 메시지는 자동으로 삭제됩니다.`:`${Number(d.rewardAmount).toLocaleString()}코인을 수령했습니다. 메시지는 자동으로 삭제됩니다.`);const card=b.closest('.user-message');if(card){card.classList.add('message-removing');setTimeout(()=>renderShell('messages'),220)}else renderShell('messages')}catch(err){alert(err.message)}});box.querySelectorAll('[data-use-coupon]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const code=b.dataset.useCoupon;try{const d=await apiRequest('coupon/redeem',{method:'POST',body:JSON.stringify({code})});saveUser(apiUserToLocal(d.user));alert(`쿠폰 사용 완료! ${Number(d.rewardCoin).toLocaleString()}코인을 받았습니다.`);renderShell('messages')}catch(err){alert(err.message)}});box.querySelectorAll('[data-hide-message]').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!confirm('이 메시지를 받은 편지함에서 삭제할까요?\n쿠폰을 사용하지 않았더라도 메시지는 사라집니다.'))return;b.disabled=true;try{await apiRequest('messages',{method:'PATCH',body:JSON.stringify({id:Number(b.dataset.hideMessage),action:'HIDE'})});const card=b.closest('.user-message');if(card){card.classList.add('message-removing');setTimeout(()=>{card.remove();if(!box.querySelector('.user-message'))box.innerHTML='<div class="empty-recent">도착한 메시지가 없습니다.</div>'},220)}else loadMessages()}catch(err){b.disabled=false;alert(err.message)}})}catch(e){box.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}}
async function openWagoVerification(){
  const panel=document.getElementById('wagoVerifyPanel');if(!panel)return;
  panel.hidden=false;
  try{
    const d=await apiRequest('wago-verification/status'),v=d.verification,s=d.settings;
    const verified=v?.status==='VERIFIED';
    panel.innerHTML=`<div class="verify-card"><h3>와고 닉네임 2단계 인증</h3>${v?`<div class="verify-status status-${String(v.status).toLowerCase()}"><b>${verified?'인증 완료':escapeHtml(v.status)}</b><span>${escapeHtml(v.wago_nickname)}${v.wago_member_no?` · 회원번호 ${escapeHtml(v.wago_member_no)}`:''}</span>${v.verification_code&&!verified?`<code>${escapeHtml(v.verification_code)}</code>`:''}</div>`:''}${verified?'<div class="verify-guide"><p>인증 댓글 작성자의 회원번호를 자동 확인한 계정입니다.</p></div>':`<div class="verify-form"><input id="verifyWagoName" placeholder="와고 닉네임" value="${escapeHtml(v?.wago_nickname||'')}"><button class="btn" id="issueVerifyCode">인증코드 발급</button></div><div class="verify-guide"><p>발급된 인증코드를 아래 지정 게시글에 댓글로 작성하세요. 댓글 주소나 프로필 주소를 따로 입력할 필요 없이 작성자 링크에서 회원번호를 자동 인식합니다.</p>${s.postUrl?`<a class="btn secondary" href="${escapeHtml(s.postUrl)}" target="_blank" rel="noopener">와고 인증 게시글 열기</a>`:'<b>현재 인증 게시글이 준비되지 않았습니다.</b>'}<button class="btn" id="checkVerifyComment" ${s.postUrl?'':'disabled'}>댓글 자동 인증 확인</button></div>`}</div>`;
    if(verified)return;
    document.getElementById('issueVerifyCode').onclick=async()=>{try{const r=await apiRequest('wago-verification/request',{method:'POST',body:JSON.stringify({wagoNickname:document.getElementById('verifyWagoName').value})});alert(`인증코드: ${r.verificationCode}\n${r.expiresMinutes}분 안에 지정 게시글 댓글로 작성하세요.`);openWagoVerification()}catch(e){alert(e.message)}};
    document.getElementById('checkVerifyComment').onclick=async()=>{try{const r=await apiRequest('wago-verification/check',{method:'POST',body:'{}'});alert(r.message||'자동 인증이 완료되었습니다.');openWagoVerification()}catch(e){alert(e.message)}};
  }catch(e){panel.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}
}

async function apiRequest(path, options={}, config={}) {
  const cleanPath=apiCacheKey(path),method=String(options.method||'GET').toUpperCase(),isGet=method==='GET';
  const ttl=isGet?Number(config.ttl??API_CACHE_TTL[cleanPath]??0):0,now=Date.now();
  if(isGet&&ttl>0){const cached=API_GET_CACHE.get(cleanPath);if(cached&&cached.expiresAt>now)return cached.data;}
  if(isGet&&API_INFLIGHT.has(cleanPath))return API_INFLIGHT.get(cleanPath);
  const timeoutMs=Math.max(1000,Number(config.timeoutMs??(isGet?15000:30000))||15000);
  const task=(async()=>{
    const response=await fetchWithTimeout(`/api/${cleanPath}`,{
      cache:isGet&&ttl>0?'default':'no-store',
      ...options,
      headers:{'content-type':'application/json','authorization':API_TOKEN?`Bearer ${API_TOKEN}`:'',...(options.headers||{})}
    },timeoutMs,`서버 요청 (${cleanPath})`);
    const contentType=(response.headers.get('content-type')||'').toLowerCase(),text=await response.text();
    let data={};
    if(text){
      if(contentType.includes('application/json')){try{data=JSON.parse(text)}catch{throw new Error('서버 JSON 응답 형식이 올바르지 않습니다.')}}
      else{if(response.ok&&config.allowEmpty)return {};throw new Error(response.ok?'서버가 잘못된 형식으로 응답했습니다.':'현재 서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.');}
    }else if(!response.ok&&!config.allowEmpty)throw new Error('서버 요청에 실패했습니다.');
    if(!response.ok){const error=new Error(data.error||'서버 요청 실패');Object.assign(error,data,{status:response.status,path:cleanPath});throw error;}
    if(isGet&&ttl>0)API_GET_CACHE.set(cleanPath,{data,expiresAt:Date.now()+ttl});
    if(!isGet&&cleanPath.startsWith('pvp/'))clearApiCache('pvp/config');
    return data;
  })();
  if(isGet)API_INFLIGHT.set(cleanPath,task);
  try{return await task}finally{if(isGet&&API_INFLIGHT.get(cleanPath)===task)API_INFLIGHT.delete(cleanPath)}
}
const RUNTIME_COMMAND_TAB_KEY='cnine_runtime_command_last_id_v1091';
function runtimeCommandStorageKey(){const user=loadUser();return `${RUNTIME_COMMAND_TAB_KEY}:${Number(user?.serverUserId||0)||String(user?.nickname||'guest')}`}
let runtimeCommandTimer=null,runtimeCommandBusy=false,runtimeCommandContext='buy';
function runtimeCommandPollDelay(){if(document.hidden)return 60000;const modalOpen=Boolean(document.querySelector('#modal.show'));return runtimeCommandContext==='battle'||runtimeCommandContext==='pvp'||modalOpen?3000:120000}
function stopRuntimeCommandPoll(){if(runtimeCommandTimer){clearTimeout(runtimeCommandTimer);runtimeCommandTimer=null}}
function scheduleRuntimeCommandPoll(delay=runtimeCommandPollDelay()){stopRuntimeCommandPoll();if(!API_MODE||!API_TOKEN||!loadUser())return;runtimeCommandTimer=setTimeout(pollRuntimeCommand,Math.max(1000,Number(delay)||runtimeCommandPollDelay()))}
function forceMainScreenByOperator(command={}){
  const id=Number(command.id||0);if(!id)return;
  try{sessionStorage.setItem(runtimeCommandStorageKey(),String(id))}catch(_){}
  try{const currentRaidId=Number(raidState.data?.current?.id||0);if(currentRaidId)markRaidResultRevealed(currentRaidId);stopRaidTimer();stopRaidResultAdvanceTimer();stopRaidClaimRetryTimer();raidState.claimInFlight=false;raidState.timer=null;raidState.data=null;raidState.selectedRoomId=0;raidState.revealingResultId=0}catch(_){}
  try{stopBattleEnergyTimer()}catch(_){}
  try{stopPvpEnergyTimer()}catch(_){}
  try{window.dispatchEvent(new CustomEvent('cnine:force-main',{detail:command}))}catch(_){}
  const modal=document.getElementById('modal');if(modal){modal.onclick=null;modal.className='modal';modal.innerHTML=''}
  document.body.classList.remove('battle-running','raid-running','modal-open');
  try{history.replaceState(null,'',location.pathname+location.search)}catch(_){}
  renderShell('buy');
  const message=String(command.payload?.message||'운영자가 화면 복구를 실행했습니다.');
  setTimeout(()=>alert(`${message}\n메인 화면으로 복귀했습니다.`),80);
  apiRequest('user/runtime-command',{method:'POST',body:JSON.stringify({commandId:id})},{allowEmpty:true}).catch(()=>{});
}
async function pollRuntimeCommand(){
  if(runtimeCommandBusy)return scheduleRuntimeCommandPoll(1500);
  if(!API_MODE||!API_TOKEN||!loadUser())return stopRuntimeCommandPoll();
  runtimeCommandBusy=true;let keepPolling=true;
  try{
    const data=await apiRequest('user/runtime-command',{}, {ttl:0});
    const command=data?.command,last=Number(sessionStorage.getItem(runtimeCommandStorageKey())||0);
    if(command&&Number(command.id)>last&&String(command.type||'').toUpperCase()==='FORCE_MAIN')forceMainScreenByOperator(command);
  }catch(error){
    if(Number(error?.status)===401){keepPolling=false;stopRuntimeCommandPoll()}
    else console.warn('운영자 화면 복구 명령 확인 실패:',error);
  }finally{runtimeCommandBusy=false;if(keepPolling)scheduleRuntimeCommandPoll(runtimeCommandPollDelay())}
}
function startRuntimeCommandPoll(){if(!API_MODE||!API_TOKEN||!loadUser())return;stopRuntimeCommandPoll();void pollRuntimeCommand()}

async function detectApi(){
  try{
    const adminToken=localStorage.getItem('cnine_admin_token')||'',authToken=API_TOKEN||adminToken;
    const response=await fetchWithTimeout('/api/service/status',{cache:'no-store',headers:{'authorization':authToken?`Bearer ${authToken}`:''}},8000,'서버 상태 확인');
    const contentType=(response.headers.get('content-type')||'').toLowerCase();
    if(!contentType.includes('application/json')){API_MODE=false;return null;}
    const data=await response.json();API_MODE=response.ok;
    if(data.bypass&&!API_TOKEN&&adminToken)API_TOKEN=adminToken;
    return data;
  }catch(error){console.warn('서버 상태 확인 실패:',error);API_MODE=false;return null;}
}
async function fetchServiceStatus(){const data=await detectApi();return data||{maintenance:{active:false},bypass:false}}
function maintenanceTime(v){if(!v)return'';return String(v).replace('T',' ').slice(0,16)}
function renderMaintenance(m={},service={}){
  const period=[maintenanceTime(m.startAt),maintenanceTime(m.endAt)].filter(Boolean).join(' ~ ');
  const local=loadUser();
  const nickname=service.user?.nickname||local?.nickname||'';
  const key=local?.key||'';
  app.innerHTML=`<div class="maintenance-screen"><div class="maintenance-card game-panel"><img src="assets/ui/cninelogo.png" class="maintenance-logo" alt="CNINE"><p class="eyebrow">SERVER MAINTENANCE</p><h1>${escapeHtml(m.title||'씨켓몬 서버 점검 중')}</h1><p class="maintenance-message">${escapeHtml(m.message||'안정적인 서비스 제공을 위해 점검을 진행하고 있습니다.')}</p>${period?`<div class="maintenance-period"><span>점검 시간</span><b>${escapeHtml(period)}</b></div>`:''}${nickname?`<div class="maintenance-session"><span><i class="login-dot"></i> 로그인 상태 유지 중</span><b>${escapeHtml(nickname)}</b>${key?`<div><input id="maintenanceKey" value="${escapeHtml(key)}" readonly><button id="maintenanceCopyKey">개인키 복사</button></div>`:'<small>현재 브라우저에 개인키가 저장되어 있지 않습니다.</small>'}</div>`:'<div class="maintenance-session logged-out"><b>로그인 상태가 아닙니다.</b><small>점검 중에도 개인키 로그인은 가능하며 로그인 후 세션이 유지됩니다.</small><button class="btn secondary" id="maintenanceLogin">개인키 로그인</button></div>'}<div class="maintenance-notice">점검 중에는 카드뽑기·출석·돌파·전투 등 게임 기능만 제한됩니다.<br>로그인 세션은 자동으로 해제되지 않습니다.</div><button class="btn secondary" id="maintenanceRefresh">점검 상태 새로고침</button></div></div>`;
  document.getElementById('maintenanceRefresh').onclick=()=>location.reload();
  const copy=document.getElementById('maintenanceCopyKey');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(key);alert('개인키가 복사되었습니다.')}catch{document.getElementById('maintenanceKey').select();document.execCommand('copy');alert('개인키가 복사되었습니다.')}};
  const login=document.getElementById('maintenanceLogin');if(login)login.onclick=()=>renderLogin();
}
function apiUserToLocal(u,key){const old=loadUser(),owned=(u.owned||[]).map(id=>String(id)),quantities=Object.fromEntries(Object.entries(u.quantities||{}).map(([id,value])=>[String(id),Number(value||0)])),breakthroughs=Object.fromEntries(Object.entries(u.breakthroughs||{}).map(([id,value])=>[String(id),Number(value||0)]));return {nickname:u.nickname,key:key||old?.key||'',role:u.role||old?.role||'USER',coin:Number(u.coin??old?.coin??0),cardShards:Number(u.cardShards??u.card_shards??old?.cardShards??0),masterStars:Number(u.masterStars??old?.masterStars??0),magicCrystals:Number(u.magicCrystals??u.magic_crystals??old?.magicCrystals??0),owned,quantities,breakthroughs,history:Array.isArray(u.history)?u.history.map(x=>({...x,cardId:String(x.cardId??x.card_id??'')})):(old?.history||[]),attendance:u.attendance||old?.attendance||{lastClaimDate:null,totalDays:0},breakthroughConfig:u.breakthroughConfig||old?.breakthroughConfig||{},maHighBreakthrough:u.maHighBreakthrough||old?.maHighBreakthrough||{enabled:false,steps:[]},weeklyPremiumCube:u.weeklyPremiumCube||old?.weeklyPremiumCube||{currentRate:.1,earnedCount:0,weeklyLimit:2,attemptCount:0},serverUserId:u.id,testCoinGrantedV13:true}}
async function recoverPlayerSession(){
  const saved=loadUser(),privateKey=String(saved?.key||'').trim().toUpperCase();
  if(!privateKey)return false;
  try{
    const d=await apiRequest('auth/login',{method:'POST',body:JSON.stringify({privateKey})},{timeoutMs:10000});
    persistPlayerToken(d.token);
    saveUser(apiUserToLocal(d.user,privateKey));
    await refreshCardCatalogForCurrentViewer();
    return true;
  }catch(error){
    console.warn('자동 세션 복구 실패:',error);
    return false;
  }
}
async function init(){
  viewerCatalogWasRefreshed=false;
  const runId=++startupRunId;
  if(startupWatchdogTimer)clearTimeout(startupWatchdogTimer);
  API_INFLIGHT.clear();migrateLegacyUser();renderLoading();let authenticated=false,completed=false;
  const snapshot=readStartupSnapshot();
  const hasCatalogSnapshot=Boolean(Array.isArray(snapshot?.cards)&&snapshot.cards.length&&Array.isArray(snapshot?.packs)&&snapshot.packs.length);
  if(hasCatalogSnapshot)applyStartupSnapshot(snapshot);
  startupWatchdogTimer=setTimeout(()=>{
    if(runId!==startupRunId||completed)return;
    startupRunId++;API_MODE=false;API_INFLIGHT.clear();
    renderStartupRecovery('서버 응답이 오래 지연되어 자동으로 로딩을 중단했습니다.');
  },24000);

  let cardTask=null,packTask=null,packPending=false;
  try{
    // 점검 여부를 먼저 확인한 뒤 카드/팩/세션을 병렬 조회한다.
    // 일반 접속은 직렬 대기를 줄이고, 점검 중에는 불필요한 DB 요청을 만들지 않는다.
    const service=await detectApi();
    if(runId!==startupRunId)return;
    if(!API_MODE)throw new Error('API_OFFLINE');
    if(service?.maintenance?.active&&!service.bypass){completed=true;clearTimeout(startupWatchdogTimer);startupWatchdogTimer=null;renderMaintenance(service.maintenance,service);return;}

    cardTask=settled(apiRequest('cards',{}, {timeoutMs:STARTUP_REQUEST_TIMEOUT}));
    packTask=settled(apiRequest('packs',{}, {timeoutMs:STARTUP_REQUEST_TIMEOUT}));
    const authTask=settled(verifyStartupSession());
    const authResult=await authTask;
    if(runId!==startupRunId)return;
    if(authResult.ok)authenticated=Boolean(authResult.value);
    else{console.warn('시작 세션 확인 실패:',authResult.error);authenticated=Boolean(loadUser())}

    if(!hasCatalogSnapshot){
      const cardResult=await cardTask;
      if(runId!==startupRunId)return;
      if(!cardResult.ok||!Array.isArray(cardResult.value?.cards))throw cardResult.error||new Error('카드 데이터를 불러오지 못했습니다.');
      if(!viewerCatalogWasRefreshed)cards=cardResult.value.cards.map(normalizeClientCard);
      const cachePatch=viewerCatalogWasRefreshed?{}:{cards:cardResult.value.cards};
      // 팩 조회는 이미 병렬 실행 중이다. 카드 조회 후에도 늦으면 기본/캐시 설정으로 먼저 화면을 연다.
      const packResult=await Promise.race([packTask,new Promise(resolve=>setTimeout(()=>resolve({pending:true}),650))]);
      if(packResult?.pending)packPending=true;
      else if(packResult.ok&&Array.isArray(packResult.value?.packs)){applyServerPacks(packResult.value.packs);cachePatch.packs=packResult.value.packs}
      else console.warn('카드팩 설정 조회 실패 - 기본 설정으로 계속합니다:',packResult.error);
      writeStartupSnapshot(cachePatch);
    }
  }catch(error){
    if(error?.message!=='API_OFFLINE')console.error('초기 연결 실패:',error);
    API_MODE=false;API_INFLIGHT.clear();
    if(runId!==startupRunId)return;
    completed=true;clearTimeout(startupWatchdogTimer);startupWatchdogTimer=null;
    renderStartupRecovery(error?.timeout?'서버 연결 시간이 초과되었습니다. 실제 서버 지급이 확인되지 않는 카드뽑기는 차단됩니다.':'서버 연결을 확인할 수 없습니다. 실제 서버 지급이 확인되지 않는 카드뽑기는 차단됩니다.');
    return;
  }
  if(runId!==startupRunId)return;
  completed=true;if(startupWatchdogTimer){clearTimeout(startupWatchdogTimer);startupWatchdogTimer=null}
  if(authenticated)renderShell('buy');else renderLogin();

  // 캐시 사용 또는 팩 설정 지연 시 최신 카탈로그는 화면 표시 이후 반영한다.
  if((hasCatalogSnapshot||packPending)&&cardTask&&packTask)void refreshStartupCatalog(runId,cardTask,packTask);
  if(authenticated)void loadStartupOptionalFeatures(runId);
}
function renderLogin(){app.innerHTML=`<div class="login-wrap"><div class="login-box game-panel player-login-box"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CNINE COLLECTION GAME</p><h1>씨켓몬 로그인</h1><div class="logged-out-notice"><span>로그아웃 상태</span><p>기존 계정은 아래에 개인키를 입력하면 다시 접속할 수 있습니다.</p></div><div class="field key-login-field"><label for="key">기존 계정으로 로그인</label><input id="key" autocomplete="off" autocapitalize="characters" placeholder="CN-XXXX-XXXX-XXXX"></div><button class="btn" id="login">개인키로 로그인</button><p class="login-help">개인키를 분실했다면 운영팀에 재발급을 요청하세요.</p><div class="login-divider"><span>처음 이용하시나요?</span></div><div class="field"><label for="nickname">신규 닉네임</label><input id="nickname" maxlength="20" placeholder="와이고수 닉네임을 입력하세요"></div><button class="btn secondary" id="start">새 계정 만들기</button></div></div>`;document.getElementById('start').onclick=async()=>{const nickname=document.getElementById('nickname').value.trim();if(!nickname)return alert('닉네임을 입력해주세요.');if(!API_MODE){alert('서버 연결이 없어 계정을 생성할 수 없습니다. 새로고침 후 다시 시도해주세요.');return renderStartupRecovery('서버 연결이 확인되지 않아 계정 생성을 중단했습니다.')}try{const d=await apiRequest('auth/register',{method:'POST',body:JSON.stringify({nickname})});persistPlayerToken(d.token);const user=apiUserToLocal(d.user,d.privateKey);saveUser(user);await refreshCardCatalogForCurrentViewer();renderCreated(user)}catch(e){alert(e.message)}};document.getElementById('login').onclick=async()=>{const key=document.getElementById('key').value.trim();if(!API_MODE){alert('서버 연결이 없어 로그인할 수 없습니다. 새로고침 후 다시 시도해주세요.');return renderStartupRecovery('서버 연결이 확인되지 않아 로그인을 중단했습니다.')}try{const normalizedKey=key.trim().toUpperCase();const d=await apiRequest('auth/login',{method:'POST',body:JSON.stringify({privateKey:normalizedKey})});persistPlayerToken(d.token);saveUser(apiUserToLocal(d.user,normalizedKey));await refreshCardCatalogForCurrentViewer();if(d.maintenance&&!d.bypass)renderMaintenance(d.maintenance,{user:d.user});else renderShell('buy')}catch(e){alert(e.message)}};document.getElementById('key').onkeydown=e=>{if(e.key==='Enter')document.getElementById('login').click()};document.getElementById('nickname').onkeydown=e=>{if(e.key==='Enter')document.getElementById('start').click()}}
async function claimAttendance(){if(!API_MODE){const user=loadUser();if(!canClaimAttendance(user))return alert('오늘 접속 보상은 이미 받았습니다.');const cfg=user.attendance?.settings||{rewards:[1000,1200,1400,1600,1800,2000,3000]};user.attendance.streak=(Number(user.attendance.streak||0)%7)+1;const reward=Number(cfg.rewards[user.attendance.streak-1]||1000);user.coin+=reward;user.attendance.lastClaimDate=kstDateKey();user.attendance.totalDays=(user.attendance.totalDays||0)+1;saveUser(user);alert(`오늘의 접속 보상 ${reward.toLocaleString()}코인을 받았습니다.`);return renderShell('attendance')}try{const d=await apiRequest('attendance/claim',{method:'POST'});const u=apiUserToLocal(d.user);u.attendance=d.user.attendance||{lastClaimDate:kstDateKey(),totalDays:(loadUser()?.attendance?.totalDays||0)+1,streak:d.streak||1};saveUser(u);alert(`오늘의 접속 보상 ${d.reward}코인을 받았습니다.`);renderShell('attendance')}catch(e){alert(e.message)}}

async function redeemCoupon(){
  if(!API_MODE)return alert('현재 쿠폰을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
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
  return `<div class="modal-panel draw-stage opening-panel critical-opening-stage"><p class="eyebrow">PACK OPENING</p><h2>${escapeHtml(pack.name)} · ${count}장</h2><div class="pack-open pack-opening auto-opening" id="criticalTapZone">${packArt(pack)}<div class="tear-line"></div><div class="flash"></div></div><p class="message opening-message" id="openingMessage">카드팩을 자동 개봉하고 있습니다...</p><div class="tap-progress auto-progress"><i id="tapProgress"></i></div><small class="tap-rule">크리티컬은 일정 확률로 발동됩니다.</small></div>`;
}
async function runCriticalOpening(pack,count,requestDraw){
  const modal=document.getElementById('modal');
  modal.className='modal show opening-modal';
  modal.innerHTML=openingMarkup(pack,count);
  const stage=modal.querySelector('.critical-opening-stage');
  const zone=modal.querySelector('#criticalTapZone');
  const progress=modal.querySelector('#tapProgress');
  const message=modal.querySelector('#openingMessage');

  requestAnimationFrame(()=>{
    if(progress)progress.style.width='72%';
    if(zone)zone.classList.add('tearing');
  });

  let data;
  try{
    const slowNotice=setTimeout(()=>{
      if(message)message.textContent='카드 결과를 안전하게 처리 중입니다. 잠시만 기다려주세요...';
      if(progress)progress.style.width='90%';
    },8000);
    try{
      data=await Promise.resolve().then(()=>requestDraw());
    }finally{
      clearTimeout(slowNotice);
    }
    if(!data||typeof data!=='object')throw new Error('카드 개봉 응답 형식이 올바르지 않습니다.');
    if(API_MODE&&!Array.isArray(data.results))throw new Error('카드 개봉 결과를 불러오지 못했습니다.');
  }catch(e){
    modal.className='modal';
    modal.innerHTML='';
    throw e;
  }

  if(progress)progress.style.width='100%';
  await new Promise(r=>setTimeout(r,100));

  if(data.critical?.success){
    showCriticalBurst(stage,data.critical.bonus);
    message.textContent='CRITICAL! 가중치 보너스 적용!';
    await new Promise(r=>setTimeout(r,data.critical.effects===false?300:750));
  }else{
    if(zone)zone.classList.add('tearing');
    message.textContent=data.critical?.eligible?'일반 개봉! 크리티컬은 발생하지 않았습니다.':'일반 개봉!';
    await new Promise(r=>setTimeout(r,350));
  }
  return data;
}

let drawRequestInFlight=false;
let activeDrawRequestId='';
const consumedDrawResponses=new Set();
function resetDrawPresentationState(){
  const modal=document.getElementById('modal');
  if(modal){modal.onclick=null;modal.className='modal';modal.innerHTML='';}
  document.querySelectorAll('.acquisition-cutscene-stage').forEach(node=>node.remove());
}
function drawIntegrityHash(input=''){
  let hash=0x811c9dc5;
  const text=String(input);
  for(let i=0;i<text.length;i++){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,0x01000193)>>>0;
  }
  return hash.toString(16).padStart(8,'0');
}
function drawIntegrityCanonical(response){
  const protocol=response?.drawProtocol||{};
  const results=Array.isArray(response?.results)?response.results:[];
  return JSON.stringify({
    version:Number(protocol.version||0),
    requestId:String(response?.requestId||''),
    packId:String(protocol.packId||''),
    count:Number(protocol.count||0),
    grantVerified:protocol.grantVerified===true,
    results:results.map((item,index)=>({
      slot:Number(item?.slot??index),
      granted:item?.granted===true,
      grantVerified:item?.grantVerified===true,
      cardId:String(item?.card?.id||''),
      grade:String(item?.card?.grade||item?.card?.rarity||'').toUpperCase(),
      title:String(item?.card?.title||''),
      duplicate:Boolean(item?.duplicate),
      shardGained:Number(item?.shardGained||0),
      masterStarGained:Number(item?.masterStarGained||0),
      quantityBefore:Number(item?.quantityBefore??-1),
      quantityAfter:Number(item?.quantityAfter??-1)
    }))
  });
}
function validateDrawResponse(response,{requestId,packId,count}){
  if(!response||typeof response!=='object')throw new Error('카드 개봉 응답이 비어 있습니다.');
  if(String(response.requestId||'')!==String(requestId))throw new Error('현재 개봉 요청과 다른 응답이 도착해 결과 표시를 중단했습니다.');
  if(activeDrawRequestId!==String(requestId))throw new Error('이미 종료된 카드 개봉 응답입니다.');
  if(consumedDrawResponses.has(String(requestId)))throw new Error('이미 표시한 카드 개봉 결과입니다.');
  const protocol=response.drawProtocol||{},proof=response.grantProof||{};
  if(Number(protocol.version)!==3||protocol.grantVerified!==true||String(protocol.packId||'')!==String(packId)||Number(protocol.count)!==Number(count)||protocol.status!=='COMPLETED')throw new Error('서버 카드 지급 확정 정보가 일치하지 않습니다.');
  if(String(proof.requestId||'')!==String(requestId)||Number(proof.count)!==Number(count)||String(proof.packId||'')!==String(packId))throw new Error('서버 카드 지급 증명 정보가 일치하지 않습니다.');
  if(!Array.isArray(response.results)||response.results.length!==Number(count))throw new Error('서버 카드 개봉 수량이 요청과 일치하지 않습니다.');
  const serverOwned=new Set((response.user?.owned||[]).map(id=>String(id)));
  const serverQuantities=Object.fromEntries(Object.entries(response.user?.quantities||{}).map(([id,value])=>[String(id),Number(value||0)]));
  const proofQuantities=new Map((proof.cards||[]).map(row=>[String(row.cardId||''),Number(row.quantityAfter||0)]));
  response.results.forEach((item,index)=>{
    const card=item?.card,cardId=String(card?.id||''),grade=String(card?.grade||card?.rarity||'').toUpperCase();
    const quantityBefore=Number(item?.quantityBefore),quantityAfter=Number(item?.quantityAfter);
    if(Number(item?.slot)!==index||item?.granted!==true||item?.grantVerified!==true)throw new Error(`${index+1}번째 카드의 실제 지급 확정값이 없습니다.`);
    if(!card||!cardId.trim()||String(card.title||'').trim()===''||!['C','U','R','SR','HR','UR','SSR','MA','FUR','LIMITED'].includes(grade))throw new Error(`${index+1}번째 카드 정보가 올바르지 않습니다.`);
    if(!Number.isInteger(quantityBefore)||!Number.isInteger(quantityAfter)||quantityBefore<0||quantityAfter!==quantityBefore+1)throw new Error(`${index+1}번째 카드의 지급 전후 수량 검증에 실패했습니다.`);
    if(!serverOwned.has(cardId)||Number(serverQuantities[cardId]||0)<quantityAfter)throw new Error(`${card.title} 카드가 서버 도감에 실제 등록되지 않아 획득 연출을 중단했습니다.`);
    if(Number(proofQuantities.get(cardId)||0)<quantityAfter)throw new Error(`${card.title} 카드의 서버 지급 증명이 부족합니다.`);
    card.grade=grade;
  });
  const expected=drawIntegrityHash(drawIntegrityCanonical(response));
  if(String(protocol.integrity||'')!==expected)throw new Error('카드 개봉 결과 무결성 검증에 실패했습니다.');
  consumedDrawResponses.add(String(requestId));
  if(consumedDrawResponses.size>80){const first=consumedDrawResponses.values().next().value;consumedDrawResponses.delete(first);}
  return response.results;
}
openPack=async function(packId,count,cost){
  if(drawRequestInFlight)return alert('카드 개봉 요청을 처리 중입니다.');
  if(!API_MODE){
    resetDrawPresentationState();
    alert('서버 연결이 확인되지 않아 카드뽑기를 중단했습니다.\n서버에 실제 지급되지 않는 허위 획득 화면을 방지하기 위해 오프라인 뽑기는 사용할 수 없습니다.\n새로고침 후 다시 시도해주세요.');
    return;
  }
  const pack=getPack(packId);
  const requestId=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  resetDrawPresentationState();
  activeDrawRequestId=requestId;
  drawRequestInFlight=true;
  try{
    const d=await runCriticalOpening(pack,count,()=>apiRequest('draw',{method:'POST',body:JSON.stringify({packId,count,requestId})}));
    const verifiedResults=validateDrawResponse(d,{requestId,packId,count});
    clearApiCache('recent-high-grade');clearApiCache('cards');
    mergeClientCards(verifiedResults.map(x=>x.card));
    const next=apiUserToLocal(d.user);
    saveUser(next);
    await renderDrawResults(pack,count,pack.price*count,verifiedResults,next,d.critical);
  }catch(e){
    resetDrawPresentationState();
    alert(e.message||'카드 개봉 중 오류가 발생했습니다.');
  }finally{
    if(activeDrawRequestId===requestId)activeDrawRequestId='';
    drawRequestInFlight=false;
  }
}
const SPECIAL_REVEAL_ORDER={SSR:1,MA:2,LIMITED:3,FUR:4};
function getTopSpecialResult(results=[]){
  return results.map(x=>x?.card).filter(c=>SPECIAL_REVEAL_ORDER[c?.grade]).sort((a,b)=>SPECIAL_REVEAL_ORDER[b.grade]-SPECIAL_REVEAL_ORDER[a.grade])[0]||null;
}
function specialRevealTone(grade){
  try{
    const C=window.AudioContext||window.webkitAudioContext,ctx=new C(),now=ctx.currentTime;
    const seq=grade==='FUR'?[55,82.4,110,220,440,880]:grade==='MA'?[82.4,123.5,185,277,554]:[110,164.8,247,370];
    const master=ctx.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.18,now+.08);master.gain.exponentialRampToValueAtTime(.0001,now+2.6);master.connect(ctx.destination);
    seq.forEach((freq,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),t=now+i*.16;o.type=grade==='FUR'?'sawtooth':grade==='MA'?'triangle':'sine';o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*1.35,t+.5);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.1,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+.65);o.connect(g).connect(master);o.start(t);o.stop(t+.72)});
  }catch{}
}
function createCinematicRenderer(canvas,grade){
  const transparentScene=grade==='SSR'||grade==='MA';
  const ctx=canvas.getContext('2d',{alpha:transparentScene}),dpr=Math.min(2,window.devicePixelRatio||1);
  let w=0,h=0,raf=0,stopped=false,start=performance.now();
  const palette=grade==='FUR'?['#ffffff','#7cf7ff','#d76cff','#ff5ca8','#ffe879']:grade==='MA'?['#ffffff','#8cecff','#a778ff','#ff8ad8']:['#fff7cf','#ffd45f','#ff9f24','#ffffff'];
  const stars=Array.from({length:grade==='FUR'?190:grade==='MA'?150:115},()=>({x:(Math.random()-.5)*2,y:(Math.random()-.5)*2,z:Math.random(),s:.25+Math.random()*1.3}));
  const shards=Array.from({length:grade==='FUR'?46:grade==='MA'?34:24},()=>({a:Math.random()*Math.PI*2,r:.15+Math.random()*.85,z:Math.random(),spin:(Math.random()-.5)*3,size:3+Math.random()*11}));
  function resize(){w=innerWidth;h=innerHeight;canvas.width=Math.max(1,w*dpr);canvas.height=Math.max(1,h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
  function frame(now){if(stopped)return;const t=(now-start)/1000,cx=w/2,cy=h/2;
    ctx.clearRect(0,0,w,h);
    if(!transparentScene){const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#02000a');bg.addColorStop(.55,'#071325');bg.addColorStop(1,'#010207');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);}
    ctx.save();ctx.translate(cx,cy);
    const speed=grade==='FUR'?.62:grade==='MA'?.48:.38;
    stars.forEach((p,i)=>{p.z=(p.z-speed*.012+1)%1;const depth=.08+p.z*.92,scale=1/depth,px=p.x*w*.42*scale,py=p.y*h*.38*scale,alpha=Math.min(1,(1-depth)*1.35);ctx.fillStyle=palette[i%palette.length];ctx.globalAlpha=alpha;ctx.beginPath();ctx.arc(px,py,p.s*scale,0,Math.PI*2);ctx.fill();if(scale>4){ctx.strokeStyle=palette[i%palette.length];ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px-p.x*24,py-p.y*24);ctx.stroke()}});
    ctx.globalAlpha=1;const pulse=.5+.5*Math.sin(t*2.1),core=Math.min(w,h)*(.075+pulse*.012);
    for(let j=0;j<5;j++){const rr=core*(1+j*.75)+(t*85%(core*1.8));ctx.strokeStyle=palette[(j+1)%palette.length];ctx.globalAlpha=Math.max(0,.24-j*.035)*(1-(rr%(core*2))/(core*2));ctx.lineWidth=Math.max(1,4-j*.55);ctx.beginPath();ctx.ellipse(0,0,rr,rr*.36,Math.sin(t*.42+j)*.28,0,Math.PI*2);ctx.stroke()}
    ctx.globalAlpha=.9;const g=ctx.createRadialGradient(0,0,0,0,0,core*5);g.addColorStop(0,'#fff');g.addColorStop(.05,palette[1]);g.addColorStop(.22,palette[2]+'aa');g.addColorStop(.58,palette[1]+'25');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(-core*5,-core*5,core*10,core*10);
    shards.forEach((q,i)=>{q.a+=.003*(i%2?1:-1)*(1+q.z);q.z=(q.z+.0015)%1;const rr=q.r*Math.min(w,h)*(.2+q.z*.45),x=Math.cos(q.a+t*q.spin*.13)*rr,y=Math.sin(q.a+t*q.spin*.13)*rr*.55;ctx.save();ctx.translate(x,y);ctx.rotate(q.a*2+t*q.spin);ctx.globalAlpha=.18+q.z*.68;ctx.fillStyle=palette[i%palette.length];ctx.beginPath();ctx.moveTo(-q.size,0);ctx.lineTo(0,-q.size*2.1);ctx.lineTo(q.size*.65,0);ctx.lineTo(0,q.size*1.3);ctx.closePath();ctx.fill();ctx.restore()});
    ctx.restore();const vign=ctx.createRadialGradient(cx,cy,Math.min(w,h)*.2,cx,cy,Math.max(w,h)*.72);vign.addColorStop(0,'transparent');vign.addColorStop(.72,'rgba(0,0,0,.12)');vign.addColorStop(1,'rgba(0,0,0,.92)');ctx.fillStyle=vign;ctx.fillRect(0,0,w,h);raf=requestAnimationFrame(frame)}
  resize();addEventListener('resize',resize);raf=requestAnimationFrame(frame);return()=>{stopped=true;cancelAnimationFrame(raf);removeEventListener('resize',resize)};
}
async function playConfiguredAcquisitionCutscene(card){
  const configured=cards.find(x=>String(x.id)===String(card?.id))||{};
  const source={...configured,...(card||{})};
  const grade=String(source.grade||source.rarity||'').toUpperCase();
  const configuredFlag=Number(source.acquisitionFxConfigured??(String(source.acquisitionMediaUrl||'').trim()?1:0));
  const useLimitedDefault=grade==='LIMITED'&&!configuredFlag;
  const enabled=useLimitedDefault?1:Number(source.acquisitionFxEnabled||0);
  const media=String(useLimitedDefault?'/assets/effects/L2CARD.mp4':(source.acquisitionMediaUrl||'')).trim();
  if(!['LIMITED','FUR'].includes(grade)||!enabled||!media)return false;
  const audio=String(source.acquisitionAudioUrl||'').trim();
  const defaultDuration=grade==='LIMITED'?10000:8000;
  const duration=Math.max(1000,Math.min(30000,Number(source.acquisitionDurationMs||defaultDuration)));
  const skip=Number(source.acquisitionSkipAllowed)!==0;
  const layer=document.createElement('div');layer.className=`acquisition-cutscene-stage acquisition-cutscene-${grade.toLowerCase()}`;
  layer.innerHTML=`<video id="acquisitionCutsceneVideo" playsinline webkit-playsinline preload="auto" autoplay src="${escapeHtml(media)}"></video><div class="acquisition-cutscene-shade"></div><div class="acquisition-cutscene-label"><small>SPECIAL ACQUISITION</small><strong>${grade}</strong></div>${skip?'<button type="button" id="acquisitionCutsceneSkip">건너뛰기</button>':''}${audio?`<audio id="acquisitionCutsceneAudio" preload="auto" autoplay src="${escapeHtml(audio)}"></audio>`:''}`;
  document.body.appendChild(layer);
  const video=layer.querySelector('video'),sound=layer.querySelector('audio');
  video.volume=1;
  let visualStarted=false;
  try{await video.play();visualStarted=true}catch{
    video.muted=true;
    try{await video.play();visualStarted=true}catch{}
  }
  if(sound)try{await sound.play()}catch{}
  if(!visualStarted){layer.remove();return false;}
  const completed=await new Promise(resolve=>{let done=false;const finish=success=>{if(done)return;done=true;clearTimeout(timer);try{video.pause()}catch{}try{sound?.pause()}catch{}layer.remove();resolve(success)};const timer=setTimeout(()=>finish(true),duration+650);video.onended=()=>finish(true);video.onerror=()=>finish(false);const b=layer.querySelector('button');if(b)b.onclick=e=>{e.stopPropagation();finish(true)}});
  return completed;
}

async function showSpecialCardReveal(card,user){
  if(await playConfiguredAcquisitionCutscene(card))return;
  const modal=document.getElementById('modal'),grade=card.grade,duration=grade==='SSR'?4700:grade==='MA'?5900:7200;
  const copy=grade==='FUR'?['THE FINAL RARITY','최고 등급의 존재가 강림합니다']:grade==='MA'?['MASTER AWAKENING','마스터의 궤도가 열립니다']:['SUPREME SIGNAL','희귀한 별이 선택되었습니다'];
  modal.className=`modal show special-reveal-modal reveal-${grade.toLowerCase()}`;
  modal.innerHTML=`<div class="special-reveal-stage grade-${grade.toLowerCase()}" role="dialog" aria-label="${grade} 카드 특별 연출"><canvas class="special-cinematic-canvas" id="specialCinematicCanvas"></canvas><div class="cinematic-scene-bg" aria-hidden="true"></div><div class="cinematic-scene-mist" aria-hidden="true"></div><div class="cinematic-vfx cinematic-vfx-portal"></div><div class="cinematic-vfx cinematic-vfx-ring ring-a"></div><div class="cinematic-vfx cinematic-vfx-ring ring-b"></div><div class="cinematic-vfx cinematic-vfx-flare"></div><div class="cinematic-vfx cinematic-vfx-shards"></div><div class="cinematic-vfx cinematic-vfx-crack"></div><div class="cinematic-vfx cinematic-vfx-noise"></div><div class="cinematic-depth-grid"></div><div class="cinematic-horizon"></div><div class="cinematic-flash"></div><div class="cinematic-emblem"><small>${copy[0]}</small><strong>${grade}</strong><span>${copy[1]}</span></div><div class="cinematic-card-shell"><div class="cinematic-card-back"><i></i><b>CNINE</b></div><div class="special-reveal-card">${cardHtml(card,true,'special-reveal-card-ui',user)}</div><div class="cinematic-card-glint"></div></div><div class="cinematic-caption">TAP TO SKIP</div><button type="button" class="special-skip" id="specialRevealSkip">건너뛰기</button></div>`;
  const stage=modal.querySelector('.special-reveal-stage'),stopCanvas=createCinematicRenderer(document.getElementById('specialCinematicCanvas'),grade);
  specialRevealTone(grade);if(navigator.vibrate)navigator.vibrate(grade==='FUR'?[90,40,160,45,260]:grade==='MA'?[70,30,150]:[55,25,100]);
  const timers=[setTimeout(()=>stage.classList.add('phase-approach'),180),setTimeout(()=>stage.classList.add('phase-awaken'),grade==='SSR'?1180:1450),setTimeout(()=>stage.classList.add('phase-impact'),grade==='SSR'?1950:grade==='MA'?2350:2850),setTimeout(()=>stage.classList.add('phase-reveal'),grade==='SSR'?2350:grade==='MA'?2950:3600),setTimeout(()=>stage.classList.add('phase-final'),grade==='SSR'?3400:grade==='MA'?4300:5200)];
  await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;timers.forEach(clearTimeout);stopCanvas();resolve()};document.getElementById('specialRevealSkip').onclick=e=>{e.stopPropagation();finish()};stage.onclick=e=>{if(e.target.closest('.special-reveal-card-ui'))return;finish()};setTimeout(finish,duration)});
}
async function renderDrawResults(pack,count,cost,results,user,critical){
  if(!Array.isArray(results)||results.length!==Number(count)||results.some((item,index)=>item?.granted!==true||Number(item?.slot)!==index||!item?.card?.id))throw new Error('서버에서 확정되지 않은 카드 결과는 표시할 수 없습니다.');
  const special=getTopSpecialResult(results);
  if(special)await showSpecialCardReveal(special,user);
  const modal=document.getElementById('modal');
  modal.className='modal show results-modal';
  const badge=critical?.success?`<div class="critical-result-badge">CRITICAL BONUS +${Number(critical.bonus||0).toFixed(0)}%</div>`:'';
  modal.innerHTML=`<div class="modal-panel multi-result-panel ${critical?.success?'critical-result-panel':''}">${badge}<div class="result-head"><div><p class="eyebrow">PACK RESULT</p><h2>${escapeHtml(pack.name)} · ${count}장 획득</h2></div><button class="icon-close" id="closeResult">×</button></div><div class="result-actions result-actions-top"><button class="btn" id="drawAgain">같은 팩 다시 뽑기</button><button class="btn secondary" id="confirmResult">확인</button></div><div class="result-grid count-${count}">${results.map(({card,duplicate,shardGained=0,masterStarGained=0})=>`<div class="result-item"><span class="result-label ${duplicate?'dupe':'new'} ${masterStarGained?'master-star-dupe':''}">${duplicate?(masterStarGained?`<b>마스터의 별 +${masterStarGained}</b><small>카드 조각 +${shardGained}</small>`:`카드 조각 +${shardGained}`):'NEW'}</span>${cardHtml(card,true,'result-card',user)}</div>`).join('')}</div></div>`;
  document.querySelectorAll('.result-card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
  document.getElementById('closeResult').onclick=document.getElementById('confirmResult').onclick=()=>renderShell('buy');
  document.getElementById('drawAgain').onclick=()=>{modal.className='modal';openPack(pack.id,count,cost)};
}


let pvpFeatureEnabled=true;
let pvpState={tab:'match',config:null,profile:null,deck:[],opponents:[],history:[],ranking:[],energy:null,energyTimer:null,serverOffset:0};
function pvpView(user){return `${summaryBar(user)}<section class="pvp-cover"><div class="pvp-cover-intro"><p class="eyebrow" id="pvpSeasonEyebrow">ASYNC PVP SEASON</p><h2 id="pvpSeasonTitle">PvP 시즌</h2><p id="pvpSeasonDescription">저장한 PvP 덱으로 비동기 대전을 진행합니다.</p><small id="pvpSeasonStatusLine">상태 불러오는 중</small></div><div class="pvp-me"><div id="pvpMyTierBadge" class="pvp-tier-badge"></div><span id="pvpMyTier">-</span><b id="pvpMyScore">-</b><small id="pvpSeasonTime">시즌 정보 불러오는 중</small></div><div class="battle-energy-card pvp-energy-card"><div class="pvp-energy-head"><span>⚔ PvP 전투 횟수</span><b id="pvpEnergyCount">- / -</b></div><div class="battle-energy-track"><i id="pvpEnergyFill"></i></div><small id="pvpEnergyTimer">불러오는 중...</small></div></section><nav class="pvp-tabs"><button data-pvp="match" class="active">대전</button><button data-pvp="deck">덱 편성</button><button data-pvp="history">전투 기록</button><button data-pvp="ranking">시즌 랭킹</button><button data-pvp="reward">시즌 보상</button></nav><section id="pvpContent" class="pvp-content"><div class="empty-recent">PvP 정보를 불러오는 중...</div></section>`}
function pvpCardMini(c,user=loadUser()){const level=Number(user?.breakthroughs?.[c.id]||0),limited=c.limitedTotal!==null&&c.limitedTotal!==undefined;return `<div class="pvp-card-mini-full">${cardHtml(c,true,'pvp-card-display',user)}<div class="pvp-card-extra"><b>${escapeHtml(c.grade||c.rarity||'C')}</b><span class="pvp-card-meta"><em class="breakthrough-meta">돌파 ★${level}</em><i>${limited?'한정판':'일반'}</i>${powerTypeIndicatorHtml(c,'pvp-power-type')}</span></div>${uniqueAbilityInlineHtml(c,'pvp-inline')}</div>`}
function stopPvpEnergyTimer(){if(pvpState.energyTimer){clearInterval(pvpState.energyTimer);pvpState.energyTimer=null}}
function pvpEnergyText(ms){const total=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(total/60),s=total%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function renderPvpEnergy(){const e=pvpState.energy,count=document.getElementById('pvpEnergyCount'),fill=document.getElementById('pvpEnergyFill'),timer=document.getElementById('pvpEnergyTimer');if(!e||!count)return;count.textContent=e.unlimited?'무제한':`${e.energy} / ${e.maxEnergy}`;if(fill)fill.style.width=`${e.unlimited?100:Math.max(0,Math.min(100,e.energy/e.maxEnergy*100))}%`;if(timer){if(e.unlimited)timer.textContent='무제한 적용';else if(e.energy>=e.maxEnergy)timer.textContent='충전 완료';else if(e.nextRechargeAt){const remain=Date.parse(e.nextRechargeAt)-(Date.now()+pvpState.serverOffset);timer.textContent=remain<=0?'충전 갱신 중...':`다음 충전 ${pvpEnergyText(remain)}`;}else timer.textContent='충전 대기';}document.querySelectorAll('.pvp-fight').forEach(b=>{const blocked=!e.unlimited&&e.energy<e.costPerBattle;b.disabled=blocked;b.textContent=blocked?'횟수 부족':'도전';});}
function startPvpEnergyTimer(){stopPvpEnergyTimer();renderPvpEnergy();pvpState.energyTimer=setInterval(()=>{if(!document.getElementById('pvpEnergyCount'))return stopPvpEnergyTimer();const e=pvpState.energy;if(e&&!e.unlimited&&e.nextRechargeAt&&Date.parse(e.nextRechargeAt)<=(Date.now()+pvpState.serverOffset)){loadPvpEnergyOnly();return}renderPvpEnergy()},1000)}
async function loadPvpEnergyOnly(){try{const d=await apiRequest('pvp/config');pvpState.energy=d.energy;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();startPvpEnergyTimer()}catch(_){renderPvpEnergy()}}
async function loadPvpView(){if(!API_MODE){document.getElementById('pvpContent').innerHTML='<div class="empty-recent">현재 PvP를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.</div>';return}try{const d=await apiRequest('pvp/config');pvpFeatureEnabled=Boolean(d.settings?.enabled||d.bypass);pvpState.config=d.settings;pvpState.profile=d.profile;pvpState.deck=d.deck||[];pvpState.energy=d.energy||null;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();const eyebrow=document.getElementById('pvpSeasonEyebrow'),desc=document.getElementById('pvpSeasonDescription'),statusLine=document.getElementById('pvpSeasonStatusLine');if(eyebrow)eyebrow.textContent=d.settings?.seasonTitle||'ASYNC PVP SEASON';document.getElementById('pvpSeasonTitle').textContent=d.settings?.seasonName||'PvP 시즌';if(desc)desc.textContent=d.settings?.seasonDescription||'저장한 PvP 덱으로 비동기 대전을 진행합니다.';if(statusLine)statusLine.textContent=`${pvpFeatureEnabled?'ON':'OFF'} · ${d.settings?.status|| (pvpFeatureEnabled?'진행 중':'중지')}`;if(!pvpFeatureEnabled){document.getElementById('pvpContent').innerHTML=`<div class="empty-recent pvp-disabled-notice"><b>PvP 운영 중지</b><span>${escapeHtml(d.settings?.status||'현재 PvP 시즌이 중지되어 있습니다.')}</span></div>`;document.querySelectorAll('[data-pvp]').forEach(b=>b.disabled=true);return;}document.getElementById('pvpMyTier').textContent=d.profile.tier?.name||'브론즈';const tierBadge=document.getElementById('pvpMyTierBadge');if(tierBadge)tierBadge.innerHTML=tierEmblem(d.profile.tier||{id:'bronze',name:'브론즈',color:'#b87333'},'small');document.getElementById('pvpMyScore').textContent=`시즌 ${Number(d.profile?.season_score||0).toLocaleString()}점`;document.getElementById('pvpSeasonTime').textContent=d.settings.endsAt?`${String(d.settings.endsAt).slice(0,16)} 종료`:'상시 시즌';startPvpEnergyTimer();document.querySelectorAll('[data-pvp]').forEach(b=>b.onclick=()=>{pvpState.tab=b.dataset.pvp;document.querySelectorAll('[data-pvp]').forEach(x=>x.classList.toggle('active',x===b));renderPvpTab()});renderPvpTab()}catch(e){document.getElementById('pvpContent').textContent=e.message}}
async function renderPvpTab(){const box=document.getElementById('pvpContent');if(!box)return;box.innerHTML='<div class="empty-recent">불러오는 중...</div>';try{if(pvpState.tab==='match'){const d=await apiRequest('pvp/opponents');pvpState.opponents=d.opponents||[];box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">RECOMMENDED OPPONENTS</p><h2>추천 상대</h2></div><button class="text-btn" id="pvpRefresh">새로고침</button></div><div class="pvp-opponents">${pvpState.opponents.map(o=>`<article class="pvp-opponent"><div class="pvp-op-head"><b>${escapeHtml(o.nickname)}</b><span>${escapeHtml(o.tier?.name||'브론즈')}</span></div><div class="pvp-op-scores"><span>시즌 <b>${Number(o.season_score||0).toLocaleString()}</b></span><span>점수 차이 <b>${Number(o.scoreDiff||0)>0?'+':''}${Number(o.scoreDiff||0).toLocaleString()}</b></span></div><div class="pvp-op-meta"><span>${Number(o.wins||0)}승 ${Number(o.losses||0)}패</span><em>승리 +${Number(o.expectedWin??24)} · 패배 -${Number(o.expectedLoss??16)}</em></div><button class="btn pvp-fight" data-oid="${o.id}">도전</button></article>`).join('')||'<div class="empty-recent">PvP 덱을 저장한 다른 유저가 아직 없습니다.</div>'}</div>`;document.getElementById('pvpRefresh').onclick=renderPvpTab;document.querySelectorAll('.pvp-fight').forEach(b=>b.onclick=()=>fightPvp(Number(b.dataset.oid)));renderPvpEnergy();}
else if(pvpState.tab==='deck'){const owned=ownedIds(loadUser()),list=cards.filter(c=>owned.has(c.id)).sort((a,b)=>(gradeOrder[b.grade]||0)-(gradeOrder[a.grade]||0)||String(a.name||'').localeCompare(String(b.name||''),'ko')||String(a.title||'').localeCompare(String(b.title||''),'ko'));const grouped=[...new Set(list.map(c=>c.grade))].map(g=>({grade:g,cards:list.filter(c=>c.grade===g)}));box.innerHTML=`<div class="pvp-section-head pvp-deck-head"><div><p class="eyebrow">MY PVP DECK</p><h2>PvP 덱 편성</h2></div><div class="pvp-deck-actions"><span class="pvp-deck-guide">5장 선택 · 덱 카드를 누르면 제외</span><button class="pvp-reset-badge" id="resetPvpDeck"><i>↺</i> 덱 초기화</button></div></div><div id="pvpDeckSlots" class="pvp-deck-slots"></div><div id="pvpCardPicker" class="pvp-card-picker grouped">${grouped.map(group=>`<section class="pvp-grade-group grade-${String(group.grade).toLowerCase()}"><div class="pvp-grade-title"><b>${escapeHtml(group.grade)}</b><span>${group.cards.length}장</span></div><div class="pvp-grade-grid">${group.cards.map(c=>`<button class="pvp-pick ${pvpState.deck.includes(c.id)?'selected':''}" data-cid="${c.id}">${pvpCardMini(c,loadUser())}</button>`).join('')}</div></section>`).join('')}</div><button class="btn" id="savePvpDeck">PvP 덱 저장</button>`;renderPvpDeckSlots();document.querySelectorAll('.pvp-pick').forEach(b=>b.onclick=async()=>{const id=b.dataset.cid,i=pvpState.deck.indexOf(id);if(i>=0)pvpState.deck.splice(i,1);else if(pvpState.deck.length<5)pvpState.deck.push(id);else return alert('PvP 덱은 5장까지 편성할 수 있습니다.');await rerenderPvpDeckPreserveScroll()});document.getElementById('resetPvpDeck').onclick=async()=>{if(!pvpState.deck.length)return;pvpState.deck=[];await rerenderPvpDeckPreserveScroll()};document.getElementById('savePvpDeck').onclick=savePvpDeck;}
else if(pvpState.tab==='history'){const d=await apiRequest('pvp/history');box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">BATTLE HISTORY</p><h2>전투 기록</h2></div></div><div class="pvp-history">${d.history.map(h=>`<div class="pvp-history-row ${h.result.toLowerCase()}"><b>${h.result==='WIN'?'승리':'패배'}</b><span>${escapeHtml(h.opponent)}<small>${h.direction==='ATTACK'?'내가 도전':'상대가 도전'} · ${String(h.created_at).slice(0,16)}</small></span><strong>${h.result==='WIN'?'+':'-'}${h.score_change}</strong></div>`).join('')||'<div class="empty-recent">아직 전투 기록이 없습니다.</div>'}</div>`;}
else if(pvpState.tab==='ranking'){const d=await apiRequest('pvp/ranking');box.innerHTML=`<nav class="rank-switch pvp-rank-switch"><button type="button" class="active">PvP 시즌 랭킹</button><button type="button" id="cardRankLink">카드점수 랭킹</button></nav><div class="pvp-section-head"><div><p class="eyebrow">SEASON RANKING</p><h2>${escapeHtml(d.settings.seasonName)} 랭킹</h2></div></div>${pvpTierGuideHtml(d.settings?.tiers||[],d.me?.tier)}${d.me?`<div class="pvp-my-rank">${tierEmblem(d.me.tier,'rank')}<span>내 순위 <b>${d.me.rank}위</b><small>${escapeHtml(d.me.tier.name)} · ${Number(d.me.season_score).toLocaleString()}점</small></span></div>`:''}<div class="pvp-ranking">${d.ranking.map(r=>`<div class="pvp-rank-row"><b>${r.rank}</b>${tierEmblem(r.tier,'rank')}<span>${escapeHtml(r.nickname)}<small>${escapeHtml(r.tier.name)} · ${r.wins}승 ${r.losses}패</small></span><strong>${Number(r.season_score).toLocaleString()}</strong></div>`).join('')}</div>`;document.getElementById('cardRankLink').onclick=()=>{renderShell('rank');setTimeout(()=>loadRankHub('card'),0)};}
else{const t=pvpState.profile.tier,tiers=pvpState.config.tiers||[],rankRewards=pvpState.config.rankRewards||[],endAt=pvpState.config.endsAt?new Date(String(pvpState.config.endsAt).replace(' ','T')).getTime():0,seasonEnded=Boolean(endAt&&Number.isFinite(endAt)&&Date.now()>=endAt);box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">SEASON REWARD</p><h2>시즌 보상</h2></div></div><div class="pvp-reward-current"><span>현재 최고 달성</span><b>${escapeHtml(t.name)}</b><strong>◈ ${Number(t.rewardCoin||0).toLocaleString()} · 조각 ${Number(t.rewardShards||0).toLocaleString()}</strong><button class="btn" id="claimPvpReward" ${pvpState.config.tierRewardsEnabled===false?'disabled':''}>티어 보상 받기</button></div><div class="pvp-tier-rewards">${tiers.map(x=>`<div><span>${escapeHtml(x.name)}</span><b>${Number(x.min).toLocaleString()}점+</b><strong>◈ ${Number(x.rewardCoin||0).toLocaleString()} · 조각 ${Number(x.rewardShards||0).toLocaleString()}</strong></div>`).join('')}</div><div class="pvp-section-head pvp-rank-reward-head"><div><p class="eyebrow">FINAL RANK REWARD</p><h2>최종 랭킹 보상</h2></div></div><div class="pvp-tier-rewards">${rankRewards.map(x=>`<div><span>${x.from===x.to?`${x.from}위`:`${x.from}~${x.to}위`}</span><b>시즌 종료 기준</b><strong>◈ ${Number(x.rewardCoin||0).toLocaleString()} · 조각 ${Number(x.rewardShards||0).toLocaleString()}</strong></div>`).join('')||'<div class="empty-recent">등록된 랭킹 보상이 없습니다.</div>'}</div>${seasonEnded?`<div class="pvp-final-reward-ready"><span>시즌이 종료되었습니다. 확정된 최종 순위 보상은 계정당 1회만 받을 수 있습니다.</span><button class="btn pvp-rank-claim" id="claimPvpRankReward" ${pvpState.config.rankRewardsEnabled===false?'disabled':''}>최종 랭킹 보상 받기</button></div>`:`<div class="pvp-final-reward-wait"><b>시즌 종료 후 지급</b><span>최종 랭킹 보상은 시즌 종료 시점의 확정 순위를 기준으로 1회 수령할 수 있습니다.</span></div>`}`;document.getElementById('claimPvpReward').onclick=claimPvpReward;const rankClaim=document.getElementById('claimPvpRankReward');if(rankClaim)rankClaim.onclick=claimPvpRankReward;}}catch(e){box.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}}
async function rerenderPvpDeckPreserveScroll(){const picker=document.getElementById('pvpCardPicker'),pickerTop=picker?.scrollTop||0,pageTop=window.scrollY;await renderPvpTab();requestAnimationFrame(()=>{const next=document.getElementById('pvpCardPicker');if(next)next.scrollTop=pickerTop;window.scrollTo({top:pageTop,left:0,behavior:'auto'})})}
function renderPvpDeckSlots(){const el=document.getElementById('pvpDeckSlots');if(!el)return;el.innerHTML=Array.from({length:5},(_,i)=>{const c=cards.find(x=>x.id===pvpState.deck[i]);return c?`<button type="button" class="pvp-deck-slot filled" data-pvp-remove="${c.id}" title="클릭해서 덱에서 제외">${pvpCardMini(c,loadUser())}<span class="pvp-remove-hint">덱에서 빼기</span></button>`:`<div class="pvp-deck-slot empty"><div class="pvp-empty-slot"><span>${i+1}</span></div></div>`}).join('');el.querySelectorAll('[data-pvp-remove]').forEach(b=>b.onclick=async()=>{pvpState.deck=pvpState.deck.filter(id=>id!==b.dataset.pvpRemove);await rerenderPvpDeckPreserveScroll()})}
async function savePvpDeck(){if(pvpState.deck.length!==5)return alert('보유 카드 5장을 선택하세요.');try{await apiRequest('pvp/deck',{method:'POST',body:JSON.stringify({cardIds:pvpState.deck})});alert('PvP 덱이 저장되었습니다.')}catch(e){alert(e.message)}}
async function fightPvp(id){if(pvpState.energy&&!pvpState.energy.unlimited&&pvpState.energy.energy<pvpState.energy.costPerBattle)return alert('PvP 전투 횟수가 부족합니다. 30분마다 1회 충전됩니다.');if(!confirm('이 상대에게 도전할까요?'))return;const target=pvpState.opponents.find(o=>Number(o.id)===Number(id));const mine=pvpState.deck.map(cid=>cards.find(c=>c.id===cid)).filter(Boolean);if(mine.length!==5)return alert('먼저 PvP 덱 5장을 저장하세요.');const modal=document.getElementById('modal');modal.className='modal show battle-modal pvp-battle-modal';modal.innerHTML=`<div class="modal-panel battle-stage pvp-battle-stage intro"><div class="battle-backdrop"></div><div class="battle-fx-layer"></div><div class="battle-topline"><span>CNINE ASYNC PVP</span><b id="battlePhase">MATCH FOUND</b></div><div class="battle-hud"><div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>MY PVP DECK</b><span data-hp-text="team">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="team"></u><i data-hp-fill="team"></i><em>K.O.</em></div><small>시즌 ${Number(pvpState.profile?.season_score||0).toLocaleString()}점</small></div><div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${escapeHtml(target?.nickname||'OPPONENT')}</b><span data-hp-text="enemy">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="enemy"></u><i data-hp-fill="enemy"></i><em>K.O.</em></div><small>시즌 ${Number(target?.season_score||0).toLocaleString()}점</small></div></div><div class="battle-arena pvp-arena"><div class="battle-side player-side"><div class="battle-team">${mine.map((c,i)=>battleFighterHtml(c,i)).join('')}</div><small>MY TEAM</small></div><div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div><div class="battle-side enemy-side"><div id="pvpEnemyTeam" class="battle-team enemy-team pvp-enemy-loading">상대 덱 불러오는 중...</div><small>${escapeHtml(target?.nickname||'OPPONENT')}</small></div></div><div class="battle-impact"><i></i><i></i><i></i></div><div id="battleMessage" class="battle-message"><span>사나이 간 치열한 대결 중</span></div></div>`;const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('battlePhase'),count=document.getElementById('battleCountdown'),msg=document.getElementById('battleMessage');ensureBattleSoundButton(stage);try{battleTone(90,.18,'sawtooth',.035);await battleSleep(450);stage.classList.add('cards-enter');phase.textContent='MY TEAM DEPLOY';await battleSleep(700);const fightPromise=apiRequest('pvp/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,opponentId:id})});count.textContent='READY';await battleSleep(650);count.textContent='FIGHT';stage.classList.add('fight');battleTone(440,.18,'square',.075);const d=await fightPromise;count.textContent='';const enemyCards=(d.defenderDeck||[]).map(x=>({id:String(x.id),title:x.title||x.card_title||'상대 카드',name:x.name||'',grade:x.rarity||x.grade||'C',image:x.image||x.image_url||'',focusX:Number(x.focusX??x.focus_x??50),focusY:Number(x.focusY??x.focus_y??50),powerType:x.powerType||x.power_type||'',breakthroughLevel:Number(x.breakthroughLevel??x.breakthrough_level??0)}));const enemyBox=document.getElementById('pvpEnemyTeam');enemyBox.classList.remove('pvp-enemy-loading');enemyBox.innerHTML=enemyCards.map((c,i)=>battleFighterHtml(c,i,true)).join('');stage.classList.add('enemy-enter');phase.textContent='OPPONENT DEPLOY';await battleSleep(850);let myHp=100,enemyHp=100;const myWin=d.result==='WIN';const myHit=Math.max(12,Math.min(28,Math.round((Number(d.attackerPower)||1)/(Number(d.defenderPower)||1)*18)));const enemyHit=Math.max(12,Math.min(28,Math.round((Number(d.defenderPower)||1)/(Number(d.attackerPower)||1)*18)));for(let i=0;i<5;i++){battleActivateCard(stage,i,mine[i]?.grade);phase.textContent=`${mine[i]?.grade||'CARD'} MEMBER STRIKE`;stage.classList.add('player-attack');await battleSleep(220);enemyHp=Math.max(myWin&&i<4?4:0,enemyHp-myHit);battleSetHp(stage,'enemy',enemyHp);battleBurst(stage,'74%','43%',gradeOrder[mine[i]?.grade]>=gradeOrder.UR?30:18);battleDamage(stage,`-${Math.max(100,Math.round((Number(d.defenderPower)||0)*myHit/100))}`,'enemy',gradeOrder[mine[i]?.grade]>=gradeOrder.UR);battleTone(190+i*25,.1,'square',.05);await battleSleep(520);stage.classList.remove('player-attack');if(i<enemyCards.length&&(enemyHp>0||!myWin)){phase.textContent=`${enemyCards[i]?.grade||'CARD'} COUNTER`;const ef=stage.querySelector(`[data-enemy-fighter="${i}"]`);if(ef)ef.classList.add('active-attacker');await battleSleep(180);myHp=Math.max(!myWin&&i<4?4:0,myHp-enemyHit);battleSetHp(stage,'team',myHp);battleBurst(stage,'27%','43%',gradeOrder[enemyCards[i]?.grade]>=gradeOrder.UR?30:18);battleDamage(stage,`-${Math.max(100,Math.round((Number(d.attackerPower)||0)*enemyHit/100))}`,'player',gradeOrder[enemyCards[i]?.grade]>=gradeOrder.UR);battleTone(78,.18,'sawtooth',.07);await battleSleep(560);if(ef)ef.classList.remove('active-attacker')}}stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('active-attacker'));if(myWin){battleSetHp(stage,'enemy',0);battleBurst(stage,'74%','43%',56);battleDamage(stage,'FINISH!','enemy',true);battleTone(620,.32,'sawtooth',.09)}else{battleSetHp(stage,'team',0);battleBurst(stage,'26%','43%',50);battleDamage(stage,'K.O.','player',true);battleTone(48,.38,'square',.09)}await battleSleep(950);stage.classList.add(myWin?'battle-win-v863':'battle-lose-v863');phase.textContent=myWin?'PVP VICTORY':'PVP DEFEAT';battleSfx(myWin?'victory':'defeat');if(d.cubeReward&&window.showCubeDropAcquisition){try{await window.showCubeDropAcquisition(d.cubeReward)}catch(cubeFxError){console.warn('큐브 획득 연출을 표시하지 못했습니다.',cubeFxError)}}msg.innerHTML=`<strong>${myWin?'VICTORY':'DEFEAT'}</strong><span>${Number(d.attackerPower).toLocaleString()} VS ${Number(d.defenderPower).toLocaleString()}</span><div class="battle-reward-pop"><small>SEASON SCORE</small><b>${d.scoreChange>0?'+':''}${d.scoreChange}</b>${d.scoreAdjustment?`<em>${escapeHtml(d.scoreAdjustment.label)} · ${Number(d.scoreAdjustment.multiplier)}%</em>`:''}<small>PVP COIN</small><b>+${Number(d.coinReward||0).toLocaleString()}</b>${Number(d.magicReward?.amount||0)>0?`<small>마법 결정</small><b class="pvp-magic-reward">✦ +${Number(d.magicReward.amount).toLocaleString()}</b>`:''}</div><button type="button" class="btn pvp-result-confirm" id="pvpResultConfirm">PvP 화면으로 돌아가기</button><em>화면을 눌러도 돌아갑니다</em>`;pvpState.profile.season_score=d.scoreAfter;const savedPvpUser=loadUser();if(savedPvpUser){if(d.coinAfter!=null)savedPvpUser.coin=Number(d.coinAfter);if(d.magicCrystalsAfter!=null)savedPvpUser.magicCrystals=Number(d.magicCrystalsAfter);if(d.weeklyPremiumCube)savedPvpUser.weeklyPremiumCube=d.weeklyPremiumCube;saveUser(savedPvpUser)}pvpState.energy=d.energy||pvpState.energy;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();const exitPvpBattle=()=>{modal.onclick=null;modal.className='modal';modal.innerHTML='';pvpState.tab='match';renderShell('pvp')};setTimeout(()=>{modal.onclick=()=>exitPvpBattle();const confirmBtn=document.getElementById('pvpResultConfirm');if(confirmBtn)confirmBtn.onclick=e=>{e.stopPropagation();exitPvpBattle()}},250)}catch(e){if(e.energy)pvpState.energy=e.energy;msg.innerHTML=`<span>${escapeHtml(e.message)}</span><button type="button" class="btn pvp-result-confirm" id="pvpErrorConfirm">PvP 화면으로 돌아가기</button>`;const close=()=>{modal.onclick=null;modal.className='modal';modal.innerHTML='';pvpState.tab='match';renderShell('pvp')};modal.onclick=close;const b=document.getElementById('pvpErrorConfirm');if(b)b.onclick=e=>{e.stopPropagation();close()}}}
async function claimPvpReward(){try{const d=await apiRequest('pvp/reward/claim',{method:'POST'});saveUser(apiUserToLocal(d.user));alert(`${d.tier.name} 달성 보상으로 ${Number(d.rewardCoin||0).toLocaleString()}코인과 카드조각 ${Number(d.rewardShards||0).toLocaleString()}개를 받았습니다.`);renderShell('pvp')}catch(e){alert(e.message)}}
async function claimPvpRankReward(){try{const d=await apiRequest('pvp/rank-reward/claim',{method:'POST'});saveUser(apiUserToLocal(d.user));alert(`${d.rank}위 시즌 랭킹 보상으로 ${Number(d.rewardCoin||0).toLocaleString()}코인과 카드조각 ${Number(d.rewardShards||0).toLocaleString()}개를 받았습니다.`);renderShell('pvp')}catch(e){alert(e.message)}}

// V1103: 수동 전투는 전체화면 잠금을 유지하되, PVE 자동전투는 와고/iframe 바깥 스크롤 연결을 막지 않는다.
function syncBattleScreenLock(){
  const visibleModal=app.querySelector('#modal.show');
  const battleModal=visibleModal?.classList.contains('battle-modal')?visibleModal:null;
  const autoBattleOpen=Boolean(battleModal?.classList.contains('auto-battle-modal'));
  // V1110: 대장전의 경기 준비/실전 화면은 와고 iframe 바깥으로 스크롤할 수 있어야 한다.
  const captainScrollOpen=Boolean(visibleModal&&(visibleModal.classList.contains('captain-v3-battle-modal')||visibleModal.classList.contains('captain-v4-battle-modal')));
  const hardLock=Boolean(battleModal)&&!autoBattleOpen&&!captainScrollOpen;
  document.body.classList.toggle('battle-screen-open',hardLock);
  document.body.classList.toggle('auto-battle-screen-open',autoBattleOpen);
  document.documentElement.classList.toggle('auto-battle-screen-open',autoBattleOpen);
  document.body.classList.toggle('captain-battle-scroll-open',captainScrollOpen);
  document.documentElement.classList.toggle('captain-battle-scroll-open',captainScrollOpen);
}
const battleScreenObserver=new MutationObserver(syncBattleScreenLock);
battleScreenObserver.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
syncBattleScreenLock();

document.addEventListener('visibilitychange',()=>{if(document.hidden){stopRaidTimer();return;}const raid=document.getElementById('pveRaidView');if(raid&&!raid.hidden)loadRaidView();});
init();
