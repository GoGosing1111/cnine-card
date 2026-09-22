import {DISTRICTS,SQUADS,FACTION_RULES as R,districtById} from '../shared/clan-faction-rules-v1.mjs?v=20260922-cooldowns';
import {factionCombatOpen,factionSessionStrip,factionRewardView} from './clan-faction-sessions-v1.mjs?v=20260922-sessions-live';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Math.max(0,Number(n)||0).toLocaleString('ko-KR');
const compact=n=>n>=1e8?(n/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억':n>=1e4?(n/1e4).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만':num(n);
const symbols={map:'M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',sword:'m4 3 12 12m-3 3 5-5m-2 3 5 5M3 3l1 5 4-4-5-1Z',shield:'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3Zm-4 9 3 3 5-6',coin:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM14 8h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-9v10',clock:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5v5l3 2',users:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-4a4 4 0 0 1 0 8',alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',arrow:'M4 12h16m-6-6 6 6-6 6'};
const icon=(id,cls='')=>`<svg class="fw-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[id]||symbols.map}"/></svg>`;
const crossedSwords='<path class="fw-clash-blade" d="M2 2 7 3 16 12 12 16 3 7Z"/><path class="fw-clash-blade" d="M22 2 17 3 8 12 12 16 21 7Z"/><path class="fw-clash-hilt" d="m11 17 6-6m-4 6-6-6m9 5 5 5m-13-5-5 5m16 1 3-3M2 19l3 3"/>';
function clashMarker(f){
  return `<g class="fw-clash-marker" data-fw-pick="${f.id}" role="button" tabindex="0" aria-label="${f.name} 교전 중 · 전투 정보 보기" transform="translate(${f.x} ${f.y+19})"><title>${f.name} 격돌 중</title><text class="fw-clash-label" x="0" y="-39">${f.name.length===2?f.name:f.name.replace(/구$/,'')}</text><g class="fw-clash-badge"><circle class="fw-clash-wave" r="25"/><circle class="fw-clash-disc" r="23"/><g class="fw-clash-swords" transform="translate(-18 -18) scale(1.5)">${crossedSwords}</g></g></g>`;
}
const state={data:null,map:null,tab:'map',selected:'11680',squad:'attack1',edit:null,editBase:null,editCaptains:null,busy:false,error:'',ctx:null,root:null,offset:0,timer:null,alertTimer:null,alertBusy:false,notice:'',zoom:1,sequence:0,room:null,roomId:'',playing:false};
const now=()=>Date.now()+state.offset;
const ruleMinutes=key=>`${num((state.data?.rules?.[key]??R[key])/60000)}분`;
const left=until=>{const seconds=Math.max(0,Math.ceil((until-now())/1000));return seconds>=3600?`${Math.floor(seconds/3600)}시간 ${Math.floor(seconds%3600/60)}분`:seconds>=60?`${Math.floor(seconds/60)}분 ${seconds%60}초`:`${seconds}초`;};
const clock=until=>`<span data-fw-until="${until}">${left(until)}</span>`;
const team=id=>state.data?.clans.find(c=>c.clanId===id);
const mark=id=>{const t=team(id);return t?`<img class="fw-mark" src="/assets/ui/clan/marks/${esc(t.markKey.toLowerCase())}-clan-mark-v1.webp" alt="${esc(t.name)}">`:`<span class="fw-neutral">—</span>`;};
const api=(path,body)=>state.ctx.apiRequest(`clan/faction/${path}`,body?{method:'POST',body:JSON.stringify(body)}:{},{ttl:0,timeoutMs:30000});
const mine=()=>state.data?.mine?.clanId;
const battleAt=id=>state.data?.battles.find(b=>b.districtId===id&&b.status==='ACTIVE');
const mySide=b=>b&&(b.attacker===mine()&&b.attackers.includes(state.data.userId)?'ATTACK':b.defender===mine()&&b.defenders.includes(state.data.userId)?'DEFENSE':'');
function myBattles(){
  const battles=state.data.battles.filter(b=>b.status==='ACTIVE'&&mySide(b));
  return battles.length?`<div class="fw-my-battles" aria-label="내가 참여할 전투">${battles.map(b=>`<button data-fw-enter="${b.id}">${icon(mySide(b)==='ATTACK'?'sword':'shield')}<span><b>${districtById(b.districtId).name} · ${mySide(b)==='ATTACK'?'공격대':'방어대'}</b><small>${b.entries?.[state.data.userId]?'참여 중 · 전투실 다시 열기':'편성된 전투 · 직접 입장해 참여하세요'}</small></span><strong>전투 입장 →</strong></button>`).join('')}</div>`:'';
}
function status(d){return battleAt(d.id)?'교전 중':d.protectedUntil>now()?'점령 보호':d.owner===mine()?'우리 지역':d.owner?'공격 가능':'무주지';}
function hp(label,value,side){return `<div class="fw-hp ${side}"><div><span>${label}</span><b>${num(value)} <small>/ ${compact(R.sharedHp)}</small></b></div><progress max="${R.sharedHp}" value="${value}" aria-label="${esc(label.replace(/<[^>]+>/g,''))} 공유 HP"></progress></div>`;}
function mapView(){
  const d=state.data,svg=state.map;
  return `<section class="fw-map-panel" aria-label="서울 세력전 지도"><header><div><span class="fw-eyebrow">SEOUL / TERRITORY CONTROL</span><h3>서울 전황도 <small>25개 자치구</small></h3></div><div class="fw-map-controls"><button data-fw-zoom="-" aria-label="지도 축소">−</button><button data-fw-zoom="0" aria-label="지도 맞춤">전체</button><button data-fw-zoom="+" aria-label="지도 확대">+</button></div></header>
    <div class="fw-map-scroll"><svg class="fw-seoul-map" viewBox="${svg.viewBox}" style="width:${state.zoom*100}%" role="group" aria-label="자치구를 선택하세요"><defs><pattern id="fw-conflict" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3" height="10" fill="#ff7860" opacity=".2"/></pattern><radialGradient id="fw-map-light"><stop stop-color="#243955" stop-opacity=".6"/><stop offset="1" stop-color="#0b1220" stop-opacity="0"/></radialGradient></defs><rect width="900" height="710" fill="url(#fw-map-light)"/>
    ${svg.features.map(f=>{const zone=d.districts.find(z=>z.id===f.id),selected=zone.id===state.selected,battle=battleAt(zone.id),own=zone.owner===mine(),color=own?'#c8ff6b':team(zone.owner)?.color||'#52657e';return `<g class="fw-zone ${selected?'selected':''} ${battle?'contested':''} ${own?'owned':''}" data-fw-zone="${f.id}" role="button" tabindex="0" aria-label="${f.name} · ${esc(team(zone.owner)?.name||'무주지')} · ${status(zone)}" aria-pressed="${selected}" style="--zone:${esc(color)}"><path d="${f.path}"/><path class="fw-zone-hatch" d="${f.path}" fill="${battle?'url(#fw-conflict)':'none'}"/><text x="${f.x}" y="${f.y-(battle?20:2)}">${f.name.length===2?f.name:f.name.replace(/구$/,'')}<tspan x="${f.x}" dy="20">${battle?'':zone.protectedUntil>now()?'보호 · ':''}${battle?'':esc(team(zone.owner)?.name||'무주지')}</tspan></text>${selected&&!battle?`<circle class="fw-selection-pin" cx="${f.x}" cy="${f.y-33}" r="5"/>`:''}</g>`;}).join('')}
    ${svg.features.filter(f=>battleAt(f.id)).map(clashMarker).join('')}
    <g class="fw-compass" transform="translate(825 40)"><text x="0" y="0">N</text><path d="M0 12V45m-6-24 6-9 6 9"/></g></svg></div>
    <div class="fw-map-key"><span><i class="ours"></i>우리 지역</span><span><i class="others"></i>다른 클랜</span><span class="fw-clash-key"><svg viewBox="0 0 24 24" aria-hidden="true">${crossedSwords}</svg>격돌 중</span><span><i></i>무주지</span></div>
    <footer><span>구역을 선택해 상권과 부대 확인</span><a href="https://github.com/southkorea/seoul-maps" target="_blank" rel="noreferrer">지도: Seoul Maps · Apache 2.0</a></footer></section>`;
}
function detailView(){
  const data=state.data,z=data.districts.find(d=>d.id===state.selected)||data.districts[0],meta=districtById(z.id),b=battleAt(z.id),own=z.owner===mine(),protectedNow=z.protectedUntil>now();
  const canStrike=b&&((b.attacker===mine()&&b.attackers.includes(data.userId))||(b.defender===mine()&&b.defenders.includes(data.userId)));
  const squad=state.squad,cooldown=Math.max(data.squadReady[squad]||0,data.targetReady[z.id]||0);
  const squadBusy=data.battles.some(b=>b.status==='ACTIVE'&&b.attacker===mine()&&b.squad===squad);
  const permitted=data.mine?.isMaster||data.formation[squad]?.includes(data.userId);
  const launchable=factionCombatOpen(data)&&mine()&&!own&&!b&&!protectedNow&&cooldown<=now()&&!squadBusy&&permitted&&data.formation[squad]?.length;
  return `<aside class="fw-detail" aria-label="선택한 지역 작전"><div class="fw-detail-top"><span class="fw-eyebrow">DISTRICT ${String(DISTRICTS.findIndex(d=>d.id===z.id)+1).padStart(2,'0')} / SEOUL</span><span class="fw-status ${b?'danger':own?'lime':''}">${status(z)}</span></div><h2>${meta.name}</h2><p class="fw-market">${meta.market} 상권</p>
    <div class="fw-owner">${mark(z.owner)}<div><small>현재 점령 클랜</small><strong>${esc(team(z.owner)?.name||'점령 클랜 없음')}</strong></div></div>
    <div class="fw-local-income">${icon('coin')}<span>${data.sessions?'종료 보상 조건 <small>회차 종료 시점에 집계</small>':'상권 징수세 <small>점령 클랜 공동 수익</small>'}</span><strong>${data.sessions?'4개 이상':compact(R.taxPerHour)}<small>${data.sessions?' 점령':' / 시간'}</small></strong></div>
    ${b?`<section class="fw-conflict-detail"><div class="fw-section-title"><h3>공유 HP 교전</h3><em>${clock(b.endsAt)} 남음</em></div>${hp(`${esc(team(b.attacker)?.name)} 공격대`,b.attackerHp,'attack')}${hp(`${esc(team(b.defender)?.name)} 방어대`,b.defenderHp,'defense')}<p>상대 공유 HP가 먼저 0이 되면 승리</p><button class="fw-primary" data-fw-enter="${b.id}" ${!canStrike||!data.season.active?'disabled':''}>${icon('sword')}${!canStrike?'교전 부대원만 참여 가능':b.defender===mine()?'방어 전투 입장':'공격 전투 입장'}</button><small>최신 랭크전 덱으로 교전 · 개인 재교전 1분</small></section>`:
    `<section class="fw-defense-info"><div class="fw-section-title"><h3>${icon('shield')}주둔 방어대</h3><b>${z.defenders.length}명</b></div><div class="fw-defenders">${z.defenders.map((m,i)=>`<span><i>${String(i+1).padStart(2,'0')}</i>${esc(m.nickname)}</span>`).join('')||'<p>배치된 방어대가 없습니다.</p>'}</div>${own&&data.mine.isMaster?`<div class="fw-garrison"><select id="fw-defense-select" aria-label="주둔 방어대 선택">${SQUADS.filter(s=>s.role==='DEFENSE').map(s=>`<option value="${s.id}" ${z.defense===s.id?'selected':''}>${s.name} · ${data.formation[s.id]?.length||0}명</option>`).join('')}</select><button data-fw-garrison ${!data.season.active?'disabled':''}>배치</button></div>`:''}</section>
    ${own?`<div class="fw-protection">${icon('shield')}<div><strong>${protectedNow?'점령 보호 중':'우리 클랜의 상권'}</strong><span>${protectedNow?clock(z.protectedUntil)+' 뒤 공격 가능':'방어대를 배치해 상권을 지키세요.'}</span></div></div>`:
    `<section class="fw-dispatch"><div class="fw-section-title"><h3>출정할 공격대</h3><button class="fw-text-btn" data-fw-tab="formation">편성 관리 ↗</button></div><div class="fw-squad-options">${SQUADS.filter(s=>s.role==='ATTACK').map(s=>`<button data-fw-squad="${s.id}" class="${squad===s.id?'active':''}"><b>${s.name}</b><span>${data.formation[s.id]?.length||0} / 5명</span></button>`).join('')}</div>
    <div class="fw-launch-note">${protectedNow?`${icon('shield')}점령 보호 · ${clock(z.protectedUntil)} 남음`:cooldown>now()?`${icon('clock')}재공격까지 ${clock(cooldown)}`:squadBusy?'선택한 공격대가 다른 지역에서 교전 중입니다.':!data.formation[squad]?.length?'클랜장이 공격대를 편성하면 출정할 수 있습니다.':!z.defenders.length?'방어대가 없는 지역은 출정 즉시 점령합니다.':'출정하면 공격대·방어대 편성원에게 전투 입장 알림이 전송됩니다.'}</div>
    <button class="fw-primary" data-fw-launch ${launchable?'':'disabled'}>${icon('sword')}${protectedNow?'점령 보호 중':!z.owner?'무주지 점령':`${meta.name} 공격 시작`}${icon('arrow')}</button></section>`}`}
    <footer class="fw-detail-rules"><span>${icon('shield')}점령 보호 <b>${ruleMinutes('protectionMs')}</b></span><span>${icon('clock')}공격대 재출정 <b>${ruleMinutes('squadCooldownMs')}</b></span><span>${icon('clock')}같은 지역 재공격 <b>${ruleMinutes('targetCooldownMs')}</b></span></footer></aside>`;
}
function formationView(){
  const d=state.data,edit=state.edit||d.formation,assigned=new Set(Object.values(edit).flat()),captains=state.editCaptains||d.captains||{};
  const editable=d.mine?.canManageFormation?SQUADS:[];
  const inBattle=d.battles.some(b=>b.status==='ACTIVE'&&(b.attacker===mine()||b.defender===mine()));
  const canEdit=squad=>d.season.active&&!inBattle&&editable.some(s=>s.id===squad);
  const canSave=d.season.active&&(d.mine?.isMaster||(!inBattle&&editable.length));
  const role=d.mine?.isMaster?'클랜장 · 모든 부대 편성 및 행동대장 임명':editable.length?'행동대장 · 공격대·방어대 전체 라인업 편성':'부대 편성 현황 · 클랜장과 담당 행동대장이 라인업을 관리합니다.';
  return `<section class="fw-formation"><header class="fw-page-heading"><div><span class="fw-eyebrow">SQUAD COMMAND</span><h2>공격대 · 방어대 편성</h2><p>부대당 최대 5명 · 한 사람은 한 부대에 배치됩니다.</p></div><button class="fw-primary" data-fw-save ${canSave?'':'disabled'}>${icon('users')}${d.mine?.isMaster?'편성·직책 저장':'라인업 저장'}</button></header>
    <div class="fw-command-role">${icon('users')}<span>${esc(role)}</span>${inBattle?'<strong>교전 중 · 라인업 변경 대기</strong>':''}</div>
    <div class="fw-formation-layout"><div class="fw-squads">${SQUADS.map(s=>{
      const captainId=captains[s.id]||0,captain=d.roster.find(m=>m.userId===captainId);
      return `<section class="fw-squad-card ${s.role.toLowerCase()} ${canEdit(s.id)?'is-editable':''}" data-fw-formation-squad="${s.id}"><header>${icon(s.role==='ATTACK'?'sword':'shield')}<div><small>${s.role==='ATTACK'?'ASSAULT':'DEFENSE'}</small><h3>${s.name}</h3></div><b>${edit[s.id]?.length||0}<small> / 5</small></b></header>
        ${s.role==='ATTACK'?`<div class="fw-captain"><label for="fw-captain-${s.id}">행동대장 <small>전체 부대 편성 권한 · 1명</small></label>${d.mine?.isMaster?`<select id="fw-captain-${s.id}" data-fw-captain="${s.id}" aria-label="${s.name} 행동대장" ${!d.season.active?'disabled':''}><option value="0">미지정</option>${d.roster.map(m=>`<option value="${m.userId}" ${captainId===m.userId?'selected':''} ${Object.entries(captains).some(([id,value])=>id!==s.id&&value===m.userId)?'disabled':''}>${esc(m.nickname)}</option>`).join('')}</select>`:`<strong>${esc(captain?.nickname||'미지정')}</strong>`}</div>`:''}
        ${Array.from({length:5},(_,i)=>{const member=d.roster.find(m=>m.userId===edit[s.id]?.[i]);return `<div class="fw-member-slot ${member?'filled':''}"><i>${i+1}</i><span>${member?esc(member.nickname):'빈 슬롯'}${member&&member.userId===captainId?'<small class="fw-captain-badge">행동대장</small>':''}</span>${member&&canEdit(s.id)?`<button data-fw-remove="${member.userId}" data-fw-remove-squad="${s.id}" aria-label="${esc(member.nickname)} 편성 해제">×</button>`:''}</div>`;}).join('')}</section>`;
    }).join('')}</div>
    <aside class="fw-roster-pool"><div class="fw-section-title"><h3>클랜원 배치</h3><b>${d.roster.length-assigned.size}명 대기</b></div><label>배치할 부대<select id="fw-assign-squad" ${!editable.length||inBattle||!d.season.active?'disabled':''}>${editable.length?editable.map(s=>`<option value="${s.id}">${s.name}</option>`).join(''):'<option>편성 권한 없음</option>'}</select></label><div>${d.roster.map(m=>`<button data-fw-add="${m.userId}" ${assigned.has(m.userId)||!editable.length||inBattle||!d.season.active?'disabled':''}><span>${esc(m.nickname)}<small>${SQUADS.find(s=>edit[s.id]?.includes(m.userId))?.name||'배치 대기'}</small></span><b>${assigned.has(m.userId)?'배치됨':'+'}</b></button>`).join('')||'<p>시즌 소속 클랜원이 없습니다.</p>'}</div></aside></div>
    <p class="fw-explanation">행동대장은 클랜장이 공격대마다 1명씩 임명하며, 공격대·방어대의 전체 라인업을 편성할 수 있습니다. 부대를 옮기려면 기존 편성을 해제한 뒤 새 부대에 배치하세요. 교전 중에는 라인업을 변경할 수 없습니다.</p></section>`;
}
function treasuryView(){
  if(state.data.sessions)return factionRewardView(state.data);
  const d=state.data,owned=d.districts.filter(z=>z.owner===mine()&&mine()),n=d.roster.length;
  return `<section class="fw-treasury"><header class="fw-page-heading"><div><span class="fw-eyebrow">CLAN REVENUE</span><h2>상권 징수세</h2><p>점령한 지역의 수익을 클랜원과 함께 나눕니다.</p></div></header><div class="fw-treasury-layout"><section class="fw-vault">${icon('coin')}<span class="fw-eyebrow">분배 대기 중인 징수코인</span><strong>${num(d.tax.pool)}</strong><div class="fw-vault-summary"><span>점령 수익 <b>${compact(owned.length*R.taxPerHour)} / 시간</b></span><span>분배 대상 <b>${n}명</b></span><span>1인당 예상 <b>${compact(Math.floor(d.tax.pool/Math.max(1,n)))} 징수코인</b></span></div><button class="fw-primary" data-fw-collect ${!mine()||d.tax.pool<=0?'disabled':''}>${icon('coin')}클랜원에게 균등 분배</button><p>누구나 정산할 수 있으며, 현재 클랜원 전원에게 함께 지급됩니다.</p><div class="fw-my-wallet"><span>내 징수코인</span><b>${num(d.tax.balance)}</b></div></section><section class="fw-revenue-list"><div class="fw-section-title"><h3>우리 클랜 상권</h3><b>${owned.length}개 지역</b></div>${owned.map(z=>`<button data-fw-pick="${z.id}"><span>${icon('map')}<strong>${districtById(z.id).name}<small>${districtById(z.id).market}</small></strong></span><b>+${compact(R.taxPerHour)}<small>시간당</small></b></button>`).join('')||'<div class="fw-empty">아직 점령한 상권이 없습니다.<br>지도에서 공격대를 출정시켜 보세요.</div>'}</section></div>${(d.tax.pendingSeasons||[]).map(p=>`<div class="fw-past-tax"><span>시즌 ${p.seasonNo} 미정산 징수세 <b>${compact(p.pool)} 코인</b></span><button data-fw-past-collect="${p.seasonId}">당시 클랜원에게 분배</button></div>`).join('')}<p class="fw-explanation">징수코인은 일반 코인과 별도로 보관됩니다. 정규 클랜전 순위에 영향을 주지 않습니다. 시즌이 끝나면 새 수익 적립은 멈추고, 적립된 수익은 정산할 수 있습니다.</p></section>`;
}
function logView(){return `<section class="fw-log"><header class="fw-page-heading"><div><span class="fw-eyebrow">OPERATION HISTORY</span><h2>전황 기록</h2></div></header>${state.data.events.map(e=>`<article><span class="fw-log-icon">${icon(e.kind==='TAX'?'coin':['FORMATION','CAPTAINS'].includes(e.kind)?'users':e.kind==='DEFENDED'?'shield':'sword')}</span><div><b>${esc(team(e.clanId)?.name||'클랜')} · ${{CAPTURE:'상권 점령',INVASION:'침공 시작',DEFENDED:'방어 성공',FORMATION:'부대 편성',CAPTAINS:'행동대장 임명·해제',TAX:'징수세 분배'}[e.kind]||'작전'}</b><p>${e.districtId?districtById(e.districtId)?.name+' · ':''}${e.kind==='TAX'?`${num(e.amount)} 징수코인 · ${e.members}명 분배`:e.kind==='CAPTAINS'?`제1 공격대 ${esc(e.names?.attack1||'미지정')} · 제2 공격대 ${esc(e.names?.attack2||'미지정')}`:e.kind==='FORMATION'?`${e.squad?esc(SQUADS.find(s=>s.id===e.squad)?.name||'')+' · ':''}${esc(e.by||'클랜장')} 편성 저장`:e.by?esc(e.by)+' 출정':''}</p></div><time>${new Date(e.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></article>`).join('')||'<p class="fw-empty">아직 기록된 작전이 없습니다.</p>'}</section>`;}
function draw(){
  drawRoom();
  if(!state.root?.isConnected)return;
  if(!state.data||!state.map){state.root.innerHTML=`<div class="fw-loading">${state.error?esc(state.error):'서울 전황을 불러오는 중입니다.'}<button data-fw-reload>다시 불러오기</button></div>`;bind();return;}
  const d=state.data,active=d.battles.filter(b=>b.status==='ACTIVE');
  state.root.innerHTML=`<section class="faction-war"><header class="fw-heading"><div><span class="fw-eyebrow">CLAN FACTION WAR</span><h2>세력전 <span>서울</span></h2><p>상권을 점령하고, 우리 클랜의 영역을 넓히세요.</p></div><span class="fw-season ${d.season.active?'active':''}"><i></i>${d.season.active?'시즌 진행 중':'시즌 대기 · 종료'}<small>정규 순위와 별도 운영</small></span></header>
    ${factionSessionStrip(d)}<div class="fw-stats"><div>${icon('map')}<span>우리 상권<b>${d.holdings}<small> / 25</small></b></span></div><div>${icon('sword')}<span>진행 중 교전<b>${active.length}<small>곳</small></b></span></div><div>${icon('coin')}<span>${d.sessions?'종료 보상':'시간당 징수세'}<b>${d.sessions?'300억':compact(d.holdings*R.taxPerHour)}<small>${d.sessions?'4개 이상 점령':'징수코인'}</small></b></span></div><div>${icon('coin')}<span>${d.sessions?'보상 전달':'내 징수코인'}<b>${d.sessions?'메시지함':compact(d.tax.balance)}</b></span></div></div>
    <nav class="fw-tabs" aria-label="세력전 메뉴">${[['map','map','전황 지도'],['formation','users','부대 편성'],['treasury','coin',d.sessions?'종료 보상':'징수세'],['log','clock','전황 기록']].map(([id,i,label])=>`<button data-fw-tab="${id}" class="${state.tab===id?'active':''}" aria-current="${state.tab===id?'page':'false'}">${icon(i)}${label}</button>`).join('')}<button class="fw-reload" data-fw-reload aria-label="전황 새로고침">↻</button></nav>
    ${myBattles()}${state.notice?`<div class="fw-notice" role="status">${esc(state.notice)}</div>`:''}${state.error?`<div class="fw-error" role="alert">${esc(state.error)}<button data-fw-reload>다시 확인</button></div>`:''}
    ${state.tab==='map'?`<div class="fw-mobile-select"><label>지역 선택<select data-fw-district-select>${DISTRICTS.map(z=>`<option value="${z.id}" ${z.id===state.selected?'selected':''}>${z.name} · ${team(d.districts.find(t=>t.id===z.id)?.owner)?.name||'무주지'}</option>`).join('')}</select></label></div><div class="fw-battlefield">${mapView()}${detailView()}</div>`:state.tab==='formation'?formationView():state.tab==='treasury'?treasuryView():logView()}</section>`;
  bind();state.root.querySelectorAll('button,select').forEach(b=>{if(state.busy)b.disabled=true;});
  if(!factionCombatOpen(d))state.root.querySelectorAll('[data-fw-launch],[data-fw-enter]').forEach(b=>{b.disabled=true;});
}
function selectDistrict(id,scroll=false){state.selected=id;state.tab='map';draw();if(scroll&&innerWidth<1000)state.root.querySelector('.fw-detail')?.scrollIntoView({behavior:'smooth',block:'start'});}
function bind(){
  const root=state.root;if(!root)return;
  root.querySelectorAll('[data-fw-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.fwTab;state.notice='';draw();});
  root.querySelectorAll('[data-fw-zone],[data-fw-pick]').forEach(b=>{b.onclick=()=>selectDistrict(b.dataset.fwZone||b.dataset.fwPick,true);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.onclick();}};});
  root.querySelector('[data-fw-district-select]')?.addEventListener('change',e=>selectDistrict(e.target.value,true));
  root.querySelectorAll('[data-fw-zoom]').forEach(b=>b.onclick=()=>{state.zoom=b.dataset.fwZoom==='0'?1:Math.max(1,Math.min(2.5,state.zoom+(b.dataset.fwZoom==='+'?.5:-.5)));draw();});
  root.querySelectorAll('[data-fw-reload]').forEach(b=>b.onclick=()=>{state.edit=null;state.editBase=null;state.editCaptains=null;return refresh();});
  root.querySelectorAll('[data-fw-squad]').forEach(b=>b.onclick=()=>{state.squad=b.dataset.fwSquad;draw();});
  root.querySelector('[data-fw-launch]')?.addEventListener('click',async()=>{const r=await action('launch',{districtId:state.selected,squad:state.squad});if(r?.battleId&&!r.captured&&mySide(battleAt(r.districtId)))await openBattleRoom(r.battleId);});
  root.querySelector('[data-fw-garrison]')?.addEventListener('click',()=>action('garrison',{districtId:state.selected,squad:root.querySelector('#fw-defense-select').value}));
  root.querySelector('[data-fw-save]')?.addEventListener('click',()=>{
    const d=state.data;
    if(d.mine?.isMaster){const captains=state.editCaptains||d.captains||{attack1:0,attack2:0};return state.edit&&!d.battles.some(b=>b.status==='ACTIVE'&&(b.attacker===mine()||b.defender===mine()))?action('formation',{formation:state.edit,baseFormation:state.editBase||d.formation,...(state.editCaptains?{captains}:{})}):action('captains',{captains});}
    if(d.mine?.canManageFormation)return action('formation',{formation:state.edit||d.formation,baseFormation:state.editBase||d.formation});
  });
  root.querySelectorAll('[data-fw-captain]').forEach(select=>select.onchange=()=>{
    state.editCaptains||=structuredClone(state.data.captains||{attack1:0,attack2:0});state.editCaptains[select.dataset.fwCaptain]=Number(select.value);draw();
    root.querySelector(`[data-fw-captain="${select.dataset.fwCaptain}"]`)?.focus();
  });
  root.querySelector('[data-fw-collect]')?.addEventListener('click',()=>action('collect',{seasonId:state.data.season.id}));
  root.querySelectorAll('[data-fw-past-collect]').forEach(b=>b.onclick=()=>action('collect',{seasonId:Number(b.dataset.fwPastCollect)}));
  root.querySelectorAll('[data-fw-enter]').forEach(b=>b.onclick=()=>openBattleRoom(b.dataset.fwEnter));
  root.querySelectorAll('[data-fw-add]').forEach(b=>b.onclick=()=>{const squad=root.querySelector('#fw-assign-squad').value;state.editBase||=structuredClone(state.data.formation);state.edit||=structuredClone(state.data.formation);if(state.edit[squad].length>=5){state.notice='부대당 최대 5명까지 편성할 수 있습니다.';draw();return;}state.edit[squad].push(Number(b.dataset.fwAdd));draw();root.querySelector('#fw-assign-squad').value=squad;});
  root.querySelectorAll('[data-fw-remove]').forEach(b=>b.onclick=()=>{state.editBase||=structuredClone(state.data.formation);state.edit||=structuredClone(state.data.formation);const squad=b.dataset.fwRemoveSquad;state.edit[squad]=state.edit[squad].filter(v=>v!==Number(b.dataset.fwRemove));draw();});
}
async function refresh(preserveError=false){
  if(!state.ctx||state.busy)return;
  const sequence=++state.sequence;
  try{const [data,map]=await Promise.all([api('overview'),state.map||fetch('/assets/ui/clan/seoul/districts-v1.json').then(r=>{if(!r.ok)throw Error('지도를 불러오지 못했습니다.');return r.json();})]);if(sequence!==state.sequence)return;state.data=data;state.map=map;state.offset=data.serverNow-Date.now();if(!preserveError)state.error='';draw();return data;}
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
    if(kind==='enter')try{sessionStorage.setItem(`faction-alert:${state.data.userId}:${state.data.season.id}:${payload.battleId}`,'1');}catch{}
    state.edit=null;state.editBase=null;state.editCaptains=null;
    state.notice=kind==='captains'?'행동대장 지정을 저장했습니다.':kind==='formation'?'부대 편성을 저장했습니다.':kind==='garrison'?'방어대를 배치했습니다.':kind==='enter'?'전투실에 입장했습니다. 내 덱으로 교전에 참여하세요.':kind==='collect'?`${result.members}명에게 총 ${num(result.total)} 징수코인을 분배했습니다. 내 몫 ${num(result.myAmount)}코인`:kind==='strike'?`상대 공유 HP −${num(result.damage)}${result.battleCompleted?' · 교전 종료':''}`:result.captured?`상권을 점령했습니다. ${ruleMinutes('protectionMs')} 점령 보호가 시작됩니다.`:'공격대가 출정했습니다. 양쪽 편성원이 직접 전투실에 입장해 참여합니다.';
    if(kind==='strike'&&result.battleV2&&!result.replayed){
      state.playing=true;state.room?.close();
      try{await playBattle(result);}finally{state.playing=false;if(state.room?.isConnected&&!state.room.open)state.room.showModal();}
    }
    return result;
  }catch(e){state.notice='';state.error=e.message||'요청을 처리하지 못했습니다. 다시 누르면 같은 요청으로 확인합니다.';}
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
    live.msg.innerHTML=`<div class="fw-combat-result"><span class="fw-eyebrow">FACTION WAR</span><h2>상대 공유 HP <em>−${num(data.damage)}</em></h2><p>${data.battleCompleted?'공유 HP 승부가 결정됐습니다.':'부대의 교전은 계속됩니다.'}</p><button class="fw-primary" data-fw-battle-close>부대 전투실로 복귀</button></div>`;live.msg.classList.add('is-visible');
    await new Promise(resolve=>{modal.querySelector('[data-fw-battle-close]').onclick=()=>{close();resolve();};});
  }catch(e){close();throw new Error('공유 HP는 반영됐습니다. 전투 연출을 불러오지 못해 전황으로 복귀합니다.');}
}
function closeRoom(){
  const room=state.room;state.room=null;state.roomId='';room?.close();room?.remove();
}
function updateRoomAction(){
  const button=state.room?.querySelector('[data-fw-room-strike]');if(!button)return;
  const b=state.data?.battles.find(b=>b.id===state.roomId),ready=state.data?.strikeReady||0;
  button.disabled=state.busy||!b||b.status!=='ACTIVE'||b.endsAt<=now()||!factionCombatOpen(state.data)||!mySide(b)||!b.entries?.[state.data.userId]||ready>now();
  button.innerHTML=`${icon('sword')}${state.busy?'교전 준비 중':ready>now()?`다음 교전 ${clock(ready)}`:'내 덱으로 교전 참여'}`;
}
function drawRoom(){
  const room=state.room;if(!room||state.playing)return;
  const focused=document.activeElement?.getAttribute('data-fw-room-action');
  const b=state.data?.battles.find(b=>b.id===state.roomId),side=mySide(b),entry=b?.entries?.[state.data?.userId];
  const active=b?.status==='ACTIVE'&&b.endsAt>now()&&factionCombatOpen(state.data);
  const ids=b?(side==='ATTACK'?b.attackers:side==='DEFENSE'?b.defenders:[]):[];
  room.innerHTML=`<header class="fw-room-header"><div><span class="fw-eyebrow">FACTION WAR / ${side==='ATTACK'?'ASSAULT':'DEFENSE'}</span><h2 id="fw-room-title">${b?districtById(b.districtId)?.name:'세력전'} <span>전투실</span></h2></div><button data-fw-room-close data-fw-room-action="close" aria-label="전투실 닫기">×</button></header>
    ${b?`<div class="fw-room-status"><span class="fw-status ${active?'lime':''}">${active?side==='ATTACK'?'공격 작전 진행 중':'방어 작전 진행 중':'교전 종료'}</span><span>${active?clock(b.endsAt)+' 남음':`${esc(team(b.winner)?.name||'상대 클랜')} ${b.winner===b.attacker?'점령 성공':'방어 성공'}`}</span></div>
    <div class="fw-room-front"><section>${mark(b.attacker)}<strong>${esc(team(b.attacker)?.name)}</strong><small>공격대</small>${hp('공격 진영',b.attackerHp,'attack')}</section><span class="fw-room-vs">VS</span><section>${mark(b.defender)}<strong>${esc(team(b.defender)?.name)}</strong><small>방어대</small>${hp('방어 진영',b.defenderHp,'defense')}</section></div>
    <div class="fw-room-body"><section class="fw-room-roster"><div class="fw-section-title"><h3>${icon('users')}우리 ${side==='ATTACK'?'공격대':'방어대'}</h3><b>${ids.filter(id=>b.entries?.[id]).length} / ${ids.length}명 입장</b></div>${ids.map((id,i)=>{const e=b.entries?.[id],m=state.data.roster.find(m=>m.userId===id);return `<div class="fw-room-member ${id===state.data.userId?'is-me':''}"><i>${String(i+1).padStart(2,'0')}</i><span>${esc(m?.nickname||'편성원')}${id===state.data.userId?'<small>나</small>':''}</span><b>${e?`${e.hits}회 교전`:'입장 대기'}</b><em>${e?'입장 완료':'미입장'}</em></div>`;}).join('')||'<p>이 교전의 편성원이 아닙니다.</p>'}</section>
    <section class="fw-room-personal"><span class="fw-eyebrow">MY CONTRIBUTION</span><h3>내 전투 기록</h3><dl><div><dt>교전 참여</dt><dd>${num(entry?.hits)}<small>회</small></dd></div><div><dt>공유 HP 피해</dt><dd>${num(entry?.damage)}</dd></div></dl><p>최신 랭크전 덱으로 직접 교전합니다.<br>각 대원이 참여한 피해가 전선에 합산됩니다.</p></section></div>`:'<p class="fw-room-loading">전투 정보를 확인하고 있습니다.</p>'}
    <footer class="fw-room-footer">${state.error?`<p class="fw-error" role="alert">${esc(state.error)}</p>`:state.notice?`<p class="fw-room-notice" role="status">${esc(state.notice)}</p>`:''}
    ${active&&side?(entry?'<button class="fw-primary" data-fw-room-strike data-fw-room-action="strike"></button>':'<button class="fw-primary" data-fw-room-enter data-fw-room-action="enter">전투 입장 확인</button>'):`<button class="fw-primary" data-fw-room-close data-fw-room-action="done">${b?'전투실 닫기':'닫기'}</button>`}
    <small>${active?'편성원 각자 입장 · 개인 재교전 1분 · 팝업을 닫아도 다시 입장할 수 있습니다.':'공유 HP와 점령 결과는 서버에서 확정됩니다.'}</small></footer>`;
  room.querySelectorAll('[data-fw-room-close]').forEach(n=>n.onclick=closeRoom);
  const enter=room.querySelector('[data-fw-room-enter]');if(enter){enter.disabled=state.busy;enter.onclick=()=>action('enter',{battleId:state.roomId});}
  room.querySelector('[data-fw-room-strike]')?.addEventListener('click',()=>action('strike',{battleId:state.roomId}));
  updateRoomAction();if(focused)room.querySelector(`[data-fw-room-action="${focused}"]`)?.focus({preventScroll:true});
}
async function openBattleRoom(battleId){
  if(state.busy||state.playing)return;
  closeRoom();state.error='';state.notice='';state.roomId=battleId;
  const room=document.createElement('dialog');room.className='fw-battle-room';room.setAttribute('aria-labelledby','fw-room-title');
  state.room=room;document.body.append(room);room.addEventListener('cancel',e=>{e.preventDefault();closeRoom();});drawRoom();room.showModal();
  await refresh();if(state.room!==room)return;
  const b=state.data?.battles.find(b=>b.id===battleId);
  if(b&&mySide(b)&&b.status==='ACTIVE'&&factionCombatOpen(state.data))await action('enter',{battleId});
  drawRoom();
}
export function mount(root,ctx){state.root=root;connect(ctx);draw();void refresh();}
export function view(){return '<div id="clanFactionRoot" class="fw-root"></div>';}
export function select(id){state.selected=id;state.tab='map';}
export function connect(ctx){
  const userId=Number(ctx.userId||window.loadUser?.()?.serverUserId||window.loadUser?.()?.id||0);
  if(userId&&state.data&&state.data.userId!==userId){closeRoom();state.data=null;state.edit=null;state.editBase=null;state.editCaptains=null;state.error='';state.notice='';state.sequence++;document.querySelector('.fw-invasion-alert')?.remove();}
  state.ctx=ctx;
  if(!state.timer)state.timer=setInterval(()=>{if(document.hidden)return;for(const root of [state.root,state.room])root?.querySelectorAll('[data-fw-until]').forEach(n=>n.textContent=left(Number(n.dataset.fwUntil)));updateRoomAction();},1000);
  if(!state.alertTimer){state.alertTimer=setInterval(()=>poll(),8000);void poll();}
}
async function poll(){
  if(document.hidden||state.alertBusy||state.busy||!state.ctx)return;state.alertBusy=true;
  try{
    let data;
    if(state.room||(state.root?.isConnected&&state.tab!=='formation')){
      const overview=await refresh();
      // Session overview already contains alerts. Do not repeat its DB lifecycle work.
      if(overview?.sessions)data={...overview,seasonId:overview.season.id};
    }
    data ||= await api('alerts');
    for(const a of data.alerts||[]){
      const key=`faction-alert:${data.userId}:${data.seasonId}:${a.id}`;
      if(sessionStorage.getItem(key)||state.room||document.querySelector('.fw-invasion-alert')||document.querySelector('#modal.show'))continue;
      showAlert(a,()=>sessionStorage.setItem(key,'1'));break;
    }
  }catch{}finally{state.alertBusy=false;}
}
function showAlert(a,remember){
  const dialog=document.createElement('dialog');dialog.className='fw-invasion-alert';
  const attack=a.side==='ATTACK';dialog.setAttribute('aria-label',`${a.districtName} ${attack?'출정':'침공'} 알림`);
  dialog.innerHTML=`<button class="fw-alert-close" aria-label="전투 알림 닫기">×</button><div class="fw-alert-symbol">${icon(attack?'sword':'shield')}</div><span class="fw-eyebrow">${attack?'SQUAD DEPLOYED':'INCOMING ATTACK'}</span><h2>${esc(a.districtName)} ${attack?'출정 알림':'침공 경보'}</h2><p><b>${esc(a.attackerClan)}</b> 클랜의 <b>${esc(a.attackerName)}</b> 님이 ${attack?'공격을 시작했습니다.':'공격해 왔습니다.'}</p><div class="fw-alert-order">${attack?'공격대':'방어대'}에 편성되어 있습니다.<br>직접 전투실에 입장해 내 덱으로 참여하세요.</div><button class="fw-primary" data-fw-defend>${icon(attack?'sword':'shield')}${attack?'공격':'방어'} 전투 입장</button><button class="fw-alert-later">나중에 참여</button>`;
  document.body.append(dialog);const previous=document.activeElement;
  const close=()=>{remember();dialog.close();dialog.remove();previous?.focus?.();};
  dialog.querySelector('.fw-alert-close').onclick=close;dialog.querySelector('.fw-alert-later').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.querySelector('[data-fw-defend]').onclick=()=>{close();select(a.districtId);void openBattleRoom(a.id);};
  dialog.showModal();
}
window.ClanFaction={mount,view,connect,select};
