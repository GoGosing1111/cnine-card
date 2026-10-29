import {blackwingCommands,wardNames,runeNames} from './commands.mjs?v=20261029-field1';

const ART='/assets/raids/blackwing-20261024/';
const roles={BREAKER:'파쇄',GUARD:'수호',SEALER:'봉인'};
const seconds=ms=>Math.max(0,ms/1000).toFixed(1);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Project only the public participant snapshot. No answer solving, hidden
// weights, or client-side timing/permission decisions are introduced here.
export function battlefieldModel(state,now){
 const q=state.challenge,m=state.me,s=q.scale,model=blackwingCommands(state,now);
 const objects=[],utilities=model.buttons.filter(b=>b.action==='HEAL');
 const spec=(action,target)=>model.buttons.find(b=>b.action===action&&b.target===target);
 const object=(key,kind,title,caption,action,target,extra={})=>objects.push({key,kind,title,caption,command:spec(action,target),...extra});
 let title=state.phaseName,instruction='',clock='',clue='';
 if(state.status!=='ACTIVE')return {objects,utilities:[],title,instruction,clock,clue,details:[]};
 if(state.step==='DAMAGE'){
  title='역린 노출';instruction='보스의 노출된 역린을 눌러 편성 공격';
  object('strike','boss','역린 공격','내 공격 몫 '+Math.ceil(state.attackRemaining).toLocaleString(),'STRIKE',undefined,{anchor:'core'});
 }else if(state.step==='TRANSITION')instruction='맹약이 무너졌습니다 · 다음 기믹 준비';
 else if(s&&!s.done){
  const own=s.members.find(p=>p.id===m.id),locked=s.members.filter(p=>p.locked).length;
  title='용혈 저울';clue='내 무게 '+s.ownWeight+' · '+roles[m.role]+' '+(m.slot+1);
  instruction=own.locked?'배치 확정 · 동료의 맹약을 기다리는 중':'제단을 눌러 이동 · 서로 다른 역할 2명의 무게 합을 맞추세요';
  clock=(s.lockDeadline===null?'배치 ':'동시 확정 ')+seconds(Math.min(s.deadline,s.lockDeadline??Infinity)-now)+'초 · '+locked+'/6 확정';
  for(let i=0;i<3;i++){
   const peers=s.members.filter(p=>p.position===i);
   object('pad-'+i,'altar',wardNames[i].replace('의 성역','의 제단'),'목표 '+s.goals[i],'PLACE',i,{
    lane:i,selected:own.position===i,shadow:s.previous===i,locked:own.position===i&&own.locked,
    occupants:peers.map(p=>({name:p.name,role:roles[p.role],own:p.id===m.id,locked:p.locked})),
    footer:s.previous===i?'내 잔상 · 재진입 금지':peers.length+'/2명',
   });
  }
  if(own.position!==null)object('lock','commit',own.locked?'맹약 확정':'이 제단에서 확정',own.locked?'동료 대기':'첫 확정부터 6초','LOCK',undefined,{lane:own.position});
 }else{
  const oath=q.oaths?.[m.role],ready=!oath||oath.progress===2;
  if(!ready){
   instruction=(state.members.find(p=>p.id===oath.order[oath.progress])?.name||'동료')+'의 문양 차례';
   clue=Object.entries(q.oaths||{}).map(([role,o])=>roles[role]+' '+o.order.map((id,i)=>(i<o.progress?'✓ ':state.members.find(p=>p.id===id)?.name+' ')+runeNames[o.runes[i]]).join(' → ')).join(' / ');
   runeNames.forEach((r,i)=>object('rune-'+i,'rune',r+' 문양','공유 순서에 맞춰 각인','RUNE',i,{lane:i,glyph:['☀','☽','✦'][i]}));
  }
  if(ready){
  const d=q.debt,h=q.hearts;
  if(['DEBT','FINAL'].includes(q.kind)&&!d.reflected){
   const action=m.role==='BREAKER'?'CHARGE':m.role==='SEALER'?'ISOLATE':m.slot===1?'ANCHOR':'REFLECT';
   const label={CHARGE:'용혈 축적',ISOLATE:'부채 격리',ANCHOR:state.broken==='WING'?'검 반격 저지':'용혈 고정',REFLECT:'부채 반전'}[action];
   object('debt','relic',label,'용혈 '+d.packets+'/3 · 격리 '+d.seals.length+'/2',action,undefined,{position:'debt',footer:now<d.opensAt?'반전까지 '+seconds(d.opensAt-now)+'초':q.kind==='FINAL'&&state.broken==='WING'&&m.role==='GUARD'&&m.slot===1?'검 반격 '+seconds(d.opensAt+2500-now)+'초':'반전 '+seconds(d.closesAt-now)+'초'});
  }
  if(['HEARTS','FINAL'].includes(q.kind)&&!h.done){
   for(let i=0;i<2;i++){
    const action=m.role==='SEALER'?'ARM':m.role==='BREAKER'?'HEART':null;
    object('heart-'+i,'heart',(i?'오른':'왼')+' 심장',h.broken[i]?'파괴 완료':h.armed[i]?'봉인 해제':'봉인 중',m.slot===i?action:null,i,{lane:i,done:h.broken[i],footer:h.firstAt!==null?'동시 파괴 '+seconds(h.firstAt+3000-now)+'초':action==='ARM'?'눌러 봉인 해제':'준비 후 3초 내 동시 파괴'});
   }
  }
  if(q.kind==='SEVER'){
   const votes=Object.values(q.votes),chosen=votes.length===2&&votes[0]===votes[1]?votes[0]:null;
   clue+=(clue?' / ':'')+'흑익: 용염 2회 + 검 반격 / 대검: 용염 3회';
   clock='선택 '+votes.length+'/2 · 고정 '+q.braces.length+'/2 · 절단 '+q.cuts.length+'/2';
   for(const part of ['WING','BLADE']){
    if(m.role!=='SEALER'&&chosen!==part)continue;
    const action=m.role==='SEALER'?'VOTE':m.role==='GUARD'?'BRACE':'CUT';
    object('sever-'+part,'boss',part==='WING'?'흑익 절단':'대검 절단',part==='WING'?'용염 2회 · 검 반격':'용염 3회',m.role==='SEALER'||chosen===part?action:null,m.role==='SEALER'?part:undefined,{anchor:part==='WING'?'wing':'blade',selected:chosen===part,footer:'선택 '+votes.filter(v=>v===part).length+'/2 · 고정 '+q.braces.length+'/2 · 절단 '+q.cuts.length+'/2'});
   }
   if(m.role==='GUARD'&&!chosen)object('brace','boss','부위 고정','봉인 동료의 절단 선택 대기','BRACE',undefined,{anchor:'core'});
  }
  if(['SANCTUARY','FINAL'].includes(q.kind)&&q.breaths<q.breathGoal){
   for(let i=0;i<3;i++){
    const gate=spec('WARD',i),footer=q.wardLocked===i?'전개 완료':state.lastWard===i?'직전 성역 · 사용 불가':gate&&!gate.disabled?'지금 눌러 전개':'수호 '+(q.breaths%2+1)+' 담당';
    object('ward-'+i,'ward',wardNames[i],state.wards[i]+'/2 남음','WARD',i,{lane:i,selected:q.wardLocked===i,shadow:state.lastWard===i,footer});
   }
   clock='용염 '+(q.breaths+1)+'/'+q.breathGoal+' · '+seconds(q.breathAt-now)+'초';
  }
  }
  if(!instruction)instruction={DEBT:'용혈핵을 눌러 축적 → 격리 → 고정 → 반전',HEARTS:'두 심장의 봉인을 풀고 3초 안에 함께 파괴',SEVER:'보스의 흑익 또는 대검을 선택하고 고정 → 절단',SANCTUARY:'용염에 맞춰 바닥의 성역을 눌러 전개',FINAL:'용혈 반전 · 심장 파괴 · 성역 방어'}[q.kind]||'';
 }
 if(Number.isFinite(q.pressureAt))clock+=(clock?' · ':'')+'폭발 '+seconds(q.pressureAt-now)+'초';
 return {objects,utilities,title,instruction,clock,clue,details:model.details,kind:q.kind,step:state.step,scale:!!s&&!s.done};
}

