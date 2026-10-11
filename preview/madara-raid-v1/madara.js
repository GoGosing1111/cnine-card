(()=>{
  const $=id=>document.getElementById(id),roles={WARDEN:'봉인대',ASSAULT:'정벌대',RESCUE:'구출대'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token=localStorage.getItem('madara_review_identity')||sessionStorage.getItem('madara_review_token')||'',actor=sessionStorage.getItem('madara_review_actor')||'',state=null,lastReceive=0,lastNow=0,busy=false,mounting=false,mountedKey='',pollTimer=null,pollFailures=0,resultShown=false,leaving=false;
  let account=null,registryBusy=false,registryAt=0,pendingCreate=null,kickTarget='',showcase=false,scene='ILLUSION',sceneForm='',sceneCues=null,sceneVersion=0;
  const nodes=new Map(),journal=new Map();
  const serverNow=()=>lastNow+(performance.now()-lastReceive);
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,3500);}
  function persist(){localStorage.setItem('madara_review_identity',token);sessionStorage.setItem('madara_review_token',token);sessionStorage.setItem('madara_review_actor',actor);}
  async function request(route,body=null,{payload=false,actorId=actor,retry=false,form=''}={}){
    const query=new URLSearchParams({since:String(state?.eventSeq||0)});if(actorId)query.set('actor',actorId);if(payload)query.set('payload','1');
    if(form)query.set('form',form);
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
    if(result.token){token=result.token;persist();}
    if(result.account){account=result.account;updateWallet();}
    if(result.rooms)renderRooms(result.rooms);
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
  function schedulePoll(){clearTimeout(pollTimer);if(token&&!leaving&&!showcase)pollTimer=setTimeout(poll,Math.min(8000,(state?(document.hidden?2500:900):5000)*2**Math.min(pollFailures,3)));}
  async function poll(){
    if(!token||busy||mounting){schedulePoll();return;}
    try{if(state){await accept(await request('state'));if(state?.status==='LOBBY'&&performance.now()-registryAt>=5000)await refreshLobby(false);}else await refreshLobby(false);}
    catch(error){pollFailures++;$('connectionState').textContent='재연결 중 · 시간은 계속 흐릅니다';if([401,404].includes(error.status)||error.code==='KICKED'){reset();toast(error.message);if(error.status===401){token='';persist();await bootstrap();}else await refreshLobby(false);}}
    schedulePoll();
  }
  function taskNode(task){
    if(nodes.has(task.id))return nodes.get(task.id);
    const element=window.MadaraMechanics.mount(task,{getState:()=>state,send:sendAction});
    nodes.set(task.id,element);$('taskList').append(element);return element;
  }
  function render(){
    const lobby=state.status==='LOBBY';$('staging').hidden=!lobby;$('combat').hidden=lobby;
    $('createForm').hidden=true;$('joinRow').hidden=true;$('assembly').hidden=!lobby;
    if(lobby){
      $('roomCode').textContent=state.id;
      $('lobbyMembers').innerHTML=state.members.map((m,i)=>`<li><span class="mr-member-number">${String(i+1).padStart(2,'0')}</span><span class="mr-member-name">${escape(m.name)} ${m.id===state.hostId?'<em>공대장</em>':''}<small>${roles[m.role]}</small></span><b>${m.ready?'준비 완료':'대기'}</b>${state.me.isHost&&m.id!==state.hostId&&state.mode==='PARTY'?`<button class="mr-button quiet mr-kick" data-kick="${escape(m.id)}" aria-label="${escape(m.name)} 강퇴">강퇴</button>`:''}</li>`).join('');
      $('lobbyMembers').querySelectorAll('[data-kick]').forEach(button=>button.onclick=()=>{kickTarget=button.dataset.kick;const target=state.members.find(m=>m.id===kickTarget);$('kickSummary').textContent=`${target.name} · ${roles[target.role]}`;$('kickDialog').showModal();});
      $('roleReadiness').innerHTML=Object.entries(roles).map(([role,label])=>`<span class="${state.members.some(m=>m.role===role)?'filled':''}">${state.members.some(m=>m.role===role)?'✓':'○'} ${label}</span>`).join('');
      $('readyButton').textContent=state.me.ready?'준비 해제':'준비 완료';$('startButton').hidden=!state.me.isHost;
      $('startButton').disabled=busy||!state.members.every(m=>m.ready)||Object.keys(roles).some(r=>!state.members.some(m=>m.role===r));
      $('assemblyNote').textContent=state.mode==='COMMAND'?'단독 지휘: 전장에서 담당자를 바꿔 세 역할을 직접 조작합니다.':'3~6명 · 세 역할 · 전원 준비가 필요합니다. 다른 브라우저 또는 시크릿 창에서 참가하세요. 출정 후 강퇴는 잠깁니다.';
      $('showcaseButton').hidden=true;
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
      window.MadaraMechanics.update(taskNode(task),task);
    }
    const q=state.challenge,who=id=>state.members.find(m=>m.id===id)?.name||'동료',signals=[];
    for(const [id,r]of Object.entries(q.signals))signals.push(`${who(id)}의 진실: ${r}`);
    for(const [id,r]of Object.entries(q.orders))signals.push(`${who(id)}의 낙인: ${r.join(' → ')}`);
    for(const [id,r]of Object.entries(q.bindings))signals.push(`${who(id)}의 운석 봉인: ${r.join(' → ')}`);
    if(q.preserve)signals.push(`보존할 결계: ${q.preserve}`);
    $('signalBoard').textContent=signals.join(' / ')||'각자 다른 개인 단서입니다. 동료의 정답을 그대로 따라 누르지 마세요.';
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
    for(const task of state.tasks){const node=nodes.get(task.id);if(node)window.MadaraMechanics.clock(node,task,now,unavailable,q.deadline);}
    window.MadaraMechanics.summary(state,now);
    window.MadaraBattle.telegraph?.(state,now);
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
    $('confirmEntry').disabled=true;$('cancelEntry').disabled=true;
    try{const body=join?{name:$('playerName').value,role:$('playerRole').value,code:$('joinCode').value}:pendingCreate;
      await accept(await request(join?'join':'create',body,{actorId:'',retry:true}));pendingCreate=null;$('entryDialog').close();window.MadaraBattle.preload().catch(()=>{});await refreshLobby(false);schedulePoll();}
    catch(error){toast(error.message);if(error.status){pendingCreate=null;$('entryDialog').close();}}
    finally{busy=false;updateWallet();$('joinButton').disabled=false;$('confirmEntry').disabled=false;$('cancelEntry').disabled=false;}
  }
  async function lobbyAction(route){if(busy)return;busy=true;$('readyButton').disabled=true;$('startButton').disabled=true;try{await window.MadaraBattle.preload();await accept(await request(route,route==='ready'?{ready:!state.me.ready}:{},{payload:route==='start'}));}catch(error){toast(error.message);}finally{busy=false;$('readyButton').disabled=false;if(state)render();schedulePoll();}}
  function reset(){clearTimeout(pollTimer);sceneVersion++;window.MadaraBattle.teardown();actor='';state=null;mountedKey='';sceneForm='';showcase=false;resultShown=false;leaving=false;nodes.clear();journal.clear();$('taskList').replaceChildren();sessionStorage.removeItem('madara_review_actor');$('staging').hidden=false;$('combat').hidden=true;$('combat').classList.remove('showcase');$('showcaseControls').hidden=true;$('createForm').hidden=false;$('joinRow').hidden=false;$('assembly').hidden=true;$('showcaseButton').hidden=false;['kickDialog','leaveDialog','resultDialog'].forEach(id=>$(id).close());schedulePoll();}
  function updateWallet(){
    $('ticketBalance').textContent=account?`${account.tickets}장`:'—';$('createButton').disabled=busy||!account||account.tickets<1;
  }
  function renderRooms(rooms){
    $('roomCount').textContent=rooms.filter(r=>r.status==='LOBBY').length;
    $('registryStatus').textContent=`${new Date().toLocaleTimeString('ko-KR')} 갱신 · 5초마다 자동 갱신 · 참가자는 입장권 차감 없음`;
    const html=rooms.length?rooms.map(r=>`<article class="mr-room-row"><span class="mr-room-status ${r.status==='LOBBY'?'open':''}">${r.status==='LOBBY'?'모집 중':r.status==='ACTIVE'?'전투 중':'종료'}</span><div class="mr-room-title"><strong>${escape(r.hostName)}의 공대</strong><small>${escape(r.id)}</small></div><div class="mr-room-roles">${Object.entries(roles).map(([k,v])=>`<span class="${r.roles[k]?'filled':''}">${v} ${r.roles[k]?r.roles[k]+'명':'모집'}</span>`).join('')}</div><b class="mr-room-size">${r.members}<small> / 6</small></b><button class="mr-button ${r.canJoin?'primary':''}" data-join="${escape(r.id)}" ${r.canJoin?'':'disabled'}>${account?.roomId===r.id?'참가 중':r.canJoin?'참가':escape(r.blocked)}</button></article>`).join(''):'<div class="mr-empty"><span>募</span><h3>아직 모집 중인 공대가 없습니다</h3><p>첫 공대장이 되어 출정할 동료를 모아 보세요.</p></div>';
    if($('roomList').dataset.html!==html){$('roomList').innerHTML=html;$('roomList').dataset.html=html;$('roomList').querySelectorAll('[data-join]').forEach(button=>button.onclick=()=>{$('joinCode').value=button.dataset.join;create(true);});}
  }
  async function refreshLobby(manual=true){
    if(!token||registryBusy)return;registryBusy=true;$('refreshRooms').disabled=true;
    try{await accept(await request('lobby',null,{actorId:''}));registryAt=performance.now();if(manual)toast('공대 목록을 갱신했습니다.');}
    catch(error){$('registryStatus').textContent='목록을 불러오지 못했습니다. 목록 갱신으로 다시 시도하세요.';if(manual)toast(error.message);else throw error;}
    finally{registryBusy=false;$('refreshRooms').disabled=false;}
  }
  $('createForm').addEventListener('submit',event=>{event.preventDefault();if(!account||account.tickets<1)return;
    pendingCreate={requestId:crypto.randomUUID(),name:$('playerName').value,mode:$('playMode').value,role:$('playerRole').value};
    $('entrySummary').textContent=`${pendingCreate.name} · ${roles[pendingCreate.role]} · ${pendingCreate.mode==='PARTY'?'공대 플레이':'단독 지휘'}`;$('entryBefore').textContent=account.tickets+'장';$('entryAfter').textContent=(account.tickets-1)+'장';$('entryDialog').showModal();});
  $('confirmEntry').onclick=()=>{if(pendingCreate)create();};$('cancelEntry').onclick=()=>{$('entryDialog').close();pendingCreate=null;};
  $('joinButton').onclick=()=>create(true);$('refreshRooms').onclick=()=>refreshLobby();
  $('cancelKick').onclick=()=>$('kickDialog').close();$('confirmKick').onclick=async()=>{if(busy)return;busy=true;$('confirmKick').disabled=true;try{await accept(await request('kick',{targetId:kickTarget}));$('kickDialog').close();await refreshLobby(false);toast('공대원을 강퇴했습니다.');}catch(error){toast(error.message);}finally{busy=false;$('confirmKick').disabled=false;}};
  $('readyButton').onclick=()=>lobbyAction('ready');$('startButton').onclick=()=>lobbyAction('start');
  $('copyCode').onclick=()=>navigator.clipboard.writeText(state.id).then(()=>toast('공대 코드를 복사했습니다.')).catch(()=>toast('공대 코드를 직접 복사하세요.'));
  $('jumpTasks').onclick=()=>document.querySelector('.mr-operations').scrollIntoView({block:'start'});
  $('jumpSecondTask').onclick=()=>{const second=state?.tasks[1];if(second)nodes.get(second.id)?.scrollIntoView({block:'start'});};
  $('jumpBattle').onclick=()=>document.querySelector('.mr-battle-pane').scrollIntoView({block:'start'});
  $('actorSelect').onchange=async event=>{if(busy||mounting)return;busy=true;actor=event.target.value;try{await accept(await request('state',null,{payload:true}));}catch(error){toast(error.message);}finally{busy=false;updateClock();}};
  $('strikeButton').onclick=()=>sendAction({action:'STRIKE',token:state.challenge.id});$('burstButton').onclick=()=>sendAction({action:'BURST',token:state.challenge.id});
  $('guardButton').onclick=()=>sendAction({action:'GUARD',token:`${state.challenge.id}:gaze:${state.challenge.gaze.index}`});
  $('healButton').onclick=()=>sendAction({action:'HEAL',token:state.challenge.id});$('reviveButton').onclick=()=>sendAction({action:'REVIVE',token:state.challenge.id,target:$('reviveTarget').value});
  $('guideButton').onclick=()=>$('guideDialog').showModal();$('closeGuide').onclick=()=>$('guideDialog').close();
  $('leaveButton').onclick=()=>{if(showcase){reset();refreshLobby(false).catch(()=>{});}else $('leaveDialog').showModal();};$('lobbyLeave').onclick=()=>$('leaveDialog').showModal();$('cancelLeave').onclick=()=>$('leaveDialog').close();
  $('confirmLeave').onclick=async()=>{leaving=true;$('confirmLeave').disabled=true;try{await accept(await request('leave',{}));reset();await refreshLobby(false);}catch(error){leaving=false;toast(error.message);schedulePoll();}finally{$('confirmLeave').disabled=false;}};
  $('retryButton').onclick=async()=>{$('resultDialog').close();try{await accept(await request('leave',{}));}catch{}reset();refreshLobby(false).catch(()=>{});};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token)poll();});
  window.addEventListener('pagehide',()=>clearTimeout(pollTimer));
  function frame(){if(!document.hidden)updateClock();requestAnimationFrame(frame);}frame();
  async function playScene(key){
    scene=key;const version=++sceneVersion;mounting=true;$('sceneReplay').disabled=true;
    try{
      const form=key==='FINAL'?'spirit':'human';
      if(sceneForm!==form){const data=await request('showcase',null,{actorId:'',form});if(version!==sceneVersion)return;await window.MadaraBattle.mount(data.payload);if(version!==sceneVersion)return;sceneCues=data.cues;sceneForm=form;}
      const cue={...sceneCues[key],key,id:'review:'+crypto.randomUUID()};
      $('phaseName').textContent=cue.title;$('phaseCounter').textContent='CINEMATIC / LOCAL REVIEW';$('battleNote').textContent='연출 감상 · 실제 전투와 별도';$('connectionState').textContent='입장권 사용 없음';
      document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scene===key)));
      window.MadaraBattle.showcase(cue,{speed:Number($('sceneSpeed').value),effects:$('sceneEffects').checked,onFrame:(t,duration)=>{$('sceneSeek').max=duration;$('sceneSeek').value=t;$('sceneTime').textContent=t.toFixed(2)+'s';}});
      $('scenePause').textContent='일시정지';
    }catch(error){toast('연출 준비 실패: '+error.message);}finally{if(version===sceneVersion){mounting=false;$('sceneReplay').disabled=false;}}
  }
  $('showcaseButton').onclick=()=>{if(!token||state)return;showcase=true;clearTimeout(pollTimer);$('staging').hidden=true;$('combat').hidden=false;$('combat').classList.add('showcase');$('showcaseControls').hidden=false;window.scrollTo(0,0);playScene('ILLUSION');};
  document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{if(!mounting)playScene(b.dataset.scene);});
  $('sceneReplay').onclick=()=>playScene(scene);
  $('scenePause').onclick=()=>{$('scenePause').textContent=window.MadaraBattle.control('pause')?'계속 재생':'일시정지';};
  $('sceneSpeed').onchange=()=>window.MadaraBattle.control('speed',Number($('sceneSpeed').value));
  $('sceneSeek').oninput=()=>{window.MadaraBattle.control('seek',Number($('sceneSeek').value));$('scenePause').textContent='계속 재생';};
  $('sceneEffects').onchange=()=>window.MadaraBattle.control('effects',$('sceneEffects').checked);
  window.MadaraPreview={diagnostics:()=>({state:state?structuredClone(state):null,account,showcase,scene,busy,mounting,connectionAge:performance.now()-lastReceive,...window.MadaraBattle.diagnostics()})};
  async function bootstrap(){busy=true;try{
    let result;try{result=await request('session',{});}catch(error){if(error.status!==401)throw error;token='';persist();result=await request('session',{});}
    await accept(result);if(account.roomId)await accept(await request('state',null,{payload:true}));
  }catch(error){toast(error.message);}finally{busy=false;updateWallet();schedulePoll();}}
  bootstrap();
})();
