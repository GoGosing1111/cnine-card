export const runeNames=['해','달','별'];
export const wardNames=['재의 성역','뼈의 성역','피의 성역'];
const roles={BREAKER:'파쇄',GUARD:'수호',SEALER:'봉인'};
const seconds=ms=>Math.max(0,ms/1000).toFixed(1);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function blackwingScaleMarkup(state,now){
 const s=state.challenge.scale;if(!s||s.done)return '';
 const me=s.members.find(m=>m.id===state.me.id),locked=s.members.filter(m=>m.locked).length;
 return '<section class="bw-scale"><header><b>용혈 저울 <span>'+locked+'/6 확정</span></b><strong class="bw-scale-weight">내 무게 <em>'+s.ownWeight+'</em></strong></header>'+
  '<p>내 무게를 동료에게 전달하세요. 각 발판에 <b>서로 다른 역할 2명</b>을 배치해 목표 합계를 맞춥니다.</p>'+
  '<div class="bw-scale-pads">'+wardNames.map((name,i)=>'<div class="'+(me.position===i?'is-selected ':'')+(s.previous===i?'is-shadow':'')+'"><b>'+name.replace('의 성역',' 발판')+'</b><strong>목표 '+s.goals[i]+'</strong>'+s.members.filter(m=>m.position===i).map(m=>'<span>'+roles[m.role]+' '+escapeHtml(m.name)+(m.id===state.me.id?' · '+s.ownWeight:' · ?')+(m.locked?' ✓':'')+'</span>').join('')+(s.previous===i?'<small>내 잔상 · 재진입 금지</small>':'')+'</div>').join('')+'</div>'+
  '<p class="bw-scale-clock" data-scale-clock></p>'+
  '<details><summary>저울 규칙 · '+s.members.filter(m=>m.position===null).length+'명 미배치</summary><p>각자 무게는 본인에게만 보입니다. 목표 합계·2명·서로 다른 역할·직전 발판 금지를 모두 만족해야 합니다. 배치는 확정 전까지 변경할 수 있습니다. 첫 확정부터 6초, 한 번 확정하면 변경할 수 없습니다.</p><p>오답은 침식 1중첩과 HP 10% 피해. 저울이 새로 출제되며 남은 시간은 늘어나지 않습니다. 성역 내구도는 이후 용염 방어에 사용됩니다.</p></details></section>';
}

