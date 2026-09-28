(() => {
  'use strict';
  const $=id=>document.getElementById(id),roles={ASSAULT:'정벌대',WARDEN:'봉인대',RESCUE:'구출대'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token=sessionStorage.getItem('lichReviewToken')||'',state=null,eventSeq=0,polling=false,mounting=false,mounted=false,busy=false,toastTimer,ended=false;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  async function api(route,body){const response=await fetch('/__lich/'+route,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok){if(response.status===401){token='';sessionStorage.removeItem('lichReviewToken');}throw new Error(result.error||'요청 실패');}return result;}
  function screen(name){document.body.classList.toggle('in-combat',name==='combat');['landing','lobby','combat'].forEach(id=>$(id).hidden=id!==name);}
  const remaining=ms=>Math.max(0,Math.ceil(ms/1000));
  const fmt=ms=>{const sec=remaining(ms);return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');};
  function render(result){
    const next=result.state;if(state&&next.id===state.id&&(next.serverNow<state.serverNow||next.serverNow===state.serverNow&&next.revision<state.revision))return;
    const events=next.events.filter(e=>e.seq>eventSeq);eventSeq=Math.max(eventSeq,next.eventSeq);state=next;
    if(state.status==='LOBBY'){
      screen('lobby');$('createForm').hidden=true;$('assembly').hidden=false;$('roomCode').textContent=state.id;
      $('memberList').innerHTML=state.members.map(m=>`<li>${esc(m.name)}<span>${roles[m.role]}</span></li>`).join('');
      $('startButton').hidden=!state.me.isHost;$('startButton').disabled=state.mode==='PARTY'&&!Object.keys(roles).every(role=>state.members.some(m=>m.role===role));
    }else{
      screen('combat');
      $('roleLabel').textContent=state.mode==='COMMAND'?'공대 지휘 · 세 역할 조작':roles[state.me.role];
      if(mounted)window.LichBattle.enqueue(events,state);
      for(const e of events.filter(e=>e.type.startsWith('RAID_'))){const li=document.createElement('li');li.innerHTML=`<time>${fmt(Math.max(0,e.at-state.startedAt))}</time>${esc(e.label)}`;$('journal').prepend(li);if($('journal').children.length>40)$('journal').lastElementChild.remove();$('journalStatus').textContent=e.label;}
      if(['CLEAR','FAILED'].includes(state.status)&&!ended){ended=true;showResult();}
    }
  }
  async function mount(result){if(mounted||mounting)return;mounting=true;try{screen('combat');window.scrollTo(0,0);await window.LichBattle.mount(result.payload);mounted=true;window.LichBattle.restore(state||result.state);render(result);}catch(error){toast('전장 준비 실패: '+error.message);console.error(error);}finally{mounting=false;}}
  function showResult(){const clear=state.status==='CLEAR';$('resultDialog').classList.toggle('is-clear',clear);$('resultCaption').textContent=clear?'CONQUEST COMPLETE':'EXPEDITION FAILED';$('resultTitle').textContent=clear?'리치왕 정벌 성공':'공대 전멸';$('resultReason').textContent=clear?'죽음의 왕좌가 무너졌습니다. 검수판 정벌 기록이며 운영 보상은 지급되지 않습니다.':state.failure?.reason||'공략에 실패했습니다.';$('resultStats').innerHTML=`<span><b>${state.round}/7</b>도달 작전</span><span><b>${state.statistics.mistakes}</b>누적 실수</span><span><b>${state.statistics.rescues}</b>영혼 구출</span>`;$('resultDialog').showModal();}
  async function sync(){if(!token||polling||mounting)return;polling=true;try{const result=await api('state?since='+eventSeq+(!mounted?'&payload=1':''));render(result);if(result.state.status!=='LOBBY'&&!mounted)await mount(result);}catch(error){if(!token){screen('lobby');$('createForm').hidden=false;$('assembly').hidden=true;}toast(error.message);}finally{polling=false;}}
  function clearSession(){token='';sessionStorage.removeItem('lichReviewToken');state=null;eventSeq=0;ended=false;mounted=false;window.LichBattle.teardown();$('journal').innerHTML='';$('createForm').hidden=false;$('assembly').hidden=true;}
  async function establish(route,body){if(busy)return;busy=true;try{clearSession();const result=await api(route,body);token=result.token;sessionStorage.setItem('lichReviewToken',token);render(result);if(result.state.mode==='COMMAND')await start(result);}catch(error){toast(error.message);}finally{busy=false;}}
  async function start(preloaded){const result=preloaded?.payload?preloaded:await api('state?payload=1');await mount(result);if(!mounted)return;render(await api('start',{}));}
  $('enterButton').onclick=()=>{screen('lobby');window.scrollTo(0,0);};
  $('createForm').onsubmit=e=>{e.preventDefault();void establish('create',{name:$('playerName').value,mode:$('playMode').value,role:$('playerRole').value});};
  $('joinButton').onclick=()=>void establish('join',{name:$('playerName').value,code:$('joinCode').value,role:$('playerRole').value});
  $('startButton').onclick=()=>void start().catch(error=>toast(error.message));
  $('leaveButton').onclick=()=>{clearSession();screen('landing');};
  $('retryButton').onclick=()=>{$('resultDialog').close();clearSession();screen('lobby');};
  $('guideButton').onclick=$('resultGuide').onclick=$('combatGuide').onclick=()=>$('guideDialog').showModal();$('closeGuide').onclick=()=>$('guideDialog').close();
  window.addEventListener('lich-raid-action',async e=>{
    if(busy||!state||state.status!=='ACTIVE'||e.detail.challengeId!==state.challenge?.id)return;
    busy=true;try{render(await api('action?since='+eventSeq,{requestId:crypto.randomUUID(),...e.detail}));}
    catch(error){toast(error.message);await sync();}finally{busy=false;}
  });
  setInterval(()=>void sync(),250);if(token)void sync();
  window.LichRaidReview={diagnostics:()=>({state,mounted,eventSeq,battle:window.LichBattle.diagnostics()}),sync};
})();