// Stable DOM hit areas live inside the actual battle viewport. Timed polls
// patch text/state in place so pointerdown and click cannot lose their target.
export function createBattlefield(host){
 const field=document.createElement('section');field.className='bw-field';field.setAttribute('aria-label','전장 기믹');
 field.innerHTML='<header class="bw-field-brief"><span data-field-phase></span><strong data-field-title></strong><p data-field-instruction></p><b class="bw-scale-weight" data-field-clue></b><span data-field-clock></span></header><div class="bw-field-objects"></div><div class="bw-field-utility"></div><details class="bw-field-help"><summary>기믹 안내</summary><div data-field-help></div></details><p class="bw-field-status" role="status" aria-live="polite" data-status></p>';
 host.appendChild(field);let observer,observedDock;
 const objects=field.querySelector('.bw-field-objects'),utility=field.querySelector('.bw-field-utility');
 const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
 const setHtml=(el,value)=>{if(el.innerHTML!==value)el.innerHTML=value;};
 const layout=()=>{
  const dock=host.querySelector('.battle-v3-dock');
  if(dock&&dock!==observedDock){observer?.disconnect();observedDock=dock;observer=new ResizeObserver(layout);observer.observe(dock);}
  const height=dock?.getBoundingClientRect().height||125;
  field.style.setProperty('--bw-dock-height',height+'px');
 };
 function render(box,specs,busy){
  const old=new Map([...box.children].filter(el=>!el.hasAttribute('data-retry')).map(el=>[el.dataset.key,el]));
  for(const [index,s]of specs.entries()){
   let el=old.get(s.key);old.delete(s.key);
   if(!el){el=document.createElement('button');el.type='button';el.dataset.key=s.key;el.innerHTML='<img alt="" draggable="false"><span class="bw-object-glyph"></span><strong></strong><b class="bw-object-value"></b><span class="bw-object-occupants"></span><small></small>';}
   el.className='bw-field-object bw-object-'+s.kind+(s.selected?' is-selected':'')+(s.shadow?' is-shadow':'')+(s.done?' is-done':'')+(s.locked?' is-locked':'');
   const img=el.querySelector('img'),src=s.kind==='boss'?'field-target.webp':['relic','heart'].includes(s.kind)?'field-heart.webp':'field-altar.webp';
   if(!img.src.endsWith(src))img.src=ART+src;
   img.hidden=['commit','utility'].includes(s.kind);
   setText(el.querySelector('strong'),s.title);setText(el.querySelector('b'),s.caption||'');setText(el.querySelector('small'),s.footer||'');setText(el.querySelector('.bw-object-glyph'),s.glyph||'');
   setHtml(el.querySelector('.bw-object-occupants'),(s.occupants||[]).map(p=>'<span class="'+(p.own?'is-own':'')+'">'+(p.own?'나':esc(p.name))+' · '+p.role+(p.locked?' ✓':'')+'</span>').join(''));
   el.style.setProperty('--lane',s.lane??0);el.dataset.anchor=s.anchor||'';el.dataset.position=s.position||'';
   if(s.command){el.dataset.action=s.command.action;if(s.command.target!==undefined)el.dataset.target=s.command.target;else delete el.dataset.target;}else{delete el.dataset.action;delete el.dataset.target;}
   el.disabled=!s.command||s.command.disabled||busy;el.classList.toggle('is-observer',!s.command);el.setAttribute('aria-label',s.command?s.command.label+' · '+s.caption:s.title+' · '+s.caption);
   if(s.selected!==undefined)el.setAttribute('aria-pressed',String(!!s.selected));else el.removeAttribute('aria-pressed');
   if(box.children[index]!==el)box.insertBefore(el,box.children[index]||null);
  }
  for(const el of old.values())el.remove();
 }
 function update(state,now,{busy=false,pending=false,anchors=null}={}){
  const model=battlefieldModel(state,now);field.hidden=state.status!=='ACTIVE';
  field.dataset.kind=model.kind||'';field.dataset.step=model.step||'';field.classList.toggle('is-scale',model.scale);field.classList.toggle('is-final',model.kind==='FINAL'&&!model.scale);
  setText(field.querySelector('[data-field-phase]'),state.phase+'/5 · '+state.phaseName+' · '+roles[state.me.role]+' '+(state.me.slot+1));
  for(const key of ['title','instruction','clue','clock'])setText(field.querySelector('[data-field-'+key+']'),model[key]||'');
  setHtml(field.querySelector('[data-field-help]'),'<p>제단: 서로 다른 역할 2명 · 무게 합은 목표와 같아야 합니다. 내 무게는 본인만 볼 수 있습니다. 동료에게 전달하세요.</p><p>직전 발판에는 잔상이 남습니다. 첫 확정부터 6초 안에 전원 확정. 확정 전 이동 가능, 확정 후 변경 불가.</p>'+model.details.map(line=>'<p>'+esc(line)+'</p>').join(''));
  render(objects,model.objects,busy||pending);
  render(utility,model.utilities.map(b=>({key:b.key,kind:'utility',title:b.label,caption:'',command:b})),busy||pending);
  let retry=utility.querySelector('[data-retry]');if(pending&&!busy){if(!retry){retry=document.createElement('button');retry.type='button';retry.className='mr-button cn-ui-button';retry.dataset.retry='';retry.textContent='같은 요청 재시도';utility.appendChild(retry);}}else retry?.remove();
  layout();
  if(anchors)for(const el of objects.querySelectorAll('[data-anchor]:not([data-anchor=""])')){
   const p=anchors[el.dataset.anchor];if(p){el.style.setProperty('--anchor-x',p.x+'px');el.style.setProperty('--anchor-y',p.y+'px');}
  }
 }
 return {update,field,destroy(){observer?.disconnect();field.remove();}};
}