// Pure projection of the same server snapshot used for combat. The three rune
// choices stay in fixed positions; only their shared instruction changes.
export function blackwingCommands(state,now){
 const q=state.challenge,m=state.me,d=q.debt,h=q.hearts,buttons=[],details=[];
 const add=(label,action,target,disabled=false)=>buttons.push({key:action+':'+(target??''),label,action,target,disabled});
 const ownOath=q.oaths?.[m.role],ownReady=!ownOath||ownOath.progress===2;
 if(state.status!=='ACTIVE')return {buttons,details:['전투기록에서 단계별 입력과 실패 원인을 확인할 수 있습니다.']};
 if(q.pressureAt!==null&&Number.isFinite(q.pressureAt))details.push('용혈 폭발 '+seconds(q.pressureAt-now)+'초 후 · 전원 최대 HP 20% 피해');
 if(state.step==='DAMAGE'){
  details.push('역린 노출 · 내 공격 몫 '+Math.ceil(state.attackRemaining).toLocaleString()+' 남음');
  add('편성 공격','STRIKE',undefined,state.attackRemaining<=0||now<state.nextStrikeAt);
 }else if(state.step==='TRANSITION')details.push('다음 맹약으로 이동 중 · 다음 폭발에 대비해 체력을 확인하세요.');
 else if(q.scale&&!q.scale.done){
  const s=q.scale,own=s.members.find(x=>x.id===m.id);
  for(let i=0;i<3;i++)add((own.position===i?'선택 · ':'')+wardNames[i].replace('의 성역',' 발판')+' 배치','PLACE',i,own.locked);
  add(own.locked?'확정 완료 · 동료 대기':'이 배치 확정 · 6인 동시','LOCK',undefined,own.locked||own.position===null);
  details.push(s.previous===null?'첫 저울 · 같은 역할끼리 함께 서지 마세요.':'직전 저울의 '+wardNames[s.previous].replace('의 성역',' 발판')+'에는 잔상이 남아 있습니다.');
  details.push('배치 후 공대가 모두 준비되면 확정하세요. 첫 확정부터 6초입니다.');
 }
 else{
  if(!ownReady){
   const turn=state.members.find(x=>x.id===ownOath.order[ownOath.progress]);
   details.push((turn?.name||'동료')+'의 문양 차례 · 공유 문양판 순서대로 입력');
   for(let i=0;i<3;i++)add(runeNames[i]+' 문양','RUNE',i,turn?.id!==m.id);
  }
  if(['DEBT','FINAL'].includes(q.kind)&&!d.reflected){
   details.push('용혈 '+d.packets+'/3 · 격리 '+d.seals.length+'/2 · '+(now<d.opensAt?'반전 시작 '+seconds(d.opensAt-now)+'초 후':'반전 마감 '+seconds(d.closesAt-now)+'초'));
   if(q.kind==='FINAL'&&state.broken==='WING'&&!d.anchor)details.push('수호 2 검 반격: '+(now<d.opensAt?'시작까지 '+seconds(d.opensAt-now)+'초':now<d.opensAt+2500?'대응 가능 · '+seconds(d.opensAt+2500-now)+'초 남음':'대응 시간 종료 · 다음 용혈 회차 대기'));
   if(ownReady&&m.role==='BREAKER')add('용혈 축적','CHARGE',undefined,d.packets>=3||now<state.nextStrikeAt);
   if(ownReady&&m.role==='SEALER')add('부채 격리','ISOLATE',undefined,d.seals.includes(m.id)||d.packets!==3);
   if(m.role==='GUARD')m.slot===1?add(state.broken==='WING'?'검 반격 저지':'용혈 고정','ANCHOR',undefined,d.anchor||now<d.opensAt||(q.kind==='FINAL'&&state.broken==='WING'&&now>=d.opensAt+2500)):add('부채 반전','REFLECT',undefined,!d.anchor||d.seals.length!==2||now<d.opensAt);
  }
  if(['HEARTS','FINAL'].includes(q.kind)&&!h.done){
   details.push('심장 준비 '+h.armed.filter(Boolean).length+'/2 · '+(h.firstAt!==null?'동시 파괴 '+seconds(h.firstAt+3000-now)+'초 남음':'두 파쇄가 3초 이내 간격으로 파괴'));
   if(ownReady&&m.role==='SEALER')add((m.slot?'우':'좌')+'심장 준비','ARM',m.slot,h.armed[m.slot]);
   if(ownReady&&m.role==='BREAKER')add((m.slot?'우':'좌')+'심장 파괴','HEART',m.slot,!h.armed.every(Boolean)||h.broken[m.slot]||now<state.nextStrikeAt);
  }
  if(q.kind==='SEVER'){
   const votes=Object.values(q.votes);details.push('절단 합의 '+votes.length+'/2 · 수호 고정 '+q.braces.length+'/2 · 절단 '+q.cuts.length+'/2');
   details.push('선택: '+(votes.map(v=>v==='WING'?'흑익':'대검').join(' / ')||'미정'));
   if(ownReady&&m.role==='SEALER'){add('흑익 선택','VOTE','WING',q.cuts.length>0);add('대검 선택','VOTE','BLADE',q.cuts.length>0);}
   if(m.role==='GUARD')add('부위 고정','BRACE',undefined,q.braces.includes(m.id));
   if(ownReady&&m.role==='BREAKER')add('합의 부위 절단','CUT',undefined,votes.length!==2||votes[0]!==votes[1]||q.braces.length!==2||q.cuts.includes(m.id));
  }
  if(['SANCTUARY','FINAL'].includes(q.kind)&&q.breaths<q.breathGoal){
   const ready=!q.oaths||Object.values(q.oaths).every(o=>o.progress===2),opens=q.breathAt-(state.wardWindowMs||2500);
   details.push('용염 '+(q.breaths+1)+'/'+q.breathGoal+' · 수호 '+(q.breaths%2+1)+' 담당 · '+seconds(q.breathAt-now)+'초 후');
   details.push(q.wardLocked!==null?wardNames[q.wardLocked]+' 전개 완료':!ready?'파쇄·봉인 문양 완성 대기':now<opens?'성역 입력까지 '+seconds(opens-now)+'초':'지금 성역 전개 · '+seconds(q.breathAt-now)+'초 남음');
   if(m.role==='GUARD')wardNames.forEach((v,i)=>add(v+' · '+state.wards[i]+'/2','WARD',i,!ready||m.slot!==q.breaths%2||q.wardLocked!==null||!state.wards[i]||state.lastWard===i||now<opens||now>=q.breathAt));
   if(!ownOath||ownReady)details.push('같은 성역 연속 사용 불가 · 성공해도 잔열 HP 6% 피해');
  }
 }
 if(m.role==='GUARD'){
  const hurt=state.members.some(x=>x.hp>0&&x.hp<x.maxHp);
  add('공대 30% 회복 · '+state.resources.heal+'/4','HEAL',undefined,!hurt||state.resources.heal<=0||now<(state.resources.healReadyAt||0));
  if(now<(state.resources.healReadyAt||0))details.push('공대 회복 준비 '+seconds(state.resources.healReadyAt-now)+'초');
 }
 return {buttons,details};
}

// Preserve button nodes across 200ms clock updates and polling. Replacing a
// pressed node between pointerdown and click caused apparent missed input.
export function reconcileBlackwingButtons(box,buttons,busy){
 const existing=new Map([...box.children].map(el=>[el.dataset.key,el]));
 buttons.forEach((spec,index)=>{
  let el=existing.get(spec.key);existing.delete(spec.key);
  if(!el){el=document.createElement('button');el.type='button';el.className='mr-button cn-ui-button primary';el.dataset.key=spec.key;el.dataset.action=spec.action;if(spec.target!==undefined)el.dataset.target=String(spec.target);}
  if(el.textContent!==spec.label)el.textContent=spec.label;
  el.disabled=spec.disabled||busy;
  if(box.children[index]!==el)box.insertBefore(el,box.children[index]||null);
 });
 for(const el of existing.values())el.remove();
}

export function blackwingLogText(state,entries){
 return ['흑익의 맹약 · 공대 '+state.id,'분기: '+({WING:'흑익 절단 · 최종 용염 2회 + 2.5초 검 반격',BLADE:'대검 절단 · 최종 용염 3회'}[state.broken]||'미확정'),'결과: '+(state.failure?.reason||state.status),'최근 최대 400건 · 서버 판정 기록',...entries.map(e=>'['+Math.max(0,(e.at-state.startedAt)/1000).toFixed(1)+'초 / '+e.phase+'단계] '+e.label+(e.reason?' — '+e.reason:''))].join('\n');
}
