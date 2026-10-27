import {requestPublicCodex,loadCodexPanels} from './loading.mjs?v=20261023-v1';
import {CODEX_MEDIA} from './media-map.mjs?v=20261023-v1';
import {jointAccountRequest as api} from '/js/joint-account-transport.mjs';
import {withMercenaryDeadline} from '/shared/mercenary-loading-v1.mjs?v=20260925';
import {FRAME,POSITIONS,escapeHtml as esc,asset,thumb,validateCatalog,filterCatalog} from './model.mjs?blackcrownSss=20261027-cardgu-revan-v1&cardgu=20261027-live-v1&bloodmoonBalance=20261027-v2&revan=20261027-general-jok-v2&blackcrown=20261027-live-v1&jokroPower=20261025-v3&deployment=20261025-eunseol-bloodmoon&bloodmoonStock=20261025-bloodmoon-expansion-v1&limitedPower=20261025-v1&awakenedOmega=20261024-v1&razak=20261026-priority-v5&namsudaeng=20261024-v1&eunseol=20261023-v1&generalJok=20261023-v15&bloodmoon=20261023-codex-v1&stockLimit=20261023-halloween-stock-v1&jokro=20261021-codex-v1&prime=20261021-v1&zero=20261020-v1&rankReward=20261020-v1&leonel=20261018-live-v1&v=20261017-halloween-ready';

const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('ko-KR'),storageKey='cnine.mercenaryCodex.public.v1';
const params=new URL(location.href).searchParams;
const growthReview=document.body.dataset.growthReview==='true';
function growthHref(code){
  const query=new URLSearchParams();
  if(code)query.set('code',code);
  if(growthReview)query.set('preview','1');
  return '/mercenary-codex/leveling/'+(query.size?'?'+query:'');
}
const filters={q:params.get('q')||'',position:params.get('position')||'',rank:params.get('rank')||'',sort:params.get('sort')||'code',saved:params.get('saved')==='1'};
let catalog,account=null,accountError='',accountPending=false,selected=location.hash.slice(1),media='art',view=['all','limited'].includes(params.get('view'))?params.get('view'):'owned',favorites=new Set(),loading=false,loadoutBusy=false,lastCheck=0,toastTimer;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))favorites=new Set(saved);}catch{}

const catalogCards=()=>[...(catalog?.cards||[]),...(account?.cards||[]).filter(c=>c.exclusiveGrant&&!catalog?.cards.some(a=>a.code===c.code))];
const countedLimited=c=>c.edition==='LIMITED'&&!c.excludedFromLimitedCount;
const current=()=>catalogCards().find(c=>c.code===selected);
const ownedCard=code=>account?.cards?.find(c=>c.code===code)||null;
let loadoutMode=params.get('mode')==='PVP'?'PVP':'PVE';
const activeLoadout=(mode=loadoutMode)=>account?.loadouts?.[mode]||account?.loadout||{mercenaryCode:null,revision:0};
const activeCode=(mode=loadoutMode)=>activeLoadout(mode).mercenaryCode||null;
const deployableIn=(card,mode)=>card?.canDeploy!==false&&(!Array.isArray(card?.deploymentModes)||card.deploymentModes.includes(mode));
const displayImage=source=>CODEX_MEDIA[source]?.display||source;
const thumbnail=c=>CODEX_MEDIA[asset(c.thumbnailArt||c.sourceArt)]?.thumb||(c.thumbnailArt||c.artOnly?asset(c.thumbnailArt||c.sourceArt):thumb(c.code));
const positionLabel=c=>c.season==='BLACKCROWN'?'블랙크라운 리미티드':c.season==='BLOODMOON'?'블러드문 리미티드':c.season==='HALLOWEEN'?'할로윈 리미티드':c.edition==='LIMITED'?'리미티드':c.artOnly?'신규 원화':POSITIONS[c.position];
const pendingKey=()=>`cnine.mercenary.pending:${account?.accountId||''}`;
const pendingLoadout=()=>{try{return account?.accountId?JSON.parse(localStorage.getItem(pendingKey())||'null'):null;}catch{return null;}};
const note=text=>{const el=$('toast');($('inspectionSheet').open?$('inspectionSheet'):document.body).append(el);el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3200);};

