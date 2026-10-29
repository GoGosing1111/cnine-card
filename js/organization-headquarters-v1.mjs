import {organizationHuntView} from './organization-hunts-v1.mjs?v=20261025-clan-eight';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value||0).toLocaleString('ko-KR');
const descriptions=[
 '모든 클랜이 새로 시작하는 첫 거점. 동료를 모으고 도시로 나아갈 준비를 합니다.',
 '낮은 골목의 불빛 아래, 클랜만의 작은 사무실을 준비합니다.',
 '동료들이 돌아올 본거지. 영역을 넓혀 더 큰 클랜으로 성장합니다.',
 '도시에 자리 잡은 클랜의 거점. 다음 성장을 준비합니다.',
 '도시의 밤을 내려다보는 최종 아지트 콘셉트입니다.'
];
export const currentOrganization=state=>state.organizations.find(o=>o.id===state.membership?.organizationId)||null;
export function organizationRosterView(state){
 const org=currentOrganization(state);if(!org)return '';
 const members=state.roster||[],elderIds=state.faction?.treasury?.elderIds||[];
 return '<section class="org-member-section" aria-labelledby="org-member-title"><header><div><span class="org-kicker">THE PEOPLE BEHIND OUR NAME</span><h3 id="org-member-title">클랜원 명단</h3></div><p><b>'+members.length+'</b> / 25명</p></header><ol class="org-member-grid">'+Array.from({length:25},(_,index)=>{
  const member=members.find(m=>m.slot===index+1);
  return '<li class="org-member-slot '+(member?.isSelf?'is-self':member?'':'is-vacant')+'"><span class="org-member-number">'+String(index+1).padStart(2,'0')+'</span><div><b title="'+esc(member?.nickname||'빈 자리')+'">'+esc(member?.nickname||'빈 자리')+'</b><small>'+(member?((member.isSelf?'나 · ':'')+((member.isElder??elderIds.includes(member.userId))?'원로':'클랜원')):'가입 신청 가능')+'</small>'+(member?.canKick?'<button type="button" class="org-member-kick" data-org-kick="'+member.userId+'" aria-label="'+esc(member.nickname)+' 방출">방출</button>':'')+'</div>'+(member?.isSelf?'<span class="org-member-self">ME</span>':'')+'</li>';
 }).join('')+'</ol><p class="org-roster-note">현재 클랜에 배정된 동료만 표시합니다. 가입 신청은 해당 클랜 원로의 승인 후 빈 자리에 반영됩니다. 원로는 일반 클랜원을 방출할 수 있습니다.</p></section>';
}
export function organizationHideoutView(state,{stage=0,compact=false,huntKind='boss'}={}){
 const names=state.preparation.hideouts,org=currentOrganization(state),current=org?.hideout,treasury=state.faction?.treasury,costs=state.faction?.policy?.upgradeCosts||[0,null,null,null,null],isCurrent=!!current&&stage+1===current.stage;
 const funds=treasury?.funds??0,nextCost=treasury?.nextCost??null;
 const condition=stage===0?'모든 클랜이 출발하는 첫 단계':costs[stage]===null?'승급 비용 입력 대기':number(costs[stage])+' 클랜 자금 소모 · 한 단계씩 승급';
 const status=current?'<section class="org-headquarters-status" aria-label="우리 클랜 아지트 현황"><div><span class="org-kicker">CURRENT HEADQUARTERS</span><h3>'+esc(current.name)+'</h3><p>현재 '+current.stage+'단계 · 공동 자금 <strong>'+number(funds)+'</strong></p><p>개인 코인과 분리된 클랜 전용 자금</p></div><div class="org-growth-status">'+(state.factionError?'<b>자금 정보를 불러오지 못했습니다.</b><p>'+esc(state.factionError)+'</p>':current.stage===5?'<b>최종 아지트 단계</b><p>성장 단계 5 / 5</p>':nextCost===null?'<b>다음 승급 비용 입력 대기</b><p>OWNER CMS에서 비용을 설정하면 클랜 원로가 승급할 수 있습니다.</p>':'<b>다음 아지트 · '+esc(names[current.stage])+'</b><p>공동 자금 '+number(funds)+' / '+number(nextCost)+' · '+(funds<nextCost?number(nextCost-funds)+' 부족':'비용 충족')+'</p><button type="button" class="org-primary" data-org-upgrade '+(treasury?.canUpgrade?'':'disabled')+'>클랜 자금으로 아지트 승급</button><p>'+((treasury?.elderIds||[treasury?.commanderId]).includes(Number(state.viewerId))?'승급 시 표시된 공동 자금이 소모됩니다.':'클랜 원로가 공동 자금으로 승급합니다.')+'</p>')+'</div></section>':'';
 return (compact?'':'<div class="org-section-head"><div><span class="org-kicker">02 / OUR HEADQUARTERS</span><h2>우리 클랜 아지트</h2></div><p>세력전 점령 지역에서 공동 자금을 쌓고<br>함께 아지트를 성장시키는 여정입니다.</p></div>')+status+
 '<section class="org-hideout-stage"><img class="org-building" src="/assets/ui/organization/hideouts-hd-v1/hideout-stage-'+(stage+1)+'-1536.webp" srcset="/assets/ui/organization/hideouts-hd-v1/hideout-stage-'+(stage+1)+'-960.webp 960w, /assets/ui/organization/hideouts-hd-v1/hideout-stage-'+(stage+1)+'-1536.webp 1536w" sizes="(max-width:700px) 100vw, 760px" width="1536" height="1024" alt="'+esc(names[stage])+' 아지트 전경"><div class="org-hideout-copy"><span class="org-stage-status '+(isCurrent?'is-current':'')+'">'+(current?(isCurrent?'현재 우리 클랜의 아지트':'성장 단계 미리보기'):'아지트 성장 미리보기')+'</span><span class="org-kicker">HEADQUARTERS / STAGE '+String(stage+1).padStart(2,'0')+'</span><h3>'+esc(names[stage])+'</h3><p>'+descriptions[stage]+'</p><p class="org-stage-condition">'+condition+'</p>'+(current&&!isCurrent?'<button type="button" class="org-secondary" data-stage="'+(current.stage-1)+'">현재 아지트로 돌아가기</button>':'')+'<p class="org-growth-note">세력전 회차 종료 시 점령 지역 수를 기준으로 자금을 적립합니다. 수입과 승급 비용이 미입력인 항목은 준비 상태입니다.</p></div></section><nav class="org-stage-tabs" aria-label="아지트 단계">'+names.map((name,i)=>'<button type="button" data-stage="'+i+'" aria-pressed="'+(i===stage)+'"><span>STAGE 0'+(i+1)+'</span><b>'+esc(name)+'</b><small>'+(current?.stage===i+1?'현재 아지트':i===0?'시작 단계':costs[i]===null?'비용 미입력':number(costs[i])+' 자금')+'</small></button>').join('')+'</nav>'+organizationHuntView(stage+1,{kind:huntKind});
}
