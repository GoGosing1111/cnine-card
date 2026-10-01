import {jointAccountRequest} from '/js/joint-account-transport.mjs';
import {COOP_DIFFICULTIES,COOP_RULES,COOP_VERSION,COOP_ENCOUNTER,COOP_STAGES} from '/shared/cooperative-battleground-v1.mjs?v=20261002-arke-v2';
import {mountCoopBattle} from './battle.mjs?v=20261002-arke-v2';
import {coopCombatSummary} from '/shared/cooperative-settings-v1.mjs?v=20261002-cms1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>Math.round(v||0).toLocaleString('ko-KR');
const uniqueText=c=>c.uniqueAbility?([['공격','attackPercent'],['방어','defensePercent'],['체력','hpPercent'],['속도','speedPercent']].filter(([,k])=>c.uniqueAbility[k]).map(([label,k])=>label+' '+(c.uniqueAbility[k]>0?'+':'')+c.uniqueAbility[k]+'%').join(' · ')||'고유효과 적용'):'고유효과 없음';
let styles;
function loadStyles(){return styles||=new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/raid/cooperative/style.css?v='+COOP_VERSION;link.onload=resolve;link.onerror=()=>{styles=null;reject(Error('격전지 화면을 불러오지 못했습니다.'));};document.head.append(link);});}
const shield='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m7 12 3 3 7-7"/></svg>';
const GUIDE=[
 ['3단계 돌파전','<p><b>세 명이 편성한 9캐릭터로 세 구역을 연속 격파합니다.</b> 전체 제한 시간은 3분입니다.</p><ol><li><b>1단계 · 제련소 외곽:</b> 근접 공격을 하는 용철 추적자 2기와 원거리 연사형 불씨 감시기 1기를 모두 처치하세요.</li><li><b>2단계 · 노심 관문:</b> 준보스 노심 수문장이 나타납니다. 최대 체력의 30% 방벽을 깨고 연속 공격을 버티세요. 보호와 회복이 있으면 마지막 구간의 생존을 확보하기 쉽습니다.</li><li><b>3단계 · 심층 노심:</b> 최종 보스 삼핵 거신 아르케가 등장합니다. 평타·스킬은 자동으로 진행되며, 화면에 뜨는 차단·엄폐·교란은 각자 직접 눌러야 합니다.</li></ol><p><b>앞 단계의 적을 전부 처치해야 다음 단계가 열립니다.</b> 체력·방벽·스킬 대기 시간은 이어지며, 단계 전환으로 회복하거나 쓰러진 캐릭터가 부활하지 않습니다. 일반 몬스터와 준보스만 잡고 시간이 끝나면 패배입니다.</p>'],
 ['아르케 공략','<p><b>평타와 용병 스킬은 자동, 거신의 특수 공격은 직접 대응합니다.</b> 최종 보스가 등장한 뒤 10초부터 30초 간격으로 삼핵 차단과 집중 포화가 번갈아 나옵니다. 일반은 9초, 격전은 8초, 극한은 7초 안에 대응하세요.</p><ol><li><b>삼핵 차단:</b> 각자 화면의 <b>내 노심 차단</b>을 한 번 누르세요. 생존한 분대가 모두 차단하면 거신 최대 체력의 8%를 깎습니다. 하나라도 놓치면 아군 전원이 최대 체력의 12% / 18% / 24% 피해를 받습니다. 방벽은 피해를 흡수할 수 있습니다.</li><li><b>집중 포화:</b> 표적 분대에는 <b>내 분대 엄폐</b>, 나머지에는 <b>조준 교란</b>이 표시됩니다. 엄폐하면 기본 피해의 75%를 줄입니다. 교란 1명마다 추가로 25%씩 줄여 두 명이 돕는 것이 가장 안전합니다. 기본 피해는 표적 분대 각 캐릭터 최대 체력의 40% / 50% / 60%입니다.</li><li><b>확인 표시:</b> 버튼을 누른 뒤 내 분대에 체크가 켜지면 접수 완료입니다. 남은 시간을 계속 보여주며, 판정 시 모두 같은 성공·실패와 체력 변화를 봅니다. 다른 분대의 버튼을 대신 누를 수 없습니다.</li></ol><p>색뿐 아니라 <b>내 담당 행동·분대 이름·체크 표시</b>를 함께 확인하세요. 이탈하거나 전멸한 분대에는 행동을 요구하지 않습니다.</p>'],
 ['처음 출전한다면','<ol><li><b>한 명이 대기방을 만듭니다.</b> 일반·격전·극한 중 난이도를 고르고 대기방 코드를 나머지 두 명에게 알려주세요.</li><li><b>같은 코드로 3명이 입장합니다.</b> 각자 보유한 용병 1명과 서로 다른 일반 카드 2장을 고릅니다. 한 사람당 슈퍼스타는 1장까지 가능합니다.</li><li><b>편성 저장 → 출전 준비.</b> 세 명의 준비가 끝나면 편성이 잠깁니다. 전장 로딩이 끝난 뒤 3초를 함께 세고 출전합니다.</li><li><b>9명이 한 전장에서 싸웁니다.</b> 같은 보스 체력·공격·처치 결과를 모두 함께 봅니다. 전투는 편성한 카드와 용병의 실제 효과로 자동 진행됩니다.</li></ol>'],
 ['조합을 만드는 방법','<p><b>공격과 생존을 함께 챙기세요.</b> 공격형은 처치 속도를, 방어형은 방벽과 반격을, 속도형은 행동 빈도를, 생명형은 회복을 담당합니다. 카드에 표시된 고유효과를 확인하세요.</p><p><b>각자의 용병은 자신의 카드 2장과 연동합니다.</b> 용병 등급·배정 스킬·스킬 자원·대기 시간이 그대로 적용됩니다. 다른 사람의 고급 카드만으로 내 용병의 연동 능력치가 오르지는 않습니다.</p><p><b>회복·보호 스킬은 같은 팀에 적용됩니다.</b> 보호 담당과 화력 담당을 나누면 팀 생존을 보완할 수 있습니다. 같은 계열만 중복하는 편성에는 공용 전투의 중복 보정이 적용됩니다.</p><p>선택 카드의 강화·고유효과와 본인 PVE 장비 보너스를 준비 시점에 저장합니다. 격전지는 총 9캐릭터 편성이므로 배틀슈트와 별도 마법카드는 출전하지 않습니다.</p>'],
 ['난이도와 승리 조건','<p><b>일반</b>은 SS 용병 중심으로 조합을 익히는 단계입니다. <b>격전</b>은 공격과 보호를 함께 준비하고, <b>극한</b>은 SSS 용병과 강화된 카드의 효과를 연계하는 도전입니다.</p><p>등급만으로 승리를 보장하지 않습니다. 카드 강화, 장비, 고유효과와 용병 조합에 따라 결과가 달라집니다. 적의 능력치는 각 난이도에 고정되어 있습니다.</p><p><b>3분 안에 세 단계의 모든 적을 처치하면 승리.</b> 시간이 끝났을 때 보스가 생존했거나 아군이 전멸하면 패배합니다. 화면 배속과 일시정지는 지원하지 않습니다.</p><p>현재 보상은 검수 중입니다. 입장 재화 차감과 승리 보상 지급은 없습니다.</p>'],
 ['새로고침·이탈 규칙','<p><b>전장 로딩이 시작된 뒤 새로고침하거나 나가면 본인이 패배합니다.</b> 다른 창으로 전투를 다시 열어도 복귀할 수 없습니다. 해당 분대의 카드 2장과 용병 1명은 전장에서 제거됩니다.</p><p><b>남은 사람은 계속 싸웁니다.</b> 남은 인원이 보스를 처치해도 이미 이탈한 사람의 패배가 승리로 바뀌지는 않습니다.</p><p>일시적인 통신 끊김은 같은 화면에서 자동 재연결을 시도합니다. 서버가 <b>15초 동안 연결을 확인하지 못하면</b> 패배합니다. 연결 복구 안내가 보이면 새로고침하지 말고 기다려주세요.</p><p>대기방에서는 나가도 패배하지 않습니다. 방장이 나가면 다음 참가자가 방장이 됩니다. 편성을 변경하면 준비 완료가 해제됩니다.</p>']
];
export async function mountCooperative(root){
 await loadStyles();
 const lifecycle=new AbortController(),clientId=crypto.randomUUID(),api=(path,options)=>jointAccountRequest('coop/'+path,options);
 let disposed=false,state=null,roomId='',you=0,options=null,feature=null,ws=null,reconnectTimer,heartbeatTimer,battle=null,portal=null,mounting=null,battlePayload=null,lastMessage=0;
 let busy=false,selected={cardIds:[],mercenaryCode:''},picker='mercenary',query='',grade='',difficulty='NORMAL',serverOffset=0,guideChapter=0,bodyOverflow='',selectionRoom='',squadSignature='',battleEpoch=0,patternSignature='',pendingPattern=null,configSignature='';
 const defaultConfiguration=coopCombatSummary(),configuration=()=>state?.configuration||feature?.configuration||defaultConfiguration;
 const $=s=>root.querySelector(s),on=(el,event,fn)=>el?.addEventListener(event,fn,{signal:lifecycle.signal});
 root.classList.add('coop-root');
 root.innerHTML=`<section class="coop-head"><div><span class="coop-eyebrow">3인 공동 전투</span><h2>격전지<span>(협동)</span></h2><p>세 분대의 선택이 하나의 전장을 바꾼다.</p></div><button class="coop-quiet" data-guide>${shield}공략 지침</button></section>
 <section class="coop-hero"><div class="coop-hero-copy"><span>전장 01 · ${COOP_ENCOUNTER.arena}</span><h3>세 구역을 뚫고,<br>노심을 멈춰라.</h3><p><b>${COOP_ENCOUNTER.name}</b><br>외곽 수비대 · 노심 수문장 · 최종 거신</p><div class="coop-meta"><span>3인 · 9캐릭터</span><span>3분 전투</span><span data-release>연결 중</span></div></div><img src="${COOP_ENCOUNTER.battleSprite}" alt="세 개의 주황색 노심을 가진 백색 거신 아르케" /><div class="coop-hero-index" aria-hidden="true">ARKE <b>01</b></div></section>
 <div class="coop-operation-strip">${COOP_STAGES.map(s=>`<span><i>0${s.wave}</i><b>${s.name}</b><small>${s.target}</small></span>`).join('')}</div>
 <div class="coop-alert" role="status" aria-live="polite" data-alert hidden></div>
 <section data-entry class="coop-entry"><div><header class="coop-section-title"><span>01</span><div><h3>전장 선택</h3><p>처음이라면 일반에서 조합을 맞춰보세요.</p></div></header><div class="coop-difficulties">${COOP_DIFFICULTIES.map((d,i)=>`<button data-difficulty="${d.id}" aria-pressed="${i===0}" class="${i===0?'selected':''}"><small>0${i+1} / ${esc(d.subtitle)}</small><b>${esc(d.name)}</b><span>${esc(d.recommendation)}</span></button>`).join('')}</div><button class="coop-primary" data-create>대기방 만들기 <span>→</span></button></div><form class="coop-join"><span class="coop-eyebrow">초대받았다면</span><h3>동료의 대기방에 합류</h3><p>방장이 알려준 10자리 코드를 입력하세요.</p><label for="coop-code">대기방 코드</label><div><input id="coop-code" name="room" maxlength="10" pattern="[A-Fa-f0-9]{10}" placeholder="예: A31B95F02C" required autocomplete="off" spellcheck="false"><button class="coop-primary" type="submit">입장</button></div><small>3명이 모두 준비하면 자동으로 출전합니다.</small></form></section>
 <section data-room hidden><div class="coop-room-heading"><div><span data-room-title></span><h3>출전 대기실 <b data-count>1 / 3</b></h3></div><div><button class="coop-quiet" data-copy>코드 복사</button><button class="coop-quiet" data-leave>대기방 나가기</button></div></div><div class="coop-squads" data-squads></div>
 <div class="coop-armory"><div class="coop-armory-heading"><div><span class="coop-eyebrow">내 출전 편성</span><h3>용병 1명, 카드 2장</h3></div><div class="coop-picker-tabs"><button data-picker="mercenary" aria-selected="true">용병 <b data-merc-count>0/1</b></button><button data-picker="card" aria-selected="false">카드 <b data-card-count>0/2</b></button></div></div><div class="coop-filter"><label><span class="sr-only">보유 목록 검색</span><input type="search" data-search placeholder="이름으로 검색"></label><select data-grade aria-label="등급 필터"><option value="">모든 등급</option></select><span data-inventory-count></span></div><div class="coop-inventory" data-inventory></div><div class="coop-selection-detail" data-detail>용병의 원화를 선택해 스킬을 확인하세요.</div></div>
 <footer class="coop-readybar"><div><b data-ready-summary>출전 편성을 완성하세요</b><span>3명 모두 준비 완료 시 편성 잠금 · 동시 출전</span></div><button class="coop-primary" data-ready disabled>출전 준비 <span>→</span></button></footer></section>
 <section class="coop-owner" data-owner hidden><button class="coop-quiet" data-settings>운영 테스트 설정</button></section>
 <dialog class="coop-dialog" data-guide-dialog><header><div><small>격전지 공략 지침</small><h3 data-guide-title></h3></div><button class="coop-quiet" data-close-guide aria-label="공략 닫기">닫기 ×</button></header><nav>${GUIDE.map(([name],i)=>`<button data-chapter="${i}">${i+1}. ${name}</button>`).join('')}</nav><article data-guide-content></article></dialog>
 <dialog class="coop-dialog" data-settings-dialog><header><h3>운영 테스트 설정</h3><button class="coop-quiet" data-close-settings>닫기 ×</button></header><form data-settings-form><label>공개 상태<select name="mode"><option value="TEST">테스트 참여자만</option><option value="OFF">운영 중지</option><option value="ON">전체 공개</option></select></label><label>테스트 계정 ID<input name="users" placeholder="예: 12, 34" /></label><p>OWNER는 자동으로 참여할 수 있습니다. 보상은 잠금 상태로 유지됩니다.</p><button class="coop-primary">설정 저장</button><p role="status" data-settings-message></p></form></dialog>`;
 function alert(message){$('[data-alert]').hidden=!message;$('[data-alert]').textContent=message||'';}
 function drawConfiguration(){
  const c=configuration(),signature=JSON.stringify(c);if(signature===configSignature)return;configSignature=signature;
  $('.coop-meta span:nth-child(2)').textContent=c.maxBattleSeconds+'초 전투';
  $('.coop-operation-strip').innerHTML=c.stages.map(s=>`<span><i>0${s.wave}</i><b>${esc(s.name)}</b><small>${esc(s.target)}</small></span>`).join('');
  for(const d of c.difficulties)root.querySelector(`[data-difficulty="${d.id}"] span`).textContent=d.recommendation;
  if($('[data-guide-dialog]').open)openGuide(guideChapter);
 }
 function lock(value){busy=value;$('[data-create]').disabled=value;$('[data-ready]').disabled=value||selected.cardIds.length!==2||!selected.mercenaryCode;root.classList.toggle('is-busy',value);}
 async function command(kind,extra={}){
  const body={roomId,clientId,requestId:crypto.randomUUID(),...extra};
  return api(kind,{method:'POST',body});
 }
 function drawSquads(){
  $('[data-count]').textContent=state.members.length+' / 3';
  $('[data-room-title]').textContent=(COOP_DIFFICULTIES.find(d=>d.id===state.difficulty)?.name||'')+' · '+state.id;
  $('[data-squads]').innerHTML=Array.from({length:3},(_,i)=>{
   const m=state.members[i],sel=m?.selection;
   return `<article class="coop-squad ${m?.id===you?'is-mine':''} ${m?.ready?'is-ready':''}"><header><span>분대 0${i+1}${m?.id===you?' · 나':''}</span><b>${m?esc(m.name):'동료를 기다리는 중'}</b><small>${m?(m.result==='DEFEAT'?'이탈 · 패배':m.ready?'준비 완료':'편성 중'):'빈 자리'}</small></header><div class="coop-squad-art">${sel?`<img src="${esc(sel.mercenary.sourceArt)}" alt="${esc(sel.mercenary.name)}"><div><small>${esc(sel.mercenary.rank)} 용병</small><b>${esc(sel.mercenary.name)}</b></div>`:`<span class="coop-empty">${shield}<b>${m?'용병을 선택하세요':'함께할 동료를 초대하세요'}</b></span>`}</div><div class="coop-squad-cards">${[0,1].map(j=>sel?`<div><img src="${esc(sel.cards[j].image)}" alt=""><span><small>${esc(sel.cards[j].grade)}</small><b>${esc(sel.cards[j].title)}</b></span></div>`:'<div class="coop-card-empty">카드 선택 대기</div>').join('')}</div><footer>${sel?'분대 전투력 <b>'+number(sel.power)+'</b>':'용병 1명 + 카드 2장'}</footer></article>`;
  }).join('');
  const mine=state.members.find(m=>m.id===you);
  $('[data-ready-summary]').textContent=mine?.ready?'준비 완료 · 동료를 기다립니다':selected.cardIds.length===2&&selected.mercenaryCode?'편성 완료 · 준비할 수 있습니다':'출전 편성을 완성하세요';
  $('[data-ready]').innerHTML=mine?.ready?'준비 취소':'출전 준비 <span>→</span>';
  $('[data-ready]').disabled=busy||selected.cardIds.length!==2||!selected.mercenaryCode;
 }
 function drawInventory(){
  const all=picker==='mercenary'?options.mercenaries:options.cards;
  const items=all.filter(c=>(!query||(c.name||c.title).includes(query))&&(!grade||(c.rank||c.grade)===grade));
  $('[data-inventory-count]').textContent=items.length+'종 보유';
  $('[data-merc-count]').textContent=(selected.mercenaryCode?1:0)+'/1';$('[data-card-count]').textContent=selected.cardIds.length+'/2';
  $('[data-inventory]').innerHTML=items.length?items.map(c=>{
   const id=c.code||c.id,active=picker==='mercenary'?selected.mercenaryCode===id:selected.cardIds.includes(id);
   return `<button class="coop-choice ${active?'selected':''}" data-choice="${esc(id)}" aria-pressed="${active}"><span class="coop-choice-art"><img loading="lazy" src="${esc(c.sourceArt||c.image)}" alt=""><small>${esc(c.rank||c.grade)}${c.breakthroughLevel?' +'+c.breakthroughLevel:''}</small><i>${active?'✓':'+'}</i></span><b>${esc(c.name||c.title)}</b><span>${esc(picker==='mercenary'?(c.skills?.[0]?.name||'기본 공격'):(c.uniqueAbility?.effectName||uniqueText(c)))}</span></button>`;
  }).join(''):'<p class="coop-empty-list">조건에 맞는 보유 '+(picker==='mercenary'?'용병이':'카드가')+' 없습니다.</p>';
  $('[data-grade]').innerHTML='<option value="">모든 등급</option>'+[...new Set(all.map(c=>c.rank||c.grade))].map(g=>`<option value="${esc(g)}" ${grade===g?'selected':''}>${esc(g)}</option>`).join('');
 }
 async function pick(id){
  if(busy||state?.status!=='LOBBY')return;
  const item=(picker==='mercenary'?options.mercenaries:options.cards).find(c=>(c.code||c.id)===id);
  if(picker==='mercenary')selected.mercenaryCode=selected.mercenaryCode===id?'':id;
  else if(selected.cardIds.includes(id))selected.cardIds=selected.cardIds.filter(x=>x!==id);
  else{if(selected.cardIds.length===2){alert('카드는 2장까지 선택할 수 있습니다. 선택한 카드를 한 번 더 눌러 해제하세요.');return;}if(item.grade==='SUPERSTAR'&&selected.cardIds.some(id=>options.cards.find(c=>c.id===id)?.grade==='SUPERSTAR')){alert('한 사람은 슈퍼스타 1장까지 선택할 수 있습니다.');return;}selected.cardIds.push(id);}
  $('[data-detail]').innerHTML=`<b>${esc(item.name||item.title)}</b><span>${esc(picker==='mercenary'?(item.skills?.map(s=>s.name+' — '+s.effect).join(' / ')||'등록된 기본 공격 사용'):[uniqueText(item),item.uniqueAbility?.effectDescription].filter(Boolean).join(' / '))}</span>`;
  drawInventory();drawSquads();alert('');lock(true);
  try{
   let result;
   if(selected.cardIds.length===2&&selected.mercenaryCode)result=await command('select',selected);
   else result=await command('unready');
   apply(result);
  }catch(e){alert(e.message);}finally{lock(false);drawSquads();}
 }
 async function connect(){
  if(disposed||!roomId)return;
  try{
   const ticket=await command('ticket');apply(ticket);
   if(!ticket.ticket||ticket.state.myResult)return;
   ws?.close();const socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/coop/stream?room='+roomId+'&ticket='+encodeURIComponent(ticket.ticket));ws=socket;
   socket.onmessage=event=>{if(disposed||socket!==ws)return;try{const value=JSON.parse(event.data);if(value.ok){lastMessage=Date.now();apply(value);alert('');}else alert(value.error);}catch{alert('전황을 다시 확인하고 있습니다.');}};
   socket.onclose=event=>{if(disposed||socket!==ws)return;clearTimeout(reconnectTimer);if(event.code===4001){resetRoom();alert('다른 화면에서 접속했습니다. 이 화면의 대기방 연결을 종료했습니다.');return;}if(state&&['LOBBY','LOADING','ACTIVE'].includes(state.status)&&!state.myResult){alert('연결 복구 중 · 새로고침하지 마세요.');reconnectTimer=setTimeout(connect,1200);}};
   socket.onerror=()=>socket.close();
  }catch(e){if(disposed)return;alert(e.message);clearTimeout(reconnectTimer);if(['COOP_MISSING','COOP_MEMBER','COOP_CLOSED','COOP_OLD_CLIENT'].includes(e.code)){resetRoom();return;}reconnectTimer=setTimeout(connect,2000);}
 }
 function send(type,extra={}){if(ws?.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify({type,...extra}));return true;}
 function showBattle(value){
  if(!portal){
   bodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
   portal=document.createElement('section');portal.className='coop-battle-portal';portal.setAttribute('aria-label','격전지 공동 전투');
   portal.innerHTML=`<div class="coop-battle-top"><div><small>격전지(협동) · ${COOP_ENCOUNTER.arena}</small><b data-phase>전장 집결 중</b></div><div><strong data-time></strong><button data-battle-guide>공략</button><button data-exit>전투 이탈</button></div></div><div class="coop-boss-hud"><div><b data-enemy-title>제련소 외곽 · 적 3기</b><span data-hp></span></div><progress data-boss-health max="100" value="100"></progress><small data-battle-members></small></div><section class="coop-pattern" data-pattern hidden aria-label="협동 기믹"><header><div><small data-pattern-kicker></small><b data-pattern-title></b></div><strong data-pattern-time></strong></header><p data-pattern-instruction role="status" aria-live="polite"></p><div class="coop-pattern-members" data-pattern-members></div><button class="coop-primary" data-pattern-action></button><progress data-pattern-clock max="100" value="100" aria-label="기믹 남은 시간"></progress></section><div class="coop-battle-mount"></div><div class="coop-battle-notice" role="status">3명 모두 로딩이 끝나면 함께 출전합니다.</div><div class="coop-result" hidden></div>`;
   document.body.append(portal);on(portal.querySelector('[data-exit]'),'click',async()=>{if(!confirm('전투에서 이탈하면 본인은 패배하고 분대 3명이 제거됩니다. 이탈하시겠습니까?'))return;await leave();});
   on(portal.querySelector('[data-battle-guide]'),'click',()=>openGuide(guideChapter));
   on(portal.querySelector('[data-pattern-action]'),'click',()=>{
    const p=state?.pattern;if(!p||p.status!=='OPEN'||p.inputs[you])return;
    const action=p.kind==='VENT'?'VENT':p.targetId===you?'GUARD':'JAM';
    if(!send('mechanic',{patternId:p.id,action})){portal.querySelector('[data-pattern-instruction]').textContent='연결 복구 중 · 연결되면 다시 눌러주세요.';return;}
    pendingPattern={id:p.id,action,at:Date.now()};drawPattern();
   });
  }
  if(value.payload)battlePayload=value.payload;
  if(!battle&&!mounting&&battlePayload){
   const epoch=battleEpoch,host=portal.querySelector('.coop-battle-mount');
   mounting=(async()=>{
    try{await window.CNineCoreRaidBridge.ensureFeatureResources('battleV2');if(disposed||epoch!==battleEpoch)return;
     const result=await mountCoopBattle(host,battlePayload);if(disposed||epoch!==battleEpoch){result.destroy();return;}battle=result;
     battle.update({serverNow:Date.now()+serverOffset,state,payload:battlePayload});send('loaded');portal.querySelector('.coop-battle-notice').hidden=true;
    }catch(e){if(!disposed&&epoch===battleEpoch&&portal){portal.querySelector('.coop-battle-notice').textContent=e.message+' · 전투 이탈 버튼으로 돌아갈 수 있습니다.';alert(e.message);}}
    finally{mounting=null;}
   })();
  }else battle?.update(value);
  if(state.myResult||['VICTORY','DEFEAT'].includes(state.status)){
   const result=portal.querySelector('.coop-result');result.hidden=false;const won=(state.myResult||state.status)==='VICTORY';
   result.innerHTML=`<div><span>${won?'VICTORY':'DEFEAT'}</span><h2>${won?'거신 저지 성공':'거신 저지 실패'}</h2><p>${esc(state.members.find(m=>m.id===you)?.reason||(won?'세 분대의 힘으로 거신의 노심을 정지시켰습니다.':'미격파 적 생존 또는 아군 전멸'))}</p><p>협동 대응 ${state.patternHistory?.filter(p=>p.status==='SUCCESS').length||0} / ${state.patternHistory?.length||0}회 성공</p><small>현재 검수 운영 중 · 보상 지급 없음</small><button class="coop-primary" data-return>대기방 목록으로</button></div>`;
   result.querySelector('[data-return]').onclick=()=>void leave();
  }
  battleHud();
 }
 function battleHud(){
  if(!portal||!state)return;
  const c=configuration(),elapsed=state.startsAt?Date.now()+serverOffset-state.startsAt:0,remaining=Math.max(0,Math.ceil((c.maxBattleSeconds*1000-elapsed)/1000));
  portal.querySelector('[data-time]').textContent=state.status==='ACTIVE'&&elapsed<0?Math.ceil(-elapsed/1000)+'초 후 출전':Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
  portal.querySelector('[data-phase]').textContent=state.myResult==='DEFEAT'?'이탈 · 패배':state.status==='LOADING'?'전장 집결 중':state.status==='ACTIVE'?`${state.stage?.wave||1} / 3 단계 · ${c.stages[(state.stage?.wave||1)-1].name}`:state.status==='VICTORY'?'정벌 성공':'정벌 종료';
  const wave=state.stage?.wave||1,enemies=(state.fighters?.B||[]).filter(f=>(f.wave||1)===wave);
  if(enemies.length){const hp=enemies.reduce((sum,f)=>sum+f.hp,0),max=enemies.reduce((sum,f)=>sum+f.maxHp,0);portal.querySelector('[data-boss-health]').value=Math.max(0,hp/max*100);portal.querySelector('[data-hp]').textContent=number(hp)+' / '+number(max);}
  portal.querySelector('[data-enemy-title]').textContent=wave===1?`외곽 수비대 · ${enemies.filter(f=>f.hp>0).length}기 남음`:COOP_STAGES[wave-1].target;
  portal.querySelector('[data-battle-members]').textContent=state.members.map((m,i)=>(i+1)+'분대 '+m.name+(m.result==='DEFEAT'?' · 이탈':m.loaded?' · 집결 완료':' · 로딩 중')).join('   /   ');
  drawPattern();
 }
 function drawPattern(){
  if(!portal)return;
  const p=state?.pattern,panel=portal.querySelector('[data-pattern]'),now=Date.now()+serverOffset;
  panel.hidden=!p||state.status!=='ACTIVE'||!!state.myResult||(p.status!=='OPEN'&&now-p.resolvedAt>4000);
  if(panel.hidden)return;
  if(pendingPattern&&(p.id!==pendingPattern.id||p.inputs[you]||p.status!=='OPEN'))pendingPattern=null;
  if(pendingPattern&&Date.now()-pendingPattern.at>1200){send('mechanic',{patternId:p.id,action:pendingPattern.action});pendingPattern.at=Date.now();}
  const waiting=!!pendingPattern,alive=state.fighters?.A.some(f=>f.ownerId===you&&f.hp>0),signature=JSON.stringify([p,you,waiting,alive]);
  const open=p.status==='OPEN',mine=p.inputs[you],target=state.members.find(m=>m.id===p.targetId);
  if(signature!==patternSignature){
   patternSignature=signature;panel.dataset.state=open?'open':p.status.toLowerCase();
   panel.querySelector('[data-pattern-kicker]').textContent=p.kind==='VENT'?'전원 대응 · 삼핵 차단':'표적 방어 · 집중 포화';
   panel.querySelector('[data-pattern-title]').textContent=open?(p.kind==='VENT'?'각자 노심을 차단하세요':p.targetId===you?'내 분대가 표적입니다':(target?.name||'동료')+' 분대를 보호하세요'):p.effect.label;
   panel.querySelector('[data-pattern-instruction]').textContent=open?(waiting?'입력 전달 중…':mine?'내 행동 접수 완료 · 동료의 대응을 확인하세요':p.kind==='VENT'?`생존 분대 모두 차단하면 거신 체력 ${configuration().patterns.rupturePercent}% 파괴`:p.targetId===you?'엄폐로 피해를 줄이세요. 동료가 조준을 교란합니다.':'조준을 교란해 표적 분대가 받는 피해를 줄이세요.'):(p.effect.kind==='RUPTURE'?`거신 최대 체력 ${p.effect.percent}% 파괴`:p.effect.kind==='OVERLOAD'?'차단 미완료 · 아군 전체에 과부하 피해':'표적 분대 피해 '+Number(p.effect.percent.toFixed(2))+'% · 방벽 적용 전');
   panel.querySelector('[data-pattern-members]').innerHTML=state.members.map((m,i)=>{const current=p.participants.includes(m.id)&&!m.result&&state.fighters?.A.some(f=>f.ownerId===m.id&&f.hp>0);return `<span class="${p.inputs[m.id]?'done':''} ${m.id===you?'mine':''}"><b>${p.inputs[m.id]?'✓':i+1} ${esc(m.name)}</b><small>${!current?'대응 제외':p.inputs[m.id]?'접수 완료':p.kind==='VENT'?'노심 차단':p.targetId===m.id?'엄폐 담당':'조준 교란'}</small></span>`;}).join('');
   const button=panel.querySelector('[data-pattern-action]');button.hidden=!open;button.disabled=!!mine||waiting||!alive||!p.participants.includes(you);button.textContent=mine?'✓ 대응 완료':waiting?'전달 중…':!alive?'분대 전멸 · 관전 중':p.kind==='VENT'?'내 노심 차단':p.targetId===you?'내 분대 엄폐':'조준 교란';
  }
  panel.querySelector('[data-pattern-time]').textContent=open?Math.max(0,(p.endsAt-now)/1000).toFixed(1)+'초':p.status==='SUCCESS'?'성공':'판정 완료';
  panel.querySelector('[data-pattern-clock]').value=open?Math.max(0,Math.min(100,(p.endsAt-now)/(p.endsAt-p.startsAt)*100)):0;
 }
 function closeBattle(){battleEpoch++;battle?.destroy();battle=null;battlePayload=null;pendingPattern=null;patternSignature='';if(portal){portal.remove();portal=null;document.body.style.overflow=bodyOverflow;}}
 function apply(value){
  if(disposed||!value?.state)return;
  if(state&&value.state.id===state.id&&value.state.version<state.version)return;
  state=value.state;you=value.you||you;roomId=state.id;serverOffset=value.serverNow-Date.now();drawConfiguration();
  $('[data-entry]').hidden=true;$('[data-room]').hidden=state.status!=='LOBBY';
  if(state.status==='LOBBY'){
   if(selectionRoom!==roomId){selectionRoom=roomId;const mine=state.members.find(m=>m.id===you)?.selection;if(mine)selected={cardIds:mine.cards.map(c=>c.id),mercenaryCode:mine.mercenary.code};drawInventory();}
   const signature=JSON.stringify(state.members);if(squadSignature!==signature){squadSignature=signature;drawSquads();}
  }
  else if(state.status==='CANCELLED'){alert(state.reason||'대기방이 종료되었습니다.');resetRoom();}
  else showBattle(value);
 }
 function resetRoom(){ws?.close();ws=null;clearTimeout(reconnectTimer);closeBattle();state=null;roomId='';selectionRoom='';squadSignature='';selected={cardIds:[],mercenaryCode:''};$('[data-entry]').hidden=false;$('[data-room]').hidden=true;drawConfiguration();}
 async function leave(){if(!roomId){resetRoom();return;}try{await command('leave');resetRoom();}catch(e){alert(e.message);}}
 function abandon(){
  if(disposed)return;send('leave');
  if(roomId){const token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';
   void fetch('/api/coop/abandon',{method:'POST',keepalive:true,headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-cnine-client-id':localStorage.getItem('cnine_player_client_id_v1552')||''},body:JSON.stringify({roomId,clientId,requestId:crypto.randomUUID()})}).catch(()=>{});
  }
 }
 function openGuide(index=0){
  const c=configuration(),d=c.difficulties.find(d=>d.id===(state?.difficulty||difficulty)),p=c.patterns;
  const dynamic={
   0:`<p><b>세 명이 편성한 9캐릭터로 세 구역을 연속 격파합니다.</b> 전체 제한 시간은 ${c.maxBattleSeconds}초입니다.</p><ol>${c.stages.map(s=>`<li><b>${s.wave}단계 · ${esc(s.name)}:</b> ${esc(s.target)}<p>${esc(s.hint)}</p></li>`).join('')}</ol><p>노심 수문장의 시작 방벽은 최대 HP의 ${d.wardenShieldPercent}%입니다.</p><p><b>앞 단계의 적을 전부 처치해야 다음 단계가 열립니다.</b> 체력·방벽·스킬 대기 시간은 이어집니다. 단계 전환으로 회복하거나 쓰러진 캐릭터가 부활하지 않습니다.</p>`,
   1:`<p><b>평타와 용병 스킬은 자동, 거신의 특수 공격은 직접 대응합니다.</b> 최종 보스 등장 ${p.firstSeconds}초 후부터 ${p.intervalSeconds}초 간격으로 최대 ${p.count}회 발동합니다. 현재 난이도는 <b>${d.responseSeconds}초 안에 대응</b>하세요.</p><ol><li><b>삼핵 차단:</b> 생존한 분대가 각자 <b>내 노심 차단</b>을 한 번씩 누르세요. 전원 성공 시 거신 최대 HP의 ${p.rupturePercent}%를 깎고, 놓치면 아군 전체가 최대 HP의 ${d.overloadPercent}% 피해를 받습니다.</li><li><b>집중 포화:</b> 표적은 <b>내 분대 엄폐</b>, 동료는 <b>조준 교란</b>을 누르세요. 기본 피해는 표적 분대 최대 HP의 ${d.focusPercent}%이며, 엄폐로 75% 감소하고 교란 1명마다 추가 25%씩 줄어듭니다. 방벽이 피해를 흡수합니다.</li><li><b>확인 표시:</b> 내 분대의 체크 표시가 켜지면 접수 완료입니다. 다른 분대의 버튼을 대신 누를 수 없으며 이탈·전멸한 분대는 대응에서 제외됩니다.</li></ol>`,
   4:`<p>${esc(d.recommendation)}</p><p>등급만으로 승리를 보장하지 않습니다. 카드 강화·장비·고유효과와 용병 조합을 함께 준비하세요.</p><p><b>${c.maxBattleSeconds}초 안에 세 단계의 모든 적을 처치하면 승리합니다.</b> 미격파 적이 남거나 아군이 전멸하면 패배합니다. 배속·일시정지는 지원하지 않습니다.</p><p>현재 입장 재화 차감과 승리 보상 지급은 없습니다.</p>`
  };
  guideChapter=index;const dialog=$('[data-guide-dialog]');$('[data-guide-title]').textContent=GUIDE[index][0];$('[data-guide-content]').innerHTML=dynamic[index]??GUIDE[index][1];dialog.querySelectorAll('[data-chapter]').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.chapter)===index)));if(!dialog.open)dialog.showModal();
 }
 on(root,'click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.difficulty){difficulty=b.dataset.difficulty;root.querySelectorAll('[data-difficulty]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});}
  if(b.dataset.picker){picker=b.dataset.picker;grade='';query='';$('[data-search]').value='';root.querySelectorAll('[data-picker]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));drawInventory();}
  if(b.dataset.choice)void pick(b.dataset.choice);
  if(b.dataset.chapter!==undefined)openGuide(Number(b.dataset.chapter));
 });
 on($('[data-create]'),'click',async()=>{if(busy)return;lock(true);try{const result=await command('create',{difficulty});roomId=result.roomId;await connect();}catch(e){alert(e.message);}finally{lock(false);}});
 on($('.coop-join'),'submit',async event=>{event.preventDefault();if(busy)return;lock(true);try{roomId=$('#coop-code').value.trim().toUpperCase();const result=await command('join');selected={cardIds:[],mercenaryCode:''};apply(result);await connect();}catch(e){alert(e.message);roomId=state?.id||'';}finally{lock(false);}});
 on($('[data-ready]'),'click',async()=>{if(busy)return;lock(true);try{
  const mine=state.members.find(m=>m.id===you);if(!mine.ready)await window.CNineCoreRaidBridge.ensureFeatureResources('battleV2');
  apply(await command(mine.ready?'unready':'ready',selected));
 }catch(e){alert(e.message);}finally{lock(false);}});
 on($('[data-copy]'),'click',async()=>{try{await navigator.clipboard.writeText(roomId);alert('대기방 코드를 복사했습니다: '+roomId);}catch{alert('대기방 코드: '+roomId);}});
 on($('[data-leave]'),'click',()=>void leave());on($('[data-search]'),'input',e=>{query=e.target.value.trim();drawInventory();});on($('[data-grade]'),'change',e=>{grade=e.target.value;drawInventory();});
 on($('[data-guide]'),'click',()=>openGuide());on($('[data-close-guide]'),'click',()=>$('[data-guide-dialog]').close());
 let settingsRevision=0;
 async function availability(){
  feature=await api('feature');$('[data-owner]').hidden=!feature.owner;drawConfiguration();
  $('[data-release]').textContent=feature.mode==='OFF'?'운영 중지':feature.mode==='TEST'?'테스트 운영 · 보상 없음':'보상 검수 중';
  if(!feature.accessible){$('[data-entry]').hidden=true;alert('격전지는 현재 운영 중지 상태입니다. 운영 설정에서 변경할 수 있습니다.');return false;}
  options=await api('options');you=options.you;if(!state)$('[data-entry]').hidden=false;return true;
 }
 on($('[data-settings]'),'click',async()=>{try{const r=await api('settings');settingsRevision=r.settings.revision;const form=$('[data-settings-form]');form.elements.mode.value=r.settings.mode;form.elements.users.value=r.settings.testUserIds.join(', ');$('[data-settings-dialog]').showModal();}catch(e){alert(e.message);}});
 on($('[data-close-settings]'),'click',()=>$('[data-settings-dialog]').close());
 on($('[data-settings-form]'),'submit',async e=>{e.preventDefault();const form=e.target;try{const r=await api('settings',{method:'POST',body:{settings:{revision:settingsRevision,mode:form.elements.mode.value,testUserIds:form.elements.users.value.split(/[ ,\n]+/).filter(Boolean).map(Number)}}});settingsRevision=r.settings.revision;alert('');await availability();$('[data-settings-message]').textContent='설정을 저장했습니다.';}catch(err){$('[data-settings-message]').textContent=err.message;}});
 on(window,'pagehide',abandon);
 heartbeatTimer=setInterval(()=>{if(!state?.myResult){send('ping');if(battle&&state?.status==='LOADING'&&!state.members.find(m=>m.id===you)?.loaded)send('loaded');}battleHud();if(state&&!state.myResult&&Date.now()-lastMessage>12000&&ws?.readyState===WebSocket.OPEN)alert('서버 응답 대기 중 · 새로고침하지 마세요.');},COOP_RULES.heartbeatMs);
 const clock=setInterval(battleHud,200);
 try{
  if(await availability()){const current=await api('current');if(current.state){roomId=current.state.id;apply(current);if(!current.state.myResult)await connect();}}
 }catch(e){alert(e.message);}
 return {destroy(){abandon();disposed=true;clearInterval(clock);clearInterval(heartbeatTimer);clearTimeout(reconnectTimer);lifecycle.abort();ws?.close();ws=null;closeBattle();for(const d of root.querySelectorAll('dialog'))d.close();},diagnostics:()=>({state,battle:battle?.diagnostics()})};
}
