import {organizationDistrictById} from '../shared/organization-faction-v1.mjs?v=20261019-six-organizations';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null?'—':Number(value).toLocaleString('ko-KR');
const emblem=id=>`<svg class="org-emblem-v1" viewBox="${[174,442,708][(id-1)%3]} ${[188,410,630,850,1072][Math.floor((id-1)/3)]} 206 ${id<=9?184:188}" aria-hidden="true"><image href="/assets/ui/organization/emblem-concepts-20261012.png" width="1086" height="1448"/></svg>`;

export function organizationStandings(state){
 const faction=state.faction&&(!state.faction.roundId||state.faction.roundId===state.round?.id)?state.faction:null;
 const districts=Array.isArray(faction?.districts)?faction.districts:null;
 const rows=(state.organizations||[]).map(org=>{
  const treasury=faction?.organizations?.find(o=>o.id===org.id),stage=treasury?.stage??org.hideout?.stage;
  return {...org,memberCount:treasury?.memberCount??org.memberCount,stage,
   hideoutName:state.preparation?.hideouts?.[stage-1]||org.hideout?.name||'확인 대기',
   funds:Number.isFinite(treasury?.funds)?treasury.funds:null,
   territories:districts?.filter(d=>d.owner===org.id)??null,
   isMine:state.membership?.organizationId===org.id};
 }).sort((a,b)=>(b.territories?.length??0)-(a.territories?.length??0)||a.id-b.id);
 return {rows,faction,total:districts?.length??null,occupied:districts?.filter(d=>d.owner).length??null,
  neutral:districts?.filter(d=>!d.owner).length??null,
  battles:faction?.battles?.filter(b=>b.status==='ACTIVE').length??null,
  members:rows.reduce((n,o)=>n+Number(o.memberCount||0),0)};
}

export function organizationDashboardHeader(state){
 const {rows,members,faction}=organizationStandings(state);
 const status=!faction?'전황 확인 대기':!faction.season?.active?'시즌 준비 중':faction.sessions?.active?'세력전 진행 중':'시즌 진행 중 · 회차 대기';
 return `<section class="org-live-hero" aria-labelledby="org-live-title"><div><span class="org-kicker">ORGANIZATION / CITY CONTROL</span><h1 id="org-live-title">조직 현황</h1><p>서울·경기남부, 우리 조직의 영역을 확인하세요.</p><span class="org-live-state">${status}</span></div><dl><div><dt>활동 조직</dt><dd>${rows.length}<small>개</small></dd></div><div><dt>소속 인원</dt><dd>${number(members)}<small>명</small></dd></div></dl></section>`;
}

export function organizationDashboardView(state){
 const {rows,total,occupied,neutral,battles,faction}=organizationStandings(state);
 const time=faction?.serverNow?new Date(faction.serverNow).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):null;
 return `<section class="org-directory" aria-labelledby="org-directory-title">
  <header class="org-directory-heading"><div><span class="org-kicker">ORGANIZATIONS & TERRITORIES</span><h2 id="org-directory-title">조직 목록 · 세력 보유 현황</h2><p>점령 거점 순 · 조직별 최대 25명${time?' · '+time+' 기준':''}</p></div><div class="org-directory-actions"><button type="button" data-org-refresh>현황 새로고침</button><button type="button" class="org-primary" data-tab="faction">전황 지도 보기 →</button></div></header>
  <dl class="org-directory-totals" aria-label="전체 세력 현황"><div><dt>점령 지역</dt><dd>${number(occupied)}<small> / ${number(total)}</small></dd></div><div><dt>무주지</dt><dd>${number(neutral)}<small>곳</small></dd></div><div><dt>진행 중 교전</dt><dd>${number(battles)}<small>곳</small></dd></div></dl>
  ${!faction||state.factionError?'<p class="org-directory-warning" role="status">전황 정보를 불러오지 못했습니다. 현황 새로고침을 눌러 다시 확인해 주세요.</p>':''}
  <div class="org-directory-grid">${rows.map(org=>`<article class="org-directory-card ${org.isMine?'is-mine':''}" data-org-id="${org.id}" aria-label="${esc(org.name)} 현황">
   <header>${emblem(org.id)}<div><span class="org-kicker">ORGANIZATION ${String(org.id).padStart(2,'0')}</span><h3>${esc(org.name)}</h3><p>${org.isMine?'내 조직':'조직원'} · ${number(org.memberCount)} / 25명</p></div>${org.isMine?'<button type="button" class="org-directory-mine" data-tab="mine">내 조직 보기</button>':''}</header>
   <dl class="org-directory-metrics"><div><dt>점령 거점</dt><dd>${org.territories===null?'—':org.territories.length}<small>곳</small></dd></div><div><dt>공동 자금</dt><dd>${number(org.funds)}</dd></div></dl>
   <p class="org-directory-hideout">아지트 <strong>${esc(org.hideoutName)}</strong><span>${number(org.stage??null)}단계</span></p>
   <details class="org-directory-territories"><summary>보유 지역${org.territories?.length?' '+org.territories.length+'곳':''} <span>펼쳐보기</span></summary><p>${org.territories===null?'전황 확인 후 표시됩니다.':org.territories.length?org.territories.map(d=>esc(organizationDistrictById(d.id)?.name||d.id)).join(' · '):'현재 점령한 지역이 없습니다.'}</p></details>
  </article>`).join('')}</div>
  <p class="org-directory-note">공동 자금은 개인 코인과 별도로 보관됩니다. 현재 점령 상태는 회차가 진행되면서 달라질 수 있습니다.</p>
 </section>`;
}
