// Reuse the shipped raid controls and existing boss/card art; no separate UI art.
export const ART='/assets/raids/blackwing-20261024/';
export const roles={BREAKER:'파쇄',GUARD:'수호',SEALER:'봉인'};
export const roleDetails={
 BREAKER:['용혈 축적 · 심장 파괴','내 용혈 무게를 공유하고 저울 배치를 해결합니다. 동료와 용혈·심장·절단 공격을 맞춥니다.'],
 GUARD:['반전 · 성역 전개','폭발·잔열 피해에 맞춰 회복하고 용염 3.5초 전부터 성역을 번갈아 펼칩니다.'],
 SEALER:['용혈 격리 · 절단 합의','내 용혈 무게와 잔상을 확인해 저울에 참여하고 심장 준비·절단 합의를 담당합니다.']
};
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const src=v=>/^(?:\/(?!\/)|https?:\/\/)/.test(String(v||''))?esc(v):'';
export function portrait(card,extra=''){
 const image=src(card?.image);
 const x=Math.max(0,Math.min(100,Number(card?.focusX)||50)),y=Math.max(0,Math.min(100,Number(card?.focusY)||25));
 return image?`<img class="bw-face ${extra}" src="${image}" alt="${esc(card.title||'편성 카드')}" style="object-position:${x}% ${y}%" loading="lazy">`:`<span class="bw-face bw-face-empty ${extra}" aria-label="빈 자리">＋</span>`;
}
export function lobbyMarkup(){return `
 <section class="bw-root cn-command-ui">
  <header class="mr-top bw-heading"><span class="mr-brand">흑익의 맹약 <span>레이드 작전실</span></span><span class="mr-development">TEST · 무료 입장</span></header>
  <div class="bw-staging">
   <section class="bw-keyart" aria-label="타락한 용기사 모르드레인">
    <img class="bw-boss-art" src="${ART}boss-art.webp?v=20261024-hilt-short1" alt="얼굴과 흑익, 대검이 보이는 타락한 용기사 모르드레인" fetchpriority="high">
    <div class="bw-intro"><p class="mr-eyebrow">6인 협동 레이드</p><h2>흑익의 맹약</h2><p>타락한 용기사 <strong>모르드레인</strong></p><div class="mr-facts"><span><b>6</b>인 고정 공대</span><span><b>3</b>역할 · 각 2명</span><span><b>5</b>단계 공략</span></div></div>
   </section>
   <section class="bw-preparation cn-ui-panel" data-lobby>
    <p class="mr-eyebrow">공대 준비</p><h3>함께 맹약을 끊을 동료</h3>
    <fieldset class="bw-role-picker"><legend>내 역할 선택 <small>각 역할 2명</small></legend>
     ${Object.entries(roles).map(([key,label],i)=>`<label class="bw-role-option cn-ui-panel"><input type="radio" name="blackwing-role" data-role value="${key}"${i===0?' checked':''}><span class="bw-role-copy"><strong>${label}</strong><span>${roleDetails[key][0]}</span></span><span class="bw-role-check" aria-hidden="true">✓</span></label>`).join('')}
    </fieldset>
    <p class="bw-role-hint" data-role-hint>${roleDetails.BREAKER[1]}</p>
    <button type="button" class="mr-button cn-ui-button primary bw-create" data-create>파쇄로 공대 만들기 <span aria-hidden="true">→</span></button>
    <p class="bw-policy">입장 비용 0 · TEST 보상 잠금<br>OWNER·지정 참가자만 입장할 수 있습니다.</p>
   </section>
   <section class="bw-preparation bw-assembly cn-ui-panel" data-party hidden></section>
  </div>
  <dl class="bw-config" data-config aria-label="서버 레이드 설정"></dl>
  <p class="bw-status" role="status" aria-live="polite" data-status></p>
  <section class="mr-registry bw-registry cn-ui-panel" data-registry><header><div><p class="mr-eyebrow">공대 모집</p><h3>출정을 기다리는 공대 <span data-room-count>0</span></h3></div><button type="button" class="mr-button cn-ui-button" data-refresh>↻ 새로고침</button></header><ul class="bw-rooms" data-rooms></ul></section>
  <section class="bw-guide cn-ui-panel" aria-label="작전과 역할 안내"><header><p class="mr-eyebrow">공략 지침</p><h3>다섯 단계, 하나의 맹약</h3><p>전원 자신의 RAID 카드 5장과 PVE 용병으로 전투합니다. 저울의 개인 무게를 채팅·음성으로 공유할 준비가 필요합니다.</p></header>
   <ol class="bw-guide-steps">
    <li><b>01</b><div><h4>역린의 부채</h4><p>전원 개인 무게를 공유해 세 저울 발판의 목표 합계를 맞춥니다. 각 저울 발판은 서로 다른 역할 2명, 첫 확정부터 6초 안에 전원 확정. 파쇄 2명이 용혈 3회 축적 → 봉인 2명 격리 → 수호 2 고정 → 수호 1 반전.</p></div></li>
    <li><b>02</b><div><h4>쌍생 심장</h4><p>새 저울을 완성한 뒤 봉인 1·2가 좌·우 준비. 파쇄 1·2가 각 심장을 <strong>3초 미만 간격</strong>으로 파괴합니다.</p></div></li>
    <li><b>03</b><div><h4>돌이킬 수 없는 절단</h4><p>직전 저울 발판 재진입을 피하고 새 저울 완성 → 봉인 2명 합의 → 수호 2명 고정 → 파쇄 2명 절단. 선택은 최종전까지 유지됩니다.</p><details><summary>흑익 / 대검의 차이</summary><p>흑익 절단: 최종 용염 2회 + 수호 2가 반전 시작 후 2.5초 안에 검 반격 저지.<br>대검 절단: 검 반격 없이 최종 용염 3회.</p></details></div></li>
    <li><b>04</b><div><h4>소모되는 성역</h4><p>수호 1·2가 번갈아 6인 저울 완성 후 용염 <strong>3.5초 전부터</strong> 전개. 매 용염마다 무게·목표가 바뀌며 직전 저울의 발판에는 잔상이 남습니다. 같은 성역 연속 사용 불가. 내구도는 최종전까지 이월됩니다.</p></div></li>
    <li><b>05</b><div><h4>흑익의 마지막 맹약</h4><p>부채·쌍심장·성역을 동시에 해결. 흑익 절단 시 수호 2는 용혈 반전 시작 후 2.5초 내 검 반격이 추가됩니다. 성역은 내구도가 남고 직전과 다른 것을 선택하며 고정 1→2→3 정답은 없습니다. 기믹이 끝나면 <strong>6명 모두</strong> 자신의 공격 몫을 채웁니다.</p></div></li>
   </ol><p class="bw-failure-rule">침식 3회 · 광폭화 · 구간 시간 초과 · 전투 중 이탈 시 실패. 매 단계 시작 5초 뒤 전원 HP 20% 폭발, 성역 방어 후에도 HP 6% 잔열 피해. 수호는 공대 30% 회복 4회를 공유하며 연속 사용 간격은 4초입니다. 전투기록에서 누가 어떤 입력을 했는지 확인하고 저장할 수 있습니다.</p>
  </section>
 </section>`;}
