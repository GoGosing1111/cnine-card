(() => {
  'use strict';
  const $=id=>document.getElementById(id),roles={ASSAULT:'정벌대',WARDEN:'봉인대',RESCUE:'구출대'},runes=['달','가시','왕관'];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token=sessionStorage.getItem('lichReviewToken')||'',state=null,eventSeq=0,polling=false,mounting=false,mounted=false,busy=false,offset=0,commandKey='',toastTimer,ended=false;
  const roleAllowed=role=>state?.mode==='COMMAND'||state?.me.role===role;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  async function api(route,body){const response=await fetch('/__lich/'+route,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok){if(response.status===401){token='';sessionStorage.removeItem('lichReviewToken');}throw new Error(result.error||'요청 실패');}return result;}
  function screen(name){['landing','lobby','combat'].forEach(id=>$(id).hidden=id!==name);}
  const remaining=ms=>Math.max(0,Math.ceil(ms/1000));
  const fmt=ms=>{const sec=remaining(ms);return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');};
  function times(){if(!state)return;const now=Date.now()+offset,c=state.challenge;if(state.endsAt)$('enrageTime').textContent=fmt(state.endsAt-Math.max(now,state.startedAt));if(c){$('stepTime').textContent=remaining(c.deadline-now)+'s';const duration=state.step==='EXPOSED'?10000:c.deadline-c.startedAt;$('windowFill').style.width=Math.max(0,Math.min(100,(c.deadline-now)/duration*100))+'%';}}
  function button(action,label,target='',style='',disabled=false){return `<button type="button" data-action="${action}" data-target="${esc(target)}" class="${style}" ${disabled?'disabled':''}>${esc(label)}</button>`;}
  function group(label,role,buttons){return `<div class="action-group"><div class="action-label">${label}<span>${roles[role]}</span></div><div class="action-buttons">${buttons}</div></div>`;}
  function row(title,value,description,{danger=false,resolved=false}={}){return `<div class="mechanic-row ${danger?'danger':''} ${resolved?'resolved':''}"><div class="row-head"><span>${title}</span><strong>${value}</strong></div><p>${description}</p></div>`;}
  function commands(){
    const c=state.challenge,r=state.resources;if(!c)return;
    const key=JSON.stringify([state.step,c.kind,c.plague,c.plagueStacks,c.prison,c.cast,c.interrupted,c.sealIndex,c.sealed,c.rescued,Boolean(c.rescueAt),c.transferred,c.cleansed,r,state.souls,state.doom,state.round,state.me.role,state.fighters.map(f=>f.hp<=0)]);
    if(commandKey===key)return;commandKey=key;
    const names={PLAGUE:'죽음의 역병',PRISON:'얼어붙은 저주',CONVERGENCE:'세 갈래의 죽음',FINALE:'왕의 최후'};
    let mechanics=`<div class="mechanic-title"><h2>${state.step==='EXPOSED'?'왕의 방벽 붕괴':state.step==='TRANSITION'?'다음 작전 준비':state.step==='READY'?'전장 집결':names[c.kind]}</h2><small>${state.round} / 7</small></div>`,actions='';
    if(state.step==='READY')mechanics+=row('출정 준비','12초','차단은 영혼 말살에, 감옥은 절대영도까지. 준비 시간이 끝나면 전투가 시작됩니다.');
    else if(state.step==='TRANSITION')mechanics+=row('방벽 돌파','다음 기믹','사용한 자원과 카드 체력은 유지됩니다.');
    else if(state.step==='EXPOSED'){
      mechanics+=row('공격 기회',c.transferred?'갑옷 약화 +25%':'정벌대 집중 공격','제한 시간 안에 다음 방벽까지 돌파하세요. 공격은 1.2초마다 가능합니다.');
      actions=group('왕좌 집중 공격','ASSAULT',button('STRIKE','집중 공격','','attack',!roleAllowed('ASSAULT'))+button('BURST','결전 ×'+r.burst,'','burst',!roleAllowed('ASSAULT')||r.burst===0));
    }else{
      if(c.kind!=='FINALE'){
        mechanics+=row('죽음의 역병',c.plague?`${c.plagueStacks}중첩 · ${esc(c.plagueRune)}`:c.transferred?'전이 완료':'정화 완료',`${esc(c.targetName)} · ${c.prison?'감옥 해제 후 전이 가능':'2~4중첩에 같은 문양의 구울에게 전이'}`,{danger:c.plagueStacks>=4,resolved:!c.plague});
        if(['PRISON','CONVERGENCE'].includes(c.kind))mechanics+=row('서리 감옥',c.prison?'엄폐 유지':c.breathResolved?'절대영도 통과':'엄폐 소실',c.prison?'6초 뒤 절대영도. 감옥이 냉기를 흡수합니다.':c.breathResolved?'남은 역병과 영혼 말살을 처리하세요.':'절대영도를 막을 감옥이 없습니다.',{danger:!c.prison&&!c.breathResolved,resolved:c.breathResolved});
        mechanics+=row('리치왕 시전',c.interrupted?'차단 완료':c.cast==='SOUL_ANNIHILATION'?'영혼 말살':'서리 폭발',c.cast==='SOUL_ANNIHILATION'?'5초 안에 차단하지 못하면 공대 전멸.':'서리 폭발 뒤에 영혼 말살이 이어집니다.',{danger:!c.interrupted&&c.cast==='SOUL_ANNIHILATION',resolved:c.interrupted});
        if(c.plague)actions+=group(`전이 대상 · 숙주 문양 ${esc(c.plagueRune)}`,'RESCUE',runes.map(rune=>button('TRANSFER',rune+' 구울',rune,'',!roleAllowed('RESCUE')||c.prison||c.plagueStacks<2)).join(''));
        if(!c.interrupted)actions+=group('차단 자원을 신중하게 사용','WARDEN',button('INTERRUPT',c.cast==='SOUL_ANNIHILATION'?'영혼 말살 차단':'서리 폭발 차단','','critical',!roleAllowed('WARDEN')||r.interrupt===0||c.decoyInterrupted&&c.cast==='FROST_NOVA'));
      }
      if(['CONVERGENCE','FINALE'].includes(c.kind)){
        mechanics+=row('서리한 내부',c.rescueAt?'구출 중…':`구출 ${c.rescued} / 2`,`${esc(c.ghostRune)} 문양의 영혼을 구하세요. 마지막 왕관에는 영혼 3개가 필요합니다.`);
        if(c.rescued<2)actions+=group('구출 대상 · '+esc(c.ghostRune)+' 문양','RESCUE',runes.map(rune=>button('RESCUE',rune+' 영혼',rune,'',!roleAllowed('RESCUE')||Boolean(c.rescueAt))).join(''));
        mechanics+=row('봉인 순서',c.sealed?'해제 완료':c.sealIndex+' / 3',c.sequence.map((rune,i)=>`<span class="${i===c.sealIndex?'sigil':''}">${esc(rune)}</span>`).join(' → '),{resolved:c.sealed});
        if(!c.sealed)actions+=group(c.kind==='FINALE'?'왕관 해제 · 영혼 3개 필요':'봉인 순서대로 해제','WARDEN',runes.map(rune=>button('SEAL',rune,rune,'',!roleAllowed('WARDEN')||c.kind==='FINALE'&&state.souls<3)).join(''));
      }
    }
    $('mechanics').innerHTML=mechanics;$('actions').innerHTML=actions;
    $('resourceBar').innerHTML=[['차단',r.interrupt],['정화',r.cleanse],['방벽',r.guard],['회복',r.heal],['부활',r.revive],['결전',r.burst]].map(([label,n])=>`<span>${label}<b>${n}</b></span>`).join('');
    let support=button('HEAL','공대 회복','','',!roleAllowed('RESCUE')||r.heal===0||state.step==='READY'||state.step==='TRANSITION');
    if(state.step==='MECHANIC'&&c.plague)support+=button('CLEANSE','역병 정화','','',!roleAllowed('RESCUE')||r.cleanse===0||c.prison);
    if(c.prison&&state.step==='MECHANIC')support+=button('SHATTER','감옥 파괴','','',!roleAllowed('ASSAULT'));
    if(state.step==='MECHANIC'&&!c.breathResolved&&['PRISON','CONVERGENCE'].includes(c.kind))support+=button('GUARD','비상 방벽','','',!roleAllowed('WARDEN')||r.guard===0||c.guarded);
    const dead=state.fighters.find(f=>f.hp<=0);if(dead)support+=button('REVIVE',dead.title+' 부활',dead.id,'',!roleAllowed('RESCUE')||r.revive===0||state.souls<1);
    $('supportActions').innerHTML=support;
    $('doomValue').textContent=state.doom+' / 3';$('soulValue').textContent=state.souls;
  }
  function render(result){
    const next=result.state;if(state&&next.id===state.id&&(next.serverNow<state.serverNow||next.serverNow===state.serverNow&&next.revision<state.revision))return;
    const events=next.events.filter(e=>e.seq>eventSeq);eventSeq=Math.max(eventSeq,next.eventSeq);state=next;offset=state.serverNow-Date.now();
    if(state.status==='LOBBY'){
      screen('lobby');$('createForm').hidden=true;$('assembly').hidden=false;$('roomCode').textContent=state.id;
      $('memberList').innerHTML=state.members.map(m=>`<li>${esc(m.name)}<span>${roles[m.role]}</span></li>`).join('');
      $('startButton').hidden=!state.me.isHost;$('startButton').disabled=state.mode==='PARTY'&&!Object.keys(roles).every(role=>state.members.some(m=>m.role===role));
    }else{
      screen('combat');$('phaseCaption').textContent=`PHASE ${state.phase} / 4 · ${state.mode==='COMMAND'?'단독 기믹 검수':state.id}`;$('phaseTitle').textContent=state.phaseName;
      const pct=state.bossHp/state.bossMaxHp*100;$('bossHealth').textContent=pct.toFixed(1)+'%';$('bossFill').style.width=pct+'%';
      [...$('phaseTrack').children].forEach((li,i)=>li.classList.toggle('active',i+1===state.phase));
      $('roleLabel').textContent=state.mode==='COMMAND'?'공대 지휘 · 세 역할 조작':roles[state.me.role];
      commands();times();
      if(mounted)window.LichBattle.enqueue(events,state);
      for(const e of events.filter(e=>e.type.startsWith('RAID_'))){const li=document.createElement('li');li.innerHTML=`<time>${fmt(Math.max(0,e.at-state.startedAt))}</time>${esc(e.label)}`;$('journal').prepend(li);if($('journal').children.length>40)$('journal').lastElementChild.remove();$('journalStatus').textContent=e.label;}
      if(['CLEAR','FAILED'].includes(state.status)&&!ended){ended=true;showResult();}
    }
  }
  async function mount(result){if(mounted||mounting)return;mounting=true;try{screen('combat');await window.LichBattle.mount(result.payload);mounted=true;window.LichBattle.restore(state||result.state);render(result);}catch(error){toast('전장 준비 실패: '+error.message);console.error(error);}finally{mounting=false;}}
  function showResult(){const clear=state.status==='CLEAR';$('resultDialog').classList.toggle('is-clear',clear);$('resultCaption').textContent=clear?'CONQUEST COMPLETE':'EXPEDITION FAILED';$('resultTitle').textContent=clear?'리치왕 정벌 성공':'공대 전멸';$('resultReason').textContent=clear?'죽음의 왕좌가 무너졌습니다. 검수판 정벌 기록이며 운영 보상은 지급되지 않습니다.':state.failure?.reason||'공략에 실패했습니다.';$('resultStats').innerHTML=`<span><b>${state.round}/7</b>도달 작전</span><span><b>${state.statistics.mistakes}</b>누적 실수</span><span><b>${state.statistics.rescues}</b>영혼 구출</span>`;$('resultDialog').showModal();}
  async function sync(){if(!token||polling||mounting)return;polling=true;try{const result=await api('state?since='+eventSeq+(!mounted?'&payload=1':''));render(result);if(result.state.status!=='LOBBY'&&!mounted)await mount(result);}catch(error){if(!token){screen('lobby');$('createForm').hidden=false;$('assembly').hidden=true;}toast(error.message);}finally{polling=false;}}
  function clearSession(){token='';sessionStorage.removeItem('lichReviewToken');state=null;eventSeq=0;ended=false;mounted=false;commandKey='';window.LichBattle.teardown();$('journal').innerHTML='';$('createForm').hidden=false;$('assembly').hidden=true;}
  async function establish(route,body){if(busy)return;busy=true;try{clearSession();const result=await api(route,body);token=result.token;sessionStorage.setItem('lichReviewToken',token);render(result);if(result.state.mode==='COMMAND')await start(result);}catch(error){toast(error.message);}finally{busy=false;}}
  async function start(preloaded){const result=preloaded?.payload?preloaded:await api('state?payload=1');await mount(result);if(!mounted)return;render(await api('start',{}));}
  $('enterButton').onclick=()=>{screen('lobby');window.scrollTo(0,0);};
  $('createForm').onsubmit=e=>{e.preventDefault();void establish('create',{name:$('playerName').value,mode:$('playMode').value,role:$('playerRole').value});};
  $('joinButton').onclick=()=>void establish('join',{name:$('playerName').value,code:$('joinCode').value,role:$('playerRole').value});
  $('startButton').onclick=()=>void start().catch(error=>toast(error.message));
  $('leaveButton').onclick=()=>{clearSession();screen('landing');};
  $('retryButton').onclick=()=>{$('resultDialog').close();clearSession();screen('lobby');};
  $('guideButton').onclick=$('resultGuide').onclick=()=>$('guideDialog').showModal();$('closeGuide').onclick=()=>$('guideDialog').close();
  $('showCommands').onclick=()=>{$('combat').classList.remove('show-battle');$('showCommands').setAttribute('aria-pressed','true');$('showBattle').setAttribute('aria-pressed','false');};
  $('showBattle').onclick=()=>{$('combat').classList.add('show-battle');$('showCommands').setAttribute('aria-pressed','false');$('showBattle').setAttribute('aria-pressed','true');window.LichBattle.resize();};
  document.querySelector('.command-panel').addEventListener('click',async e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled||busy||!state)return;busy=true;try{render(await api('action?since='+eventSeq,{requestId:crypto.randomUUID(),challengeId:state.challenge.id,action:button.dataset.action,target:button.dataset.target}));}catch(error){toast(error.message);await sync();}finally{busy=false;}});
  setInterval(()=>void sync(),250);setInterval(times,100);if(token)void sync();
  window.LichRaidReview={diagnostics:()=>({state,mounted,eventSeq,battle:window.LichBattle.diagnostics()}),sync};
})();
