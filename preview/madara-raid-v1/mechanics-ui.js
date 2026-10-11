/* Role-specific telegraphs use real text, shapes and the authored Madara art. */
(()=>{
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ART={ILLUSION:'illusion',CLONES:'clones',FIRE:'fire',METEOR:'meteor',FINAL:'awakening'};
  const PURPOSE={ILLUSION:'각자의 실체 조건을 식별하고 폭주를 정화하세요.',CLONES:'반사 분신을 피하고 빠른 시전을 먼저 끊으세요.',FIRE:'첫 화염 후 과열을 처리하고 동료의 보호 타이밍을 맞추세요.',METEOR:'핵의 노출과 낙하 충격에 맞춰 공격·보호를 전개하세요.',FINAL:'환술과 운석을 동시에 처리하며 시선 대상자는 공격을 멈추세요.'};
  const eye=shape=>shape==='닫힌 눈'?'<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M6 13Q32 40 58 13M15 21l-5 7M49 21l5 7M32 28v7"/></svg>':shape==='갈라진 눈'?'<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M3 18Q32-8 61 18Q32 44 3 18M35 2l-9 15 12 4-9 14"/><circle cx="32" cy="18" r="6"/></svg>':'<svg viewBox="0 0 64 36" aria-hidden="true"><path d="M3 18Q32-8 61 18Q32 44 3 18"/><circle cx="32" cy="18" r="11"/><circle cx="32" cy="18" r="6"/></svg>';
  function mount(task,{getState,send}){
    const node=document.createElement('article');node.className='mr-task mr-decision-task';node.dataset.taskId=task.id;
    node.innerHTML='<h3><span></span><small></small></h3><p class="task-clue"></p><p class="task-detail"></p><div class="mr-response-clock"><div><b class="response-state"></b><span class="response-time" role="timer"></span></div><div class="response-track"><i></i><em></em></div><small class="response-guide"></small></div><p class="task-status" role="status"></p><div class="mr-choice-row mr-target-grid"></div><div class="mr-task-feedback" role="status" hidden></div>';
    const row=node.querySelector('.mr-choice-row');
    // Reuse nodes across polls and changed patterns. A held pointer keeps the old token.
    for(let i=0;i<4;i++){
      const button=document.createElement('button');button.type='button';button.dataset.slot=i;
      const input=()=>{const state=getState(),current=state?.tasks.find(t=>t.id===task.id);return current?{action:'TASK',taskId:current.id,token:current.token,target:button.dataset.target,actorId:state.me.id}:null;};
      button.addEventListener('pointerdown',()=>button.press=input());
      button.addEventListener('pointercancel',()=>button.press=null);
      button.addEventListener('click',event=>{const value=event.detail&&button.press?button.press:input();button.press=null;if(value)send(value);});row.append(button);
    }
    return node;
  }
  function update(node,task){
    node.classList.toggle('done',task.done);node.dataset.type=task.decision.type;
    node.querySelector('h3 span').textContent=task.label;node.querySelector('h3 small').textContent=task.done?'✓ 완료':`${task.index+1} / ${task.total}`;
    node.querySelector('.task-clue').textContent=task.clue;node.querySelector('.task-detail').textContent=task.decision.detail;
    node.querySelector('.mr-choice-row').hidden=task.done;node.querySelector('.mr-response-clock').hidden=task.done;
    const buttons=node.querySelectorAll('.mr-choice-row button');
    for(let i=0;i<buttons.length;i++){
      const button=buttons[i],choice=task.choices[i];button.hidden=!choice;if(!choice)continue;
      button.dataset.target=choice.id;
      const key=JSON.stringify(choice);if(button.dataset.content===key)continue;button.dataset.content=key;
      button.className='mr-target'+(choice.reflected?' reflect':'')+(choice.preserved?' preserve':'')+(choice.shielded?' protected':'');
      const badge=choice.reflected?'⛔ 반사':choice.preserved?'◇ 보존':choice.shielded?'◇ 보호 중':task.decision.type==='INTERCEPT'?'◆ 타이밍 대응':`표적 ${i+1}`;
      const motif=choice.shape?eye(choice.shape):choice.rune?`<b>${esc(choice.rune)}</b>`:task.decision.type==='INTERCEPT'?'<b>◇</b>':'<b>＋</b>';
      button.innerHTML=`<small class="target-badge">${badge}</small><span class="target-motif">${motif}</span><strong>${esc(choice.label)}</strong><span class="target-detail">${esc(choice.detail)}</span>${choice.impactAt?'<span class="target-countdown"></span>':''}${choice.heat?`<span class="target-heat">열기 ${choice.heat}%<i style="width:${choice.heat}%"></i></span>`:''}`;
      button.setAttribute('aria-label',[choice.label,choice.detail,choice.threat?`위협 ${choice.threat}초`:'',choice.heat?`열기 ${choice.heat}%`:''].filter(Boolean).join(' · '));
    }
    const feedback=node.querySelector('.mr-task-feedback');feedback.hidden=!task.feedback;
    if(task.feedback){feedback.dataset.ok=String(task.feedback.ok);feedback.textContent=(task.feedback.ok?'✓ ':'! ')+task.feedback.reason;}
    node.querySelector('.task-status').textContent=task.done?'내 임무 완료 · 동료의 생존과 다음 기믹을 확인하세요.':task.blocked||'';
  }
  function clock(node,task,now,unavailable,phaseDeadline){
    const d=task.decision,remaining=at=>Math.max(0,(at-now)/1000),recover=now<d.recoveryAt,preview=now<d.readyAt,expired=now>=d.expiresAt;
    const stage=task.done?'done':recover?'recover':expired?'expired':preview?'preview':'respond';node.dataset.stage=stage;
    node.querySelector('.response-state').textContent=recover?'↻ 재정비':expired?'대응 종료 · 갱신 중':preview?(d.timed?'손 떼고 예고 확인':'예고 · 단서 확인'):d.type==='INTERCEPT'?'지금 보호 전개':d.type==='EXPOSURE'?'핵 노출 · 지금 타격':'판단 · 지금 대응';
    node.querySelector('.response-time').textContent=remaining(recover?d.recoveryAt:preview?d.readyAt:d.expiresAt).toFixed(1)+'초';
    const start=d.startedAt,end=d.expiresAt,width=(d.readyAt-start)/(end-start)*100;
    node.querySelector('.response-track i').style.width=width+'%';
    node.querySelector('.response-track em').style.left=Math.min(100,Math.max(0,(now-start)/(end-start)*100))+'%';
    node.querySelector('.response-guide').textContent=d.timed?'사선: 대기 / 밝은 구간: 대응 · 이른 입력도 실패로 판정':'예고가 끝나면 선택 · 완료할 때마다 새 단서 등장';
    for(let i=0;i<task.choices.length;i++){
      const button=node.querySelectorAll('.mr-choice-row button')[i],choice=task.choices[i];
      button.disabled=unavailable||task.done||recover||expired||now>=phaseDeadline||(!d.timed&&preview);
      if(choice.impactAt)button.querySelector('.target-countdown').textContent='충격 '+remaining(choice.impactAt).toFixed(1)+'초';
    }
  }
  function summary(state,now){
    const host=$('mechanicBrief');host.hidden=state.status!=='ACTIVE';if(host.hidden)return;
    const q=state.challenge,waiting=state.tasks.filter(t=>!t.done).sort((a,b)=>a.decision.expiresAt-b.decision.expiresAt),task=waiting[0];
    const art=`assets/animation/${ART[q.kind]}-04.png`;if($('mechanicArt').getAttribute('src')!==art)$('mechanicArt').src=art;
    $('mechanicPurpose').textContent=PURPOSE[q.kind];
    const text=state.step==='DAMAGE'?'전원 공격 · 내 피해 몫을 채우세요':state.step==='TRANSITION'?'다음 기믹 준비':task?task.label:'내 임무 완료 · 동료 지원';
    $('mechanicFocus').textContent=text;
    const marked=q.gaze?.ownerId===state.me.id;
    const note=marked?'! 거신의 시선: 나 · 결계 유지 후 공격 중단':task?(now<task.decision.readyAt?'예고를 읽고 대응 구간을 기다리세요.':task.clue):'개인 임무는 대신 처리할 수 없습니다.';
    $('mechanicAction').textContent=note;host.dataset.danger=String(marked);
    $('mechanicProgress').textContent=`내 임무 ${state.tasks.filter(t=>t.done).length}/${state.tasks.length} · 공대 ${state.members.reduce((s,m)=>s+m.tasksDone,0)}/${state.members.reduce((s,m)=>s+m.tasksTotal,0)}`;
    $('mechanicFocusTime').textContent=task?Math.max(0,((now<task.decision.readyAt?task.decision.readyAt:task.decision.expiresAt)-now)/1000).toFixed(1)+'초':'';
    const dual=state.tasks.length>1&&state.step==='MECHANIC';$('jumpSecondTask').hidden=!dual;
    const countdown=t=>t.done?'완료':Math.max(0,(t.decision.expiresAt-now)/1000).toFixed(0)+'초';
    $('jumpTasks').textContent=dual?'환술 '+countdown(state.tasks[0]):'임무 조작 ↓';
    if(dual)$('jumpSecondTask').textContent='운석 '+countdown(state.tasks[1]);
  }
  window.MadaraMechanics={mount,update,clock,summary};
})();
