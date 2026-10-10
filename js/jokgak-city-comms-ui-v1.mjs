import {CITY_MEGAPHONE} from '../shared/jokgak-city-comms-v1.mjs';
export {CITY_MEGAPHONE};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const art='/assets/ui/jokgak-city/megaphone-v1/megaphone-256.webp';
const actions={join:'도시 입장',leave:'도시 퇴장',move:'장소 이동',attack:'교전',arrest:'체포',inspect:'검문',heal:'치료',eat:'식사',treat:'병원 진료',buy:'소지품 구매',use:'소지품 사용',buyWeapon:'무기 구매',equipWeapon:'무기 장착',unequipWeapon:'무기 해제',beg:'구걸',alms:'동냥 요청',donate:'동냥',rest:'모텔 입실',checkout:'모텔 퇴실',employment:'취직',workStart:'근무 시작',workFinish:'근무 완료',workCancel:'근무 취소',buyMegaphone:'확성기 구매',broadcast:'도시 방송'};
export function cityCommsToolbar(state,saving=false){return `<div class="jc-comms-tools"><button data-city-desk="logs">활동 로그 <b>${state?.unreadCount||0}</b></button><button data-city-desk="broadcast"><img src="${art}" alt="">확성기 <b>${state?.mine?.megaphoneCount||0}</b></button><label><input type="checkbox" data-city-hide-popups ${state?.noticePreferences?.hidePopups?'checked':''} ${saving?'disabled':''}>피격·행동 팝업 안 보기</label></div>`;}
export function cityMegaphoneShop(state,selected,busy){
 if(selected!=='MARKET')return '';
 const m=state?.mine,disabled=busy||!m?.active||m.location!=='MARKET'||m.deadUntil||m.hospitalRequired||m.cash<500||m.megaphoneCount>=99;
 return `<section class="jc-megaphone-shop"><div class="jc-megaphone-art"><img src="/assets/ui/jokgak-city/megaphone-v1/megaphone-768.webp" alt="도시 확성기" width="768" height="768"></div><div><small>CITY FREQUENCY / 500원</small><h3>도시에 목소리를 전하세요</h3><p>확성기 1개로 지도에 메시지 1회 방송.<br>최대 100자 · 사용 간격 15초</p><button class="jc-primary" data-city-action="buyMegaphone" ${disabled?'disabled':''}>확성기 구매 · 500원</button><span>보유 ${m?.megaphoneCount||0}개 · 교대 종료 시 소멸</span></div></section>`;
}
export function cityBroadcastComposer(state,draft,busy,now){
 const m=state?.mine,wait=Math.max(0,Math.ceil(((m?.megaphoneNextAt||0)-now)/1000)),disabled=busy||!m?.active||!m.megaphoneCount||m.deadUntil||m.hospitalRequired||m.restUntil>now||m.jailedUntil>now||wait;
 return `<section class="jc-broadcast-compose"><div class="jc-broadcast-heading"><img src="${art}" alt="도시 확성기"><div><small>JOKGAK CITY / ON AIR</small><h3>도시 전체 방송</h3><p>보유 <b>${m?.megaphoneCount||0}개</b> · 전송 시 1개 소모</p></div></div><label for="jc-broadcast-message">지도에 보낼 메시지</label><textarea id="jc-broadcast-message" data-city-broadcast-text rows="4" placeholder="도시 사람들에게 전할 말을 입력하세요." ${busy?'disabled':''}>${esc(draft)}</textarea><div class="jc-broadcast-compose-foot"><span data-city-message-count>${Array.from(draft).length} / 100자</span><button class="jc-primary" data-city-send-broadcast ${disabled?'disabled':''}>${wait?wait+'초 후 방송':'확성기 사용 · 전송'}</button></div><p class="jc-muted">메시지는 지도 위에 순서대로 표시됩니다. 확성기와 방송 기록은 이번 교대가 끝나면 사라집니다.</p><button data-city-market>시장 상점 보기 ↗</button><p role="status" data-city-comms-message></p></section>`;
}
export function cityBroadcastMarkup(message,now){
 if(!message)return '';
 const elapsed=Math.max(0,now-message.shownAt);
 return `<div class="jc-airwave" data-broadcast-id="${esc(message.id)}" style="--elapsed:-${elapsed}ms"><div class="jc-airwave-signal"><i></i><i></i><i></i><img src="${art}" alt=""></div><div class="jc-airwave-copy"><header><small>도시 방송 <em>ON AIR</em></small><b>${esc(message.senderName)}</b></header><p>${esc(message.message)}</p></div><div class="jc-airwave-time"></div></div>`;
}
export function cityActivityPanel(log,busy=false){
 const header='<div class="jc-log-heading"><div><small>CURRENT SHIFT / CITY LOG</small><h3>이번 교대의 활동 기록</h3><p>팝업을 꺼도 기록은 남습니다. 교대 종료 시 모두 삭제됩니다.</p></div><div><button data-city-log-refresh>새로고침</button><button data-city-notice-skip-all>팝업 전체 스킵</button></div></div>';
 if(log?.error)return header+`<p role="alert">${esc(log.error)}</p>`;
 if(!log)return header+'<p class="jc-muted">기록을 불러오고 있습니다…</p>';
 return header+`<ol class="jc-activity-list">${log.items.length?log.items.map(row=>{
  const incoming=row.direction==='received',title=actions[row.action]||'도시 행동',clock=new Date(row.createdAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}),who=incoming?row.actorName:row.targetName;
  const outcome=['attack','arrest'].includes(row.action)?row.winner==='DRAW'?'무승부':row.winner===(incoming?'B':'A')?'승리':'패배':'';
  return `<li class="${incoming?'is-incoming':''}"><time>${clock}</time><div><header><small>${incoming?'받은 알림':'내 활동'}</small><b>${esc(title)} ${outcome}</b>${incoming&&!row.read?'<em>미확인</em>':''}</header>${who?`<p>${esc(who)}</p>`:''}${row.comms?.message?`<blockquote>${esc(row.comms.message)}</blockquote>`:''}${row.theft?.amount?`<p>현금 ${Number(row.theft.amount).toLocaleString('ko-KR')}원 이동</p>`:''}${row.comms?.price?`<p>${row.comms.price}원 · 확성기 1개 구매</p>`:''}${row.health!=null?`<span>행동 후 체력 ${Number(row.health)}</span>`:''}</div></li>`;
 }).join(''):'<li class="jc-log-empty">이번 교대의 활동 기록이 없습니다.</li>'}</ol>${log.next?`<button class="jc-log-more" data-city-log-more ${busy?'disabled':''}>${busy?'불러오는 중…':'이전 기록 더 보기'}</button>`:''}`;
}
