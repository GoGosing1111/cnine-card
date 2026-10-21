import {CITY_DISGUISE,cityDisplayName} from '../shared/jokgak-city-disguise-v1.mjs';
import {cityRole} from '../shared/jokgak-city-v1.mjs';
export {CITY_DISGUISE,cityDisplayName};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const timer=ms=>{const s=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
export const cityDisguiseArt=()=>'<span class="jc-disguise-art"><img src="/assets/ui/jokgak-city/disguise-v1/identity-768.webp" srcset="/assets/ui/jokgak-city/disguise-v1/identity-256.webp 256w, /assets/ui/jokgak-city/disguise-v1/identity-768.webp 768w" sizes="(max-width: 600px) 130px, 200px" width="768" height="768" alt="위장신분증" decoding="async" draggable="false"></span>';
const unusable=(m,now,busy)=>busy?'처리 중':!m?.active?'도시 입장 필요':m.deadUntil>now?'부활 후 사용':m.jailedUntil>now?'구금 해제 후 사용':m.nextActionAt>now?'행동 대기':null;
export function cityDisguiseStatus(state,now){
 const d=state?.mine?.disguise?.active;if(!d)return '';
 return `<section class="jc-disguise-status" aria-label="나의 위장 상태">${cityDisguiseArt()}<div><small>위장 중 · ${esc(cityRole(d.role).name)}</small><strong>${esc(d.nickname)}</strong><span>남은 시간 <b data-disguise-clock="${d.until}">${timer(d.until-now)}</b></span></div><button class="jc-disguise-button" data-city-desk="inventory">신분증 확인</button></section>`;
}
export function cityDisguiseShop(state,selected,now,busy){
 if(selected!=='MARKET')return '';
 const m=state?.mine,d=m?.disguise,blocked=unusable(m,now,busy)||m?.location!=='MARKET'&&'시장 이동 후 구매'||m?.restUntil>now&&'퇴실 후 구매'||m?.hospitalRequired&&'진료 후 구매'||m?.cash<CITY_DISGUISE.price&&'현금 부족'||d?.count>=CITY_DISGUISE.maxCount&&'보관 한도';
 return `<section class="jc-disguise-card" aria-label="시장 위장신분증">${cityDisguiseArt()}<div class="jc-disguise-copy"><small>MARKET / COVERT IDENTITY</small><h3>위장신분증</h3><p>현재 도시의 다른 참여자 한 명으로<br><b>닉네임과 직업을 함께 위장</b>합니다.</p><dl><div><dt>가격</dt><dd>3,000원</dd></div><div><dt>지속</dt><dd>30분</dd></div><div><dt>사용</dt><dd>회차당 2회</dd></div></dl><p class="jc-disguise-note">경찰 사용 불가 · 실제 직업 능력은 유지<br>대상은 무작위 · 소지품과 사용 횟수는 회차 종료 시 초기화</p><footer><span>보유 <b>${d?.count||0}개</b> · 사용 ${d?.uses||0} / 2</span><button class="jc-disguise-button" data-city-action="buy" data-city-product="DISGUISE_ID" ${blocked?'disabled':''}>${blocked||'3,000원 · 구매'}</button></footer></div></section>`;
}
export function cityDisguiseInventory(state,now,busy){
 const m=state?.mine;if(!m?.active)return '';
 const d=m.disguise||{count:0,uses:0,remainingUses:2,active:null},blocked=unusable(m,now,busy)||m.role==='POLICE'&&'경찰 사용 불가'||d.uses>=2&&'이번 회차 사용 완료'||!d.count&&'보유 신분증 없음';
 const identity=d.active?`<p class="jc-disguise-identity"><small>현재 위장</small><b>${esc(d.active.nickname)}</b><span>${esc(cityRole(d.active.role).name)} · <b data-disguise-clock="${d.active.until}">${timer(d.active.until-now)}</b> 남음</span></p>`:'<p>사용하면 다른 도시 참여자의 닉네임·직업으로 30분간 위장합니다.</p>';
 return `<section class="jc-disguise-card jc-disguise-inventory" aria-label="위장신분증 인벤토리">${cityDisguiseArt()}<div class="jc-disguise-copy"><small>COVERT IDENTITY / INVENTORY</small><h3>위장신분증 <em>${d.count}개</em></h3>${identity}<p>이번 회차 <b>${d.uses} / 2회</b> 사용 · 남은 횟수 ${d.remainingUses}회</p><p class="jc-disguise-note">경찰 사용 불가 · 실제 직업 능력은 유지<br>${d.active?'다시 사용하면 위장 대상과 30분이 새로 적용됩니다.':'다른 참여자가 없으면 아이템을 소모하지 않습니다.'}</p><footer><button class="jc-disguise-button" data-city-market>시장으로</button><button class="jc-disguise-button" data-city-action="use" data-city-product="DISGUISE_ID" ${blocked?'disabled':''}>${blocked||'신분증 1개 사용'}</button></footer></div></section>`;
}
export function cityDisguiseReceipt(service,now){
 const d=service.disguise,a=d.active;
 return `<div class="jc-disguise-card jc-disguise-result">${cityDisguiseArt()}<div class="jc-disguise-copy"><small>${service.action==='buy'?'PURCHASE COMPLETE':'IDENTITY CHANGED'}</small><h3>${service.action==='buy'?'위장신분증 1개 구매':'위장 완료'}</h3>${service.action==='buy'?`<p>인벤토리에 보관했습니다. 보유 <b>${d.count}개</b></p><p>현금 3,000원 사용 · 잔액 ${Number(service.cash.after).toLocaleString('ko-KR')}원</p>`:`<p class="jc-disguise-identity"><b>${esc(a?.nickname)}</b><span>${esc(cityRole(a?.role).name)} · <b data-disguise-clock="${a?.until}">${timer((a?.until||now)-now)}</b></span></p><p>이번 회차 ${d.uses} / 2회 사용</p><p>30분 뒤 원래 닉네임과 직업 표시로 돌아옵니다.</p>`}</div></div>`;
}
