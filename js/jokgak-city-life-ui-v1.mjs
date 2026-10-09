import {CITY_SUPPLIES,defaultCityLifePolicy} from '../shared/jokgak-city-life-v1.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>Number(n||0).toLocaleString('ko-KR');
export const deathClock=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
export function cityDeathScreen(mine,now){
  if(!(mine?.deadUntil>now))return '';
  return `<section class="jc-death-screen" aria-label="사망 후 병원 부활 대기"><span class="jc-death-index">JOKGAK CITY / EMERGENCY</span><div class="jc-death-cross">＋</div><h2>사망했습니다</h2><p><b>${esc(mine.death?.killerName||'알 수 없는 상대')}</b> 님에게 처치되었습니다.</p><strong data-death-clock>${deathClock(mine.deadUntil-now)}</strong><span class="jc-death-track"><i data-death-track style="width:${Math.min(100,(mine.deadUntil-now)/1800)}%"></i></span><footer><span>부활 장소 <b>병원</b></span><small>3분 대기 후 자동 부활 · 도시 체력·건강 회복</small></footer></section>`;
}
export function cityNeeds(state,now,icon){
  const m=state?.mine;if(!m?.active)return '';
  const cfg=state.life||defaultCityLifePolicy(),dead=m.deadUntil>now;
  const meters=[['hunger','포만감',m.hunger??100,'meal',30,'배고픔은 식사로 회복'],['wellness','건강',m.wellness??100,'cross',cfg.hospitalThreshold,'건강은 병원에서 회복']];
  return `<section class="jc-needs" aria-label="배고픔과 건강 상태">${meters.map(([key,label,value,symbol,low,hint])=>`<div class="jc-need ${value<=low?'is-low':''}" data-need="${key}"><span>${icon(symbol)}${label}<b>${value}<small>/100</small></b></span><i><em style="width:${value}%"></em></i><p>${value<=low?(key==='hunger'?'배가 고픕니다 · 식당에서 식사하세요':'응급 상태 · 병원 진료가 필요합니다'):hint}</p></div>`).join('')}<div class="jc-needs-shortcuts"><button data-city-place="RESTAURANT" ${dead?'disabled':''}>${icon('meal')}식당 찾기</button><button data-city-place="HOSPITAL" ${dead?'disabled':''}>${icon('cross')}병원 찾기</button></div>${m.hospitalRequired?'<div class="jc-health-alert" role="status"><b>건강 악화로 병원에 이송되었습니다.</b> 진료를 받거나 소지품으로 건강을 회복하세요.</div>':''}</section>`;
}
const gains=p=>[['hunger','포만감'],['wellness','건강'],['health','체력']].filter(([k])=>p[k]).map(([k,n])=>`${n} +${p[k]}`).join(' · ');
export function cityServices(state,selected,now,busy,icon){
  if(!['SHOP','RESTAURANT','HOSPITAL'].includes(selected))return '';
  const cfg=state?.life||defaultCityLifePolicy(),m=state?.mine,here=m?.active&&m.location===selected;
  const locked=busy||!here||m.deadUntil>now||m.jailedUntil>now||m.nextActionAt>now;
  const test=state?.mode==='TEST',title=selected==='SHOP'?'도시 보급 상점':selected==='RESTAURANT'?'오늘의 따뜻한 한 끼':'병원 진료 접수';
  const rows=selected==='SHOP'?cfg.supplies.map(p=>({...p,...CITY_SUPPLIES.find(s=>s.code===p.code),action:'buy'})):[{...(selected==='RESTAURANT'?cfg.meal:cfg.treatment),code:'',name:selected==='RESTAURANT'?'든든한 정식':'회복 진료',icon:selected==='RESTAURANT'?'meal':'cross',description:selected==='RESTAURANT'?'지친 하루를 채우는 따뜻한 식사':'도시 체력과 생활 건강을 함께 회복',action:selected==='RESTAURANT'?'eat':'treat'}];
  return `<section class="jc-services" aria-label="${title}"><header><span>${selected==='SHOP'?'SUPPLIES':selected==='RESTAURANT'?'NIGHT DINER':'MEDICAL CENTER'}</span><h3>${title}</h3></header>${rows.map(p=>`<article class="jc-service"><span class="jc-service-icon">${icon(p.icon)}</span><div><b>${p.name}</b><p>${p.description}</p><strong>${gains(p)}</strong><small>${number(p.price)} 코인${test?' · TEST 차감 없음':''}</small></div><button data-city-action="${p.action}" ${p.code?`data-city-product="${p.code}"`:''} ${locked||!p.enabled?'disabled':''}>${!p.enabled?'이용 중지':!here?'이동 후 이용':p.action==='buy'?'구매':p.action==='eat'?'식사':'진료'}</button></article>`).join('')}<p class="jc-service-foot">${test?'TEST 소지품은 정식 운영으로 이전되지 않습니다.':'가격 확인 후 이용 시 코인이 차감됩니다.'}</p></section>`;
}
export function cityBag(state,now,busy,icon){
  const m=state?.mine;if(!m?.active)return '';
  const cfg=state.life||defaultCityLifePolicy(),owned=CITY_SUPPLIES.filter(p=>(m.bag?.[p.code]||0)>0);
  return `<section class="jc-bag"><header><h3>${icon('bag')}도시 소지품</h3><button data-city-place="SHOP">상점 찾기 ↗</button></header>${owned.length?`<div>${owned.map(p=>{const config=cfg.supplies.find(x=>x.code===p.code);return `<article>${icon(p.icon)}<span><b>${p.name} <em>×${m.bag[p.code]}</em></b><small>${gains(config)}</small></span><button data-city-action="use" data-city-product="${p.code}" ${busy||m.deadUntil>now||m.jailedUntil>now||m.nextActionAt>now||!config.enabled?'disabled':''}>사용</button></article>`;}).join('')}</div>`:'<p>상점에서 도시락·비타민·구급품을 구매해 휴대하세요.</p>'}</section>`;
}
