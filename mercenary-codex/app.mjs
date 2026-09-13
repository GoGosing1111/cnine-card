import {jointAccountRequest as api} from '/js/joint-account-transport.mjs';
import {FRAME,POSITIONS,escapeHtml as esc,asset,thumb,validateCatalog,filterCatalog} from './model.mjs?v=2098';
const $=id=>document.getElementById(id),fmt=n=>Number(n).toLocaleString('ko-KR'),storageKey='cnine.mercenaryCodex.public.v1';
const params=new URL(location.href).searchParams;
const filters={q:params.get('q')||'',position:params.get('position')||'',rank:params.get('rank')||'',sort:params.get('sort')||'code',saved:params.get('saved')==='1'};
let catalog,selected=location.hash.slice(1),media='art',favorites=new Set(),loading=false,lastCheck=0,toastTimer;
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'[]');if(Array.isArray(saved))favorites=new Set(saved);}catch{}
const current=()=>catalog?.cards.find(c=>c.code===selected);
const note=text=>{const el=$('toast');el.textContent=text;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,3000);};
function urlState(){const url=new URL(location.href);for(const [key,value] of Object.entries({q:filters.q,position:filters.position,rank:filters.rank,sort:filters.sort==='code'?'':filters.sort,saved:filters.saved?'1':''}))value?url.searchParams.set(key,value):url.searchParams.delete(key);url.hash=selected||'';history.replaceState(null,'',url);}
function controls(){
  $('search').value=filters.q;$('rank').value=filters.rank;$('sort').value=filters.sort;
  $('savedOnly').setAttribute('aria-pressed',String(filters.saved));$('savedOnly').textContent=filters.saved?'★':'☆';
  document.querySelectorAll('[data-position]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.position===filters.position)));
}
function renderList(){
  if(!catalog)return;const rows=filterCatalog(catalog.cards,filters,favorites),list=$('cardGrid');list.setAttribute('aria-busy','false');$('resultCount').textContent=`${rows.length} / ${catalog.cards.length}`;
  list.innerHTML=rows.length?rows.map(c=>`<li><button class="roster-row" type="button" data-code="${c.code}" aria-pressed="${c.code===selected}" aria-label="${esc(c.name)} ${esc(c.rank||'미정')} ${POSITIONS[c.position]} 선택"><span class="row-portrait"><img src="${thumb(c.code)}" alt="" loading="lazy" width="48" height="72"></span><span class="row-identity"><small>${c.code} <i>${POSITIONS[c.position]} · ${esc(catalog.roles[c.role].label)}</i></small><b>${esc(c.name)}</b><em>${esc(c.title)}</em></span><span class="rank-chip" data-rank="${c.rank||''}">${c.rank||'—'}</span>${favorites.has(c.code)?'<span class="row-favorite" aria-label="즐겨찾기">★</span>':''}</button></li>`).join(''):'<li class="empty-state">조건에 맞는 용병이 없습니다.<button type="button" data-reset>전체 용병 보기</button></li>';
}
function skillHtml(s,index){const balance=s.balance,ratio=Number.isFinite(balance.damageRatio)?balance.damageRatio:undefined;
  return `<article class="skill-entry"><header><span class="skill-number">${String(index+1).padStart(2,'0')}</span><div><small>${s.id} · ${esc(s.target)}</small><h3>${esc(s.name)}</h3></div><span class="skill-state ${s.ready?'':'pending'}">${s.ready?'사용 가능':'설정 대기'}</span></header><p class="skill-effect">${esc(s.effect)}</p><dl class="skill-stats"><div><dt>효과 배율</dt><dd>${ratio===undefined?'미설정':ratio===0?'지원 효과':`${fmt(ratio*100)}<small>%</small>`}</dd></div><div><dt>재사용</dt><dd>${Number.isFinite(balance.cooldownTurns)?`${fmt(balance.cooldownTurns)}<small>턴</small>`:'미설정'}</dd></div><div><dt>에너지</dt><dd>${Number.isFinite(balance.cost)?fmt(balance.cost):'미설정'}</dd></div></dl><details><summary>발동 조건 · 대응 방법 <span>+</span></summary><dl class="skill-rules">${[['발동',s.trigger],['대응',s.counterplay],['보스',s.bossRule],['추가 발동',s.procRule]].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl></details></article>`;
}
function renderSelection(){
  const c=current();if(!c)return;$('inspection').style.setProperty('--character-accent',/^#[\da-f]{6}$/i.test(c.accent)?c.accent:'#c8ff6b');
  $('inspection').innerHTML=`<div class="portrait-stage"><div class="stage-environment"></div><div class="stage-label"><span>PROJECT V / ${c.code}</span><span><i></i>CONTRACT ARCHIVE</span></div><div class="stage-heading"><span class="stage-rank" data-rank="${c.rank||''}">${c.rank||'UNRANKED'} <small>CLASS</small></span><p>${esc(c.title)}</p><h2>${esc(c.name)}</h2></div><div class="portrait-display" id="portraitDisplay"></div><div class="media-tabs" role="tablist" aria-label="용병 모습"><button id="artTab" role="tab" data-media="art" aria-controls="portraitDisplay">카드 원화</button><button id="sdTab" role="tab" data-media="sd" aria-controls="portraitDisplay" ${c.battleSprite?'':'disabled'}>전투 SD</button></div><p class="stage-caption">선택한 이미지를 누르면 원본을 확대합니다.</p></div>
  <aside class="combat-panel"><div class="panel-heading"><h2>전투 정보</h2><button type="button" class="favorite-button" data-favorite aria-pressed="${favorites.has(c.code)}" aria-label="${esc(c.name)} 즐겨찾기 ${favorites.has(c.code)?'해제':'추가'}">${favorites.has(c.code)?'★':'☆'}</button></div><div class="power-summary"><span>기본 전투력<small>등급별 고정 전투력</small></span><strong>${c.basePower===null?'—':fmt(c.basePower)}</strong></div><dl class="role-ledger"><div><dt>포지션</dt><dd>${POSITIONS[c.position]}</dd></div><div><dt>역할</dt><dd>${esc(catalog.roles[c.role].label)}</dd></div><div><dt>기본 공격</dt><dd>${esc(c.basicTarget)}</dd></div></dl><div class="tactical-notes"><p><b>강점</b>${esc(c.specialty)}</p><p><b>약점</b>${esc(c.weakness)}</p></div>
  <div class="skills-heading"><h2>배정 스킬</h2><span>${c.skills.length} SKILLS</span></div><div class="skill-list">${c.skills.map(skillHtml).join('')||'<div class="skill-empty">배정된 스킬이 없습니다.<p>기본 공격으로 전투에 참여합니다.</p></div>'}</div>${c.skills.length?'<p class="balance-note">재사용은 시전자 행동 기준입니다. 배율은 기술별 피해·회복·보호량에 적용되며, 광역·다단 기술은 전체 타격에 나눠 적용됩니다.</p>':''}<a class="primary-link" href="/mercenary-hangar/">보유 용병 편성 <span>↗</span></a></aside>`;
  renderMedia();
}
function renderMedia(){const c=current();if(!c)return;const art=media==='art';
  $('portraitDisplay').innerHTML=art?`<button class="art-card" type="button" data-zoom aria-label="${esc(c.name)} 카드 원화 확대"><img class="source-art" src="${asset(c.sourceArt)}" alt="${esc(c.name)} 카드 원화"><img class="card-frame" src="${FRAME}" alt="" aria-hidden="true"></button>`:`<button class="sd-display" type="button" data-zoom aria-label="${esc(c.name)} 전투 SD 확대"><span></span><img src="${asset(c.battleSprite)}" alt="${esc(c.name)} 전투 SD"></button>`;
  $('portraitDisplay').setAttribute('role','tabpanel');$('portraitDisplay').setAttribute('aria-labelledby',art?'artTab':'sdTab');
  document.querySelectorAll('[data-media]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.media===media));b.tabIndex=b.dataset.media===media?0:-1;});
}
function choose(code,{scroll=false}={}){if(!catalog.cards.some(c=>c.code===code))return;selected=code;media='art';urlState();renderList();renderSelection();if(scroll&&matchMedia('(max-width: 700px)').matches)$('inspection').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
function updateFilters(){urlState();controls();renderList();}
async function refresh({quiet=false}={}){
  if(loading||document.hidden&&quiet)return;loading=true;lastCheck=Date.now();$('refreshCatalog').disabled=true;
  try{const next=validateCatalog(await api('mercenary-codex',{timeoutMs:15000}));
    const changed=!catalog||catalog.revision!==next.revision;catalog=next;
    $('catalogStatus').textContent='현재 등급과 배정 스킬을 확인할 수 있습니다.';$('catalogStatus').dataset.revision=String(catalog.revision);
    $('totalCount').textContent=catalog.cards.length;$('skillCount').textContent=new Set(catalog.cards.flatMap(c=>c.skills.map(s=>s.id))).size;
    if(changed){if(!current())selected=filterCatalog(catalog.cards,filters,favorites)[0]?.code||catalog.cards[0].code;controls();renderList();renderSelection();urlState();}
  }catch(error){$('catalogStatus').textContent=catalog?'최신 정보 조회 실패 · 마지막으로 불러온 정보를 표시합니다.':error.message;
    if(!catalog){$('cardGrid').setAttribute('aria-busy','false');$('cardGrid').innerHTML='<li class="empty-state">용병 정보를 불러오지 못했습니다.<button type="button" data-retry>다시 불러오기</button></li>';}
  }finally{loading=false;$('refreshCatalog').disabled=false;}
}
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-retry')){void refresh();return;}if(!catalog)return;
  if(b.dataset.code)choose(b.dataset.code,{scroll:true});
  else if(b.hasAttribute('data-position')){filters.position=b.dataset.position;updateFilters();}
  else if(b.hasAttribute('data-reset')){Object.assign(filters,{q:'',rank:'',position:'',saved:false});updateFilters();}
  else if(b.dataset.media){media=b.dataset.media;renderMedia();}
  else if(b.hasAttribute('data-favorite')){favorites.has(selected)?favorites.delete(selected):favorites.add(selected);try{localStorage.setItem(storageKey,JSON.stringify([...favorites]));}catch{note('즐겨찾기는 이번 화면에서만 유지됩니다.');}b.setAttribute('aria-pressed',String(favorites.has(selected)));b.setAttribute('aria-label',`${current().name} 즐겨찾기 ${favorites.has(selected)?'해제':'추가'}`);b.textContent=favorites.has(selected)?'★':'☆';renderList();}
  else if(b.hasAttribute('data-zoom')){const c=current();$('artTitle').textContent=`${c.name} · ${media==='art'?'카드 원화':'전투 SD'}`;$('originalArt').src=asset(media==='art'?c.sourceArt:c.battleSprite);$('originalArt').alt=$('artTitle').textContent;$('artDialog').showModal();}
});
$('search').oninput=e=>{filters.q=e.target.value;updateFilters();};$('rank').onchange=e=>{filters.rank=e.target.value;updateFilters();};$('sort').onchange=e=>{filters.sort=e.target.value;updateFilters();};$('savedOnly').onclick=()=>{filters.saved=!filters.saved;updateFilters();};$('refreshCatalog').onclick=()=>void refresh();
$('closeArt').onclick=()=>$('artDialog').close();$('artDialog').addEventListener('close',()=>{if(!$('artDialog').open)$('originalArt').removeAttribute('src');});
$('inspection').addEventListener('keydown',event=>{if(event.target.dataset.media&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();if(!current()?.battleSprite)return;media=media==='art'?'sd':'art';renderMedia();$(media==='art'?'artTab':'sdTab').focus();}});
window.addEventListener('hashchange',()=>{if(catalog)choose(location.hash.slice(1));});
window.addEventListener('storage',event=>{if(event.key==='cnine.mercenary.cms.changed')void refresh({quiet:true});if(event.key===storageKey){try{const value=JSON.parse(event.newValue||'[]');if(Array.isArray(value)){favorites=new Set(value);renderList();renderSelection();}}catch{}}});
window.addEventListener('focus',()=>{if(Date.now()-lastCheck>2000)void refresh({quiet:true});});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheck>2000)void refresh({quiet:true});});
controls();void refresh();
