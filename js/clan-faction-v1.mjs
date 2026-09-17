import {DISTRICTS,SQUADS,FACTION_RULES as R,districtById} from '../shared/clan-faction-rules-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Math.max(0,Number(n)||0).toLocaleString('ko-KR');
const compact=n=>n>=1e8?(n/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억':n>=1e4?(n/1e4).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만':num(n);
const symbols={map:'M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',sword:'m4 3 12 12m-3 3 5-5m-2 3 5 5M3 3l1 5 4-4-5-1Z',shield:'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3Zm-4 9 3 3 5-6',coin:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM14 8h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-9v10',clock:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5v5l3 2',users:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-4a4 4 0 0 1 0 8',alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',arrow:'M4 12h16m-6-6 6 6-6 6'};
const icon=(id,cls='')=>`<svg class="fw-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[id]||symbols.map}"/></svg>`;
const state={data:null,map:null,tab:'map',selected:'11680',squad:'attack1',edit:null,busy:false,error:'',ctx:null,root:null,offset:0,timer:null,alertTimer:null,alertBusy:false,notice:'',zoom:1,sequence:0};
const now=()=>Date.now()+state.offset;
const left=until=>{const seconds=Math.max(0,Math.ceil((until-now())/1000));return seconds>=3600?`${Math.floor(seconds/3600)}시간 ${Math.floor(seconds%3600/60)}분`:seconds>=60?`${Math.floor(seconds/60)}분 ${seconds%60}초`:`${seconds}초`;};
const clock=until=>`<span data-fw-until="${until}">${left(until)}</span>`;
const team=id=>state.data?.clans.find(c=>c.clanId===id);
const mark=id=>{const t=team(id);return t?`<img class="fw-mark" src="/assets/ui/clan/marks/${esc(t.markKey.toLowerCase())}-clan-mark-v1.webp" alt="${esc(t.name)}">`:`<span class="fw-neutral">—</span>`;};
const api=(path,body)=>state.ctx.apiRequest(`clan/faction/${path}`,body?{method:'POST',body:JSON.stringify(body)}:{},{ttl:0,timeoutMs:30000});
const mine=()=>state.data?.mine?.clanId;
const battleAt=id=>state.data?.battles.find(b=>b.districtId===id&&b.status==='ACTIVE');
function status(d){return battleAt(d.id)?'교전 중':d.protectedUntil>now()?'점령 보호':d.owner===mine()?'우리 지역':d.owner?'공격 가능':'무주지';}
function hp(label,value,side){return `<div class="fw-hp ${side}"><div><span>${label}</span><b>${num(value)} <small>/ ${compact(R.sharedHp)}</small></b></div><progress max="${R.sharedHp}" value="${value}" aria-label="${esc(label.replace(/<[^>]+>/g,''))} 공유 HP"></progress></div>`;}
function mapView(){
  const d=state.data,svg=state.map;
  return `<section class="fw-map-panel" aria-label="서울 세력전 지도"><header><div><span class="fw-eyebrow">SEOUL / TERRITORY CONTROL</span><h3>서울 전황도 <small>25개 자치구</small></h3></div><div class="fw-map-controls"><button data-fw-zoom="-" aria-label="지도 축소">−</button><button data-fw-zoom="0" aria-label="지도 맞춤">전체</button><button data-fw-zoom="+" aria-label="지도 확대">+</button></div></header>
    <div class="fw-map-scroll"><svg class="fw-seoul-map" viewBox="${svg.viewBox}" style="width:${state.zoom*100}%" role="group" aria-label="자치구를 선택하세요"><defs><pattern id="fw-conflict" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3" height="10" fill="#ff7860" opacity=".2"/></pattern><radialGradient id="fw-map-light"><stop stop-color="#243955" stop-opacity=".6"/><stop offset="1" stop-color="#0b1220" stop-opacity="0"/></radialGradient></defs><rect width="900" height="710" fill="url(#fw-map-light)"/>
    ${svg.features.map(f=>{const zone=d.districts.find(z=>z.id===f.id),selected=zone.id===state.selected,battle=battleAt(zone.id),own=zone.owner===mine(),color=own?'#c8ff6b':team(zone.owner)?.color||'#52657e';return `<g class="fw-zone ${selected?'selected':''} ${battle?'contested':''} ${own?'owned':''}" data-fw-zone="${f.id}" role="button" tabindex="0" aria-label="${f.name} · ${esc(team(zone.owner)?.name||'무주지')} · ${status(zone)}" aria-pressed="${selected}" style="--zone:${esc(color)}"><path d="${f.path}"/><path class="fw-zone-hatch" d="${f.path}" fill="${battle?'url(#fw-conflict)':'none'}"/><text x="${f.x}" y="${f.y-2}">${f.name.length===2?f.name:f.name.replace(/구$/,'')}<tspan x="${f.x}" dy="20">${battle?'⚔ 교전':zone.protectedUntil>now()?'보호 · ':''}${battle?'':esc(team(zone.owner)?.name||'무주지')}</tspan></text>${selected?`<circle class="fw-selection-pin" cx="${f.x}" cy="${f.y-33}" r="5"/>`:''}</g>`;}).join('')}
    <g class="fw-compass" transform="translate(825 40)"><text x="0" y="0">N</text><path d="M0 12V45m-6-24 6-9 6 9"/></g></svg></div>
    <div class="fw-map-key"><span><i class="ours"></i>우리 지역</span><span><i class="others"></i>다른 클랜</span><span><i class="conflict"></i>교전 중</span><span><i></i>무주지</span></div>
    <footer><span>구역을 선택해 상권과 부대 확인</span><a href="https://github.com/southkorea/seoul-maps" target="_blank" rel="noreferrer">지도: Seoul Maps · Apache 2.0</a></footer></section>`;
}
function detailView(){
  const data=state.data,z=data.districts.find(d=>d.id===state.selected)||data.districts[0],meta=districtById(z.id),b=battleAt(z.id),own=z.owner===mine(),protectedNow=z.protectedUntil>now();
  const canStrike=b&&((b.attacker===mine()&&b.attackers.includes(data.userId))||(b.defender===mine()&&b.defenders.includes(data.userId)));
  const squad=state.squad,cooldown=Math.max(data.squadReady[squad]||0,data.targetReady[z.id]||0);
  const squadBusy=data.battles.some(b=>b.status==='ACTIVE'&&b.attacker===mine()&&b.squad===squad);
  const permitted=data.mine?.isMaster||data.formation[squad]?.includes(data.userId);
  const launchable=data.season.active&&mine()&&!own&&!b&&!protectedNow&&cooldown<=now()&&!squadBusy&&permitted&&data.formation[squad]?.length;
  return `<aside class="fw-detail" aria-label="선택한 지역 작전"><div class="fw-detail-top"><span class="fw-eyebrow">DISTRICT ${String(DISTRICTS.findIndex(d=>d.id===z.id)+1).padStart(2,'0')} / SEOUL</span><span class="fw-status ${b?'danger':own?'lime':''}">${status(z)}</span></div><h2>${meta.name}</h2><p class="fw-market">${meta.market} 상권</p>
    <div class="fw-owner">${mark(z.owner)}<div><small>현재 점령 클랜</small><strong>${esc(team(z.owner)?.name||'점령 클랜 없음')}</strong></div></div>
    <div class="fw-local-income">${icon('coin')}<span>상권 징수세 <small>점령 클랜 공동 수익</small></span><strong>${compact(R.taxPerHour)}<small> / 시간</small></strong></div>
    ${b?`<section class="fw-conflict-detail"><div class="fw-section-title"><h3>공유 HP 교전</h3><em>${clock(b.endsAt)} 남음</em></div>${hp(`${esc(team(b.attacker)?.name)} 공격대`,b.attackerHp,'attack')}${hp(`${esc(team(b.defender)?.name)} 방어대`,b.defenderHp,'defense')}<p>상대 공유 HP가 먼저 0이 되면 승리</p><button class="fw-primary" data-fw-strike="${b.id}" ${!canStrike||data.strikeReady>now()||!data.season.active?'disabled':''}>${icon('sword')}${!canStrike?'교전 부대원만 참여 가능':data.strikeReady>now()?`다음 교전 ${clock(data.strikeReady)}`:b.defender===mine()?'방어대 교전 참여':'공격대 교전 참여'}</button><small>최신 랭크전 덱으로 교전 · 개인 재교전 1분</small></section>`:
    `<section class="fw-defense-info"><div class="fw-section-title"><h3>${icon('shield')}주둔 방어대</h3><b>${z.defenders.length}명</b></div><div class="fw-defenders">${z.defenders.map((m,i)=>`<span><i>${String(i+1).padStart(2,'0')}</i>${esc(m.nickname)}</span>`).join('')||'<p>배치된 방어대가 없습니다.</p>'}</div>${own&&data.mine.isMaster?`<div class="fw-garrison"><select id="fw-defense-select" aria-label="주둔 방어대 선택">${SQUADS.filter(s=>s.role==='DEFENSE').map(s=>`<option value="${s.id}" ${z.defense===s.id?'selected':''}>${s.name} · ${data.formation[s.id]?.length||0}명</option>`).join('')}</select><button data-fw-garrison ${!data.season.active?'disabled':''}>배치</button></div>`:''}</section>
    ${own?`<div class="fw-protection">${icon('shield')}<div><strong>${protectedNow?'점령 보호 중':'우리 클랜의 상권'}</strong><span>${protectedNow?clock(z.protectedUntil)+' 뒤 공격 가능':'방어대를 배치해 상권을 지키세요.'}</span></div></div>`:
    `<section class="fw-dispatch"><div class="fw-section-title"><h3>출정할 공격대</h3><button class="fw-text-btn" data-fw-tab="formation">편성 관리 ↗</button></div><div class="fw-squad-options">${SQUADS.filter(s=>s.role==='ATTACK').map(s=>`<button data-fw-squad="${s.id}" class="${squad===s.id?'active':''}"><b>${s.name}</b><span>${data.formation[s.id]?.length||0} / 5명</span></button>`).join('')}</div>
    <div class="fw-launch-note">${protectedNow?`${icon('shield')}점령 보호 · ${clock(z.protectedUntil)} 남음`:cooldown>now()?`${icon('clock')}재공격까지 ${clock(cooldown)}`:squadBusy?'선택한 공격대가 다른 지역에서 교전 중입니다.':!data.formation[squad]?.length?'클랜장이 공격대를 편성하면 출정할 수 있습니다.':!z.defenders.length?'방어대가 없는 지역은 출정 즉시 점령합니다.':'출정하면 상대 방어대에 침공 알림이 전송됩니다.'}</div>
    <button class="fw-primary" data-fw-launch ${launchable?'':'disabled'}>${icon('sword')}${protectedNow?'점령 보호 중':!z.owner?'무주지 점령':`${meta.name} 공격 시작`}${icon('arrow')}</button></section>`}`}
    <footer class="fw-detail-rules"><span>${icon('shield')}점령 보호 <b>2시간</b></span><span>${icon('clock')}공격대 재출정 <b>10분</b></span><span>${icon('clock')}같은 지역 재공격 <b>30분</b></span></footer></aside>`;
}
function formationView(){
  const d=state.data,edit=state.edit||d.formation,assigned=new Set(Object.values(edit).flat());
  return `<section class="fw-formation"><header class="fw-page-heading"><div><span class="fw-eyebrow">SQUAD COMMAND</span><h2>공격대 · 방어대 편성</h2><p>부대당 최대 5명 · 한 사람은 한 부대에 배치됩니다.</p></div><button class="fw-primary" data-fw-save ${!d.mine?.isMaster||!d.season.active?'disabled':''}>${icon('users')}편성 저장</button></header>
    <div class="fw-formation-layout"><div class="fw-squads">${SQUADS.map(s=>`<section class="fw-squad-card ${s.role.toLowerCase()}"><header>${icon(s.role==='ATTACK'?'sword':'shield')}<div><small>${s.role==='ATTACK'?'ASSAULT':'DEFENSE'}</small><h3>${s.name}</h3></div><b>${edit[s.id]?.length||0}<small> / 5</small></b></header>${Array.from({length:5},(_,i)=>{const member=d.roster.find(m=>m.userId===edit[s.id]?.[i]);return `<div class="fw-member-slot ${member?'filled':''}"><i>${i+1}</i><span>${member?esc(member.nickname):'빈 슬롯'}</span>${member&&d.mine?.isMaster?`<button data-fw-remove="${member.userId}" aria-label="${esc(member.nickname)} 편성 해제">×</button>`:''}</div>`;}).join('')}</section>`).join('')}</div>
    <aside class="fw-roster-pool"><div class="fw-section-title"><h3>클랜원 배치</h3><b>${d.roster.length-assigned.size}명 대기</b></div><label>배치할 부대<select id="fw-assign-squad">${SQUADS.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></label><div>${d.roster.map(m=>`<button data-fw-add="${m.userId}" ${assigned.has(m.userId)||!d.mine?.isMaster?'disabled':''}><span>${esc(m.nickname)}<small>${SQUADS.find(s=>edit[s.id]?.includes(m.userId))?.name||'배치 대기'}</small></span><b>${assigned.has(m.userId)?'배치됨':'+'}</b></button>`).join('')||'<p>시즌 소속 클랜원이 없습니다.</p>'}</div></aside></div>
    <p class="fw-explanation">공격대는 한 번에 한 지역에 출정합니다. 방어대는 점령한 지역에 주둔시킬 수 있습니다. 교전 중에는 편성을 변경할 수 없습니다.</p></section>`;
}
function treasuryView(){
  const d=state.data,owned=d.districts.filter(z=>z.owner===mine()&&mine()),n=d.roster.length;
  return `<section class="fw-treasury"><header class="fw-page-heading"><div><span class="fw-eyebrow">CLAN REVENUE</span><h2>상권 징수세</h2><p>점령한 지역의 수익을 클랜원과 함께 나눕니다.</p></div></header><div class="fw-treasury-layout"><section class="fw-vault">${icon('coin')}<span class="fw-eyebrow">분배 대기 중인 징수코인</span><strong>${num(d.tax.pool)}</strong><div class="fw-vault-summary"><span>점령 수익 <b>${compact(owned.length*R.taxPerHour)} / 시간</b></span><span>분배 대상 <b>${n}명</b></span><span>1인당 예상 <b>${compact(Math.floor(d.tax.pool/Math.max(1,n)))} 징수코인</b></span></div><button class="fw-primary" data-fw-collect ${!mine()||d.tax.pool<=0?'disabled':''}>${icon('coin')}클랜원에게 균등 분배</button><p>누구나 정산할 수 있으며, 현재 클랜원 전원에게 함께 지급됩니다.</p><div class="fw-my-wallet"><span>내 징수코인</span><b>${num(d.tax.balance)}</b></div></section><section class="fw-revenue-list"><div class="fw-section-title"><h3>우리 클랜 상권</h3><b>${owned.length}개 지역</b></div>${owned.map(z=>`<button data-fw-pick="${z.id}"><span>${icon('map')}<strong>${districtById(z.id).name}<small>${districtById(z.id).market}</small></strong></span><b>+${compact(R.taxPerHour)}<small>시간당</small></b></button>`).join('')||'<div class="fw-empty">아직 점령한 상권이 없습니다.<br>지도에서 공격대를 출정시켜 보세요.</div>'}</section></div>${(d.tax.pendingSeasons||[]).map(p=>`<div class="fw-past-tax"><span>시즌 ${p.seasonNo} 미정산 징수세 <b>${compact(p.pool)} 코인</b></span><button data-fw-past-collect="${p.seasonId}">당시 클랜원에게 분배</button></div>`).join('')}<p class="fw-explanation">징수코인은 일반 코인과 별도로 보관됩니다. 정규 클랜전 순위에 영향을 주지 않습니다. 시즌이 끝나면 새 수익 적립은 멈추고, 적립된 수익은 정산할 수 있습니다.</p></section>`;
}
function logView(){return `<section class="fw-log"><header class="fw-page-heading"><div><span class="fw-eyebrow">OPERATION HISTORY</span><h2>전황 기록</h2></div></header>${state.data.events.map(e=>`<article><span class="fw-log-icon">${icon(e.kind==='TAX'?'coin':e.kind==='FORMATION'?'users':e.kind==='DEFENDED'?'shield':'sword')}</span><div><b>${esc(team(e.clanId)?.name||'클랜')} · ${{CAPTURE:'상권 점령',INVASION:'침공 시작',DEFENDED:'방어 성공',FORMATION:'부대 편성',TAX:'징수세 분배'}[e.kind]||'작전'}</b><p>${e.districtId?districtById(e.districtId)?.name+' · ':''}${e.kind==='TAX'?`${num(e.amount)} 징수코인 · ${e.members}명 분배`:e.by?esc(e.by)+' 출정':''}</p></div><time>${new Date(e.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></article>`).join('')||'<p class="fw-empty">아직 기록된 작전이 없습니다.</p>'}</section>`;}
function draw(){
  if(!state.root?.isConnected)return;
  if(!state.data||!state.map){state.root.innerHTML=`<div class="fw-loading">${state.error?esc(state.error):'서울 전황을 불러오는 중입니다.'}<button data-fw-reload>다시 불러오기</button></div>`;bind();return;}
  const d=state.data,active=d.battles.filter(b=>b.status==='ACTIVE');
  state.root.innerHTML=`<section class="faction-war"><header class="fw-heading"><div><span class="fw-eyebrow">CLAN FACTION WAR</span><h2>세력전 <span>서울</span></h2><p>상권을 점령하고, 우리 클랜의 영역을 넓히세요.</p></div><span class="fw-season ${d.season.active?'active':''}"><i></i>${d.season.active?'시즌 진행 중':'시즌 대기 · 종료'}<small>정규 순위와 별도 운영</small></span></header>
    <div class="fw-stats"><div>${icon('map')}<span>우리 상권<b>${d.holdings}<small> / 25</small></b></span></div><div>${icon('sword')}<span>진행 중 교전<b>${active.length}<small>곳</small></b></span></div><div>${icon('coin')}<span>시간당 징수세<b>${compact(d.holdings*R.taxPerHour)}<small>징수코인</small></b></span></div><div>${icon('coin')}<span>내 징수코인<b>${compact(d.tax.balance)}</b></span></div></div>
    <nav class="fw-tabs" aria-label="세력전 메뉴">${[['map','map','전황 지도'],['formation','users','부대 편성'],['treasury','coin','징수세'],['log','clock','전황 기록']].map(([id,i,label])=>`<button data-fw-tab="${id}" class="${state.tab===id?'active':''}" aria-current="${state.tab===id?'page':'false'}">${icon(i)}${label}</button>`).join('')}<button class="fw-reload" data-fw-reload aria-label="전황 새로고침">↻</button></nav>
    ${state.notice?`<div class="fw-notice" role="status">${esc(state.notice)}</div>`:''}${state.error?`<div class="fw-error" role="alert">${esc(state.error)}<button data-fw-reload>다시 확인</button></div>`:''}
    ${state.tab==='map'?`<div class="fw-mobile-select"><label>지역 선택<select data-fw-district-select>${DISTRICTS.map(z=>`<option value="${z.id}" ${z.id===state.selected?'selected':''}>${z.name} · ${team(d.districts.find(t=>t.id===z.id)?.owner)?.name||'무주지'}</option>`).join('')}</select></label></div><div class="fw-battlefield">${mapView()}${detailView()}</div>`:state.tab==='formation'?formationView():state.tab==='treasury'?treasuryView():logView()}</section>`;
  bind();state.root.querySelectorAll('button').forEach(b=>{if(state.busy)b.disabled=true;});
}
function selectDistrict(id,scroll=false){state.selected=id;state.tab='map';draw();if(scroll&&innerWidth<1000)state.root.querySelector('.fw-detail')?.scrollIntoView({behavior:'smooth',block:'start'});}
function bind(){
  const root=state.root;if(!root)return;
  root.querySelectorAll('[data-fw-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.fwTab;state.notice='';draw();});
  root.querySelectorAll('[data-fw-zone],[data-fw-pick]').forEach(b=>{b.onclick=()=>selectDistrict(b.dataset.fwZone||b.dataset.fwPick,true);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.onclick();}};});
  root.querySelector('[data-fw-district-select]')?.addEventListener('change',e=>selectDistrict(e.target.value,true));
  root.querySelectorAll('[data-fw-zoom]').forEach(b=>b.onclick=()=>{state.zoom=b.dataset.fwZoom==='0'?1:Math.max(1,Math.min(2.5,state.zoom+(b.dataset.fwZoom==='+'?.5:-.5)));draw();});
  root.querySelectorAll('[data-fw-reload]').forEach(b=>b.onclick=()=>refresh());
  root.querySelectorAll('[data-fw-squad]').forEach(b=>b.onclick=()=>{state.squad=b.dataset.fwSquad;draw();});
  root.querySelector('[data-fw-launch]')?.addEventListener('click',()=>action('launch',{districtId:state.selected,squad:state.squad}));
  root.querySelector('[data-fw-garrison]')?.addEventListener('click',()=>action('garrison',{districtId:state.selected,squad:root.querySelector('#fw-defense-select').value}));
  root.querySelector('[data-fw-save]')?.addEventListener('click',()=>action('formation',{formation:state.edit||state.data.formation}));
  root.querySelector('[data-fw-collect]')?.addEventListener('click',()=>action('collect',{seasonId:state.data.season.id}));
  root.querySelectorAll('[data-fw-past-collect]').forEach(b=>b.onclick=()=>action('collect',{seasonId:Number(b.dataset.fwPastCollect)}));
  root.querySelector('[data-fw-strike]')?.addEventListener('click',e=>action('strike',{battleId:e.currentTarget.dataset.fwStrike}));
  root.querySelectorAll('[data-fw-add]').forEach(b=>b.onclick=()=>{const squad=root.querySelector('#fw-assign-squad').value;state.edit||=structuredClone(state.data.formation);if(state.edit[squad].length>=5){state.notice='부대당 최대 5명까지 편성할 수 있습니다.';draw();return;}state.edit[squad].push(Number(b.dataset.fwAdd));draw();root.querySelector('#fw-assign-squad').value=squad;});
  root.querySelectorAll('[data-fw-remove]').forEach(b=>b.onclick=()=>{state.edit||=structuredClone(state.data.formation);for(const id of Object.keys(state.edit))state.edit[id]=state.edit[id].filter(v=>v!==Number(b.dataset.fwRemove));draw();});
}
async function refresh(preserveError=false){
  if(!state.ctx||state.busy)return;
  const sequence=++state.sequence;
  try{const [data,map]=await Promise.all([api('overview'),state.map||fetch('/assets/ui/clan/seoul/districts-v1.json').then(r=>{if(!r.ok)throw Error('지도를 불러오지 못했습니다.');return r.json();})]);if(sequence!==state.sequence)return;state.data=data;state.map=map;state.offset=data.serverNow-Date.now();if(!preserveError)state.error='';draw();}
  catch(e){if(sequence!==state.sequence)return;state.error=e.message;draw();}
}
function pending(kind,payload){
  const scope=`faction:${state.data.userId}:${state.data.season.id}:${kind}:${JSON.stringify(payload)}`;
  let id;try{id=sessionStorage.getItem(scope);}catch{}
  if(!id){id=crypto.randomUUID();try{sessionStorage.setItem(scope,id);}catch{}}
  return {scope,id};
}
async function action(kind,payload){
  if(state.busy)return;state.sequence++;state.busy=true;state.error='';state.notice='작전을 진행하고 있습니다.';draw();
  const key=pending(kind,payload);
  try{
    if(kind==='strike'){
      await state.ctx.ensureFeatureResources?.('battleV2');
      if(!state.ctx.playFactionBattle&&!window.ProjectVBattleV3Live?.ready?.())throw Error('전투 화면을 준비하지 못했습니다. 다시 시도해 주세요.');
    }
    const result=await api(kind,{...payload,requestId:key.id});
    try{sessionStorage.removeItem(key.scope);}catch{}
    state.edit=null;
    state.notice=kind==='formation'?'부대 편성을 저장했습니다.':kind==='garrison'?'방어대를 배치했습니다.':kind==='collect'?`${result.members}명에게 총 ${num(result.total)} 징수코인을 분배했습니다. 내 몫 ${num(result.myAmount)}코인`:kind==='strike'?`상대 공유 HP −${num(result.damage)}${result.battleCompleted?' · 교전 종료':''}`:result.captured?'상권을 점령했습니다. 2시간 점령 보호가 시작됩니다.':'공격대가 출정했습니다. 상대 방어대에 침공을 알립니다.';
    if(kind==='strike'&&result.battleV2&&!result.replayed)await playBattle(result);
  }catch(e){state.error=e.message||'요청을 처리하지 못했습니다. 다시 누르면 같은 요청으로 확인합니다.';}
  finally{state.busy=false;await refresh(true);draw();}
}
async function playBattle(data){
  if(state.ctx.playFactionBattle)return state.ctx.playFactionBattle(data);
  const modal=document.getElementById('modal');if(!modal||!window.playPvpBattleV2Live)return;
  const close=()=>{modal.__battleV2Renderer?.destroy?.();modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';};
  try{
    const live=window.prepareBattleV2LiveLoading({modal,mode:'PVP',playerName:data.player.nickname,opponentName:data.opponent.nickname});
    live.stage.querySelector('.battle-v3-header strong').textContent=`세력전 · ${districtById(data.districtId||state.selected)?.name||'상권 교전'}`;
    state.ctx.ensureBattleSoundButton?.(live.stage);await window.playPvpBattleV2Live({...live,modal,data});
    live.phase.textContent='세력전 교전 완료';
    live.msg.innerHTML=`<div class="fw-combat-result"><span class="fw-eyebrow">FACTION WAR</span><h2>상대 공유 HP <em>−${num(data.damage)}</em></h2><p>${data.battleCompleted?'공유 HP 승부가 결정됐습니다.':'부대의 교전은 계속됩니다.'}</p><button class="fw-primary" data-fw-battle-close>서울 전황으로 복귀</button></div>`;live.msg.classList.add('is-visible');
    await new Promise(resolve=>{modal.querySelector('[data-fw-battle-close]').onclick=()=>{close();resolve();};});
  }catch(e){close();throw new Error('공유 HP는 반영됐습니다. 전투 연출을 불러오지 못해 전황으로 복귀합니다.');}
}
export function mount(root,ctx){state.root=root;connect(ctx);draw();void refresh();}
export function view(){return '<div id="clanFactionRoot" class="fw-root"></div>';}
export function select(id){state.selected=id;state.tab='map';}
export function connect(ctx){
  const userId=Number(ctx.userId||window.loadUser?.()?.serverUserId||window.loadUser?.()?.id||0);
  if(userId&&state.data&&state.data.userId!==userId){state.data=null;state.edit=null;state.error='';state.notice='';state.sequence++;}
  state.ctx=ctx;
  if(!state.timer)state.timer=setInterval(()=>{if(document.hidden)return;state.root?.querySelectorAll('[data-fw-until]').forEach(n=>n.textContent=left(Number(n.dataset.fwUntil)));},1000);
  if(!state.alertTimer){state.alertTimer=setInterval(()=>poll(),8000);void poll();}
}
async function poll(){
  if(document.hidden||state.alertBusy||state.busy||!state.ctx)return;state.alertBusy=true;
  try{
    if(state.root?.isConnected&&state.tab!=='formation')await refresh();
    const data=await api('alerts');
    for(const a of data.alerts||[]){
      const key=`faction-alert:${data.userId}:${data.seasonId}:${a.id}`;
      if(sessionStorage.getItem(key)||document.querySelector('.fw-invasion-alert')||document.querySelector('#modal.show'))continue;
      showAlert(a,()=>sessionStorage.setItem(key,'1'));break;
    }
  }catch{}finally{state.alertBusy=false;}
}
function showAlert(a,remember){
  const dialog=document.createElement('dialog');dialog.className='fw-invasion-alert';
  dialog.innerHTML=`<button class="fw-alert-close" aria-label="침공 알림 닫기">×</button><div class="fw-alert-symbol">${icon('alert')}</div><span class="fw-eyebrow">INCOMING ATTACK</span><h2>${esc(a.districtName)} 침공 경보</h2><p><b>${esc(a.attackerClan)}</b> 클랜의 <b>${esc(a.attackerName)}</b> 님이 공격해 왔습니다.</p><div class="fw-alert-order">방어대에 편성되어 있습니다.<br>전황에 진입해 상권을 지키세요.</div><button class="fw-primary" data-fw-defend>${icon('shield')}방어하러 가기</button><button class="fw-alert-later">확인 · 나중에 참여</button>`;
  document.body.append(dialog);const previous=document.activeElement;
  const close=()=>{remember();dialog.close();dialog.remove();previous?.focus?.();};
  dialog.querySelector('.fw-alert-close').onclick=close;dialog.querySelector('.fw-alert-later').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.querySelector('[data-fw-defend]').onclick=()=>{close();select(a.districtId);if(window.ClanV1)window.ClanV1.state.tab='faction';state.ctx.renderShell('clan');};
  dialog.showModal();
}
window.ClanFaction={mount,view,connect,select};
