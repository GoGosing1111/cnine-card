const app = document.getElementById('app');
const STORAGE_KEY = 'cnine_card_user_v10';
const LEGACY_STORAGE_KEYS = ['cnine_card_user_v08', 'cnine_card_user'];
const TEST_COIN = 5000;
let cards = [];
let selectedPackId = 'basic';
let burningEventState={mode:'NONE',theme:'RED',enabled:false,generation:0,updatedAt:null,title:'숲켓몬 버닝이 발동 되었습니다',packDiscountPercent:0,equipmentBoxDiscountPercent:0,duplicateShardMultiplier:1,battleRewardMultiplier:1.5,pve:{maxEnergy:15,rechargeMinutes:2},pvp:{maxEnergy:15,rechargeMinutes:2}};
let magicSystemState={visible:false,enabled:false,ownerTest:false,magicCrystals:0,settings:{drawEnabled:false,drawCost:100},cards:[],loadouts:[]};
const magicUiState={deckType:'PVE',selectedSlot:1};

const gradeOrder = { FUR: 11, PRESTIGE: 10, LIMITED: 9, MA: 8, SSR: 7, UR: 6, HR: 5, SR: 4, R: 3, U: 2, C: 1 };
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
      originalPrice: Math.max(0, Number(row.originalPrice??row.price) || 0),
      burningDiscountPercent:Number(row.burningDiscountPercent||0),
      allowed,
      guarantee10: row.guarantee10 || row.guarantee_10 || 'R',
      guarantee20: row.guarantee20 || row.guarantee_20 || 'SR',
      limitedRate: Number(row.limitedRate || row.limited_rate || 0) || 0
    };
  });
  if (!PACKS.some(pack => pack.id === selectedPackId)) selectedPackId = PACKS[0].id;
}


const BURNING_EVENT_SYNC_KEY='cnine:burning-event-sync-v1310';
let burningEventRefreshPromise=null,burningEventLastRefreshAt=0,burningEventWatchTimer=null;
function burningEventFingerprint(state={}){
  return JSON.stringify([String(state.mode||'NONE'),String(state.theme||''),state.enabled===true,Number(state.generation||0),String(state.activatedAt||''),String(state.updatedAt||''),String(state.title||''),Number(state.pve?.maxEnergy||0),Number(state.pve?.rechargeMinutes||0),Number(state.pvp?.maxEnergy||0),Number(state.pvp?.rechargeMinutes||0),1,Number(state.packDiscountPercent||0),Number(state.equipmentBoxDiscountPercent||0),Number(state.battleRewardMultiplier||0)]);
}
function burningMode(){return burningEventState.enabled?String(burningEventState.mode||'BURNING').toUpperCase():'NONE'}
function burningBenefitText(){
  const pve=Number(burningEventState.pve?.maxEnergy||0),pvp=Number(burningEventState.pvp?.maxEnergy||0),minutes=Number(burningEventState.pve?.rechargeMinutes||0),coins=Number(burningEventState.battleRewardMultiplier||1);
  return `PVE ${pve}회 · PVP ${pvp}회 / ${minutes}분 충전 · 코인 보상 ${coins}배`;
}
function burningEventStripMarkup(){
  if(!burningEventState.enabled)return '';
  const hyper=burningMode()==='HYPER';
  return `<section class="burning-event-strip ${hyper?'hyper-burning-strip':''}"><b>${hyper?'✦':'🔥'} 숲켓몬 ${hyper?'하이퍼 버닝':'버닝'} 진행 중</b><span>${burningBenefitText()}</span></section>`;
}
function ensureBurningEventStripVisible(){
  const page=document.querySelector('.page');
  if(!page)return;
  const existing=page.querySelector('.burning-event-strip');
  if(!burningEventState.enabled){existing?.remove();return;}
  const markup=burningEventStripMarkup();
  if(!markup)return;
  const holder=document.createElement('div');holder.innerHTML=markup;const next=holder.firstElementChild;if(!next)return;
  if(existing)existing.replaceWith(next);
  else{const summary=page.querySelector('.summary-bar');if(summary)summary.insertAdjacentElement('afterend',next);else page.prepend(next)}
}
function syncBurningEventVisibleUi(){
  ensureBurningEventStripVisible();
  if(runtimeCommandContext!=='buy'||!document.querySelector('.page')||document.querySelector('#modal.show'))return;
  const y=window.scrollY;renderShell('buy');requestAnimationFrame(()=>{window.scrollTo(0,y);ensureBurningEventStripVisible()});
}
function applyBurningEventState(next={},options={}){
  const before=burningEventFingerprint(burningEventState),currentUpdated=Date.parse(String(burningEventState.updatedAt||burningEventState.activatedAt||''))||0,incomingUpdated=Date.parse(String(next.updatedAt||next.activatedAt||''))||0;
  if(currentUpdated&&(!incomingUpdated||incomingUpdated<currentUpdated)){
    PACKS=PACKS.map(pack=>{const original=Math.max(0,Number(pack.originalPrice??pack.price)||0),discount=0;return {...pack,originalPrice:original,price:Math.floor(original*(100-discount)/100),burningDiscountPercent:discount}});
    return false;
  }
  burningEventState={...burningEventState,...next};
  PACKS=PACKS.map(pack=>{const original=Math.max(0,Number(pack.originalPrice??pack.price)||0),discount=0;return {...pack,originalPrice:original,price:Math.floor(original*(100-discount)/100),burningDiscountPercent:discount}});
  const mode=burningMode(),normalActive=burningEventState.enabled===true&&mode==='BURNING',hyperActive=burningEventState.enabled===true&&mode==='HYPER';
  document.documentElement.classList.toggle('burning-event-active',normalActive);
  document.documentElement.classList.toggle('hyper-burning-event-active',hyperActive);
  const changed=before!==burningEventFingerprint(burningEventState);
  if(changed){clearApiCache('equipment/supply-box/config');clearApiCache('equipment/supply-box/config?fresh=1')}
  if(!burningEventState.enabled){const notice=document.getElementById('burningActivationNotice');if(notice){try{notice.__burningCleanup?.()}catch(_){}notice.remove()}document.documentElement.classList.remove('burning-notice-open','burning-event-active','hyper-burning-event-active');document.body.classList.remove('burning-notice-open');document.querySelectorAll('.burning-event-strip').forEach(node=>node.remove());if(changed&&options.rerender===true)queueMicrotask(syncBurningEventVisibleUi);return changed;}
  queueMicrotask(ensureBurningEventStripVisible);
  const activationToken=String(burningEventState.activatedAt||burningEventState.updatedAt||'').replace(/[^0-9TZ:+.-]/g,'').slice(0,48);
  const key=`cnine:burning-announced-v1414:${mode}:${Number(burningEventState.generation||0)}:${activationToken}`;
  if(options.announce!==false&&Number(burningEventState.generation||0)>0&&!localStorage.getItem(key)){
    localStorage.setItem(key,'1');
    setTimeout(()=>{if(burningEventState.enabled)showBurningActivationNotice()},300);
  }
  if(changed&&options.rerender===true)queueMicrotask(syncBurningEventVisibleUi);
  return changed;
}
function showBurningActivationNotice(){
  if(!burningEventState.enabled)return;
  const previous=document.getElementById('burningActivationNotice');
  if(previous){try{previous.__burningCleanup?.()}catch(_){}previous.remove()}
  const hyper=burningMode()==='HYPER';
  const el=document.createElement('div');el.id='burningActivationNotice';el.className=`burning-activation-notice${hyper?' hyper-burning-notice':''}`;
  let embedded=false;
  try{embedded=window.self!==window.top}catch(_){embedded=true}
  const mobileViewport=window.matchMedia?.('(max-width:820px)')?.matches===true||/Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));
  const startLabel=embedded&&mobileViewport?'전체화면으로 시작':hyper?'하이퍼 버닝 시작':'버닝 시작';
  el.innerHTML=`<div class="burning-notice-flames"><i></i><i></i><i></i><i></i></div><div class="burning-notice-panel" role="dialog" aria-modal="true" aria-labelledby="burningNoticeTitle"><small>SOOP ${hyper?'HYPER ':''}BURNING EVENT</small><h2 id="burningNoticeTitle">${escapeHtml(String(burningEventState.title||'숲켓몬 버닝이 발동 되었습니다').replaceAll('\uC528\uCF13\uBAAC','숲켓몬'))}</h2><p>${escapeHtml(burningBenefitText())}</p><button type="button">${startLabel}</button></div>`;
  const root=document.documentElement;
  const syncViewport=()=>{
    const viewport=window.visualViewport;
    const width=Math.max(1,Math.round(viewport?.width||window.innerWidth||document.documentElement.clientWidth||1));
    const height=Math.max(1,Math.round(viewport?.height||window.innerHeight||document.documentElement.clientHeight||1));
    el.style.setProperty('--burning-vv-left',`${Math.round(viewport?.offsetLeft||0)}px`);
    el.style.setProperty('--burning-vv-top',`${Math.round(viewport?.offsetTop||0)}px`);
    el.style.setProperty('--burning-vv-width',`${width}px`);
    el.style.setProperty('--burning-vv-height',`${height}px`);
  };
  const unlock=()=>{root.classList.remove('burning-notice-open');document.body.classList.remove('burning-notice-open');window.visualViewport?.removeEventListener('resize',syncViewport);window.visualViewport?.removeEventListener('scroll',syncViewport);window.removeEventListener('orientationchange',syncViewport)};
  const close=()=>{if(!el.isConnected){unlock();return}el.classList.remove('show');unlock();setTimeout(()=>el.remove(),260)};
  el.__burningCleanup=unlock;
  syncViewport();root.classList.add('burning-notice-open');document.body.classList.add('burning-notice-open');
  window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});
  window.addEventListener('orientationchange',syncViewport,{passive:true});
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));
  el.querySelector('button').onclick=async()=>{
    if(embedded&&mobileViewport){
      const url='https://cnine-card.pages.dev/';
      try{window.top.location.href=url;return}catch(_){}
      try{const opened=window.open(url,'_top');if(opened)return}catch(_){}
    }
    if(mobileViewport&&!document.fullscreenElement){
      const target=document.documentElement;
      try{await (target.requestFullscreen?.({navigationUI:'hide'})||target.webkitRequestFullscreen?.())}catch(_){}
    }
    close();
  };
}
function stopBurningEventWatch(){if(burningEventWatchTimer){clearTimeout(burningEventWatchTimer);burningEventWatchTimer=null}}
function pollJitter(delay,ratio=.2){const base=Math.max(1000,Number(delay)||1000),spread=base*Math.max(0,Math.min(.5,Number(ratio)||0));return Math.round(base-spread+Math.random()*spread*2)}
function scheduleBurningEventWatch(delay=burningEventState.enabled?15000:30000){
  stopBurningEventWatch();
  if(!API_MODE||!loadUser()||document.hidden)return;
  burningEventWatchTimer=setTimeout(async()=>{await refreshBurningEventState({rerender:true});scheduleBurningEventWatch()},pollJitter(Math.max(10000,Number(delay)||15000)));
}
async function refreshBurningEventState({forceFresh=false,rerender=true}={}){
  if(!API_MODE)return false;
  const now=Date.now();if(!forceFresh&&now-burningEventLastRefreshAt<2500)return false;
  if(burningEventRefreshPromise)return burningEventRefreshPromise;
  burningEventLastRefreshAt=now;
  burningEventRefreshPromise=(async()=>{
    try{
      const path=forceFresh?'burning-event/status?fresh=1':'burning-event/status';
      const d=await apiRequest(path,{}, {ttl:0,timeoutMs:7000}),next=d.burningEvent||{};
      const changed=applyBurningEventState(next,{rerender});
      if(changed)try{writeStartupSnapshot({burningEvent:next})}catch(_){}
      return changed;
    }catch(error){console.warn('버닝 상태 갱신 실패:',error);return false}
    finally{burningEventRefreshPromise=null}
  })();
  return burningEventRefreshPromise;
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
  app.innerHTML = `<div class="loading-screen"><div class="loading-orbit"></div><img src="assets/ui/cninelogo.png" class="loading-logo" alt="CNINE"><strong>숲켓몬 카드뽑기</strong><div class="loading-bar"><i></i></div></div>`;
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
function publicTitleBadgeHtml(title,{compact=true}={}){if(!title)return '';const style=String(title.stylePreset||'DEFAULT').toLowerCase().replace(/[^a-z0-9_-]/g,'');const text=escapeHtml(title.badgeText||title.name||'');return text?`<span class="public-title-badge ${compact?'compact':''} title-style-${style}">[${text}]</span>`:'';}
function publicNameHtml(nickname,title,{tag='b',compact=true}={}){const safeTag=['b','strong','span','h3'].includes(tag)?tag:'b';return `<span class="public-name-stack">${publicTitleBadgeHtml(title,{compact})}<${safeTag}>${escapeHtml(nickname||'-')}</${safeTag}></span>`;}
window.publicTitleBadgeHtml=publicTitleBadgeHtml;window.publicNameHtml=publicNameHtml;
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
  app.innerHTML = `<div class="login-wrap"><div class="login-box game-panel"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CNINE COLLECTION GAME</p><h1>숲켓몬 카드뽑기</h1><p>씨나인 멤버들의 순간을 카드로 수집하세요.</p><div class="field"><label for="nickname">와이고수 닉네임</label><input id="nickname" maxlength="20" placeholder="닉네임을 입력하세요"></div><button class="btn" id="start">처음 시작하기</button><div class="login-divider"></div><div class="field"><label for="key">개인키 로그인</label><input id="key" placeholder="CN-XXXX-XXXX-XXXX"></div><button class="btn secondary" id="login">개인키로 로그인</button><p class="login-help">개인키는 최초 생성과 로그인 화면에서만 사용됩니다.</p></div></div>`;
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
  if(tab==='character')return 'character';
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
    {id:'character',label:'장비·칭호'},
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
  const moreActive=['attendance','dailyquest','messages','rank','mineral','inventory','character'].includes(tab);
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
        <button type="button" data-mobile-tab="character"><i>⚔</i><b>장비·칭호</b></button>
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


const STANDALONE_GAME_URL='https://cnine-card.pages.dev/';
function bindFullscreenPlayLink(header){
  const link=header?.querySelector('[data-fullscreen-play]');
  if(!link)return;
  const mobileViewport=window.matchMedia?.('(max-width:820px)')?.matches===true||/Android|iPhone|iPad|iPod/i.test(String(navigator.userAgent||''));
  let embedded=false;
  try{embedded=window.self!==window.top}catch(_){embedded=true}
  link.target=embedded||mobileViewport?'_top':'_blank';
  link.addEventListener('click',event=>{
    if(!(embedded||mobileViewport))return;
    const url=link.href||STANDALONE_GAME_URL;
    let navigated=false;
    try{
      if(window.top&&window.top!==window){window.top.location.href=url;navigated=true}
      else{window.location.href=url;navigated=true}
    }catch(_){}
    if(!navigated){
      try{const opened=window.open(url,'_blank','noopener,noreferrer');navigated=Boolean(opened)}catch(_){}
    }
    if(!navigated){
      try{window.location.assign(url);navigated=true}catch(_){}
    }
    if(navigated){event.preventDefault();event.stopPropagation()}
  },{capture:true});
}

let shellRenderSeq=0;
function renderShell(tab) {
  // V1298: 화면을 떠난 뒤 도착한 레이드 상태 응답/결과 타이머가 새 화면을 다시 덮지 못하게 먼저 무효화한다.
  try{invalidateRaidUiState({clearSelection:true,stopClaimRetry:true})}catch(_){}
  const renderSeq=++shellRenderSeq;
  document.body.classList.remove('mobile-menu-open');
  if(tab==='pvp'&&!pvpFeatureEnabled)tab='buy';
  runtimeCommandContext=tab;
  const user = loadUser();
  if (!user) return renderLogin();
  const views = { buy: buyView, dex: dexView, evolution:(typeof window.evolutionView==='function'?window.evolutionView:buyView), battle: battleView, pvp: pvpView, magic: magicView, character:(...args)=>(typeof window.characterView==='function'?window.characterView(...args):'<section id="characterSystemRoot" class="character-system-root-v1249"><div class="frame-loading-v1249"><span></span><b>장비·칭호 화면을 준비하는 중...</b></div></section>'), attendance: attendanceView, dailyquest: dailyQuestView, messages: messagesView, rank: rankView, mineral: mineralExchangeView, inventory: inventoryView };
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
    <button class="main-nav-item ${tab==='character'?'active':''}" type="button" data-tab="character"><span class="main-nav-icon">⚔</span><b>장비·칭호</b></button>
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
  app.innerHTML = `<main class="page"><div class="ambient-lines"></div><header class="header"><div class="brand"><img class="brand-logo" src="assets/ui/cninelogo.png" alt="CNINE"><div><p class="eyebrow">CNINE CARD COLLECTION</p><h1>숲켓몬 카드뽑기</h1></div></div>${navHtml}</header>${mobileNavigationHtml(tab)}${(views[tab]||buyView)(user)}</main><div id="modal" class="modal"></div>`;
  const header=document.querySelector('.header');header?.insertAdjacentHTML('beforeend','<a class="fullscreen-play-link" data-fullscreen-play href="https://cnine-card.pages.dev/" target="_top" rel="noopener noreferrer" aria-label="숲켓몬 큰 화면으로 열기" title="와고 화면에서 벗어나 크게 보기"><span>⛶</span><b>크게 보기</b></a>');bindFullscreenPlayLink(header);
  const syncNavOpenState=()=>header?.classList.toggle('nav-menu-open',Boolean(document.querySelector('.main-nav-group.open')));
  const closeNavGroups=(except=null)=>{document.querySelectorAll('.main-nav-group.open').forEach(group=>{if(group!==except){group.classList.remove('open');group.querySelector('.main-nav-trigger')?.setAttribute('aria-expanded','false')}});syncNavOpenState()};
  document.querySelectorAll('.main-nav [data-tab]').forEach(button=>button.onclick=()=>{closeNavGroups();renderShell(button.dataset.tab)});
  document.querySelectorAll('.main-nav-trigger').forEach(button=>button.onclick=event=>{event.stopPropagation();const group=button.closest('.main-nav-group'),willOpen=!group.classList.contains('open');closeNavGroups(group);group.classList.toggle('open',willOpen);button.setAttribute('aria-expanded',String(willOpen));syncNavOpenState()});
  document.addEventListener('click',event=>{if(!event.target.closest('.main-nav'))closeNavGroups()},{once:true});
  bindMobileNavigation();
  bindView(tab);
  const deferShellLoad=(delay,task)=>setTimeout(()=>{if(renderSeq!==shellRenderSeq)return;try{const result=task();if(result&&typeof result.catch==='function')result.catch(()=>{})}catch(_){}},delay);
  // 공통 상단 정보는 한 번의 경량 요청으로 묶고 30초 캐시를 사용한다.
  deferShellLoad(80,loadShellSummary);
  if(API_MODE&&API_TOKEN)scheduleRuntimeCommandPoll(runtimeCommandPollDelay());
}

function summaryBar(user) {
  const coin=Number(user.coin||0).toLocaleString(),shards=Number(user.cardShards||0).toLocaleString(),crystals=Number(user.magicCrystals??magicSystemState.magicCrystals??0).toLocaleString();
  return `<section class="summary-bar">
    <div class="summary-card login-summary"><span class="summary-label">내 계정</span><div class="login-summary-row"><i class="login-dot"></i><b>${escapeHtml(user.nickname)}</b><button id="playerAccountBtn" type="button">내 정보</button></div></div>
    <div class="summary-card currency-summary"><span class="summary-label">보유 재화</span><div class="currency-list"><div class="currency-row coin"><i>◇</i><span>코인</span><b>${coin}</b></div><div class="currency-row shard"><i>✣</i><span>카드 조각</span><b>${shards}</b></div><div class="currency-row crystal"><i>✦</i><span>마법 결정</span><b>${crystals}</b></div></div></div>
    <div class="summary-card collection-summary"><span class="summary-label">카드 수집</span><div class="collection-summary-value"><b>${ownedIds(user).size}</b><i>/</i><strong>${cards.length}</strong></div><small>전체 도감 수집 현황</small></div>
    <button type="button" class="summary-card inventory-summary" id="inventorySummary"><i class="inventory-bag-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 8V6a5 5 0 0 1 10 0v2M5 8h14l1 13H4L5 8Z"/></svg></i><span class="inventory-summary-copy"><small class="summary-label">보관함</small><b>인벤토리</b><em id="inventorySummaryMeta">보유 내역 확인</em></span><strong id="inventorySummaryBadge" hidden>NEW</strong></button>
  </section><section class="high-grade-feed" aria-live="polite"><span class="high-grade-label">MA 등급 이상 획득 소식</span><div class="high-grade-viewport"><div id="highGradeTrack" class="high-grade-track"><span class="high-grade-empty">최근 MA 등급 이상 획득 기록을 불러오는 중...</span></div></div></section><section class="high-grade-feed equipment-feed" aria-live="polite"><span class="high-grade-label equipment-feed-label">신화 장비 획득 소식</span><div class="high-grade-viewport"><div id="equipmentAcquisitionTrack" class="high-grade-track equipment-feed-track"><span class="high-grade-empty">최근 신화 장비 획득 기록을 불러오는 중...</span></div></div></section>`;
}

async function loadShellSummary(){
  const inventoryCard=document.getElementById('inventorySummary');if(inventoryCard)inventoryCard.onclick=()=>renderShell('inventory');
  if(!API_MODE)return;
  try{
    const d=await apiRequest('shell/summary',{}, {ttl:30000,timeoutMs:7000});
    const inventory=d.inventory||{},meta=document.getElementById('inventorySummaryMeta'),badge=document.getElementById('inventorySummaryBadge');
    if(meta)meta.textContent=Number(inventory.totalQuantity)>0?`보유 ${Number(inventory.totalQuantity).toLocaleString()}개 · ${Number(inventory.ownedTypes)}종`:'획득한 특별 보관품 없음';
    if(badge){badge.hidden=!Number(inventory.unseenTotal);badge.textContent=Number(inventory.unseenTotal)>99?'99+':`NEW ${Number(inventory.unseenTotal||0)}`}
    const highTrack=document.getElementById('highGradeTrack'),highItems=Array.isArray(d.highGradeItems)?d.highGradeItems:[];
    if(highTrack){if(!highItems.length)highTrack.innerHTML='<span class="high-grade-empty">아직 MA 등급 이상 획득 기록이 없습니다.</span>';else{const messages=highItems.map(item=>`<span class="high-grade-item feed-grade-${escapeHtml(item.rarity)}"><b>"${escapeHtml(item.nickname)}"</b> 님이 <strong>${escapeHtml(item.card_title)} [${escapeHtml(item.rarity)}]</strong> 카드를 획득했습니다.</span>`).join('');highTrack.innerHTML=messages+messages;highTrack.classList.toggle('static',highItems.length===1)}}
    const equipmentTrack=document.getElementById('equipmentAcquisitionTrack'),equipmentItems=Array.isArray(d.equipmentItems)?d.equipmentItems:[];
    if(equipmentTrack){if(!equipmentItems.length)equipmentTrack.innerHTML='<span class="high-grade-empty">아직 신화 등급 장비 획득 기록이 없습니다.</span>';else{const messages=equipmentItems.map(item=>`<span class="high-grade-item equipment-feed-item rarity-mythic"><b>"${escapeHtml(item.nickname)}"</b> 님이 <strong>${escapeHtml(item.equipment_name)} [신화]</strong> 장비를 획득했습니다.<em>${escapeHtml(equipmentFeedSourceLabel(item.source))}</em></span>`).join('');equipmentTrack.innerHTML=messages+messages;equipmentTrack.classList.toggle('static',equipmentItems.length===1)}}
  }catch(error){console.warn('공통 화면 요약 조회 실패:',error)}
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

function equipmentFeedSourceLabel(source){
  const key=String(source||'').trim().toUpperCase();
  return ({SUPPLY_BOX:'장비상자',ADMIN:'관리자 지급',PVE:'PVE',PVE_AUTO:'자동전투',TOWER:'무한의탑',RAID:'레이드',RIFT:'균열',PVP:'PVP',CAPTAIN:'대장전'}[key]||key||'장비 획득');
}

async function loadRecentEquipmentFeed(){
  const track=document.getElementById('equipmentAcquisitionTrack');
  if(!track)return;
  if(!API_MODE){track.innerHTML='<span class="high-grade-empty">현재는 실시간 장비 소식을 불러올 수 없습니다.</span>';return;}
  try{
    const data=await apiRequest('recent-equipment',{}, {ttl:1000});
    const items=Array.isArray(data.items)?data.items:[];
    if(!items.length){track.innerHTML='<span class="high-grade-empty">아직 신화 등급 장비 획득 기록이 없습니다.</span>';return;}
    const messages=items.map(item=>`<span class="high-grade-item equipment-feed-item rarity-mythic"><b>"${escapeHtml(item.nickname)}"</b> 님이 <strong>${escapeHtml(item.equipment_name)} [신화]</strong> 장비를 획득했습니다.<em>${escapeHtml(equipmentFeedSourceLabel(item.source))}</em></span>`).join('');
    track.innerHTML=messages+messages;
    track.classList.toggle('static',items.length===1);
  }catch(error){track.innerHTML='<span class="high-grade-empty">장비 획득 소식을 불러오지 못했습니다.</span>';}
}

function packImagePath(pack) {
  const files = { basic: 'standard-pack.png', advanced: 'advanced-pack.png', premium: 'premium-pack.png', pickup: 'limited-pack.png' };
  return `assets/ui/packs/${files[pack.id] || files[pack.theme] || files.basic}?v=1018-standard-pack-repair`;
}

function packSelector() {
  return `<section class="pack-selector"><div class="pack-selector-head"><div><p class="eyebrow">SELECT CARD PACK</p><h2>카드팩 선택</h2></div><span>팩마다 가격과 등장 범위가 다릅니다.</span></div><div class="pack-list">${PACKS.map(pack => `<button class="pack-choice pack-choice-${pack.theme} ${pack.id===selectedPackId?'active':''}" data-pack-id="${pack.id}"><span class="mini-pack ${pack.theme}"><img src="${packImagePath(pack)}" alt="${escapeHtml(pack.name)}"><i></i></span><strong>${pack.name}</strong><small>${pack.description}</small><em>${pack.range} · 1장 ${pack.originalPrice>pack.price?`<s>${pack.originalPrice}</s> <b>${pack.price}코인</b>`:`${pack.price}코인`}</em></button>`).join('')}</div></section>`;
}

function supplyBoxShopMarkup(config=null){
  const loading=!config,enabled=config?.enabled!==false&&config?.shopEnabled!==false,price=Number(config?.shopPrice||0),original=Number(config?.originalShopPrice??price),discount=Number(config?.promotionDiscountPercent||0),balance=Number(config?.balance||0),discounted=discount>0&&original>price;
  const unitPrice=loading?'확인 중':discounted?`<s>${original.toLocaleString()}</s> <b>${price.toLocaleString()}코인</b>`:`<b>${price.toLocaleString()}코인</b>`;
  return `<section class="equipment-supply-shop${discounted?' promotion-discount':''}" id="equipmentSupplyShop"><div class="equipment-supply-art"><span></span><img src="assets/ui/packs/supply-high.jpeg?v=1247" alt="장비 보급상자"></div><div class="equipment-supply-copy"><small>EQUIPMENT SUPPLY</small><h3>장비 보급상자 ${discounted?`<em>${discount}% OFF</em>`:''}</h3><p>장비·카드 조각·코인 중 하나를 획득합니다.<br>PVE·PVP 콘텐츠에서도 확률적으로 획득할 수 있습니다.</p><div class="equipment-supply-meta"><span>보유 <b>${loading?'—':balance.toLocaleString()}개</b></span><span>개당 ${unitPrice}</span></div></div><div class="equipment-supply-actions">${loading?'<button type="button" disabled>판매 정보 확인 중</button>':enabled?`<button type="button" data-supply-buy="1">1개 구매 <b>${price.toLocaleString()}</b></button><button type="button" class="hot" data-supply-buy="10">10개 구매 <b>${(price*10).toLocaleString()}</b></button>`:'<button type="button" disabled>현재 판매 중지</button>'}<small>구매한 보급상자는 인벤토리에서 최대 10개까지 개방</small></div></section>`;
}
async function loadSupplyBoxShop(){
  const root=document.getElementById('equipmentSupplyShop');if(!root||!API_MODE)return;
  try{const config=await apiRequest('equipment/supply-box/config?fresh=1',{}, {ttl:0});root.outerHTML=supplyBoxShopMarkup(config);document.querySelectorAll('[data-supply-buy]').forEach(button=>button.onclick=()=>purchaseSupplyBoxes(Number(button.dataset.supplyBuy),button));}
  catch(error){root.innerHTML='<div class="equipment-supply-error"><b>보급상자 판매 정보를 불러오지 못했습니다.</b><button type="button" id="supplyShopRetry">다시 확인</button></div>';document.getElementById('supplyShopRetry')?.addEventListener('click',loadSupplyBoxShop)}
}
async function purchaseSupplyBoxes(count,button){
  if(!API_MODE)return;
  const requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if(button){button.disabled=true;button.dataset.label=button.innerHTML;button.textContent='구매 처리 중';}
  try{
    const result=await apiRequest('equipment/supply-box/purchase',{method:'POST',body:JSON.stringify({count,requestId})});
    const user=loadUser();user.coin=Number(result.coin??user.coin);saveUser(user);clearApiCache('inventory');clearApiCache('shell/summary');clearApiCache('equipment/supply-box/config');clearApiCache('equipment/supply-box/config?fresh=1');
    showSupplyNotice(`장비 보급상자 ${Number(result.count).toLocaleString()}개 구매 완료`);renderShell('buy');
  }catch(error){showSupplyNotice(error.message||'보급상자 구매에 실패했습니다.',true);if(button){button.disabled=false;button.innerHTML=button.dataset.label||'다시 구매';}}
}
function vehicleDrawShopMarkup(config=null){
  const loading=!config,enabled=config?.settings?.enabled!==false&&config?.shop?.enabled!==false,price=Number(config?.shop?.unitPrice||5000),balance=Number(config?.ticketQuantity||0),image=config?.settings?.ticketImage||'assets/items/vehicle-draw-ticket-v1391.png';
  return `<section class="equipment-supply-shop vehicle-ticket-shop" id="vehicleDrawTicketShop"><div class="equipment-supply-art"><span></span><img src="${escapeHtml(image)}" alt="이동수단 뽑기권"></div><div class="equipment-supply-copy"><small>VEHICLE DRAW TICKET</small><h3>이동수단 뽑기팩</h3><p>이동수단 전용 뽑기권을 구매합니다.<br>구매한 뽑기권은 인벤토리에서 사용할 수 있습니다.</p><div class="equipment-supply-meta"><span>보유 <b>${loading?'확인 중':balance.toLocaleString()}개</b></span><span>개당 <b>${price.toLocaleString()}코인</b></span></div></div><div class="equipment-supply-actions">${loading?'<button type="button" disabled>판매 정보 확인 중</button>':enabled?`<button type="button" data-vehicle-ticket-buy="1">1개 구매 <b>${price.toLocaleString()}</b></button><button type="button" class="hot" data-vehicle-ticket-buy="10">10개 구매 <b>${(price*10).toLocaleString()}</b></button>`:'<button type="button" disabled>현재 판매 중지</button>'}<button type="button" class="vehicle-shop-open" data-vehicle-draw-open>보유권으로 바로 뽑기</button><small>구매 후 이 화면에서 바로 개봉 가능</small></div></section>`;
}
async function loadVehicleDrawShop(){
  const root=document.getElementById('vehicleDrawTicketShop');if(!root||!API_MODE)return;
  try{const config=await apiRequest('vehicle-draw/config',{}, {ttl:0});root.outerHTML=vehicleDrawShopMarkup(config);document.querySelectorAll('[data-vehicle-ticket-buy]').forEach(button=>button.onclick=()=>purchaseVehicleDrawTickets(Number(button.dataset.vehicleTicketBuy),button));document.querySelector('[data-vehicle-draw-open]')?.addEventListener('click',()=>window.VehicleDrawV1388?.open(Number(config.ticketQuantity||0)));}
  catch(error){root.innerHTML='<div class="equipment-supply-error"><b>이동수단 뽑기팩 판매 정보를 불러오지 못했습니다.</b><button type="button" id="vehicleShopRetry">다시 확인</button></div>';document.getElementById('vehicleShopRetry')?.addEventListener('click',loadVehicleDrawShop)}
}
async function purchaseVehicleDrawTickets(count,button){
  if(!API_MODE)return;
  const requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if(button){button.disabled=true;button.dataset.label=button.innerHTML;button.textContent='구매 처리 중';}
  try{
    const result=await apiRequest('vehicle-draw/purchase',{method:'POST',body:JSON.stringify({count,requestId})});
    const user=loadUser();user.coin=Number(result.coin??user.coin);saveUser(user);clearApiCache('inventory');clearApiCache('shell/summary');clearApiCache('vehicle-draw/config');
    showSupplyNotice(`이동수단 뽑기권 ${Number(result.count).toLocaleString()}개 구매 완료`);renderShell('buy');
  }catch(error){showSupplyNotice(error.message||'이동수단 뽑기권 구매에 실패했습니다.',true);if(button){button.disabled=false;button.innerHTML=button.dataset.label||'다시 구매';}}
}
function showSupplyNotice(message,error=false){const old=document.querySelector('.supply-action-toast');if(old)old.remove();const toast=document.createElement('div');toast.className=`supply-action-toast${error?' error':''}`;toast.textContent=message;document.body.appendChild(toast);requestAnimationFrame(()=>toast.classList.add('show'));setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),220)},error?2600:1500)}
function buyView(user) {
  const pack = getPack(selectedPackId),weekly=user.weeklyPremiumCube||{currentRate:.1,earnedCount:0,weeklyLimit:2};
  return `${summaryBar(user)}${burningEventStripMarkup()}${packSelector()}<section class="game-hero pack-theme-${pack.theme}"><div class="hero-copy"><p class="eyebrow">${pack.subtitle}</p><h2>${escapeHtml(pack.name)}을<br><em>개봉하세요</em></h2><p>${escapeHtml(pack.description)}<br>10연속 ${pack.guarantee10} 이상 1장 · 20연속 ${pack.guarantee20} 이상 1장 보장</p><div class="draw-options"><button class="btn draw" data-pack-id="${pack.id}" data-count="1" data-cost="${pack.price}"><small>1 CARD</small>${pack.price}코인</button><button class="btn draw hot" data-pack-id="${pack.id}" data-count="10" data-cost="${pack.price*10}"><small>10 CARDS · ${pack.guarantee10}+</small>${(pack.price*10).toLocaleString()}코인</button><button class="btn draw premium-btn" data-pack-id="${pack.id}" data-count="20" data-cost="${pack.price*20}"><small>20 CARDS · ${pack.guarantee20}+</small>${(pack.price*20).toLocaleString()}코인</button><button class="btn secondary auto-draw-config" data-pack-id="${pack.id}" data-default-count="20"><small>OFFICIAL AUTO DRAW</small>자동 뽑기 설정</button></div></div><div class="hero-pack-zone"><div class="pack-aura"></div>${packArt(pack)}</div></section>${supplyBoxShopMarkup()}${vehicleDrawShopMarkup()}<section class="weekly-premium-cube-status"><div class="weekly-premium-cube-visual" aria-hidden="true"><span class="weekly-premium-cube-glow"></span><img src="assets/ui/packs/premium-cube.png?v=1218-soop-cube-premium" alt=""></div><div class="weekly-premium-cube-copy"><small>WEEKLY PREMIUM CUBE</small><h3>프리미엄 큐브 주간 보장</h3><p>PVE · 무한의탑 · PVP<br>참여 시 확률이 상승합니다.</p><div class="weekly-premium-cube-progress"><span style="width:${Math.min(100,Math.max(0,Number(weekly.currentRate||.1)/Math.max(.1,Number(weekly.maxRate||10))*100))}%"></span></div></div><div class="weekly-premium-cube-values"><span><small>현재 획득 확률</small><b>${Number(weekly.currentRate||.1).toFixed(1)}%</b></span><span><small>이번 주 획득</small><b>${Number(weekly.earnedCount||0)} / ${Number(weekly.weeklyLimit||2)}개</b></span></div></section>`;
}

function recentCards(user) {
  const items = user.history.slice(-4).reverse();
  if (!items.length) return '<div class="empty-recent">아직 획득한 카드가 없습니다.<br>첫 카드를 뽑아보세요.</div>';
  return `<div class="recent-grid">${items.map(item => { const c=cards.find(x=>x.id===item.cardId); if(!c)return''; return `<button class="recent-item" data-card-id="${c.id}"><img src="${c.image}" style="object-position:${c.focusX}% ${c.focusY}%"><span><b>${escapeHtml(c.title)}${c.uniqueAbility?`<em class="recent-unique-tag ${uniqueAbilityTypeInfo(c).typeClass}" data-card-profile="${escapeHtml(String(c.id))}">◇ ${escapeHtml(uniqueAbilityTypeInfo(c).typeLabel)}</em>`:''}</b><small>${c.grade}${powerTypeIndicator(c)?` · ${powerTypeIndicator(c)}`:''}${item.duplicate?' · 보유중':' · NEW'}</small></span></button>`; }).join('')}</div>`;
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
  return `${summaryBar(user)}<section class="dex-cover"><div><p class="eyebrow">MY COLLECTION ALBUM</p><h2>숲켓몬 도감</h2><p>멤버별 앨범을 펼쳐 수집한 카드와 고유 능력을 확인하세요.</p>${uniqueCount?`<button type="button" class="dex-unique-legend" data-scroll-unique="1"><i>◇</i><span><b>고유 능력 카드 ${uniqueCount}장</b><small>카드 이름 오른쪽의 유형 배지를 누르면 능력치 프로필이 바로 열립니다.</small></span></button>`:''}</div><div class="dex-cover-actions-v1359"><div class="dex-total"><b>${owned.size}</b><span>/ ${cards.length} CARDS</span></div><button type="button" id="highGradeRerollBtn" class="high-grade-reroll-btn-v1354" hidden><span>♻</span><b>고등급 재뽑기</b><small>등급별 계정 1회</small></button></div></section><div class="dex-toolbar"><div class="dex-search"><input id="dexSearch" value="${escapeHtml(prefs.search||'')}" placeholder="카드명 또는 멤버 검색"><select id="gradeFilter"><option value="">전체 등급</option>${['FUR','PRESTIGE','LIMITED','MA','SSR','UR','HR','SR','R','U','C'].map(g=>`<option ${prefs.grade===g?'selected':''}>${g}</option>`).join('')}</select><select id="dexSort"><option value="default" ${prefs.sort==='default'?'selected':''}>기본 순서</option><option value="name" ${prefs.sort==='name'?'selected':''}>멤버 이름순</option><option value="owned" ${prefs.sort==='owned'?'selected':''}>보유 카드 많은순</option><option value="rate" ${prefs.sort==='rate'?'selected':''}>수집률 높은순</option><option value="count" ${prefs.sort==='count'?'selected':''}>전체 카드 많은순</option></select></div><div class="dex-toolbar-actions-v1356"><button type="button" id="favoriteMemberOnly" class="dex-favorite-filter ${prefs.favoriteOnly?'active':''}" aria-pressed="${prefs.favoriteOnly?'true':'false'}">★ 즐겨찾기 멤버만</button></div></div><div class="dex-guide"><span>멤버 이름 옆 별을 눌러 즐겨찾기</span><span>${uniqueCount?'유형 배지 선택 시 카드 능력치 확인':'즐겨찾기 멤버는 항상 위에 표시'}</span></div><div id="dexSections">${members.map((item,index)=>dexSection(item,owned,index,prefs)).join('')}</div>`;
}
function dexSection(item,owned,index=0,prefs=loadDexPrefs()) {
  const {name,list,got}=item,favorite=(prefs.favoriteMembers||[]).includes(name);
  return `<section class="dex-section ${index>1?'collapsed':''} ${favorite?'favorite-member':''}" data-member="${escapeHtml(name)}" data-total="${list.length}" data-owned="${got}"><div class="dex-section-head"><button type="button" class="dex-fold-button"><span><i class="fold-icon">⌄</i><strong>${escapeHtml(name)}</strong><small>COLLECTION ALBUM</small></span><b>${got} / ${list.length}</b></button><button type="button" class="dex-member-favorite ${favorite?'active':''}" data-favorite-member="${escapeHtml(name)}" aria-label="${escapeHtml(name)} 즐겨찾기" aria-pressed="${favorite?'true':'false'}">★</button></div><div class="album-grid">${list.map(c=>cardHtml(c,owned.has(c.id),'small dex-card-display')).join('')}</div></section>`;
}


function battleView(user){
  const ownerRaid=`<div class="pve-mode-tabs"><button class="pve-mode-btn active" data-pveModeLegacy="false" data-pve-mode="deck">덱 편성</button><button class="pve-mode-btn" data-pve-mode="hunt">몬스터 토벌</button><button class="pve-mode-btn rift-tab" data-pve-mode="rift"><span>✦</span> 균열 원정</button><button class="pve-mode-btn" data-pve-mode="raid">월드 레이드</button></div>`;
  return `${summaryBar(user)}${ownerRaid}<div id="pveHuntView" class="pve-hunt-redesign pve-hunt-v1179"><nav class="mobile-pve-tabs" aria-label="모바일 PVE 메뉴"><button type="button" data-pve-tab="deck">출전 덱</button><button type="button" data-pve-tab="cards">덱 편성실</button><button type="button" data-pve-tab="monsters">몬스터 토벌</button></nav><section class="battle-cover pve-hunt-cover"><div><p class="eyebrow" id="pveHeroEyebrow">CNINE PVE DECK</p><h2 id="pveHeroTitle">PvE 덱 편성</h2><p id="pveHeroDescription">PVP 덱 편성과 같은 카드 프레임 방식으로 출전 카드 5장을 구성합니다. 몬스터 토벌 화면에서는 편성 UI 없이 토벌 존만 사용합니다.</p></div><div class="battle-cover-side"><div class="battle-energy-card"><div><span>⚔ 전투 횟수</span><b id="battleEnergyCount">- / -</b></div><div class="battle-energy-track"><i id="battleEnergyFill"></i></div><small id="battleEnergyTimer">불러오는 중...</small></div><div class="battle-total pve-total-card"><span>현재 출전 전투력</span><b id="battleDeckPower">0</b><small id="battleDeckStatusText">아직 5장 편성이 완료되지 않았습니다</small></div></div></section><section class="pve-command-layout pve-command-layout-v1179"><section class="battle-panel pve-squad-panel pve-mobile-pane" data-pve-pane="deck"><div class="panel-title pve-panel-title"><div><p class="eyebrow">PVE DEPLOY DECK</p><h2>PvE 출전 덱</h2><small>항상 좌측 고정으로 보이는 전용 출전 덱 슬롯입니다.</small></div><div class="pve-deck-actions"><button type="button" class="pve-deck-btn save" id="saveBattleDeck"><span>💾</span> 덱 저장</button><button type="button" class="pve-deck-btn reset" id="clearBattleDeck"><span>↺</span> 덱 리셋</button></div></div><div class="pve-squad-summary"><article><small>편성 수</small><b id="battleDeckCount">0 / 5</b></article><article><small>출전 상태</small><b id="battleDeckReady">편성 중</b></article></div><div id="battleDeck" class="battle-deck pve-squad-grid pvp-deck-slots"></div><button type="button" class="pve-mobile-next" data-pve-tab="cards">덱 편성실 열기</button></section><section class="battle-panel pve-builder-panel pve-mobile-pane" data-pve-pane="cards"><div class="pve-mobile-pane-title pve-panel-title"><div><p class="eyebrow">PVE DECK BUILDER</p><h2>덱 편성실</h2><small>보유 카드에서 출전 카드 5장을 조합하세요.</small></div><button type="button" data-pve-tab="deck">출전 덱 보기</button></div><div class="pve-builder-helper"><span>카드를 누르면 출전 덱에 추가됩니다.</span><b>중복 선택 불가 · 선택된 카드는 자동 잠금</b></div><div class="deck-filter-toolbar pve-deck-filter-toolbar"><label class="deck-filter-search"><i>⌕</i><input id="pveDeckSearch" type="search" autocomplete="off" placeholder="카드명 또는 멤버 검색"></label><label><small>등급</small><select id="pveDeckGrade"><option value="ALL">전체 등급</option>${['FUR','PRESTIGE','LIMITED','MA','SSR','UR','HR','SR','R','U','C'].map(grade=>`<option value="${grade}">${grade}</option>`).join('')}</select></label><label><small>유형</small><select id="pveDeckType"><option value="ALL">전체 유형</option><option value="ATTACK">공격형</option><option value="DEFENSE">방어형</option><option value="SPEED">속도형</option><option value="HP">HP형</option><option value="NONE">기본형</option></select></label><label><small>정렬</small><select id="pveDeckSort"><option value="POWER_DESC">전투력 높은순</option><option value="GRADE_DESC">등급 높은순</option><option value="NAME_ASC">이름순</option></select></label><div class="deck-filter-result"><span id="pveDeckResultCount">0장</span><button type="button" id="pveDeckFilterReset">초기화</button></div></div><div id="battleCards" class="battle-card-picker pve-builder-list pvp-card-picker grouped"><div class="empty-recent">전투 정보를 불러오는 중...</div></div></section><aside class="battle-panel pve-target-panel pve-mobile-pane" data-pve-pane="monsters"><div class="panel-title pve-panel-title"><div><p class="eyebrow">MONSTER HUNT ZONE</p><h2>몬스터 토벌</h2><small>기존 2번째 화면 전체를 몬스터 토벌 존으로 사용합니다.</small></div></div><div id="battleMonsters" class="battle-monsters"></div></aside></section><nav class="mobile-pve-quickbar" aria-label="PVE 빠른 이동"><button type="button" data-pve-tab="deck"><span>🃏</span>출전덱</button><button type="button" data-pve-tab="cards"><span>🛠</span>편성실</button><button type="button" data-pve-tab="monsters"><span>👹</span>토벌</button></nav></div><div id="pveRiftView" class="pve-rift-view" hidden><div class="rift-loading"><i></i><b>차원의 균열을 확인하는 중...</b></div></div><div id="pveRaidView" class="pve-raid-view" hidden></div>`;
}

const PVE_VIEW_MODE_KEY='cnine_pve_view_mode';
function getPveViewMode(){try{const v=localStorage.getItem(PVE_VIEW_MODE_KEY);return v==='hunt'||v==='deck'?v:'deck'}catch{return 'deck'}}
function setPveViewMode(mode){try{localStorage.setItem(PVE_VIEW_MODE_KEY,mode==='hunt'?'hunt':'deck')}catch(_){}}
function applyPveViewMode(mode=getPveViewMode()){
  const hunt=document.getElementById('pveHuntView');
  document.querySelectorAll('.pve-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.pveMode===mode));
  if(!hunt)return;
  hunt.classList.toggle('pve-view-deck',mode==='deck');
  hunt.classList.toggle('pve-view-hunt',mode==='hunt');
  const eyebrow=document.getElementById('pveHeroEyebrow'),title=document.getElementById('pveHeroTitle'),description=document.getElementById('pveHeroDescription');
  if(mode==='hunt'){
    if(eyebrow)eyebrow.textContent='CNINE MONSTER HUNT';
    if(title)title.textContent='몬스터 토벌';
    if(description)description.textContent='저장된 PvE 덱으로 토벌 목표를 선택합니다. 넓어진 화면 전체를 몬스터 정보·난이도·보상·전투 시작에 사용합니다.';
  }else{
    if(eyebrow)eyebrow.textContent='CNINE PVE DECK';
    if(title)title.textContent='PvE 덱 편성';
    if(description)description.textContent='PVP 덱 편성과 같은 카드 프레임 방식으로 출전 카드 5장을 구성합니다. 카드 유형은 카드 안의 간결한 배지 하나로만 표시됩니다.';
  }
  if(isMobilePve()){
    const current=getMobilePveTab();
    if(mode==='hunt'&&current!=='monsters')setMobilePveTab('monsters',{scroll:false});
    if(mode==='deck'&&current==='monsters')setMobilePveTab('deck',{scroll:false});
  }
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
let battleState={config:null,monsters:[],selectedMonster:null,deck:[],characterBonus:{equipmentPve:0,equipmentPvp:0,garagePve:0,garagePvp:0,titlePve:0,pve:0,pvp:0},energy:null,energyTimer:null,serverOffset:0,restoreMonsterCursor:false};

function stopBattleEnergyTimer(){if(battleState.energyTimer){clearInterval(battleState.energyTimer);battleState.energyTimer=null}}
function battleEnergyText(ms){const sec=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function renderBattleEnergy(){const e=battleState.energy,count=document.getElementById('battleEnergyCount'),fill=document.getElementById('battleEnergyFill'),timer=document.getElementById('battleEnergyTimer');if(!e||!count)return;count.textContent=e.unlimited?'∞ 무제한':`${e.energy} / ${e.maxEnergy}`;if(fill)fill.style.width=`${e.unlimited?100:Math.max(0,Math.min(100,e.energy/e.maxEnergy*100))}%`;if(timer){if(e.unlimited)timer.textContent='무제한 적용';else if(e.energy>=e.maxEnergy)timer.textContent='충전 완료';else if(e.nextRechargeAt){const remain=Date.parse(e.nextRechargeAt)-(Date.now()+battleState.serverOffset);timer.textContent=remain<=0?'충전 갱신 중...':`다음 충전 ${battleEnergyText(remain)}`;}else timer.textContent='충전 대기';}const start=document.getElementById('battleStart');if(start){const noEnergy=!e.unlimited&&e.energy<e.costPerBattle,autoChecked=document.getElementById('battleAuto')?.checked;start.disabled=battleState.deck.length!==5||!battleState.selectedMonster||noEnergy;start.textContent=noEnergy?'전투 횟수 부족':autoChecked?'남은 횟수 자동전투':'전투 시작';}}
function startBattleEnergyTimer(){stopBattleEnergyTimer();renderBattleEnergy();battleState.energyTimer=setInterval(()=>{if(!document.getElementById('battleEnergyCount'))return stopBattleEnergyTimer();const e=battleState.energy;if(e&&!e.unlimited&&e.nextRechargeAt&&Date.parse(e.nextRechargeAt)<=(Date.now()+battleState.serverOffset)){loadBattleEnergyOnly();return}renderBattleEnergy()},1000)}
async function loadBattleEnergyOnly(){try{const d=await apiRequest('battle/config',{}, {ttl:0});battleState.energy=d.energy;battleState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();startBattleEnergyTimer()}catch(_){renderBattleEnergy()}}

function battleCardPower(card,user,settings){const grade=String(card?.grade||card?.rarity||'').trim().toUpperCase(),gradePower=Number(settings?.powerByGrade?.[grade]),savedPower=Number(card?.basePower??card?.base_power),base=grade==='PRESTIGE'&&Number.isFinite(gradePower)?Math.max(0,gradePower):(Number.isFinite(savedPower)&&savedPower>0?savedPower:(Number.isFinite(gradePower)?Math.max(0,gradePower):0)),lv=Number(user.breakthroughs?.[card.id]||0),pct=Number(settings?.breakthroughBonus?.[lv]||0);return Math.floor(base*(1+pct/100));}
function pveDeckCardMini(card,user=loadUser()){
  const power=battleCardPower(card,user,battleState.config);
  return `<div class="pve-card-mini-full pvp-card-mini-full">${cardHtml(card,true,'pve-deck-card-display pvp-card-display',user)}<div class="pve-card-extra pvp-card-extra compact deck-card-summary"><b>${escapeHtml(card.grade||card.rarity||'C')}</b><strong>${power.toLocaleString()}</strong></div></div>`;
}
function pveDeckGradeGroups(list=[]){
  return [...new Set(list.map(card=>card.grade))].map(grade=>({grade,cards:list.filter(card=>card.grade===grade)}));
}
const PVE_DECK_FILTER_KEY='cnine_pve_deck_filter_v1';
function loadPveDeckFilter(){try{return {query:'',grade:'ALL',type:'ALL',sort:'POWER_DESC',...JSON.parse(localStorage.getItem(PVE_DECK_FILTER_KEY)||'{}')}}catch{return {query:'',grade:'ALL',type:'ALL',sort:'POWER_DESC'}}}
function savePveDeckFilter(filter){try{localStorage.setItem(PVE_DECK_FILTER_KEY,JSON.stringify(filter))}catch(_){}}
function cardDeckType(card){return String(uniqueAbilityDominant(card)?.key||'NONE').toUpperCase()}
function filterDeckCards(list=[],filter={},user=loadUser(),settings=battleState.config){
  const query=String(filter.query||'').trim().toLowerCase(),grade=String(filter.grade||'ALL').toUpperCase(),type=String(filter.type||'ALL').toUpperCase(),sort=String(filter.sort||'POWER_DESC').toUpperCase();
  const rows=list.filter(card=>{
    if(grade!=='ALL'&&String(card.grade||card.rarity||'').toUpperCase()!==grade)return false;
    if(type!=='ALL'&&cardDeckType(card)!==type)return false;
    if(query&&!`${card.title||''} ${card.name||''} ${card.grade||''}`.toLowerCase().includes(query))return false;
    return true;
  });
  rows.sort((a,b)=>{
    if(sort==='NAME_ASC')return String(a.name||a.title||'').localeCompare(String(b.name||b.title||''),'ko')||String(a.title||'').localeCompare(String(b.title||''),'ko');
    if(sort==='GRADE_DESC')return (gradeOrder[b.grade]||0)-(gradeOrder[a.grade]||0)||battleCardPower(b,user,settings)-battleCardPower(a,user,settings);
    return battleCardPower(b,user,settings)-battleCardPower(a,user,settings)||(gradeOrder[b.grade]||0)-(gradeOrder[a.grade]||0);
  });
  return rows;
}
function renderPveDeckCardList(owned,user=loadUser()){
  const root=document.getElementById('battleCards');if(!root)return;
  const filter=loadPveDeckFilter(),deckSet=new Set(battleState.deck),rows=filterDeckCards(owned,filter,user,battleState.config),groups=pveDeckGradeGroups(rows);
  root.innerHTML=groups.map(group=>`<section class="pve-grade-group pvp-grade-group grade-${String(group.grade).toLowerCase()}"><div class="pve-grade-title pvp-grade-title"><b>${escapeHtml(group.grade)}</b><span>${group.cards.length}장</span></div><div class="pve-grade-grid pvp-grade-grid">${group.cards.map(card=>`<button type="button" class="pve-frame-pick pvp-pick ${deckSet.has(card.id)?'selected':''}" data-pick="${card.id}" ${deckSet.has(card.id)?'disabled':''}>${pveDeckCardMini(card,user)}${deckSet.has(card.id)?'<span class="pve-selected-cover"><b>편성됨</b></span>':''}</button>`).join('')}</div></section>`).join('')||'<div class="empty-recent deck-filter-empty"><b>조건에 맞는 카드가 없습니다.</b><span>검색어나 필터를 변경해보세요.</span></div>';
  const count=document.getElementById('pveDeckResultCount');if(count)count.textContent=`${rows.length}장`;
  root.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>{if(battleState.deck.length<5){battleState.deck.push(button.dataset.pick);renderBattleBuilder()}});
}
function bindPveDeckFilters(owned,user=loadUser()){
  const filter=loadPveDeckFilter(),search=document.getElementById('pveDeckSearch'),grade=document.getElementById('pveDeckGrade'),type=document.getElementById('pveDeckType'),sort=document.getElementById('pveDeckSort'),reset=document.getElementById('pveDeckFilterReset');
  if(search){search.value=filter.query||'';search.oninput=()=>{filter.query=search.value;savePveDeckFilter(filter);renderPveDeckCardList(owned,user);search.focus();search.setSelectionRange(search.value.length,search.value.length)}}
  if(grade){grade.value=filter.grade||'ALL';grade.onchange=()=>{filter.grade=grade.value;savePveDeckFilter(filter);renderPveDeckCardList(owned,user)}}
  if(type){type.value=filter.type||'ALL';type.onchange=()=>{filter.type=type.value;savePveDeckFilter(filter);renderPveDeckCardList(owned,user)}}
  if(sort){sort.value=filter.sort||'POWER_DESC';sort.onchange=()=>{filter.sort=sort.value;savePveDeckFilter(filter);renderPveDeckCardList(owned,user)}}
  if(reset)reset.onclick=()=>{const next={query:'',grade:'ALL',type:'ALL',sort:'POWER_DESC'};savePveDeckFilter(next);bindPveDeckFilters(owned,user);renderPveDeckCardList(owned,user)};
}
async function loadBattleView(){
  if(!API_MODE){document.getElementById('battleCards').innerHTML='<div class="empty-recent">현재 전투 콘텐츠를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.</div>';return;}
  try{const d=await apiRequest('battle/config',{}, {ttl:0});const owned=ownedIds(loadUser()),savedDeck=(Array.isArray(d.deck)?d.deck.map(String):[]).filter(id=>owned.has(id)&&cards.some(c=>c.id===id)).slice(0,5),monsters=d.monsters||[],lastMonsterId=getLastPveMonsterId(),selectedMonster=monsters.some(m=>Number(m.id)===Number(lastMonsterId))?lastMonsterId:(monsters[0]?.id||null);battleState={config:d.settings,battleEngine:d.battleEngine||{active:false,version:'LEGACY',mode:'LEGACY',playbackSpeed:1.6},monsters,selectedMonster,deck:savedDeck,characterBonus:d.characterBonus||{equipmentPve:0,equipmentPvp:0,garagePve:0,garagePvp:0,titlePve:0,pve:0,pvp:0},energy:d.energy||null,energyTimer:null,serverOffset:Date.parse(d.serverNow||new Date().toISOString())-Date.now(),restoreMonsterCursor:true};renderBattleBuilder();bindMobilePveTabs();applyPveViewMode(getPveViewMode());startBattleEnergyTimer();}catch(e){document.getElementById('battleCards').innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`;}
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
 const resolveTab=m=>{const raw=String(m.pveTab||m.category||(m.isBoss?'HELL':'NORMAL')).toUpperCase();return (({GENERAL:'NORMAL',ELITE:'HARD',BOSS:'HELL',EVENT:'HELL'})[raw]||raw)};
 const rows=(battleState.monsters||[]).filter(m=>resolveTab(m)===state.tab&&String(m.name||'').toLowerCase().includes(String(state.query||'').toLowerCase())).sort((x,y)=>state.sort==='POWER_DESC'?Number(y.battlePower)-Number(x.battlePower):state.sort==='NAME'?String(x.name).localeCompare(String(y.name),'ko'):Number(x.battlePower)-Number(y.battlePower));
 let selected=(battleState.monsters||[]).find(m=>Number(m.id)===Number(battleState.selectedMonster))||rows[0]||null;
 if(selected&&Number(battleState.selectedMonster)!==Number(selected.id)){battleState.selectedMonster=Number(selected.id);saveLastPveMonsterId(battleState.selectedMonster)}
 root.innerHTML=`<div class="pve-monster-browser redesign"><section class="pve-target-spotlight ${selected?'ready':'empty'}">${selected?`${selected.image?`<img class="pve-target-image" src="${selected.image}" alt="${escapeHtml(selected.name)}">`:'<div class="pve-target-image placeholder">👹</div>'}<div class="pve-target-copy"><span class="pve-target-tag">${monsterCategoryLabel(resolveTab(selected))}</span><h3>${escapeHtml(selected.name)}</h3><div class="pve-target-stats"><article><small>요구 전투력</small><b>${Number(selected.battlePower||0).toLocaleString()}</b></article><article><small>승리 보상</small><b>◈ ${Number(selected.rewardCoin||0).toLocaleString()}</b></article></div><p>${Number(selected.isBoss)?'강력한 토벌 목표입니다. 덱 저장 후 신중하게 도전하세요.':'현재 덱으로 바로 도전할 수 있는 기본 토벌 목표입니다.'}</p>${battleState.battleEngine?.active?`<div class="pve-v2-live-badge"><i></i><b>전투엔진 V2</b><small>실전 적용 · 1.6배 고정${battleState.battleEngine?.ownerTest?' · OWNER TEST':''}</small></div>`:''}<button type="button" class="btn battle-start pve-target-start" id="battleStart" data-pve-start-button="1" ${battleState.deck.length!==5?'disabled':''}>전투 시작</button></div>`:`<div class="empty-recent">먼저 토벌할 몬스터를 선택하세요.</div>`}</section><div class="pve-monster-tabs">${PVE_MONSTER_TABS.map(t=>`<button type="button" data-monster-tab="${t}" class="${state.tab===t?'active':''}">${monsterCategoryLabel(t)}</button>`).join('')}</div><div class="pve-monster-tools"><label class="pve-tool-field pve-tool-search"><span class="pve-tool-head"><span class="pve-tool-icon" aria-hidden="true">⌕</span><span>몬스터 검색</span></span><input id="pveMonsterSearch" value="${escapeHtml(state.query||'')}" placeholder="몬스터 이름"></label><label class="pve-tool-field pve-tool-sort"><span class="pve-tool-head"><span class="pve-tool-icon" aria-hidden="true">⇅</span><span>정렬 기준</span></span><span class="pve-select-wrap"><select id="pveMonsterSort" aria-label="몬스터 정렬 기준"><option value="POWER_ASC" ${state.sort==='POWER_ASC'?'selected':''}>전투력 낮은순</option><option value="POWER_DESC" ${state.sort==='POWER_DESC'?'selected':''}>전투력 높은순</option><option value="NAME" ${state.sort==='NAME'?'selected':''}>이름순</option></select></span></label></div><div class="pve-monster-grid redesign">${rows.map(m=>`<button class="monster-choice redesign ${Number(battleState.selectedMonster)===Number(m.id)?'active':''}" data-monster="${m.id}">${m.image?`<img src="${m.image}" alt="${escapeHtml(m.name)}">`:'<div class="monster-placeholder">👹</div>'}<span><small>${monsterCategoryLabel(resolveTab(m))}</small><b>${escapeHtml(m.name)}</b><em>전투력 ${Number(m.battlePower).toLocaleString()}</em><strong>보상 ◈ ${Number(m.rewardCoin).toLocaleString()}</strong></span></button>`).join('')||'<div class="empty-recent">조건에 맞는 몬스터가 없습니다.</div>'}</div></div>`;
 root.querySelectorAll('[data-monster-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.monsterTab;const visible=(battleState.monsters||[]).filter(m=>resolveTab(m)===state.tab);if(!visible.some(m=>Number(m.id)===Number(battleState.selectedMonster)))battleState.selectedMonster=visible[0]?.id||null;savePveMonsterFilterState(state);if(battleState.selectedMonster)saveLastPveMonsterId(battleState.selectedMonster);renderBattleBuilder()});
 root.querySelector('#pveMonsterSearch').oninput=e=>{state.query=e.target.value;savePveMonsterFilterState(state);renderPveMonsterBrowser()};
 root.querySelector('#pveMonsterSort').onchange=e=>{state.sort=e.target.value;savePveMonsterFilterState(state);renderPveMonsterBrowser()};
 root.querySelectorAll('[data-monster]').forEach(b=>b.onclick=()=>{battleState.selectedMonster=Number(b.dataset.monster);saveLastPveMonsterId(battleState.selectedMonster);battleState.restoreMonsterCursor=false;renderBattleBuilder()});
}

function renderBattleBuilder(){
  const viewMode=getPveViewMode(),activeMobileTab=getMobilePveTab()||((battleState.deck?.length===5)?'monsters':'deck'),user=loadUser();
  const owned=cards.filter(card=>ownedIds(user).has(card.id)).sort((a,b)=>(gradeOrder[b.grade]||0)-(gradeOrder[a.grade]||0)||battleCardPower(b,user,battleState.config)-battleCardPower(a,user,battleState.config));
  const deckSet=new Set(battleState.deck),cardPower=battleState.deck.reduce((sum,id)=>{const card=cards.find(item=>item.id===id);return sum+(card?battleCardPower(card,user,battleState.config):0)},0),bonus=battleState.characterBonus||{},power=cardPower+Number(bonus.pve||0),isReady=battleState.deck.length===5;
  const powerEl=document.getElementById('battleDeckPower');if(powerEl)powerEl.textContent=power.toLocaleString();
  const deckCountEl=document.getElementById('battleDeckCount');if(deckCountEl)deckCountEl.textContent=`${battleState.deck.length} / 5`;
  const deckReadyEl=document.getElementById('battleDeckReady');if(deckReadyEl)deckReadyEl.textContent=isReady?'출전 준비 완료':'편성 중';
  const deckStatusText=document.getElementById('battleDeckStatusText');if(deckStatusText){const garageText=Number(bonus.garagePve||0)>0?` <i>+</i> 이동수단 ${Number(bonus.garagePve||0).toLocaleString()}`:'';const titleText=Number(bonus.titlePve||0)>0?` <i>+</i> 칭호 ${Number(bonus.titlePve||0).toLocaleString()}`:'';deckStatusText.innerHTML=`카드 ${cardPower.toLocaleString()} <i>+</i> 장비 ${Number(bonus.equipmentPve||0).toLocaleString()}${garageText}${titleText}<em>${isReady?' · 출전 준비 완료':' · 5장 편성 필요'}</em>`;}
  const deckRoot=document.getElementById('battleDeck'),cardRoot=document.getElementById('battleCards'),monsterRoot=document.getElementById('battleMonsters');
  if(viewMode==='deck'){
    if(deckRoot)deckRoot.innerHTML=Array.from({length:5},(_,index)=>{const card=cards.find(item=>item.id===battleState.deck[index]);return card?`<button type="button" class="pve-frame-slot pvp-deck-slot filled" data-remove="${card.id}" title="클릭해서 덱에서 제외">${pveDeckCardMini(card,user)}<span class="pve-remove-hint">덱에서 빼기</span></button>`:`<div class="pve-frame-slot pvp-deck-slot empty"><div class="pve-frame-empty pvp-empty-slot"><span>${index+1}</span><b>빈 슬롯</b><small>카드를 선택하세요</small></div></div>`}).join('');
    renderPveDeckCardList(owned,user);
    bindPveDeckFilters(owned,user);
    if(monsterRoot)monsterRoot.innerHTML='';
    document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{battleState.deck=battleState.deck.filter(id=>id!==button.dataset.remove);renderBattleBuilder()});
    const saveDeck=document.getElementById('saveBattleDeck');if(saveDeck){saveDeck.disabled=!isReady;saveDeck.onclick=saveBattleDeck;}
    const clearDeck=document.getElementById('clearBattleDeck');if(clearDeck)clearDeck.onclick=resetBattleDeck;
  }else{
    if(deckRoot)deckRoot.innerHTML='';
    if(cardRoot)cardRoot.innerHTML='';
    renderPveMonsterBrowser();
    const start=document.getElementById('battleStart'),noEnergy=battleState.energy&&!battleState.energy.unlimited&&battleState.energy.energy<battleState.energy.costPerBattle;
    if(start){start.disabled=!isReady||!battleState.selectedMonster||noEnergy;start.textContent=noEnergy?'전투 횟수 부족':'전투 시작';start.dataset.pveStartBound='1';}
  }
  renderBattleEnergy();bindMobilePveTabs();setMobilePveTab(activeMobileTab,{scroll:false});applyPveViewMode(viewMode);
  if(viewMode==='hunt'&&battleState.restoreMonsterCursor){battleState.restoreMonsterCursor=false;requestAnimationFrame(()=>{const selected=document.querySelector(`#battleMonsters [data-monster="${battleState.selectedMonster}"]`);if(selected&&(!isMobilePve()||activeMobileTab==='monsters')){selected.focus({preventScroll:true});selected.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});}});}
}
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
function handlePveBattleStartClick(event){
  const button=event?.target?.closest?.('#battleStart,[data-pve-start-button="1"]');
  if(!button||!button.isConnected)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(button.disabled||button.getAttribute('aria-disabled')==='true')return;
  if(battleState.fightStarting)return;
  void startBattle();
}
if(!document.documentElement.dataset.pveStartGuardV1316){
  document.documentElement.dataset.pveStartGuardV1316='1';
  document.addEventListener('click',handlePveBattleStartClick,true);
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
  battleState.autoRunning=true;battleState.autoTargetBattles=remaining;battleState.autoRemaining=remaining;battleState.autoSummary={battles:0,wins:0,losses:0,totalReward:0,magicCrystals:0,cardRewards:[],equipmentRewards:[]};stopBattleEnergyTimer();
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
  if(value>0&&value<=25)battleTriggerLowHpUniqueFx(stage,target);
}
function battleGradeTier(grade){const n=gradeOrder[String(grade||'C').toUpperCase()]||1;return n>=9?'mythic':n>=7?'legendary':n>=5?'epic':n>=4?'rare':'normal'}
function battleActivateCard(stage,index,grade){stage.querySelectorAll('.battle-card-fighter').forEach((el,i)=>{el.classList.toggle('active-attacker',i===index);el.classList.remove('skill-normal','skill-rare','skill-epic','skill-legendary','skill-mythic')});const card=stage.querySelectorAll('.battle-card-fighter')[index];if(card)card.classList.add(`skill-${battleGradeTier(grade)}`);battleTriggerUniqueFx(stage,index,'attack',false)}
function combatCardHtml(card,classes='combat-collection-card',level=null){if(!card)return '';const c={...card,id:String(card.id||card.card_id||''),grade:String(card.grade||card.rarity||'C').toUpperCase(),title:card.title||card.card_title||'카드',name:card.name||'',image:card.image||card.image_url||'',focusX:Number(card.focusX??card.focus_x??50),focusY:Number(card.focusY??card.focus_y??50),powerType:card.powerType||card.power_type||''};const lv=Math.max(0,Math.min(13,Number(level??card.breakthroughLevel??card.breakthrough_level??loadUser()?.breakthroughs?.[c.id]??0)));return cardHtml(c,true,classes,{breakthroughs:{[c.id]:lv}})}
function uniqueBattleFxMarkup(type){
  const key=String(type||'').toLowerCase();
  if(key==='attack')return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-core"></i><i class="unique-fx-arc a1"></i><i class="unique-fx-arc a2"></i><i class="unique-fx-velocity v1"></i><i class="unique-fx-velocity v2"></i><i class="unique-fx-velocity v3"></i><b>ATTACK CORE</b></div>';
  if(key==='defense')return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-hex"></i><i class="unique-fx-shield"></i><i class="unique-fx-guard-ring"></i><b>BARRIER FIELD</b></div>';
  if(key==='speed')return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-afterimage a1"></i><i class="unique-fx-afterimage a2"></i><i class="unique-fx-speed-line s1"></i><i class="unique-fx-speed-line s2"></i><i class="unique-fx-speed-line s3"></i><b>VELOCITY</b></div>';
  if(key==='hp')return '<div class="unique-card-fx" aria-hidden="true"><i class="unique-fx-life-flash"></i><i class="unique-fx-heal-ring"></i><i class="unique-fx-plus p1">＋</i><i class="unique-fx-plus p2">＋</i><i class="unique-fx-plus p3">＋</i><b>LIFE PULSE</b></div>';
  return '';
}
function battleUniqueFxAttackTarget(stage,index,enemy=false){
  if(!stage)return null;
  if(enemy){
    return stage.querySelector(`[data-fighter="${index}"]`)
      ||stage.querySelector('.player-side .battle-card-fighter.active-attacker')
      ||stage.querySelector('.player-side .battle-card-fighter')
      ||stage.querySelector('.player-side');
  }
  return stage.querySelector(`[data-enemy-fighter="${index}"]`)
    ||stage.querySelector('.enemy-side .battle-card-fighter.active-attacker')
    ||stage.querySelector('.battle-enemy-card')
    ||stage.querySelector('.enemy-side');
}
function battleTriggerUniqueFx(stage,index,event='attack',enemy=false){
  if(!stage)return false;
  const fighter=stage.querySelector(enemy?`[data-enemy-fighter="${index}"]`:`[data-fighter="${index}"]`);if(!fighter)return false;
  const type=String(fighter.dataset.uniqueFx||'').toLowerCase();
  const allowed=event==='attack'?(type==='attack'||type==='speed'):event==='defense'?type==='defense':event==='low-hp'?type==='hp':Boolean(type);
  if(!allowed)return false;
  const stageRect=stage.getBoundingClientRect(),fighterRect=fighter.getBoundingClientRect(),fx=document.createElement('div');
  fx.className=`unique-stage-fx unique-card-fx-host unique-fx-${type} unique-fx-active unique-fx-${event}-active`;
  let left=fighterRect.left-stageRect.left,top=fighterRect.top-stageRect.top,width=fighterRect.width,height=fighterRect.height;
  if(event==='attack'&&type==='attack'){
    const target=battleUniqueFxAttackTarget(stage,index,enemy),targetRect=target?.getBoundingClientRect?.();
    if(targetRect){
      const sourceX=fighterRect.left+fighterRect.width/2,sourceY=fighterRect.top+fighterRect.height/2;
      const targetX=targetRect.left+targetRect.width/2,targetY=targetRect.top+targetRect.height/2;
      const centerX=sourceX+(targetX-sourceX)*.54,centerY=sourceY+(targetY-sourceY)*.52;
      const distance=Math.hypot(targetX-sourceX,targetY-sourceY);
      const size=Math.max(96,Math.min(210,Math.max(fighterRect.width*1.45,distance*.34)));
      left=centerX-stageRect.left-size/2;top=centerY-stageRect.top-size/2;width=size;height=size;
      fx.classList.add('unique-fx-between-targets');
      if(targetX<sourceX)fx.classList.add('unique-fx-reverse');
      fx.style.setProperty('--unique-fx-angle',`${Math.atan2(targetY-sourceY,targetX-sourceX)*180/Math.PI}deg`);
    }
  }
  fx.style.left=`${left}px`;fx.style.top=`${top}px`;fx.style.width=`${width}px`;fx.style.height=`${height}px`;
  fx.innerHTML=uniqueBattleFxMarkup(type);stage.appendChild(fx);
  fighter.classList.remove('unique-fx-source-active');void fighter.offsetWidth;fighter.classList.add('unique-fx-source-active');
  clearTimeout(fighter._uniqueFxTimer);fighter._uniqueFxTimer=setTimeout(()=>fighter.classList.remove('unique-fx-source-active'),type==='hp'?1450:1050);
  setTimeout(()=>fx.remove(),type==='hp'?1600:1220);
  return true;
}
function battleTriggerLowHpUniqueFx(stage,target='team'){
  if(!stage)return;
  const enemy=String(target)==='enemy',selector=enemy?'[data-enemy-fighter]':'[data-fighter]';
  stage.querySelectorAll(`${selector}.unique-fx-hp`).forEach((fighter,index)=>{
    if(fighter.dataset.uniqueHpTriggered==='1')return;fighter.dataset.uniqueHpTriggered='1';
    const slot=Number(enemy?fighter.dataset.enemyFighter:fighter.dataset.fighter);setTimeout(()=>battleTriggerUniqueFx(stage,slot,'low-hp',enemy),index*90);
  });
}
function battleFighterHtml(card,index,enemy=false){const lv=Number(card?.breakthroughLevel??card?.breakthrough_level??loadUser()?.breakthroughs?.[card?.id]??0),dominant=uniqueAbilityDominant(card),type=dominant?.key||'',value=Number(dominant?.value||0);return `<div class="battle-card-fighter${type?` unique-card-fx-host unique-fx-${type}`:''}" ${enemy?`data-enemy-fighter="${index}"`:`data-fighter="${index}"`} ${type?`data-unique-fx="${type}" data-unique-value="${value}"`:''} style="--i:${index}"><div class="fighter-aura"></div>${combatCardHtml(card,'battle-fighter-card',lv)}</div>`}
function normalizeUltimateMediaPath(path){const v=String(path||'/assets/effects/SKILL.gif').trim().replace(/\\/g,'/');if(!v)return '/assets/effects/SKILL.gif';return /^(https?:)?\/\//i.test(v)||v.startsWith('/')?v:`/${v.replace(/^\.\//,'')}`}
function applyUltimateViewport(stage,overlay){
  if(!stage||!overlay)return ()=>{};
  const update=()=>{
    const rect=stage.getBoundingClientRect();
    const w=Math.max(240,Math.round(rect.width||window.innerWidth||1280));
    const h=Math.max(320,Math.round(rect.height||window.innerHeight||720));
    overlay.style.setProperty('--ultimate-host-w',`${w}px`);
    overlay.style.setProperty('--ultimate-host-h',`${h}px`);
    overlay.classList.toggle('ultimate-host-narrow',w<=900);
    overlay.classList.toggle('ultimate-host-phone',w<=600);
    overlay.classList.toggle('ultimate-host-landscape',w>h);
    overlay.classList.toggle('ultimate-host-portrait',h>=w);
  };
  update();
  let ro=null;
  const mobileHost=matchMedia('(max-width: 800px), (pointer: coarse)').matches;
  if(!mobileHost&&typeof ResizeObserver==='function'){ro=new ResizeObserver(update);ro.observe(stage)}
  if(!mobileHost){window.addEventListener('resize',update,{passive:true});window.addEventListener('orientationchange',update,{passive:true});}
  return ()=>{ro?.disconnect();if(!mobileHost){window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update)}};
}
async function playBattleUltimate(stage,ultimate,bonusDamage){if(!stage||!ultimate)return;const duration=Math.max(500,Math.min(30000,Number(ultimate.durationMs||3000))),playbackRate=Math.max(.5,Math.min(3,Number(ultimate.playbackRate||1))),src=normalizeUltimateMediaPath(ultimate.mediaUrl);const isVideo=/\.(webm|mp4)(?:[?#].*)?$/i.test(src);const overlay=document.createElement('div');overlay.className='battle-ultimate-overlay';overlay.innerHTML=`<div class="battle-ultimate-flash"></div><div class="battle-ultimate-title"><small>ULTIMATE SKILL</small><strong>${escapeHtml(ultimate.name||'ULTIMATE')}</strong><span>궁극기 타격 ${Number(bonusDamage||0).toLocaleString()}</span></div><div class="battle-ultimate-media">${isVideo?`<video src="${escapeHtml(src)}" playsinline webkit-playsinline preload="metadata" disablepictureinpicture></video>`:`<img src="${escapeHtml(src)}" alt="${escapeHtml(ultimate.name||'ULTIMATE')}">`}</div></div>`;stage.appendChild(overlay);const releaseUltimateViewport=applyUltimateViewport(stage,overlay);stage.classList.add('ultimate-playing');battleTone(520,.28,'sawtooth',.08);if(navigator.vibrate)navigator.vibrate([60,30,100]);await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);overlay.classList.add('closing');setTimeout(()=>{releaseUltimateViewport();overlay.remove();stage.classList.remove('ultimate-playing');resolve()},220)};const timer=setTimeout(finish,duration);const media=overlay.querySelector('video');if(media){media.muted=!battleSoundEnabled();media.volume=1;media.playbackRate=playbackRate;media.addEventListener('ended',finish,{once:true});media.addEventListener('error',()=>setTimeout(finish,800),{once:true});const playback=media.play();if(playback&&typeof playback.catch==='function')playback.catch(()=>{media.muted=true;media.play().catch(()=>{})})}const img=overlay.querySelector('img');if(img)img.addEventListener('error',()=>{overlay.querySelector('.battle-ultimate-media').innerHTML='<div class="battle-ultimate-fallback">ULTIMATE</div>'},{once:true})})}

async function playBossBattleUltimate(stage,phase,ult){
  if(!stage||!ult)return {teamHpLoss:0,penalty:0};
  const duration=Math.max(500,Math.min(30000,Number(ult.durationMs||3000)));
  const playbackRate=Math.max(.5,Math.min(3,Number(ult.playbackRate||1)));
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
      ${mediaSrc?(isVideo?`<video src="${escapeHtml(mediaSrc)}" ${soundSrc?'muted':''} playsinline webkit-playsinline preload="metadata" disablepictureinpicture></video>`:`<img src="${escapeHtml(mediaSrc)}" alt="${escapeHtml(ult.name||'BOSS ULTIMATE')}">`):'<div class="boss-ultimate-overlay-fallback">BOSS ULTIMATE</div>'}
    </div>
    <div class="boss-ultimate-overlay-title">
      <small>${escapeHtml(ult.warningText||'BOSS ULTIMATE')}</small>
      <strong>${escapeHtml(ult.name||'ULTIMATE')}</strong>
      ${ult.description?`<span>${escapeHtml(ult.description)}</span>`:''}
    </div>`;
  stage.appendChild(overlay);
  const releaseUltimateViewport=applyUltimateViewport(stage,overlay);
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
      setTimeout(()=>{releaseUltimateViewport();overlay.remove();stage.classList.remove('boss-ultimate-fullscreen','ultimate-playing');resolve()},220);
    };
    const timer=setTimeout(finish,duration);
    const video=overlay.querySelector('video');
    if(video){
      video.addEventListener('loadedmetadata',()=>{const portrait=video.videoHeight>video.videoWidth;video.classList.toggle('is-portrait',portrait);video.classList.toggle('is-landscape',!portrait)},{once:true});
      video.volume=volume;
      video.playbackRate=playbackRate;
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
  if(battleState.fightStarting)return;
  const modal=document.getElementById('modal');
  const monster=(battleState.monsters||[]).find(m=>Number(m.id)===Number(battleState.selectedMonster));
  if(!modal){alert('전투 화면을 준비하지 못했습니다. PVE 화면을 다시 열어주세요.');return;}
  if(!monster){battleState.selectedMonster=Number((battleState.monsters||[])[0]?.id||0)||null;renderBattleBuilder();alert('선택한 몬스터 정보가 갱신되었습니다. 다시 전투를 시작해주세요.');return;}
  if((battleState.deck||[]).length!==5){alert('PvE 출전 카드 5장을 먼저 편성해주세요.');return;}
  const energy=battleState.energy;if(energy&&!energy.unlimited&&Number(energy.energy||0)<Math.max(1,Number(energy.costPerBattle||1))){renderBattleEnergy();alert('남은 전투 횟수가 부족합니다.');return;}
  battleState.fightStarting=true;
  let msg=null;
  try{
    const playUltimateCinematics=!battleState.autoRunning||Number(battleState.autoSummary?.battles||0)===0;
  const v2Playback=Boolean(battleState.battleEngine?.active),battleIntroSleep=ms=>battleSleep(v2Playback?Math.max(24,Math.round(Number(ms||0)/1.6)):ms);
  saveLastPveMonsterId(battleState.selectedMonster);
  const user=loadUser();let deckCards=battleState.deck.map(id=>cards.find(x=>String(x.id)===String(id))).filter(Boolean);
  const previewCardPower=deckCards.reduce((sum,c)=>sum+battleCardPower(c,user,battleState.config),0),previewPower=previewCardPower+Number(battleState.characterBonus?.pve||0);
  if(v2Playback&&typeof window.prepareBattleV2LiveLoading==='function'&&typeof window.playPveBattleV2Live==='function'){
    const live=window.prepareBattleV2LiveLoading({modal,mode:'PVE',playerName:user?.nickname||'MEMBER TEAM',opponentName:monster.name||'MONSTER',autoText:battleState.autoRunning?`자동전투 ${Number(battleState.autoSummary?.battles||0)+1}회차 · 서버 전투 계산 중`:'실제 덱·장비·고유효과를 기준으로 서버 전투를 계산하고 있습니다.'});
    const stage=live.stage,phase=live.phase;msg=live.msg;ensureBattleSoundButton(stage);phase.textContent='SERVER BATTLE CALCULATION';
    const d=await apiRequest('battle/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,monsterId:battleState.selectedMonster,cardIds:battleState.deck,autoBattle:Boolean(battleState.autoRunning)})});
    if(!d?.battleV2)throw new Error('전투엔진 V2 응답을 받지 못했습니다. CMS 전투엔진 설정을 확인해주세요.');
    await window.playPveBattleV2Live({stage,phase,msg,modal,data:d,monster,playUltimateCinematics});
    return;
  }
  modal.className=`modal show battle-modal${battleState.autoRunning?' auto-battle-modal':''}`;
  modal.innerHTML=`<div class="modal-panel battle-stage intro">
    <div class="battle-backdrop"></div><div class="battle-fx-layer"></div>
    <div class="battle-topline"><span>${battleState.battleEngine?.active?'SOOPKETMON PVE · BATTLE ENGINE V2 · 1.6X':'CNINE PVE BATTLE'}</span><b id="battlePhase">ENCOUNTER</b></div>
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
    const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('battlePhase'),count=document.getElementById('battleCountdown');msg=document.getElementById('battleMessage');ensureBattleSoundButton(stage);
    battleTone(90,.18,'sawtooth',.035); await battleIntroSleep(500);
    stage.classList.add('cards-enter'); phase.textContent='TEAM DEPLOY'; await battleIntroSleep(900);
    stage.classList.add('enemy-enter'); phase.textContent=monster.isBoss?'BOSS APPEARS':'ENEMY APPEARS'; battleTone(monster.isBoss?52:105,.34,'square',.055); if(navigator.vibrate)navigator.vibrate(monster.isBoss?[100,50,150]:70); await battleIntroSleep(950);
    count.textContent='READY'; stage.classList.add('ready'); await battleIntroSleep(650); count.textContent='FIGHT'; battleTone(440,.18,'square',.075); stage.classList.add('fight'); await battleIntroSleep(520); count.textContent='';
    const fightPromise=apiRequest('battle/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,monsterId:battleState.selectedMonster,cardIds:battleState.deck,autoBattle:Boolean(battleState.autoRunning)})});
    const d=await fightPromise;
    if(Array.isArray(d.cards)&&d.cards.length===deckCards.length){deckCards=d.cards;const team=stage.querySelector('.player-side .battle-team');if(team)team.innerHTML=deckCards.map((card,index)=>battleFighterHtml(card,index)).join('');stage.classList.add('cards-enter')}
    const teamPowerLabel=stage.querySelector('.battle-hp-team small'),shownPower=Number(d.battleV2?.teams?.A?.summary?.power||d.playerPower||previewPower);if(teamPowerLabel)teamPowerLabel.textContent=`전투력 ${shownPower.toLocaleString()}`;
    if(d.battleV2&&window.playPveBattleV2Live){await window.playPveBattleV2Live({stage,phase,msg,modal,data:d,monster,playUltimateCinematics});return;}
    if(d.uniqueAbility?.battleEffects?.events?.length){await playUniqueBattleEventSequence(stage,phase,msg,d.uniqueAbility,deckCards,false);phase.textContent='UNIQUE ABILITY READY';await battleSleep(180);}
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
        battleBurst(stage,'28%','43%',monster.isBoss?34:24);battleDamage(stage,monster.isBoss?'HEAVY HIT!':`-${Math.max(100,Math.round(d.playerPower*hit/100))}`,'player',monster.isBoss);battleTriggerUniqueFx(stage,i,'defense',false);
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
    if(d.equipmentReward&&window.showEquipmentDropReward){try{await window.showEquipmentDropReward(d.equipmentReward)}catch(equipmentFxError){console.warn('장비 획득 연출을 표시하지 못했습니다.',equipmentFxError)}}
    msg.innerHTML=win?`<strong>VICTORY</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><div class="battle-reward-pop"><small>REWARD</small><b>◈ ${d.reward.toLocaleString()}</b>${Number(d.magicReward?.amount||0)>0?`<div class="battle-magic-drop"><strong>✦ 마법 결정 +${Number(d.magicReward.amount).toLocaleString()}</strong><span>확률 드랍 성공</span></div>`:''}${d.cardReward?`<div class="battle-card-drop"><strong>${d.cardReward.card.grade} ${escapeHtml(d.cardReward.card.title)}</strong><span>${d.cardReward.duplicate?`중복 카드 · 조각 +${d.cardReward.shardGained}`:'신규 카드 획득!'}</span></div>`:''}</div><em>화면을 눌러 돌아가기</em>`:`<strong>DEFEAT</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><div class="battle-defeat-tip">돌파 단계로 전투력을 높여보세요.</div><em>화면을 눌러 돌아가기</em>`;
    battleState.energy=d.energy||battleState.energy;battleState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();saveUser(apiUserToLocal(d.user));
    if(battleState.autoRunning){
      const summary=battleState.autoSummary||(battleState.autoSummary={battles:0,wins:0,losses:0,totalReward:0,magicCrystals:0,cardRewards:[],equipmentRewards:[]});summary.battles++;summary.totalReward+=Number(d.reward||0);summary.magicCrystals+=Number(d.magicReward?.amount||0);if(win)summary.wins++;else summary.losses++;if(d.cardReward)summary.cardRewards.push(d.cardReward);if(d.equipmentReward)summary.equipmentRewards.push(d.equipmentReward);battleState.autoRemaining=Math.max(0,Number(battleState.autoRemaining||0)-1);
      const available=Math.floor(Number(battleState.energy?.energy||0)/Math.max(1,Number(battleState.energy?.costPerBattle||1))),remaining=Math.min(Number(battleState.autoRemaining||0),available);
      if(remaining>0){msg.insertAdjacentHTML('beforeend',`<em class="auto-battle-next">자동전투 ${summary.battles}회 완료 · ${remaining}회 남음<br>잠시 후 다음 전투가 시작됩니다. 화면을 누르면 중단합니다.</em>`);modal.onclick=()=>{battleState.autoRunning=false;renderShell('battle')};setTimeout(()=>{if(battleState.autoRunning){modal.onclick=null;startBattle()}},1600)}
      else{battleState.autoRunning=false;const supplyBoxCount=(summary.equipmentRewards||[]).reduce((sum,reward)=>sum+Math.max(1,Number(reward?.quantity||1)),0);msg.insertAdjacentHTML('beforeend',`<div class="battle-auto-total"><b>자동전투 ${summary.battles}회 완료</b><span>승리 ${summary.wins} · 패배 ${summary.losses} · 코인 ◈ ${summary.totalReward.toLocaleString()}</span>${summary.magicCrystals>0?`<small>마법 결정 ✦ ${summary.magicCrystals.toLocaleString()}개</small>`:''}${summary.cardRewards.length?`<small>카드 획득 ${summary.cardRewards.length}장</small>`:''}${supplyBoxCount?`<small>보급상자 획득 ${supplyBoxCount}개</small>`:''}</div>`);setTimeout(()=>{modal.onclick=()=>renderShell('battle')},700)}
    }else setTimeout(()=>{modal.onclick=()=>renderShell('battle')},700);
  }catch(e){
    battleState.autoRunning=false;if(e.energy)battleState.energy=e.energy;
    console.error('PVE 전투 시작 실패:',e);
    if(msg){msg.innerHTML=`<span>${escapeHtml(e.message||'전투를 시작하지 못했습니다.')}</span><em>화면을 눌러 돌아가기</em>`;modal.onclick=()=>renderShell('battle')}
    else{modal.className='modal';modal.innerHTML='';alert(e.message||'전투 화면을 준비하지 못했습니다.');renderShell('battle')}
  }finally{battleState.fightStarting=false}
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
  root.innerHTML=`<nav class="magic-deck-tabs">${[['PVE','PVE 덱'],['PVP','PVP 덱'],['CAPTAIN','대장전 덱']].map(([id,name])=>`<button type="button" data-magic-deck="${id}" class="${deckType===id?'active':''}">${name}</button>`).join('')}</nav><div class="magic-layout"><section class="magic-loadout-panel"><div class="magic-section-head"><div><p class="eyebrow">${deckType} MAGIC LOADOUT</p><h2>${magicDeckName(deckType)} 장착</h2><p>장착 위치를 선택한 뒤 보유 마법카드를 지정하세요.</p></div><span>최대 5장</span></div><div class="magic-slot-grid">${[1,2,3,4,5].map(slot=>{const card=byId.get(equipped.get(slot));return `<button type="button" class="magic-slot ${magicUiState.selectedSlot===slot?'selected':''} ${card?'filled':''}" data-magic-slot="${slot}"><em>${slot}</em>${card?`${magicImage(card)}<b>${escapeHtml(card.name)}</b><small>${escapeHtml(card.rarity)} · ${escapeHtml(magicEffectLabel(card.effectType))}</small>`:`<i>+</i><b>마법카드 장착</b><small>${slot}번 전투 카드</small>`}</button>`}).join('')}</div><button type="button" id="magicUnequip" class="magic-unequip" ${equipped.has(magicUiState.selectedSlot)?'':'disabled'}>선택 슬롯 장착 해제</button></section><aside class="magic-draw-panel"><p class="eyebrow">MAGIC CARD DRAW</p><div class="magic-draw-pack" aria-hidden="true"><span></span><img src="assets/cards/magiccard.png?v=1217-soop-rebuild" alt=""></div><h2>마법카드 소환</h2><p>${escapeHtml(d.settings?.acquisitionNotice||'마법 결정은 인게임 플레이로만 획득합니다.')}</p><div class="magic-draw-cost"><span>1회 소모</span><b>✦ ${Number(d.settings?.drawCost||0).toLocaleString()}</b></div><button type="button" id="magicDrawBtn" class="btn" ${d.settings?.drawEnabled?'':'disabled'}>${d.settings?.drawEnabled?'마법카드 1장 소환':'뽑기 준비 중'}</button><small>쿠폰·접속 사료 지급 경로는 제공하지 않습니다.</small></aside></div><section class="magic-inventory-panel"><div class="magic-section-head"><div><p class="eyebrow">MY MAGIC CARDS</p><h2>보유 마법카드</h2></div><span>${cards.filter(x=>Number(x.quantity)>0).length}종 보유</span></div><div class="magic-card-grid">${cards.length?cards.map(card=>`<article class="magic-card-tile rarity-${escapeHtml(card.rarity)} ${Number(card.quantity)>0?'owned':'locked'}">${magicImage(card)}<div><span>${escapeHtml(card.rarity)}</span><h3>${escapeHtml(card.name)}</h3><p>${escapeHtml(card.description||'효과 설명 준비 중')}</p><small>${escapeHtml(magicTriggerLabel(card.triggerType))} · ${Number(card.triggerChance)}% · 최대 ${Number(card.maxActivations)}회</small></div><footer><b>보유 ${Number(card.quantity||0)}장</b><button type="button" data-equip-magic="${Number(card.id)}" ${Number(card.quantity)>0?'':'disabled'}>${magicUiState.selectedSlot}번 슬롯에 장착</button></footer></article>`).join(''):'<div class="magic-empty-collection">등록된 마법카드가 없습니다.<br>CMS에서 마법카드를 준비해주세요.</div>'}</div></section>`;
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
  try{const d=await apiRequest('pvp/ranking');root.innerHTML=`<section class="rank-pvp-panel"><div class="pvp-section-head"><div><p class="eyebrow">PVP SEASON RANKING</p><h2>${escapeHtml(d.settings?.seasonName||'PvP 시즌')} 랭킹</h2></div></div>${pvpTierGuideHtml(d.settings?.tiers||[],d.me?.tier)}${d.me?`<div class="pvp-my-rank">${tierEmblem(d.me.tier,'rank')}<span>내 순위 <b>${d.me.rank}위</b><small>${escapeHtml(d.me.tier.name)} · ${Number(d.me.season_score).toLocaleString()}점</small></span></div>`:''}<div class="pvp-ranking">${(d.ranking||[]).map(r=>`<div class="pvp-rank-row"><b>${r.rank}</b>${tierEmblem(r.tier,'rank')}<span class="public-name-stack">${publicTitleBadgeHtml(r.title)}<b>${escapeHtml(r.nickname)}</b><small>${escapeHtml(r.tier.name)} · ${r.wins}승 ${r.losses}패</small></span><strong>${Number(r.season_score).toLocaleString()}</strong></div>`).join('')||'<div class="empty-recent">아직 시즌 랭킹 데이터가 없습니다.</div>'}</div></section>`}catch(e){root.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}
}
async function loadServerRanking(){
  if(!API_MODE)return;const target=document.getElementById('serverRanking'),mine=document.getElementById('myTierCard'),road=document.getElementById('tierRoad');if(!target)return;
  try{const data=await apiRequest('ranking'),user=loadUser(),me=data.ranking.find(x=>x.nickname===user.nickname)||{rank:'-',score:0,card_count:0,max_breakthrough:0,tier:data.tiers[0]};mine.innerHTML=`${tierEmblem(me.tier,'large')}<div><span>내 총 카드점수</span><strong>${Number(me.score).toLocaleString()}점</strong><small>전체 ${me.rank}위 · 보유 ${me.card_count}장 · 최고 ★${me.max_breakthrough}</small></div>`;road.innerHTML=data.tiers.map(t=>`<div class="tier-road-item">${tierEmblem(t,'small')}<b>${Number(t.min).toLocaleString()}점+</b></div>`).join('');target.innerHTML=`<div class="rank-list rank-list-v2">${data.ranking.slice(0,30).map(row=>`<div class="rank-list-row rank-pos-${row.rank}"><b class="rank-number">${row.rank<=3?'<i>♛</i>':''}${row.rank}</b>${tierEmblem(row.tier,'rank')}<span>${escapeHtml(row.nickname)}<small>${row.card_count}장 · 최고 ★${row.max_breakthrough}</small></span><strong>${Number(row.score).toLocaleString()}점</strong></div>`).join('')}</div>`}catch(error){target.textContent=error.message}
}

function mineralExchangeView(user){
  return `${summaryBar(user)}<section class="mineral-exchange-page"><div class="mineral-exchange-head"><div><p class="eyebrow">MINERAL EXCHANGE</p><h2>💎 미네랄 교환소</h2><p>SOOP 게시판 미네랄 창고에 기부한 뒤 교환을 신청하세요.</p></div><div class="mineral-limit-badge"><span>하루 최대 교환 가능 개수</span><b id="mineralDailyLimit">3,000코인</b><small id="mineralRemaining">남은 한도 확인 중</small></div></div><div class="mineral-exchange-grid"><section class="mineral-form-card"><div id="mineralRateInfo" class="mineral-rate-info">교환 비율을 불러오는 중...</div><div class="mineral-guide"><b>사용법</b><p>1. SOOP 게시판 미네랄 창고에 기부</p><p>2. 와이고수 닉네임과 기부 완료 내용을 입력</p></div><label class="mineral-field"><span>숲켓몬 닉네임</span><input value="${escapeHtml(user.nickname)}" readonly></label><label class="mineral-field"><span>와이고수 닉네임</span><input id="wagoNickname" maxlength="40" placeholder="기부에 사용한 와고 닉네임"></label><label class="mineral-field"><span>기부한 미네랄 수량</span><input id="mineralAmount" type="number" inputmode="numeric" min="0" placeholder="예: 300000000"><small id="mineralStepHelp">1,000코인 단위로만 신청 가능합니다.</small></label><div class="mineral-preview"><span>지급 예정 코인</span><b id="mineralCoinPreview">0코인</b></div><label class="mineral-field"><span>기부 완료 내용</span><textarea id="mineralProof" maxlength="500" rows="4" placeholder="예: 7월 12일 13:00 닉네임 경화수월 3억 기부 완료"></textarea></label><button class="btn mineral-submit" id="mineralSubmit" disabled>💎 교환 신청하기</button></section><aside class="mineral-history-card"><h3>내 교환 신청 내역</h3><div id="mineralMyRequests"><div class="empty-recent">신청 내역을 불러오는 중...</div></div></aside></div></section>`;
}
let mineralExchangeState={settings:null,remainingCoin:0};
async function loadMineralExchange(){
  try{const d=await apiRequest('mineral-exchange/config');mineralExchangeState.settings=d.settings;mineralExchangeState.remainingCoin=Number(d.remainingCoin||0);const rate=document.getElementById('mineralRateInfo'),limit=document.getElementById('mineralDailyLimit'),remain=document.getElementById('mineralRemaining'),amount=document.getElementById('mineralAmount');if(rate)rate.innerHTML=`<b>미네랄 ${Number(d.settings.baseMineral).toLocaleString()}개</b><span>→</span><strong>${Number(d.settings.payoutCoin).toLocaleString()}코인</strong>`;if(limit)limit.textContent=`${Number(d.settings.dailyLimitCoin).toLocaleString()}코인`;if(remain)remain.textContent=`오늘 남은 신청 가능 ${Number(d.remainingCoin).toLocaleString()}코인`;if(amount){const step=Number(d.settings.baseMineral)*1000/Number(d.settings.payoutCoin);if(Number.isInteger(step))amount.step=String(step);amount.oninput=updateMineralPreview;}const submit=document.getElementById('mineralSubmit');if(submit)submit.onclick=submitMineralExchange;renderMineralRequests(d.requests||[]);updateMineralPreview();}catch(e){const box=document.getElementById('mineralMyRequests');if(box)box.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`;}
}
function updateMineralPreview(){const s=mineralExchangeState.settings,amount=Number(document.getElementById('mineralAmount')?.value||0),preview=document.getElementById('mineralCoinPreview'),btn=document.getElementById('mineralSubmit');if(!s)return;const raw=amount*Number(s.payoutCoin)/Number(s.baseMineral),coin=Number.isInteger(raw)?raw:0,valid=amount>0&&Number.isInteger(raw)&&coin%1000===0&&coin<=mineralExchangeState.remainingCoin;if(preview){preview.textContent=coin>0?`${coin.toLocaleString()}코인`:'0코인';preview.classList.toggle('invalid',amount>0&&!valid)}if(btn)btn.disabled=!valid;}
function renderMineralRequests(rows){const box=document.getElementById('mineralMyRequests');if(!box)return;const labels={PENDING:'승인 대기',APPROVED:'승인 완료',REJECTED:'거절'};box.innerHTML=rows.length?rows.map(r=>`<article class="mineral-history-row status-${String(r.status).toLowerCase()}"><div><b>${Number(r.coin_amount).toLocaleString()}코인</b><span>${Number(r.mineral_amount).toLocaleString()} 미네랄 · ${escapeHtml(r.wago_nickname)}</span><small>${new Date(String(r.created_at).replace(' ','T')+'Z').toLocaleString('ko-KR')}</small></div><em>${labels[r.status]||escapeHtml(r.status)}</em>${r.reject_reason?`<p>${escapeHtml(r.reject_reason)}</p>`:''}</article>`).join(''):'<div class="empty-recent">아직 교환 신청 내역이 없습니다.</div>';}
async function submitMineralExchange(){const btn=document.getElementById('mineralSubmit'),wagoNickname=document.getElementById('wagoNickname')?.value.trim(),mineralAmount=Number(document.getElementById('mineralAmount')?.value||0),proofText=document.getElementById('mineralProof')?.value.trim();if(!wagoNickname)return alert('와이고수 닉네임을 입력하세요.');if(!proofText)return alert('기부 완료 내용을 입력하세요.');btn.disabled=true;try{const d=await apiRequest('mineral-exchange/request',{method:'POST',body:JSON.stringify({wagoNickname,mineralAmount,proofText})});alert(`${Number(d.coinAmount).toLocaleString()}코인 교환 신청이 접수되었습니다.\n관리자 확인 후 지급됩니다.`);renderShell('mineral')}catch(e){alert(e.message);updateMineralPreview()}}

/* V1191: 차원의 균열 원정 */
let riftState={data:null,loading:false,difficulty:1};
window.addEventListener('cnine:character-power-changed',event=>{
  const bonuses=event.detail?.bonuses;if(!bonuses)return;
  battleState.characterBonus=bonuses;pvpState.characterBonus=bonuses;
  if(riftState.data)riftState.data.characterBonus=bonuses;
  if(document.getElementById('battleDeckPower'))renderBattleBuilder();
  if(pvpState.tab==='deck'&&document.getElementById('pvpContent'))renderPvpDeckTab(document.getElementById('pvpContent'));
  if(document.getElementById('pveRiftView')&&!document.getElementById('pveRiftView').hidden&&riftState.data)renderRiftView(riftState.data);
});
function riftWeeklyResetText(weekKey){const start=String(weekKey||'').match(/^\d{4}-\d{2}-\d{2}$/)?new Date(`${weekKey}T00:00:00+09:00`):null;if(!start||!Number.isFinite(start.getTime()))return '-';const reset=new Date(start.getTime()+7*24*60*60*1000),diff=Math.max(0,reset.getTime()-Date.now()),days=Math.floor(diff/86400000),hours=Math.floor((diff%86400000)/3600000),mins=Math.floor((diff%3600000)/60000);if(days>0)return `${days}일 ${hours}시간`;if(hours>0)return `${hours}시간 ${mins}분`;return `${Math.max(1,mins)}분`}
function riftWeeklyStatusStrip(data){const weekly=data?.weekly||{},run=data?.run||null,limit=Math.max(1,Number(weekly.rewardLimit||data?.settings?.weeklyRewardLimit||3)),used=Math.max(0,Number(weekly.rewardCount||0)),remain=Math.max(0,limit-used),highest=Math.max(0,Number(weekly.highestDifficulty||0)),rewardOk=run?(run.rewardEligible!==false):remain>0,rewardTitle=run?(rewardOk?'이번 원정 보상 지급 대상':'이번 원정 기록 도전'):(rewardOk?'이번 원정 보상 지급 대상':'주간 보상 소진 · 기록 도전'),rewardDesc=run?(rewardOk?'현재 진행 중인 원정은 주간 보상 횟수에 포함됩니다.':'보상은 지급되지 않고 최고 기록만 반영됩니다.'):(rewardOk?'이번 주 남은 횟수 안에서 원정 보상을 받을 수 있습니다.':'이번 주 보상 횟수를 모두 사용했습니다.'),rewardClass=rewardOk?'eligible':'exhausted';return `<section class="rift-weekly-status-strip ${rewardClass}"><div class="rift-status-summary"><div class="rift-status-kicker">WEEKLY RIFT STATUS</div><h3>주간 원정 보상 현황</h3><p>이번 주 수령 횟수와 남은 보상, 현재 원정의 지급 여부를 빠르게 확인하세요.</p></div><div class="rift-status-cards"><article class="rift-status-card primary"><small>주간 보상</small><b>${used} / ${limit}회</b><span>이번 주 수령한 원정 보상 횟수</span></article><article class="rift-status-card"><small>남은 보상</small><b>${remain}회</b><span>${remain>0?'아직 보상을 받을 수 있습니다.':'보상은 모두 소진되었습니다.'}</span></article><article class="rift-status-card state ${rewardClass}"><small>이번 원정 상태</small><b>${rewardTitle}</b><span>${rewardDesc}</span></article><article class="rift-status-card"><small>최고 난이도</small><b>${highest}단계</b><span>이번 주 최고 클리어 기록</span></article><article class="rift-status-card"><small>주간 초기화</small><b>${riftWeeklyResetText(data?.weekKey||weekly.weekKey)}</b><span>다음 주 월요일 00:00 초기화</span></article></div></section>`}
function riftRequestId(prefix='rift'){return `${prefix}-${crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`}`}
function riftDifficultyMonsterPowerBonus(difficulty){return ({5:30,6:50,7:75,8:105,9:140,10:180})[Math.max(1,Math.floor(Number(difficulty)||1))]||0}
function riftStatusLabel(status){return ({ACTIVE:'원정 진행 중',COMPLETED_PENDING:'최종 보스 격파',FAILED:'원정 실패',CLAIMED:'보상 수령 완료'})[status]||status}
function riftTypeMeta(type){return ({BATTLE:{icon:'⚔',label:'일반 전투'},ELITE:{icon:'◆',label:'정예 전투'},REST:{icon:'♥',label:'회복 지점'},EVENT:{icon:'✦',label:'균열 사건'},RISK:{icon:'◇',label:'위험한 제안'},BOSS:{icon:'♛',label:'중간 보스'},FINAL_BOSS:{icon:'♛',label:'최종 보스'}})[type]||{icon:'✦',label:type}}
function riftCardModel(apiCard){const local=cards.find(c=>String(c.id)===String(apiCard?.id));return local||{id:String(apiCard?.id||''),title:apiCard?.title||'원정 카드',name:'',grade:apiCard?.rarity||'C',rarity:apiCard?.rarity||'C',image:apiCard?.image||'',focusX:Number(apiCard?.focusX||50),focusY:Number(apiCard?.focusY||50),powerType:apiCard?.powerType||''}}
function riftDeckCardHtml(apiCard){const card=riftCardModel(apiCard),hp=Math.max(0,Math.min(100,Number(apiCard?.hp??100))),power=Number(apiCard?.power||0);return `<article class="rift-deck-card ${hp<=0?'ko':hp<=25?'danger':''}"><div class="rift-card-frame">${cardHtml(card,true,'small rift-card-display',loadUser())}<span class="rift-card-hp-number">${Math.ceil(hp)}%</span></div><div class="rift-card-life"><i style="width:${hp}%"></i></div><div class="rift-card-stat"><b>${escapeHtml(card.grade||card.rarity||'C')}</b><span>${hp<=0?'전투 불능':`HP ${Math.ceil(hp)}`}</span><strong>${power.toLocaleString()}</strong></div></article>`}
function riftRewardHtml(stash={},bonusPercent=0){const bonus=Math.max(0,Number(bonusPercent||0)),multiplier=1+bonus/100,coin=Math.floor(Number(stash.coin||0)*multiplier),shards=Math.floor(Number(stash.shards||0)*multiplier),crystals=Math.floor(Number(stash.crystals||0)*multiplier);return `<div class="rift-reward-wrap">${bonus>0?`<div class="rift-clear-bonus"><span>⚔ 전투 승리 보너스</span><b>최종 보상 +${bonus}%</b></div>`:''}<div class="rift-stash"><article><i>◈</i><span><small>${bonus>0?'예상 최종 코인':'누적 코인'}</small><b>${coin.toLocaleString()}</b></span></article><article><i>◆</i><span><small>${bonus>0?'예상 카드 조각':'카드 조각'}</small><b>${shards.toLocaleString()}</b></span></article><article><i>✦</i><span><small>${bonus>0?'예상 마법 결정':'마법 결정'}</small><b>${crystals.toLocaleString()}</b></span></article></div></div>`}
function riftBuffChipHtml(buff){return `<span class="rift-buff-chip"><i>${escapeHtml(buff.icon||'✦')}</i><b>${escapeHtml(buff.name||'강화')}</b></span>`}
function riftBuffPreview(key){return ({VANGUARD_SUPPORT:{key:'VANGUARD_SUPPORT',icon:'⚔',name:'선봉 지원',description:'출정 즉시 원정 전투력이 15% 증가합니다.'},EMERGENCY_BARRIER:{key:'EMERGENCY_BARRIER',icon:'◆',name:'응급 방벽',description:'출정 즉시 받는 피해가 20% 감소합니다.'},LIFE_SEED:{key:'LIFE_SEED',icon:'♥',name:'생명 씨앗',description:'전투 승리 후 생존 카드 체력을 10 회복합니다.'},ATTACK_CORE:{key:'ATTACK_CORE',icon:'⚔',name:'공격 코어',description:'원정 전투력이 25% 증가합니다.'},BARRIER_FIELD:{key:'BARRIER_FIELD',icon:'◆',name:'방벽 전개',description:'받는 피해가 35% 감소합니다.'},VELOCITY_LINK:{key:'VELOCITY_LINK',icon:'↯',name:'속도 연계',description:'전투력 18% 증가 · 정예전 추가 15% 증가'},LIFE_PULSE:{key:'LIFE_PULSE',icon:'♥',name:'생명 파동',description:'승리할 때마다 카드 체력을 15 회복합니다.'},BOSS_HUNTER:{key:'BOSS_HUNTER',icon:'♛',name:'보스 사냥꾼',description:'보스 전투력이 40% 증가합니다.'},SECOND_WIND:{key:'SECOND_WIND',icon:'✦',name:'두 번째 숨결',description:'전투 불능 카드 1장을 체력 40으로 부활시킵니다.'},CRYSTAL_GREED:{key:'CRYSTAL_GREED',icon:'◇',name:'마법 결정 탐욕',description:'마법 결정 +50% · 받는 피해 +5%'}})[key]||{key,icon:'✦',name:key,description:''}}
function riftMapHtml(run){const max=Number(run.maxStages||7),history=Array.isArray(run.history)?run.history:[];return `<div class="rift-stage-map">${Array.from({length:max},(_,stage)=>{const entries=history.filter(x=>Number(x.stage)===stage),entry=entries.slice(-1)[0]||null,current=Number(run.stage)===stage&&run.status==='ACTIVE',done=stage<Number(run.stage)||Boolean(entry&&(entry.result==='WIN'||entry.result==='RESOLVED')),boss=stage===3||stage===6,row=stage%2===0?'top':'bottom';const meta=entry?riftTypeMeta(entry.type):boss?{icon:'♛',label:stage===6?'최종 보스':'중간 보스'}:{icon:'✦',label:'미개방 구역'};const stateClass=entry?(entry.result==='LOSE'?'lost':'cleared'):(current?'current':'locked');const sub=entry?(entry.result==='WIN'?'전투 승리':entry.result==='LOSE'?'전투 패배':'선택 완료'):(current?'진행 중':'대기');return `<div class="rift-stage-col ${row} ${done?'done':''} ${current?'current':''}"><i class="rift-stage-connector"></i><div class="rift-stage-node ${stateClass} ${boss?'boss':''}"><span class="rift-stage-badge">${stage+1}</span><div class="rift-stage-icon">${meta.icon}</div><b>${escapeHtml(entry?.name||meta.label)}</b><small>${escapeHtml(sub)}</small></div></div>`}).join('')}</div>`}
function riftChoiceHtml(node){const m=riftTypeMeta(node.type),battle=['BATTLE','ELITE','BOSS','FINAL_BOSS'].includes(node.type),reward=node.rewardPreview||{},clearBonus=node.type==='BATTLE'?10:node.type==='ELITE'?20:0;return `<button type="button" class="rift-choice type-${String(node.type).toLowerCase()}" data-rift-node="${escapeHtml(node.id)}"><div class="rift-choice-visual">${node.image?`<img src="${escapeHtml(node.image)}" alt="">`:`<span>${m.icon}</span>`}<em>${m.label}</em></div><div class="rift-choice-copy"><small>STAGE ${Number(node.stage||0)+1}</small><h3>${escapeHtml(node.name||m.label)}</h3><p>${escapeHtml(node.description||(battle?'저장된 원정 덱으로 전투를 진행합니다.':'선택 즉시 효과가 적용됩니다.'))}</p>${clearBonus>0?`<div class="rift-choice-clear-bonus"><span>⚔ 승리 보너스</span><b>최종 보상 +${clearBonus}%</b></div>`:''}${battle?`<div class="rift-choice-rewards"><span>전투력 <b>${Number(node.battlePower||0).toLocaleString()}</b></span><span>코인 <b>+${Number(reward.coin||0).toLocaleString()}</b></span><span>조각 <b>+${Number(reward.shards||0).toLocaleString()}</b></span><span>마법 결정 <b>+${Number(reward.crystals||0).toLocaleString()}</b></span></div>`:''}<strong>${battle?'전투 준비':'선택하기'} <i>›</i></strong></div></button>`}
function renderRiftStart(root,data){const ids=(data.savedDeck||battleState.deck||[]).map(String),deck=ids.map(id=>cards.find(c=>String(c.id)===id)).filter(Boolean),weekly=data.weekly||{},max=Number(data.settings?.maxDifficulty||10),cardPower=deck.reduce((sum,card)=>sum+battleCardPower(card,loadUser(),battleState.config),0),bonus=data.characterBonus||battleState.characterBonus||{},totalPower=cardPower+Number(bonus.pve||0);root.innerHTML=`${riftWeeklyStatusStrip(data)}<section class="rift-landing"><div class="rift-space-bg"><i></i><i></i><i></i></div><div class="rift-landing-copy"><p class="eyebrow">DIMENSIONAL RIFT EXPEDITION</p><h2>차원의 균열 원정</h2><p>갈림길을 선택하고, 전투마다 원정 전용 강화를 획득해 최종 보스를 격파하세요.<br>카드 체력과 강화 효과는 원정이 끝날 때까지 유지됩니다.</p></div><div class="rift-core-orb"><span></span><b>RIFT</b><small>WEEK ${escapeHtml(String(data.weekKey||''))}</small></div></section><section class="rift-start-grid"><div class="rift-start-panel"><div class="rift-section-head"><div><p class="eyebrow">EXPEDITION DIFFICULTY</p><h3>원정 난이도 선택</h3><small>난이도가 높을수록 적 전투력과 최종 보상이 증가합니다.</small></div></div><div class="rift-difficulty-grid">${Array.from({length:max},(_,i)=>i+1).map(n=>`<button type="button" data-rift-difficulty="${n}" class="${riftState.difficulty===n?'active':''}"><small>DIFFICULTY</small><b>${n}</b><span>${n===1?'입문':n<=3?'탐색':n<=6?'심층':n<=9?'극한':'붕괴'}</span>${riftDifficultyMonsterPowerBonus(n)>0?`<em>적 전투력 +${riftDifficultyMonsterPowerBonus(n)}%</em>`:''}</button>`).join('')}</div><div class="rift-start-actions"><button type="button" class="btn rift-start-button" id="riftStartRun" ${deck.length!==5?'disabled':''}>✦ ${riftState.difficulty}단계 원정 시작</button><small>${deck.length===5?'현재 저장된 PvE 덱 5장이 원정에 고정됩니다.':'먼저 PvE 덱 편성에서 카드 5장을 저장하세요.'}</small></div></div><aside class="rift-deck-preview"><div class="rift-section-head"><div><p class="eyebrow">LOCKED EXPEDITION DECK</p><h3>원정 출전 덱</h3></div><b>${deck.length} / 5</b></div><div class="content-power-summary rift-power-summary"><small>원정 시작 전투력</small><b>${totalPower.toLocaleString()}</b><span>카드 ${cardPower.toLocaleString()} <i>+</i> 장비·칭호 ${Number(bonus.pve||0).toLocaleString()}</span></div><div class="rift-start-deck">${deck.map(c=>`<div>${cardHtml(c,true,'small rift-start-card',loadUser())}</div>`).join('')||'<div class="rift-empty">저장된 PvE 덱이 없습니다.</div>'}</div><div class="rift-rule-list"><span><i>1</i> 원정 시작 후 덱 변경 불가</span><span><i>2</i> 카드 체력은 구역 사이에 유지</span><span><i>3</i> 출정 강화 1개 선택 후 매 전투 강화</span><span><i>4</i> 주간 보상 3회 이후 기록 도전</span><span><i>5</i> PvE 덱 궁극기 발동 규칙 적용</span></div></aside></section>`;root.querySelectorAll('[data-rift-difficulty]').forEach(b=>b.onclick=()=>{riftState.difficulty=Number(b.dataset.riftDifficulty);renderRiftView(data)});root.querySelector('#riftStartRun')?.addEventListener('click',startRiftRun)}
function renderRiftRun(root,data){const run=data.run,buffs=run.buffs||[],active=run.activeNode,pending=run.pendingBuffChoices||[],failed=run.status==='FAILED',completed=run.status==='COMPLETED_PENDING';root.innerHTML=`${riftWeeklyStatusStrip(data)}<section class="rift-run-hero"><div><p class="eyebrow">DIMENSIONAL RIFT · DIFFICULTY ${run.difficulty}</p><h2>${riftStatusLabel(run.status)}</h2><p>${completed?'최종 보스를 격파했습니다. 누적한 원정 보상을 확정하세요.':failed?'원정 덱이 전투 불능 상태가 되었습니다. 새로운 원정을 준비하세요.':'현재 경로를 선택해 차원의 심층부로 진입하세요.'}</p></div><div class="rift-run-summary"><span><small>진행 구역</small><b>${Math.min(Number(run.stage||0)+1,Number(run.maxStages||7))} / ${Number(run.maxStages||7)}</b></span><span><small>난이도</small><b>${run.difficulty}</b></span><span class="${run.rewardEligible?'eligible':'practice'}"><small>보상 상태</small><b>${run.rewardEligible?'획득 가능':'기록 도전'}</b></span><span class="rift-bonus-summary"><small>전투 보너스</small><b>+${Number(run.battleRewardBonusPercent||0)}%</b></span>${Number(run.monsterPowerBonusPercent||0)>0?`<span class="rift-danger-summary"><small>적 전투력 보정</small><b>+${Number(run.monsterPowerBonusPercent)}%</b></span>`:''}</div></section><section class="rift-map-panel"><div class="rift-section-head"><div><p class="eyebrow">EXPEDITION ROUTE</p><h3>균열 경로</h3></div>${completed?'':'<button type="button" class="rift-abandon" id="riftAbandon">원정 포기</button>'}</div>${riftMapHtml(run)}</section><section class="rift-run-layout"><main class="rift-main-panel">${completed?`<div class="rift-complete-panel"><span class="rift-complete-emblem">♛</span><small>RIFT CONQUERED</small><h3>최종 균열 봉쇄 완료</h3><p>${run.rewardEligible?'이번 주 원정 보상을 수령할 수 있습니다.':'주간 보상 횟수를 모두 사용해 최고 기록만 반영됩니다.'}</p>${riftRewardHtml(run.stash,run.battleRewardBonusPercent)}<button type="button" class="btn rift-claim-button" id="riftClaim">${run.rewardEligible?'원정 보상 수령':'기록 확정'}</button></div>`:failed?`<div class="rift-failed-panel"><span>☠</span><small>EXPEDITION FAILED</small><h3>원정대 전투 불능</h3><p>진행 중 확보한 임시 보상은 소멸합니다.</p><button type="button" class="btn" id="riftNewRun">새 원정 준비</button></div>`:pending.length?`<div class="rift-buff-select${run.initialBuffPending?' starter':''}"><div class="rift-section-head"><div><p class="eyebrow">${run.initialBuffPending?'EXPEDITION PREPARATION':'RIFT EVOLUTION'}</p><h3>${run.initialBuffPending?'출정 강화 선택':'원정 강화 선택'}</h3><small>${run.initialBuffPending?(Number(run.difficulty||1)===1?'첫 경로 전에 지원 효과를 선택하세요. 1단계는 첫 패배 피해가 절반으로 감소합니다.':'첫 경로에 진입하기 전에 원정 지원 효과 1개를 선택하세요.'):'이번 원정이 끝날 때까지 유지되는 효과입니다.'}</small></div></div><div class="rift-buff-choice-grid">${pending.map(key=>{const buff=riftBuffPreview(key);return `<button type="button" data-rift-buff="${key}"><i>${buff.icon}</i><small>${run.initialBuffPending?'STARTING SUPPORT':'EXPEDITION BUFF'}</small><h4>${escapeHtml(buff.name)}</h4><p>${escapeHtml(buff.description)}</p><strong>선택하기</strong></button>`}).join('')}</div></div>`:active?`<div class="rift-encounter type-${String(active.type).toLowerCase()}"><div class="rift-encounter-visual">${active.image?`<img src="${escapeHtml(active.image)}" alt="">`:'<span>♛</span>'}<div><small>${riftTypeMeta(active.type).label}</small><h3>${escapeHtml(active.name)}</h3><p>요구 전투력 ${Number(active.battlePower||0).toLocaleString()}</p>${Number(run.monsterPowerBonusPercent||0)>0?`<span class="rift-monster-power-boost">▲ 고난도 전투력 +${Number(run.monsterPowerBonusPercent)}%</span>`:''}${Number(run.monsterUltimateDefensePercent||0)>0?`<span class="rift-monster-ultimate-resist">◆ 궁극기 내성 ${Number(run.monsterUltimateDefensePercent)}%</span>`:''}</div></div><div class="rift-power-match"><span><small>현재 생존 전투력</small><b>${Number(run.cards.reduce((s,c)=>s+Number(c.power||0)*Number(c.hp||0)/100,0)).toLocaleString()}</b></span><i>VS</i><span><small>균열 전투력</small><b>${Number(active.battlePower||0).toLocaleString()}</b></span></div><button type="button" class="btn rift-fight-button" id="riftFight">⚔ 균열 전투 시작</button></div>`:`<div class="rift-choice-section"><div class="rift-section-head"><div><p class="eyebrow">CHOOSE YOUR PATH</p><h3>${Number(run.stage||0)+1}구역 경로 선택</h3><small>선택한 경로는 되돌릴 수 없습니다.</small></div></div><div class="rift-choice-grid">${(run.currentChoices||[]).map(riftChoiceHtml).join('')||'<div class="rift-empty">다음 경로를 생성하는 중입니다.</div>'}</div></div>`}</main><aside class="rift-side-panel"><div class="rift-section-head"><div><p class="eyebrow">EXPEDITION PARTY</p><h3>원정대 생존 현황</h3></div></div><div class="rift-deck-status">${(run.cards||[]).map(riftDeckCardHtml).join('')}</div><div class="rift-side-divider"></div><div class="rift-section-head compact"><div><p class="eyebrow">ACTIVE BUFFS</p><h3>원정 강화</h3></div><b>${buffs.length}</b></div><div class="rift-buff-list">${buffs.map(riftBuffChipHtml).join('')||'<span class="rift-no-buff">아직 획득한 강화가 없습니다.</span>'}</div>${riftRewardHtml(run.stash,run.battleRewardBonusPercent)}</aside></section>`;root.querySelectorAll('[data-rift-node]').forEach(b=>b.onclick=()=>selectRiftNode(b.dataset.riftNode,b));root.querySelectorAll('[data-rift-buff]').forEach(b=>{b.dataset.riftRunId=String(run.runId||'');b.onclick=()=>chooseRiftBuff(b.dataset.riftBuff,b,b.dataset.riftRunId)});root.querySelector('#riftFight')?.addEventListener('click',fightRift);root.querySelector('#riftClaim')?.addEventListener('click',claimRiftReward);const abandonButton=root.querySelector('#riftAbandon');if(abandonButton){abandonButton.dataset.riftRunId=String(run.runId||'');abandonButton.addEventListener('click',()=>abandonRift(false,abandonButton.dataset.riftRunId,abandonButton))}root.querySelector('#riftNewRun')?.addEventListener('click',async()=>{await abandonRift(true,String(run.runId||''));await loadRiftView()})}
function renderRiftView(data=riftState.data){const root=document.getElementById('pveRiftView');if(!root)return;riftState.data=data;if(!data){root.innerHTML='<div class="rift-loading"><i></i><b>차원의 균열을 확인하는 중...</b></div>';return}if(data.run)renderRiftRun(root,data);else renderRiftStart(root,data)}
async function loadRiftView(){const root=document.getElementById('pveRiftView');if(!root||riftState.loading)return;riftState.loading=true;root.innerHTML='<div class="rift-loading"><i></i><b>차원의 균열을 확인하는 중...</b><span>주간 원정 기록과 진행 상태를 불러옵니다.</span></div>';try{const data=await apiRequest('rift/status');riftState.data=data;renderRiftView(data)}catch(e){root.innerHTML=`<div class="rift-error"><b>균열 정보를 불러오지 못했습니다.</b><span>${escapeHtml(e.message)}</span><button type="button" id="riftRetry">다시 시도</button></div>`;root.querySelector('#riftRetry')?.addEventListener('click',loadRiftView)}finally{riftState.loading=false}}
async function startRiftRun(){const button=document.getElementById('riftStartRun');if(button)button.disabled=true;try{const d=await apiRequest('rift/start',{method:'POST',body:JSON.stringify({difficulty:riftState.difficulty})});riftState.data={...(riftState.data||{}),...d};renderRiftView(riftState.data)}catch(e){alert(e.message);if(button)button.disabled=false}}
async function selectRiftNode(nodeId,button){if(button)button.disabled=true;try{const d=await apiRequest('rift/select',{method:'POST',body:JSON.stringify({runId:riftState.data.run.runId,nodeId,requestId:riftRequestId('rift-select')})});riftState.data.run=d.run;renderRiftView(riftState.data)}catch(e){alert(e.message);if(button)button.disabled=false}}
function riftAlivePower(run){return Number((run.cards||[]).reduce((sum,card)=>sum+(Number(card.power||0)*(Math.max(0,Number(card.hp||0))/100)),0).toFixed(0))}
function riftBattleModal(run,node){const modal=document.getElementById('modal');const alive=(run.cards||[]).filter(c=>Number(c.hp||0)>0).map(riftCardModel);const previewPower=riftAlivePower(run)+Number(riftState.data?.characterBonus?.pve||0);modal.className='modal show battle-modal rift-linked-battle-modal';modal.innerHTML=`<div class="modal-panel battle-stage intro rift-linked-stage"><div class="battle-backdrop"></div><div class="battle-fx-layer"></div><div class="battle-topline"><span>DIMENSIONAL RIFT BATTLE</span><b id="battlePhase">ENCOUNTER</b></div><div class="battle-hud"><div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>RIFT PARTY</b><span data-hp-text="team">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="team"></u><i data-hp-fill="team"></i><em>K.O.</em></div><small>전투력 ${previewPower.toLocaleString()}</small></div><div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${escapeHtml(node.name||'균열 적')}</b><span data-hp-text="enemy">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="enemy"></u><i data-hp-fill="enemy"></i><em>K.O.</em></div><small>전투력 ${Number(node.battlePower||0).toLocaleString()}</small></div></div><div class="battle-arena"><div class="battle-side player-side"><div class="battle-team">${alive.map((c,i)=>battleFighterHtml(c,i)).join('')}</div><small>RIFT EXPEDITION</small></div><div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div><div class="battle-side enemy-side"><div class="battle-enemy-card ${(node.type==='BOSS'||node.type==='FINAL_BOSS')?'boss':''}"><div class="enemy-card-badge">${node.type==='FINAL_BOSS'?'FINAL BOSS':node.type==='BOSS'?'BOSS':'RIFT'}</div><div class="battle-enemy-visual">${node.image?`<img src="${escapeHtml(node.image)}">`:'<div class="monster-placeholder">✦</div>'}</div><div class="battle-enemy-title">${escapeHtml(node.name||'균열 적')}</div><div class="enemy-card-power">POWER ${Number(node.battlePower||0).toLocaleString()}</div></div></div></div><div class="battle-impact"><i></i><i></i><i></i></div><div id="battleMessage" class="battle-message"><span>균열 전투 준비 중...</span></div></div>`;ensureBattleSoundButton(modal.querySelector('.battle-stage'));return modal}
async function fightRift(){const run=riftState.data.run,node=run.activeNode;if(!node)return;const button=document.getElementById('riftFight');if(button)button.disabled=true;const modal=riftBattleModal(run,node),stage=modal.querySelector('.battle-stage'),phase=modal.querySelector('#battlePhase'),count=modal.querySelector('#battleCountdown'),msg=modal.querySelector('#battleMessage');let deckCards=(run.cards||[]).filter(c=>Number(c.hp||0)>0).map(riftCardModel);try{battleTone(90,.18,'sawtooth',.035);await battleSleep(420);stage.classList.add('cards-enter');phase.textContent='TEAM DEPLOY';await battleSleep(760);stage.classList.add('enemy-enter');phase.textContent=(node.type==='BOSS'||node.type==='FINAL_BOSS')?'BOSS APPEARS':'RIFT ENCOUNTER';battleTone((node.type==='BOSS'||node.type==='FINAL_BOSS')?52:105,.34,'square',.055);if(navigator.vibrate)navigator.vibrate((node.type==='BOSS'||node.type==='FINAL_BOSS')?[100,50,150]:70);await battleSleep(840);count.textContent='READY';stage.classList.add('ready');await battleSleep(520);count.textContent='FIGHT';battleTone(440,.18,'square',.075);stage.classList.add('fight');await battleSleep(420);count.textContent='';const d=await apiRequest('rift/fight',{method:'POST',body:JSON.stringify({runId:run.runId,requestId:riftRequestId('rift-fight')})});const teamPowerLabel=stage.querySelector('.battle-hp-team small');if(teamPowerLabel)teamPowerLabel.textContent=`전투력 ${Number(d.playerPower||riftAlivePower(run)).toLocaleString()}`;let enemyHp=100,teamHp=100;const win=d.result==='WIN';let ultimateFinished=false;if(d.activatedUltimate){phase.textContent='ULTIMATE READY';await playBattleUltimate(stage,d.activatedUltimate,d.bonusDamage);const ultimateRawDamage=Math.max(0,Number(d.ultimateRawDamage||d.ultimateDamage||d.bonusDamage||0)),ultimateDefensePercent=Math.max(0,Number(d.ultimateDefensePercent||0)),ultimateDamage=Math.max(0,Number(d.ultimateDamage??d.bonusDamage??0)),ultimateHpPercent=Number(d.monsterPower||0)>0?Math.min(100,ultimateDamage/Number(d.monsterPower)*100):0;if(ultimateDamage>0){enemyHp=Math.max(0,enemyHp-ultimateHpPercent);battleSetHp(stage,'enemy',enemyHp);stage.classList.remove('member-strike','member-skill');void stage.offsetWidth;stage.classList.add('member-skill');battleBurst(stage,'73%','43%',42);battleDamage(stage,`-${Math.floor(ultimateDamage).toLocaleString()}`,'enemy',true);phase.textContent=`ULTIMATE HIT · ${Math.floor(ultimateDamage).toLocaleString()}${ultimateDefensePercent>0?` · 내성 ${ultimateDefensePercent}%`:''}${d.ultimateSourceCard?.title?` · ${d.ultimateSourceCard.title}`:''}`;battleTone(680,.32,'sawtooth',.09);if(navigator.vibrate)navigator.vibrate([80,35,140]);await battleSleep(850);if(enemyHp<=0&&win){ultimateFinished=true;phase.textContent='ULTIMATE FINISH';}}if(!ultimateFinished){phase.textContent='RIFT BATTLE RESUME';await battleSleep(250)}}if(!ultimateFinished){const hits=deckCards.length?deckCards.length:3;for(let i=0;i<hits;i++){const fighter=deckCards[Math.min(i,deckCards.length-1)]||deckCards[0];battleActivateCard(stage,Math.min(i,Math.max(0,deckCards.length-1)),fighter?.grade||'R');phase.textContent=`${fighter?.grade||'RIFT'} MEMBER STRIKE`;stage.classList.remove('member-strike','member-skill','monster-heavy-attack');void stage.offsetWidth;stage.classList.add((fighter&&gradeOrder[fighter.grade]>=gradeOrder.UR)?'member-skill':'member-strike');const dmg=win?(i===hits-1?Math.max(28,enemyHp):Math.max(12,Math.round(100/hits)+(i%2?3:0))):(i===0?18:12);enemyHp=Math.max(win&&i<hits-1?8:0,enemyHp-dmg);battleSetHp(stage,'enemy',enemyHp);battleBurst(stage,'73%','43%',22);battleDamage(stage,`-${Math.max(100,Math.round(Number(d.monsterPower||0)*dmg/100)).toLocaleString()}`,'enemy',i===hits-1);battleTone(190+i*24,.1,'square',.05);await battleSleep(520);if(enemyHp<=0&&win)break;if((i===1||(!win&&i===hits-1))&&teamHp>0){stage.classList.remove('member-strike','member-skill');stage.classList.add('monster-heavy-attack');phase.textContent=(node.type==='BOSS'||node.type==='FINAL_BOSS')?'BOSS COUNTER':'RIFT COUNTER';const hit=win?18:Math.max(26,Number(d.damage||0)/2);teamHp=Math.max(win?18:0,teamHp-hit);battleSetHp(stage,'team',teamHp);battleBurst(stage,'28%','43%',24);battleDamage(stage,`-${Math.max(100,Math.round(Number(d.playerPower||0)*hit/100)).toLocaleString()}`,'player',(node.type==='BOSS'||node.type==='FINAL_BOSS'));battleTone(78,.18,'sawtooth',.07);await battleSleep(620);stage.classList.remove('monster-heavy-attack');}}}
if(win){phase.textContent='RIFT CLEAR';stage.classList.add('final-strike-v863');battleSetHp(stage,'enemy',0);battleBurst(stage,'74%','43%',48);battleDamage(stage,'FINISH!','enemy',true);battleTone(620,.32,'sawtooth',.09);await battleSleep(920);stage.classList.add('battle-win-v863');battleSfx('victory');msg.innerHTML=`<strong>VICTORY</strong><span>내 전투력 ${Number(d.playerPower||0).toLocaleString()}${Number(d.ultimateDamage||0)>0?` + 궁극기 ${Number(d.ultimateDamage).toLocaleString()}`:''} VS 적 전투력 ${Number(d.monsterPower||0).toLocaleString()}</span>${Number(d.ultimateDefensePercent||0)>0&&Number(d.ultimateRawDamage||0)>0?`<div class="rift-ultimate-defense-result"><strong>◆ 몬스터 궁극기 내성 ${Number(d.ultimateDefensePercent)}%</strong><span>궁극기 원본 ${Number(d.ultimateRawDamage).toLocaleString()} → 적용 ${Number(d.ultimateDamage||0).toLocaleString()}</span></div>`:''}<div class="battle-reward-pop"><small>RIFT RESULT</small><b>체력 피해 ${Number(d.damage||0)}</b>${d.revivedCardId?'<div class="battle-magic-drop"><strong>✦ 두 번째 숨결 발동</strong><span>전투 불능 카드가 체력 40으로 복귀했습니다.</span></div>':''}</div><em>계속하기를 눌러 다음 진행으로 이동하세요.</em><button type="button" id="riftBattleContinue" class="battle-continue-cta">계속하기</button>`;}else{phase.textContent='RIFT DEFEAT';stage.classList.add('final-fail-v863');battleSetHp(stage,'team',0);battleBurst(stage,'26%','43%',42);battleDamage(stage,'K.O.','player',true);battleTone(48,.38,'square',.09);await battleSleep(920);stage.classList.add('battle-lose-v863');battleSfx('defeat');msg.innerHTML=`<strong>DEFEAT</strong><span>내 전투력 ${Number(d.playerPower||0).toLocaleString()}${Number(d.ultimateDamage||0)>0?` + 궁극기 ${Number(d.ultimateDamage).toLocaleString()}`:''} VS 적 전투력 ${Number(d.monsterPower||0).toLocaleString()}</span>${Number(d.ultimateDefensePercent||0)>0&&Number(d.ultimateRawDamage||0)>0?`<div class="rift-ultimate-defense-result"><strong>◆ 몬스터 궁극기 내성 ${Number(d.ultimateDefensePercent)}%</strong><span>궁극기 원본 ${Number(d.ultimateRawDamage).toLocaleString()} → 적용 ${Number(d.ultimateDamage||0).toLocaleString()}</span></div>`:''}<div class="battle-defeat-tip">이번 구역에서 체력 피해 ${Number(d.damage||0)}를 받았습니다.${d.noviceProtectionTriggered?'<br><strong>초심자 보호 발동 · 첫 패배 피해 50% 감소</strong>':''}</div><em>계속하기를 눌러 원정 현황으로 돌아갑니다.</em><button type="button" id="riftBattleContinue" class="battle-continue-cta">계속하기</button>`;}riftState.data.run=d.run;if(d.equipmentReward&&window.showEquipmentDropReward){try{await window.showEquipmentDropReward(d.equipmentReward)}catch(equipmentFxError){console.warn('균열 장비 획득 연출을 표시하지 못했습니다.',equipmentFxError)}}modal.querySelector('#riftBattleContinue').onclick=()=>{modal.className='modal';modal.innerHTML='';renderRiftView(riftState.data)}}catch(e){modal.className='modal';modal.innerHTML='';alert(e.message);if(button)button.disabled=false}}
async function chooseRiftBuff(buffKey,button,capturedRunId=''){if(button?.dataset.riftSubmitting==='1')return;if(button){button.dataset.riftSubmitting='1';button.disabled=true}const runId=String(capturedRunId||button?.dataset.riftRunId||riftState.data?.run?.runId||'');if(!runId){if(button){button.dataset.riftSubmitting='0';button.disabled=false}await loadRiftView();alert('원정 진행 상태를 다시 불러왔습니다. 강화 선택을 다시 시도해주세요.');return}try{const currentData=riftState.data||{},d=await apiRequest('rift/buff',{method:'POST',body:JSON.stringify({runId,buffKey,requestId:riftRequestId('rift-buff')})});if(!d?.run)throw new Error('강화 적용 후 원정 상태를 확인할 수 없습니다.');riftState.data={...currentData,run:d.run};renderRiftView(riftState.data)}catch(e){alert(e.message);if(button?.isConnected){button.dataset.riftSubmitting='0';button.disabled=false}else await loadRiftView()}}
async function claimRiftReward(){const button=document.getElementById('riftClaim');if(button)button.disabled=true;try{const d=await apiRequest('rift/claim',{method:'POST',body:JSON.stringify({runId:riftState.data.run.runId,requestId:riftRequestId('rift-claim')})});if(d.user)saveUser(apiUserToLocal(d.user));alert(`${d.message}\n코인 ${Number(d.reward?.coin||0).toLocaleString()} · 카드 조각 ${Number(d.reward?.shards||0).toLocaleString()} · 마법 결정 ${Number(d.reward?.magicCrystals??d.reward?.crystals??0).toLocaleString()}${Number(d.reward?.battleRewardBonusPercent||0)>0?`\n전투 승리 보너스 +${Number(d.reward.battleRewardBonusPercent)}% 적용`:''}`);await loadRiftView()}catch(e){alert(e.message);if(button)button.disabled=false}}
async function abandonRift(silent=false,capturedRunId='',button=null){const runId=String(capturedRunId||riftState.data?.run?.runId||'');if(!runId){if(!silent){await loadRiftView();alert('진행 중인 원정 정보를 다시 불러왔습니다. 원정 포기를 다시 시도해주세요.')}return}if(!silent&&!confirm('현재 원정을 포기할까요?\n누적한 임시 보상과 원정 강화가 모두 사라집니다.'))return;if(button)button.disabled=true;try{await apiRequest('rift/abandon',{method:'POST',body:JSON.stringify({runId})});riftState.data={...(riftState.data||{}),run:null};if(!silent)await loadRiftView()}catch(e){if(!silent)alert(e.message);if(button?.isConnected)button.disabled=false}}


let raidState={timer:null,data:null,resultRevealed:new Set(),resultAdvanceTimer:null,revealingResultId:0,selectedRoomId:0,lastSoundTick:-1,lastSoundInstance:0,lastHpUniqueKey:'',claimRetryTimer:null,claimInFlight:false,loadSeq:0,uiEpoch:0,claimToken:0,statusController:null,livePatchCount:0,renderedInstanceId:0,renderedParticipantOrder:''};
function stopRaidTimer(){if(raidState.timer){clearTimeout(raidState.timer);raidState.timer=null}}
function stopRaidResultAdvanceTimer(){if(raidState.resultAdvanceTimer){clearTimeout(raidState.resultAdvanceTimer);raidState.resultAdvanceTimer=null}}
function stopRaidClaimRetryTimer(){if(raidState.claimRetryTimer){clearTimeout(raidState.claimRetryTimer);raidState.claimRetryTimer=null}}
function invalidateRaidUiState({clearSelection=false,stopClaimRetry=false}={}){
  raidState.loadSeq++;
  raidState.uiEpoch++;
  raidState.claimToken++;
  raidState.claimInFlight=false;
  if(raidState.statusController){raidState.statusController.abort();raidState.statusController=null;}
  stopRaidTimer();
  stopRaidResultAdvanceTimer();
  if(stopClaimRetry)stopRaidClaimRetryTimer();
  raidState.revealingResultId=0;
  if(clearSelection)raidState.selectedRoomId=0;
}
function raidClaimViewActive(context){
  if(!context||Number(context.uiEpoch)!==Number(raidState.uiEpoch)||Number(context.token)!==Number(raidState.claimToken))return false;
  const box=document.getElementById('pveRaidView');
  if(!box||!box.isConnected||box.hidden||document.hidden)return false;
  if(String(runtimeCommandContext||'')!=='battle')return false;
  return Number(raidState.data?.current?.id||0)===Number(context.instanceId||0);
}
function raidClaimedKey(instanceId){return `cnine_raid_claimed_${String(instanceId||'')}`}
function raidResultRevealedKey(instanceId){return `cnine_raid_result_revealed_${String(instanceId||'')}`}
function markRaidClaimed(instanceId){if(!instanceId)return;try{localStorage.setItem(raidClaimedKey(instanceId),'1')}catch(_){}}
function isRaidClaimedLocally(instanceId){if(!instanceId)return false;try{return localStorage.getItem(raidClaimedKey(instanceId))==='1'}catch(_){return false}}
function markRaidResultRevealed(instanceId){const id=Number(instanceId||0);if(!id)return;raidState.resultRevealed.add(id);try{localStorage.setItem(raidResultRevealedKey(id),'1')}catch(_){}}
function isRaidResultRevealed(instanceId){const id=Number(instanceId||0);if(!id)return false;if(raidState.resultRevealed.has(id))return true;try{if(localStorage.getItem(raidResultRevealedKey(id))==='1'){raidState.resultRevealed.add(id);return true}}catch(_){}return false}
function clearRaidResultRevealed(instanceId){const id=Number(instanceId||0);if(!id)return;raidState.resultRevealed.delete(id);try{localStorage.removeItem(raidResultRevealedKey(id))}catch(_){}}
async function revealRaidResult(instanceId){const id=Number(instanceId||raidState.data?.current?.id||0);if(!id||raidState.revealingResultId===id||isRaidClaimedLocally(id))return;raidState.revealingResultId=id;stopRaidResultAdvanceTimer();markRaidResultRevealed(id);try{if(raidState.data?.current&&Number(raidState.data.current.id)===id)renderRaidView(raidState.data);await loadRaidView()}finally{raidState.revealingResultId=0}}
function bindRaidResultContinue(button,instanceId){if(!button)return;const advance=event=>{event?.preventDefault?.();event?.stopPropagation?.();void revealRaidResult(instanceId)};button.addEventListener('click',advance,{once:true});button.addEventListener('pointerup',event=>{if(event.pointerType==='touch'||event.pointerType==='pen')advance(event)},{once:true});}

function raidCombatCard(card,extra=''){
  if(!card)return '';
  return combatCardHtml(card,`raid-combat-card ${extra}`,card.breakthroughLevel??card.breakthrough_level);
}
function raidDeckUniqueCardHtml(card,index,pct,isDefeated){
  const dominant=uniqueAbilityDominant(card),type=dominant?.key||'';
  return `<div class="raid-stage-card ${isDefeated?'dead':''} ${pct<=25?'danger':''}${type?` unique-card-fx-host unique-fx-${type}`:''}" ${type?`data-unique-fx="${type}"`:''} style="--delay:${index*80}ms;--hp:${pct}%">${type?uniqueBattleFxMarkup(type):''}${raidCombatCard(card,'raid-deck-frame')}<div class="raid-card-hp"><span><b>HP</b><em>${Math.round(pct)}%</em></span><div><i style="width:${pct}%"></i><u style="width:${pct}%"></u></div></div><div class="raid-card-hit"></div></div>`;
}
function triggerRaidDeckUniqueFx(stage,type){
  if(!stage||!type)return;
  stage.querySelectorAll(`.raid-stage-card[data-unique-fx="${type}"]`).forEach((card,index)=>{
    card.classList.remove('unique-fx-active');void card.offsetWidth;setTimeout(()=>card.classList.add('unique-fx-active'),index*70);
    clearTimeout(card._uniqueFxTimer);card._uniqueFxTimer=setTimeout(()=>card.classList.remove('unique-fx-active'),1500+index*70);
  });
}
function switchPveMode(mode){
  const hunt=document.getElementById('pveHuntView'),raid=document.getElementById('pveRaidView'),rift=document.getElementById('pveRiftView');
  if(mode!=='raid')invalidateRaidUiState({clearSelection:false,stopClaimRetry:true});
  if(hunt)hunt.hidden=mode==='raid'||mode==='rift';if(raid)raid.hidden=mode!=='raid';if(rift)rift.hidden=mode!=='rift';
  document.querySelectorAll('.pve-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.pveMode===mode));
  if(mode==='raid'){stopBattleEnergyTimer();loadRaidView();return;}
  if(mode==='rift'){stopBattleEnergyTimer();loadRiftView();return;}
  const subMode=mode==='hunt'?'hunt':'deck';setPveViewMode(subMode);loadBattleView().then(()=>applyPveViewMode(subMode));
}
async function loadRaidView(){
  const box=document.getElementById('pveRaidView');if(!box||box.hidden||document.hidden)return;
  if(raidState.statusController)raidState.statusController.abort();
  const controller=new AbortController();raidState.statusController=controller;
  const requestSeq=++raidState.loadSeq,requestedRoomId=Math.max(0,Number(raidState.selectedRoomId||0));
  try{
    const params=new URLSearchParams();if(requestedRoomId)params.set('instanceId',String(requestedRoomId));
    const path=`raid/status${params.size?`?${params.toString()}`:''}`;
    const d=await apiRequest(path,{signal:controller.signal},{ttl:0,replaceInflight:true});
    if(controller.signal.aborted||requestSeq!==raidState.loadSeq||!box.isConnected||box.hidden||document.hidden)return;
    const currentId=Math.max(0,Number(d?.current?.id||0));
    if(currentId)raidState.selectedRoomId=currentId;
    else if(requestedRoomId&&Number(raidState.selectedRoomId||0)!==requestedRoomId)return;
    raidState.data=d;if(!patchRaidLiveView(d))renderRaidView(d);scheduleRaidPoll(d);
  }catch(e){
    if(e?.name==='AbortError'||controller.signal.aborted)return;
    if(requestSeq!==raidState.loadSeq||!box.isConnected||box.hidden||document.hidden)return;
    stopRaidTimer();box.innerHTML=`<section class="raid-empty"><h2>월드 레이드</h2><p>${escapeHtml(e.message)}</p></section>`;
  }finally{if(raidState.statusController===controller)raidState.statusController=null;}
}
function patchRaidLiveView(d){
  const c=d?.current,box=document.getElementById('pveRaidView'),stage=box?.querySelector('.raid-battle-stage.is-battle');
  const participantOrder=(Array.isArray(d?.participants)?d.participants:[]).map(x=>Number(x.userId||0)).join(',');
  if(!stage||String(c?.status||'').toUpperCase()!=='BATTLE'||Number(raidState.renderedInstanceId)!==Number(c?.id||0)||raidState.renderedParticipantOrder!==participantOrder)return false;
  raidState.livePatchCount=(raidState.livePatchCount+1)%4;if(raidState.livePatchCount===0)return false;
  const participants=Array.isArray(d.participants)?d.participants:[],me=d.me||participants.find(x=>Number(x.userId)===Number(loadUser()?.id)),seconds=Math.max(0,Math.ceil((Date.parse(c.endsAt)-Date.now())/1000));
  stage.querySelectorAll('.raid-stage-timer,.raid-hud-center b').forEach(node=>node.textContent=`${seconds}s`);
  const updateHp=(root,current,max)=>{if(!root)return;const pct=Math.max(0,Math.min(100,Number(current||0)/Math.max(1,Number(max||0))*100)),text=root.querySelector('.battle-hp-head span');if(text)text.textContent=`${Number(current||0).toLocaleString()} / ${Number(max||0).toLocaleString()} · ${Math.ceil(pct)}%`;root.querySelectorAll('.battle-hp-track u,.battle-hp-track i').forEach(node=>node.style.width=`${pct}%`);root.classList.toggle('hp-critical',pct>0&&pct<=25);root.classList.toggle('hp-ko',pct<=0)};
  updateHp(stage.querySelector('.battle-hp-team'),me?.currentHp,me?.maxHp);updateHp(stage.querySelector('.battle-hp-enemy'),c.currentHp,c.maxHp);
  const partyRows=box.querySelectorAll('.raid-participant-list article');participants.forEach((x,i)=>{const row=partyRows[i];if(!row)return;const pct=Math.max(0,Math.min(100,Number(x.currentHp||0)/Math.max(1,Number(x.maxHp||0))*100));row.classList.toggle('defeated',Boolean(x.isDefeated));const bar=row.querySelector('.raid-user-hp i');if(bar)bar.style.width=`${pct}%`;const labels=row.querySelectorAll('.public-name-stack>small');if(labels[1])labels[1].textContent=x.isDefeated?'전투 불능':`${Math.round(pct)}%`;const damage=row.querySelector(':scope>strong');if(damage)damage.textContent=`${Number(x.shownDamage||0).toLocaleString()} DMG`});
  const rankRows=box.querySelectorAll('.raid-rank-row'),maxDamage=Math.max(1,Number(participants[0]?.shownDamage||1));participants.slice(0,rankRows.length).forEach((x,i)=>{const row=rankRows[i];row.classList.toggle('defeated',Boolean(x.isDefeated));const name=row.querySelector('.raid-rank-name>b');if(name)name.textContent=x.nickname||'';const bar=row.querySelector('.raid-rank-name>i');if(bar)bar.style.width=`${Math.max(2,Number(x.shownDamage||0)/maxDamage*100)}%`;const damage=row.querySelector(':scope>strong');if(damage)damage.textContent=Number(x.shownDamage||0).toLocaleString()});
  const myDamage=box.querySelector('.raid-my-damage b'),myHp=box.querySelector('.raid-my-damage small');if(myDamage)myDamage.textContent=Number(me?.shownDamage||0).toLocaleString();if(myHp)myHp.textContent=me?`HP ${Math.round(Number(me.currentHp||0)/Math.max(1,Number(me.maxHp||0))*100)}%`:'레이드 미참가';
  return true;
}
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
function raidEntryViewState(data,settings={}){
  const daily=data?.dailyEntry||{count:0,limit:Number(settings.dailyEntries||1),remaining:Number(settings.dailyEntries||1)},slot=data?.slotEntry||null,slotId=String(slot?.id||''),hasSlot=Boolean(slot&&slotId&&slotId!=='ALWAYS'&&slotId!=='DAILY'&&slotId!=='LEGACY'),label=String(slot?.label||data?.schedule?.currentSlot?.label||'현재 타임');
  const slotCount=hasSlot?Number(slot.count||0):Number(daily.count||0),slotLimit=hasSlot?Number(slot.limit||1):Number(daily.limit||1),slotRemaining=Math.max(0,hasSlot?Number(slot.remaining??slotLimit-slotCount):Number(daily.remaining??daily.limit-daily.count));
  return {daily,slot,hasSlot,label,slotCount,slotLimit,slotRemaining,badge:hasSlot?`${escapeHtml(label)} ${slotCount} / ${slotLimit}회 · 오늘 합계 ${Number(daily.count||0)} / ${Number(daily.limit||0)}회`:`오늘 합계 ${Number(daily.count||0)} / ${Number(daily.limit||0)}회`,usedTitle:hasSlot?`${escapeHtml(label)} 참여 횟수를 모두 사용했습니다`:'오늘 레이드 참여 횟수를 모두 사용했습니다',usedButton:hasSlot?`${escapeHtml(label)} 횟수 소진`:'오늘 입장 횟수 소진'};
}
function renderRaidView(d){
  const box=document.getElementById('pveRaidView');if(!box)return;
  const c=d.current,s=d.settings||{},schedule=d.schedule||{isOpen:true,canEnter:true};
  raidState.renderedInstanceId=Number(c?.id||0);raidState.renderedParticipantOrder=(Array.isArray(d?.participants)?d.participants:[]).map(x=>Number(x.userId||0)).join(',');raidState.livePatchCount=0;
  if(!c&&(d.rooms||[]).length){
    const rooms=d.rooms||[],bosses=d.availableBosses||[],entryState=raidEntryViewState(d,s),used=Boolean(d.dailyEntryUsed);
    box.innerHTML=`<section class="raid-room-browser"><div class="panel-title"><div><p class="eyebrow">RAID ROOM LIST</p><h2>레이드 개설 방</h2><p>참가할 방을 선택하세요 · 동시 최대 10개</p></div><strong>${entryState.badge}</strong></div>${d.cancelledRaid?`<div class="raid-room-refund">최소 인원 미달로 이전 방이 종료되었습니다. 입장 횟수 복구${Number(d.cancelledRaid.refundCoin||0)>0?` · 개설 코인 ${Number(d.cancelledRaid.refundCoin).toLocaleString()} 환불`:''}</div>`:''}<div class="raid-room-grid">${rooms.map((room,i)=>{const remain=Math.max(0,Math.ceil((Date.parse(room.startsAt)-Date.now())/1000));return `<article class="raid-room-card ${room.joinable?'joinable':'locked'}">${room.bossImage?`<img src="${escapeHtml(room.bossImage)}" alt="">`:''}<div><small>ROOM ${String(room.roomNumber||i+1).padStart(2,'0')} · ${escapeHtml(room.status)}</small><h3>${escapeHtml(room.bossName)}</h3><p><b>${Number(room.participantCount||0)} / ${Number(s.maxParticipants||10)}</b> 참가 · 최소 ${Number(s.minParticipants||1)}명</p><span>${room.status==='LOBBY'?`대기 ${String(Math.floor(remain/60)).padStart(2,'0')}:${String(remain%60).padStart(2,'0')}`:'전투 진행 중'}</span><button class="btn raidRoomSelect" data-room-id="${Number(room.id)}" ${!room.joinable||used?'disabled':''}>${used?entryState.usedButton:room.joinable?'이 방 참가':'입장 불가'}</button></div></article>`}).join('')}</div>${bosses.length&&!used?`<div class="raid-room-create"><h3>새 레이드 방 개설</h3>${bosses.map(b=>`<button class="btn raidOpenBtn" data-boss-id="${b.id}" ${!schedule.canEnter?'disabled':''}>${escapeHtml(b.name)} · ${Number(b.openCost||0).toLocaleString()}코인</button>`).join('')}</div>`:''}</section>`;
    const roomHead=box.querySelector('.raid-room-browser>.panel-title');roomHead?.insertAdjacentHTML('beforeend','<button type="button" class="btn ghost raid-refresh-btn" id="raidRoomsRefresh">↻ 방 목록 새로고침</button>');const refresh=document.getElementById('raidRoomsRefresh');if(refresh)refresh.onclick=()=>{raidState.selectedRoomId=0;loadRaidView()};
    document.querySelectorAll('.raidRoomSelect').forEach(btn=>btn.onclick=()=>selectRaidRoom(Number(btn.dataset.roomId)));
    document.querySelectorAll('.raidOpenBtn').forEach(btn=>btn.onclick=()=>openRaid(Number(btn.dataset.bossId),btn));
    return;
  }
  if(!c){const closed=!schedule.isOpen,entryClosed=schedule.reason==='ENTRY_CLOSED',bosses=d.availableBosses||[],used=Boolean(d.dailyEntryUsed),entryState=raidEntryViewState(d,s),entry=entryState.daily;const nextOpenAt=schedule.nextOpenAt||nextRaidOpenAtFromSettings(s),nextOpenText=formatRaidOpenAt(nextOpenAt),showNextOpen=String(s.scheduleMode||'ALWAYS').toUpperCase()==='SCHEDULED'&&(closed||used);const scheduleText=showNextOpen&&nextOpenText?`<div class="raid-schedule-notice raid-next-open"><span>다음 개방</span><strong>${escapeHtml(nextOpenText)} (KST)</strong></div>`:'';const statusMessage=closed?(entryClosed?'오늘 레이드 입장이 마감되었습니다.':'현재는 레이드 개방 시간이 아닙니다.'):(used?entryState.usedTitle:`${entryState.badge} · ${entryState.slotRemaining}회 남음`);box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">USER OPEN RAID</p><h2>${escapeHtml(s.title||'월드 레이드')}</h2><p>${statusMessage}</p>${scheduleText}${bosses.length?`<div class="raid-open-boss-grid">${bosses.map(b=>`<article class="raid-open-boss">${b.image?`<img src="${escapeHtml(b.image)}" alt="">`:''}<h3>${escapeHtml(b.name)}</h3><p>개방 비용 <b>${Number(b.openCost||0).toLocaleString()} 코인</b></p><p>입장 시 1회 차감 · ${entryState.hasSlot?`${escapeHtml(entryState.label)} 최대 ${entryState.slotLimit}회`:`오늘 최대 ${Number(entry.limit)}회`}</p><button class="btn raidOpenBtn" data-boss-id="${b.id}" ${used||!schedule.canEnter?'disabled':''}>레이드 개방</button></article>`).join('')}</div>`:`<div class="raid-schedule-notice">현재 유저 개방이 허용된 보스가 없습니다.</div>`}</section>`;document.querySelectorAll('.raidOpenBtn').forEach(btn=>btn.onclick=()=>openRaid(Number(btn.dataset.bossId),btn));return;}
  if(d.raidAccess==='NOT_PARTICIPANT'||(c.status!=='LOBBY'&&!d.me)){
    box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">RAID IN PROGRESS</p><h2>레이드가 진행 중입니다</h2><p>대기실에서 참가 신청을 완료한 유저만<br>전투 화면과 종료 결과를 확인할 수 있습니다.</p><div class="raid-schedule-notice"><span>참가 상태</span><strong>미참가 · 관전 및 보상 대상 아님</strong></div></section>`;
    return;
  }
  const joined=Boolean(d.me),remain=Math.max(0,Date.parse(c.startsAt)-Date.now()),sec=Math.ceil(remain/1000),hpPct=Math.max(0,Math.min(100,Number(c.currentHp)/Math.max(1,Number(c.maxHp))*100));
  const participants=d.participants||[],me=d.me||participants.find(x=>Number(x.userId)===Number(loadUser()?.serverUserId));
  const battle=c.status==='BATTLE',ended=c.status==='ENDED';
  const resultText=c.result==='CLEAR'?'RAID CLEAR':c.result==='FAILED'?'RAID FAILED':'TIME OUT';
  if(c.status==='LOBBY'&&d.dailyEntryUsed&&!joined){
    const entryState=raidEntryViewState(d,s),nextLabel=entryState.hasSlot?'다음 운영 타임':'다음 초기화',nextValue=entryState.hasSlot?'다음 개방 타임에서 참여 횟수가 별도로 적용됩니다.':'매일 00:00 (KST)';
    box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">RAID LOBBY</p><h2>${entryState.usedTitle}</h2><p>${entryState.badge}<br>현재 대기실에는 추가로 참가할 수 없습니다.</p><div class="raid-schedule-notice"><span>${nextLabel}</span><strong>${nextValue}</strong></div></section>`;
    return;
  }
  if(c.status==='LOBBY'){
    box.innerHTML=`<section class="raid-lobby-screen"><div class="raid-lobby-boss">${c.bossImage?`<img src="${c.bossImage}" alt="">`:'<div class="raid-boss-placeholder">👹</div>'}<div><p class="eyebrow">RAID LOBBY</p><h2>${escapeHtml(c.bossName)}</h2><div class="raid-lobby-countdown"><span>전투 시작까지</span><b>${String(Math.floor(Math.max(0,sec)/60)).padStart(2,'0')}:${String(Math.max(0,sec)%60).padStart(2,'0')}</b></div><p>${c.participantCount} / ${s.maxParticipants} 참가 · 최소 ${s.minParticipants}명</p></div></div><div class="raid-lobby-progress"><i style="width:${Math.min(100,c.participantCount/Math.max(1,s.maxParticipants)*100)}%"></i></div><button class="btn raid-lobby-join" id="raidJoin" ${joined||!schedule.canEnter?'disabled':''}>${joined?'참가 완료':!schedule.canEnter?'입장 마감':'레이드 신청'}</button><div class="raid-lobby-deck">${(me?.cards||[]).slice(0,5).map(card=>`<img src="${card.image}" title="${escapeHtml(card.title)}">`).join('')||'<span>신청하면 저장된 PvE 덱 5장이 표시됩니다.</span>'}</div><div class="raid-lobby-members">${participants.map(x=>x.anonymous?`<article class="anonymous"><div class="raid-anonymous-cards">${Array.from({length:5},()=>'<i>?</i>').join('')}</div><b>${escapeHtml(x.nickname)}</b><span>🔒 전투 시작 후 공개</span></article>`:`<article><div>${(x.cards||[]).slice(0,5).map(card=>`<img src="${card.image}" alt="">`).join('')}</div><b>${escapeHtml(x.nickname)}</b><span>${Number(x.totalPower).toLocaleString()}</span></article>`).join('')||'<p>첫 참가자를 기다리는 중...</p>'}</div></section>`;
    const screen=box.querySelector('.raid-lobby-screen');screen?.insertAdjacentHTML('afterbegin',`<div class="raid-lobby-actions"><button type="button" class="btn ghost" id="raidLobbyRefresh">↻ 새로고침</button>${joined?'<button type="button" class="btn danger" id="raidLeave">레이드 퇴장</button>':''}</div>`);const refresh=document.getElementById('raidLobbyRefresh');if(refresh)refresh.onclick=()=>loadRaidView();const leave=document.getElementById('raidLeave');if(leave)leave.onclick=leaveRaid;
    if(!joined&&raidState.selectedRoomId){screen?.insertAdjacentHTML('afterbegin','<button type="button" class="btn ghost" id="raidRoomBack">← 방 목록</button>');const back=document.getElementById('raidRoomBack');if(back)back.onclick=()=>{raidState.selectedRoomId=0;loadRaidView()};}
    const join=document.getElementById('raidJoin');if(join&&!join.disabled)join.onclick=joinRaid;return;
  }
  if(ended){
    const settlementCompleted=Boolean(Number(me?.rewardClaimed||0)===1||isRaidClaimedLocally(c.id)||String(d?.claimableReward?.receiptStatus||'').toUpperCase()==='COMPLETED'||(d?.lastRaid&&Number(d.lastRaid.id)===Number(c.id)&&d.lastRaid.rewardClaimed===true));
    if(me&&settlementCompleted){box.innerHTML=`<section class="raid-empty raid-empty-polished"><p class="eyebrow">WORLD RAID</p><h2>${escapeHtml(s.title||'월드 레이드')}</h2><p>이미 보상 정산이 완료되었습니다.<br>현재 열린 레이드가 없습니다.</p></section>`;stopRaidTimer();stopRaidResultAdvanceTimer();return;}
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
  const attackDominant=uniqueAbilityDominant(attackCard),attackFxType=['attack','speed'].includes(attackDominant?.key)?attackDominant.key:'';
  const myHpPct=me?Math.max(0,Math.min(100,Number(me.currentHp)/Math.max(1,Number(me.maxHp))*100)):0;
  box.innerHTML=`<section class="raid-battle-stage is-battle ${c.enraged?'is-enraged':''}" style="--boss-attack-ms:${Math.max(1200,Number(s.bossAttackIntervalMs||5000))}ms"><div class="raid-stage-sky"><span></span><span></span><span></span></div><div class="raid-stage-header"><div><small>${c.enraged?'⚠ ENRAGED':'WORLD RAID'}</small><b>자동 전투 진행 중</b></div><div class="raid-stage-timer">${Math.max(0,Math.ceil((Date.parse(c.endsAt)-Date.now())/1000))}s</div></div><div class="raid-combat-hud"><div class="battle-hp battle-hp-team ${myHpPct>0&&myHpPct<=25?'hp-critical':myHpPct<=0?'hp-ko':''}"><div class="battle-hp-head"><b class="raid-my-public-title">${publicTitleBadgeHtml(me?.title)}MY RAID DECK</b><span>${Number(me?.currentHp||0).toLocaleString()} / ${Number(me?.maxHp||0).toLocaleString()} · ${Math.ceil(myHpPct)}%</span></div><div class="battle-hp-track"><u style="width:${myHpPct}%"></u><i style="width:${myHpPct}%"></i><em>K.O.</em></div><small>${me?`전투력 ${Number(me.totalPower||0).toLocaleString()} · 장비·칭호 포함`:'레이드 미참가'}</small></div><div class="raid-hud-center"><span>WORLD RAID</span><b>${Math.max(0,Math.ceil((Date.parse(c.endsAt)-Date.now())/1000))}s</b></div><div class="battle-hp battle-hp-enemy ${hpPct>0&&hpPct<=25?'hp-critical':hpPct<=0?'hp-ko':''}"><div class="battle-hp-head"><b>${escapeHtml(c.bossName)}</b><span>${Number(c.currentHp).toLocaleString()} / ${Number(c.maxHp).toLocaleString()} · ${Math.ceil(hpPct)}%</span></div><div class="battle-hp-track"><u style="width:${hpPct}%"></u><i style="width:${hpPct}%"></i><em>K.O.</em></div><small>${c.enraged?'⚠ ENRAGED':'BOSS'}</small></div></div><div class="raid-arena"><div class="raid-party-side"><div class="raid-party-aura"></div>${attackCard?`<div class="raid-attacker-card${attackFxType==='speed'?` unique-card-fx-host unique-fx-speed unique-fx-active unique-fx-attack-active`:''}" ${attackFxType==='speed'?`data-unique-fx="speed"`:''}>${attackFxType==='speed'?uniqueBattleFxMarkup('speed'):''}${raidCombatCard(attackCard,'raid-main-attacker')}<strong>${publicTitleBadgeHtml(attacker.title)}${escapeHtml(attacker.nickname)}</strong><span>${escapeHtml(attackCard.title)}</span></div>`:'<div class="raid-wait-orb">READY</div>'}</div>${attackFxType==='attack'?`<div class="raid-between-unique-fx unique-stage-fx unique-card-fx-host unique-fx-attack unique-fx-active unique-fx-attack-active unique-fx-between-targets">${uniqueBattleFxMarkup('attack')}</div>`:''}<div class="raid-boss-side"><div class="raid-boss-aura"></div><div class="raid-enrage-skulls" aria-hidden="true"><i>☠</i><i>☠</i><i>☠</i><i>☠</i><i>☠</i><i>☠</i></div>${c.bossImage?`<img class="raid-stage-boss" src="${c.bossImage}" alt="">`:'<div class="raid-stage-boss placeholder">👹</div>'}<div class="raid-slash-effect"></div><div class="raid-hit-flash"></div><div class="raid-floating-damage">${attacker?Math.max(1,Math.floor(Number(attacker.totalPower||0)*Number(s.damageMultiplier||1)/10)).toLocaleString():''}</div></div></div><div class="raid-my-deck-stage">${(me?.cards||[]).slice(0,5).map((card,i)=>raidDeckUniqueCardHtml(card,i,myHpPct,me?.isDefeated)).join('')||'<div class="raid-stage-empty">레이드 미참가</div>'}</div><div class="raid-boss-cast"><span>보스 공격</span><i style="animation-duration:${Math.max(800,Number(s.bossAttackIntervalMs||5000))}ms"></i></div></section><section class="raid-live-grid"><div class="raid-party"><div class="panel-title"><div><p class="eyebrow">RAID PARTY</p><h2>생존 현황</h2></div></div><div class="raid-participant-list">${participants.map(x=>{const p=Math.max(0,Math.min(100,Number(x.currentHp)/Math.max(1,Number(x.maxHp))*100));return `<article class="${x.isDefeated?'defeated':''}"><div class="raid-mini-cards">${(x.cards||[]).slice(0,5).map(card=>raidCombatCard(card,'raid-mini-frame')).join('')}</div><span class="public-name-stack">${publicTitleBadgeHtml(x.title)}<b>${escapeHtml(x.nickname)}</b><small>전투력 ${Number(x.totalPower).toLocaleString()}</small><em class="raid-user-hp"><i style="width:${p}%"></i></em><small>${x.isDefeated?'전투 불능':`${Math.round(p)}%`}</small></span><strong>${Number(x.shownDamage||0).toLocaleString()} DMG</strong></article>`}).join('')}</div></div><aside class="raid-ranking"><div class="panel-title"><div><p class="eyebrow">LIVE DAMAGE</p><h2>딜 체크 미터</h2></div></div>${participants.slice(0,Number(s.rankingSize||10)).map((x,i)=>{const max=Math.max(1,Number(participants[0]?.shownDamage||1)),pct=Math.max(2,Number(x.shownDamage||0)/max*100);return `<div class="raid-rank-row ${x.isDefeated?'defeated':''}"><b>${i+1}</b><span class="public-name-stack raid-rank-name">${publicTitleBadgeHtml(x.title)}<b>${escapeHtml(x.nickname)}</b><i style="width:${pct}%"></i></span><strong>${Number(x.shownDamage||0).toLocaleString()}</strong></div>`}).join('')}<div class="raid-my-damage"><span>내 누적 딜</span><b>${Number(me?.shownDamage||0).toLocaleString()}</b><small>${me?`HP ${Math.round(Number(me.currentHp)/Math.max(1,Number(me.maxHp))*100)}%`:'레이드 미참가'}</small></div></aside></section>`;
  const raidStage=box.querySelector('.raid-battle-stage'),instanceId=Number(c.id),attackTick=Number(c.attackTicks||0),hpUniqueKey=`${instanceId}:${Number(me?.userId||0)}`;
  ensureBattleSoundButton(raidStage);
  if(Number(raidState.lastSoundInstance)!==instanceId){raidState.lastSoundInstance=instanceId;raidState.lastSoundTick=attackTick;raidState.lastHpUniqueKey='';}
  else if(attackTick>Number(raidState.lastSoundTick)){battleSfx(c.enraged?'heavy':'hit');raidStage?.classList.add('combat-impact-shake');triggerRaidDeckUniqueFx(raidStage,'defense');setTimeout(()=>raidStage?.classList.remove('combat-impact-shake'),420);raidState.lastSoundTick=attackTick;}
  if(myHpPct>0&&myHpPct<=25&&raidState.lastHpUniqueKey!==hpUniqueKey){triggerRaidDeckUniqueFx(raidStage,'hp');raidState.lastHpUniqueKey=hpUniqueKey;}
  else if(myHpPct>25&&raidState.lastHpUniqueKey===hpUniqueKey)raidState.lastHpUniqueKey='';
}
async function claimRaidReward(attempt=0,claimContext=null){
  const instanceId=Math.max(0,Number(claimContext?.instanceId||raidState.data?.current?.id||0));
  if(!instanceId)return;
  const context=claimContext||{instanceId,uiEpoch:Number(raidState.uiEpoch),token:++raidState.claimToken};
  if(!raidClaimViewActive(context))return;
  if(raidState.claimInFlight)return;
  stopRaidClaimRetryTimer();
  raidState.claimInFlight=true;
  const btn=document.getElementById('raidClaim');
  if(btn){btn.disabled=true;btn.textContent=attempt>0?'정산 상태 확인 중...':'정산 중...';}
  let retryScheduled=false;
  try{
    const shownReward=raidState.data?.claimableReward&&Number(raidState.data.claimableReward.instanceId)===instanceId?raidState.data.claimableReward:null;
    const d=await apiRequest('raid/claim',{method:'POST',body:JSON.stringify({instanceId,expectedReward:shownReward?{instanceId,coin:Number(shownReward.coin||0),shards:Number(shownReward.shards||0),magicCrystals:Number(shownReward.magicCrystals||0)}:null})});
    if(d.equipmentReward&&window.showEquipmentDropReward){try{await window.showEquipmentDropReward(d.equipmentReward)}catch(equipmentFxError){console.warn('레이드 장비 획득 연출을 표시하지 못했습니다.',equipmentFxError)}}
    const claimedId=Number(d.instanceId||instanceId);
    markRaidClaimed(claimedId);
    markRaidResultRevealed(claimedId);
    if(d.user)saveUser(apiUserToLocal(d.user));
    const stillActive=raidClaimViewActive(context);
    if(!stillActive)return;
    const verified=await apiRequest('me');
    if(verified?.user)saveUser(apiUserToLocal(verified.user));
    if(!raidClaimViewActive(context))return;
    const actual=loadUser();
    if(Number.isFinite(Number(d.balanceAfter))&&Number(actual?.coin)!==Number(d.balanceAfter)&&String(d.rewardSource||'')!=='SERVER_RECOVERED')throw new Error('레이드 보상 코인 잔액 확인에 실패했습니다. 새로고침 후 다시 확인해주세요.');
    const inventory=(d.inventoryRewards||[]).map(x=>`${x.label||x.itemCode||'아이템'} ${Number(x.amount||0).toLocaleString()}개`);
    const lines=[`${Number(d.rewardCoin||0).toLocaleString()}코인`,`카드 조각 ${Number(d.rewardShards||0).toLocaleString()}개`,Number(d.rewardMagicCrystals||0)>0?`마법 결정 ${Number(d.rewardMagicCrystals).toLocaleString()}개`:null,...inventory].filter(Boolean);
    invalidateRaidUiState({clearSelection:true,stopClaimRetry:true});
    raidState.data={settings:raidState.data?.settings||{},schedule:raidState.data?.schedule||{},current:null,participants:[],me:null};
    alert(`레이드 보상을 수령했습니다.\n\n${lines.join('\n')}`);
    const box=document.getElementById('pveRaidView');
    if(box&&!box.hidden){renderRaidView(raidState.data);await loadRaidView();}
  }catch(e){
    const active=raidClaimViewActive(context);
    if(e?.rewardClaimed){
      markRaidClaimed(instanceId);markRaidResultRevealed(instanceId);
      if(e.user)saveUser(apiUserToLocal(e.user));
      if(active){invalidateRaidUiState({clearSelection:true,stopClaimRetry:true});raidState.data={settings:raidState.data?.settings||{},schedule:raidState.data?.schedule||{},current:null,participants:[],me:null};const box=document.getElementById('pveRaidView');if(box&&!box.hidden)await loadRaidView();}
      return;
    }
    if(!active)return;
    if(e?.rewardMismatch){
      alert('결과 화면과 서버 확정 보상이 달라 최신 확정 보상으로 다시 불러옵니다.');
      raidState.claimInFlight=false;
      await loadRaidView();
      return;
    }
    if(e?.settlementPending&&attempt<12){
      const wait=Math.max(1500,Math.min(30000,Number(e.retryAfterMs||Math.round(2000*Math.pow(1.45,attempt)))));
      if(btn&&btn.isConnected){btn.disabled=true;btn.textContent=`정산 복구 확인 중... (${attempt+1})`;}
      retryScheduled=true;
      raidState.claimRetryTimer=setTimeout(()=>{
        raidState.claimRetryTimer=null;
        raidState.claimInFlight=false;
        if(raidClaimViewActive(context))void claimRaidReward(attempt+1,context);
      },wait);
      return;
    }
    if(btn&&btn.isConnected){btn.disabled=false;btn.textContent='정산 다시 시도';}
    alert(e.message);
  }finally{
    if(!retryScheduled&&Number(context.token)===Number(raidState.claimToken))raidState.claimInFlight=false;
  }
}

async function selectRaidRoom(instanceId){raidState.selectedRoomId=Number(instanceId||0);await loadRaidView()}
async function leaveRaid(){const instanceId=Number(raidState.data?.current?.id||0);if(!instanceId||!confirm('레이드 대기실에서 퇴장할까요?\n사용한 오늘의 입장 횟수는 복구되며 같은 방에는 다시 참가할 수 없습니다.'))return;const btn=document.getElementById('raidLeave');if(btn){btn.disabled=true;btn.textContent='퇴장 중...'}try{const d=await apiRequest('raid/leave',{method:'POST',body:JSON.stringify({instanceId})});raidState.selectedRoomId=0;alert(`레이드 방에서 퇴장했습니다.\n입장 횟수 복구 완료 · 현재 참가자 ${Number(d.participantCount||0)}명`);await loadRaidView()}catch(e){alert(e.message);if(btn){btn.disabled=false;btn.textContent='레이드 퇴장'}}}
async function openRaid(bossId,btn){if(!confirm('이 레이드를 개방하면 코인이 차감되고 현재 운영 타임 참여 기회 1회를 사용합니다.\n최소 인원 미달로 취소되면 개설 코인과 입장 횟수가 자동 복구됩니다.\n\n레이드를 개방할까요?'))return;const requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;if(btn){btn.disabled=true;btn.textContent='개방 중...'}try{const d=await apiRequest('raid/open',{method:'POST',body:JSON.stringify({bossId,cardIds:battleState.deck,requestId})});raidState.selectedRoomId=Number(d.instanceId||0);raidState.loadSeq++;alert(`레이드 방이 개설되었습니다.\n${Number(d.cost||0).toLocaleString()}코인 사용 · 자동 참가 완료`);await loadRaidView()}catch(e){alert(e.message);if(btn){btn.disabled=false;btn.textContent='레이드 개방'}}}
async function joinRaid(){const btn=document.getElementById('raidJoin'),instanceId=Number(raidState.data?.current?.id||raidState.selectedRoomId||0);if(btn)btn.disabled=true;try{const d=await apiRequest('raid/join',{method:'POST',body:JSON.stringify({instanceId,cardIds:battleState.deck})});raidState.selectedRoomId=instanceId;raidState.loadSeq++;alert(`레이드 신청 완료!\n참가 전투력 ${Number(d.totalPower).toLocaleString()}\n카드 ${Number(d.cardPower||0).toLocaleString()} + 장비·칭호 ${Number(d.characterBonus?.pve||0).toLocaleString()}`);await loadRaidView()}catch(e){alert(e.message);if(btn)btn.disabled=false}}


const AUTO_DRAW_PREFS_KEY='cnine_official_auto_draw_v1305';
const AUTO_DRAW_LOCK_KEY='cnine_official_auto_draw_lock_v1305';
const AUTO_DRAW_TAB_ID=globalThis.crypto?.randomUUID?.()||`tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const autoDrawState={
  active:false,stopRequested:false,packId:'',count:20,targetRuns:0,completedRuns:0,totalCards:0,spentCoins:0,
  startedAt:0,timer:null,lockTimer:null,gradeCounts:{},highGradeHits:[],prefs:null,lastStatus:'',finishDetail:'',
  transientRetries:0,lastRequestMs:0,adaptiveDelayMs:0,receiptArchiveQueue:[]
};
function loadAutoDrawPrefs(){
  const defaults={count:20,runs:10,delayMs:4000,simplified:true,stopGrade:'NONE'};
  try{return {...defaults,...JSON.parse(localStorage.getItem(AUTO_DRAW_PREFS_KEY)||'{}')}}catch(_){return defaults}
}
function saveAutoDrawPrefs(prefs){try{localStorage.setItem(AUTO_DRAW_PREFS_KEY,JSON.stringify(prefs))}catch(_){}}
function readAutoDrawLock(){try{return JSON.parse(localStorage.getItem(AUTO_DRAW_LOCK_KEY)||'null')}catch(_){return null}}
function acquireAutoDrawLock(){
  const now=Date.now(),lock=readAutoDrawLock();
  if(lock&&lock.tabId!==AUTO_DRAW_TAB_ID&&now-Number(lock.heartbeatAt||0)<20000)return false;
  try{localStorage.setItem(AUTO_DRAW_LOCK_KEY,JSON.stringify({tabId:AUTO_DRAW_TAB_ID,heartbeatAt:now}));}catch(_){}
  clearInterval(autoDrawState.lockTimer);
  autoDrawState.lockTimer=setInterval(()=>{if(!autoDrawState.active)return;try{localStorage.setItem(AUTO_DRAW_LOCK_KEY,JSON.stringify({tabId:AUTO_DRAW_TAB_ID,heartbeatAt:Date.now()}))}catch(_){}},5000);
  return true;
}
function releaseAutoDrawLock(){
  if(autoDrawState.lockTimer){clearInterval(autoDrawState.lockTimer);autoDrawState.lockTimer=null}
  const lock=readAutoDrawLock();
  if(!lock||lock.tabId===AUTO_DRAW_TAB_ID){try{localStorage.removeItem(AUTO_DRAW_LOCK_KEY)}catch(_){}}
}
window.addEventListener('beforeunload',releaseAutoDrawLock);

function autoDrawStopLabel(grade){return grade==='SSR'?'SSR 이상':grade==='MA'?'MA 이상':grade==='LIMITED'?'LIMITED 이상':grade==='FUR'?'FUR':'정지 조건 없음'}
function autoDrawFormatTime(ms){const sec=Math.max(0,Math.floor(ms/1000)),m=Math.floor(sec/60),s=sec%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function autoDrawSetupEstimate(){
  const packId=document.getElementById('autoDrawPackId')?.value||'',pack=getPack(packId),count=Math.max(1,Number(document.getElementById('autoDrawCount')?.value||20)),runs=Math.max(1,Math.min(500,Number(document.getElementById('autoDrawRuns')?.value||1))),box=document.getElementById('autoDrawEstimate');
  if(!pack||!box)return;
  const perRun=Math.max(0,Number(pack.price||0))*count,total=perRun*runs,balance=Math.max(0,Number(loadUser()?.coin||0)),possible=perRun>0?Math.floor(balance/perRun):0;
  box.innerHTML=`<span>총 ${Number(count*runs).toLocaleString()}장 · 최대 ${Number(total).toLocaleString()}코인</span><small>현재 코인으로 최대 ${Number(possible).toLocaleString()}회 진행 가능</small>`;
}
function openAutoDrawSetup(packId,defaultCount=20){
  if(autoDrawState.active)return alert('자동 뽑기가 이미 진행 중입니다.');
  if(drawRequestInFlight)return alert('현재 카드 개봉 요청이 끝난 뒤 다시 시도해주세요.');
  const pending=readPendingDraw();
  if(pending){alert('확인되지 않은 카드 개봉 요청이 있습니다. 먼저 이전 결과를 복구합니다.');openPack(String(pending.packId),Number(pending.count),0);return;}
  const pack=getPack(packId);if(!pack)return alert('카드팩 정보를 찾지 못했습니다.');
  const prefs=loadAutoDrawPrefs(),count=[1,10,20].includes(Number(defaultCount))?Number(defaultCount):Number(prefs.count||20),modal=document.getElementById('modal');
  modal.className='modal show auto-draw-setup-modal';
  modal.innerHTML=`<div class="modal-panel auto-draw-setup-panel"><button type="button" class="icon-close auto-draw-setup-close" id="closeAutoDrawSetup">×</button><p class="eyebrow">OFFICIAL AUTO DRAW</p><h2>자동 뽑기 설정</h2><p class="auto-draw-setup-copy"><b>${escapeHtml(pack.name)}</b>을 같은 조건으로 순차 개봉합니다. 서버 요청은 한 번에 하나씩만 처리됩니다.</p><input type="hidden" id="autoDrawPackId" value="${escapeHtml(pack.id)}"><div class="auto-draw-form"><label><span>한 번에 개봉</span><select id="autoDrawCount"><option value="1" ${count===1?'selected':''}>1장</option><option value="10" ${count===10?'selected':''}>10장</option><option value="20" ${count===20?'selected':''}>20장</option></select></label><label><span>반복 횟수</span><div class="auto-draw-number"><input id="autoDrawRuns" type="number" min="1" max="500" step="1" value="${Math.max(1,Math.min(500,Number(prefs.runs||10)))}"><small>최대 500회</small></div></label><label><span>다음 개봉 간격</span><select id="autoDrawDelay"><option value="4000" ${Number(prefs.delayMs)===4000?'selected':''}>4초</option><option value="6000" ${Number(prefs.delayMs)===6000?'selected':''}>6초</option><option value="10000" ${Number(prefs.delayMs)===10000?'selected':''}>10초</option></select></label><label><span>획득 시 자동 정지</span><select id="autoDrawStopGrade"><option value="NONE" ${prefs.stopGrade==='NONE'?'selected':''}>끝까지 진행</option><option value="SSR" ${prefs.stopGrade==='SSR'?'selected':''}>SSR 이상</option><option value="MA" ${prefs.stopGrade==='MA'?'selected':''}>MA 이상</option><option value="LIMITED" ${prefs.stopGrade==='LIMITED'?'selected':''}>LIMITED 이상</option><option value="FUR" ${prefs.stopGrade==='FUR'?'selected':''}>FUR</option></select></label><label class="auto-draw-check"><input id="autoDrawSimplified" type="checkbox" ${prefs.simplified!==false?'checked':''}><span><b>연출 간소화</b><small>팩 개봉·특별 연출을 생략하고 결과만 잠시 표시합니다.</small></span></label></div><div class="auto-draw-estimate" id="autoDrawEstimate"></div><div class="auto-draw-safety"><b>자동 뽑기 안전 규칙</b><span>병렬 요청 없음 · 요청 영수증 유지 · D1 혼잡 시 동일 요청 자동 복구 · 50회마다 짧은 보호 휴식</span></div><div class="auto-draw-setup-actions"><button type="button" class="btn secondary" id="cancelAutoDrawSetup">취소</button><button type="button" class="btn" id="startAutoDraw">자동 뽑기 시작</button></div></div>`;
  const close=()=>{modal.className='modal';modal.innerHTML=''};
  document.getElementById('closeAutoDrawSetup').onclick=document.getElementById('cancelAutoDrawSetup').onclick=close;
  ['autoDrawCount','autoDrawRuns'].forEach(id=>document.getElementById(id)?.addEventListener('input',autoDrawSetupEstimate));
  document.getElementById('startAutoDraw').onclick=()=>{
    const next={count:Number(document.getElementById('autoDrawCount').value),runs:Math.max(1,Math.min(500,Math.floor(Number(document.getElementById('autoDrawRuns').value||1)))),delayMs:Number(document.getElementById('autoDrawDelay').value),simplified:Boolean(document.getElementById('autoDrawSimplified').checked),stopGrade:String(document.getElementById('autoDrawStopGrade').value||'NONE')};
    saveAutoDrawPrefs(next);close();startOfficialAutoDraw(pack.id,next);
  };
  autoDrawSetupEstimate();
}
function startOfficialAutoDraw(packId,prefs){
  if(autoDrawState.active||drawRequestInFlight)return alert('현재 카드 개봉 요청을 처리 중입니다.');
  const pack=getPack(packId);if(!pack)return alert('카드팩 정보를 찾지 못했습니다.');
  if(!acquireAutoDrawLock())return alert('다른 탭에서 자동 뽑기가 진행 중입니다.\n중복 요청 방지를 위해 한 탭에서만 사용할 수 있습니다.');
  const count=[1,10,20].includes(Number(prefs.count))?Number(prefs.count):20,runs=Math.max(1,Math.min(500,Number(prefs.runs||1))),cost=Number(pack.price||0)*count;
  if(Number(loadUser()?.coin||0)<cost){releaseAutoDrawLock();return alert(`코인이 부족합니다.\n${count}장 개봉에는 ${Number(cost).toLocaleString()}코인이 필요합니다.`);}
  Object.assign(autoDrawState,{active:true,stopRequested:false,packId:String(pack.id),count,targetRuns:runs,completedRuns:0,totalCards:0,spentCoins:0,startedAt:Date.now(),timer:null,gradeCounts:{},highGradeHits:[],prefs:{...prefs,count,runs},lastStatus:'자동 뽑기 시작',finishDetail:'',transientRetries:0,lastRequestMs:0,adaptiveDelayMs:0,receiptArchiveQueue:[]});
  renderAutoDrawDock();runOfficialAutoDrawNext();
}
function clearAutoDrawTimer(){if(autoDrawState.timer){clearTimeout(autoDrawState.timer);autoDrawState.timer=null}}
function renderAutoDrawDock(){
  let dock=document.getElementById('autoDrawDock');
  if(!autoDrawState.active){dock?.remove();return}
  if(!dock){dock=document.createElement('aside');dock.id='autoDrawDock';dock.className='auto-draw-dock';document.body.appendChild(dock)}
  const pack=getPack(autoDrawState.packId),elapsed=Date.now()-autoDrawState.startedAt,progress=autoDrawState.targetRuns?Math.min(100,autoDrawState.completedRuns/autoDrawState.targetRuns*100):0;
  dock.innerHTML=`<div class="auto-draw-dock-head"><span><i></i> AUTO DRAW</span><b>${escapeHtml(pack?.name||'카드팩')}</b></div><div class="auto-draw-dock-progress"><span style="width:${progress}%"></span></div><div class="auto-draw-dock-values"><strong>${autoDrawState.completedRuns} / ${autoDrawState.targetRuns}회</strong><span>${Number(autoDrawState.totalCards).toLocaleString()}장 · ${Number(autoDrawState.spentCoins).toLocaleString()}코인</span><small>${escapeHtml(autoDrawState.lastStatus||'진행 중')} · ${autoDrawFormatTime(elapsed)}</small></div><button type="button" id="stopAutoDrawDock" ${autoDrawState.stopRequested?'disabled':''}>${autoDrawState.stopRequested?'종료 대기 중':'자동 뽑기 중지'}</button>`;
  const stop=dock.querySelector('#stopAutoDrawDock');if(stop)stop.onclick=requestStopAutoDraw;
}
function updateAutoDrawDock(status=''){if(status)autoDrawState.lastStatus=status;renderAutoDrawDock()}
function requestStopAutoDraw(){
  if(!autoDrawState.active)return;
  autoDrawState.stopRequested=true;clearAutoDrawTimer();updateAutoDrawDock(drawRequestInFlight?'현재 개봉 지급 완료 후 종료합니다.':'사용자 중지 요청');
  if(!drawRequestInFlight)finishOfficialAutoDraw('사용자가 중지했습니다.');
}
function autoDrawHitStopGrade(results=[]){
  const target=String(autoDrawState.prefs?.stopGrade||'NONE');if(target==='NONE')return null;
  const targetPower=Number(gradeOrder[target]||999);
  return results.map(x=>x?.card).find(card=>Number(gradeOrder[String(card?.grade||'').toUpperCase()]||0)>=targetPower)||null;
}
function collectAutoDrawBatch(results=[]){
  autoDrawState.completedRuns+=1;autoDrawState.totalCards+=results.length;
  const pack=getPack(autoDrawState.packId);autoDrawState.spentCoins+=Math.max(0,Number(pack?.price||0))*autoDrawState.count;
  results.forEach(item=>{const card=item?.card,grade=String(card?.grade||'').toUpperCase();if(!grade)return;autoDrawState.gradeCounts[grade]=Number(autoDrawState.gradeCounts[grade]||0)+1;if(Number(gradeOrder[grade]||0)>=Number(gradeOrder.SSR)){autoDrawState.highGradeHits.unshift({grade,title:String(card?.title||card?.name||'카드'),duplicate:Boolean(item?.duplicate)});autoDrawState.highGradeHits=autoDrawState.highGradeHits.slice(0,18)}});
}
function autoDrawSummaryMarkup(){
  const grades=Object.entries(autoDrawState.gradeCounts).sort((a,b)=>Number(gradeOrder[b[0]]||0)-Number(gradeOrder[a[0]]||0));
  return `<div class="auto-draw-summary-stats"><div><small>완료 횟수</small><b>${autoDrawState.completedRuns}회</b></div><div><small>획득 카드</small><b>${Number(autoDrawState.totalCards).toLocaleString()}장</b></div><div><small>사용 코인</small><b>${Number(autoDrawState.spentCoins).toLocaleString()}</b></div><div><small>진행 시간</small><b>${autoDrawFormatTime(Date.now()-autoDrawState.startedAt)}</b></div></div><div class="auto-draw-grade-summary">${grades.map(([grade,value])=>`<span class="grade-${grade.toLowerCase()}"><b>${escapeHtml(grade)}</b>${Number(value).toLocaleString()}장</span>`).join('')||'<span>획득 결과 없음</span>'}</div>${autoDrawState.highGradeHits.length?`<div class="auto-draw-high-list"><h3>SSR 이상 획득 기록</h3>${autoDrawState.highGradeHits.map(row=>`<div><b>${escapeHtml(row.grade)}</b><span>${escapeHtml(row.title)}</span><small>${row.duplicate?'중복':'신규'}</small></div>`).join('')}</div>`:''}`;
}
function finishOfficialAutoDraw(reason='자동 뽑기 완료',detail=''){
  if(!autoDrawState.active)return;
  clearAutoDrawTimer();autoDrawState.active=false;autoDrawState.stopRequested=false;releaseAutoDrawLock();document.getElementById('autoDrawDock')?.remove();
  const modal=document.getElementById('modal');modal.className='modal show auto-draw-summary-modal';
  modal.innerHTML=`<div class="modal-panel auto-draw-summary-panel"><p class="eyebrow">AUTO DRAW REPORT</p><h2>${escapeHtml(reason)}</h2>${detail?`<p class="auto-draw-finish-detail">${escapeHtml(detail)}</p>`:''}${autoDrawSummaryMarkup()}<div class="auto-draw-summary-actions"><button type="button" class="btn" id="autoDrawSummaryConfirm">확인</button><button type="button" class="btn secondary" id="autoDrawSummaryAgain" ${autoDrawState.completedRuns?'':'disabled'}>같은 설정으로 다시 시작</button></div></div>`;
  const snapshot={packId:autoDrawState.packId,prefs:{...autoDrawState.prefs}};
  document.getElementById('autoDrawSummaryConfirm').onclick=()=>renderShell('buy');
  const again=document.getElementById('autoDrawSummaryAgain');if(again)again.onclick=()=>{modal.className='modal';modal.innerHTML='';startOfficialAutoDraw(snapshot.packId,snapshot.prefs)};
}
function renderAutoDrawProcessing(pack,count){
  const modal=document.getElementById('modal');modal.className='modal show opening-modal auto-draw-processing-modal';
  modal.innerHTML=`<div class="modal-panel auto-draw-processing-panel"><div class="auto-draw-loader"><i></i><i></i><i></i></div><p class="eyebrow">AUTO DRAW PROCESSING</p><h2>${escapeHtml(pack.name)} · ${count}장</h2><p id="autoDrawProcessingMessage">서버에서 카드 지급 결과를 확정하고 있습니다.</p><small id="autoDrawProcessingStep">${autoDrawState.completedRuns+1} / ${autoDrawState.targetRuns}회차</small><button type="button" class="btn secondary" id="stopAutoDrawProcessing">현재 개봉 후 중지</button></div>`;
  document.getElementById('stopAutoDrawProcessing').onclick=requestStopAutoDraw;
}
function scheduleOfficialAutoDrawNext(){
  if(!autoDrawState.active)return;
  clearAutoDrawTimer();
  const baseDelay=Math.max(4000,Number(autoDrawState.prefs?.delayMs||4000));
  const adaptiveDelay=Math.max(0,Number(autoDrawState.adaptiveDelayMs||0));
  const protectionBreak=autoDrawState.completedRuns>0&&autoDrawState.completedRuns%50===0;
  const delay=protectionBreak?Math.max(baseDelay,adaptiveDelay,20000):Math.max(baseDelay,adaptiveDelay);
  const label=protectionBreak?`서버 보호 휴식 ${(delay/1000).toFixed(0)}초`:adaptiveDelay>baseDelay?`혼잡 완화 대기 ${(delay/1000).toFixed(0)}초`:`다음 개봉까지 ${(delay/1000).toFixed(1)}초`;
  updateAutoDrawDock(label);
  autoDrawState.timer=setTimeout(()=>{autoDrawState.timer=null;runOfficialAutoDrawNext()},delay);
}
function handleOfficialAutoDrawBatch(results=[]){
  autoDrawState.transientRetries=0;
  autoDrawState.adaptiveDelayMs=Math.max(0,Math.floor(Number(autoDrawState.adaptiveDelayMs||0)*0.72)-1000);
  collectAutoDrawBatch(results);const hit=autoDrawHitStopGrade(results);updateAutoDrawDock(`${autoDrawState.completedRuns}회차 지급 완료`);
  if(autoDrawState.stopRequested){autoDrawState.timer=setTimeout(()=>finishOfficialAutoDraw('자동 뽑기 중지','현재 진행 중이던 개봉까지 정상 지급했습니다.'),700);return}
  if(hit){autoDrawState.timer=setTimeout(()=>finishOfficialAutoDraw(`${autoDrawStopLabel(autoDrawState.prefs.stopGrade)} 획득으로 정지`,`${hit.title||hit.name||'카드'} 획득`),900);return}
  if(autoDrawState.completedRuns>=autoDrawState.targetRuns){autoDrawState.timer=setTimeout(()=>finishOfficialAutoDraw('설정한 자동 뽑기를 완료했습니다.'),900);return}
  scheduleOfficialAutoDrawNext();
}
async function runOfficialAutoDrawNext(){
  if(!autoDrawState.active)return;
  if(autoDrawState.stopRequested)return finishOfficialAutoDraw('자동 뽑기 중지');
  if(autoDrawState.completedRuns>=autoDrawState.targetRuns)return finishOfficialAutoDraw('설정한 자동 뽑기를 완료했습니다.');
  const pack=getPack(autoDrawState.packId);if(!pack)return finishOfficialAutoDraw('자동 뽑기 오류','카드팩 정보를 불러오지 못했습니다.');
  const cost=Math.max(0,Number(pack.price||0))*autoDrawState.count,balance=Math.max(0,Number(loadUser()?.coin||0));
  if(balance<cost)return finishOfficialAutoDraw('코인 부족으로 자동 종료',`${autoDrawState.count}장 개봉에 ${Number(cost).toLocaleString()}코인이 필요합니다.`);
  updateAutoDrawDock(`${autoDrawState.completedRuns+1}회차 개봉 요청 중`);
  await openPack(pack.id,autoDrawState.count,cost,{autoRun:true});
}

function bindView(tab) {
  if(tab==='buy'){loadSupplyBoxShop();loadVehicleDrawShop();}
  if(tab==='inventory')loadInventory();
  if(tab==='character'&&typeof window.bindCharacterView==='function')window.bindCharacterView();
  if(tab==='evolution'&&typeof window.bindEvolutionView==='function')window.bindEvolutionView();
  if(tab==='magic')loadMagicView();
  if(tab==='messages'){document.getElementById('openWagoVerify')?.addEventListener('click',openWagoVerification);loadMessages();}
  if(tab==='dailyquest'){document.getElementById('dailyQuestPostCheck')?.addEventListener('click',()=>checkDailyQuest());document.getElementById('dailyQuestPostClaim')?.addEventListener('click',()=>claimDailyQuest());loadDailyQuest();}
  const accountBtn=document.getElementById('playerAccountBtn'); if(accountBtn) accountBtn.onclick=showAccountPanel;
  document.querySelectorAll('.pack-choice').forEach(button => button.onclick = () => { selectedPackId = button.dataset.packId; renderShell('buy'); });
  document.querySelectorAll('.draw').forEach(b => b.onclick = () => openPack(b.dataset.packId, Number(b.dataset.count), Number(b.dataset.cost)));
  document.querySelectorAll('.auto-draw-config').forEach(b=>b.onclick=()=>openAutoDrawSetup(b.dataset.packId,Number(b.dataset.defaultCount||20)));
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
    syncCollectionFromServer({rerender:true});
    document.querySelectorAll('.dex-fold-button').forEach(h=>h.onclick=()=>h.closest('.dex-section').classList.toggle('collapsed'));
    document.querySelectorAll('.card-frame').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
    const search=document.getElementById('dexSearch'),filter=document.getElementById('gradeFilter'),sort=document.getElementById('dexSort'),favoriteOnly=document.getElementById('favoriteMemberOnly');
    const apply=()=>{const prefs=loadDexPrefs(),q=search.value.trim().toLowerCase(),g=filter.value;document.querySelectorAll('.dex-section').forEach(section=>{let visible=0;section.querySelectorAll('.card-frame').forEach(el=>{const c=cards.find(x=>x.id===el.dataset.id),show=(!q||c.title.toLowerCase().includes(q)||c.name.toLowerCase().includes(q))&&(!g||c.grade===g);el.style.display=show?'':'none';if(show)visible++});const favoriteMatch=!prefs.favoriteOnly||section.classList.contains('favorite-member');section.style.display=visible&&favoriteMatch?'':'none';if(q||g)section.classList.remove('collapsed')});prefs.search=search.value;prefs.grade=g;saveDexPrefs(prefs)};
    document.querySelectorAll('.dex-member-favorite').forEach(button=>button.onclick=e=>{e.stopPropagation();const prefs=loadDexPrefs(),name=button.dataset.favoriteMember,list=new Set(prefs.favoriteMembers||[]);list.has(name)?list.delete(name):list.add(name);prefs.favoriteMembers=[...list];saveDexPrefs(prefs);renderShell('dex')});
    search.oninput=apply;filter.onchange=apply;sort.onchange=()=>{const prefs=loadDexPrefs();prefs.sort=sort.value;saveDexPrefs(prefs);renderShell('dex')};favoriteOnly.onclick=()=>{const prefs=loadDexPrefs();prefs.favoriteOnly=!prefs.favoriteOnly;saveDexPrefs(prefs);renderShell('dex')};const uniqueLegend=document.querySelector('[data-scroll-unique]');if(uniqueLegend)uniqueLegend.onclick=()=>{const first=document.querySelector('.dex-card-display .deck-ability-icon, .card-unique-badge');if(first){first.closest('.dex-section')?.classList.remove('collapsed');first.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>first.classList.add('pulse'),300);setTimeout(()=>first.classList.remove('pulse'),1700)}};apply();
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
    {key:'speed',label:'속도',icon:'↯',value:Number(x.speedPercent||0)},
    {key:'hp',label:'HP',icon:'♥',value:Number(x.hpPercent||0)}
  ];
}
function uniqueAbilityDominant(card){
  const x=card?.uniqueAbility||card;if(!x)return null;
  const stats=uniqueAbilityStats({uniqueAbility:x}),highest=Math.max(...stats.map(stat=>Number(stat.value||0)));
  if(!(highest>0))return null;
  return stats.find(stat=>Number(stat.value||0)===highest)||null;
}
function uniqueAbilityTypeInfo(card){
  const dominant=uniqueAbilityDominant(card);
  return dominant?{...dominant,typeLabel:`${dominant.label}형`,typeClass:`unique-type-${dominant.key}`}:{key:'',label:'',icon:'◇',value:0,typeLabel:'고유',typeClass:'unique-type-none'};
}
function uniqueAbilityScopeText(x){
  const scopes=[];if(x?.scopes?.pve)scopes.push('PVE · 무한의탑 · 레이드');if(x?.scopes?.pvp)scopes.push('PVP');if(x?.scopes?.captain)scopes.push('대장전');return scopes.join(' / ')||'적용 콘텐츠 없음';
}
function uniqueAbilityBadgeHtml(card,classes=''){
  const x=card?.uniqueAbility;if(!x||/(?:detail-card|special-reveal|battle-fighter|raid-combat|raid-mini|captain-combat|captain-v3-combat)/.test(String(classes)))return '';
  const type=uniqueAbilityTypeInfo(card);
  return `<span class="card-unique-badge ${type.typeClass} ${x.ownerTest?'owner-test':''}" data-card-profile="${escapeHtml(String(card.id))}" role="button" tabindex="0" aria-label="${escapeHtml(card.title||'카드')} ${escapeHtml(type.typeLabel)} 고유 효과 보기"><i>◇</i><b>${escapeHtml(type.typeLabel)}</b></span>`;
}
function uniqueAbilityInlineHtml(card,classes=''){
  const x=card?.uniqueAbility;if(!x)return '';
  const type=uniqueAbilityTypeInfo(card),dominant=uniqueAbilityDominant(card),stats=uniqueAbilityStats(card).filter(stat=>stat.value!==0).sort((a,b)=>Number(b.value)-Number(a.value)).slice(0,2);
  return `<span class="card-ability-inline ${type.typeClass} ${classes} ${x.ownerTest?'owner-test':''}" data-card-profile="${escapeHtml(String(card.id))}" role="button" tabindex="0"><i>◇</i><b>${x.ownerTest?'TEST · ':''}${escapeHtml(type.typeLabel)}</b>${stats.map(stat=>`<em class="${dominant?.key===stat.key?'dominant':''}">${stat.icon} ${stat.value>0?'+':''}${stat.value}%</em>`).join('')}<u>상세</u></span>`;
}

function uniqueAbilityDeckChipHtml(card,classes=''){
  const x=card?.uniqueAbility;if(!x)return '';
  const type=uniqueAbilityTypeInfo(card),dominant=uniqueAbilityDominant(card),value=Number(dominant?.value||0);
  return `<span class="deck-type-chip ${type.typeClass} ${classes} ${x.ownerTest?'owner-test':''}" data-card-profile="${escapeHtml(String(card.id))}" role="button" tabindex="0"><i>◇</i><b>${escapeHtml(type.typeLabel)}</b>${value?`<em>${value>0?'+':''}${value}%</em>`:''}</span>`;
}
function deckBuilderStatusMeta(card,user=loadUser()){
  const level=Number(user?.breakthroughs?.[card.id]||0),limited=card.limitedTotal!==null&&card.limitedTotal!==undefined;
  return `<span class="deck-meta-pill breakthrough">돌파 ★${level}</span><span class="deck-meta-pill grade">${escapeHtml(card.grade||card.rarity||'C')}</span><span class="deck-meta-pill edition">${limited?'한정판':'일반'}</span>${powerTypeIndicatorHtml(card,'deck-meta-power-type')}`;
}
function deckBuilderListCardHtml(card,user=loadUser(),powerValue=0,mode='pve-pick'){
  const secondary=escapeHtml(card.name||'');
  const powerText=Math.max(0,Number(powerValue||0)).toLocaleString();
  const isSlot=String(mode).includes('slot');
  return `<div class="deck-builder-card-body ${escapeHtml(mode)}">
    <div class="deck-builder-thumb-wrap"><img class="deck-builder-thumb" src="${card.image}" alt="${escapeHtml(card.title)}" style="object-position:${Number(card.focusX??50)}% ${Number(card.focusY??50)}%"></div>
    <div class="deck-builder-copy">
      <div class="deck-builder-head"><div class="deck-builder-title-box">${secondary?`<small>${secondary}</small>`:''}<b>${escapeHtml(card.title)}</b></div><strong class="deck-builder-power">${powerText}</strong></div>
      <div class="deck-builder-meta">${deckBuilderStatusMeta(card,user)}</div>
      <div class="deck-builder-chip-row">${uniqueAbilityDeckChipHtml(card,'deck-builder-chip')}${!card.uniqueAbility?'<span class="deck-type-chip deck-type-none"><b>기본형</b></span>':''}${isSlot?'<span class="deck-slot-action">클릭해서 제외</span>':''}</div>
    </div>
  </div>`;
}
function uniqueAbilityDetailHtml(card){
  const x=card?.uniqueAbility;if(!x)return '<div class="card-unique-empty"><i>◇</i><b>설정된 고유 능력이 없습니다.</b><span>고유 능력이 활성화된 카드에는 도감과 덱 화면에 전용 배지가 표시됩니다.</span></div>';
  const type=uniqueAbilityTypeInfo(card),dominant=uniqueAbilityDominant(card),stat=({key,label,icon,value})=>`<article class="unique-stat unique-${key} ${dominant?.key===key?'dominant':''}"><i>${icon}</i><span>${label}${dominant?.key===key?'<em>대표 발동</em>':''}</span><b>${value>0?'+':''}${value}%</b></article>`;
  return `<section class="card-unique-ability ${type.typeClass} ${x.ownerTest?'owner-test':''}"><div class="unique-ability-head"><div><small>${x.ownerTest?'OWNER TEST · ':''}UNIQUE ABILITY</small><h3>${escapeHtml(type.typeLabel)} · ${escapeHtml(x.effectName||'카드 고유 능력')}</h3></div><em>${x.ownerTest?'TEST MODE':'ACTIVE'}</em></div>${x.ownerTest?'<div class="unique-owner-notice"><b>OWNER 테스트 중</b><span>일반 유저에게는 아직 공개·적용되지 않는 능력치입니다.</span></div>':''}<div class="unique-ability-stats">${uniqueAbilityStats(card).map(stat).join('')}</div>${x.effectDescription?`<div class="unique-effect-copy"><small>ABILITY DESCRIPTION</small><p>${escapeHtml(x.effectDescription)}</p></div>`:'<div class="unique-effect-copy muted"><small>ABILITY DESCRIPTION</small><p>등록된 고유 효과 설명이 없습니다.</p></div>'}<div class="unique-scope"><small>적용 콘텐츠</small><b>${escapeHtml(uniqueAbilityScopeText(x))}</b></div><footer><span>공격·방어·속도·HP 수치는 모두 전투 계산에 반영됩니다.</span><b>${dominant?`${escapeHtml(type.typeLabel)} · ${dominant.value>0?'+':''}${dominant.value}% 대표 이펙트 발동`:'대표 발동 이펙트 없음'}</b></footer></section>`;
}

function uniqueBattleEvents(uniquePayload){
  return Array.isArray(uniquePayload?.battleEffects?.events)?uniquePayload.battleEffects.events:[];
}
function uniqueBattleCardIndex(cards,cardId){
  if(!Array.isArray(cards))return -1;
  return cards.findIndex(card=>String(card?.id||card?.card_id||'')===String(cardId||''));
}
async function playUniqueBattleEventSequence(stage,phase,msg,uniquePayload,cards=[],enemy=false){
  const events=uniqueBattleEvents(uniquePayload).slice(0,6);
  if(!events.length||!stage||!phase)return;
  for(const event of events){
    const type=String(event?.type||'').toUpperCase();
    const index=uniqueBattleCardIndex(cards,event?.cardId);
    if(index>=0){
      const trigger=type==='DEFENSE'?'defense':type==='HP'?'low-hp':'attack';
      battleTriggerUniqueFx(stage,index,trigger,enemy);
    }
    phase.textContent=`${enemy?'ENEMY ':'UNIQUE '} ${event?.label||'효과'} 발동`;
    if(msg)msg.innerHTML=`<span>${escapeHtml(event?.cardTitle||'카드')} · ${escapeHtml(event?.summary||'고유 효과 발동')}</span>`;
    await battleSleep(type==='HP'?620:460);
  }
}

function deckAbilityIconHtml(card,classes=''){
  if(!/(?:pve-deck-card-display|pvp-card-display|dex-card-display|rift-start-card|rift-card-display)/.test(String(classes)))return '';
  const dominant=uniqueAbilityDominant(card);
  if(!dominant)return '';
  const icon=dominant.key==='attack'?'⚔':dominant.key==='defense'?'⬡':dominant.key==='speed'?'↯':'♥';
  const type=uniqueAbilityTypeInfo(card);
  return `<span class="deck-ability-icon ${type.typeClass} ${card?.uniqueAbility?.ownerTest?'owner-test':''}" aria-label="${escapeHtml(type.typeLabel)}"><i>${icon}</i></span>`;
}

function cardHtml(card, owned, classes='', user=loadUser()) {
  const uniqueBadge=uniqueAbilityBadgeHtml(card,classes);
  if(!owned)return `<article class="card-frame locked ${classes}" data-id="${card.id}"><div class="card-inner"><div class="card-art"><span class="missing">?</span></div><div class="card-footer"><div class="card-title-row"><div class="card-title">미획득 카드</div>${uniqueBadge}</div></div></div></article>`;
  const limited=card.limitedTotal!==null&&card.limitedTotal!==undefined;
  const remain=limited?Math.max(0,Number(card.limitedTotal)-Number(card.issuedCount||0)):null;
  const level=Number(user?.breakthroughs?.[card.id]||0);
  const breakthrough=level>0?` breakthrough-${level}`:'';
  const deckCard=/(?:pve-deck-card-display|pvp-card-display|rift-start-card|rift-card-display)/.test(String(classes));
  const dexCard=/dex-card-display/.test(String(classes));
  const iconCard=deckCard||dexCard;
  const topBadges=iconCard?`<div class="deck-card-top-badges">${deckAbilityIconHtml(card,classes)}${level>0?`<div class="breakthrough-badge">★${level}</div>`:''}</div>`:(level>0?`<div class="breakthrough-badge">★${level}</div>`:'');
  return `<article class="card-frame grade-${card.grade}${breakthrough} ${classes}" data-id="${card.id}">${!deckCard&&limited?`<div class="limited-badge">한정판 ${remain}/${card.limitedTotal}</div>`:''}${topBadges}<div class="card-holo"></div><div class="breakthrough-effect"></div><div class="card-inner"><div class="card-header"><span>${card.grade}${deckCard?'':powerTypeIndicatorHtml(card)}</span><b>CNINE</b></div><div class="card-art"><img loading="lazy" src="${card.image}" alt="${escapeHtml(card.title)}" style="object-position:${card.focusX}% ${card.focusY}%"></div><div class="card-footer"><div><small>${escapeHtml(card.name)}</small><div class="card-title-row"><div class="card-title">${escapeHtml(card.title)}</div>${iconCard?'':uniqueBadge}</div></div><img src="assets/ui/cninelogo.png" class="card-mini-logo" alt="CNINE"></div></div></article>`;
}

function showDetail(id,initialTab='auto') {
  const user=loadUser(), card=cards.find(c=>String(c.id)===String(id)); if(!card)return;
  const normalizedId=String(card.id),owned=ownedIds(user).has(normalizedId),history=user.history.find(x=>String(x.cardId)===normalizedId),modal=document.getElementById('modal');
  const level=Number(user.breakthroughs?.[normalizedId]||0),normalizedGrade=String(card.grade||'').trim().toUpperCase(),canBreak=owned&&(gradeOrder[normalizedGrade]||0)>=gradeOrder[breakthroughMinGrade],isMa=normalizedGrade==='MA',maxLevel=isMa?13:10,isMaHigh=isMa&&level>=10&&level<13,standardRule=user.breakthroughConfig?.[normalizedGrade]?.[level]||{cost:breakthroughCosts[level],rate:breakthroughRates[level]},highRule=user.maHighBreakthrough?.steps?.[level-10],rule=isMaHigh?highRule:standardRule,cost=level<maxLevel?Number(rule?.cost||0):null,successRate=level<maxLevel?Number(rule?.rate||0):null,materialBalance=isMaHigh?Number(user.masterStars||0):Number(user.cardShards||0),materialName=isMaHigh?'마스터의 별':'카드 조각',highEnabled=user.maHighBreakthrough?.enabled===true;
  const hasUnique=Boolean(card.uniqueAbility),uniqueType=uniqueAbilityTypeInfo(card),activeTab=hasUnique&&initialTab!=='info'?'ability':'info',basePower=Number(card.basePower||0);
  const infoPanel=`<section class="card-profile-panel ${activeTab==='info'?'active':''}" data-profile-panel="info"><div class="card-profile-facts"><article><small>보유 상태</small><b>${owned?'보유 중':'미획득'}</b></article><article><small>등급</small><b>${escapeHtml(card.grade||'?')}</b></article><article><small>기본 전투력</small><b>${basePower>0?basePower.toLocaleString():'-'}</b></article><article><small>전투력 유형</small><b>${escapeHtml(powerTypeIndicator(card)||'기본')}</b></article></div>${owned?`<div class="breakthrough-info"><span>돌파 단계</span><strong>${level>=maxLevel?`★${maxLevel} MAX`:`★${level}`}</strong><small>보유 ${materialName} ${materialBalance.toLocaleString()}개</small>${canBreak?(level<maxLevel?(isMaHigh&&!highEnabled?'<b class="max-breakthrough">MA 고급 강화 운영 준비 중</b>':`<button type="button" class="btn breakthrough-btn${materialBalance<cost?' material-shortage':''}" id="breakthroughBtn" data-breakthrough-card="${escapeHtml(normalizedId)}" data-client-shortage="${materialBalance<cost?'1':'0'}">${materialName} ${cost.toLocaleString()}개 · 성공 ${successRate}%<br>★${level+1} 강화</button>`):'<b class="max-breakthrough">LEGEND · 최대 강화</b>'):'<small>SR 등급 이상부터 돌파할 수 있습니다.</small>'}</div>`:'<div class="card-profile-locked-info"><i>LOCKED</i><b>아직 획득하지 않은 카드입니다.</b><span>고유 능력은 미리 확인할 수 있지만 돌파·보유 정보는 획득 후 공개됩니다.</span></div>'}${history?`<p class="obtained-date">최초 획득<br><strong>${new Date(history.at).toLocaleString('ko-KR')}</strong></p>`:''}</section>`;
  const abilityPanel=hasUnique?`<section class="card-profile-panel ${activeTab==='ability'?'active':''}" data-profile-panel="ability">${uniqueAbilityDetailHtml(card)}</section>`:'';
  modal.className='modal show detail-modal card-profile-modal';
  modal.innerHTML=`<div class="modal-panel detail-panel card-profile-v1161"><button type="button" class="icon-close detail-close" id="closeDetail">×</button><div class="detail-layout"><div class="card-profile-visual">${cardHtml(card,owned,'detail-card',user)}${hasUnique?`<div class="profile-ability-mark ${uniqueType.typeClass} ${card.uniqueAbility.ownerTest?'owner-test':''}"><i>◇</i><span>${card.uniqueAbility.ownerTest?'OWNER TEST · ':''}${escapeHtml(uniqueType.typeLabel)}</span></div>`:''}</div><div class="detail-info"><div class="card-profile-heading"><div><p class="eyebrow">CARD PROFILE</p><span class="detail-grade">${owned?`${card.grade}${powerTypeIndicatorHtml(card,'detail-power-stars')}`:'미획득'}</span><h2>${owned?escapeHtml(card.title):'미획득 카드'}</h2><p>${owned?escapeHtml(card.name):'도감에 등록된 고유 능력 정보만 공개됩니다.'}</p></div>${hasUnique?`<span class="profile-status ${uniqueType.typeClass} ${card.uniqueAbility.ownerTest?'owner-test':''}"><i>◇</i>${card.uniqueAbility.ownerTest?'TEST · ':''}${escapeHtml(uniqueType.typeLabel)}</span>`:''}</div><nav class="card-profile-tabs" aria-label="카드 프로필 정보">${hasUnique?`<button type="button" class="${activeTab==='ability'?'active':''}" data-profile-tab="ability"><i>◇</i> ${escapeHtml(uniqueType.typeLabel)}</button>`:''}<button type="button" class="${activeTab==='info'?'active':''}" data-profile-tab="info">카드 정보</button></nav><div class="card-profile-panels">${abilityPanel}${infoPanel}</div><button type="button" class="btn dark card-profile-close" id="closeDetail2">닫기</button></div></div></div>`;
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


async function playBreakthroughCinematic(effect,card,level){
  if(!effect||effect.enabled===false)return;
  const src=String(effect.mediaUrl||'').trim()?normalizeUltimateMediaPath(effect.mediaUrl):'';
  if(!src)return;
  const soundSrc=String(effect.soundUrl||'').trim()?normalizeUltimateMediaPath(effect.soundUrl):'';
  const duration=Math.max(800,Math.min(30000,Number(effect.durationMs||5000)));
  const volume=Math.max(0,Math.min(1,Number(effect.volumePercent??100)/100));
  const isVideo=/\.(webm|mp4)(?:[?#].*)?$/i.test(src);
  const overlay=document.createElement('div');
  overlay.className='breakthrough-cinematic-overlay breakthrough-cinematic-preparing';
  overlay.innerHTML=`<div class="breakthrough-cinematic-media"></div><div class="breakthrough-cinematic-flash"></div><div class="breakthrough-cinematic-title"><small>BREAKTHROUGH AWAKENING</small><strong>${escapeHtml(effect.title||'강화 각성')}</strong><span>${escapeHtml(card?.title||effect.cardTitle||'카드')} · ★${Number(level||effect.level||0)} 강화 성공</span></div>${effect.skipAllowed===false?'':`<button type="button" class="breakthrough-cinematic-skip">SKIP</button>`}`;
  const mediaWrap=overlay.querySelector('.breakthrough-cinematic-media');
  let media=null,audio=null;
  if(isVideo){
    media=document.createElement('video');
    media.src=src;
    media.preload='auto';
    media.playsInline=true;
    media.disablePictureInPicture=true;
    media.setAttribute('playsinline','');
    media.setAttribute('webkit-playsinline','');
    media.setAttribute('controlsList','nodownload noplaybackrate noremoteplayback');
    media.volume=volume;
    media.muted=Boolean(soundSrc)||!battleSoundEnabled()||volume<=0;
    mediaWrap.appendChild(media);
    try{
      media.load();
      if(media.readyState<3){
        await new Promise(resolve=>{
          let settled=false;
          const finishReady=()=>{if(settled)return;settled=true;clearTimeout(waitTimer);media.removeEventListener('canplay',finishReady);media.removeEventListener('canplaythrough',finishReady);media.removeEventListener('error',finishReady);resolve()};
          const waitTimer=setTimeout(finishReady,1800);
          media.addEventListener('canplay',finishReady,{once:true});
          media.addEventListener('canplaythrough',finishReady,{once:true});
          media.addEventListener('error',finishReady,{once:true});
        });
      }
    }catch{}
  }else{
    media=document.createElement('img');
    media.src=src;
    media.alt=String(effect.title||'강화 각성');
    media.decoding='async';
    mediaWrap.appendChild(media);
  }
  document.body.appendChild(overlay);
  document.body.classList.add('breakthrough-cinematic-playing');
  if(navigator.vibrate)navigator.vibrate([60,30,100]);
  await new Promise(resolve=>{
    let done=false,started=false,timer=0;
    const finish=()=>{
      if(done)return;done=true;clearTimeout(timer);
      try{audio?.pause();if(audio)audio.currentTime=0}catch{}
      try{if(media?.tagName==='VIDEO'){media.pause();media.removeAttribute('src');media.load()}}catch{}
      overlay.classList.add('closing');
      setTimeout(()=>{overlay.remove();document.body.classList.remove('breakthrough-cinematic-playing');resolve()},140);
    };
    overlay.querySelector('.breakthrough-cinematic-skip')?.addEventListener('click',finish,{once:true});
    const startPlayback=()=>{
      if(done||started)return;started=true;
      overlay.classList.remove('breakthrough-cinematic-preparing');
      overlay.classList.add('breakthrough-cinematic-active');
      timer=setTimeout(finish,duration);
      if(soundSrc&&battleSoundEnabled()&&volume>0){audio=new Audio(soundSrc);audio.preload='auto';audio.volume=volume;audio.play().catch(()=>{});}
    };
    if(media?.tagName==='VIDEO'){
      media.addEventListener('loadedmetadata',()=>{const portrait=media.videoHeight>media.videoWidth;media.classList.toggle('is-portrait',portrait);media.classList.toggle('is-landscape',!portrait)},{once:true});
      media.addEventListener('ended',finish,{once:true});
      media.addEventListener('error',()=>{overlay.classList.add('media-failed');setTimeout(finish,700)},{once:true});
      const play=media.play();
      if(play&&typeof play.then==='function')play.then(()=>{
        if(typeof media.requestVideoFrameCallback==='function')media.requestVideoFrameCallback(()=>requestAnimationFrame(startPlayback));
        else requestAnimationFrame(startPlayback);
      }).catch(()=>{media.muted=true;media.play().then(()=>requestAnimationFrame(startPlayback)).catch(()=>{overlay.classList.add('media-failed');startPlayback()})});
      else requestAnimationFrame(startPlayback);
    }else{
      media?.addEventListener('load',()=>{const portrait=media.naturalHeight>media.naturalWidth;media.classList.toggle('is-portrait',portrait);media.classList.toggle('is-landscape',!portrait);requestAnimationFrame(startPlayback)},{once:true});
      media?.addEventListener('error',()=>{overlay.classList.add('media-failed');mediaWrap.innerHTML='<div class="breakthrough-cinematic-fallback">BREAKTHROUGH</div>';startPlayback()},{once:true});
      if(media?.complete&&media.naturalWidth>0)requestAnimationFrame(startPlayback);
    }
  });
}

async function freshBreakthroughUserState(){
  const fallback=loadUser();
  if(!API_MODE)return fallback;
  try{
    if(typeof clearApiCache==='function')clearApiCache('me');
    const data=await apiRequest('me',{}, {ttl:0,timeoutMs:10000});
    if(data?.user){const next=apiUserToLocal(data.user);saveUser(next);return next;}
  }catch(error){console.warn('강화 전 최신 재료/설정 동기화 실패:',error);}
  return loadUser()||fallback;
}

async function breakthroughCard(cardId){
  let user=await freshBreakthroughUserState();
  const normalizedCardId=String(cardId),card=cards.find(c=>String(c.id)===normalizedCardId);
  if(!user||!card)return alert('카드 정보를 다시 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
  const level=Number(user.breakthroughs?.[normalizedCardId]||0),normalizedGrade=String(card?.grade||'').trim().toUpperCase(),isMa=normalizedGrade==='MA',maxLevel=isMa?13:10,isMaHigh=isMa&&level>=10;
  if(level>=maxLevel)return alert('이미 최대 강화 단계입니다.');
  const rule=isMaHigh?user.maHighBreakthrough?.steps?.[level-10]:(user.breakthroughConfig?.[normalizedGrade]?.[level]||{cost:breakthroughCosts[level],rate:breakthroughRates[level]}),materialName=isMaHigh?'마스터의 별':'카드 조각',balance=isMaHigh?Number(user.masterStars||0):Number(user.cardShards||0);
  if(isMaHigh&&user.maHighBreakthrough?.enabled!==true)return alert('MA +11~+13 강화가 아직 운영 준비 중입니다.');
  if(!rule)return alert('강화 설정을 찾을 수 없습니다.');
  if(balance<Number(rule.cost)){alert(`${materialName}이 부족합니다. (보유 ${balance.toLocaleString()}개 / 필요 ${Number(rule.cost).toLocaleString()}개)`);showDetail(normalizedCardId,'info');return;}
  if(!confirm(`${materialName} ${Number(rule.cost).toLocaleString()}개를 사용해 ★${level+1} 강화를 시도하시겠습니까?\n성공 확률: ${rule.rate}%\n실패해도 단계는 유지되며 재료는 소모됩니다.`))return;
  try{
    if(API_MODE){const d=await apiRequest('card/breakthrough',{method:'POST',body:JSON.stringify({cardId:normalizedCardId})});saveUser(apiUserToLocal(d.user));if(d.success&&d.cinematic)await playBreakthroughCinematic(d.cinematic,card,d.level);alert(d.success?`강화 성공! ★${d.level}${d.guaranteed?'\nSSR 천장 확정 성공':''}`:`강화 실패\n단계는 ★${d.level}로 유지됩니다.${d.pity?.enabled?`\nSSR 천장: ${d.pity.failCount}/${d.pity.threshold}회 실패`:''}`);showDetail(normalizedCardId);}
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
// Player-owned state must not be cached. Mutation responses are authoritative and
// a later read must never resurrect an older balance or inventory summary.
const API_CACHE_TTL={'cards':5000,'packs':5000,'pvp/config':1000,'recent-high-grade':5000,'recent-equipment':5000};
function apiCacheKey(path){return String(path).replace(/^\/+|\/+$/g,'')}
function clearApiCache(path=''){const key=apiCacheKey(path);if(key)API_GET_CACHE.delete(key);else API_GET_CACHE.clear()}
const STARTUP_REQUEST_TIMEOUT=10000;
const STARTUP_SNAPSHOT_KEY='cnine_startup_snapshot_v1168_r7';
function startupSnapshotStorageKey(){const u=loadUser();return `${STARTUP_SNAPSHOT_KEY}:${Number(u?.serverUserId||0)||String(u?.nickname||'guest')}:${String(u?.role||'USER').toUpperCase()}`}
const STARTUP_SNAPSHOT_LEGACY_KEY='cnine_startup_snapshot_v1161';
const STARTUP_SNAPSHOT_MAX_AGE=6*60*60*1000;
const STARTUP_SNAPSHOT_REFRESH_AGE=5*60*1000;
let startupRunId=0,startupWatchdogTimer=null,viewerCatalogWasRefreshed=false;
function readStartupSnapshot(){
  try{
    const storageKey=startupSnapshotStorageKey();let raw=localStorage.getItem(storageKey);
    if(!raw){raw=sessionStorage.getItem(STARTUP_SNAPSHOT_LEGACY_KEY);if(raw)localStorage.setItem(storageKey,raw)}
    if(!raw)return null;
    const data=JSON.parse(raw);if(!data||Date.now()-Number(data.savedAt||0)>STARTUP_SNAPSHOT_MAX_AGE){localStorage.removeItem(storageKey);return null}
    return data;
  }catch(_){return null}
}
function writeStartupSnapshot(patch={}){
  try{
    const storageKey=startupSnapshotStorageKey();let previous={};const raw=localStorage.getItem(storageKey);if(raw)previous=JSON.parse(raw)||{};
    localStorage.setItem(storageKey,JSON.stringify({...previous,...patch,savedAt:Date.now()}));
  }catch(error){console.warn('초기 데이터 캐시 저장 실패:',error)}
}
function applyStartupSnapshot(snapshot){
  if(Array.isArray(snapshot?.cards)&&snapshot.cards.length)cards=snapshot.cards.map(normalizeClientCard);
  if(Array.isArray(snapshot?.packs)&&snapshot.packs.length)applyServerPacks(snapshot.packs);
  if(snapshot?.burningEvent&&typeof snapshot.burningEvent==='object')applyBurningEventState(snapshot.burningEvent,{announce:false});
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
    applyServerPacks(packResult.value.packs);applyBurningEventState(packResult.value.burningEvent||{});cachePatch.packs=packResult.value.packs;cachePatch.burningEvent=packResult.value.burningEvent||{};
  }else if(packResult.error)console.warn('카드팩 설정 백그라운드 갱신 실패:',packResult.error);
  if(Object.keys(cachePatch).length)writeStartupSnapshot(cachePatch);
  if(changed)refreshBuyShellAfterStartup(runId);
}
async function verifyStartupSession(){
  if(API_TOKEN){
    try{
      const me=await apiRequest('me/summary',{}, {timeoutMs:6000,ttl:0});
      const current=loadUser();
      if(current)saveUser(mergeApiUserSummary(me.user,current));
      else{const full=await apiRequest('me',{}, {timeoutMs:10000,ttl:0});saveUser(apiUserToLocal(full.user));}
      return true;
    }
    catch(error){
      if(Number(error?.status)===401){clearPlayerToken();return recoverPlayerSession()}
      console.warn('유저 인증 확인 일시 실패 - 기존 로그인 정보 유지:',error);return Boolean(loadUser());
    }
  }
  return recoverPlayerSession();
}
async function loadStartupOptionalFeatures(runId){
  await new Promise(resolve=>setTimeout(resolve,12000));
  if(runId!==startupRunId||!API_MODE||!API_TOKEN)return;
  if(collectionSnapshotLooksIncomplete(loadUser()))await syncCollectionFromServer({force:true,rerender:runtimeCommandContext==='dex'});
  const previousPvp=pvpFeatureEnabled,previousMagic=Boolean(magicSystemState.visible);
  const [pvpResult,magicResult]=await Promise.all([
    settled(apiRequest('pvp/config',{}, {timeoutMs:5000})),
    settled(apiRequest('magic/status',{}, {timeoutMs:5000,ttl:0}))
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
  app.innerHTML=`<div class="login-wrap startup-recovery-wrap"><div class="login-box game-panel startup-recovery-box"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CONNECTION RECOVERY</p><h1>숲켓몬 연결 확인</h1><div class="logged-out-notice"><span>로딩이 완료되지 않았습니다.</span><p>${safeMessage}</p></div><button class="btn" id="startupRetry">다시 연결</button><button class="btn secondary" id="startupSessionRetry">로그인 연결 초기화 후 재시도</button><p class="login-help">개인키와 계정 데이터는 삭제되지 않습니다. 연결 토큰만 새로 확인합니다.</p></div></div>`;
  const retry=document.getElementById('startupRetry'),reset=document.getElementById('startupSessionRetry');
  if(retry)retry.onclick=()=>{API_INFLIGHT.clear();clearApiCache();void init()};
  if(reset)reset.onclick=()=>{clearPlayerToken();API_INFLIGHT.clear();clearApiCache();void init()};
}
// Raid is synchronized content: use a fixed cadence so clients observe the same
// server state window. The next poll is scheduled only after the current request
// finishes, therefore requests cannot overlap even at the faster battle cadence.
function scheduleRaidPoll(data){stopRaidTimer();if(document.hidden)return;const view=document.getElementById('pveRaidView');if(!view||view.hidden)return;const state=String(data?.current?.status||data?.current?.state||'').toUpperCase();if(state==='ENDED')return;const delay=state==='BATTLE'||state==='RUNNING'?2000:5000;raidState.timer=setTimeout(()=>loadRaidView(),delay)}

const RETIREMENT_REROLL_META={
  MA_REROLL_TICKET:{title:'MA 재뽑기권',grade:'MA',theme:'ma'},
  LIMITED_REROLL_TICKET:{title:'리미티드 재뽑기권',grade:'LIMITED',theme:'limited'},
  PRESTIGE_REROLL_TICKET:{title:'PRESTIGE 재뽑기권',grade:'PRESTIGE',theme:'prestige'},
  FUR_REROLL_TICKET:{title:'FUR 재뽑기권',grade:'FUR',theme:'fur'}
};
function inventoryView(){return `${summaryBar(loadUser())}<section class="inventory-vault"><div class="inventory-hero"><div class="inventory-hero-copy"><h2>인벤토리</h2><p>획득한 보상 큐브와 특별 아이템을 안전하게 보관합니다.</p><div class="inventory-hero-meta"><b id="inventoryOwnedSummary">보관품 확인 중</b></div></div><div class="inventory-vault-mark" aria-hidden="true"><img src="assets/ui/cninelogo.png" alt=""></div></div><div class="inventory-toolbar" id="inventoryToolbar"><div><button type="button" class="active" data-inventory-filter="ALL">전체</button><button type="button" data-inventory-filter="CUBE">큐브</button><button type="button" data-inventory-filter="SUPPLY_BOX">보급상자</button><button type="button" data-inventory-filter="VEHICLE_DRAW">이동수단</button><button type="button" data-inventory-filter="REROLL" id="inventoryRerollFilter" hidden>재뽑기권</button></div></div><div id="inventoryGrid" class="inventory-grid"><div class="inventory-loading"><i></i><b>보관함 확인 중</b><span>보유 정보를 확인하고 있습니다.</span></div></div></section>`}
function inventoryItemMarkup(item){
  const owned=Number(item.quantity)>0,kind=String(item.rarity||'normal').toLowerCase(),isCube=item.category==='CUBE',isSupply=item.category==='SUPPLY_BOX'||item.code==='EQUIPMENT_SUPPLY_BOX',isMasterStar=item.code==='MASTER_STAR',isReroll=item.category==='REROLL';
  const isVehicleDraw=item.code==='VEHICLE_DRAW_TICKET';
  const visual=isMasterStar?'<div class="master-star-emblem" aria-hidden="true"><span>★</span><i></i></div>':isReroll?`<div class="inventory-reroll-ticket" aria-hidden="true"><small>${escapeHtml(item.rarity)}</small><b>REROLL</b><span>CNINE</span></div>`:isVehicleDraw?'<img src="assets/items/vehicle-draw-ticket-v1391.png?v=1393" alt="이동수단 뽑기권">':`<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">`;
  const actionLabel=isVehicleDraw?'이동수단 뽑기':isReroll?'재뽑기':isSupply?'보급 개방':isCube?'큐브 개봉':'아이템 사용';
  return `<article class="inventory-item inventory-item-${kind} ${isSupply?'inventory-item-supply':''} ${isMasterStar?'inventory-item-master-star':''} ${isReroll?'inventory-item-reroll':''} ${owned?'owned':'locked'}" data-inventory-category="${escapeHtml(item.category||'ETC')}"><div class="inventory-item-glow"></div>${item.unseenQuantity?`<span class="inventory-new">NEW</span>`:''}<div class="inventory-pack-stage"><span class="inventory-pack-orbit"></span>${visual}<i></i></div><div class="inventory-item-copy"><small>${escapeHtml(item.subtitle||'CNINE INVENTORY')}</small><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="inventory-item-foot"><span>보유 수량 <b>${Number(item.quantity).toLocaleString()}</b></span>${isMasterStar?'<em class="inventory-material-label">MA 중복 보상</em>':`<button type="button" class="inventory-use" data-inventory-use="${escapeHtml(item.code)}" data-inventory-quantity="${Number(item.quantity)}" ${owned?'':'disabled'}>${owned?actionLabel:'미보유'}</button>`}</div></div></article>`;
}
function renderInventoryItems(items,filter='ALL'){
  const grid=document.getElementById('inventoryGrid');if(!grid)return;
  const visible=filter==='ALL'?items:items.filter(item=>String(item.category||'').toUpperCase()===filter);
  grid.innerHTML=visible.map(inventoryItemMarkup).join('')||'<div class="inventory-empty"><b>표시할 보관품이 없습니다.</b><span>해당 종류의 보유 아이템이 없습니다.</span></div>';
  grid.querySelectorAll('[data-inventory-use]').forEach(button=>button.onclick=()=>openInventoryPack(button.dataset.inventoryUse,Number(button.dataset.inventoryQuantity||0)));
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
async function openInventoryPack(itemCode,ownedQuantity=0){
  if(itemCode==='EQUIPMENT_SUPPLY_BOX')return openEquipmentSupplyBox(ownedQuantity);
  if(itemCode==='VEHICLE_DRAW_TICKET'&&window.VehicleDrawV1388)return window.VehicleDrawV1388.open(ownedQuantity);
  const reroll=RETIREMENT_REROLL_META[itemCode]||null;
  const cubeItems={NORMAL_CUBE:{title:'일반 큐브',image:'assets/ui/packs/normal-cube.png?v=1218-soop-cube-premium',range:'C · U · R · SR',theme:'normal'},ADVANCED_CUBE:{title:'고급 큐브',image:'assets/ui/packs/advanced-cube.png?v=1218-soop-cube-premium',range:'HR · UR · SSR',theme:'advanced'},PREMIUM_CUBE:{title:'프리미엄 큐브',image:'assets/ui/packs/premium-cube.png?v=1218-soop-cube-premium',range:'MA · FUR · LIMITED',theme:'premium'},GUARANTEED_MA_PACK:{title:'MA 확정 큐브',image:'assets/ui/packs/premium-cube.png?v=1218-soop-cube-premium',range:'MA 확정',theme:'ma'},GUARANTEED_LIMITED_PACK:{title:'리미티드 확정 큐브',image:'assets/ui/packs/premium-cube.png?v=1218-soop-cube-premium',range:'LIMITED 확정',theme:'limited'}};
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
      clearApiCache('inventory');clearApiCache('shell/summary');clearApiCache('cards');mergeClientCards([d.card]);saveUser(apiUserToLocal(d.user));
      await new Promise(resolve=>setTimeout(resolve,950));
      const configuredCard=cards.find(x=>String(x.id)===String(d.card.id))||{},resultCard={...configuredCard,...d.card,id:String(d.card.id),grade:d.card.grade||d.card.rarity,focusX:Number(d.card.focusX??configuredCard.focusX??50),focusY:Number(d.card.focusY??configuredCard.focusY??50)};
      await playConfiguredAcquisitionCutscene(resultCard);
      panel.classList.remove('opening');panel.classList.add('revealed');
      panel.innerHTML=`<div class="inventory-result-head"><h2>${d.duplicate?'카드 중복 획득':reroll?'재뽑기 완료':'새로운 카드 획득'}</h2><span>${escapeHtml(d.card.grade)} 등급 보상</span></div><div class="inventory-result-card-wrap">${cardHtml(resultCard,true,'inventory-result-card',apiUserToLocal(d.user))}</div><div class="inventory-result-info"><b>${escapeHtml(d.card.title)}</b><span>${escapeHtml(d.card.name||'')} · ${escapeHtml(d.card.grade)}</span>${d.duplicate?`<em>중복 보상 · 카드 조각 +${Number(d.shardGained).toLocaleString()}${Number(d.masterStarGained||0)>0?' · 마스터의 별 +1':''}</em>`:'<em>신규 카드 등록</em>'}</div><button type="button" class="btn" id="inventoryResultConfirm">인벤토리로 돌아가기</button>`;
      document.getElementById('inventoryResultConfirm').onclick=()=>{modal.className='modal';modal.innerHTML='';renderShell('inventory')};
    }catch(e){panel.classList.remove('opening');btn.disabled=false;btn.textContent=reroll?'재뽑기 실행':'큐브 해제';alert(e.message)}
  };
}

async function openEquipmentSupplyBox(ownedQuantity=0){
  const modal=document.getElementById('modal'),maxCount=Math.max(1,Math.min(10,Number(ownedQuantity)||1));
  modal.className='modal show supply-open-modal';
  modal.innerHTML=`<div class="modal-panel supply-open-panel"><button type="button" class="icon-close" id="supplyOpenClose">×</button><div class="supply-open-head"><small>EQUIPMENT SUPPLY</small><h2>장비 보급상자 개방</h2><p>한 번에 최대 10개까지 개방할 수 있습니다.</p></div><div class="supply-open-stage"><span></span><img src="assets/ui/packs/supply-high.jpeg?v=1247" alt="장비 보급상자"></div><div class="supply-open-count"><button type="button" data-supply-count-step="-1">−</button><strong id="supplyOpenCount">${maxCount}</strong><button type="button" data-supply-count-step="1">＋</button><small>보유 ${Number(ownedQuantity).toLocaleString()}개</small></div><div class="supply-open-quick">${[1,5,10].filter(value=>value<=Math.max(1,Number(ownedQuantity)||0)).map(value=>`<button type="button" data-supply-count="${value}" class="${value===maxCount?'active':''}">${value}개</button>`).join('')}</div><button type="button" class="btn supply-open-confirm" id="supplyOpenConfirm">${maxCount}개 개방</button><small class="supply-open-guide">장비 · 카드 조각 · 코인 중 하나가 상자마다 개별 판정됩니다.</small></div>`;
  let selected=maxCount;
  const sync=()=>{selected=Math.max(1,Math.min(10,Number(ownedQuantity)||1,selected));const countEl=document.getElementById('supplyOpenCount'),confirm=document.getElementById('supplyOpenConfirm');if(countEl)countEl.textContent=String(selected);if(confirm)confirm.textContent=`${selected}개 개방`;modal.querySelectorAll('[data-supply-count]').forEach(button=>button.classList.toggle('active',Number(button.dataset.supplyCount)===selected));};
  const close=()=>{modal.className='modal';modal.innerHTML=''};
  document.getElementById('supplyOpenClose').onclick=close;
  modal.querySelectorAll('[data-supply-count-step]').forEach(button=>button.onclick=()=>{selected+=Number(button.dataset.supplyCountStep);sync()});
  modal.querySelectorAll('[data-supply-count]').forEach(button=>button.onclick=()=>{selected=Number(button.dataset.supplyCount);sync()});
  document.getElementById('supplyOpenConfirm').onclick=async()=>{
    const button=document.getElementById('supplyOpenConfirm'),panel=modal.querySelector('.supply-open-panel'),requestId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    button.disabled=true;button.textContent='보급상자 개방 중';panel.classList.add('opening');
    try{
      const result=await apiRequest('equipment/supply-box/open',{method:'POST',body:JSON.stringify({count:selected,requestId})});
      const user=loadUser();user.coin=Number(result.coin??user.coin);user.cardShards=Number(result.cardShards??user.cardShards);saveUser(user);clearApiCache('inventory');clearApiCache('shell/summary');clearApiCache('equipment/supply-box/config');
      await new Promise(resolve=>setTimeout(resolve,650));
      const rows=Array.isArray(result.results)?result.results:[];
      panel.classList.remove('opening');panel.classList.add('results');
      const equipmentCount=rows.filter(row=>row.type==='EQUIPMENT').length;
      const duplicateCount=rows.filter(row=>row.type==='DUPLICATE_SHARDS').length;
      const resultCards=rows.map((row,index)=>{
        if(row.type==='EQUIPMENT')return `<article class="equipment"><div><img src="${escapeHtml(row.item?.image||'')}" alt="${escapeHtml(row.item?.name||'장비')}"></div><small>장비 획득</small><b>${escapeHtml(row.item?.name||'장비')}</b><span>${escapeHtml(row.item?.slotLabel||'')} · PVE +${Number(row.item?.pvePower||0).toLocaleString()} · PVP +${Number(row.item?.pvpPower||0).toLocaleString()}</span></article>`;
        if(row.type==='DUPLICATE_SHARDS')return `<article class="shards duplicate"><div>${row.duplicateItem?.image?`<img src="${escapeHtml(row.duplicateItem.image)}" alt="${escapeHtml(row.duplicateItem?.name||'중복 장비')}">`:'✣'}</div><small>중복 장비 → 카드 조각</small><b>+${Number(row.amount||0).toLocaleString()}</b><span>${escapeHtml(row.duplicateItem?.name||'중복 장비')} 자동 변환</span></article>`;
        if(row.type==='SHARDS')return `<article class="shards"><div>✣</div><small>카드 조각</small><b>+${Number(row.amount||0).toLocaleString()}</b><span>보급상자 ${index+1}번째 결과</span></article>`;
        return `<article class="coins"><div>◇</div><small>코인</small><b>+${Number(row.amount||0).toLocaleString()}</b><span>보급상자 ${index+1}번째 결과</span></article>`;
      }).join('');
      panel.innerHTML=`<div class="supply-result-head"><div><small>SUPPLY RESULT</small><h2>${Number(result.count)}개 개방 완료</h2></div><button type="button" class="icon-close" id="supplyResultClose">×</button></div><div class="supply-result-summary"><span>신규 장비 <b>${equipmentCount}</b></span><span>중복 변환 <b>${duplicateCount}</b></span><span>카드 조각 <b>+${Number(result.shardGained||0).toLocaleString()}</b></span><span>코인 <b>+${Number(result.coinGained||0).toLocaleString()}</b></span></div><div class="supply-result-grid">${resultCards}</div><div class="supply-result-foot"><span>남은 보급상자 <b>${Number(result.remaining||0).toLocaleString()}개</b></span><button type="button" class="btn" id="supplyResultConfirm">인벤토리로 돌아가기</button></div>`;
      const done=()=>{modal.className='modal';modal.innerHTML='';renderShell('inventory')};document.getElementById('supplyResultClose').onclick=done;document.getElementById('supplyResultConfirm').onclick=done;
    }catch(error){panel.classList.remove('opening');button.disabled=false;button.textContent=`${selected}개 개방`;showSupplyNotice(error.message||'보급상자 개방에 실패했습니다.',true)}
  };
}

function messagesView(){return `${summaryBar(loadUser())}<section class="message-center"><div class="message-head"><div><p class="eyebrow">CNINE MESSAGE CENTER</p><h2>메시지함</h2><p>운영 공지, 인증 결과와 개인 귀속 쿠폰을 확인할 수 있습니다.</p></div><button class="btn secondary" id="openWagoVerify">와고 2단계 인증</button></div><div id="wagoVerifyPanel" class="wago-verify-panel" hidden></div><div id="messageList" class="message-list"><div class="empty-recent">메시지를 불러오는 중...</div></div></section>`}
const MESSAGE_REWARD_META={COIN:{label:'코인',icon:'🪙'},SHARDS:{label:'카드 조각',icon:'🧩'},MASTER_STAR:{label:'마스터의 별',icon:'⭐'},PREMIUM_CUBE:{label:'프리미엄 큐브',icon:'💎'},EQUIPMENT_SUPPLY_BOX:{label:'장비 보급상자',icon:'📦'}};
async function loadMessages(){
  const box=document.getElementById('messageList');if(!box)return;
  try{
    const d=await apiRequest('messages');
    box.innerHTML=d.messages.length?d.messages.map(m=>{
      const rewardType=String(m.reward_type||'').toUpperCase(),rewardMeta=MESSAGE_REWARD_META[rewardType],messageReward=Boolean(rewardMeta)&&Number(m.reward_amount)>0;
      return `<article class="user-message ${m.is_read?'read':'unread'} ${m.needs_recovery?'reward-recovery':''}" data-id="${m.id}">${m.needs_recovery?'<span class="message-recovery-label">지급 누락 감지</span>':`<button type="button" class="message-delete" data-hide-message="${m.id}" aria-label="메시지 삭제">삭제</button>`}<div><span>${messageReward?'보상 메시지':escapeHtml(m.message_type)}</span><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.body)}</p>${messageReward?`<div class="message-reward"><strong>${rewardMeta.icon} ${Number(m.reward_amount).toLocaleString()} ${rewardMeta.label}</strong><button type="button" data-claim-message="${m.id}" ${m.claimed_at&&!m.needs_recovery?'disabled':''}>${m.needs_recovery?'지급 재확인':(m.claimed_at?'수령 완료':'보상 받기')}</button></div>`:''}${m.coupon_code?`<div class="message-coupon"><code>${escapeHtml(m.coupon_code)}</code><button type="button" data-use-coupon="${escapeHtml(m.coupon_code)}">쿠폰 사용</button></div>`:''}<small>${escapeHtml(String(m.created_at||'').replace('T',' ').slice(0,16))}</small></div></article>`;
    }).join(''):'<div class="empty-recent">도착한 메시지가 없습니다.</div>';
    box.querySelectorAll('.user-message').forEach(x=>x.onclick=async()=>{if(!x.classList.contains('unread'))return;await apiRequest('messages',{method:'PATCH',body:JSON.stringify({id:Number(x.dataset.id)})});x.classList.remove('unread');x.classList.add('read')});
    box.querySelectorAll('[data-claim-message]').forEach(b=>b.onclick=async e=>{
      e.stopPropagation();b.disabled=true;
      try{
        const d=await apiRequest('messages/claim',{method:'POST',body:JSON.stringify({messageId:Number(b.dataset.claimMessage)})});
        const nextUser=apiUserToLocal({...d.user,coin:d.coinAfter??d.user?.coin,cardShards:d.cardShardsAfter??d.user?.cardShards??d.user?.card_shards});saveUser(nextUser);
        clearApiCache('inventory');clearApiCache('shell/summary');clearApiCache('me/summary');
        const meta=MESSAGE_REWARD_META[d.rewardType]||{label:d.rewardLabel||d.rewardType,icon:'🎁'};
        let detail='';
        if(d.rewardType==='COIN')detail=`\n현재 보유 코인: ${Number(nextUser.coin||0).toLocaleString()}코인`;
        else if(d.rewardType==='SHARDS')detail=`\n현재 카드 조각: ${Number(nextUser.cardShards||0).toLocaleString()}개`;
        else detail=`\n현재 보유 수량: ${Number((d.inventoryBalanceAfter??d.balanceAfter) || 0).toLocaleString()}개`;
        alert(`${d.recovered?'이전 실패 지급을 복구했습니다.\n':''}${meta.label} ${Number(d.rewardAmount).toLocaleString()}개를 수령했습니다.${detail}`);
        const card=b.closest('.user-message');if(card){card.classList.add('message-removing');setTimeout(()=>renderShell('messages'),220)}else renderShell('messages');
      }catch(err){b.disabled=false;alert(err.message)}
    });
    box.querySelectorAll('[data-use-coupon]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const code=b.dataset.useCoupon;try{const d=await apiRequest('coupon/redeem',{method:'POST',body:JSON.stringify({code})});saveUser(apiUserToLocal(d.user));alert(`쿠폰 사용 완료! ${d.message||`${Number(d.rewardAmount||d.rewardCoin||0).toLocaleString()} ${d.rewardLabel||'보상'}을 받았습니다.`}`);renderShell('messages')}catch(err){alert(err.message)}});
    box.querySelectorAll('[data-hide-message]').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!confirm('이 메시지를 받은 편지함에서 삭제할까요?\n쿠폰을 사용하지 않았더라도 메시지는 사라집니다.'))return;b.disabled=true;try{await apiRequest('messages',{method:'PATCH',body:JSON.stringify({id:Number(b.dataset.hideMessage),action:'HIDE'})});const card=b.closest('.user-message');if(card){card.classList.add('message-removing');setTimeout(()=>{card.remove();if(!box.querySelector('.user-message'))box.innerHTML='<div class="empty-recent">도착한 메시지가 없습니다.</div>'},220)}else loadMessages()}catch(err){b.disabled=false;alert(err.message)}})
  }catch(e){box.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}
}

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
  if(isGet&&config.replaceInflight===true)API_INFLIGHT.delete(cleanPath);
  else if(isGet&&API_INFLIGHT.has(cleanPath))return API_INFLIGHT.get(cleanPath);
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
function runtimeCommandPollDelay(){if(document.hidden)return 300000;const modalOpen=Boolean(document.querySelector('#modal.show'));return runtimeCommandContext==='battle'||runtimeCommandContext==='pvp'||modalOpen?15000:120000}
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
  app.innerHTML=`<div class="maintenance-screen"><div class="maintenance-card game-panel"><img src="assets/ui/cninelogo.png" class="maintenance-logo" alt="CNINE"><p class="eyebrow">SERVER MAINTENANCE</p><h1>${escapeHtml(m.title||'숲켓몬 서버 점검 중')}</h1><p class="maintenance-message">${escapeHtml(m.message||'안정적인 서비스 제공을 위해 점검을 진행하고 있습니다.')}</p>${period?`<div class="maintenance-period"><span>점검 시간</span><b>${escapeHtml(period)}</b></div>`:''}${nickname?`<div class="maintenance-session"><span><i class="login-dot"></i> 로그인 상태 유지 중</span><b>${escapeHtml(nickname)}</b>${key?`<div><input id="maintenanceKey" value="${escapeHtml(key)}" readonly><button id="maintenanceCopyKey">개인키 복사</button></div>`:'<small>현재 브라우저에 개인키가 저장되어 있지 않습니다.</small>'}</div>`:'<div class="maintenance-session logged-out"><b>로그인 상태가 아닙니다.</b><small>점검 중에도 개인키 로그인은 가능하며 로그인 후 세션이 유지됩니다.</small><button class="btn secondary" id="maintenanceLogin">개인키 로그인</button></div>'}<div class="maintenance-notice">점검 중에는 카드뽑기·출석·돌파·전투 등 게임 기능만 제한됩니다.<br>로그인 세션은 자동으로 해제되지 않습니다.</div><button class="btn secondary" id="maintenanceRefresh">점검 상태 새로고침</button></div></div>`;
  document.getElementById('maintenanceRefresh').onclick=()=>location.reload();
  const copy=document.getElementById('maintenanceCopyKey');if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(key);alert('개인키가 복사되었습니다.')}catch{document.getElementById('maintenanceKey').select();document.execCommand('copy');alert('개인키가 복사되었습니다.')}};
  const login=document.getElementById('maintenanceLogin');if(login)login.onclick=()=>renderLogin();
}
function apiUserToLocal(u={},key){const old=loadUser()||{},scope=String(u.profileScope||'').toUpperCase(),partial=scope.includes('PARTIAL'),hasOwned=Array.isArray(u.owned),incomingOwned=hasOwned?u.owned.map(id=>String(id)):[],incomingQuantities=Object.fromEntries(Object.entries(u.quantities||{}).map(([id,value])=>[String(id),Number(value||0)])),incomingBreakthroughs=Object.fromEntries(Object.entries(u.breakthroughs||{}).map(([id,value])=>[String(id),Number(value||0)]));const owned=partial?[...new Set([...(old.owned||[]).map(String),...incomingOwned])]:hasOwned?incomingOwned:[...(old.owned||[])];const quantities=partial?{...(old.quantities||{}),...incomingQuantities}:hasOwned?incomingQuantities:{...(old.quantities||{})};const breakthroughs=partial?{...(old.breakthroughs||{}),...incomingBreakthroughs}:hasOwned?incomingBreakthroughs:{...(old.breakthroughs||{})};return {nickname:u.nickname??old.nickname,key:key||old.key||'',role:u.role||old.role||'USER',coin:Number(u.coin??old.coin??0),cardShards:Number(u.cardShards??u.card_shards??old.cardShards??0),masterStars:Number(u.masterStars??old.masterStars??0),magicCrystals:Number(u.magicCrystals??u.magic_crystals??old.magicCrystals??0),owned,quantities,breakthroughs,history:Array.isArray(u.history)?u.history.map(x=>({...x,cardId:String(x.cardId??x.card_id??'')})):(old.history||[]),attendance:u.attendance||old.attendance||{lastClaimDate:null,totalDays:0},breakthroughConfig:u.breakthroughConfig||old.breakthroughConfig||{},maHighBreakthrough:u.maHighBreakthrough||old.maHighBreakthrough||{enabled:false,steps:[]},weeklyPremiumCube:u.weeklyPremiumCube||old.weeklyPremiumCube||{currentRate:.1,earnedCount:0,weeklyLimit:2,attemptCount:0},serverUserId:u.id??old.serverUserId,testCoinGrantedV13:true}}
function mergeApiUserSummary(summary={},base=loadUser()||{}){
  return {...base,nickname:summary.nickname??base.nickname,role:summary.role??base.role??'USER',coin:Number(summary.coin??base.coin??0),cardShards:Number(summary.cardShards??summary.card_shards??base.cardShards??0),masterStars:Number(summary.masterStars??base.masterStars??0),magicCrystals:Number(summary.magicCrystals??summary.magic_crystals??base.magicCrystals??0),serverUserId:Number(summary.id??base.serverUserId??0)||base.serverUserId,testCoinGrantedV13:true};
}
function mergeDrawUserSnapshot(snapshot={},results=[]){
  const current=mergeApiUserSummary(snapshot,loadUser()||{}),owned=new Set((current.owned||[]).map(String));
  current.quantities={...(current.quantities||{})};current.breakthroughs={...(current.breakthroughs||{})};
  for(const item of results){const id=String(item?.card?.id||'');if(!id)continue;owned.add(id);current.quantities[id]=Number(item.quantityAfter??snapshot?.quantities?.[id]??current.quantities[id]??0);}
  current.owned=[...owned];return current;
}
let collectionSyncPromise=null,collectionSyncAt=0;
function collectionSnapshotLooksIncomplete(user=loadUser()||{}){if(user.collectionRepairR6)return false;const owned=new Set((user.owned||[]).map(String)),historyIds=new Set((user.history||[]).map(row=>String(row?.cardId||'')).filter(Boolean));for(const id of historyIds)if(!owned.has(id))return true;return false;}
async function syncCollectionFromServer({force=false,rerender=false}={}){
  if(!API_MODE||!API_TOKEN)return false;
  const now=Date.now();if(!force&&now-collectionSyncAt<30000)return false;if(collectionSyncPromise)return collectionSyncPromise;
  collectionSyncPromise=(async()=>{const data=await apiRequest('me/collection',{}, {ttl:force?0:30000,timeoutMs:10000}),collection=data?.collection||{},current=loadUser();if(!current||!Array.isArray(collection.owned))return false;const beforeIds=[...ownedIds(current)].sort().join(','),next={...current,collectionRepairR6:true,owned:collection.owned.map(String),quantities:Object.fromEntries(Object.entries(collection.quantities||{}).map(([id,value])=>[String(id),Number(value||0)])),breakthroughs:Object.fromEntries(Object.entries(collection.breakthroughs||{}).map(([id,value])=>[String(id),Number(value||0)]))};saveUser(next);collectionSyncAt=Date.now();const changed=beforeIds!==[...ownedIds(next)].sort().join(',');if(changed&&rerender&&runtimeCommandContext==='dex')renderShell('dex');return changed;})().catch(error=>{console.warn('서버 도감 동기화 실패:',error);return false}).finally(()=>{collectionSyncPromise=null});
  return collectionSyncPromise;
}
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
  const snapshot=readStartupSnapshot(),snapshotAge=snapshot?Date.now()-Number(snapshot.savedAt||0):Infinity;
  const hasCatalogSnapshot=Boolean(Array.isArray(snapshot?.cards)&&snapshot.cards.length&&Array.isArray(snapshot?.packs)&&snapshot.packs.length);
  const staticCardTask=hasCatalogSnapshot?Promise.resolve([]):loadStaticCardsFallback();
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

    if(!hasCatalogSnapshot){
      cardTask=settled(apiRequest('cards',{}, {timeoutMs:STARTUP_REQUEST_TIMEOUT}));
      packTask=settled(apiRequest('packs',{}, {timeoutMs:STARTUP_REQUEST_TIMEOUT}));
    }else{
      const refreshDelay=snapshotAge>STARTUP_SNAPSHOT_REFRESH_AGE?3000:30000;
      setTimeout(()=>{if(runId!==startupRunId||!API_MODE)return;const c=settled(apiRequest('cards',{}, {timeoutMs:STARTUP_REQUEST_TIMEOUT,ttl:0})),p=settled(apiRequest('packs',{}, {timeoutMs:STARTUP_REQUEST_TIMEOUT,ttl:0}));void refreshStartupCatalog(runId,c,p)},refreshDelay);
    }
    const authTask=settled(verifyStartupSession());
    const authResult=await authTask;
    if(runId!==startupRunId)return;
    if(authResult.ok)authenticated=Boolean(authResult.value);
    else{console.warn('시작 세션 확인 실패:',authResult.error);authenticated=Boolean(loadUser())}

    if(!hasCatalogSnapshot){
      const staticCards=await staticCardTask;
      let cachePatch={};
      if(Array.isArray(staticCards)&&staticCards.length&&!viewerCatalogWasRefreshed){cards=staticCards.map(normalizeClientCard);cachePatch.cards=staticCards;packPending=true;}
      else{
        const cardResult=await cardTask;if(runId!==startupRunId)return;
        if(!cardResult.ok||!Array.isArray(cardResult.value?.cards))throw cardResult.error||new Error('카드 데이터를 불러오지 못했습니다.');
        if(!viewerCatalogWasRefreshed)cards=cardResult.value.cards.map(normalizeClientCard);cachePatch=viewerCatalogWasRefreshed?{}:{cards:cardResult.value.cards};
      }
      const packResult=await Promise.race([packTask,new Promise(resolve=>setTimeout(()=>resolve({pending:true}),350))]);
      if(packResult?.pending)packPending=true;
      else if(packResult.ok&&Array.isArray(packResult.value?.packs)){applyServerPacks(packResult.value.packs);applyBurningEventState(packResult.value.burningEvent||{});cachePatch.packs=packResult.value.packs;cachePatch.burningEvent=packResult.value.burningEvent||{}}
      else console.warn('카드팩 설정 조회 실패 - 기본 설정으로 계속합니다:',packResult.error);
      writeStartupSnapshot(cachePatch);
    }
  }catch(error){
    if(error?.message!=='API_OFFLINE')console.error('초기 연결 실패:',error);
    API_MODE=false;API_INFLIGHT.clear();
    if(runId!==startupRunId)return;
    completed=true;clearTimeout(startupWatchdogTimer);startupWatchdogTimer=null;
    // 직전 정상 카탈로그와 로그인 정보가 있으면 서버 지연만으로 전체 UI를 닫지 않는다.
    // 실제 쓰기 기능은 API_MODE=false 상태에서 계속 차단하고, 한 번만 백그라운드 재연결을 시도한다.
    if(hasCatalogSnapshot&&loadUser()){
      renderShell('buy');
      setTimeout(async()=>{if(runId!==startupRunId||API_MODE)return;const service=await detectApi();if(!API_MODE)return;if(service?.maintenance?.active&&!service.bypass)return renderMaintenance(service.maintenance,service);await verifyStartupSession();await refreshBurningEventState({forceFresh:true,rerender:true});scheduleBurningEventWatch();refreshBuyShellAfterStartup(runId)},5000);
      return;
    }
    renderStartupRecovery(error?.timeout?'서버 연결 시간이 초과되었습니다. 잠시 후 다시 연결해주세요.':'서버 연결을 확인할 수 없습니다. 잠시 후 다시 연결해주세요.');
    return;
  }
  if(runId!==startupRunId)return;
  completed=true;if(startupWatchdogTimer){clearTimeout(startupWatchdogTimer);startupWatchdogTimer=null}
  if(authenticated)renderShell('buy');else renderLogin();
  if(authenticated)void refreshBurningEventState({forceFresh:true,rerender:true}).finally(()=>scheduleBurningEventWatch());

  // 캐시 사용 또는 팩 설정 지연 시 최신 카탈로그는 화면 표시 이후 반영한다.
  if((hasCatalogSnapshot||packPending)&&cardTask&&packTask)void refreshStartupCatalog(runId,cardTask,packTask);
  if(authenticated)void loadStartupOptionalFeatures(runId);
}
function renderLogin(){app.innerHTML=`<div class="login-wrap"><div class="login-box game-panel player-login-box"><img src="assets/ui/cninelogo.png" class="login-logo" alt="CNINE"><p class="eyebrow">CNINE COLLECTION GAME</p><h1>숲켓몬 로그인</h1><div class="logged-out-notice"><span>로그아웃 상태</span><p>기존 계정은 아래에 개인키를 입력하면 다시 접속할 수 있습니다.</p></div><div class="field key-login-field"><label for="key">기존 계정으로 로그인</label><input id="key" autocomplete="off" autocapitalize="characters" placeholder="CN-XXXX-XXXX-XXXX"></div><button class="btn" id="login">개인키로 로그인</button><p class="login-help">개인키를 분실했다면 운영팀에 재발급을 요청하세요.</p><div class="login-divider"><span>처음 이용하시나요?</span></div><div class="field"><label for="nickname">신규 닉네임</label><input id="nickname" maxlength="20" placeholder="와이고수 닉네임을 입력하세요"></div><button class="btn secondary" id="start">새 계정 만들기</button></div></div>`;document.getElementById('start').onclick=async()=>{const nickname=document.getElementById('nickname').value.trim();if(!nickname)return alert('닉네임을 입력해주세요.');if(!API_MODE){alert('서버 연결이 없어 계정을 생성할 수 없습니다. 새로고침 후 다시 시도해주세요.');return renderStartupRecovery('서버 연결이 확인되지 않아 계정 생성을 중단했습니다.')}try{const d=await apiRequest('auth/register',{method:'POST',body:JSON.stringify({nickname})});persistPlayerToken(d.token);const user=apiUserToLocal(d.user,d.privateKey);saveUser(user);await refreshCardCatalogForCurrentViewer();renderCreated(user)}catch(e){alert(e.message)}};document.getElementById('login').onclick=async()=>{const key=document.getElementById('key').value.trim();if(!API_MODE){alert('서버 연결이 없어 로그인할 수 없습니다. 새로고침 후 다시 시도해주세요.');return renderStartupRecovery('서버 연결이 확인되지 않아 로그인을 중단했습니다.')}try{const normalizedKey=key.trim().toUpperCase();const d=await apiRequest('auth/login',{method:'POST',body:JSON.stringify({privateKey:normalizedKey})});persistPlayerToken(d.token);saveUser(apiUserToLocal(d.user,normalizedKey));await refreshCardCatalogForCurrentViewer();if(d.maintenance&&!d.bypass)renderMaintenance(d.maintenance,{user:d.user});else renderShell('buy')}catch(e){alert(e.message)}};document.getElementById('key').onkeydown=e=>{if(e.key==='Enter')document.getElementById('login').click()};document.getElementById('nickname').onkeydown=e=>{if(e.key==='Enter')document.getElementById('start').click()}}
async function claimAttendance(){if(!API_MODE){const user=loadUser();if(!canClaimAttendance(user))return alert('오늘 접속 보상은 이미 받았습니다.');const cfg=user.attendance?.settings||{rewards:[1000,1200,1400,1600,1800,2000,3000]};user.attendance.streak=(Number(user.attendance.streak||0)%7)+1;const reward=Number(cfg.rewards[user.attendance.streak-1]||1000);user.coin+=reward;user.attendance.lastClaimDate=kstDateKey();user.attendance.totalDays=(user.attendance.totalDays||0)+1;saveUser(user);alert(`오늘의 접속 보상 ${reward.toLocaleString()}코인을 받았습니다.`);return renderShell('attendance')}try{const d=await apiRequest('attendance/claim',{method:'POST'});const u=apiUserToLocal(d.user);u.attendance=d.user.attendance||{lastClaimDate:kstDateKey(),totalDays:(loadUser()?.attendance?.totalDays||0)+1,streak:d.streak||1};saveUser(u);alert(`오늘의 접속 보상 ${d.reward}코인을 받았습니다.`);renderShell('attendance')}catch(e){alert(e.message)}}

async function redeemCoupon(){
  if(!API_MODE)return alert('현재 쿠폰을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
  const code=document.getElementById('couponCode')?.value.trim();
  if(!code)return alert('쿠폰 코드를 입력하세요.');
  try{const d=await apiRequest('coupon/redeem',{method:'POST',body:JSON.stringify({code})});saveUser(apiUserToLocal(d.user));alert(`쿠폰 사용 완료! ${d.message||`${Number(d.rewardAmount||d.rewardCoin||0).toLocaleString()} ${d.rewardLabel||'보상'}을 받았습니다.`}`);renderShell('attendance')}catch(e){alert(e.message)}
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
const PENDING_DRAW_STORAGE_KEY='cnine_pending_draw_v1168_r4';
function readPendingDraw(){try{const row=JSON.parse(sessionStorage.getItem(PENDING_DRAW_STORAGE_KEY)||'null');if(!row||!row.requestId||Date.now()-Number(row.createdAt||0)>10*60*1000){sessionStorage.removeItem(PENDING_DRAW_STORAGE_KEY);return null}return row}catch(_){return null}}
function writePendingDraw(row){try{sessionStorage.setItem(PENDING_DRAW_STORAGE_KEY,JSON.stringify(row))}catch(_){}}
function clearPendingDraw(requestId=''){try{const row=readPendingDraw();if(!requestId||String(row?.requestId||'')===String(requestId))sessionStorage.removeItem(PENDING_DRAW_STORAGE_KEY)}catch(_){}}
function isDrawStorageBusy(error){
  const message=String(error?.message||error?.error||'').toLowerCase();
  return error?.code==='D1_OVERLOADED'
    || message.includes('d1 db is overloaded')
    || message.includes('requests queued for too long')
    || message.includes('database is locked')
    || message.includes('sqlite_busy')
    || Number(error?.status)===429
    || (Number(error?.status)===503&&error?.retryable===true);
}
function drawRequestStillProcessing(error){
  return Boolean(error?.timeout)
    || error?.retryable===true
    || isDrawStorageBusy(error)
    || (Number(error?.status)===409&&['처리 중','복구 요청'].some(text=>String(error?.message||'').includes(text)));
}
function setAutoDrawRecoveryMessage(message){
  if(!autoDrawState.active)return;
  updateAutoDrawDock(message);
  const node=document.getElementById('autoDrawProcessingMessage');
  if(node)node.textContent=message;
}
async function waitForDrawRecovery(ms,label='서버 혼잡 복구 대기'){
  const end=Date.now()+Math.max(1000,Number(ms)||1000);
  while(Date.now()<end){
    const remain=Math.max(1,Math.ceil((end-Date.now())/1000));
    setAutoDrawRecoveryMessage(`${label} · ${remain}초`);
    await new Promise(resolve=>setTimeout(resolve,Math.min(1000,Math.max(100,end-Date.now()))));
  }
}
async function drawReceiptStatus(requestId){
  return apiRequest(`draw/status?requestId=${encodeURIComponent(requestId)}`,{}, {ttl:0,timeoutMs:5000});
}
async function requestDrawWithRecovery(packId,count,requestId,receiptVersion=2,{autoRun=false,acknowledgedRequestIds=[]}={}){
  const options={
    method:'POST',
    headers:{
      'x-cnine-draw-receipt':Number(receiptVersion)===2?'v2':'legacy',
      'x-cnine-auto-draw':autoRun?'1':'0'
    },
    body:JSON.stringify({packId,count,requestId,autoDraw:autoRun,acknowledgedRequestIds:Array.isArray(acknowledgedRequestIds)?acknowledgedRequestIds.slice(0,10):[]})
  };
  const maxAttempts=autoRun?8:3;
  let lastError=null,shouldPost=true;
  for(let attempt=0;attempt<maxAttempts;attempt++){
    if(shouldPost){
      const started=Date.now();
      try{
        // Switch to the idempotent receipt recovery path quickly instead of leaving
        // the draw UI apparently frozen behind one long network request.
        const result=await apiRequest('draw',options,{timeoutMs:autoRun?20000:12000});
        if(autoRun)autoDrawState.lastRequestMs=Date.now()-started;
        return result;
      }catch(error){
        if(!drawRequestStillProcessing(error))throw error;
        lastError=error;
      }
    }

    const busy=isDrawStorageBusy(lastError);
    const suggested=Math.max(2000,Number(lastError?.retryAfterMs||0));
    const waitMs=Math.min(60000,Math.max(suggested,busy?10000*Math.pow(1.55,attempt):2500*Math.pow(1.4,attempt)));
    if(autoRun){
      autoDrawState.transientRetries=attempt+1;
      if(busy)autoDrawState.adaptiveDelayMs=Math.max(Number(autoDrawState.adaptiveDelayMs||0),Math.min(60000,waitMs));
      await waitForDrawRecovery(waitMs,busy?'D1 혼잡 자동 복구':'카드 지급 결과 확인');
    }else{
      await new Promise(resolve=>setTimeout(resolve,waitMs));
    }

    let status=null;
    try{status=await drawReceiptStatus(requestId)}
    catch(statusError){
      if(!drawRequestStillProcessing(statusError)&&!isDrawStorageBusy(statusError))throw statusError;
      lastError=statusError;
      shouldPost=false;
      continue;
    }

    const state=String(status?.status||'NOT_FOUND').toUpperCase();
    if(state==='FAILED'){
      const error=new Error(status?.error||'이전 카드 개봉 요청이 실패했습니다.');
      Object.assign(error,{status:409,requestId,receiptStatus:'FAILED'});
      throw error;
    }
    if(state==='ARCHIVED'){
      const error=new Error('이미 지급·확인 완료된 이전 자동 뽑기 요청입니다.');
      Object.assign(error,{status:410,code:'DRAW_RESULT_ARCHIVED',requestId,receiptStatus:'ARCHIVED'});
      throw error;
    }
    if(state==='COMPLETED'){
      try{return await apiRequest('draw',options,{timeoutMs:15000})}
      catch(error){lastError=error;shouldPost=true;continue}
    }
    shouldPost=state==='NOT_FOUND'||state==='RETRYABLE';
    if(state==='PENDING')lastError=Object.assign(new Error('같은 카드 개봉 요청을 처리 중입니다.'),{status:409,retryable:true,code:'DRAW_PENDING',retryAfterMs:5000});
  }
  const error=lastError||new Error('카드 지급 결과 확인 시간이 길어져 자동 뽑기를 안전하게 중지했습니다.');
  error.retryable=true;
  error.requestId=requestId;
  throw error;
}
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
  const duplicateMa=response.results.filter(item=>item?.duplicate&&String(item?.card?.grade||item?.card?.rarity||'').toUpperCase()==='MA');
  if(duplicateMa.some(item=>Number(item.masterStarGained)!==1))throw new Error('MA 중복 카드의 마스터의 별 지급 정보가 누락되어 결과 표시를 중단했습니다.');
  const masterStarDelta=Number(proof.masterStarAfter||0)-Number(proof.masterStarBefore||0);
  if(masterStarDelta!==response.results.reduce((sum,item)=>sum+Number(item?.masterStarGained||0),0))throw new Error('마스터의 별 서버 지급량과 결과 표시값이 일치하지 않습니다.');
  const expected=drawIntegrityHash(drawIntegrityCanonical(response));
  if(String(protocol.integrity||'')!==expected)throw new Error('카드 개봉 결과 무결성 검증에 실패했습니다.');
  consumedDrawResponses.add(String(requestId));
  if(consumedDrawResponses.size>80){const first=consumedDrawResponses.values().next().value;consumedDrawResponses.delete(first);}
  return response.results;
}
openPack=async function(packId,count,cost,options={}){
  const autoRun=Boolean(options?.autoRun&&autoDrawState.active);
  if(drawRequestInFlight){if(autoRun)return false;alert('카드 개봉 요청을 처리 중입니다.');return false}
  if(!API_MODE){
    resetDrawPresentationState();
    const message='서버 연결이 확인되지 않아 카드뽑기를 중단했습니다.\n서버에 실제 지급되지 않는 허위 획득 화면을 방지하기 위해 오프라인 뽑기는 사용할 수 없습니다.\n새로고침 후 다시 시도해주세요.';
    if(autoRun)finishOfficialAutoDraw('서버 연결 오류',message);else alert(message);
    return false;
  }
  const previous=readPendingDraw();
  if(previous){packId=String(previous.packId);count=Number(previous.count);}
  const pack=getPack(packId);
  if(!pack){if(autoRun)finishOfficialAutoDraw('자동 뽑기 오류','카드팩 정보를 찾지 못했습니다.');else alert('카드팩 정보를 찾지 못했습니다.');return false}
  const requestId=String(previous?.requestId||(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`));
  if(!previous)writePendingDraw({requestId,packId,count,receiptVersion:2,createdAt:Date.now()});
  resetDrawPresentationState();
  activeDrawRequestId=requestId;
  drawRequestInFlight=true;
  try{
    let d;
    const archiveIds=autoRun&&autoDrawState.receiptArchiveQueue.length>=10?autoDrawState.receiptArchiveQueue.slice(0,10):[];
    if(autoRun&&autoDrawState.prefs?.simplified!==false){
      renderAutoDrawProcessing(pack,count);
      d=await requestDrawWithRecovery(packId,count,requestId,previous?Number(previous.receiptVersion||1):2,{autoRun,acknowledgedRequestIds:archiveIds});
    }else{
      d=await runCriticalOpening(pack,count,()=>requestDrawWithRecovery(packId,count,requestId,previous?Number(previous.receiptVersion||1):2,{autoRun,acknowledgedRequestIds:archiveIds}));
    }
    const verifiedResults=validateDrawResponse(d,{requestId,packId,count});
    clearPendingDraw(requestId);
    if(autoRun){
      if(archiveIds.length){const archived=new Set(archiveIds);autoDrawState.receiptArchiveQueue=autoDrawState.receiptArchiveQueue.filter(id=>!archived.has(id));}
      autoDrawState.receiptArchiveQueue.push(requestId);
      autoDrawState.receiptArchiveQueue=autoDrawState.receiptArchiveQueue.slice(-20);
    }
    clearApiCache('recent-high-grade');clearApiCache('shell/summary');clearApiCache('cards');
    mergeClientCards(verifiedResults.map(x=>x.card));
    const next=mergeDrawUserSnapshot(d.user,verifiedResults);
    const obtainedAt=new Date().toISOString();
    next.history=[...(next.history||[]),...verifiedResults.map(item=>({cardId:String(item.card.id),at:obtainedAt,duplicate:Boolean(item.duplicate),title:item.card.title,grade:item.card.grade}))].slice(-30);
    saveUser(next);
    await renderDrawResults(pack,count,pack.price*count,verifiedResults,next,d.critical,{autoRun});
    return true;
  }catch(e){
    resetDrawPresentationState();
    if(!drawRequestStillProcessing(e))clearPendingDraw(requestId);
    const storageBusy=isDrawStorageBusy(e),pending=drawRequestStillProcessing(e);
    const message=pending
      ?`${storageBusy?'저장 서버 혼잡이 오래 지속되어 자동 뽑기를 안전하게 멈췄습니다.':'카드 지급 결과 확인이 지연되고 있습니다.'}\n같은 요청 번호를 보존했으며 다시 시작할 때 새로 결제하지 않고 이전 결과부터 확인합니다.`
      :(e.message||'카드 개봉 중 오류가 발생했습니다.');
    if(autoRun)finishOfficialAutoDraw(pending?(storageBusy?'서버 혼잡으로 안전 중지':'카드 지급 확인 지연으로 중지'):'자동 뽑기 오류',message);else alert(message);
    return false;
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
async function renderDrawResults(pack,count,cost,results,user,critical,options={}){
  if(!Array.isArray(results)||results.length!==Number(count)||results.some((item,index)=>item?.granted!==true||Number(item?.slot)!==index||!item?.card?.id))throw new Error('서버에서 확정되지 않은 카드 결과는 표시할 수 없습니다.');
  const autoRun=Boolean(options?.autoRun&&autoDrawState.active),special=getTopSpecialResult(results);
  if(special&&(!autoRun||autoDrawState.prefs?.simplified===false))await showSpecialCardReveal(special,user);
  const modal=document.getElementById('modal');
  modal.className=`modal show results-modal ${autoRun?'auto-draw-results-modal':''}`;
  const badge=critical?.success?`<div class="critical-result-badge">CRITICAL BONUS +${Number(critical.bonus||0).toFixed(0)}%</div>`:'';
  const shardTotal=results.reduce((sum,item)=>sum+Number(item?.shardGained||0),0),masterStarTotal=results.reduce((sum,item)=>sum+Number(item?.masterStarGained||0),0);
  const rewardSummary=(shardTotal||masterStarTotal)?`<div class="draw-reward-summary">${masterStarTotal?`<b>★ 마스터의 별 +${masterStarTotal}</b>`:''}${shardTotal?`<span>카드 조각 +${Number(shardTotal).toLocaleString()}</span>`:''}</div>`:'';
  const actions=autoRun?`<div class="auto-draw-result-strip"><div><small>AUTO DRAW RUNNING</small><b>${autoDrawState.completedRuns+1} / ${autoDrawState.targetRuns}회차 결과</b><span>${autoDrawStopLabel(autoDrawState.prefs?.stopGrade||'NONE')}</span></div><button type="button" id="autoDrawStopInResult">현재 결과까지 받고 중지</button></div>`:`<div class="result-actions result-actions-top manual-draw-actions"><button class="btn" id="drawAgain">같은 팩 다시 뽑기</button><button class="btn auto-draw-result-start" id="startAutoDrawFromResult">자동 뽑기</button><button class="btn secondary" id="confirmResult">확인</button></div>`;
  modal.innerHTML=`<div class="modal-panel multi-result-panel ${critical?.success?'critical-result-panel':''}">${badge}<div class="result-head"><div><p class="eyebrow">PACK RESULT</p><h2>${escapeHtml(pack.name)} · ${count}장 획득</h2></div><button class="icon-close" id="closeResult">×</button></div>${rewardSummary}${actions}<div class="result-grid count-${count}">${results.map(({card,duplicate,shardGained=0,masterStarGained=0})=>`<div class="result-item"><span class="result-label ${duplicate?'dupe':'new'} ${masterStarGained?'master-star-dupe':''}">${duplicate?(masterStarGained?`<b>마스터의 별 +${masterStarGained}</b><small>카드 조각 +${shardGained}</small>`:`카드 조각 +${shardGained}`):'NEW'}</span>${cardHtml(card,true,'result-card',user)}</div>`).join('')}</div></div>`;
  document.querySelectorAll('.result-card').forEach(c=>c.onclick=()=>showDetail(c.dataset.id));
  if(autoRun){
    document.getElementById('closeResult').onclick=requestStopAutoDraw;
    document.getElementById('autoDrawStopInResult').onclick=requestStopAutoDraw;
    handleOfficialAutoDrawBatch(results);
    return;
  }
  document.getElementById('closeResult').onclick=document.getElementById('confirmResult').onclick=()=>renderShell('buy');
  document.getElementById('drawAgain').onclick=()=>{modal.className='modal';openPack(pack.id,count,cost)};
  document.getElementById('startAutoDrawFromResult').onclick=()=>openAutoDrawSetup(pack.id,count);
}


let pvpFeatureEnabled=true;
let pvpState={tab:'match',config:null,battleConfig:null,profile:null,myTitle:null,deck:[],characterBonus:{equipmentPve:0,equipmentPvp:0,garagePve:0,garagePvp:0,titlePve:0,pve:0,pvp:0},battleEngine:{active:false,version:'LEGACY',mode:'LEGACY'},opponents:[],history:[],ranking:[],energy:null,energyTimer:null,serverOffset:0};
function pvpView(user){return `${summaryBar(user)}<section class="pvp-cover"><div class="pvp-cover-intro"><p class="eyebrow" id="pvpSeasonEyebrow">ASYNC PVP SEASON</p><h2 id="pvpSeasonTitle">PvP 시즌</h2><p id="pvpSeasonDescription">저장한 PvP 덱으로 비동기 대전을 진행합니다.</p><small id="pvpSeasonStatusLine">상태 불러오는 중</small></div><div class="pvp-me"><div id="pvpMyTierBadge" class="pvp-tier-badge"></div><span id="pvpMyTier">-</span><b id="pvpMyScore">-</b><small id="pvpSeasonTime">시즌 정보 불러오는 중</small></div><div class="battle-energy-card pvp-energy-card"><div class="pvp-energy-head"><span>⚔ PvP 전투 횟수</span><b id="pvpEnergyCount">- / -</b></div><div class="battle-energy-track"><i id="pvpEnergyFill"></i></div><small id="pvpEnergyTimer">불러오는 중...</small></div></section><nav class="pvp-tabs"><button data-pvp="match" class="active">대전</button><button data-pvp="deck">덱 편성</button><button data-pvp="history">전투 기록</button><button data-pvp="ranking">시즌 랭킹</button><button data-pvp="reward">시즌 보상</button></nav><section id="pvpContent" class="pvp-content"><div class="empty-recent">PvP 정보를 불러오는 중...</div></section>`}
function pvpCardMini(c,user=loadUser()){
  const power=battleCardPower(c,user,pvpState.battleConfig||battleState.config);
  return `<div class="pvp-card-mini-full">${cardHtml(c,true,'pvp-card-display',user)}<div class="pvp-card-extra compact deck-card-summary"><b>${escapeHtml(c.grade||c.rarity||'C')}</b><strong>${power.toLocaleString()}</strong></div></div>`;
}
const PVP_DECK_FILTER_KEY='cnine_pvp_deck_filter_v1';
function loadPvpDeckFilter(){try{return {query:'',grade:'ALL',type:'ALL',sort:'POWER_DESC',...JSON.parse(localStorage.getItem(PVP_DECK_FILTER_KEY)||'{}')}}catch{return {query:'',grade:'ALL',type:'ALL',sort:'POWER_DESC'}}}
function savePvpDeckFilter(filter){try{localStorage.setItem(PVP_DECK_FILTER_KEY,JSON.stringify(filter))}catch(_){}}
function renderPvpDeckCardList(list,user=loadUser()){
  const root=document.getElementById('pvpCardPicker');if(!root)return;
  const filter=loadPvpDeckFilter(),deckSet=new Set(pvpState.deck),rows=filterDeckCards(list,filter,user,pvpState.battleConfig||battleState.config),groups=pveDeckGradeGroups(rows);
  root.innerHTML=groups.map(group=>`<section class="pvp-grade-group grade-${String(group.grade).toLowerCase()}"><div class="pvp-grade-title"><b>${escapeHtml(group.grade)}</b><span>${group.cards.length}장</span></div><div class="pvp-grade-grid">${group.cards.map(card=>`<button type="button" class="pvp-pick ${deckSet.has(card.id)?'selected':''}" data-cid="${card.id}" ${deckSet.has(card.id)?'disabled':''}>${pvpCardMini(card,user)}${deckSet.has(card.id)?'<span class="pve-selected-cover"><b>편성됨</b></span>':''}</button>`).join('')}</div></section>`).join('')||'<div class="empty-recent deck-filter-empty"><b>조건에 맞는 카드가 없습니다.</b><span>검색어나 필터를 변경해보세요.</span></div>';
  const count=document.getElementById('pvpDeckResultCount');if(count)count.textContent=`${rows.length}장`;
  root.querySelectorAll('[data-cid]').forEach(button=>button.onclick=async()=>{if(pvpState.deck.length>=5)return alert('PvP 덱은 5장까지 편성할 수 있습니다.');pvpState.deck.push(button.dataset.cid);await rerenderPvpDeckPreserveScroll()});
}
function bindPvpDeckFilters(list,user=loadUser()){
  const filter=loadPvpDeckFilter(),search=document.getElementById('pvpDeckSearch'),grade=document.getElementById('pvpDeckGrade'),type=document.getElementById('pvpDeckType'),sort=document.getElementById('pvpDeckSort'),reset=document.getElementById('pvpDeckFilterReset');
  if(search){search.value=filter.query||'';search.oninput=()=>{filter.query=search.value;savePvpDeckFilter(filter);renderPvpDeckCardList(list,user);search.focus();search.setSelectionRange(search.value.length,search.value.length)}}
  if(grade){grade.value=filter.grade||'ALL';grade.onchange=()=>{filter.grade=grade.value;savePvpDeckFilter(filter);renderPvpDeckCardList(list,user)}}
  if(type){type.value=filter.type||'ALL';type.onchange=()=>{filter.type=type.value;savePvpDeckFilter(filter);renderPvpDeckCardList(list,user)}}
  if(sort){sort.value=filter.sort||'POWER_DESC';sort.onchange=()=>{filter.sort=sort.value;savePvpDeckFilter(filter);renderPvpDeckCardList(list,user)}}
  if(reset)reset.onclick=()=>{const next={query:'',grade:'ALL',type:'ALL',sort:'POWER_DESC'};savePvpDeckFilter(next);bindPvpDeckFilters(list,user);renderPvpDeckCardList(list,user)};
}
function renderPvpDeckTab(box){
  const user=loadUser(),owned=ownedIds(user),list=cards.filter(card=>owned.has(card.id));
  const cardPower=pvpState.deck.reduce((sum,id)=>{const card=cards.find(item=>item.id===id);return sum+(card?battleCardPower(card,user,pvpState.battleConfig||battleState.config):0)},0),supportPvp=Number(pvpState.characterBonus?.pvp||0),equipmentPvp=Number(pvpState.characterBonus?.equipmentPvp||0),garagePvp=Number(pvpState.characterBonus?.garagePvp||0),totalPower=cardPower+supportPvp;
  box.innerHTML=`<div class="pvp-section-head pvp-deck-head"><div><p class="eyebrow">MY PVP DECK</p><h2>PvP 덱 편성</h2></div><div class="pvp-deck-actions"><div class="content-power-summary pvp-power-summary"><small>PVP 편성 전투력</small><b>${totalPower.toLocaleString()}</b><span>카드 ${cardPower.toLocaleString()} <i>+</i> 장비 ${equipmentPvp.toLocaleString()}${garagePvp>0?` <i>+</i> 이동수단 ${garagePvp.toLocaleString()}`:''}</span></div><button class="pvp-reset-badge" id="resetPvpDeck"><i>↺</i> 덱 초기화</button></div></div><div class="pvp-formation-guide"><b>전열 2장</b><span>먼저 공격받는 자리</span><i></i><b>후열 3장</b><span>전열 붕괴 후 공격받는 자리</span></div><div id="pvpDeckSlots" class="pvp-deck-slots"></div><div id="pvpHealerPenalty" class="pvp-healer-penalty"></div><div class="deck-filter-toolbar pvp-deck-filter-toolbar"><label class="deck-filter-search"><i>⌕</i><input id="pvpDeckSearch" type="search" autocomplete="off" placeholder="카드명 또는 멤버 검색"></label><label><small>등급</small><select id="pvpDeckGrade"><option value="ALL">전체 등급</option>${['FUR','PRESTIGE','LIMITED','MA','SSR','UR','HR','SR','R','U','C'].map(grade=>`<option value="${grade}">${grade}</option>`).join('')}</select></label><label><small>유형</small><select id="pvpDeckType"><option value="ALL">전체 유형</option><option value="ATTACK">공격형</option><option value="DEFENSE">방어형</option><option value="SPEED">속도형</option><option value="HP">HP형</option><option value="NONE">기본형</option></select></label><label><small>정렬</small><select id="pvpDeckSort"><option value="POWER_DESC">전투력 높은순</option><option value="GRADE_DESC">등급 높은순</option><option value="NAME_ASC">이름순</option></select></label><div class="deck-filter-result"><span id="pvpDeckResultCount">0장</span><button type="button" id="pvpDeckFilterReset">초기화</button></div></div><div id="pvpCardPicker" class="pvp-card-picker grouped"></div><button class="btn pvp-deck-save" id="savePvpDeck">PvP 덱 저장</button>`;
  renderPvpDeckSlots();renderPvpDeckCardList(list,user);bindPvpDeckFilters(list,user);
  document.getElementById('resetPvpDeck').onclick=async()=>{if(!pvpState.deck.length)return;pvpState.deck=[];await rerenderPvpDeckPreserveScroll()};
  document.getElementById('savePvpDeck').onclick=savePvpDeck;
}

function stopPvpEnergyTimer(){if(pvpState.energyTimer){clearInterval(pvpState.energyTimer);pvpState.energyTimer=null}}
function pvpEnergyText(ms){const total=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(total/60),s=total%60;return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function renderPvpEnergy(){const e=pvpState.energy,count=document.getElementById('pvpEnergyCount'),fill=document.getElementById('pvpEnergyFill'),timer=document.getElementById('pvpEnergyTimer');if(!e||!count)return;count.textContent=e.unlimited?'무제한':`${e.energy} / ${e.maxEnergy}`;if(fill)fill.style.width=`${e.unlimited?100:Math.max(0,Math.min(100,e.energy/e.maxEnergy*100))}%`;if(timer){if(e.unlimited)timer.textContent='무제한 적용';else if(e.energy>=e.maxEnergy)timer.textContent='충전 완료';else if(e.nextRechargeAt){const remain=Date.parse(e.nextRechargeAt)-(Date.now()+pvpState.serverOffset);timer.textContent=remain<=0?'충전 갱신 중...':`다음 충전 ${pvpEnergyText(remain)}`;}else timer.textContent='충전 대기';}document.querySelectorAll('.pvp-fight').forEach(b=>{const blocked=!e.unlimited&&e.energy<e.costPerBattle;b.disabled=blocked;b.textContent=blocked?'횟수 부족':'도전';});}
function startPvpEnergyTimer(){stopPvpEnergyTimer();renderPvpEnergy();pvpState.energyTimer=setInterval(()=>{if(!document.getElementById('pvpEnergyCount'))return stopPvpEnergyTimer();const e=pvpState.energy;if(e&&!e.unlimited&&e.nextRechargeAt&&Date.parse(e.nextRechargeAt)<=(Date.now()+pvpState.serverOffset)){loadPvpEnergyOnly();return}renderPvpEnergy()},1000)}
async function loadPvpEnergyOnly(){try{const d=await apiRequest('pvp/config');pvpState.energy=d.energy;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();startPvpEnergyTimer()}catch(_){renderPvpEnergy()}}
async function loadPvpView(){if(!API_MODE){document.getElementById('pvpContent').innerHTML='<div class="empty-recent">현재 PvP를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.</div>';return}try{const d=await apiRequest('pvp/config');pvpFeatureEnabled=Boolean(d.settings?.enabled||d.bypass);pvpState.config=d.settings;pvpState.battleConfig=d.battleSettings||null;pvpState.profile=d.profile;pvpState.myTitle=d.title||null;pvpState.deck=d.deck||[];pvpState.characterBonus=d.characterBonus||{equipmentPve:0,equipmentPvp:0,garagePve:0,garagePvp:0,titlePve:0,pve:0,pvp:0};pvpState.battleEngine=d.battleEngine||{active:false,version:'LEGACY',mode:'LEGACY'};pvpState.energy=d.energy||null;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();const eyebrow=document.getElementById('pvpSeasonEyebrow'),desc=document.getElementById('pvpSeasonDescription'),statusLine=document.getElementById('pvpSeasonStatusLine');if(eyebrow)eyebrow.textContent=d.settings?.seasonTitle||'ASYNC PVP SEASON';document.getElementById('pvpSeasonTitle').textContent=d.settings?.seasonName||'PvP 시즌';if(desc)desc.textContent=d.settings?.seasonDescription||'저장한 PvP 덱으로 비동기 대전을 진행합니다.';if(statusLine)statusLine.textContent=`${pvpFeatureEnabled?'ON':'OFF'} · ${d.settings?.status|| (pvpFeatureEnabled?'진행 중':'중지')}${pvpState.battleEngine?.active?' · 전투엔진 V2 1.6배':''}`;if(!pvpFeatureEnabled){document.getElementById('pvpContent').innerHTML=`<div class="empty-recent pvp-disabled-notice"><b>PvP 운영 중지</b><span>${escapeHtml(d.settings?.status||'현재 PvP 시즌이 중지되어 있습니다.')}</span></div>`;document.querySelectorAll('[data-pvp]').forEach(b=>b.disabled=true);return;}document.getElementById('pvpMyTier').textContent=d.profile.tier?.name||'브론즈';const tierBadge=document.getElementById('pvpMyTierBadge');if(tierBadge)tierBadge.innerHTML=tierEmblem(d.profile.tier||{id:'bronze',name:'브론즈',color:'#b87333'},'small');document.getElementById('pvpMyScore').textContent=`시즌 ${Number(d.profile?.season_score||0).toLocaleString()}점`;document.getElementById('pvpSeasonTime').textContent=d.settings.endsAt?`${String(d.settings.endsAt).slice(0,16)} 종료`:'상시 시즌';startPvpEnergyTimer();document.querySelectorAll('[data-pvp]').forEach(b=>b.onclick=()=>{pvpState.tab=b.dataset.pvp;document.querySelectorAll('[data-pvp]').forEach(x=>x.classList.toggle('active',x===b));renderPvpTab()});renderPvpTab()}catch(e){document.getElementById('pvpContent').textContent=e.message}}
async function renderPvpTab(){const box=document.getElementById('pvpContent');if(!box)return;box.innerHTML='<div class="empty-recent">불러오는 중...</div>';try{if(pvpState.tab==='match'){const d=await apiRequest('pvp/opponents');pvpState.opponents=d.opponents||[];box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">RECOMMENDED OPPONENTS</p><h2>추천 상대</h2></div><button class="text-btn" id="pvpRefresh">새로고침</button></div><div class="pvp-opponents">${pvpState.opponents.map(o=>`<article class="pvp-opponent"><div class="pvp-op-head">${publicNameHtml(o.nickname,o.title,{tag:'b'})}<span>${escapeHtml(o.tier?.name||'브론즈')}</span></div><div class="pvp-op-scores"><span>시즌 <b>${Number(o.season_score||0).toLocaleString()}</b></span><span>점수 차이 <b>${Number(o.scoreDiff||0)>0?'+':''}${Number(o.scoreDiff||0).toLocaleString()}</b></span></div><div class="pvp-op-meta"><span>${Number(o.wins||0)}승 ${Number(o.losses||0)}패</span><em>승리 +${Number(o.expectedWin??24)} · 패배 -${Number(o.expectedLoss??16)}</em></div><button class="btn pvp-fight" data-oid="${o.id}">도전</button></article>`).join('')||'<div class="empty-recent">PvP 덱을 저장한 다른 유저가 아직 없습니다.</div>'}</div>`;document.getElementById('pvpRefresh').onclick=renderPvpTab;document.querySelectorAll('.pvp-fight').forEach(b=>b.onclick=()=>fightPvp(Number(b.dataset.oid)));renderPvpEnergy();}
else if(pvpState.tab==='deck'){renderPvpDeckTab(box);}
else if(pvpState.tab==='history'){const d=await apiRequest('pvp/history');box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">BATTLE HISTORY</p><h2>전투 기록</h2></div></div><div class="pvp-history">${d.history.map(h=>`<div class="pvp-history-row ${h.result.toLowerCase()}"><b>${h.result==='WIN'?'승리':'패배'}</b><span class="public-name-stack">${publicTitleBadgeHtml(h.opponentTitle)}<b>${escapeHtml(h.opponent)}</b><small>${h.direction==='ATTACK'?'내가 도전':'상대가 도전'} · ${String(h.created_at).slice(0,16)}</small></span><strong>${h.result==='WIN'?'+':'-'}${h.score_change}</strong></div>`).join('')||'<div class="empty-recent">아직 전투 기록이 없습니다.</div>'}</div>`;}
else if(pvpState.tab==='ranking'){const d=await apiRequest('pvp/ranking');box.innerHTML=`<nav class="rank-switch pvp-rank-switch"><button type="button" class="active">PvP 시즌 랭킹</button><button type="button" id="cardRankLink">카드점수 랭킹</button></nav><div class="pvp-section-head"><div><p class="eyebrow">SEASON RANKING</p><h2>${escapeHtml(d.settings.seasonName)} 랭킹</h2></div></div>${pvpTierGuideHtml(d.settings?.tiers||[],d.me?.tier)}${d.me?`<div class="pvp-my-rank">${tierEmblem(d.me.tier,'rank')}<span>내 순위 <b>${d.me.rank}위</b><small>${escapeHtml(d.me.tier.name)} · ${Number(d.me.season_score).toLocaleString()}점</small></span></div>`:''}<div class="pvp-ranking">${d.ranking.map(r=>`<div class="pvp-rank-row"><b>${r.rank}</b>${tierEmblem(r.tier,'rank')}<span class="public-name-stack">${publicTitleBadgeHtml(r.title)}<b>${escapeHtml(r.nickname)}</b><small>${escapeHtml(r.tier.name)} · ${r.wins}승 ${r.losses}패</small></span><strong>${Number(r.season_score).toLocaleString()}</strong></div>`).join('')}</div>`;document.getElementById('cardRankLink').onclick=()=>{renderShell('rank');setTimeout(()=>loadRankHub('card'),0)};}
else{const t=pvpState.profile.tier,tiers=pvpState.config.tiers||[],rankRewards=pvpState.config.rankRewards||[],endAt=pvpState.config.endsAt?new Date(String(pvpState.config.endsAt).replace(' ','T')).getTime():0,seasonEnded=Boolean(endAt&&Number.isFinite(endAt)&&Date.now()>=endAt);box.innerHTML=`<div class="pvp-section-head"><div><p class="eyebrow">SEASON REWARD</p><h2>시즌 보상</h2></div></div><div class="pvp-reward-current"><span>현재 최고 달성</span><b>${escapeHtml(t.name)}</b><strong>◈ ${Number(t.rewardCoin||0).toLocaleString()} · 조각 ${Number(t.rewardShards||0).toLocaleString()}</strong><button class="btn" id="claimPvpReward" ${pvpState.config.tierRewardsEnabled===false?'disabled':''}>티어 보상 받기</button></div><div class="pvp-tier-rewards">${tiers.map(x=>`<div><span>${escapeHtml(x.name)}</span><b>${Number(x.min).toLocaleString()}점+</b><strong>◈ ${Number(x.rewardCoin||0).toLocaleString()} · 조각 ${Number(x.rewardShards||0).toLocaleString()}</strong></div>`).join('')}</div><div class="pvp-section-head pvp-rank-reward-head"><div><p class="eyebrow">FINAL RANK REWARD</p><h2>최종 랭킹 보상</h2></div></div><div class="pvp-tier-rewards">${rankRewards.map(x=>`<div><span>${x.from===x.to?`${x.from}위`:`${x.from}~${x.to}위`}</span><b>시즌 종료 기준</b><strong>◈ ${Number(x.rewardCoin||0).toLocaleString()} · 조각 ${Number(x.rewardShards||0).toLocaleString()}</strong></div>`).join('')||'<div class="empty-recent">등록된 랭킹 보상이 없습니다.</div>'}</div>${seasonEnded?`<div class="pvp-final-reward-ready"><span>시즌이 종료되었습니다. 확정된 최종 순위 보상은 계정당 1회만 받을 수 있습니다.</span><button class="btn pvp-rank-claim" id="claimPvpRankReward" ${pvpState.config.rankRewardsEnabled===false?'disabled':''}>최종 랭킹 보상 받기</button></div>`:`<div class="pvp-final-reward-wait"><b>시즌 종료 후 지급</b><span>최종 랭킹 보상은 시즌 종료 시점의 확정 순위를 기준으로 1회 수령할 수 있습니다.</span></div>`}`;document.getElementById('claimPvpReward').onclick=claimPvpReward;const rankClaim=document.getElementById('claimPvpRankReward');if(rankClaim)rankClaim.onclick=claimPvpRankReward;}}catch(e){box.innerHTML=`<div class="empty-recent">${escapeHtml(e.message)}</div>`}}
async function rerenderPvpDeckPreserveScroll(){const picker=document.getElementById('pvpCardPicker'),pickerTop=picker?.scrollTop||0,pageTop=window.scrollY;await renderPvpTab();requestAnimationFrame(()=>{const next=document.getElementById('pvpCardPicker');if(next)next.scrollTop=pickerTop;window.scrollTo({top:pageTop,left:0,behavior:'auto'})})}
function pvpFormationLabel(index){return index<2?`전열 ${index+1}`:`후열 ${index-1}`}
function pvpCardIsHealer(card){const dominant=uniqueAbilityDominant(card),raw=String(card?.powerType??card?.power_type??'').trim().toUpperCase();return dominant?.key==='hp'||raw==='HP'||raw==='HEALTH'||raw==='LIFE'}
function pvpHealerPenaltyState(){const selected=pvpState.deck.map(id=>cards.find(card=>card.id===id)).filter(Boolean),count=selected.filter(pvpCardIsHealer).length,reduction=count>=5?90:count===4?85:count===3?75:count===2?60:0;return {count,reduction}}
function renderPvpHealerPenalty(){const box=document.getElementById('pvpHealerPenalty');if(!box)return;const state=pvpHealerPenaltyState();box.className=`pvp-healer-penalty ${state.reduction?'active':''}`;box.innerHTML=`<b>힐러 ${state.count}장</b><span>${state.reduction?`PVE·PVP 회복량 ${state.reduction}% 감소 적용`:'힐러 2장부터 PVE·PVP 회복 대폭 감소 및 불굴 비활성'}</span><small>2장 -60% · 3장 -75% · 4장 -85% · 5장 -90% · 2장 이상 불굴 비활성</small>`}
function renderPvpDeckSlots(){const el=document.getElementById('pvpDeckSlots');if(!el)return;el.innerHTML=Array.from({length:5},(_,i)=>{const c=cards.find(x=>x.id===pvpState.deck[i]),position=pvpFormationLabel(i),row=i<2?'front':'back';return c?`<button type="button" class="pvp-deck-slot filled ${row}" data-pvp-remove="${c.id}" title="${position} · 클릭해서 덱에서 제외"><span class="pvp-position-badge">${position}</span>${pvpCardMini(c,loadUser())}<span class="pvp-remove-hint">덱에서 빼기</span></button>`:`<div class="pvp-deck-slot empty ${row}"><span class="pvp-position-badge">${position}</span><div class="pvp-empty-slot"><span>${i+1}</span></div></div>`}).join('');el.querySelectorAll('[data-pvp-remove]').forEach(b=>b.onclick=async()=>{pvpState.deck=pvpState.deck.filter(id=>id!==b.dataset.pvpRemove);await rerenderPvpDeckPreserveScroll()});renderPvpHealerPenalty()}
async function savePvpDeck(){if(pvpState.deck.length!==5)return alert('보유 카드 5장을 선택하세요.');try{await apiRequest('pvp/deck',{method:'POST',body:JSON.stringify({cardIds:pvpState.deck})});alert('PvP 덱이 저장되었습니다.')}catch(e){alert(e.message)}}
function pvpResultSafeNumber(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback}
function buildPvpV2ResultHtml(d,myWin,attackerPower,defenderPower,pvpV2Detail=''){
  const scoreChange=pvpResultSafeNumber(d?.scoreChange,0),coinReward=Math.max(0,pvpResultSafeNumber(d?.coinReward,0)),magicReward=Math.max(0,pvpResultSafeNumber(d?.magicReward?.amount,0));
  const multiplier=Number(d?.scoreAdjustment?.multiplier),adjustmentLabel=String(d?.scoreAdjustment?.label||'').trim();
  const adjustmentHtml=adjustmentLabel&&Number.isFinite(multiplier)?`<div class="pvp-result-adjustment"><span>${escapeHtml(adjustmentLabel)}</span><b>${multiplier>0?'+':''}${multiplier.toLocaleString(undefined,{maximumFractionDigits:1})}%</b></div>`:'';
  const reason=String(d?.battleV2?.result?.reason||'');
  const actions=pvpResultSafeNumber(d?.battleV2?.result?.actions,0);
  const judged=['ACTION_LIMIT','POWER_TIEBREAK'].includes(reason)&&actions>0?`<span>${actions.toLocaleString()} ACTIONS</span>`:'';
  return `<div class="pvp-v2-result ${myWin?'is-win':'is-loss'}">
    <div class="pvp-result-glow" aria-hidden="true"></div>
    <div class="pvp-result-kicker">SOOPKETMON · PVP RESULT</div>
    <strong class="pvp-result-title">${myWin?'VICTORY':'DEFEAT'}</strong>
    <div class="pvp-result-power"><b>${pvpResultSafeNumber(attackerPower,0).toLocaleString()}</b><i>VS</i><b>${pvpResultSafeNumber(defenderPower,0).toLocaleString()}</b></div>
    <div class="pvp-result-meta"><span>ENGINE V2 · 1.6X</span>${judged}</div>
    <div class="pvp-result-rewards">
      <div class="pvp-result-reward"><small>SEASON SCORE</small><b>${scoreChange>0?'+':''}${scoreChange.toLocaleString()}</b></div>
      <div class="pvp-result-reward"><small>PVP COIN</small><b>+${coinReward.toLocaleString()}</b></div>
      ${magicReward>0?`<div class="pvp-result-reward"><small>MAGIC CRYSTAL</small><b>✦ +${magicReward.toLocaleString()}</b></div>`:''}
    </div>
    ${adjustmentHtml}
    <button type="button" class="btn pvp-result-confirm" id="pvpResultConfirm">PVP 화면으로 돌아가기</button>
    <em class="pvp-result-tap">화면을 눌러도 돌아갑니다</em>
  </div>`;
}

async function fightPvpV2Live({id,target,mine,pvpPreviewPower}){
  const modal=document.getElementById('modal'),user=loadUser();
  const live=window.prepareBattleV2LiveLoading({modal,mode:'PVP',playerName:user?.nickname||'MY PVP TEAM',opponentName:target?.nickname||'OPPONENT',autoText:'상대 덱·장비 PVP 전투력·고유효과를 기준으로 서버 전투를 계산하고 있습니다.'});
  const stage=live.stage,phase=live.phase,msg=live.msg;ensureBattleSoundButton(stage);
  const close=()=>{modal.__battleV2Renderer?.destroy?.();modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';pvpState.tab='match';renderShell('pvp')};
  try{
    phase.textContent='SERVER PVP CALCULATION';battleTone(90,.18,'sawtooth',.035);
    const d=await apiRequest('pvp/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,opponentId:id})});
    if(!d?.battleV2)throw new Error('전투엔진 V2 응답을 받지 못했습니다. CMS 전투엔진 설정을 확인해주세요.');
    d.opponent=d.opponent||target?.nickname||'OPPONENT';
    pvpState.myTitle=d.attackerTitle||pvpState.myTitle;if(target)target.title=d.defenderTitle||target.title;
    const myWin=d.result==='WIN';
    await window.playPvpBattleV2Live({stage,phase,msg,modal,data:d});
    await battleSleep(Math.max(24,Math.round(620/1.6)));
    stage.classList.add(myWin?'battle-win-v863':'battle-lose-v863');phase.textContent=myWin?'PVP VICTORY':'PVP DEFEAT';battleSfx(myWin?'victory':'defeat');
    if(d.cubeReward&&window.showCubeDropAcquisition){try{await window.showCubeDropAcquisition(d.cubeReward)}catch(cubeFxError){console.warn('큐브 획득 연출을 표시하지 못했습니다.',cubeFxError)}}
    if(d.equipmentReward&&window.showEquipmentDropReward){try{await window.showEquipmentDropReward(d.equipmentReward)}catch(equipmentFxError){console.warn('장비 획득 연출을 표시하지 못했습니다.',equipmentFxError)}}
    const judged=['ACTION_LIMIT','POWER_TIEBREAK'].includes(String(d.battleV2?.result?.reason||''));
    const pvpV2Detail=` · 전투엔진 V2 1.6배${judged?` · ${Number(d.battleV2?.result?.actions||0)}행동 판정`:''}`;
    msg.innerHTML=buildPvpV2ResultHtml(d,myWin,d.attackerPower||pvpPreviewPower,d.defenderPower||0,pvpV2Detail);
    msg.classList.add('is-visible');
    pvpState.profile.season_score=d.scoreAfter;const savedPvpUser=loadUser();if(savedPvpUser){if(d.coinAfter!=null)savedPvpUser.coin=Number(d.coinAfter);if(d.magicCrystalsAfter!=null)savedPvpUser.magicCrystals=Number(d.magicCrystalsAfter);if(d.weeklyPremiumCube)savedPvpUser.weeklyPremiumCube=d.weeklyPremiumCube;saveUser(savedPvpUser)}
    pvpState.energy=d.energy||pvpState.energy;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();
    setTimeout(()=>{modal.onclick=close;const confirmBtn=document.getElementById('pvpResultConfirm');if(confirmBtn)confirmBtn.onclick=e=>{e.stopPropagation();close()}},250);
  }catch(e){
    if(e.energy)pvpState.energy=e.energy;phase.textContent='PVP ERROR';msg.innerHTML=`<strong>ERROR</strong><span>${escapeHtml(e.message)}</span><button type="button" class="btn pvp-result-confirm" id="pvpErrorConfirm">PvP 화면으로 돌아가기</button>`;msg.classList.add('is-visible');modal.onclick=close;const b=document.getElementById('pvpErrorConfirm');if(b)b.onclick=event=>{event.stopPropagation();close()};
  }
}

async function fightPvp(id){
  if(pvpState.energy&&!pvpState.energy.unlimited&&pvpState.energy.energy<pvpState.energy.costPerBattle)return alert(`PvP 전투 횟수가 부족합니다. ${Number(pvpState.energy.rechargeMinutes||30)}분마다 1회 충전됩니다.`);
  if(!confirm('이 상대에게 도전할까요?'))return;
  const target=pvpState.opponents.find(o=>Number(o.id)===Number(id));
  const pvpIntroSpeed=pvpState.battleEngine?.active?1.6:1,pvpPause=ms=>battleSleep(Math.max(24,Math.round(Number(ms||0)/pvpIntroSpeed)));
  let mine=pvpState.deck.map(cid=>cards.find(c=>c.id===cid)).filter(Boolean);
  if(mine.length!==5)return alert('먼저 PvP 덱 5장을 저장하세요.');
  const pvpPreviewCardPower=mine.reduce((sum,card)=>sum+battleCardPower(card,loadUser(),pvpState.config||battleState.config),0),pvpPreviewPower=pvpPreviewCardPower+Number(pvpState.characterBonus?.pvp||0);
  if(pvpState.battleEngine?.active&&typeof window.prepareBattleV2LiveLoading==='function'&&typeof window.playPvpBattleV2Live==='function')return fightPvpV2Live({id,target,mine,pvpPreviewPower});
  const normalizeBattleCard=x=>({...x,id:String(x?.id||x?.card_id||''),title:x?.title||x?.card_title||'상대 카드',name:x?.name||'',grade:String(x?.rarity||x?.grade||'C').toUpperCase(),rarity:String(x?.rarity||x?.grade||'C').toUpperCase(),image:x?.image||x?.image_url||'',image_url:x?.image_url||x?.image||'',focusX:Number(x?.focusX??x?.focus_x??50),focusY:Number(x?.focusY??x?.focus_y??50),powerType:x?.powerType||x?.power_type||'',breakthroughLevel:Number(x?.breakthroughLevel??x?.breakthrough_level??0),uniqueAbility:x?.uniqueAbility||null});
  const modal=document.getElementById('modal');modal.className='modal show battle-modal pvp-battle-modal';
  modal.innerHTML=`<div class="modal-panel battle-stage pvp-battle-stage intro"><div class="battle-backdrop"></div><div class="battle-fx-layer"></div><div class="battle-topline"><span>SOOPKETMON ASYNC PVP</span><b id="battlePhase">MATCH FOUND</b></div><div class="battle-hud"><div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>${publicTitleBadgeHtml(pvpState.myTitle)}MY PVP DECK</b><span data-hp-text="team">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="team"></u><i data-hp-fill="team"></i><em>K.O.</em></div><small>편성 전투력 ${pvpPreviewPower.toLocaleString()} · 시즌 ${Number(pvpState.profile?.season_score||0).toLocaleString()}점</small></div><div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${publicTitleBadgeHtml(target?.title)}${escapeHtml(target?.nickname||'OPPONENT')}</b><span data-hp-text="enemy">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="enemy"></u><i data-hp-fill="enemy"></i><em>K.O.</em></div><small>시즌 ${Number(target?.season_score||0).toLocaleString()}점</small></div></div><div class="battle-arena pvp-arena"><div class="battle-side player-side"><div class="battle-team">${mine.map((c,i)=>battleFighterHtml(c,i)).join('')}</div><small>MY TEAM</small></div><div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div><div class="battle-side enemy-side"><div id="pvpEnemyTeam" class="battle-team enemy-team pvp-enemy-loading">상대 덱 불러오는 중...</div><small>${publicTitleBadgeHtml(target?.title)}${escapeHtml(target?.nickname||'OPPONENT')}</small></div></div><div class="battle-impact"><i></i><i></i><i></i></div><div id="battleMessage" class="battle-message"><span>사나이 간 치열한 대결 중</span></div></div>`;
  const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('battlePhase'),count=document.getElementById('battleCountdown'),msg=document.getElementById('battleMessage');ensureBattleSoundButton(stage);
  try{
    battleTone(90,.18,'sawtooth',.035);await pvpPause(450);stage.classList.add('cards-enter');phase.textContent='MY TEAM DEPLOY';await pvpPause(700);
    const fightPromise=apiRequest('pvp/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,opponentId:id})});
    count.textContent='READY';await pvpPause(650);count.textContent='FIGHT';stage.classList.add('fight');battleTone(440,.18,'square',.075);
    const d=await fightPromise;count.textContent='';
    pvpState.myTitle=d.attackerTitle||pvpState.myTitle;if(target)target.title=d.defenderTitle||target.title;
    const myHudName=stage.querySelector('.battle-hp-team .battle-hp-head b'),enemyHudName=stage.querySelector('.battle-hp-enemy .battle-hp-head b'),enemySideName=stage.querySelector('.enemy-side>small');
    if(myHudName)myHudName.innerHTML=`${publicTitleBadgeHtml(pvpState.myTitle)}MY PVP DECK`;if(enemyHudName)enemyHudName.innerHTML=`${publicTitleBadgeHtml(target?.title)}${escapeHtml(target?.nickname||'OPPONENT')}`;if(enemySideName)enemySideName.innerHTML=`${publicTitleBadgeHtml(target?.title)}${escapeHtml(target?.nickname||'OPPONENT')}`;
    const serverMine=(d.attackerDeck||[]).map(normalizeBattleCard);if(serverMine.length===5){mine=serverMine;const myBox=stage.querySelector('.player-side .battle-team');if(myBox)myBox.innerHTML=mine.map((c,i)=>battleFighterHtml(c,i)).join('')}
    const enemyCards=(d.defenderDeck||[]).map(normalizeBattleCard),enemyBox=document.getElementById('pvpEnemyTeam');enemyBox.classList.remove('pvp-enemy-loading');enemyBox.innerHTML=enemyCards.map((c,i)=>battleFighterHtml(c,i,true)).join('');stage.classList.add('enemy-enter');phase.textContent='OPPONENT DEPLOY';await pvpPause(850);
    const pvpTeamPowerLabel=stage.querySelector('.battle-hp-team small');if(pvpTeamPowerLabel)pvpTeamPowerLabel.textContent=`전투력 ${Number(d.attackerPower||pvpPreviewPower).toLocaleString()} · 장비 +${Number(d.attackerCharacterBonus?.pvp||0).toLocaleString()}`;
    const myWin=d.result==='WIN',useV2=Boolean(d.battleEngine?.active&&d.battleV2&&typeof window.playPvpBattleV2Live==='function');
    if(useV2){
      await window.playPvpBattleV2Live({stage,phase,msg,modal,data:d});
    }else{
      if(d.uniqueAbility?.attacker?.battleEffects?.events?.length){await playUniqueBattleEventSequence(stage,phase,msg,d.uniqueAbility.attacker,mine,false)}
      if(d.uniqueAbility?.defender?.battleEffects?.events?.length){await playUniqueBattleEventSequence(stage,phase,msg,d.uniqueAbility.defender,enemyCards,true)}
      let myHp=100,enemyHp=100,myHit=Math.max(12,Math.min(28,Math.round((Number(d.attackerPower)||1)/(Number(d.defenderPower)||1)*18))),enemyHit=Math.max(12,Math.min(28,Math.round((Number(d.defenderPower)||1)/(Number(d.attackerPower)||1)*18)));
      for(let i=0;i<5;i++){
        battleActivateCard(stage,i,mine[i]?.grade);phase.textContent=`${mine[i]?.grade||'CARD'} MEMBER STRIKE`;stage.classList.add('player-attack');await battleSleep(220);
        enemyHp=Math.max(myWin&&i<4?4:0,enemyHp-myHit);battleSetHp(stage,'enemy',enemyHp);battleBurst(stage,'74%','43%',gradeOrder[mine[i]?.grade]>=gradeOrder.UR?30:18);battleDamage(stage,`-${Math.max(100,Math.round((Number(d.defenderPower)||0)*myHit/100))}`,'enemy',gradeOrder[mine[i]?.grade]>=gradeOrder.UR);battleTriggerUniqueFx(stage,i,'defense',true);battleTone(190+i*25,.1,'square',.05);await battleSleep(520);stage.classList.remove('player-attack');
        if(i<enemyCards.length&&(enemyHp>0||!myWin)){
          phase.textContent=`${enemyCards[i]?.grade||'CARD'} COUNTER`;const ef=stage.querySelector(`[data-enemy-fighter="${i}"]`);if(ef)ef.classList.add('active-attacker');battleTriggerUniqueFx(stage,i,'attack',true);await battleSleep(180);
          myHp=Math.max(!myWin&&i<4?4:0,myHp-enemyHit);battleSetHp(stage,'team',myHp);battleBurst(stage,'27%','43%',gradeOrder[enemyCards[i]?.grade]>=gradeOrder.UR?30:18);battleDamage(stage,`-${Math.max(100,Math.round((Number(d.attackerPower)||0)*enemyHit/100))}`,'player',gradeOrder[enemyCards[i]?.grade]>=gradeOrder.UR);battleTriggerUniqueFx(stage,i,'defense',false);battleTone(78,.18,'sawtooth',.07);await battleSleep(560);if(ef)ef.classList.remove('active-attacker');
        }
      }
      stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('active-attacker'));
      if(myWin){battleSetHp(stage,'enemy',0);battleBurst(stage,'74%','43%',56);battleDamage(stage,'FINISH!','enemy',true);battleTone(620,.32,'sawtooth',.09)}else{battleSetHp(stage,'team',0);battleBurst(stage,'26%','43%',50);battleDamage(stage,'K.O.','player',true);battleTone(48,.38,'square',.09)}
    }
    await pvpPause(950);stage.classList.add(myWin?'battle-win-v863':'battle-lose-v863');phase.textContent=myWin?'PVP VICTORY':'PVP DEFEAT';battleSfx(myWin?'victory':'defeat');
    if(d.cubeReward&&window.showCubeDropAcquisition){try{await window.showCubeDropAcquisition(d.cubeReward)}catch(cubeFxError){console.warn('큐브 획득 연출을 표시하지 못했습니다.',cubeFxError)}}
    if(d.equipmentReward&&window.showEquipmentDropReward){try{await window.showEquipmentDropReward(d.equipmentReward)}catch(equipmentFxError){console.warn('장비 획득 연출을 표시하지 못했습니다.',equipmentFxError)}}
    const pvpV2Detail=useV2?` · 전투엔진 V2 1.6배${d.battleV2?.result?.reason==='ACTION_LIMIT'||d.battleV2?.result?.reason==='POWER_TIEBREAK'?` · ${Number(d.battleV2?.result?.actions||0)}행동 판정`:''}`:'';
    msg.innerHTML=buildPvpV2ResultHtml(d,myWin,d.attackerPower,d.defenderPower,pvpV2Detail);
    pvpState.profile.season_score=d.scoreAfter;const savedPvpUser=loadUser();if(savedPvpUser){if(d.coinAfter!=null)savedPvpUser.coin=Number(d.coinAfter);if(d.magicCrystalsAfter!=null)savedPvpUser.magicCrystals=Number(d.magicCrystalsAfter);if(d.weeklyPremiumCube)savedPvpUser.weeklyPremiumCube=d.weeklyPremiumCube;saveUser(savedPvpUser)}
    pvpState.energy=d.energy||pvpState.energy;pvpState.serverOffset=Date.parse(d.serverNow||new Date().toISOString())-Date.now();
    const exitPvpBattle=()=>{modal.__battleV2Renderer?.destroy?.();modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';pvpState.tab='match';renderShell('pvp')};setTimeout(()=>{modal.onclick=()=>exitPvpBattle();const confirmBtn=document.getElementById('pvpResultConfirm');if(confirmBtn)confirmBtn.onclick=e=>{e.stopPropagation();exitPvpBattle()}},250);
  }catch(e){
    if(e.energy)pvpState.energy=e.energy;msg.innerHTML=`<span>${escapeHtml(e.message)}</span><button type="button" class="btn pvp-result-confirm" id="pvpErrorConfirm">PvP 화면으로 돌아가기</button>`;const close=()=>{modal.__battleV2Renderer?.destroy?.();modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';pvpState.tab='match';renderShell('pvp')};modal.onclick=close;const b=document.getElementById('pvpErrorConfirm');if(b)b.onclick=e=>{e.stopPropagation();close()}
  }
}

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

window.addEventListener('storage',event=>{if(event.key!==BURNING_EVENT_SYNC_KEY||document.hidden)return;void refreshBurningEventState({forceFresh:true,rerender:true}).finally(()=>scheduleBurningEventWatch())});
window.addEventListener('focus',()=>{if(!loadUser())return;void refreshBurningEventState({forceFresh:true,rerender:true}).finally(()=>scheduleBurningEventWatch())});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopRaidTimer();stopBurningEventWatch();return;}const raid=document.getElementById('pveRaidView');if(raid&&!raid.hidden)loadRaidView();if(loadUser())void refreshBurningEventState({forceFresh:true,rerender:true}).finally(()=>scheduleBurningEventWatch())});
init();
