(function () {
  'use strict';
  const rules={title:'죽음의 눈치게임',maxPlayers:4,targetBites:24,biteIntervalMs:700,durationMs:90000,countdownMs:3000,deathLockMs:300000,warningMs:650,networkGraceMs:100};
  let model, mode='lobby', cycle=0;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function phase(at) {
    if(model.status==='LOBBY')return{type:'LOBBY',startsAt:0,endsAt:0};
    if(model.status==='CANCELLED')return{type:'CANCELLED',startsAt:0,endsAt:0};
    if(at>=model.endsAt)return{type:'FINISHED',startsAt:model.endsAt,endsAt:0};
    if(at<model.startsAt)return{type:'COUNTDOWN',startsAt:model.startsAt-3000,endsAt:model.startsAt};
    return model.timeline.find(p=>at>=p.startsAt&&at<p.endsAt);
  }
  function oneBite(player,at) {
    if(player.status!=='ALIVE'||at<player.lastBiteAt+700)return;
    const p=phase(at);if(!['READING','WARNING','WATCHING'].includes(p.type))return;
    player.lastBiteAt=at;player.lastSeq++;
    if(p.type==='WATCHING'&&at>=p.startsAt+rules.networkGraceMs){player.status='DEAD';player.diedAt=at;player.blockedUntil=at+300000;return;}
    player.bites++;if(player.bites>=24){player.status='FINISHED';player.finishedAt=at;}
  }
  function snapshot() {
    const at=Date.now(),p=phase(at);
    if(model.status==='RUNNING'&&p.type==='READING')for(const player of model.players){
      if((mode==='watch'||player.userId!==101)&&at>=player.nextAuto){oneBite(player,at);player.nextAuto=at+950+(player.userId%3)*140;}
    }
    const me=mode==='watch'?null:model.players.find(p=>p.userId===101);
    return clone({rules,serverNow:at,canOperate:mode==='lobby',round:{id:'preview_round_001',status:p.type==='FINISHED'?'FINISHED':model.status,phase:p,startsAt:model.startsAt,endsAt:model.endsAt},
      players:[...model.players].sort((a,b)=>(a.finishedAt||Infinity)-(b.finishedAt||Infinity)||b.bites-a.bites),me:me?{...me,nextBiteAt:me.lastBiteAt+700}:null});
  }
  function begin() {
    model.status='RUNNING';model.startsAt=Date.now()+3000;model.endsAt=model.startsAt+90000;model.timeline=[];
    let at=model.startsAt;
    while(at<model.endsAt)for(const [type,duration] of [['READING',1000+Math.floor(Math.random()*1800)],['WARNING',rules.warningMs],['WATCHING',1100+Math.floor(Math.random()*1700)]]){
      model.timeline.push({type,startsAt:at,endsAt:at+duration});at+=duration;
    }
    model.players.forEach(p=>{p.status='ALIVE';p.nextAuto=model.startsAt+500+(p.userId%3)*190;});
  }
  function prison() {const me=model.players.find(p=>p.userId===101);return me?.blockedUntil>Date.now()?{incarcerated:true,facility:'DEATH_GAME',jailedUntil:new Date(me.blockedUntil).toISOString(),remainingSeconds:Math.ceil((me.blockedUntil-Date.now())/1000)}:{incarcerated:false};}
  window.apiRequest=async function(path,options={}) {
    const version=cycle,body=options.body?JSON.parse(options.body):{};
    // A small simulated round trip makes immediate local motion easy to inspect.
    await new Promise(resolve=>setTimeout(resolve,120));
    if(version!==cycle)throw Error('새 체험이 시작되었습니다.');
    if(path==='prison/status')return{prison:prison(),serverNow:new Date().toISOString()};
    const action=path.split('/').at(-1);
    if(action==='bite'){
      const me=model.players.find(p=>p.userId===101);if(mode==='watch')throw Error('관전자는 식사할 수 없습니다.');
      if(body.seq>me.lastSeq)oneBite(me,Date.now());
    }else if(action==='start'){begin();}
    else if(action==='cancel'){model.status='CANCELLED';}
    else if(action==='open'){reset('lobby');}
    else if(!['status','join','leave'].includes(action))throw Error('체험용 경로가 아닙니다.');
    return snapshot();
  };
  function reset(next='lobby') {
    cycle++;mode=next;window.PrisonDeathGame?.stop();
    document.getElementById('clanCampView').innerHTML='';
    model={status:'LOBBY',startsAt:0,endsAt:0,players:['참가자 하나','참가자 둘','참가자 셋','참가자 넷'].map((nickname,i)=>({userId:101+i,nickname,status:'WAITING',bites:0,lastSeq:0,lastBiteAt:0,finishedAt:0,diedAt:0,blockedUntil:0,nextAuto:0}))};
    if(next==='death'){
      const me=model.players[0];me.status='DEAD';me.diedAt=Date.now();me.blockedUntil=Date.now()+300000;
      window.PrisonV1.renderLocked(prison());return;
    }
    if(next==='play'||next==='watch')begin();
    window.PrisonDeathGame.open();
  }
  window.PrisonV1={apply(){},renderLocked(status){
    document.getElementById('clanCampView').innerHTML=window.PrisonDeathGame.lockView();
    document.querySelector('.death-lock-eyebrow').textContent='체험용 사망 연출 · 실제 계정 영향 없음';
    window.PrisonDeathGame.bindLock(status);
  }};
  window.renderShell=()=>reset('lobby');window.prisonLogout=()=>reset('lobby');
  window.DeathGamePreview=Object.freeze({reset});
  document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>reset(button.dataset.preview)));
})();