export function configMarkup(settings){return `<div class="cn-ui-panel"><dt>모드</dt><dd>TEST <small>무료</small></dd></div><div class="cn-ui-panel"><dt>보스 전투력</dt><dd>${Number(settings.bossCombatPower).toLocaleString()}</dd></div><div class="cn-ui-panel"><dt>광폭화</dt><dd>${Number(settings.enrageSeconds)}<small>초</small></dd></div><div class="cn-ui-panel"><dt>계정 보상</dt><dd>잠금</dd></div>`;}
export function partyMarkup(state,roomId,busy){
 const members=Object.keys(roles).flatMap(role=>[0,1].map(slot=>({role,slot,member:state.members.find(m=>m.role===role&&m.slot===slot)})));
 return `<p class="mr-eyebrow">내 공대 · 출정 대기</p><h3>출정 준비 <span>${state.members.length}/6</span></h3><div class="bw-room-code"><span>공대 코드 <b>${esc(roomId)}</b></span><button type="button" class="mr-button cn-ui-button quiet" data-copy>복사</button></div>
 <ul class="bw-members">${members.map(({role,slot,member:m})=>`<li class="bw-member cn-ui-panel${m?'':' empty'}">${portrait(m?.portrait)}<div><strong>${m?esc(m.name):'동료 모집 중'}${m?.id===state.me.id?' <em>나</em>':''}</strong><small>${roles[role]} ${slot+1}${m?.id===state.hostId?' · 공대장':''}</small></div><span class="bw-ready-state${m?.ready?' ready':''}">${m?(m.ready?'✓ 준비':'대기'):'빈 자리'}</span>${m&&state.me.isHost&&m.id!==state.me.id?`<button type="button" class="mr-button cn-ui-button quiet bw-kick" data-kick="${esc(m.id)}" aria-label="${esc(m.name)} 강퇴"${busy?' disabled':''}>강퇴</button>`:''}</li>`).join('')}</ul>
 <div class="bw-lineup"><span>내 RAID 편성</span><div>${(state.lineup||[]).map(c=>portrait(c)).join('')}</div></div>
 <div class="bw-actions"><button type="button" class="mr-button cn-ui-button ${state.me.ready?'':'primary'}" data-ready${busy?' disabled':''}>${state.me.ready?'준비 취소':'편성 확인 · 준비'}</button>${state.me.isHost?`<button type="button" class="mr-button cn-ui-button primary" data-start${busy||state.members.length!==6||state.members.some(m=>!m.ready)?' disabled':''}>6인 출정</button>`:''}<button type="button" class="mr-button cn-ui-button quiet" data-leave${busy?' disabled':''}>나가기</button></div><p class="bw-policy">${state.members.length<6?'역할별 2명씩, 총 6명이 모여야 출정합니다.':'전원 준비 완료 후 공대장이 출정할 수 있습니다.'} 준비할 때 최신 RAID 편성과 PVE 용병을 불러옵니다.</p>`;
}
export function roomsMarkup(rooms,role,busy=false){return rooms.length?rooms.map(r=>`<li class="bw-room">${portrait(r.portrait)}<div class="bw-room-title"><strong>${esc(r.hostName)} 공대</strong><small>${r.members}/6명 · ${esc(r.id)}</small></div><div class="bw-room-roles">${Object.entries(roles).map(([k,v])=>`<span${r.roles[k]>=2?' class="filled"':''}>${v} <b>${r.roles[k]}/2</b></span>`).join('')}</div><button type="button" class="mr-button cn-ui-button primary" data-join="${esc(r.id)}"${busy||!r.canJoin||r.roles[role]>=2?' disabled':''}>${r.roles[role]>=2?roles[role]+' 마감':roles[role]+'로 참가'}</button></li>`).join(''):'<li class="bw-empty"><strong>첫 공대를 만들어 동료를 모으세요</strong><p>위에서 맡을 역할을 선택하고 공대 만들기를 누르면 모집을 시작합니다.</p></li>';}
export function partyStripMarkup(state){return state.members.map(m=>`<div class="bw-party-chip cn-ui-panel${m.id===state.me.id?' is-me':''}">${portrait(m.portrait)}<div><strong>${esc(m.name)}</strong><small>${roles[m.role]} ${m.slot+1}</small><meter min="0" max="${m.maxHp||1}" value="${m.hp}" aria-label="${esc(m.name)} 편성 체력"></meter></div></div>`).join('');}
