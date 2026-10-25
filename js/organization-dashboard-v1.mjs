import {organizationCrest} from './organization-identity-v1.mjs?v=20261025-clan-eight';
import {organizationIdentity} from '../shared/organization-identity-v1.mjs?v=20261025-clan-eight';
import {organizationDistrictById} from '../shared/organization-faction-v1.mjs?v=20261025-clan-eight';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>value===null?'—':Number(value).toLocaleString('ko-KR');

const emblem=id=>organizationCrest(id);
export function organizationStandings(state){
 const faction=state.faction&&(!state.faction.roundId||state.faction.roundId===state.round?.id)?state.faction:null;
 const districts=Array.isArray(faction?.districts)?faction.districts:null;
 const rows=(state.organizations||[]).map(org=>{
  const treasury=faction?.organizations?.find(o=>o.id===org.id),stage=treasury?.stage??org.hideout?.stage;
  return {...org,...organizationIdentity(org.id),memberCount:treasury?.memberCount??org.memberCount,stage,
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
 const {rows,members,faction}=organizationStandings(state),session=faction?.sessions?.current;
 const active=faction?.sessions?.active,paused=session?.status==='PAUSED';
 const status=!faction?'전황 확인 대기':faction.sessions?.scheduleLocked?'모든 대회 일정 잠금':!faction.season?.active?'시즌 준비 중':paused?'영토전으로 일시중단':active?'세력전 진행 중':'다음 세력전 대기';
 const required=faction?.sessions?.rules?.requiredTerritories??8;
 const next=faction?.sessions?.nextStartsAt?{startsAt:faction.sessions.nextStartsAt}:faction?.sessions?.schedule?.find(s=>s.status==='SCHEDULED'&&s.startsAt>faction.serverNow);
 return `<section class="org-live-hero" aria-labelledby="org-live-title"><div class="org-hero-copy"><span class="org-kicker">SEOUL · CLAN</span><h1 id="org-live-title">클랜 본부</h1><p>서울 25개 구를 두고 펼치는 우리 클랜의 전쟁.<br>매일 2회 랜덤 · 회차당 3시간 · 승점 미포함</p><div class="org-hero-status"><strong>${status}</strong>${active&&session?.endsAt?`<span>종료까지 <b data-org-war-until="${session.endsAt}">—</b></span>`:next?`<span>다음 개전 ${new Date(next.startsAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false})}</span>`:''}</div><div class="org-hero-actions"><button type="button" class="org-primary" data-tab="faction">세력전 현황 →</button><button type="button" data-tab="faction" data-war-tab="formation">부대 편성</button><button type="button" data-tab="mine">내 클랜</button></div></div><dl class="org-hero-stats"><div><dt>보상 점령 조건</dt><dd>${required}<small>곳 이상</small></dd><p>종료 시 실제 참여자 지급</p></div><div><dt>활동 클랜 · 소속 인원</dt><dd>${rows.length}<small>개 · ${number(members)}명</small></dd></div></dl></section>`;
}

export function organizationDashboardView(state){
 const {rows,total,occupied,neutral,battles,faction}=organizationStandings(state);
 const time=faction?.serverNow?new Date(faction.serverNow).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):null;
 return `<section class="org-directory" aria-labelledby="org-directory-title">
  <header class="org-directory-heading"><div><span class="org-kicker">LIVE STANDINGS</span><h2 id="org-directory-title">서울 세력 현황</h2><p>점령 거점 순 · 클랜별 최대 25명${time?' · '+time+' 기준':''}</p></div><div class="org-directory-actions"><button type="button" data-org-refresh>현황 새로고침</button><button type="button" class="org-primary" data-tab="faction">전황 새 창으로 보기 →</button></div></header>
  <dl class="org-directory-totals" aria-label="전체 세력 현황"><div><dt>점령 지역</dt><dd>${number(occupied)}<small> / ${number(total)}</small></dd></div><div><dt>무주지</dt><dd>${number(neutral)}<small>곳</small></dd></div><div><dt>진행 중 교전</dt><dd>${number(battles)}<small>곳</small></dd></div></dl>
  ${!faction||state.factionError?'<p class="org-directory-warning" role="status">전황 정보를 불러오지 못했습니다. 현황 새로고침을 눌러 다시 확인해 주세요.</p>':''}
  <div class="org-directory-grid">${rows.map(org=>`<article class="org-directory-card ${org.isMine?'is-mine':''}" data-org-id="${org.id}" aria-label="${esc(org.name)} 현황">
   <header>${emblem(org.id)}<div><span class="org-kicker">CLAN ${String(org.id).padStart(2,'0')}</span><h3>${esc(org.name)}</h3><p>${org.isMine?'내 클랜':'클랜원'} · ${number(org.memberCount)} / 25명</p></div>${org.isMine?'<button type="button" class="org-directory-mine" data-tab="mine">내 클랜 보기</button>':''}</header>
   <dl class="org-directory-metrics"><div><dt>점령 거점</dt><dd>${org.territories===null?'—':org.territories.length}<small>곳</small></dd></div><div><dt>공동 자금</dt><dd>${number(org.funds)}</dd></div></dl>
   <p class="org-directory-hideout">아지트 <strong>${esc(org.hideoutName)}</strong><span>${number(org.stage??null)}단계</span></p>
   <details class="org-directory-territories"><summary>보유 지역${org.territories?.length?' '+org.territories.length+'곳':''} <span>펼쳐보기</span></summary><p>${org.territories===null?'전황 확인 후 표시됩니다.':org.territories.length?org.territories.map(d=>esc(organizationDistrictById(d.id)?.name||d.id)).join(' · '):'현재 점령한 지역이 없습니다.'}</p></details>
  </article>`).join('')}</div>
  <p class="org-directory-note">공동 자금은 개인 코인과 별도로 보관됩니다. 현재 점령 상태는 회차가 진행되면서 달라질 수 있습니다.</p>
 </section>`;
}