function urlState(){
  const url=new URL(location.href);
  for(const [key,value] of Object.entries({q:filters.q,position:filters.position,rank:filters.rank,sort:filters.sort==='code'?'':filters.sort,saved:filters.saved?'1':'',view:view==='owned'?'':view,mode:loadoutMode}))value?url.searchParams.set(key,value):url.searchParams.delete(key);
  url.hash=selected||'';history.replaceState(null,'',url);
}
function controls(){
  $('search').value=filters.q;$('rank').value=filters.rank;$('sort').value=filters.sort;
  $('savedOnly').setAttribute('aria-pressed',String(filters.saved));$('savedOnly').textContent=filters.saved?'★':'☆';
  document.querySelectorAll('[data-position]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.position===filters.position)));
}
function renderAccountSummary(){
  $('openLeveling').href=growthHref();
  $('accountStatusTitle').closest('.archive-status').hidden=Boolean(account);
  const owned=account?.cards?.length||0,active=ownedCard(activeCode());
  $('ownedCount').textContent=account?String(owned):'—';$('totalCount').textContent=catalog?String(catalogCards().length):'—';
  $('limitedCount').textContent=catalog?String(catalogCards().filter(countedLimited).length):'—';
  $('loadoutName').textContent=account?`${loadoutMode} · ${active?.name||activeCode()||'미편성'}`:'—';
  for(const button of document.querySelectorAll('[data-loadout-mode]')){button.setAttribute('aria-pressed',String(button.dataset.loadoutMode===loadoutMode));button.disabled=loadoutBusy;}
  $('accountStatusTitle').textContent=account?`내 용병 ${owned}명`:accountError?'내 용병 연결 필요':'내 용병 확인 중';
  $('catalogStatus').textContent=account?'같은 용병을 PVE·PVP 양쪽에 편성할 수 있습니다.':accountError||'보유 용병과 편성 정보를 불러오고 있습니다.';
  $('currentDeployments').innerHTML=['PVE','PVP'].map(mode=>{
    const code=activeCode(mode),card=ownedCard(code),art=catalogCards().find(c=>c.code===code),ready=account?.available&&deployableIn(card,mode);
    return `<article class="current-slot" data-current-mode="${mode}" aria-label="${mode} 현재 편성">${art?`<img src="${thumbnail(art)}" alt="" width="58" height="76">`:'<span class="slot-empty-icon" aria-hidden="true">＋</span>'}<div class="current-slot-copy"><h3>${mode} <small>${mode==='PVE'?'모험':'대전'}</small></h3><strong>${esc(account?(card?.name||code||'미편성'):'확인 중')}</strong><p class="${code&&ready?'ready':''}">${!account?'계정 연결 확인':code?(ready?'✓ 출전 준비 완료':esc(card?.deploymentBlockedReason||'편성 상태 확인 필요')):'용병을 편성해 주세요'}</p></div><button type="button" data-select-mode="${mode}" ${loadoutBusy?'disabled':''}>${code?'용병 변경':mode+' 용병 선택'}</button></article>`;
  }).join('');
  for(const button of document.querySelectorAll('[data-view]'))button.setAttribute('aria-selected',String(button.dataset.view===view));
  $('rosterTitle').textContent=view==='limited'?'리미티드 컬렉션':view==='owned'?'내 용병 선택':'전체 용병 탐색';
  $('positions').hidden=view==='limited';
  $('catalogFootTitle').textContent=view==='limited'?'보유한 리미티드 용병을 선택해 편성하세요.':view==='owned'?'보유 용병을 선택해 바로 편성하세요.':'전체 원화·등급·스킬을 살펴보세요.';
}
function visibleCards(){
  if(!catalog)return [];
  const source=view==='owned'?catalogCards().filter(c=>ownedCard(c.code)):view==='limited'?catalogCards().filter(countedLimited):catalogCards();
  return filterCatalog(source,filters,favorites);
}
function emptyListHtml(){
  if(view!=='owned')return '<li class="empty-state">조건에 맞는 용병이 없습니다.<button type="button" data-reset>전체 용병 보기</button></li>';
  if(!account&&accountPending)return '<li class="empty-state"><b>보유 용병을 불러오는 중…</b><button type="button" data-switch-all>전체 도감 먼저 보기</button></li>';
  if(!account)return `<li class="empty-state"><b>보유 용병을 표시하지 못했습니다.</b><span>${esc(accountError||'계정 정보를 확인하고 있습니다.')}</span><button type="button" data-retry-account>다시 불러오기</button><button type="button" data-switch-all>전체 도감 먼저 보기</button></li>`;
  if(!account.cards.length)return '<li class="empty-state"><b>아직 보유한 용병이 없습니다.</b><span>전체 도감을 살펴보거나 하이퍼팩에서 용병을 획득할 수 있습니다.</span><button type="button" data-switch-all>전체 도감 보기</button><a href="/?screen=buy&amp;pack=hyper">하이퍼팩 확인 ↗</a></li>';
  return '<li class="empty-state">조건에 맞는 보유 용병이 없습니다.<button type="button" data-reset>검색 조건 초기화</button></li>';
}
function renderList(){
  if(!catalog)return;
  const rows=visibleCards(),list=$('cardGrid'),denominator=view==='owned'?(account?.cards?.length||0):view==='limited'?catalogCards().filter(countedLimited).length:catalogCards().length;
  list.setAttribute('aria-busy','false');$('resultCount').textContent=`${rows.length} / ${denominator}`;
  list.innerHTML=rows.length?rows.map(c=>{const owned=ownedCard(c.code),modes=['PVE','PVP'].filter(mode=>activeCode(mode)===c.code);return `<li><button class="roster-row" type="button" data-code="${c.code}" aria-pressed="${c.code===selected}" aria-label="${esc(c.name)} ${esc(c.rank||'미정')} ${positionLabel(c)} 선택"><span class="row-portrait"><img src="${thumbnail(c)}" alt="" loading="lazy" decoding="async" width="160" height="110"><span class="rank-chip" data-rank="${c.rank||''}">${c.rank||'—'}</span></span><span class="row-identity"><b>${esc(c.name)}</b>${c.title?`<em>${esc(c.title)}</em>`:''}<small>${positionLabel(c)} · ${esc(catalog.roles[c.role].label)}</small>${owned?`<span class="ownership-meta">Lv.${fmt(owned.level)} · 보유 ${fmt(Number(owned.duplicates||0)+1)}장</span>`:''}${modes.length?`<span class="row-active">✓ ${modes.join(' · ')} 편성 중</span>`:`<span class="row-availability">${owned?(owned.canDeploy===false?'편성 조건 확인':'보유 · 편성 가능'):'미보유'}</span>`}</span>${favorites.has(c.code)?'<span class="row-favorite" aria-label="즐겨찾기">★</span>':''}</button></li>`;}).join(''):emptyListHtml();
}
function skillHtml(s,index){if(s.codexOnly)return `<article class="skill-entry"><header><span class="skill-number">${String(index+1).padStart(2,'0')}</span><div><small>${esc(s.target)}</small><h3>${esc(s.name)}</h3></div><span class="skill-state pending">연출 공개</span></header><p class="skill-effect">${esc(s.effect)}</p></article>`;const balance=s.balance,ratio=Number.isFinite(balance.damageRatio)?balance.damageRatio:undefined,pveRatio=s.pveBalance?.damageRatio;
  return `<article class="skill-entry"><header><span class="skill-number">${String(index+1).padStart(2,'0')}</span><div><small>${s.id} · ${esc(s.target)}</small><h3>${esc(s.name)}</h3></div><span class="skill-state ${s.ready?'':'pending'}">${s.ready?'사용 가능':s.id.match(/^MS-96[0-4]$/)?'출시 대기':'설정 대기'}</span></header><p class="skill-effect">${esc(s.effect)}</p><dl class="skill-stats"><div><dt>효과 배율</dt><dd>${Number.isFinite(pveRatio)?'<small>PVE</small> '+fmt(pveRatio*100)+'<small>%</small><br><small>PVP</small> '+fmt(ratio*100)+'<small>%</small>':ratio===undefined?'미설정':ratio===0?'지원 효과':`${fmt(ratio*100)}<small>%</small>`}</dd></div><div><dt>재사용</dt><dd>${Number.isFinite(balance.cooldownTurns)?`${fmt(balance.cooldownTurns)}<small>턴</small>`:'미설정'}</dd></div><div><dt>에너지</dt><dd>${Number.isFinite(balance.cost)?fmt(balance.cost):'미설정'}</dd></div></dl><details><summary>발동 조건 · 대응 방법 <span>+</span></summary><dl class="skill-rules">${[['발동',s.trigger],['대응',s.counterplay],['보스',s.bossRule],['추가 발동',s.procRule]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></details></article>`;
}
function deploymentHtml(c){
  if(c.season==='BLACKCROWN'&&!c.deploymentEnabled)return '<section class="deployment-card unavailable limited-lock"><div><span>블랙크라운팩 · SS 리미티드</span><strong>전투 모습 · 스킬 2종 공개</strong></div><p>전투 편성을 준비 중입니다. 판매 상태와 잔여 수량은 상점에서 확인하세요.</p></section>';
  if(c.acquisition==='CRAFT_ONLY'&&c.craftAcquisitionEnabled===false&&!ownedCard(c.code))return '<section class="deployment-card unavailable"><div><span>제작 전용</span><strong>현재 획득 불가</strong></div><p>'+esc(c.acquisitionDescription)+'</p></section>';
  if(c.acquisition==='LOCKED'&&c.edition!=='LIMITED'&&!ownedCard(c.code))return '<section class="deployment-card unavailable"><div><span>획득 상태</span><strong>현재 획득 불가</strong></div><p>'+esc(c.acquisitionDescription)+'</p></section>';
  if(c.season==='BLOODMOON'&&!ownedCard(c.code))return `<section class="deployment-card unavailable limited-lock"><div><span>블러드문팩</span><strong>상점에서 개봉</strong></div><p>캐릭터별 서버 전체 ${fmt(c.serverLimit)}장 한정입니다. 판매 상태와 잔여 수량은 상점에서 확인하세요.</p></section>`;
  if(c.season==='HALLOWEEN'&&!c.deploymentEnabled)return '<section class="deployment-card unavailable limited-lock"><div><span>할로윈 일러스트 선공개</span><strong>팩 개방 예정</strong></div><p>SS 할로윈 리미티드 팩에서만 획득할 수 있습니다. 캐릭터별 서버 전체 한정 수량이며, 가격·확률·개방 일정은 추후 안내됩니다.</p></section>';
  if(c.edition==='LIMITED'&&!c.deploymentEnabled)return '<section class="deployment-card unavailable limited-lock"><div><span>리미티드 선공개</span><strong>획득 · 편성 불가</strong></div><p>현재 원화와 준비된 리소스만 공개합니다. 획득 일정은 추후 안내됩니다.</p></section>';
  const owned=ownedCard(c.code),active=['PVE','PVP'].some(mode=>activeCode(mode)===c.code),pending=pendingLoadout(),blocked=loadoutBusy||!account?.available||Boolean(pending);
  if(!account)return `<section class="deployment-card unavailable"><div><span>내 용병</span><strong>계정 연결 필요</strong></div><p>${esc(accountError||'보유 용병 정보를 불러오지 못했습니다.')}</p><button type="button" data-retry-account>다시 불러오기</button></section>`;
  if(!owned)return `<section class="deployment-card unavailable"><div><span>보유 상태</span><strong>미보유</strong></div><p>${esc(c.acquisitionDescription||'전체 도감 정보는 확인할 수 있지만 편성은 보유 용병만 가능합니다.')}${c.deploymentRequirement?'<br>'+esc(c.deploymentRequirement)+' 편성 가능':''}</p>${c.acquisition==='CRAFT_ONLY'?'<a href="/?screen=workshop">제작소에서 조건 확인 ↗</a>':c.edition==='LIMITED'?'':'<a href="/?screen=buy&amp;pack=hyper">하이퍼팩 확인 ↗</a>'}</section>`;
  return `<section class="deployment-card ${active?'active':''}" aria-label="${esc(c.name)} 용병 편성"><div class="deployment-title"><div><span>선택한 용병</span><strong>${esc(c.name)}</strong>${c.title?`<small>${esc(c.title)}</small>`:''}</div><b>${esc(c.rank)}${c.edition==='LIMITED'?'<small>LIMITED</small>':''}</b></div><p class="deployment-question">어느 전투에 편성할까요?</p><div class="deployment-actions">${['PVE','PVP'].map(mode=>{const equipped=activeCode(mode)===c.code,previous=ownedCard(activeCode(mode));return `<div class="mode-action"><button class="equip-button ${equipped?'is-equipped':''}" type="button" data-equip="${c.code}" data-deploy-mode="${mode}" ${blocked||equipped||!deployableIn(owned,mode)?'disabled':''}>${!deployableIn(owned,mode)&&owned.deploymentModes?.includes('PVE')?'PVE 전용':equipped?'✓ '+mode+' 편성 완료':loadoutBusy&&pending?.body.mode===mode?'편성 저장 중…':mode+'에 편성'}</button><small>${!deployableIn(owned,mode)&&owned.deploymentModes?.includes('PVE')?'PVP 편성 불가':equipped?'현재 출전 용병':`${esc(previous?.name||activeCode(mode)||'미편성')} → ${esc(c.name)}`}</small>${equipped?`<button class="unequip-button" type="button" data-unequip data-deploy-mode="${mode}" ${blocked?'disabled':''}>${mode} 편성 해제</button>`:''}</div>`;}).join('')}</div>${pending?`<button class="recover-button" type="button" data-recover-loadout ${loadoutBusy?'disabled':''}>${esc(pending.body?.mode||'PVE')} 이전 편성 처리 결과 확인</button>`:''}<p class="deployment-hint">${pending?'이전 편성 결과를 확인하면 새 편성을 진행할 수 있습니다.':owned.canDeploy===false?esc(owned.deploymentBlockedReason||'현재 편성 조건을 충족하지 못했습니다.'):!account.available?'현재 용병 편성을 사용할 수 없습니다.':owned.deploymentModes?.length===1?'PVE 전용 용병입니다. PVP에는 편성할 수 없습니다.':'같은 용병을 PVE·PVP 양쪽에 편성할 수 있습니다.'}</p><div class="selection-ownership"><span>Lv.${fmt(owned.level)} · 보유 ${fmt(Number(owned.duplicates||0)+1)}장</span><a class="growth-entry" href="${esc(growthHref(c.code))}">용병 성장 ↗</a></div></section>`;
}
function renderSelection(){
  const c=current();if(!c){$('inspection').innerHTML=`<div class="empty-selection"><span>PROJECT V</span><h2>${view==='owned'?'보유 용병을 선택하세요.':'당신의 다음 전력을 확인하세요.'}</h2><p>${view==='owned'?'선택한 자리에서 바로 편성할 수 있습니다.':'용병을 선택하면 원화와 스킬을 볼 수 있습니다.'}</p></div>`;return;}
  $('inspection').classList.toggle('halloween-inspection',c.season==='HALLOWEEN');
  $('inspection').style.setProperty('--character-accent',/^#[\da-f]{6}$/i.test(c.accent)?c.accent:'#c8ff6b');
  $('inspection').innerHTML=`${deploymentHtml(c)}<div class="portrait-stage"><div class="stage-environment"></div><div class="stage-label"><span>PROJECT V / ${c.code}</span><span><i></i>CONTRACT ARCHIVE</span></div><div class="stage-heading"><span class="stage-rank" data-rank="${c.rank||''}">${c.rank||'UNRANKED'} <small>CLASS</small></span>${c.title?`<p>${esc(c.title)}</p>`:""}<h2>${esc(c.name)}</h2></div><div class="portrait-display" id="portraitDisplay"></div><div class="media-tabs" role="tablist" aria-label="용병 모습"><button id="artTab" role="tab" data-media="art" aria-controls="portraitDisplay">카드 원화</button><button id="sdTab" role="tab" data-media="sd" aria-controls="portraitDisplay" ${c.battleSprite?'':'disabled'}>${c.season==='BLACKCROWN'?'전투 모습':'전투 SD'}</button></div><p class="stage-caption">선택한 이미지를 누르면 원본을 확대합니다.</p></div>
  <aside class="combat-panel"><div class="panel-heading"><h2>전투 정보</h2><button type="button" class="favorite-button" data-favorite aria-pressed="${favorites.has(c.code)}" aria-label="${esc(c.name)} 즐겨찾기 ${favorites.has(c.code)?'해제':'추가'}">${favorites.has(c.code)?'★':'☆'}</button></div><div class="power-summary"><span>기본 전투력<small>등급별 고정 전투력</small></span><strong>${c.basePower===null?'—':fmt(c.basePower)}</strong></div><dl class="role-ledger"><div><dt>포지션</dt><dd>${positionLabel(c)}</dd></div><div><dt>역할</dt><dd>${esc(catalog.roles[c.role].label)}</dd></div><div><dt>기본 공격</dt><dd>${esc(c.basicTarget)}</dd></div></dl><div class="tactical-notes"><p><b>강점</b>${esc(c.specialty)}</p><p><b>약점</b>${esc(c.weakness)}</p></div>
  ${c.combatLinkDescription?`<p class="balance-note"><b>전력 연계</b><br>${esc(c.combatLinkDescription)}</p>`:''}<div class="skills-heading"><h2>배정 스킬</h2><span>${c.skills.length} SKILLS</span></div><div class="skill-list">${c.skills.map(skillHtml).join('')||'<div class="skill-empty">배정된 스킬이 없습니다.<p>기본 공격으로 전투에 참여합니다.</p></div>'}</div>${c.skills.length?'<p class="balance-note">재사용은 시전자 행동 기준입니다. 배율은 기술별 피해·회복·보호량에 적용되며, 광역·다단 기술은 전체 타격에 나눠 적용됩니다.</p>':''}</aside>`;
  if(c.artOnly&&!c.deploymentEnabled)$('inspection').querySelector('.combat-panel').innerHTML=`<div class="panel-heading"><h2>신규 원화 공개</h2><button type="button" class="favorite-button" data-favorite aria-pressed="${favorites.has(c.code)}" aria-label="${esc(c.name)} 즐겨찾기 ${favorites.has(c.code)?'해제':'추가'}">${favorites.has(c.code)?'★':'☆'}</button></div><div class="power-summary"><span>용병 등급<small>원화 선공개</small></span><strong>${esc(c.rank)}</strong></div><dl class="role-ledger"><div><dt>이름</dt><dd>${esc(c.name)}</dd></div><div><dt>무기</dt><dd>${esc(c.weapon)}</dd></div></dl><div class="skill-empty"><b>출시 예정</b><p>원화를 먼저 만나보세요.<br>획득 방법과 전투 스킬은 추후 공개됩니다.</p></div>`;
  if(c.edition==='LIMITED'){
    $('inspection').classList.add('limited-inspection');
    $('inspection').querySelector('.combat-panel').innerHTML=`<div class="panel-heading"><h2>리미티드 컬렉션</h2><button type="button" class="favorite-button" data-favorite aria-pressed="${favorites.has(c.code)}" aria-label="${esc(c.name)} 즐겨찾기">${favorites.has(c.code)?'★':'☆'}</button></div><div class="limited-edition-mark"><span>${c.season==='BLOODMOON'?'BLOODMOON / LIMITED EDITION':c.season==='HALLOWEEN'?'HALLOWEEN / LIMITED EDITION':'LIMITED EDITION'}</span><h3>${esc(c.name)}</h3>${c.title?`<p>${esc(c.title)}</p>`:""}</div><dl class="limited-record">${c.season==='BLOODMOON'?'<div><dt>전용 팩</dt><dd>'+esc(c.acquisitionPackName)+'</dd></div><div><dt>발행 한도</dt><dd>캐릭터별 서버 '+fmt(c.serverLimit)+'장</dd></div><div><dt>판매 상태</dt><dd>상점에서 확인</dd></div>':c.season==='HALLOWEEN'?'<div><dt>전용 팩</dt><dd>SS 할로윈 리미티드 팩</dd></div><div><dt>발행 한도</dt><dd>캐릭터별 서버 '+fmt(c.serverLimit)+'장</dd></div>':''}<div><dt>용병 등급</dt><dd>${esc(c.rank||'미정')}</dd></div><div><dt>공개 리소스</dt><dd>${c.battleSprite?'원화 · 전투 SD':'카드 원화'}</dd></div><div><dt>전투 편성</dt><dd>${c.deploymentEnabled?esc(c.deploymentRequirement||'보유 시 가능'):'준비 중'}</dd></div></dl><div class="skill-empty"><b>${c.deploymentEnabled?'리미티드 전투 편성':'리미티드 선공개'}</b><p>${c.deploymentEnabled?'보유한 리미티드 용병을 PVE와 PVP에 각각 편성할 수 있습니다.':'전투 편성을 준비 중입니다.'}<br>${c.acquisition==='ACCOUNT_RANK_REWARD'?esc(c.acquisitionDescription)+' · 팩·합성·제작 획득 불가':c.season==='BLOODMOON'?'블러드문팩 전용 · 판매 상태와 잔여 수량은 상점에서 확인하세요.':c.acquisition==='BLACKCROWN_PACK'?'블랙크라운팩 전용 · 팩 한도 각 5장 · 판매 상태와 잔여 수량은 상점에서 확인하세요.':c.acquisition==='LOCKED'?'획득 잠금 · 획득 방법은 추후 지정됩니다.':c.acquisition==='CRAFT_ONLY'&&c.craftAcquisitionEnabled===false?esc(c.acquisitionDescription):c.acquisition==='CRAFT_ONLY'?'제작 전용 · 팩 획득 불가 · 제작 조건은 제작소에서 확인하세요.':c.season==='HALLOWEEN'?'할로윈 리미티드 용병팩 전용 · 판매 상태와 잔여 수량은 상점에서 확인하세요.':['V-989','V-979'].includes(c.code)?'할로윈 리미티드 용병팩 '+fmt(c.serverLimit)+'장 · 기존 전용 지급분은 별도입니다.':c.exclusiveGrant?'지정 계정 전용 지급 · 일반 획득 불가 · 리미티드 수량 제외':'리미티드 용병팩 출시는 추후 안내됩니다.'}</p></div>`;
    if(c.code==='V-970'||c.code==='V-971'||c.code==='V-972'||c.season==='BLOODMOON'||c.season==='HALLOWEEN'||c.code==='V-989'||c.code==='V-979'||c.code==='V-978'||c.code==='V-973'||c.code==='V-974'||c.code==='V-975'||c.code==='V-976'||c.code==='V-987')$('inspection').querySelector('.combat-panel').insertAdjacentHTML('beforeend',`<div class="power-summary"><span>기본 전투력</span><strong>${fmt(c.basePower)}</strong></div><div class="skills-heading"><h2>배정 스킬</h2></div><div class="skill-list">${c.skills.map(skillHtml).join('')}</div>`);
    if(c.season==='BLACKCROWN')$('inspection').querySelector('.combat-panel').innerHTML=`<div class="panel-heading"><h2>블랙크라운 리미티드</h2><button type="button" class="favorite-button" data-favorite aria-pressed="${favorites.has(c.code)}" aria-label="${esc(c.name)} 즐겨찾기">${favorites.has(c.code)?'★':'☆'}</button></div><div class="limited-edition-mark"><span>BLACK CROWN / SS LIMITED</span><h3>${esc(c.name)}</h3></div><dl class="limited-record"><div><dt>전용 팩</dt><dd>블랙크라운팩</dd></div><div><dt>발행 한도</dt><dd>캐릭터별 서버 ${fmt(c.serverLimit)}장</dd></div><div><dt>판매 상태</dt><dd>상점에서 확인</dd></div><div><dt>무기</dt><dd>${esc(c.weapon)}</dd></div><div><dt>전투 편성</dt><dd>보유 즉시 PVE · PVP</dd></div></dl><div class="power-summary"><span>기본 전투력</span><strong>${fmt(c.basePower)}</strong></div><div class="skills-heading"><h2>배정 스킬</h2><span>2 SKILLS</span></div><div class="skill-list">${c.skills.map(skillHtml).join('')}</div><p class="balance-note">적을 향한 측면 대기 · 모션 2배속<br>${esc(c.combatLinkDescription)}</p>`;
    if(c.code==='V-980'&&c.visualSkill?.id==='HALLOWEEN_CARNIVAL_BREAK')$('inspection').querySelector('.combat-panel').insertAdjacentHTML('beforeend',`<section class="harlequin-skill-preview"><small>HALLOWEEN / HARLEQUIN</small><h3>${esc(c.visualSkill.name)}</h3><p>${esc(c.visualSkill.description)}</p><a href="/preview/halloween-bongsoon-harlequin-20261017/">스킬 연출 보기</a></section>`);
    if(c.combatLinkDescription)$('inspection').querySelector('.combat-panel').insertAdjacentHTML('beforeend',`<p class="balance-note limited-combat-note"><b>전투 성능 · 행동 주기</b><br>${esc(c.combatLinkDescription)}</p>`);
  }else $('inspection').classList.remove('limited-inspection');
  const inspection=$('inspection'),portrait=inspection.querySelector('.portrait-stage'),combat=inspection.querySelector('.combat-panel'),owned=ownedCard(c.code);
  const overview=document.createElement('div');overview.className='inspection-overview';
  overview.innerHTML=`<aside class="selection-summary"><p>${positionLabel(c)} · ${esc(catalog.roles[c.role].label)} · ${esc(c.rank||'미정')}</p><div class="power-summary"><span>${owned?'현재 전투력':'기본 전투력'}</span><strong>${(owned?.basePower??c.basePower)==null?'—':fmt(owned?.basePower??c.basePower)}</strong></div>${c.skills[0]?`<div class="signature-skill"><small>대표 스킬</small><h3>${esc(c.skills[0].name)}</h3><p>${esc(c.skills[0].effect)}</p></div>`:'<p>배정 스킬은 상세 정보에서 확인하세요.</p>'}</aside>`;
  overview.prepend(portrait);combat.before(overview);
  const favorite=combat.querySelector('[data-favorite]');if(favorite)overview.lastElementChild.append(favorite);
  const details=document.createElement('details');details.className='combat-details';details.innerHTML='<summary>스킬·전투 성능 자세히 보기</summary>';combat.before(details);details.append(combat);
  renderMedia();
}
function bloodmoonSprite(c){const v=c.battleSpriteViewport;return `<svg class="bloodmoon-sprite" viewBox="${v.x} ${v.y} ${v.width} ${v.height}" preserveAspectRatio="xMidYMax meet" role="img" aria-label="${esc(c.name)} 전투 SD"><image href="${asset(c.battleSprite)}" width="${v.imageWidth}" height="${v.imageHeight}" /></svg>`;}
function renderMedia(){const c=current();if(!c||!$('portraitDisplay'))return;
  if(matchMedia('(max-width: 760px)').matches&&!$('inspectionSheet').open){$('portraitDisplay').replaceChildren();return;}
  const art=media==='art';
  $('portraitDisplay').innerHTML=art?`<button class="art-card ${c.edition==='LIMITED'?'limited-art-card':''}" ${c.edition==='LIMITED'?`style="--art-left:${c.artWindow.left}%;--art-top:${c.artWindow.top}%;--art-width:${c.artWindow.width}%;--art-height:${c.artWindow.height}%"`:''} type="button" data-art-code="${esc(c.code)}" data-zoom aria-label="${esc(c.name)} 카드 원화 확대"><img class="source-art" decoding="async" fetchpriority="high" src="${displayImage(asset(c.displayArt||c.sourceArt))}" data-display-original="${asset(c.displayArt||c.sourceArt)}" alt="${esc(c.name)} 카드 원화"><img class="card-frame" decoding="async" src="${displayImage(c.frame?asset(c.frame):FRAME)}" data-display-original="${c.frame?asset(c.frame):FRAME}" alt="" aria-hidden="true"></button>`:`<button class="sd-display" type="button" data-zoom aria-label="${esc(c.name)} 전투 SD 확대">${c.battleSpriteViewport?bloodmoonSprite(c):`<span></span><img src="${asset(c.battleSprite)}" alt="${esc(c.name)} 전투 SD">`}</button>`;
  $('portraitDisplay').setAttribute('role','tabpanel');$('portraitDisplay').setAttribute('aria-labelledby',art?'artTab':'sdTab');
  document.querySelectorAll('[data-media]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.media===media));b.tabIndex=b.dataset.media===media?0:-1;});
}
function choose(code,{scroll=false}={}){if(!catalogCards().some(c=>c.code===code))return;selected=code;media='art';urlState();renderList();renderSelection();if(scroll&&matchMedia('(max-width: 760px)').matches)openInspection();}
function openInspection(){
  if(!current())return;
  $('inspectionSheetBody').append($('inspection'));
  if(!$('inspectionSheet').open)$('inspectionSheet').showModal();
  document.body.classList.add('inspection-open');renderMedia();
}
function closeInspection(){if($('inspectionSheet').open)$('inspectionSheet').close();}
$('inspectionSheet').addEventListener('close',()=>{
  $('inspectionHome').append($('inspection'));document.body.classList.remove('inspection-open');
  document.body.append($('toast'));renderMedia();
  document.querySelector(`.roster-row[data-code="${selected}"]`)?.focus({preventScroll:true});
});
$('closeInspection').onclick=closeInspection;
matchMedia('(max-width: 760px)').addEventListener('change',event=>{if(!event.matches)closeInspection();renderMedia();});
document.addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.dataset.displayOriginal){const original=img.dataset.displayOriginal;delete img.dataset.displayOriginal;if(img.getAttribute('src')!==original)img.src=original;}},true);
function setView(next,{scroll=false}={}){if(!['owned','all','limited'].includes(next))return;if(view===next){if(scroll)$('catalogControls').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return;}view=next;if(next==='limited')filters.position='';controls();const rows=visibleCards();if(!rows.some(c=>c.code===selected))selected=next==='owned'?(activeCode()&&ownedCard(activeCode())?activeCode():rows[0]?.code||''):(rows[0]?.code||'');urlState();renderAccountSummary();renderList();renderSelection();if(scroll)$('catalogControls').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
function setLoadoutMode(mode){if(loadoutBusy||!['PVE','PVP'].includes(mode))return;loadoutMode=mode;urlState();renderAccountSummary();renderList();renderSelection();}
function updateFilters(){urlState();controls();renderList();}
async function refresh({quiet=false}={}){
  if(loading||document.hidden&&quiet)return;loading=true;accountPending=true;lastCheck=Date.now();$('refreshCatalog').disabled=true;
  const renderReady=()=>{
    if(!catalog)return;
    $('skillCount').textContent=new Set(catalog.cards.flatMap(c=>c.skills.map(s=>s.id))).size;
    const rows=visibleCards(),preferred=view==='owned'?(activeCode()&&ownedCard(activeCode())?activeCode():account?.cards?.[0]?.code):catalog.cards[0]?.code;
    if(!(view==='owned'&&accountPending&&!account)&&(!current()||view==='owned'&&!ownedCard(selected)||view==='limited'&&current()?.edition!=='LIMITED'))selected=rows[0]?.code||(view==='limited'?'':preferred)||'';
    controls();renderAccountSummary();renderList();renderSelection();urlState();
  };
  try{
    await loadCodexPanels({
      catalog:()=>requestPublicCodex(),account:()=>api('mercenaries/v3/state',{timeoutMs:15000}),
      onCatalog:value=>{catalog=validateCatalog(value);renderReady();},
      onAccount:value=>{account=value;accountError='';accountPending=false;renderReady();},
      onCatalogError:error=>{
        $('catalogStatus').textContent=catalog?'최신 정보 조회 실패 · 마지막 정보를 표시합니다.':error.message;
        if(!catalog){$('cardGrid').setAttribute('aria-busy','false');$('cardGrid').innerHTML='<li class="empty-state">용병 정보를 불러오지 못했습니다.<button type="button" data-retry>다시 불러오기</button></li>';}
      },
      onAccountError:error=>{account=null;accountPending=false;accountError=error?.message||'로그인 후 보유 용병을 확인할 수 있습니다.';renderReady();}
    });
  }finally{loading=false;accountPending=false;$('refreshCatalog').disabled=false;}
}
async function runLoadout(mercenaryCode,{recover=false,mode=loadoutMode}={}){
  if(loadoutBusy||!account)return;
  if(!['PVE','PVP'].includes(mode))return;
  const storage=pendingKey();
  let pending=pendingLoadout();
  if(pending&&!recover){note('이전 편성 처리 결과를 먼저 확인하세요.');return;}
  if(!pending&&!recover){pending={action:'loadout',body:{requestId:crypto.randomUUID(),mercenaryCode,mode,revision:activeLoadout(mode).revision}};try{localStorage.setItem(storage,JSON.stringify(pending));}catch{note('편성 요청을 안전하게 저장하지 못했습니다. 브라우저 저장소를 확인하세요.');return;}}
  if(!pending){note('확인할 편성 요청이 없습니다.');return;}
  loadoutBusy=true;renderAccountSummary();renderSelection();
  try{
    const result=await api(`mercenaries/v3/${pending.action}`,{method:'POST',body:pending.body});
    try{localStorage.removeItem(storage);localStorage.setItem('cnine.mercenary.loadout.changed',String(Date.now()));}catch{}
    note(`${pending.body.mode||'PVE'} · ${result.replayed?'저장된 편성 결과를 복구했습니다.':pending.body.mercenaryCode?'용병 편성을 저장했습니다.':'용병 편성을 해제했습니다.'}`);await refresh();
  }catch(error){note(error.message);if(error.status>=400&&error.status<500&&!['JOINT_REQUEST_CONFLICT','MERCENARY_CLOSED'].includes(error.code))try{localStorage.removeItem(storage);}catch{}
    if(error.code==='MERCENARY_LOADOUT_CONFLICT')await refresh();
  }finally{loadoutBusy=false;renderAccountSummary();renderList();renderSelection();if($('inspectionSheet').open)$('closeInspection').focus({preventScroll:true});}
}

document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
  if(b.dataset.loadoutMode){setLoadoutMode(b.dataset.loadoutMode);return;}
  if(b.dataset.selectMode){setLoadoutMode(b.dataset.selectMode);setView('owned',{scroll:true});$('search').focus({preventScroll:true});return;}
  if(b.dataset.view){setView(b.dataset.view);return;}
  if(b.hasAttribute('data-switch-all')){setView('all');return;}
  if(b.hasAttribute('data-retry-account')){void refresh();return;}
  if(b.hasAttribute('data-equip')){void runLoadout(b.dataset.equip,{mode:b.dataset.deployMode});return;}
  if(b.hasAttribute('data-unequip')){void runLoadout(null,{mode:b.dataset.deployMode});return;}
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
$('ownedView').parentElement.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const views=['owned','all','limited'],next=views[(views.indexOf(view)+(event.key==='ArrowRight'?1:2))%3];setView(next);$({owned:'ownedView',all:'allView',limited:'limitedView'}[next]).focus();});
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
  try{const {openFusion}=await withMercenaryDeadline(import('/mercenary-codex/fusion/app.mjs?v=20261019-bulk'+(fusionLoadAttempt?'&retry='+fusionLoadAttempt:'')));await openFusion({catalog,account,preview:params.get('fusion')==='preview',onAccount:value=>{account=value;renderAccountSummary();renderList();renderSelection();}});}
  catch(error){fusionLoadAttempt++;note(error.message||'합성 화면을 불러오지 못했습니다.');}
  finally{fusionOpening=false;}
};
controls();void refresh().then(()=>{if(params.get('fusion')==='preview'&&catalog)$('openFusion').click();});
