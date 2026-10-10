(()=>{
  const $=id=>document.getElementById(id),roles={WARDEN:'봉인대',ASSAULT:'정벌대',RESCUE:'구출대'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token=sessionStorage.getItem('madara_review_token')||'',actor=sessionStorage.getItem('madara_review_actor')||'',state=null,lastReceive=0,lastNow=0,busy=false,mounting=false,mountedKey='',pollTimer=null,pollFailures=0,resultShown=false,leaving=false;
  const nodes=new Map(),journal=new Map();
  const serverNow=()=>lastNow+(performance.now()-lastReceive);
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
  function persist(){sessionStorage.setItem('madara_review_token',token);sessionStorage.setItem('madara_review_actor',actor);}
  async function request(route,body=null,{payload=false,actorId=actor,retry=false}={}){
    const query=new URLSearchParams({since:String(state?.eventSeq||0)});if(actorId)query.set('actor',actorId);if(payload)query.set('payload','1');
    let lastError;
    for(let attempt=0;attempt<(retry?2:1);attempt++){
      try{
        const response=await fetch('/__madara/'+route+'?'+query,{method:body?'POST':'GET',headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(6000)});
        const result=await response.json();
        if(!response.ok){const error=Object.assign(new Error(result.error||'요청을 확인하세요.'),{status:response.status,code:result.code});throw error;}
        return result;
      }catch(error){lastError=error;if(error.status)throw error;}
    }
    throw lastError;
  }
  async function accept(result){
    if(result.token){token=result.token;actor='';persist();}
    if(!result.state)return;
    const incoming=result.state;
    if(state&&state.id===incoming.id&&state.me.id===incoming.me.id&&(incoming.revision<state.revision||incoming.revision===state.revision&&incoming.serverNow<state.serverNow))return;
    state=incoming;actor=state.me.id;persist();lastReceive=performance.now();lastNow=state.serverNow;pollFailures=0;
    $('connectionState').textContent='서버 연결됨';
    render();
    if(['ACTIVE','CLEAR','FAILED'].includes(state.status)){
      const key=state.me.id+':'+(state.phase===5?'SPIRIT':'MADARA');
      if(key!==mountedKey&&!mounting){
        mounting=true;updateClock();
        try{
          const currentPayload=result.payload|| (await request('state',null,{payload:true})).payload;
          await window.MadaraBattle.mount(currentPayload);mountedKey=key;window.MadaraBattle.restore(state);
        }catch(error){toast('전장 로딩 실패: '+error.message);$('battleNote').textContent='전장 준비 재시도 중';}
        finally{mounting=false;updateClock();}
      }else if(!mounting)window.MadaraBattle.update(state);
    }
    if(['CLEAR','FAILED'].includes(state.status)&&!resultShown){
      resultShown=true;$('resultTitle').textContent=state.status==='CLEAR'?'마다라 격파':'공대 작전 실패';
      $('resultReason').textContent=state.failure?.reason||'세 역할의 협동으로 완전체를 저지했습니다.';
      const seconds=Math.round((state.finishedAt-state.startedAt)/1000);
      $('resultStats').innerHTML=`<span><b>${seconds}</b>전투 시간, 초</span><span><b>${state.statistics.tasks}</b>완료 임무</span><span><b>${state.statistics.mistakes}</b>실수</span>`;
      $('resultDialog').showModal();
    }
  }
  function schedulePoll(){clearTimeout(pollTimer);if(token&&!leaving)pollTimer=setTimeout(poll,Math.min(8000,(document.hidden?2500:900)*2**Math.min(pollFailures,3)));}
  async function poll(){
    if(!token||busy||mounting){schedulePoll();return;}
    try{await accept(await request('state'));}
    catch(error){pollFailures++;$('connectionState').textContent='재연결 중 · 시간은 계속 흐릅니다';if([401,404].includes(error.status)){reset();toast(error.message);return;}}
    schedulePoll();
  }
  function taskNode(task){
    if(nodes.has(task.id))return nodes.get(task.id);
    const element=document.createElement('article');element.className='mr-task';element.dataset.taskId=task.id;
    element.innerHTML='<h3><span></span><small></small></h3><p class="task-clue"></p><p class="task-status"></p><div class="mr-choice-row"></div>';
    const row=element.querySelector('.mr-choice-row');if(task.kind==='PROTECT')row.classList.add('people');
    for(const choice of task.choices){
      const button=document.createElement('button');button.type='button';button.textContent=choice.label;button.dataset.target=choice.id;
      button.addEventListener('pointerdown',()=>{const current=state?.tasks.find(t=>t.id===task.id);button.press=current?{action:'TASK',taskId:current.id,token:current.token,target:choice.id,actorId:state.me.id}:null;});
      button.addEventListener('pointercancel',()=>button.press=null);
      button.addEventListener('click',event=>{const current=state.tasks.find(t=>t.id===task.id),input=event.detail&&button.press?button.press:{action:'TASK',taskId:current.id,token:current.token,target:choice.id,actorId:state.me.id};button.press=null;sendAction(input);});
      row.append(button);
    }
    nodes.set(task.id,element);$('taskList').append(element);return element;
  }
  function render(){
    const lobby=state.status==='LOBBY';$('staging').hidden=!lobby;$('combat').hidden=lobby;
    $('createForm').hidden=true;$('joinRow').hidden=true;$('assembly').hidden=!lobby;
    if(lobby){
      $('roomCode').textContent=state.id;
      $('lobbyMembers').innerHTML=state.members.map(m=>`<li><span>${escape(m.name)} <small>${roles[m.role]}</small></span><b>${m.ready?'준비 완료':'준비 중'}</b></li>`).join('');
      $('readyButton').textContent=state.me.ready?'준비 해제':'준비 완료';$('startButton').hidden=!state.me.isHost;
      $('startButton').disabled=busy||!state.members.every(m=>m.ready)||Object.keys(roles).some(r=>!state.members.some(m=>m.role===r));
      $('assemblyNote').textContent=state.mode==='COMMAND'?'단독 지휘: 전장에서 담당자를 바꿔 세 역할을 직접 조작합니다.':'이 컴퓨터의 다른 창에서 코드로 참가할 수 있습니다. 세 역할과 전원 준비가 필요합니다.';
      return;
    }
    $('phaseCounter').textContent=String(state.phase).padStart(2,'0')+' / 05';$('phaseName').textContent=state.phaseName;
    const percent=(state.bossHp/state.bossMaxHp*100);$('bossPercent').textContent=percent.toFixed(1)+'%';$('bossFill').style.width=percent+'%';
    [...$('phaseRail').children].forEach((el,i)=>el.classList.toggle('active',i+1===state.phase));
    $('roleName').textContent=roles[state.me.role];$('actorSelect').hidden=state.mode!=='COMMAND';
    const options=state.members.map(m=>`<option value="${escape(m.id)}">${roles[m.role]} · ${escape(m.name)}</option>`).join('');
    if($('actorSelect').dataset.options!==options){$('actorSelect').innerHTML=options;$('actorSelect').dataset.options=options;}$('actorSelect').value=state.me.id;
    const activeIds=new Set(state.tasks.map(t=>t.id));for(const [id,node]of nodes)if(!activeIds.has(id)){node.remove();nodes.delete(id);}
    for(const task of state.tasks){
      const node=taskNode(task);node.classList.toggle('done',task.done);
      node.querySelector('h3 span').textContent=task.label;node.querySelector('h3 small').textContent=task.done?'완료':`${task.index}/${task.total}`;
      node.querySelector('.task-clue').textContent=task.clue;
      node.querySelector('.task-status').textContent=task.done?'동료의 진행을 확인하세요.':task.echo?'증식한 분신부터 같은 문양으로 제거하세요.':task.blocked||(task.partnerName?`연결 담당: ${task.partnerName}`:'지금 수행할 수 있습니다.');
      node.querySelector('.mr-choice-row').hidden=task.done;
      for(const button of node.querySelectorAll('button'))button.classList.toggle('selected',task.selected.includes(button.dataset.target));
    }
    const q=state.challenge,who=id=>state.members.find(m=>m.id===id)?.name||'동료',signals=[];
    for(const [id,r]of Object.entries(q.signals))signals.push(`${who(id)}의 진실: ${r}`);
    for(const [id,r]of Object.entries(q.orders))signals.push(`${who(id)}의 낙인: ${r.join(' → ')}`);
    for(const [id,r]of Object.entries(q.bindings))signals.push(`${who(id)}의 운석 봉인: ${r.join(' → ')}`);
    if(q.preserve)signals.push(`보존할 결계: ${q.preserve}`);
    $('signalBoard').textContent=signals.join(' / ')||'동료가 공유한 문양이 이곳에 표시됩니다.';
    $('fireNotice').hidden=q.kind!=='FIRE'||state.step!=='MECHANIC';
    $('gazeBanner').hidden=!q.gaze||state.status!=='ACTIVE';
    if(q.gaze){$('gazeOwner').textContent=`거신의 시선 · ${q.gaze.ownerName}`;$('guardButton').hidden=q.gaze.ownerId!==state.me.id;$('guardButton').textContent=q.gaze.guarded?'결계 유지 중':'결계 유지';}
    $('attackPanel').hidden=state.step!=='DAMAGE';$('taskList').hidden=state.step==='DAMAGE'||state.step==='TRANSITION';
    $('attackHint').textContent=state.attackRemaining>0?`내 남은 공략 피해 ${Math.ceil(state.attackRemaining).toLocaleString()} · 공격 기회가 끝나기 전에 전원 달성`:'내 공략 완료 · 동료의 공격과 생존을 지원하세요.';
    $('healCount').textContent=state.resources.heal;$('soulCount').textContent=state.souls;$('strainCount').textContent=state.strain+' / 4';
    $('supportPanel').hidden=state.me.role!=='RESCUE';
    const dead=state.members.filter(m=>m.downCount>0),reviveOptions=dead.map(m=>`<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('');
    if($('reviveTarget').dataset.options!==reviveOptions){$('reviveTarget').innerHTML=reviveOptions||'<option value="">대상 없음</option>';$('reviveTarget').dataset.options=reviveOptions;}
    $('operationHint').textContent=state.step==='TRANSITION'?'다음 작전으로 이동합니다.':state.mode==='COMMAND'?'단독 지휘: 담당자 선택으로 다른 역할을 조작하세요.':'나의 임무를 완료한 뒤 동료의 공유 정보와 체력을 확인하세요.';
    $('battleNote').textContent=state.phase===5?'완전체 강림 · 거신의 시선을 확인하세요':'내 편성 · 공용 V3 전장';
    $('partyStrip').innerHTML=state.members.map(m=>`<div class="mr-party-chip"><strong>${escape(m.name)}</strong>${roles[m.role]} · ${m.tasksDone}/${m.tasksTotal}<meter min="0" max="${m.maxHp}" value="${m.hp}" aria-label="${escape(m.name)} 체력"></meter></div>`).join('');
    for(const event of state.events)if(event.type.startsWith('MADARA_'))journal.set(event.seq,event);
    while(journal.size>80)journal.delete(journal.keys().next().value);
    const journalKey=[...journal.keys()].join(',');if($('journal').dataset.key!==journalKey){$('journal').dataset.key=journalKey;$('journal').innerHTML=[...journal.values()].reverse().map(e=>`<li><time>${Math.max(0,Math.floor((e.at-state.startedAt)/1000))}초</time>${escape(e.label)}</li>`).join('');$('journalCount').textContent=journal.size+'개';}
    updateClock();
  }
  function updateClock(){
    if(!state||state.status==='LOBBY')return;const now=serverNow(),q=state.challenge,active=state.status==='ACTIVE',connected=performance.now()-lastReceive<6000;
    const remaining=at=>Math.max(0,(at-now)/1000);
    $('phaseClock').textContent=active?remaining(q.deadline).toFixed(1)+'초':'종료';$('enrageClock').textContent=remaining(state.endsAt).toFixed(0)+'초';
    const unavailable=busy||mounting||!active||!connected;
    $('actorSelect').disabled=busy||mounting;
    for(const task of state.tasks){const node=nodes.get(task.id);if(!node)continue;for(const button of node.querySelectorAll('button'))button.disabled=unavailable||Boolean(task.blocked)||task.done||task.selected.includes(button.dataset.target)||now>=q.deadline;}
    const gaze=q.gaze,marked=gaze?.ownerId===state.me.id&&now>=gaze.activeAt;
    if(gaze){$('gazeTime').textContent=now<gaze.activeAt?`반사까지 ${remaining(gaze.activeAt).toFixed(1)}초 · 대상자는 결계 유지`:`인계까지 ${remaining(gaze.endsAt).toFixed(1)}초 · 대상자는 공격 중단`;$('guardButton').disabled=unavailable||gaze.guarded;}
    const attackBlocked=unavailable||state.step!=='DAMAGE'||state.attackRemaining<=0||now<state.nextStrikeAt||marked||now>=q.deadline;
    $('strikeButton').disabled=attackBlocked;$('burstButton').disabled=attackBlocked||state.bursts<=0;
    $('strikeButton').textContent=marked?'시선 중 · 공격 중단':now<state.nextStrikeAt?`준비 ${remaining(state.nextStrikeAt).toFixed(1)}초`:'공격';$('burstButton').textContent=`결전 · ${state.bursts}회`;
    $('healButton').disabled=unavailable||!state.resources.heal||!state.members.some(m=>m.hp>0&&m.hp<m.maxHp);
    $('reviveButton').disabled=unavailable||!state.resources.revive||state.souls<1||!$('reviveTarget').value;
    if(q.kind==='FIRE')$('fireNotice').textContent=!q.firstDone?`첫 화염까지 ${remaining(q.firstAt).toFixed(1)}초 · 보존 결계 표시`:`두 번째 화염까지 ${remaining(q.secondAt).toFixed(1)}초 · ${q.preserve||'표시된'} 결계 보강`;
  }
  async function sendAction(input){
    if(busy||mounting)return;busy=true;updateClock();
    const command={requestId:crypto.randomUUID(),actorId:state.me.id,...input};
    try{await accept(await request('action',command,{retry:true}));}catch(error){toast(error.message);try{await accept(await request('state'));}catch{}}
    finally{busy=false;updateClock();schedulePoll();}
  }
  async function create(join=false){
    if(busy)return;busy=true;$('createButton').disabled=true;$('joinButton').disabled=true;
    try{await accept(await request(join?'join':'create',{name:$('playerName').value,mode:$('playMode').value,role:$('playerRole').value,code:$('joinCode').value},{actorId:''}));window.MadaraBattle.preload().catch(()=>{});schedulePoll();}
    catch(error){toast(error.message);}finally{busy=false;$('createButton').disabled=false;$('joinButton').disabled=false;}
  }
  async function lobbyAction(route){if(busy)return;busy=true;$('readyButton').disabled=true;$('startButton').disabled=true;try{await window.MadaraBattle.preload();await accept(await request(route,route==='ready'?{ready:!state.me.ready}:{},{payload:route==='start'}));}catch(error){toast(error.message);}finally{busy=false;$('readyButton').disabled=false;if(state)render();schedulePoll();}}
  function reset(){clearTimeout(pollTimer);window.MadaraBattle.teardown();token='';actor='';state=null;mountedKey='';resultShown=false;leaving=false;nodes.clear();journal.clear();$('taskList').replaceChildren();sessionStorage.removeItem('madara_review_token');sessionStorage.removeItem('madara_review_actor');$('staging').hidden=false;$('combat').hidden=true;$('createForm').hidden=false;$('joinRow').hidden=false;$('assembly').hidden=true;}
  $('createForm').addEventListener('submit',event=>{event.preventDefault();create();});$('joinButton').onclick=()=>create(true);
  $('readyButton').onclick=()=>lobbyAction('ready');$('startButton').onclick=()=>lobbyAction('start');
  $('copyCode').onclick=()=>navigator.clipboard.writeText(state.id).then(()=>toast('공대 코드를 복사했습니다.')).catch(()=>toast('공대 코드를 직접 복사하세요.'));
  $('jumpTasks').onclick=()=>document.querySelector('.mr-operations').scrollIntoView({block:'start'});
  $('jumpBattle').onclick=()=>document.querySelector('.mr-battle-pane').scrollIntoView({block:'start'});
  $('actorSelect').onchange=async event=>{if(busy||mounting)return;busy=true;actor=event.target.value;try{await accept(await request('state',null,{payload:true}));}catch(error){toast(error.message);}finally{busy=false;updateClock();}};
  $('strikeButton').onclick=()=>sendAction({action:'STRIKE',token:state.challenge.id});$('burstButton').onclick=()=>sendAction({action:'BURST',token:state.challenge.id});
  $('guardButton').onclick=()=>sendAction({action:'GUARD',token:`${state.challenge.id}:gaze:${state.challenge.gaze.index}`});
  $('healButton').onclick=()=>sendAction({action:'HEAL',token:state.challenge.id});$('reviveButton').onclick=()=>sendAction({action:'REVIVE',token:state.challenge.id,target:$('reviveTarget').value});
  $('guideButton').onclick=()=>$('guideDialog').showModal();$('closeGuide').onclick=()=>$('guideDialog').close();
  $('leaveButton').onclick=()=>$('leaveDialog').showModal();$('lobbyLeave').onclick=()=>$('leaveDialog').showModal();$('cancelLeave').onclick=()=>$('leaveDialog').close();
  $('confirmLeave').onclick=async()=>{leaving=true;try{await request('leave',{});$('leaveDialog').close();reset();}catch(error){leaving=false;toast(error.message);schedulePoll();}};
  $('retryButton').onclick=async()=>{$('resultDialog').close();try{await request('leave',{});}catch{}reset();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token)poll();});
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  function frame(){if(!document.hidden)updateClock();requestAnimationFrame(frame);}frame();
  window.MadaraPreview={diagnostics:()=>({state:state?structuredClone(state):null,busy,mounting,connectionAge:performance.now()-lastReceive,...window.MadaraBattle.diagnostics()})};
  if(token){busy=true;request('state',null,{payload:true}).then(accept).catch(error=>{reset();toast(error.message);}).finally(()=>{busy=false;schedulePoll();});}
})();
