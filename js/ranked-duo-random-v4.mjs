import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {duoTiers} from '../shared/ranked-duo-season-v2.mjs';
import {isOpenDuo} from '../shared/ranked-duo-random-v4.mjs?v=20261020-start2';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('ko-KR');
const date=v=>v?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'일정 준비 중';
const art='/assets/ui/ranked-duo/';
const badge=(id='silver',alt='',size=80)=>`<img class="rd-crest" src="${art}${esc(id)}-v2.webp" width="${size}" height="${size}" alt="${esc(alt)}">`;
const button=(action,text,{disabled=false,primary=false,extra=''}={})=>`<button class="rd-button ${primary?'rd-primary':''}" data-duo="${action}" ${disabled?'disabled':''} ${extra}>${text}</button>`;
const phases={DRAFT:'시즌 준비',RECRUITING:'참가 모집 중',READY:'대전 준비',ACTIVE:'시즌 진행 중',SETTLING:'시즌 정산 중',CLOSED:'시즌 종료'};
export function randomDuoStyle(){
 if(document.querySelector('[data-duo-random-style]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href='/css/ranked-duo-random-v4.css?v=20261020-1';link.dataset.duoRandomStyle='1';document.head.append(link);
}
export function randomDuoShell(state,tab,userId,pending){
 randomDuoStyle();const s=state?.season;
 return `<section class="duo-random"><header class="rd-masthead"><div class="rd-brand">${badge('challenger','듀오 문장',76)}<div><p class="rd-kicker">RANDOM DUO · ASYNCHRONOUS</p><h1>랭크 듀오</h1><p>매 경기 새로운 동료, 나만의 시즌 기록</p></div></div><div class="rd-header-actions"><span class="rd-badge">${phases[s?.status]||'개편 준비 · OFF'}</span>${button('refresh','새로고침')}</div></header>
 <nav class="rd-nav" aria-label="듀오 메뉴">${[['home','매칭 로비'],['ranking','개인 랭킹'],['history','전투 기록'],['tiers','티어·보상']].map(([id,text])=>button(id,text,{disabled:!s&&!['home','tiers'].includes(id),extra:`aria-current="${tab===id?'page':'false'}"`})).join('')}</nav>
 <p class="rd-message" data-duo-message role="status"></p><div data-duo-content>${tab==='home'?randomDuoHome(state,userId,pending):'<p class="rd-loading" role="status">기록을 불러오고 있습니다.</p>'}</div></section>`;
}
function slot(member,role,{self=false,enemy=false}={}){
 return `<article class="rd-slot rd-skin ${enemy?'rd-enemy':''}"><small>${role}</small>${badge(self?'gold':enemy?'bronze':'silver','',86)}<h3>${esc(member?.nickname||(self?'나':'랜덤 파트너'))}</h3><p>${member?(self?'매칭 요청자 · 내 점수 반영':'저장된 덱으로 비동기 출전'):'매칭할 때마다 새로 추첨'}</p><span class="rd-slot-note">${member?'일반 카드 5장 · 장착 용병':'동시 접속 없이 함께 출전'}</span></article>`;
}
export function randomDuoHome(state,userId,pending){
 const s=state?.season,p=state?.player,e=state?.energy,open=isOpenDuo(s),now=Date.parse(state?.serverNow),active=s?.status==='ACTIVE'&&Date.parse(s.startsAt)<=now&&now<Date.parse(s.endsAt),recruiting=!open&&s?.status==='RECRUITING'&&now<Date.parse(s.recruitUntil),canJoin=!open&&!state?.joined&&(active||recruiting),low=e&&Number(e.current)<Number(e.cost),canMatch=active&&(open||state?.joined);
 const action=pending?button('recover','진행 중인 경기 이어보기',{primary:true}):canJoin?button('join','시즌 참가하기',{primary:true}):canMatch?button('match',low?'행동력 충전 대기':'랭크 듀오 시작',{primary:true,disabled:low}):button('match',state?.joined?'대전 시작을 기다리는 중':'시즌 재개 준비 중',{disabled:true});
 return `<div class="rd-season-line"><p>${esc(s?.name||'랜덤 듀오 개편 준비')}</p><span>${s?open?`상시 매칭 · 랭크전 저장 덱 ${fmt(state.poolCount)}명 · 시즌 정산 ${date(s.endsAt)}`:`참가 ${fmt(state.participants)}명 · ${recruiting?'모집 마감':'전투 종료'} ${date(recruiting?s.recruitUntil:s.endsAt)}`:'운영 재개 시 바로 매칭할 수 있습니다.'}</span></div>
 <div class="rd-layout"><section class="rd-panel rd-team"><header><div><p class="rd-kicker">A NEW PARTNER. EVERY MATCH.</p><h2>이번 승부의 동료는?</h2></div><span class="rd-format">2 <small>VS</small> 2</span></header>
 <div class="rd-pair">${slot(p||{userId,nickname:'나'},'PLAYER 01',{self:true})}${slot(null,'PLAYER 02')}</div><p class="rd-team-caption">매칭할 때 파트너 1명과 상대 2명을 뽑습니다.<br><strong>네 사람의 저장된 덱이 한 전장에서 맞붙습니다.</strong></p>
 <div class="rd-personal"><div>${badge(p?.tier?.id||'bronze',p?.tier?.name||'개인 티어',64)}<span>내 시즌 점수<strong>${p?fmt(p.score):'—'} <small>PT</small></strong></span></div><p>${p?`${fmt(p.wins)}승 · ${fmt(p.losses)}패`:'참가 후 개인 기록 시작'}<small>${p?.rank?`현재 ${fmt(p.rank)}위`:p&&p.wins+p.losses?'개인 점수 기준':'내가 시작한 첫 경기부터 랭킹 반영'}</small></p></div></section>
 <aside class="rd-panel rd-control"><p class="rd-kicker">READY WHEN YOU ARE</p><h2>혼자 눌러도, 듀오</h2><p class="rd-control-copy">파트너의 접속을 기다리지 않고<br>바로 비동기 전투를 시작합니다.</p><div class="rd-energy"><span>내 행동력</span><strong>${e?fmt(e.current):'—'}<small> / ${fmt(e?.maximum||s?.energy?.maximum)} AP</small></strong></div><progress max="${e?.maximum||1}" value="${e?.current||0}" aria-label="내 듀오 행동력"></progress><p class="rd-energy-copy">${e?`한 경기 ${fmt(e.cost)} AP${e.nextResetAt?' · 다음 충전 '+date(e.nextResetAt):' · 충전 완료'}`:'시즌 행동력은 운영 설정에 따릅니다.'}</p>
 <div class="rd-actions">${action}${button('deck','공격·방어 덱 확인')}${recruiting&&state?.joined?button('cancel','참가 신청 취소'):''}</div><p class="rd-important">점수·행동력·승리 보상은<br><strong>매칭을 시작한 나에게만 적용</strong></p>${s?.rewards?`<p class="rd-win-reward">공격 승리 <strong>${fmt(s.rewards.winCoin)} 코인</strong></p>`:''}</aside></div>
 <details class="rd-guide rd-panel"><summary>랜덤 듀오는 이렇게 진행됩니다 <span>+</span></summary><div class="rd-rule-grid"><section><span>01</span><h3>매 경기 새 편성</h3><p>${open?'참가 신청 없이 랭크전 공격·방어 덱을 저장한 전체 이용자 중 동료 1명과 상대 2명을 뽑습니다.':'시즌 참가자 중 서로 다른 네 명으로 구성합니다. 홀수 인원도 참가합니다.'} 같은 파트너가 다시 뽑힐 수 있습니다.</p></section><section><span>02</span><h3>최신 덱으로 비동기 교전</h3><p>우리 팀은 선택한 공격 덱, 상대 팀은 방어 프리셋 1을 사용합니다. 각자의 카드·장비·용병이 반영됩니다.${COMPANION_RELEASE.dualMercenaries?' 참가자마다 PVP 용병 2명을 편성해야 합니다. SSS·SS는 각각 1명까지이며 리미티드도 포함합니다.':''}</p></section><section><span>03</span><h3>내 도전만 내 점수로</h3><p>다른 사람의 매칭에 파트너나 상대로 참여하면 점수·행동력·보상은 변하지 않습니다. 시즌 순위는 내 경기 결과로 정합니다.</p></section></div><p class="rd-guide-foot">${open?'모집 대기 없이 언제든 매칭합니다. 개인 기록은 7일마다 정산하며 다음 시즌도 즉시 시작합니다.':'24시간 모집 · 7일 전투. 대전 기간에도 참가할 수 있습니다.'} 내가 시작해 완료한 경기가 있어야 개인 랭킹·시즌 정산 대상에 포함됩니다.</p></details>`;
}
export function randomDuoRanking(data,userId){
 const rows=data.ranking||[];
 return `<section class="rd-panel rd-records"><header><div><p class="rd-kicker">PERSONAL LEADERBOARD</p><h2>내 승부로 오르는 순위</h2></div><p>개인 상위 100명 · 챌린저 10명</p></header>${rows.length?`<ol class="rd-ranking">${rows.map(p=>`<li class="rd-skin ${Number(p.userId)===Number(userId)?'rd-self':''}"><b>${fmt(p.rank)}<small>위</small></b>${badge(p.tier.id,p.tier.name,54)}<div><strong>${esc(p.nickname)}${Number(p.userId)===Number(userId)?' · 나':''}</strong><span>${fmt(p.wins)}승 · ${fmt(p.losses)}패</span></div><strong>${fmt(p.score)} <small>PT</small></strong></li>`).join('')}</ol>`:'<div class="rd-empty"><h3>첫 도전을 기다립니다</h3><p>내가 시작한 경기를 완료하면 개인 랭킹에 기록됩니다.</p></div>'}</section>`;
}
export function randomDuoHistoryView(data){
 return `<section class="rd-panel rd-records"><header><div><p class="rd-kicker">MATCH HISTORY</p><h2>함께한 전투 기록</h2></div><p>최근 30경기 · 점수 반영 구분</p></header>${data.history?.length?`<div class="rd-history">${data.history.map(h=>{const done=h.status==='COMPLETED',win=h.winner===h.side;return `<article class="rd-skin"><div><strong class="${win?'rd-win':'rd-loss'}">${done?win?'승리':'패배':h.status==='CANCELLED'?'취소':'처리 중'}</strong><span>${date(h.created_at)}</span></div><p>${h.scoreApplied?'내가 시작한 경기':'다른 사람의 매칭에 참여'}<small>${h.scoreApplied&&done?'내 점수 '+fmt(h.attacker_score_after)+' PT':'내 점수·행동력 변동 없음'}</small></p>${button('replay','전투 보기',{disabled:!done,extra:`data-match="${esc(h.id)}"`})}</article>`;}).join('')}</div>`:'<div class="rd-empty"><h3>아직 기록된 전투가 없습니다</h3><p>매칭한 네 사람은 이곳에서 같은 전투를 다시 볼 수 있습니다.</p></div>'}</section>`;
}
export function randomDuoTiers(state){
 const s=state?.season||duoTiers(),tiers=[...s.tiers,s.challenger];
 return `<section class="rd-panel rd-honors"><div class="rd-trophy"><img src="${art}challenger-trophy-v2.webp" width="220" height="220" alt="듀오 챌린저 트로피"><div><p class="rd-kicker">YOUR MATCHES. YOUR LEGACY.</p><h2>동료는 바뀌어도,<br>기록은 나에게</h2><p>최종 개인 상위 10명에게 듀오 챌린저 트로피를 기록합니다.<br>내가 시작해 완료한 경기의 개인 점수로 정산합니다.</p></div></div><div class="rd-tier-grid">${tiers.map(t=>`<article class="rd-skin">${badge(t.id,t.name,96)}<h3>${esc(t.name)}</h3><p>${t.id==='challenger'?'개인 최종 상위 10명':fmt(t.min)+' PT 이상'}</p>${s.rewards?`<strong>${s.rewards.tierEnabled?fmt(t.rewardCoin)+' 코인':'티어 보상 중지'}</strong>${s.rewards.tierEnabled&&t.rewardShards?`<small>카드조각 ${fmt(t.rewardShards)}개</small>`:''}`:'<small>시즌 시작 시 보상 안내</small>'}</article>`).join('')}</div><div data-duo-reward-history></div></section>`;
}
export function randomDuoMatch(data,userId){
 return `<section class="rd-panel rd-match"><header><p class="rd-kicker">YOUR DUO FOR THIS MATCH</p><h2>이번 경기의 편성이 정해졌습니다</h2><p>매칭을 시작한 나의 점수와 행동력만 반영됩니다.</p></header><div class="rd-versus"><section><h3>우리 팀</h3><div class="rd-pair">${data.team.members.map((m,i)=>slot(m,i?'이번 경기 파트너':'매칭 요청자',{self:Number(m.userId)===Number(userId)})).join('')}</div></section><strong class="rd-vs">VS</strong><section><h3>상대 팀</h3><div class="rd-pair">${data.opponent.members.map(m=>slot(m,'이번 경기 상대',{enemy:true})).join('')}</div></section></div><p class="rd-match-enter" role="status">네 사람의 덱을 불러와 전투에 입장합니다.</p></section>`;
}
