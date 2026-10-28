import {mountWarChat} from './war-chat-v1.mjs?v=20261028-chat2';
import {organizationCrest} from './organization-identity-v1.mjs?v=20261025-clan-eight';
import {organizationIdentity} from '../shared/organization-identity-v1.mjs?v=20261025-clan-eight';
import {ORGANIZATION_DISTRICTS as DISTRICTS,ORGANIZATION_SESSION_RULES as SESSION_RULES,SQUADS,FACTION_RULES as R,organizationDistrictById as districtById,historicalOrganizationDistrictById,isSelfJoinSquad,organizationSquadChangeBlocked} from '../shared/organization-faction-v1.mjs?v=20261024-weekly&clanRestore=20261025&clanResume=20261025';
import {factionCombatOpen,factionSessionStrip,factionRewardView} from './clan-faction-sessions-v1.mjs?v=20261018-session-rules&clanResume=20261025';
import {renderOrganizationRankings} from './organization-rankings-v1.mjs?v=20261025-wed-sat-sun&clanRestore=20261025&clanResume=20261025';
let rankingView='season';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Math.max(0,Number(n)||0).toLocaleString('ko-KR');
const compact=n=>n>=1e8?(n/1e8).toLocaleString('ko-KR',{maximumFractionDigits:1})+'억':n>=1e4?(n/1e4).toLocaleString('ko-KR',{maximumFractionDigits:1})+'만':num(n);
const symbols={map:'M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15',sword:'m4 3 12 12m-3 3 5-5m-2 3 5 5M3 3l1 5 4-4-5-1Z',shield:'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3Zm-4 9 3 3 5-6',coin:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM14 8h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3m2-9v10',clock:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5v5l3 2',users:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m20 0v-3a4 4 0 0 0-3-4M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm5-4a4 4 0 0 1 0 8',alert:'m12 3 10 18H2L12 3Zm0 6v5m0 3v1',arrow:'M4 12h16m-6-6 6 6-6 6'};
const icon=(id,cls='')=>`<svg class="fw-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${symbols[id]||symbols.map}"/></svg>`;
const ART='/assets/ui/organization/faction-v3-20261019/';
function clashMarker(f,unit){
 return `<g class="fw-map-battle-pin" data-fw-pick="${f.id}" role="button" tabindex="0" aria-label="${f.name} 격돌 중 · 전투 정보 보기" transform="translate(${f.x} ${f.y}) scale(${unit})"><rect class="fw-pin-hit" x="-35" y="-63" width="70" height="94"/><image class="fw-clash-art" href="${ART}clash.webp" x="-32" y="-62" width="64" height="64"/><text class="fw-pin-name" y="10">${f.name.replace(/[시구]$/,'')}</text><text class="fw-pin-status" y="28">격돌 중</text></g>`;
}
const state={data:null,map:null,tab:['map','formation','treasury','rankings','log'].includes(new URL(location.href).searchParams.get('tab'))?new URL(location.href).searchParams.get('tab'):'map',selected:'11680',squad:'attack1',squadSelected:false,edit:null,editBase:null,editCaptains:null,busy:false,error:'',ctx:null,root:null,offset:0,timer:null,alertTimer:null,alertBusy:false,notice:'',mapFocus:'all',camera:null,sequence:0,room:null,roomId:'',playing:false};
const now=()=>Date.now()+state.offset;
const ruleMinutes=key=>`${num((state.data?.rules?.[key]??R[key])/60000)}분`;
const left=until=>{const seconds=Math.max(0,Math.ceil((until-now())/1000));return seconds>=3600?`${Math.floor(seconds/3600)}시간 ${Math.floor(seconds%3600/60)}분`:seconds>=60?`${Math.floor(seconds/60)}분 ${seconds%60}초`:`${seconds}초`;};
const clock=until=>`<span data-fw-until="${until}">${left(until)}</span>`;
const team=id=>{const clan=state.data?.clans.find(c=>c.clanId===id);return clan?{...clan,...organizationIdentity(id)}:null;};
const mark=id=>team(id)?organizationCrest(id,'fw-mark'):'<span class="fw-neutral">—</span>';
const api=(path,body)=>state.ctx.apiRequest(`organization/faction/${path}`,body?{method:'POST',body:JSON.stringify({...body,roundId:state.data?.roundId})}:{},{ttl:0,timeoutMs:30000});
const mine=()=>state.data?.mine?.clanId;
const battleAt=id=>state.data?.battles.find(b=>b.districtId===id&&b.status==='ACTIVE');
const mySide=b=>b&&(b.attacker===mine()&&b.attackers.includes(state.data.userId)?'ATTACK':b.defender===mine()&&b.defenders.includes(state.data.userId)?'DEFENSE':'');
function myBattles(){
  const battles=state.data.battles.filter(b=>b.status==='ACTIVE'&&mySide(b));
  return battles.length?`<div class="fw-my-battles" aria-label="내가 참여할 전투">${battles.map(b=>`<button data-fw-enter="${b.id}">${icon(mySide(b)==='ATTACK'?'sword':'shield')}<span><b>${districtById(b.districtId).name} · ${mySide(b)==='ATTACK'?'공격대':'방어대'}</b><small>${b.entries?.[state.data.userId]?'참여 중 · 전투실 다시 열기':'편성된 전투 · 직접 입장해 참여하세요'}</small></span><strong>전투 입장 →</strong></button>`).join('')}</div>`:'';
}
function status(d){return battleAt(d.id)?'격돌 중':d.protectedUntil>now()?'점령 보호':d.owner===mine()?'우리 지역':d.owner?'공격 가능':'무주지';}
function hp(label,value,side){return `<div class="fw-hp ${side}"><div><span>${label}</span><b>${num(value)} <small>/ ${compact(R.sharedHp)}</small></b></div><progress max="${R.sharedHp}" value="${value}" aria-label="${esc(label.replace(/<[^>]+>/g,''))} 공유 HP"></progress></div>`;}
function fitMapViewport(){
 const panel=state.root?.querySelector('.fw-map-panel'),scroll=panel?.querySelector('.fw-map-scroll');if(!scroll)return;
 const fronts=state.root.querySelector('.fw-active-fronts');
 if(innerWidth<=720){if(fronts)panel.insertBefore(fronts,panel.querySelector('.fw-map-focus'));scroll.style.height='';return;}
 if(fronts)state.root.querySelector('.fw-detail')?.prepend(fronts);
 const other=panel.getBoundingClientRect().height-scroll.getBoundingClientRect().height;
 scroll.style.height=Math.max(520,innerHeight-panel.getBoundingClientRect().top-other-20)+'px';
}
window.addEventListener('resize',()=>requestAnimationFrame(fitMapViewport),{passive:true});
function seoulCamera(){const b=state.map.focusBounds.seoul,width=Math.max((b[2]-b[0])*1.18,(b[3]-b[1])*1.18*1.1);return [(b[0]+b[2]-width)/2,(b[1]+b[3]-width/1.1)/2,width,width/1.1];}
function currentCamera(){return state.camera||seoulCamera();}
function bindMapDrag(svg){
 if(!svg)return;let drag=null,suppressClick=false;
 svg.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'||e.button!==0||!e.isPrimary||drag)return;
  const box=[...currentCamera()],rect=svg.getBoundingClientRect(),scale=Math.min(rect.width/box[2],rect.height/box[3]);
  if(!(scale>0))return;
  suppressClick=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,box,scale,target:e.target,moved:false};state.mapDragging=true;
  e.target.setPointerCapture(e.pointerId);
 });
 svg.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<6)return;
  drag.moved=true;suppressClick=true;e.preventDefault();svg.classList.add('is-dragging');
  const [x,y,w,h]=drag.box,clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const bounds=state.map.focusBounds.seoul;state.camera=[clamp(x-dx/drag.scale,bounds[0]-w*.85,bounds[2]-w*.15),clamp(y-dy/drag.scale,bounds[1]-h*.85,bounds[3]-h*.15),w,h];state.mapFocus='custom';
  svg.setAttribute('viewBox',state.camera.join(' '));
  state.root.querySelectorAll('[data-fw-focus]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
  const label=state.root.querySelector('.fw-map-area-label');if(label)label.textContent='상세 지도';
 });
 const finish=e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const ended=drag;drag=null;state.mapDragging=false;svg.classList.remove('is-dragging');
  if(ended.target.hasPointerCapture?.(e.pointerId))ended.target.releasePointerCapture(e.pointerId);
  if(state.mapDrawPending)requestAnimationFrame(()=>{if(!state.mapDragging)draw();});
 };
 for(const event of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(event,finish);
 svg.addEventListener('click',e=>{if(suppressClick&&e.detail!==0){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
 svg.addEventListener('dragstart',e=>e.preventDefault());
}
function focusMap(mode){
  const f=state.map.features.find(f=>f.id===state.selected),b=mode==='selected'?f.bounds:state.map.focusBounds[mode];
  if(mode==='all'){state.camera=null;state.mapFocus='all';draw();return;}
  const width=Math.max(mode==='selected'?120:0,(b[2]-b[0])*1.18,(b[3]-b[1])*1.18*1.1);
  state.camera=[(b[0]+b[2]-width)/2,(b[1]+b[3]-width/1.1)/2,width,width/1.1];state.mapFocus=mode;draw();
}
function zoomMap(direction){
 const box=currentCamera(),width=Math.min(seoulCamera()[2]*1.15,Math.max(120,box[2]*(direction==='+'?.72:1/.72))),f=state.map.features.find(f=>f.id===state.selected);
 const cx=direction==='+'?f.x:box[0]+box[2]/2,cy=direction==='+'?f.y:box[1]+box[3]/2;
 state.camera=[cx-width/2,cy-width/2.2,width,width/1.1];state.mapFocus='custom';draw();
}
function mapView(){
  const d=state.data,svg=state.map,box=currentCamera(),mobile=innerWidth<721,detail=box[2]<600,font=box[2]/1100*(mobile?44:32),labelHeight=font*1.15;
  const selected=svg.features.find(f=>f.id===state.selected),selectedZone=d.districts.find(f=>f.id===state.selected),seoul=svg.focusBounds.seoul;
  return `<section class="fw-map-panel" aria-label="서울 25개 구 세력전 지도"><header><div><span class="fw-eyebrow">SEOUL / CLAN CONTROL</span><h3>서울 전황도 <small>서울 25개 구</small></h3></div><div class="fw-map-controls"><button data-fw-zoom="-" aria-label="지도 축소">−</button><button data-fw-zoom="+" aria-label="지도 확대">+</button></div></header>
    <div class="fw-active-fronts" aria-label="진행 중인 격돌">${d.battles.filter(b=>b.status==='ACTIVE').length?'<strong>격돌 중</strong>'+d.battles.filter(b=>b.status==='ACTIVE').map(b=>`<button data-fw-front="${b.districtId}"><img src="${ART}clash.webp" alt="" width="28" height="28"><span>${districtById(b.districtId).name}</span><small>${esc(team(b.attacker)?.name)} → ${esc(team(b.defender)?.name)}</small></button>`).join(''):'<span>진행 중인 격돌 없음</span>'}</div>
    <nav class="fw-map-focus" aria-label="지도 확대 범위"><button data-fw-focus="all" class="${state.mapFocus==='all'?'active':''}" aria-pressed="${state.mapFocus==='all'}">서울 전체</button><button data-fw-focus="selected" class="${state.mapFocus==='selected'?'active':''}" aria-pressed="${state.mapFocus==='selected'}">선택 지역 확대</button></nav>
    <div class="fw-map-scroll"><svg class="fw-seoul-map" viewBox="${box.join(' ')}" role="group" aria-label="실제 행정경계 지도. 마우스로 끌어 이동하고 클릭하면 지역을 선택합니다."><defs><pattern id="fw-terrain" width="1100" height="1000" patternUnits="userSpaceOnUse"><image href="${ART}terrain.webp" x="0" y="0" width="1100" height="1000" preserveAspectRatio="xMidYMid slice"/></pattern><pattern id="fw-conflict" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3" height="10" fill="#ff7860" opacity=".2"/></pattern></defs><image class="fw-terrain-backdrop" href="${ART}terrain.webp" x="-600" y="-600" width="2300" height="2200" preserveAspectRatio="xMidYMid slice"/><rect x="-600" y="-600" width="2300" height="2200" fill="#06101b" opacity=".42"/>
    <g class="fw-map-context" aria-hidden="true">${svg.context.map(f=>`<path d="${f.path}" fill-rule="evenodd"/>`).join('')}</g>
    <g class="fw-map-relief" transform="translate(0 5)" aria-hidden="true">${svg.features.map(f=>`<path d="${f.path}" fill-rule="evenodd"/>`).join('')}</g>
    ${svg.features.map(f=>{const zone=d.districts.find(z=>z.id===f.id),picked=zone.id===state.selected,battle=battleAt(zone.id),own=zone.owner===mine(),color=own?'#c8ff6b':team(zone.owner)?.color||'#52657e';return `<g class="fw-zone ${picked?'selected':''} ${battle?'contested':''} ${own?'owned':''}" data-fw-zone="${f.id}" data-area="${f.area}" role="button" tabindex="0" aria-label="${f.name} · ${esc(team(zone.owner)?.name||'무주지')} · ${status(zone)}" aria-pressed="${picked}" style="--zone:${esc(color)}"><path d="${f.path}" fill-rule="evenodd"/><path class="fw-zone-tint" d="${f.path}" fill-rule="evenodd"/><path class="fw-zone-hatch" d="${f.path}" fill-rule="evenodd" fill="${battle?'url(#fw-conflict)':'none'}"/></g>`;}).join('')}
    <g class="fw-map-labels" style="--label-size:${font}px;--owner-size:${font*.64}px" aria-hidden="true">${svg.features.filter(f=>!battleAt(f.id)).filter(f=>detail||f.area!=='SEOUL'||f.id===state.selected).filter(f=>!mobile||detail||f.labelRadius>=25||f.id===state.selected).map(f=>{const zone=d.districts.find(z=>z.id===f.id),picked=f.id===state.selected,battle=battleAt(f.id),owner=team(zone.owner)?.name||'무주지';return `${organizationIdentity(zone.owner)&&(!mobile||box[2]<200||picked)&&(detail||f.labelRadius>=(mobile?50:25)||picked)?`<image class="fw-map-emblem" href="${esc(organizationIdentity(zone.owner)?.markImage||'')}" x="${f.x-font*.95}" y="${f.y-font*2.5}" width="${font*1.9}" height="${font*1.9}" preserveAspectRatio="xMidYMid meet"/>`:''}<text class="${picked?'selected':''}" x="${f.x}" y="${f.y}">${f.name.length>2?f.name.replace(/[시구]$/,''):f.name}${picked?`<tspan x="${f.x}" dy="${labelHeight}">${battle?'⚔ 교전 중':esc(owner)}</tspan>`:''}</text>`;}).join('')}</g>
    ${!detail?`<g class="fw-seoul-caption" aria-hidden="true" transform="translate(${(seoul[0]+seoul[2])/2} ${seoul[1]-22})"><text style="font-size:${font*1.05}px">서울 · 25구</text><path d="M0 8V20"/></g>`:''}
    ${svg.features.filter(f=>battleAt(f.id)).map(f=>clashMarker(f,font/20)).join('')}
    </svg><div class="fw-map-north" aria-hidden="true">N<span>↑</span></div><span class="fw-map-area-label">${state.mapFocus==='seoul'?'서울 확대':state.mapFocus==='selected'?selected.name+' 확대':state.mapFocus==='custom'?'상세 지도':'서울'}</span></div>
    <div class="fw-map-selection"><span><small>선택 지역</small><b>${selected.name}</b><em>${esc(team(selectedZone.owner)?.name||'무주지')}</em></span><button data-fw-show-detail>작전 정보 →</button></div>
    <div class="fw-map-key"><span><i class="ours"></i>우리 지역</span><span><i class="others"></i>다른 클랜</span><span class="fw-clash-key"><img src="${ART}clash.webp" alt="" width="24" height="24">격돌 중</span><span><i></i>무주지</span></div>
    <footer><span>마우스로 끌어 이동 · 클릭해 지역 선택 · 서울 전체로 복귀</span><a href="https://github.com/southkorea/southkorea-maps/tree/master/kostat/2013" target="_blank" rel="noreferrer">통계청 통계지리정보서비스 제공 · 2013 경계</a></footer></section>`;
}
const mySquad=()=>SQUADS.find(s=>state.data?.formation[s.id]?.includes(state.data.userId))?.id||'';
function selfSquadActions(squad){
 const d=state.data,current=mySquad(),joined=current===squad;
 const blocked=organizationSquadChangeBlocked(d.battles,mine(),d.userId,current,squad),full=!joined&&d.formation[squad].length>=R.squadSize,editing=Boolean(state.edit||state.editCaptains);
 const disabled=!d.season.active||!mine()||blocked||full||editing;
 const reason=!mine()?'클랜에 배정된 구성원만 가입할 수 있습니다.':!d.season.active?'세력전 개방 후 가입할 수 있습니다.':editing?'수정한 편성을 저장하거나 새로고침한 뒤 가입하세요.':blocked?'교전이 끝난 뒤 가입·이동·탈퇴할 수 있습니다.':full?'3명 정원 마감 · 다른 자율참여 공격대를 선택하세요.':joined?'가입 완료 · 전황 지도에서 출정할 지역을 선택하세요.':current?'가입하면 '+SQUADS.find(s=>s.id===current).name+'에서 이 공격대로 이동합니다.':'원로 승인 없이 직접 가입하고 출정할 수 있습니다.';
 return '<div class="fw-self-actions"><p>'+esc(reason)+'</p><button class="'+(joined?'':'fw-primary')+'" data-fw-self-action="'+(joined?'leave-squad':'join-squad')+'" data-fw-self-squad="'+squad+'" '+(disabled?'disabled':'')+'>'+(joined?'공격대 탈퇴':full?'정원 마감':current?'이 공격대로 이동':'이 공격대 가입')+'</button></div>';
}
function detailView(){
  const data=state.data,z=data.districts.find(d=>d.id===state.selected)||data.districts[0],meta=districtById(z.id),b=battleAt(z.id),own=z.owner===mine(),protectedNow=z.protectedUntil>now();
  const canStrike=b&&((b.attacker===mine()&&b.attackers.includes(data.userId))||(b.defender===mine()&&b.defenders.includes(data.userId)));
  const squad=state.squad,cooldown=Math.max(data.squadReady[squad]||0,data.targetReady[z.id]||0);
  const squadBusy=data.battles.some(b=>b.status==='ACTIVE'&&b.attacker===mine()&&b.squad===squad);
  const permitted=data.formation[squad]?.includes(data.userId)||data.mine?.isMaster&&!isSelfJoinSquad(squad);
  const launchable=factionCombatOpen(data)&&mine()&&!own&&!b&&!protectedNow&&cooldown<=now()&&!squadBusy&&permitted&&data.formation[squad]?.length;
  return `<aside class="fw-detail" aria-label="선택한 지역 작전"><div class="fw-detail-top"><span class="fw-eyebrow">DISTRICT ${String(DISTRICTS.findIndex(d=>d.id===z.id)+1).padStart(2,'0')} / SEOUL</span><span class="fw-status ${b?'danger':own?'lime':''}">${status(z)}</span></div><h2>${meta.name}</h2><p class="fw-market">${meta.market} 상권</p>
    ${myBattles()}<div class="fw-owner">${mark(z.owner)}<div><small>현재 점령 클랜</small><strong>${esc(team(z.owner)?.name||'점령 클랜 없음')}</strong></div></div>
    <div class="fw-local-income">${icon('coin')}<span>${data.sessions?'종료 보상 조건 <small>회차 종료 시점에 집계</small>':'상권 징수세 <small>점령 클랜 공동 수익</small>'}</span><strong>${data.sessions?(data.sessions.rules?.requiredTerritories??SESSION_RULES.requiredTerritories)+'개 이상':compact(R.taxPerHour)}<small>${data.sessions?' 점령':' / 시간'}</small></strong></div>
    ${b?`<section class="fw-conflict-detail"><div class="fw-section-title"><h3>공유 HP 교전</h3><em>${clock(b.endsAt)} 남음</em></div>${hp(`${esc(team(b.attacker)?.name)} 공격대`,b.attackerHp,'attack')}${hp(`${esc(team(b.defender)?.name)} 방어대`,b.defenderHp,'defense')}<p>상대 공유 HP가 먼저 0이 되면 승리</p><button class="fw-primary" data-fw-enter="${b.id}" ${!canStrike||!data.season.active?'disabled':''}>${icon('sword')}${!canStrike?'교전 부대원만 참여 가능':b.defender===mine()?'방어 전투 입장':'공격 전투 입장'}</button><small>최신 랭크전 덱으로 교전 · 개인 재교전 1분</small></section>`:
    `<section class="fw-defense-info"><div class="fw-section-title"><h3>${icon('shield')}주둔 방어대</h3><b>${z.defenders.length}명</b></div><div class="fw-defenders">${z.defenders.map((m,i)=>`<span><i>${String(i+1).padStart(2,'0')}</i>${esc(m.nickname)}</span>`).join('')||'<p>배치된 방어대가 없습니다.</p>'}</div>${own&&(data.mine.canManageGarrison||data.mine.isMaster)?`<div class="fw-garrison"><select id="fw-defense-select" aria-label="주둔 방어대 선택"><option value="">주둔 해제</option>${SQUADS.filter(s=>s.role==='DEFENSE').map(s=>{const stationed=data.districts.find(d=>d.owner===mine()&&d.defense===s.id);return `<option value="${s.id}" ${z.defense===s.id?'selected':''} ${!data.formation[s.id]?.length?'disabled':''}>${s.name} · ${data.formation[s.id]?.length||0}명${stationed?' · '+districtById(stationed.id).name:' · 미배치'}</option>`;}).join('')}</select><button data-fw-garrison ${!data.season.active?'disabled':''}>배치 변경</button></div><p class="fw-garrison-help">지역당 방어대 1개 · 방어대당 주둔지 1곳. 다른 지역에 배치하면 기존 주둔이 해제됩니다.</p>`:''}</section>
    ${own?`<div class="fw-protection">${icon('shield')}<div><strong>${protectedNow?'점령 보호 중':'우리 클랜의 상권'}</strong><span>${protectedNow?clock(z.protectedUntil)+' 뒤 공격 가능':'방어대를 배치해 상권을 지키세요.'}</span></div></div>`:
    `<section class="fw-dispatch"><div class="fw-section-title"><h3>출정할 공격대</h3><button class="fw-text-btn" data-fw-tab="formation">편성 관리 ↗</button></div><div class="fw-squad-options">${SQUADS.filter(s=>s.role==='ATTACK').map(s=>`<button data-fw-squad="${s.id}" class="${squad===s.id?'active':''}"><b>${s.name}</b>${s.selfJoin?'<small>자율참여</small>':''}<span>${data.formation[s.id]?.length||0} / ${R.squadSize}명</span></button>`).join('')}</div>
    ${isSelfJoinSquad(squad)?selfSquadActions(squad):''}<div class="fw-launch-note">${protectedNow?`${icon('shield')}점령 보호 · ${clock(z.protectedUntil)} 남음`:cooldown>now()?`${icon('clock')}재공격까지 ${clock(cooldown)}`:squadBusy?'선택한 공격대가 다른 지역에서 교전 중입니다.':isSelfJoinSquad(squad)&&!permitted?'이 자율참여 공격대에 가입한 뒤 출정하세요.':!data.formation[squad]?.length?'원로 또는 행동대장이 공격대를 편성하면 출정할 수 있습니다.':!z.defenders.length?'방어대가 없는 지역은 출정 즉시 점령합니다.':'출정하면 공격대·방어대 편성원에게 전투 입장 알림이 전송됩니다.'}</div>
    <button class="fw-primary" data-fw-launch ${launchable?'':'disabled'}>${icon('sword')}${protectedNow?'점령 보호 중':!z.owner?'무주지 점령':`${meta.name} 공격 시작`}${icon('arrow')}</button></section>`}`}
    <footer class="fw-detail-rules"><span>${icon('shield')}점령 보호 <b>${ruleMinutes('protectionMs')}</b></span><span>${icon('clock')}공격대 재출정 <b>${ruleMinutes('squadCooldownMs')}</b></span><span>${icon('clock')}같은 지역 재공격 <b>${ruleMinutes('targetCooldownMs')}</b></span></footer></aside>`;
}
function formationView(){
  const d=state.data,edit=state.edit||d.formation,assigned=new Set(Object.values(edit).flat()),captains=state.editCaptains||d.captains||{};
  const editable=d.mine?.canManageFormation?SQUADS.filter(s=>!s.selfJoin):[];
  const inBattle=d.battles.some(b=>b.status==='ACTIVE'&&(b.attacker===mine()||b.defender===mine()));
  const canEdit=squad=>d.season.active&&!inBattle&&editable.some(s=>s.id===squad);
  const canSave=d.season.active&&(d.mine?.isMaster||(!inBattle&&editable.length));
  const role=d.mine?.isMaster?'원로 · 일반 부대 편성 및 행동대장 임명':editable.length?'행동대장 · 일반 부대 편성 및 주둔 방어대 지정':'자율참여 공격대에 직접 가입해 출정하세요.';
  const groups=[{id:'self',name:'자율참여 공격대',note:'제4·제5 공격대 · 원로 편성 없이 클랜원이 직접 가입합니다.',squads:SQUADS.filter(s=>s.selfJoin)},{id:'attack',name:'일반 공격대',note:'원로와 행동대장이 출정할 클랜원을 편성합니다.',squads:SQUADS.filter(s=>s.role==='ATTACK'&&!s.selfJoin)},{id:'defense',name:'방어대',note:'점령지를 지킬 클랜원을 편성합니다.',squads:SQUADS.filter(s=>s.role==='DEFENSE')}];
  return `<section class="fw-formation"><header class="fw-page-heading"><div><span class="fw-eyebrow">SQUAD COMMAND</span><h2>공격대 · 방어대 편성</h2><p>일반 공격대 3개 · 자율참여 공격대 2개 · 방어대 5개<br>부대당 최대 ${R.squadSize}명 · 한 사람은 한 부대에만 참여합니다.</p></div>${editable.length?`<button class="fw-primary" data-fw-save ${canSave?'':'disabled'}>${icon('users')}${d.mine?.isMaster?'편성·직책 저장':'라인업 저장'}</button>`:''}</header>
    <div class="fw-command-role">${icon('users')}<span>${esc(role)}<br><small>우리 클랜 원로: ${(d.organizations?.find(o=>o.id===mine())?.elderIds||[]).map(id=>esc(d.roster.find(m=>m.userId===id)?.nickname||id)).join(' · ')||'미지정'}</small></span></div>
    <div class="fw-formation-layout ${editable.length?'':'is-readonly'}"><div class="fw-squads">${groups.map(group=>`<header class="fw-group-heading" data-fw-squad-group="${group.id}"><h3>${group.name} <span>${group.squads.length}개 부대</span></h3><p>${group.note}</p></header>`+group.squads.map(s=>{
      const captainId=captains[s.id]||0,captain=d.roster.find(m=>m.userId===captainId);
      return `<section class="fw-squad-card ${s.role.toLowerCase()} ${s.selfJoin?'is-self-join':''} ${canEdit(s.id)?'is-editable':''}" data-fw-formation-squad="${s.id}"><header>${icon(s.role==='ATTACK'?'sword':'shield')}<div><small>${s.selfJoin?'자율참여':s.role==='ATTACK'?'일반 공격대':'방어대'}</small><h3>${s.name}</h3></div><b>${edit[s.id]?.length||0}<small> / ${R.squadSize}</small></b></header>
        ${s.role==='ATTACK'?`<div class="fw-captain"><label for="fw-captain-${s.id}">행동대장${s.selfJoin?' (선택)':''} <small>${s.selfJoin?'가입·출정에 임명 불필요':'일반 부대 편성 권한 · 1명'}</small></label>${d.mine?.isMaster?`<select id="fw-captain-${s.id}" data-fw-captain="${s.id}" aria-label="${s.name} 행동대장" ${!d.season.active?'disabled':''}><option value="0">미지정</option>${d.roster.map(m=>`<option value="${m.userId}" ${captainId===m.userId?'selected':''} ${Object.entries(captains).some(([id,value])=>id!==s.id&&value===m.userId)?'disabled':''}>${esc(m.nickname)}</option>`).join('')}</select>`:`<strong>${esc(captain?.nickname||'미지정')}</strong>`}</div>`:''}
        ${s.role==='DEFENSE'?`<p class="fw-squad-station">주둔지: ${esc(districtById(d.districts.find(z=>z.owner===mine()&&z.defense===s.id)?.id)?.name||'미배치')}</p>`:''}${Array.from({length:R.squadSize},(_,i)=>{const member=d.roster.find(m=>m.userId===edit[s.id]?.[i]);return `<div class="fw-member-slot ${member?'filled':''}"><i>${i+1}</i><span>${member?esc(member.nickname):'빈 슬롯'}${member&&member.userId===captainId?'<small class="fw-captain-badge">행동대장</small>':''}</span>${member&&canEdit(s.id)?`<button data-fw-remove="${member.userId}" data-fw-remove-squad="${s.id}" aria-label="${esc(member.nickname)} 편성 해제">×</button>`:''}</div>`;}).join('')}${s.selfJoin?selfSquadActions(s.id):''}</section>`;
    }).join('')).join('')}</div>
    ${editable.length?`<aside class="fw-roster-pool"><div class="fw-section-title"><h3>클랜원 배치</h3><b>${d.roster.length-assigned.size}명 대기</b></div><p>자율참여 공격대의 가입·탈퇴는 각 클랜원이 직접 합니다.</p><label>배치할 부대<select id="fw-assign-squad" ${inBattle||!d.season.active?'disabled':''}>${editable.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></label><div>${d.roster.map(m=>`<button data-fw-add="${m.userId}" ${assigned.has(m.userId)||inBattle||!d.season.active?'disabled':''}><span>${esc(m.nickname)}<small>${SQUADS.find(s=>edit[s.id]?.includes(m.userId))?.name||'배치 대기'}</small></span><b>${assigned.has(m.userId)?'배치됨':'+'}</b></button>`).join('')||'<p>소속 클랜원이 없습니다.</p>'}</div></aside>`:''}</div>
    <p class="fw-explanation">자율참여 공격대는 원로 편성이나 행동대장 임명 없이 직접 가입하고 출정합니다. 다른 부대에서 가입하면 본인만 이동하며, 교전 중인 부대의 가입·이동·탈퇴는 제한됩니다. 일반 공격대·방어대는 원로와 행동대장이 편성합니다.</p></section>`;
}
function organizationSessionStrip(data){
 if(data.sessions.scheduleLocked)return '<section class="fw-session-strip" aria-label="세력전 일정 잠금"><div><span class="fw-eyebrow">FACTION WAR</span><h3>세력전 일정 잠금</h3><p>매일 2회 랜덤 · 회차당 3시간 · 승점 미포함</p><p>클랜전 보완 및 새 모집 방식 검토 중입니다. 자동 개최와 전투 입장은 잠겨 있습니다.</p></div></section>';
 if(data.sessions.fixedSchedule){
  const s=data.sessions,at=s.active?s.current.endsAt:s.nextStartsAt,label=s.active?'세력전 진행 중':s.current?.status==='PAUSED'?'영토전으로 일시중단':'다음 세력전 대기';
  return '<section class="fw-session-strip" aria-label="세력전 고정 일정"><div><span class="fw-eyebrow">WEEKLY OPERATIONS · KST</span><h3>'+label+'</h3><p>화·목·토·일 20:00~22:00 (한국시간)</p><p>영토전 중 교전은 일시중단되며, 종료 시간은 22시로 유지됩니다.</p></div><div class="fw-session-times"><div><b>'+(s.active?'종료 시각':'다음 개전')+'</b><span>'+new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false})+'</span></div></div></section>';
 }
 return data.sessions.enabled?factionSessionStrip(data):'<section class="fw-session-strip"><div><span class="fw-eyebrow">CLAN OPERATIONS</span><h3>클랜 세력전 준비</h3><p>아직 시즌 시작 전입니다. 세력전·부대 편성·아지트 승급은 개방 전까지 잠겨 있습니다.</p></div></section>';}
function organizationRewardView(data){
 const reward=data.sessions.rules?.pigCoinReward,planned=data.policy?.pigCoinReward;
 const history=data.sessions.history||[];
 const pig=`<section class="fw-pig-reward" aria-label="피그코인 점령 보상"><h3>추가 점령 보상 · 피그코인</h3><p>${reward?.enabled?`회차 종료 시 <strong>${reward.requiredTerritories}개 이상</strong> 점령한 클랜의 해당 회차 참여자에게 <strong>피그코인 ${num(reward.amount)}개</strong>를 1회 지급합니다.`:reward?'이 회차는 피그코인 보상 OFF입니다.':'이전 규칙으로 시작한 회차에는 피그코인 보상을 소급 지급하지 않습니다.'}</p><p>메시지함에서 수령합니다. 진행 중 회차는 시작 당시 설정을 유지합니다.${planned?' 다음 회차 설정: '+(planned.enabled?`${planned.requiredTerritories}개 이상 · 피그코인 ${num(planned.amount)}개`:'OFF')+'.':''}</p>${history.length?`<ul>${history.map(h=>`<li>${esc(h.dayKey)} · ${h.myPigCoins?`<strong>피그코인 ${num(h.myPigCoins)}개</strong> · 메시지함 지급`:'피그코인 지급 없음'}</li>`).join('')}</ul>`:''}</section>`;
 return pig+factionRewardView(data).replace('3시간 종료 시점',data.sessions.fixedSchedule?'22시 종료 시점':'3시간 종료 시점').replaceAll('보상 조건 미충족','기본 보상 조건 미충족').replace(/시간당 징수세와 수동 분배는 폐지되었습니다[\s\S]*?자동 전환되지 않습니다\. /,'클랜자금은 공동 금고에 별도 정산됩니다. ');
}
function organizationTreasuryView(){
 const t=state.data.treasury,p=state.data.policy;
 return '<section class="fw-org-funds"><div><span class="fw-eyebrow">CLAN TREASURY</span><h2>클랜 공동 자금</h2><strong>'+num(t.funds)+'</strong><p>개인 코인과 별도로 보관하며 아지트 업그레이드에 사용합니다.</p></div><dl><div><dt>지역당 회차 수입</dt><dd>'+(p.fundsPerRegion===null?'CMS 설정 대기':num(p.fundsPerRegion)+' 클랜자금')+'</dd></div><div><dt>현재 아지트</dt><dd>'+t.stage+'단계</dd></div><div><dt>다음 단계 비용</dt><dd>'+(t.stage===5?'최고 단계':t.nextCost===null?'CMS 설정 대기':num(t.nextCost)+' 클랜자금')+'</dd></div></dl><a href="/organization/" target="_top">클랜 본부에서 아지트 확인 →</a></section>';
}
function treasuryView(){
  if(state.data.sessions)return organizationTreasuryView()+organizationRewardView(state.data);
  const d=state.data,owned=d.districts.filter(z=>z.owner===mine()&&mine()),n=d.roster.length;
  return `<section class="fw-treasury"><header class="fw-page-heading"><div><span class="fw-eyebrow">CLAN REVENUE</span><h2>상권 징수세</h2><p>점령한 지역의 수익을 클랜원과 함께 나눕니다.</p></div></header><div class="fw-treasury-layout"><section class="fw-vault">${icon('coin')}<span class="fw-eyebrow">분배 대기 중인 징수코인</span><strong>${num(d.tax.pool)}</strong><div class="fw-vault-summary"><span>점령 수익 <b>${compact(owned.length*R.taxPerHour)} / 시간</b></span><span>분배 대상 <b>${n}명</b></span><span>1인당 예상 <b>${compact(Math.floor(d.tax.pool/Math.max(1,n)))} 징수코인</b></span></div><button class="fw-primary" data-fw-collect ${!mine()||d.tax.pool<=0?'disabled':''}>${icon('coin')}클랜원에게 균등 분배</button><p>누구나 정산할 수 있으며, 현재 클랜원 전원에게 함께 지급됩니다.</p><div class="fw-my-wallet"><span>내 징수코인</span><b>${num(d.tax.balance)}</b></div></section><section class="fw-revenue-list"><div class="fw-section-title"><h3>우리 클랜 상권</h3><b>${owned.length}개 지역</b></div>${owned.map(z=>`<button data-fw-pick="${z.id}"><span>${icon('map')}<strong>${districtById(z.id).name}<small>${districtById(z.id).market}</small></strong></span><b>+${compact(R.taxPerHour)}<small>시간당</small></b></button>`).join('')||'<div class="fw-empty">아직 점령한 상권이 없습니다.<br>지도에서 공격대를 출정시켜 보세요.</div>'}</section></div>${(d.tax.pendingSeasons||[]).map(p=>`<div class="fw-past-tax"><span>시즌 ${p.seasonNo} 미정산 징수세 <b>${compact(p.pool)} 코인</b></span><button data-fw-past-collect="${p.seasonId}">당시 클랜원에게 분배</button></div>`).join('')}<p class="fw-explanation">징수코인은 일반 코인과 별도로 보관됩니다. 정규 클랜전 순위에 영향을 주지 않습니다. 시즌이 끝나면 새 수익 적립은 멈추고, 적립된 수익은 정산할 수 있습니다.</p></section>`;
}
function logView(){return `<section class="fw-log"><header class="fw-page-heading"><div><span class="fw-eyebrow">OPERATION HISTORY</span><h2>전황 기록</h2></div></header>${state.data.events.map(e=>`<article><span class="fw-log-icon">${icon(e.kind==='TAX'?'coin':['FORMATION','CAPTAINS','SQUAD_JOIN','SQUAD_LEAVE'].includes(e.kind)?'users':e.kind==='DEFENDED'?'shield':'sword')}</span><div><b>${esc(team(e.clanId)?.name||'클랜')} · ${{CAPTURE:'상권 점령',INVASION:'침공 시작',DEFENDED:'방어 성공',FORMATION:'부대 편성',SQUAD_JOIN:'자율참여 공격대 가입',SQUAD_LEAVE:'자율참여 공격대 탈퇴',MAP_RESET:'서울 전장 · 점령 초기화',REORGANIZED:(e.organizationCount===8?'8개 클랜 재편':'6개 클랜 재편'),CAPTAINS:'행동대장 임명·해제',ELDERS:'원로 지정·해제',COMMANDER:'원로 지정·해제',TAX:'징수세 분배'}[e.kind]||'작전'}</b><p>${e.districtId?historicalOrganizationDistrictById(e.districtId)?.name+' · ':''}${e.kind==='MAP_RESET'?'서울 25개 구 전체 무주지 전환':e.kind==='ELDERS'?esc(e.names?.join(' · ')||'지정 해제'):e.kind==='TAX'?`${num(e.amount)} 징수코인 · ${e.members}명 분배`:e.kind==='CAPTAINS'?`${SQUADS.filter(s=>s.role==='ATTACK').map(s=>s.name+' '+esc(e.names?.[s.id]||'미지정')).join(' · ')}`:['SQUAD_JOIN','SQUAD_LEAVE'].includes(e.kind)?esc(e.by)+' · '+esc(SQUADS.find(s=>s.id===e.squad)?.name||''):e.kind==='FORMATION'?`${e.squad?esc(SQUADS.find(s=>s.id===e.squad)?.name||'')+' · ':''}${esc(e.by||'원로')} 편성 저장`:e.by?esc(e.by)+' 출정':''}</p></div><time>${new Date(e.at).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></article>`).join('')||'<p class="fw-empty">아직 기록된 작전이 없습니다.</p>'}</section>`;}
function draw(){
  drawRoom();
  if(!state.root?.isConnected)return;
  if(state.mapDragging){state.mapDrawPending=true;return;}state.mapDrawPending=false;
  if(!state.data||!state.map){state.root.innerHTML=`<div class="fw-loading">${state.error?esc(state.error):'서울 전황을 불러오는 중입니다.'}<button data-fw-reload>다시 불러오기</button></div>`;bind();return;}
  const d=state.data,active=d.battles.filter(b=>b.status==='ACTIVE');
  state.root.innerHTML=`<section class="faction-war ${state.tab==='rankings'?'is-ranking':''}"><header class="fw-heading"><div class="fw-command-brand"><span class="fw-eyebrow">CLAN OPERATIONS</span><h2>세력전 <span>서울</span></h2></div><div class="fw-command-summary"><span>우리 상권 <b>${d.holdings}<small> / ${DISTRICTS.length}</small></b></span><span>격돌 <b>${active.length}<small>곳</small></b></span><span class="fw-round-state">${d.sessions?.scheduleLocked?'일정 잠금':d.sessions?.current?.status==='PAUSED'?'영토전 중 · 일시중단':factionCombatOpen(d)?'작전 진행 중':'작전 대기'}${d.sessions?.active&&d.sessions.current?.endsAt?'<small>종료까지 '+clock(d.sessions.current.endsAt)+'</small>':''}</span></div><details class="fw-operation-info"><summary>${d.sessions?.scheduleLocked?'일정 잠금 · 보상':'일정 · 보상'}</summary><div>${organizationSessionStrip(d)}<p>종료 시 ${d.sessions?.rules?.requiredTerritories??SESSION_RULES.requiredTerritories}개 이상 점령 · 1인당 ${compact(d.sessions?.rules?.coinPerRecipient??SESSION_RULES.coinPerRecipient)} 코인</p><button data-fw-tab="treasury">보상 상세 보기</button></div></details><button data-fw-leave class="fw-exit">본부로 돌아가기 ↗</button></header>
    <nav class="fw-tabs" aria-label="세력전 메뉴">${[['map','map','전황 지도'],['formation','users','부대 편성'],['treasury','coin','클랜자금 · 보상'],['rankings','shield','순위표'],['log','clock','전황 기록']].map(([id,i,label])=>`<button data-fw-tab="${id}" class="${state.tab===id?'active':''}" aria-current="${state.tab===id?'page':'false'}">${icon(i)}${label}</button>`).join('')}<button class="fw-reload" data-fw-reload aria-label="전황 새로고침">↻</button></nav>
    ${state.notice?`<div class="fw-notice" role="status">${esc(state.notice)}</div>`:''}${state.error?`<div class="fw-error" role="alert">${esc(state.error)}<button data-fw-reload>다시 확인</button></div>`:''}
    ${state.tab==='map'?`<div class="fw-mobile-select"><label>지역 선택<select data-fw-district-select>${DISTRICTS.map(z=>`<option value="${z.id}" ${z.id===state.selected?'selected':''}>${z.name} · ${team(d.districts.find(t=>t.id===z.id)?.owner)?.name||'무주지'}</option>`).join('')}</select></label></div><div class="fw-battlefield">${mapView()}${detailView()}</div>`:state.tab==='formation'?formationView():state.tab==='treasury'?treasuryView():state.tab==='rankings'?renderOrganizationRankings(d.competition,{mine:mine(),view:rankingView}):logView()}</section>`;
  bind();
  state.root.querySelectorAll('button,select').forEach(b=>{if(state.busy)b.disabled=true;});
  if(!factionCombatOpen(d))state.root.querySelectorAll('[data-fw-launch],[data-fw-enter]').forEach(b=>{b.disabled=true;});
}
function selectDistrict(id){if(state.selected!==id&&state.mapFocus==='selected')state.mapFocus='custom';state.selected=id;state.tab='map';draw();}
function bind(){
  const root=state.root;if(!root)return;
  root.querySelectorAll('[data-org-rank-view]').forEach(button=>button.onclick=()=>{rankingView=button.dataset.orgRankView;draw();});
  requestAnimationFrame(fitMapViewport);
  bindMapDrag(root.querySelector('.fw-seoul-map'));
  root.querySelectorAll('[data-fw-front]').forEach(b=>b.onclick=()=>{state.selected=b.dataset.fwFront;state.tab='map';focusMap('selected');});
  root.querySelectorAll('[data-fw-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.fwTab;state.notice='';draw();});
  root.querySelectorAll('[data-fw-zone],[data-fw-pick]').forEach(b=>{b.onclick=()=>selectDistrict(b.dataset.fwZone||b.dataset.fwPick);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.onclick();}};});
  root.querySelector('[data-fw-district-select]')?.addEventListener('change',e=>selectDistrict(e.target.value));
  root.querySelectorAll('[data-fw-zoom]').forEach(b=>b.onclick=()=>zoomMap(b.dataset.fwZoom));
  root.querySelectorAll('[data-fw-focus]').forEach(b=>{b.onclick=()=>focusMap(b.dataset.fwFocus);b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.onclick();}};});
  root.querySelector('[data-fw-show-detail]')?.addEventListener('click',()=>root.querySelector('.fw-detail')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));
  root.querySelectorAll('[data-fw-reload]').forEach(b=>b.onclick=()=>{state.edit=null;state.editBase=null;state.editCaptains=null;return refresh();});
  root.querySelectorAll('[data-fw-squad]').forEach(b=>b.onclick=()=>{state.squad=b.dataset.fwSquad;state.squadSelected=true;draw();});
  root.querySelectorAll('[data-fw-self-action]').forEach(b=>b.onclick=()=>action(b.dataset.fwSelfAction,{squad:b.dataset.fwSelfSquad,baseSquad:mySquad()}));
  root.querySelector('[data-fw-launch]')?.addEventListener('click',async()=>{const r=await action('launch',{districtId:state.selected,squad:state.squad});if(r?.battleId&&!r.captured&&mySide(battleAt(r.districtId)))await openBattleRoom(r.battleId);});
  root.querySelector('[data-fw-garrison]')?.addEventListener('click',()=>action('garrison',{districtId:state.selected,squad:root.querySelector('#fw-defense-select').value}));
  root.querySelector('[data-fw-save]')?.addEventListener('click',()=>{
    const d=state.data;
    if(d.mine?.isMaster){const captains=state.editCaptains||d.captains||Object.fromEntries(SQUADS.filter(s=>s.role==='ATTACK').map(s=>[s.id,0]));return state.edit&&!d.battles.some(b=>b.status==='ACTIVE'&&(b.attacker===mine()||b.defender===mine()))?action('formation',{formation:state.edit,baseFormation:state.editBase||d.formation,...(state.editCaptains?{captains}:{})}):action('captains',{captains});}
    if(d.mine?.canManageFormation)return action('formation',{formation:state.edit||d.formation,baseFormation:state.editBase||d.formation});
  });
  root.querySelectorAll('[data-fw-captain]').forEach(select=>select.onchange=()=>{
    state.editCaptains||=structuredClone(state.data.captains||{attack1:0,attack2:0});state.editCaptains[select.dataset.fwCaptain]=Number(select.value);draw();
    root.querySelector(`[data-fw-captain="${select.dataset.fwCaptain}"]`)?.focus();
  });
  root.querySelector('[data-fw-collect]')?.addEventListener('click',()=>action('collect',{seasonId:state.data.season.id}));
  root.querySelectorAll('[data-fw-past-collect]').forEach(b=>b.onclick=()=>action('collect',{seasonId:Number(b.dataset.fwPastCollect)}));
  root.querySelectorAll('[data-fw-enter]').forEach(b=>b.onclick=()=>openBattleRoom(b.dataset.fwEnter));
  root.querySelectorAll('[data-fw-add]').forEach(b=>b.onclick=()=>{const squad=root.querySelector('#fw-assign-squad').value;state.editBase||=structuredClone(state.data.formation);state.edit||=structuredClone(state.data.formation);if(state.edit[squad].length>=R.squadSize){state.notice=`부대당 최대 ${R.squadSize}명까지 편성할 수 있습니다.`;draw();return;}state.edit[squad].push(Number(b.dataset.fwAdd));draw();root.querySelector('#fw-assign-squad').value=squad;});
  root.querySelectorAll('[data-fw-remove]').forEach(b=>b.onclick=()=>{state.editBase||=structuredClone(state.data.formation);state.edit||=structuredClone(state.data.formation);const squad=b.dataset.fwRemoveSquad;state.edit[squad]=state.edit[squad].filter(v=>v!==Number(b.dataset.fwRemove));draw();});
}
async function refresh(preserveError=false){
  if(!state.ctx||state.busy)return;
  const sequence=++state.sequence;
  try{const [data,map]=await Promise.all([api('overview'),state.map||fetch('/organization/faction/districts-v1.json?v=20261015-boundaries2').then(r=>{if(!r.ok)throw Error('지도를 불러오지 못했습니다.');return r.json();})]);if(sequence!==state.sequence)return;const signature=JSON.stringify({...data,serverNow:0,sessions:data.sessions?{...data.sessions,current:data.sessions.current?{...data.sessions.current,remainingMs:0}:null}:null});const changed=signature!==state.signature||Boolean(state.error);state.signature=signature;state.data=data;if(!state.squadSelected){state.squad=SQUADS.find(s=>s.role==='ATTACK'&&data.formation[s.id]?.includes(data.userId))?.id||(data.mine?.isMaster?'attack1':'attack4');}state.map={...map,features:map.features.filter(f=>districtById(f.id))};if(!districtById(state.selected))state.selected=DISTRICTS[0].id;state.offset=data.serverNow-Date.now();if(!preserveError)state.error='';if(changed)draw();return data;}
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
    if(kind==='join-squad'){state.squad=result.squad;state.squadSelected=true;}
    state.notice=kind==='join-squad'?'자율참여 공격대에 가입했습니다. 전황 지도에서 출정할 지역을 선택하세요.':kind==='leave-squad'?'자율참여 공격대에서 탈퇴했습니다.':kind==='captains'?'행동대장 지정을 저장했습니다.':kind==='formation'?'부대 편성을 저장했습니다.':kind==='garrison'?'방어대를 배치했습니다.':kind==='enter'?'전투실에 입장했습니다. 내 덱으로 교전에 참여하세요.':kind==='collect'?`${result.members}명에게 총 ${num(result.total)} 징수코인을 분배했습니다. 내 몫 ${num(result.myAmount)}코인`:kind==='strike'?`상대 공유 HP −${num(result.damage)}${result.battleCompleted?' · 교전 종료':''}`:result.captured?`상권을 점령했습니다. ${ruleMinutes('protectionMs')} 점령 보호가 시작됩니다.`:'공격대가 출정했습니다. 양쪽 편성원이 직접 전투실에 입장해 참여합니다.';
    if(kind==='strike'&&result.battleV2&&!result.replayed){
      state.playing=true;state.room?.close();
      try{await playBattle(result);}finally{state.playing=false;if(state.room?.isConnected&&!state.room.open)state.room.showModal();}
    }
    return result;
  }catch(e){if(['STALE','SELF_FORMATION'].includes(e.code)){state.edit=null;state.editBase=null;state.editCaptains=null;}state.notice='';state.error=e.message||'요청을 처리하지 못했습니다. 다시 누르면 같은 요청으로 확인합니다.';}
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
export function mount(root,ctx){mountWarChat('faction',root);state.root=root;connect(ctx);draw();void refresh();}
export function view(){return '<div id="organizationFactionRoot" class="fw-root"></div>';}
export function select(id){state.selected=id;state.tab='map';}
export function connect(ctx){
  const userId=Number(ctx.userId||window.loadUser?.()?.serverUserId||window.loadUser?.()?.id||0);
  if(userId&&state.data&&state.data.userId!==userId){closeRoom();state.data=null;state.edit=null;state.editBase=null;state.editCaptains=null;state.error='';state.notice='';state.squadSelected=false;state.sequence++;document.querySelector('.fw-invasion-alert')?.remove();}
  state.ctx=ctx;
  if(!state.timer)state.timer=setInterval(()=>{if(document.hidden)return;for(const root of [state.root,state.room])root?.querySelectorAll('[data-fw-until]').forEach(n=>n.textContent=left(Number(n.dataset.fwUntil)));updateRoomAction();},1000);
  if(!state.alertTimer){state.alertTimer=setInterval(()=>poll(),8000);void poll();}
}
async function poll(){
  if(document.hidden||state.alertBusy||state.busy||state.mapDragging||!state.ctx)return;state.alertBusy=true;
  try{
    let data;
    if(state.room||(state.root?.isConnected&&(state.tab!=='formation'||!state.edit&&!state.editCaptains))){
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
  dialog.innerHTML=`<button class="fw-alert-close" aria-label="전투 알림 닫기">×</button><div class="fw-alert-symbol">${icon(attack?'sword':'shield')}</div><span class="fw-eyebrow">${attack?'SQUAD DEPLOYED':'INCOMING ATTACK'}</span><h2>${esc(a.districtName)} ${attack?'출정 알림':'침공 경보'}</h2><p><b>${esc(team(state.data?.battles.find(b=>b.id===a.id)?.attacker)?.name||a.attackerClan)}</b> 클랜의 <b>${esc(a.attackerName)}</b> 님이 ${attack?'공격을 시작했습니다.':'공격해 왔습니다.'}</p><div class="fw-alert-order">${attack?'공격대':'방어대'}에 편성되어 있습니다.<br>직접 전투실에 입장해 내 덱으로 참여하세요.</div><button class="fw-primary" data-fw-defend>${icon(attack?'sword':'shield')}${attack?'공격':'방어'} 전투 입장</button><button class="fw-alert-later">나중에 참여</button>`;
  document.body.append(dialog);const previous=document.activeElement;
  const close=()=>{remember();dialog.close();dialog.remove();previous?.focus?.();};
  dialog.querySelector('.fw-alert-close').onclick=close;dialog.querySelector('.fw-alert-later').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.querySelector('[data-fw-defend]').onclick=()=>{close();select(a.districtId);void openBattleRoom(a.id);};
  dialog.showModal();
}
window.OrganizationFaction={mount,view,connect,select};
