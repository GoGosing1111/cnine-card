const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value||0).toLocaleString('ko-KR');
const descriptions=[
 '모든 조직이 새로 시작하는 첫 거점. 동료를 모으고 도시로 나아갈 준비를 합니다.',
 '낮은 골목의 불빛 아래, 조직만의 작은 사무실을 준비합니다.',
 '동료들이 돌아올 본거지. 영역을 넓혀 더 큰 조직으로 성장합니다.',
 '도시에 자리 잡은 조직의 거점. 다음 성장을 준비합니다.',
 '도시의 밤을 내려다보는 최종 아지트 콘셉트입니다.'
];
export const currentOrganization=state=>state.organizations.find(o=>o.id===state.membership?.organizationId)||null;
export function organizationRosterView(state){
 const org=currentOrganization(state);if(!org)return '';
 const members=state.roster||[];
 return '<section class="org-member-section" aria-labelledby="org-member-title"><header><div><span class="org-kicker">THE PEOPLE BEHIND OUR NAME</span><h3 id="org-member-title">함께 이름을 걸 동료들</h3></div><p><b>'+members.length+'</b> / 10명</p></header><ol class="org-member-grid">'+Array.from({length:10},(_,index)=>{
  const member=members.find(m=>m.slot===index+1);
  return '<li class="org-member-slot '+(member?.isSelf?'is-self':member?'':'is-vacant')+'"><span class="org-member-number">'+String(index+1).padStart(2,'0')+'</span><div><b title="'+esc(member?.nickname||'빈 자리')+'">'+esc(member?.nickname||'빈 자리')+'</b><small>'+(member?(member.isSelf?'나 · 조직원':'조직원'):'추가 배정 대기')+'</small></div>'+(member?.isSelf?'<span class="org-member-self">ME</span>':'')+'</li>';
 }).join('')+'</ol><p class="org-roster-note">현재 조직에 배정된 동료만 표시합니다. 빈 자리는 추가 모집·배정이 열릴 때 채워집니다.</p></section>';
}
export function organizationHideoutView(state,{stage=0,compact=false}={}){
 const names=state.preparation.hideouts,org=currentOrganization(state),current=org?.hideout,threshold=state.policy.hideoutThresholds[stage],isCurrent=!!current&&stage+1===current.stage;
 const tag=current?(isCurrent?'현재 우리 조직의 아지트':'성장 단계 미리보기'):'아지트 성장 미리보기';
 const condition=stage===0?'모든 조직이 출발하는 첫 단계':threshold===null?'성장 조건 미정':(state.policy.growthMode==='SPEND'?'소모 방식 초안 · ':state.policy.growthMode==='CUMULATIVE'?'누적 점수 기준 · ':'성장 기준 초안 · ')+number(threshold)+'점';
 const status=current?'<section class="org-headquarters-status" aria-label="우리 조직 아지트 현황"><div><span class="org-kicker">CURRENT HEADQUARTERS</span><h3>'+esc(current.name)+'</h3><p>현재 '+current.stage+'단계 · 조직 점수 <strong>'+number(current.points)+'</strong></p></div><div class="org-growth-status">'+(current.stage===5?'<b>최종 아지트 단계</b><p>성장 단계 5 / 5</p>':current.nextThreshold===null?'<b>다음 성장 조건 준비 중</b><p>점수 기준이 확정되면 성장 현황을 안내합니다.</p>':'<b>다음 아지트 · '+esc(current.nextName)+'</b><p>'+number(current.points)+' / '+number(current.nextThreshold)+'점 · '+(current.remainingPoints>0?number(current.remainingPoints)+'점 남음':'기준 도달 · 성장 반영 대기')+'</p><div class="org-growth-meter" role="progressbar" aria-label="다음 아지트 누적 점수" aria-valuemin="0" aria-valuemax="'+current.nextThreshold+'" aria-valuenow="'+Math.min(current.points,current.nextThreshold)+'"><i style="width:'+Math.min(100,current.points/current.nextThreshold*100)+'%"></i></div>')+'</div></section>':'';
 return (compact?'':'<div class="org-section-head"><div><span class="org-kicker">02 / OUR HEADQUARTERS</span><h2>골목에서, 도시의 가장 높은 곳까지.</h2></div><p>점령 지역을 정산해 조직 점수를 얻고<br>함께 아지트를 성장시키는 여정입니다.</p></div>')+status+
 '<section class="org-hideout-stage"><svg class="org-building" viewBox="'+(stage*303+12)+' 540 270 177" preserveAspectRatio="xMidYMid slice" role="img" aria-label="'+esc(names[stage])+' 아지트 콘셉트"><image href="'+esc(state.preparation.conceptImage)+'" width="1536" height="1024"/></svg><div class="org-hideout-copy"><span class="org-stage-status '+(isCurrent?'is-current':'')+'">'+tag+'</span><span class="org-kicker">HEADQUARTERS / STAGE '+String(stage+1).padStart(2,'0')+'</span><h3>'+esc(names[stage])+'</h3><p>'+descriptions[stage]+'</p><p class="org-stage-condition">'+condition+'</p>'+(current&&!isCurrent?'<button type="button" class="org-secondary" data-stage="'+(current.stage-1)+'">현재 아지트로 돌아가기</button>':'')+'<p class="org-growth-note">성장·전용 콘텐츠는 준비 중입니다.</p></div></section><nav class="org-stage-tabs" aria-label="아지트 단계">'+names.map((name,i)=>'<button type="button" data-stage="'+i+'" aria-pressed="'+(i===stage)+'"><span>STAGE 0'+(i+1)+'</span><b>'+esc(name)+'</b><small>'+(current?.stage===i+1?'현재 아지트':i===0?'시작 단계':state.policy.hideoutThresholds[i]===null?'조건 미정':'기준 '+number(state.policy.hideoutThresholds[i])+'점')+'</small></button>').join('')+'</nav><div class="org-locked-content">'+[['ORGANIZATION','조직 내부 콘텐츠','동료들과 함께할 조직 전용 활동을 준비합니다.'],['HUNTING GROUND','전용 사냥터','아지트 성장과 연결될 사냥터를 준비합니다.'],['EXCLUSIVE BOSS','전용 보스','조직의 이름으로 도전할 보스를 준비합니다.']].map(([en,title,desc])=>'<article><span class="org-kicker">'+en+'</span><h3>'+title+'</h3><p>'+desc+'<br>해금 조건과 보상은 추후 확정됩니다.</p></article>').join('')+'</div>';
}
