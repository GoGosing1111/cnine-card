import {CITY_SUPPLIES,defaultCityLifePolicy} from '../shared/jokgak-city-life-v1.mjs';
import {cityItemArt} from './jokgak-city-item-art-v1.mjs?v=20261011-items1';
export {cityItemArt};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n||0).toLocaleString('ko-KR');
export const deathClock=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
export function cityCondition(m,now){
  if(!m?.active)return {label:'미입장',tone:'idle'};
  if(m.deadUntil>now)return {label:'사망 · 부활 '+deathClock(m.deadUntil-now),tone:'danger'};
  if(m.restUntil>now)return {label:'모텔 휴식 · '+deathClock(m.restUntil-now),tone:'safe'};
  if(m.jailedUntil>now)return {label:'구금 · '+deathClock(m.jailedUntil-now),tone:'danger'};
  if(m.hospitalRequired)return {label:'응급 진료 필요',tone:'danger'};
  if(m.protectedUntil>now)return {label:'교전 보호 · '+Math.ceil((m.protectedUntil-now)/1000)+'초',tone:'safe'};
  if((m.hunger??100)<=30)return {label:'배고픔 · 식사 필요',tone:'warning'};
  if(m.nextActionAt>now)return {label:'행동 대기 · '+Math.ceil((m.nextActionAt-now)/1000)+'초',tone:'idle'};
  return {label:'활동 가능',tone:'safe'};
}
export function cityProfile(state,now,icon,role,locationName,busy){
  const m=state?.mine,condition=cityCondition(m,now);
  if(!m?.active)return `<section class="jc-profile jc-profile-await" aria-label="나의 도시 프로필"><div class="jc-profile-emblem">${icon('person')}</div><div><small>나의 도시 프로필</small><h2>${esc(m?.nickname||'도시 입장 대기')}</h2><p>${m?.role?`이번 직업: ${esc(role.name)} · 다음 6시간 교대 전까지 유지`:`입장하면 이번 교대의 직업과 내 생활 상태가 표시됩니다.`}</p></div><button class="jc-primary" data-city-action="join" ${busy?'disabled':''}>도시 입장${icon('arrow')}</button></section>`;
  return `<section class="jc-profile" aria-label="나의 도시 프로필" style="--role:${role.color}"><header class="jc-profile-heading"><span>나의 도시 프로필 <small>CITIZEN RECORD</small></span><b data-city-condition data-tone="${condition.tone}">${condition.label}</b></header><div class="jc-profile-body"><div class="jc-profile-person"><div class="jc-profile-id"><span class="jc-profile-emblem">${icon(role.icon)}</span><div><small>이번 교대의 나</small><h2>${esc(m.nickname)}</h2><span class="jc-profile-job">${esc(role.name)}</span><span class="jc-profile-location">${icon('target')}${esc(locationName)}</span></div></div><p>${esc(role.detail)}</p><div class="jc-profile-wanted"><span>수배 단계</span><b aria-label="수배 ${m.wanted}단계"><em>${'★'.repeat(m.wanted)}</em>${'☆'.repeat(5-m.wanted)}</b><span data-city-action-clock></span></div></div>${cityNeeds(state,now,icon)}</div></section>`;
}
export function cityTheftHtml(theft,defending=false){
  if(!theft||theft.status==='DISABLED')return '';
  const delta=defending?-theft.actorChange:theft.actorChange;
  const reasons={DRAW:'무승부 · 현금 이동 없음',NO_CASH:'패자의 소지 현금 없음',WALLET_LIMIT:'승자의 현금 보유 한도 도달',ZERO:'강탈할 현금이 1원 미만이거나 한도 0원'};
  return `<div class="jc-theft ${delta<0?'is-loss':''}" role="status"><span>${theft.mode==='TEST'?'TEST · ':''}${delta>0?'상대 현금 강탈':delta<0?'상대에게 현금 강탈당함':'현금 정산'}</span><strong>${delta>0?'+':delta<0?'−':''}${number(theft.amount)}<small>원</small></strong><p>${theft.killBonusPercent?'갱단 처치 보너스 · ':''}${theft.amount?`패자 소지 현금의 ${theft.percent}% · 1회 최대 ${number(theft.maxCash)}원`:reasons[theft.status]||'현금 이동 없음'}</p></div>`;
}
export function cityRoleSkill(state,now,busy,icon,role){
  const m=state?.mine;if(!m?.active)return '';
  if(m.role==='GANG')return `<section class="jc-role-skill jc-gang-skill"><span>${icon('swords')}</span><div><small>갱단 · 처치 특성</small><b>상대를 쓰러뜨리면 더 크게 챙깁니다</b><p>처치 시 소지 현금 ${Math.min(100,(state.cash?.theft?.percent||0)+role.killTheftBonusPercent)}% 강탈 · 최대 ${number(Math.max(state.cash?.theft?.maxCash||0,role.killTheftMaxCash))}원${state.cash?.theft?.enabled?'':' · 현재 강탈 OFF'}</p></div></section>`;
  if(m.role!=='BEGGAR')return '';
  const locked=busy||!role.begEnabled||m.restUntil>now||m.nextActionAt>now||m.deadUntil>now||m.jailedUntil>now||m.hospitalRequired;
  return `<section class="jc-role-skill"><span>${icon('bag')}</span><div><small>거지 전용 스킬</small><b>구걸 · 동냥</b><p>${m.begging?.endsAt>now?'이곳 사람들에게 도움을 요청하고 있습니다.':`같은 장소 사람들에게 ${number(role.begCash)}원을 부탁합니다. · 대기 ${role.begCooldownMs/1000}초`}</p></div><div class="jc-beg-actions"><button data-city-action="beg" ${locked?'disabled':''}>구걸하기</button><button data-city-action="alms" ${locked?'disabled':''}>동냥하기</button></div></section>`;
}
export function cityBeggingOffers(state,now,busy,icon){
  const m=state?.mine;if(!m?.active||m.restUntil>now||m.deadUntil>now||m.jailedUntil>now||m.hospitalRequired)return '';
  const offers=(state.beggingOffers||[]).filter(o=>o.endsAt>now&&o.location===m.location);
  return offers.map(o=>`<article class="jc-beg-toast" data-beg-offer="${esc(o.requestId)}" data-beg-until="${o.endsAt}" aria-label="${esc(o.actorName)}의 동냥"><header><span>${icon('bag')}${o.action==='beg'?'구걸':'동냥'} 중</span><small data-beg-clock>${Math.max(0,Math.ceil((o.endsAt-now)/1000))}초</small></header><p><b>${esc(o.actorName)}</b> 님이 ${o.action==='beg'?'구걸':'동냥'} 중이에요.</p><small>${number(o.cash)}원만 도와줄까?${o.mode==='TEST'?' · 테스트 현금':''}</small><footer><button data-city-donate="${esc(o.requestId)}" ${busy||m.nextActionAt>now||m.cash<o.cash?'disabled':''}>${m.cash<o.cash?'현금 부족':`준다 · ${number(o.cash)}원`}</button><button data-city-decline="${esc(o.id)}" ${busy?'disabled':''}>말까</button></footer></article>`).join('');
}
export function cityDeathScreen(mine,now){
  if(!(mine?.deadUntil>now))return '';
  return `<section class="jc-death-screen" aria-label="사망 후 병원 부활 대기"><span class="jc-death-index">JOKGAK CITY / EMERGENCY</span><div class="jc-death-cross">＋</div><h2>사망했습니다</h2><p><b>${esc(mine.death?.killerName||'알 수 없는 상대')}</b> 님에게 처치되었습니다.</p><strong data-death-clock>${deathClock(mine.deadUntil-now)}</strong><span class="jc-death-track"><i data-death-track style="width:${Math.min(100,(mine.deadUntil-now)/1800)}%"></i></span><footer><span>부활 장소 <b>병원</b></span><small>3분 대기 후 자동 부활 · 도시 체력·건강 회복</small></footer></section>`;
}
export function cityNeeds(state,now,icon){
  const m=state?.mine;if(!m?.active)return '';
  const cfg=state.life||defaultCityLifePolicy(),dead=m.deadUntil>now;
  const meters=[['health','전투 체력',m.health,'swords',25,m.maxHealth||100,dead?'병원 부활 대기':'의료진 치료로 회복'],['hunger','포만감',m.hunger??100,'meal',30,100,(m.hunger??100)<=30?'배고픔 · 식당에서 식사':'낮을수록 배고픔'],['wellness','건강',m.wellness??100,'cross',cfg.hospitalThreshold,100,m.hospitalRequired?'응급 · 병원 진료 필요':'병원 진료로 회복']];
  return `<section class="jc-needs" aria-label="도시 현금과 생활 상태"><div class="jc-cash"><span>${icon('cash')}<b>${state.mode==='TEST'?'테스트 현금':'보유 현금'}</b><small>족각도시 전용</small></span><strong data-city-cash>${number(m.cash)}<em>원</em></strong></div>${meters.map(([key,label,value,symbol,low,max,hint])=>`<div class="jc-need ${key==='health'?'jc-vitals ':''}${value<=low?'is-low':''}" data-need="${key}"><span>${icon(symbol)}${label}<b>${value}<small>/${max}</small></b></span><i><em style="width:${Math.max(0,Math.min(100,value/max*100))}%"></em></i><p>${hint}</p></div>`).join('')}<div class="jc-needs-shortcuts"><button data-city-place="RESTAURANT" ${dead?'disabled':''}>${icon('meal')}식당 찾기</button><button data-city-place="HOSPITAL" ${dead?'disabled':''}>${icon('cross')}병원 찾기</button></div>${m.hospitalRequired?'<div class="jc-health-alert" role="status"><b>건강 악화로 병원에 이송되었습니다.</b> 진료를 받거나 소지품으로 건강을 회복하세요.</div>':''}</section>`;
}
const gains=p=>[['hunger','포만감'],['wellness','건강'],['health','체력']].filter(([k])=>p[k]).map(([k,n])=>`${n} +${p[k]}`).join(' · ');
export function cityServices(state,selected,now,busy,icon){
  if(!['SHOP','RESTAURANT','HOSPITAL'].includes(selected))return '';
  const cfg=state?.life||defaultCityLifePolicy(),m=state?.mine,here=m?.active&&m.location===selected;
  const locked=busy||!here||m.deadUntil>now||m.jailedUntil>now||m.nextActionAt>now;
  const test=state?.mode==='TEST',title=selected==='SHOP'?'도시 보급 상점':selected==='RESTAURANT'?'오늘의 따뜻한 한 끼':'병원 진료 접수';
  const rows=selected==='SHOP'?cfg.supplies.map(p=>({...p,...CITY_SUPPLIES.find(s=>s.code===p.code),action:'buy'})):[{...(selected==='RESTAURANT'?cfg.meal:cfg.treatment),code:'',name:selected==='RESTAURANT'?'든든한 정식':'회복 진료',icon:selected==='RESTAURANT'?'meal':'cross',description:selected==='RESTAURANT'?'지친 하루를 채우는 따뜻한 식사':'도시 체력과 생활 건강을 함께 회복',action:selected==='RESTAURANT'?'eat':'treat'}];
  return `<section class="jc-services${selected==='SHOP'?'':' is-single'}" aria-label="${title}">
    <header><span>${selected==='SHOP'?'SUPPLIES':selected==='RESTAURANT'?'NIGHT DINER':'MEDICAL CENTER'}</span><h3>${title}</h3></header>
    <div class="jc-service-list">${rows.map(p=>`<article class="jc-service">
      ${cityItemArt(p.code||(p.action==='eat'?'SET_MEAL':'TREATMENT'))}
      <div class="jc-service-copy"><b>${p.name}</b><p>${p.description}</p><strong>${gains(p)}</strong><small class="jc-service-price">${number(p.price)}원${test?'<em>테스트 현금</em>':''}</small></div>
      <button data-city-action="${p.action}" ${p.code?`data-city-product="${p.code}"`:''} ${locked||!p.enabled||here&&m.cash<p.price?'disabled':''}>${!p.enabled?'이용 중지':!here?'이동 후 이용':m.cash<p.price?'현금 부족':p.action==='buy'?'구매':p.action==='eat'?'식사':'진료'}</button>
    </article>`).join('')}</div>
    <p class="jc-service-foot">${test?'TEST 현금·소지품은 정식 운영으로 이전되지 않습니다.':'병원·식당·상점은 도시 현금으로 결제합니다.'}</p></section>`;
}
export function cityBag(state,now,busy,icon){
  const m=state?.mine;if(!m?.active)return '';
  const cfg=state.life||defaultCityLifePolicy(),owned=CITY_SUPPLIES.filter(p=>(m.bag?.[p.code]||0)>0);
  return `<section class="jc-bag"><header><h3>${icon('bag')}도시 소지품</h3><button data-city-place="SHOP">상점 찾기 ↗</button></header>${owned.length?`<div>${owned.map(p=>{const config=cfg.supplies.find(x=>x.code===p.code);return `<article>${cityItemArt(p.code,true)}<span><b>${p.name} <em>×${m.bag[p.code]}</em></b><small>${gains(config)}</small></span><button data-city-action="use" data-city-product="${p.code}" ${busy||m.deadUntil>now||m.jailedUntil>now||m.nextActionAt>now||!config.enabled?'disabled':''}>사용</button></article>`;}).join('')}</div>`:'<p>상점에서 도시락·비타민·구급품을 구매해 휴대하세요.</p>'}</section>`;
}
