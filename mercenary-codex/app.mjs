import {jointAccountRequest as api} from '/js/joint-account-transport.mjs';
import {withMercenaryDeadline} from '/shared/mercenary-loading-v1.mjs?v=20260925';
import {FRAME,POSITIONS,escapeHtml as esc,asset,thumb,validateCatalog,filterCatalog} from './model.mjs?v=20260924-cryvern';

const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('ko-KR'),storageKey='cnine.mercenaryCodex.public.v1';
const params=new URL(location.href).searchParams;
const filters={q:params.get('q')||'',position:params.get('position')||'',rank:params.get('rank')||'',sort:params.get('sort')||'code',saved:params.get('saved')==='1'};
let catalog,account=null,accountError='',selected=location.hash.slice(1),media='art',view=params.get('view')==='all'?'all':'owned',favorites=new Set(),loading=false,loadoutBusy=false,lastCheck=0,toastTimer;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))favorites=new Set(saved);}catch{}

const current=()=>catalog?.cards.find(c=>c.code===selected);
const ownedCard=code=>account?.cards?.find(c=>c.code===code)||null;
const activeCode=()=>account?.loadout?.mercenaryCode||null;
const positionLabel=c=>c.artOnly?'신규 원화':POSITIONS[c.position];
const pendingKey=()=>`cnine.mercenary.pending:${account?.accountId||''}`;
const pendingLoadout=()=>{try{return account?.accountId?JSON.parse(localStorage.getItem(pendingKey())||'null'):null;}catch{return null;}};
const note=text=>{const el=$('toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3200);};

function urlState(){
  const url=new URL(location.href);
  for(const [key,value] of Object.entries({q:filters.q,position:filters.position,rank:filters.rank,sort:filters.sort==='code'?'':filters.sort,saved:filters.saved?'1':'',view:view==='all'?'all':''}))value?url.searchParams.set(key,value):url.searchParams.delete(key);
  url.hash=selected||'';history.replaceState(null,'',url);
}
function controls(){
  $('search').value=filters.q;$('rank').value=filters.rank;$('sort').value=filters.sort;
  $('savedOnly').setAttribute('aria-pressed',String(filters.saved));$('savedOnly').textContent=filters.saved?'★':'☆';
  document.querySelectorAll('[data-position]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.position===filters.position)));
}
function renderAccountSummary(){
  const owned=account?.cards?.length||0,active=ownedCard(activeCode());
  $('ownedCount').textContent=account?String(owned):'—';$('totalCount').textContent=catalog?String(catalog.cards.length):'—';
  $('loadoutName').textContent=account?(active?.name||activeCode()||'미편성'):'—';
  $('accountStatusTitle').textContent=account?`내 용병 ${owned}명`:accountError?'내 용병 연결 필요':'내 용병 확인 중';
  $('catalogStatus').textContent=account?(active?`${active.name} 편성 중 · 목록에서 바로 변경할 수 있습니다.`:'현재 용병 슬롯이 비어 있습니다. 보유 용병을 선택해 편성하세요.'):accountError||'보유 용병과 편성 정보를 불러오고 있습니다.';
  for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-selected',String(button.dataset.view===view));
  $('rosterTitle').textContent=view==='owned'?'내 용병 선택':'전체 용병 탐색';
  $('catalogFootTitle').textContent=view==='owned'?'보유 용병을 선택해 바로 편성하세요.':'전체 원화·등급·스킬을 살펴보세요.';
}
function visibleCards(){
  if(!catalog)return [];
  const source=view==='owned'?catalog.cards.filter(c=>ownedCard(c.code)):catalog.cards;
  return filterCatalog(source,filters,favorites);
}
function emptyListHtml(){
  if(view!=='owned')return '<li class="empty-state">조건에 맞는 용병이 없습니다.<button type="button" data-reset>전체 용병 보기</button></li>';
  if(!account)return `<li class="empty-state"><b>보유 용병을 표시하지 못했습니다.</b><span>${esc(accountError||'계정 정보를 확인하고 있습니다.')}</span><button type="button" data-retry-account>다시 불러오기</button><button type="button" data-switch-all>전체 도감 먼저 보기</button></li>`;
  if(!account.cards.length)return '<li class="empty-state"><b>아직 보유한 용병이 없습니다.</b><span>전체 도감을 살펴보거나 하이퍼팩에서 용병을 획득할 수 있습니다.</span><button type="button" data-switch-all>전체 도감 보기</button><a href="/?screen=buy&amp;pack=hyper">하이퍼팩 확인 ↗</a></li>';
  return '<li class="empty-state">조건에 맞는 보유 용병이 없습니다.<button type="button" data-reset>검색 조건 초기화</button></li>';
}
function renderList(){
  if(!catalog)return;
  const rows=visibleCards(),list=$('cardGrid'),denominator=view==='owned'?(account?.cards?.length||0):catalog.cards.length;
  list.setAttribute('aria-busy','false');$('resultCount').textContent=`${rows.length} / ${denominator}`;
  list.innerHTML=rows.length?rows.map(c=>{const owned=ownedCard(c.code),active=activeCode()===c.code;return `<li><button class="roster-row" type="button" data-code="${c.code}" aria-pressed="${c.code===selected}" aria-label="${esc(c.name)} ${esc(c.rank||'미정')} ${positionLabel(c)} 선택"><span class="row-portrait"><img src="${c.artOnly?asset(c.sourceArt):thumb(c.code)}" alt="" loading="lazy" width="48" height="72"></span><span class="row-identity"><small>${c.code} <i>${positionLabel(c)} · ${esc(catalog.roles[c.role].label)}</i></small><b>${esc(c.name)}</b><em>${esc(c.title)}</em>${owned?`<span class="ownership-meta">Lv.${fmt(owned.level)} · 보유 ${fmt(Number(owned.duplicates||0)+1)}${active?' · 편성 중':''}</span>`:''}</span><span class="rank-chip" data-rank="${c.rank||''}">${c.rank||'—'}</span>${active?'<span class="row-active" aria-label="현재 편성">편성</span>':favorites.has(c.code)?'<span class="row-favorite" aria-label="즐겨찾기">★</span>':''}</button></li>`;}).join(''):emptyListHtml();
}
function skillHtml(s,index){const balance=s.balance,ratio=Number.isFinite(balance.damageRatio)?balance.damageRatio:undefined;
  return `<article class="skill-entry"><header><span class="skill-number">${String(index+1).padStart(2,'0')}</span><div><small>${s.id} · ${esc(s.target)}</small><h3>${esc(s.name)}</h3></div><span class="skill-state ${s.ready?'':'pending'}">${s.ready?'사용 가능':'설정 대기'}</span></header><p class="skill-effect">${esc(s.effect)}</p><dl class="skill-stats"><div><dt>효과 배율</dt><dd>${ratio===undefined?'미설정':ratio===0?'지원 효과':`${fmt(ratio*100)}<small>%</small>`}</dd></div><div><dt>재사용</dt><dd>${Number.isFinite(balance.cooldownTurns)?`${fmt(balance.cooldownTurns)}<small>턴</small>`:'미설정'}</dd></div><div><dt>에너지</dt><dd>${Number.isFinite(balance.cost)?fmt(balance.cost):'미설정'}</dd></div></dl><details><summary>발동 조건 · 대응 방법 <span>+</span></summary><dl class="skill-rules">${[['발동',s.trigger],['대응',s.counterplay],['보스',s.bossRule],['추가 발동',s.procRule]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></details></article>`;
}
function deploymentHtml(c){
  const owned=ownedCard(c.code),active=activeCode()===c.code,pending=pendingLoadout(),blocked=loadoutBusy||!account?.available||Boolean(pending);
  if(!account)return `<section class="deployment-card unavailable"><div><span>내 용병</span><strong>계정 연결 필요</strong></div><p>${esc(accountError||'보유 용병 정보를 불러오지 못했습니다.')}</p><button type="button" data-retry-account>다시 불러오기</button></section>`;
  if(!owned)return `<section class="deployment-card unavailable"><div><span>보유 상태</span><strong>미보유</strong></div><p>전체 도감 정보는 확인할 수 있지만 편성은 보유 용병만 가능합니다.</p><a href="/?screen=buy&amp;pack=hyper">하이퍼팩 확인 ↗</a></section>`;
  return `<section class="deployment-card ${active?'active':''}"><div class="deployment-title"><span>내 용병</span><strong>${active?'현재 편성 중':'보유 용병'}</strong></div><dl><div><dt>레벨</dt><dd>Lv.${fmt(owned.level)}</dd></div><div><dt>보유</dt><dd>${fmt(Number(owned.duplicates||0)+1)}장</dd></div><div><dt>전투력</dt><dd>${fmt(owned.basePower)}</dd></div></dl><div class="deployment-actions"><button class="equip-button" type="button" data-equip="${c.code}" ${blocked||active||owned.canDeploy===false?'disabled':''}>${active?'편성 완료':owned.canDeploy===false?'현재 편성 불가':'이 용병 편성'}</button>${active?`<button class="unequip-button" type="button" data-unequip ${blocked?'disabled':''}>편성 해제</button>`:''}${pending?'<button class="recover-button" type="button" data-recover-loadout>처리 결과 확인</button>':''}</div><p>PVE·PVP 공통 용병 전용 슬롯 · 일반 카드 5장과 별도</p></section>`;
}
function renderSelection(){
  const c=current();if(!c){$('inspection').innerHTML=`<div class="empty-selection"><span>PROJECT V</span><h2>${view==='owned'?'보유 용병을 선택하세요.':'당신의 다음 전력을 확인하세요.'}</h2><p>${view==='owned'?'선택한 자리에서 바로 편성할 수 있습니다.':'용병을 선택하면 원화와 스킬을 볼 수 있습니다.'}</p></div>`;return;}
  $('inspection').style.setProperty('--character-accent',/^#[\da-f]{6}$/i.test(c.accent)?c.accent:'#c8ff6b');
  $('inspection').innerHTML=`<div class="portrait-stage"><div class="stage-environment"></div><div class="stage-label"><span>PROJECT V / ${c.code}</span><span><i></i>CONTRACT ARCHIVE</span></div><div class="stage-heading"><span class="stage-rank" data-rank="${c.rank||''}">${c.rank||'UNRANKED'} <small>CLASS</small></span><p>${esc(c.title)}</p><h2>${esc(c.name)}</h2></div><div class="portrait-display" id="portraitDisplay"></div><div class="media-tabs" role="tablist" aria-label="용병 모습"><button id="artTab" role="tab" data-media="art" aria-controls="portraitDisplay">카드 원화</button><button id="sdTab" role="tab" data-media="sd" aria-controls="portraitDisplay" ${c.battleSprite?'':'disabled'}>전투 SD</button></div><p class="stage-caption">선택한 이미지를 누르면 원본을 확대합니다.</p></div>
  <aside class="combat-panel"><div class="panel-heading"><h2>전투 정보</h2><button type="button" class="favorite-button" data-favorite aria-pressed="${favorites.has(c.code)}" aria-label="${esc(c.name)} 즐겨찾기 ${favorites.has(c.code)?'해제':'추가'}">${favorites.has(c.code)?'★':'☆'}</button></div>${deploymentHtml(c)}<div class="power-summary"><span>기본 전투력<small>등급별 고정 전투력</small></span><strong>${c.basePower===null?'—':fmt(c.basePower)}</strong></div><dl class="role-ledger"><div><dt>포지션</dt><dd>${positionLabel(c)}</dd></div><div><dt>역할</dt><dd>${esc(catalog.roles[c.role].label)}</dd></div><div><dt>기본 공격</dt><dd>${esc(c.basicTarget)}</dd></div></dl><div class="tactical-notes"><p><b>강점</b>${esc(c.specialty)}</p><p><b>약점</b>${esc(c.weakness)}</p></div>
  ${c.combatLinkDescription?`<p class="balance-note"><b>전력 연계</b><br>${esc(c.combatLinkDescription)}</p>`:''}<div class="skills-heading"><h2>배정 스킬</h2><span>${c.skills.length} SKILLS</span></div><div class="skill-list">${c.skills.map(skillHtml).join('')||'<div class="skill-empty">배정된 스킬이 없습니다.<p>기본 공격으로 전투에 참여합니다.</p></div>'}</div>${c.skills.length?'<p class="balance-note">재사용은 시전자 행동 기준입니다. 배율은 기술별 피해·회복·보호량에 적용되며, 광역·다단 기술은 전체 타격에 나눠 적용됩니다.</p>':''}</aside>`;
  if(c.artOnly)$('inspection').querySelector('.combat-panel').innerHTML=`<div class="panel-heading"><h2>신규 원화 공개</h2><button type="button" class="favorite-button" data-favorite aria-pressed="${favorites.has(c.code)}" aria-label="${esc(c.name)} 즐겨찾기 ${favorites.has(c.code)?'해제':'추가'}">${favorites.has(c.code)?'★':'☆'}</button></div>${deploymentHtml(c)}<div class="power-summary"><span>용병 등급<small>원화 선공개</small></span><strong>${esc(c.rank)}</strong></div><dl class="role-ledger"><div><dt>이름</dt><dd>${esc(c.name)}</dd></div><div><dt>무기</dt><dd>${esc(c.weapon)}</dd></div></dl><div class="skill-empty"><b>출시 예정</b><p>원화를 먼저 만나보세요.<br>획득 방법과 전투 스킬은 추후 공개됩니다.</p></div>`;
  renderMedia();
}
function renderMedia(){const c=current();if(!c)return;const art=media==='art';
  $('portraitDisplay').innerHTML=art?`<button class="art-card" type="button" data-zoom aria-label="${esc(c.name)} 카드 원화 확대"><img class="source-art" src="${asset(c.sourceArt)}" alt="${esc(c.name)} 카드 원화"><img class="card-frame" src="${FRAME}" alt="" aria-hidden="true"></button>`:`<button class="sd-display" type="button" data-zoom aria-label="${esc(c.name)} 전투 SD 확대"><span></span><img src="${asset(c.battleSprite)}" alt="${esc(c.name)} 전투 SD"></button>`;
  $('portraitDisplay').setAttribute('role','tabpanel');$('portraitDisplay').setAttribute('aria-labelledby',art?'artTab':'sdTab');
  document.querySelectorAll('[data-media]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.media===media));b.tabIndex=b.dataset.media===media?0:-1;});
}
function choose(code,{scroll=false}={}){if(!catalog?.cards.some(c=>c.code===code))return;selected=code;media='art';urlState();renderList();renderSelection();if(scroll&&matchMedia('(max-width: 700px)').matches)$('inspection').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
function setView(next,{scroll=false}={}){if(!['owned','all'].includes(next))return;if(view===next){if(scroll)$('catalogControls').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}view=next;const rows=visibleCards();if(!rows.some(c=>c.code===selected))selected=next==='owned'?(activeCode()&&ownedCard(activeCode())?activeCode():rows[0]?.code||''):(current()?.code||rows[0]?.code||'');urlState();renderAccountSummary();renderList();renderSelection();if(scroll)$('catalogControls').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
function updateFilters(){urlState();controls();renderList();}
async function refresh({quiet=false}={}){
  if(loading||document.hidden&&quiet)return;loading=true;lastCheck=Date.now();$('refreshCatalog').disabled=true;
  const [catalogResult,accountResult]=await Promise.allSettled([api('mercenary-codex',{timeoutMs:15000}),api('mercenaries/v3/state',{timeoutMs:15000})]);
  try{
    if(catalogResult.status==='fulfilled')catalog=validateCatalog(catalogResult.value);else throw catalogResult.reason;
    if(accountResult.status==='fulfilled'){account=accountResult.value;accountError='';}else{account=null;accountError=accountResult.reason?.message||'로그인 후 보유 용병을 확인할 수 있습니다.';}
    $('skillCount').textContent=new Set(catalog.cards.flatMap(c=>c.skills.map(s=>s.id))).size;
    const rows=visibleCards(),preferred=view==='owned'?(activeCode()&&ownedCard(activeCode())?activeCode():account?.cards?.[0]?.code):catalog.cards[0]?.code;
    if(!current()||view==='owned'&&!ownedCard(selected))selected=rows[0]?.code||preferred||'';
    controls();renderAccountSummary();renderList();renderSelection();urlState();
  }catch(error){
    $('catalogStatus').textContent=catalog?'최신 정보 조회 실패 · 마지막 정보를 표시합니다.':error.message;
    if(!catalog){$('cardGrid').setAttribute('aria-busy','false');$('cardGrid').innerHTML='<li class="empty-state">용병 정보를 불러오지 못했습니다.<button type="button" data-retry>다시 불러오기</button></li>';}
  }finally{loading=false;$('refreshCatalog').disabled=false;}
}
async function runLoadout(mercenaryCode,{recover=false}={}){
  if(loadoutBusy||!account)return;
  let pending=pendingLoadout();
  if(!pending&&!recover){pending={action:'loadout',body:{requestId:crypto.randomUUID(),mercenaryCode,revision:account.loadout.revision}};try{localStorage.setItem(pendingKey(),JSON.stringify(pending));}catch{note('편성 요청을 안전하게 저장하지 못했습니다. 브라우저 저장소를 확인하세요.');return;}}
  if(!pending){note('확인할 편성 요청이 없습니다.');return;}
  loadoutBusy=true;renderSelection();
  try{
    const result=await api(`mercenaries/v3/${pending.action}`,{method:'POST',body:pending.body});
    try{localStorage.removeItem(pendingKey());localStorage.setItem('cnine.mercenary.loadout.changed',String(Date.now()));}catch{}
    note(result.replayed?'저장된 편성 결과를 복구했습니다.':pending.body.mercenaryCode?'용병 편성을 저장했습니다.':'용병 편성을 해제했습니다.');await refresh();
  }catch(error){note(error.message);if(error.status>=400&&error.status<500&&!['JOINT_REQUEST_CONFLICT','MERCENARY_CLOSED'].includes(error.code))try{localStorage.removeItem(pendingKey());}catch{}
  }finally{loadoutBusy=false;renderAccountSummary();renderList();renderSelection();}
}

document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
  if(b.dataset.view){setView(b.dataset.view);return;}
  if(b.hasAttribute('data-switch-all')){setView('all');return;}
  if(b.hasAttribute('data-retry-account')){void refresh();return;}
  if(b.hasAttribute('data-equip')){void runLoadout(b.dataset.equip);return;}
  if(b.hasAttribute('data-unequip')){void runLoadout(null);return;}
  if(b.hasAttribute('data-recover-loadout')){void runLoadout(undefined,{recover:true});return;}
  if(b.hasAttribute('data-retry')){void refresh();return;}if(!catalog)return;
  if(b.dataset.code)choose(b.dataset.code,{scroll:true});
  else if(b.hasAttribute('data-position')){filters.position=b.dataset.position;updateFilters();}
  else if(b.hasAttribute('data-reset')){Object.assign(filters,{q:'',rank:'',position:'',saved:false});updateFilters();}
  else if(b.dataset.media){media=b.dataset.media;renderMedia();}
  else if(b.hasAttribute('data-favorite')){favorites.has(selected)?favorites.delete(selected):favorites.add(selected);try{localStorage.setItem(storageKey,JSON.stringify([...favorites]));}catch{note('즐겨찾기는 이번 화면에서만 유지됩니다.');}b.setAttribute('aria-pressed',String(favorites.has(selected)));b.setAttribute('aria-label',`${current().name} 즐겨찾기 ${favorites.has(selected)?'해제':'추가'}`);b.textContent=favorites.has(selected)?'★':'☆';renderList();}
  else if(b.hasAttribute('data-zoom')){const c=current();$('artTitle').textContent=`${c.name} · ${media==='art'?'카드 원화':'전투 SD'}`;$('originalArt').src=asset(media==='art'?c.sourceArt:c.battleSprite);$('originalArt').alt=$('artTitle').textContent;$('artDialog').showModal();}
});
$('search').oninput=e=>{filters.q=e.target.value;updateFilters();};$('rank').onchange=e=>{filters.rank=e.target.value;updateFilters();};$('sort').onchange=e=>{filters.sort=e.target.value;updateFilters();};$('savedOnly').onclick=()=>{filters.saved=!filters.saved;updateFilters();};$('refreshCatalog').onclick=()=>void refresh();$('showOwned').onclick=()=>setView('owned',{scroll:true});
$('ownedView').parentElement.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=view==='owned'?'all':'owned';setView(next);$(next==='owned'?'ownedView':'allView').focus();});
$('closeArt').onclick=()=>$('artDialog').close();$('artDialog').addEventListener('close',()=>{if(!$('artDialog').open)$('originalArt').removeAttribute('src');});
$('inspection').addEventListener('keydown',event=>{if(event.target.dataset.media&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(!current()?.battleSprite)return;media=media==='art'?'sd':'art';renderMedia();$(media==='art'?'artTab':'sdTab').focus();}});
window.addEventListener('hashchange',()=>{if(catalog)choose(location.hash.slice(1));});
window.addEventListener('storage',event=>{if(['cnine.mercenary.cms.changed','cnine.mercenary.loadout.changed'].includes(event.key))void refresh({quiet:true});if(event.key===storageKey){try{const value=JSON.parse(event.newValue||'[]');if(Array.isArray(value)){favorites=new Set(value);renderList();renderSelection();}}catch{}}});
window.addEventListener('focus',()=>{if(Date.now()-lastCheck>2000)void refresh({quiet:true});});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>2000)void refresh({quiet:true});});
let fusionOpening=false,fusionLoadAttempt=0;
$('openFusion').onclick=async()=>{
  if(fusionOpening)return;
  if(!catalog){note('용병 정보를 불러온 뒤 다시 시도하세요.');return;}
  fusionOpening=true;
  try{const {openFusion}=await withMercenaryDeadline(import('/mercenary-codex/fusion/app.mjs?v=20260925-loading'+(fusionLoadAttempt?'&retry='+fusionLoadAttempt:'')));await openFusion({catalog,account});}
  catch(error){fusionLoadAttempt++;note(error.message||'합성 화면을 불러오지 못했습니다.');}
  finally{fusionOpening=false;}
};
controls();void refresh().then(()=>{if(params.get('fusion')==='preview'&&catalog)$('openFusion').click();});
