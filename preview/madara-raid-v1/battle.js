/* Uses the installed live V3 runtime. No copied renderer, formations or dock. */
(()=>{
  let engine=null,renderer=null,epoch=0,queue=Promise.resolve(),pending=0,snapshot=null,synced='',bossId='',visible=new Set(),scene=null,lastCue='',spirit=false,telegraph=null;
  async function preload(){
    await window.ProjectVBattleV3Live.ensureRuntime({effects:true});
    await window.MadaraPresentation.preload();
  }
  async function mount(payload){
    teardown();const version=epoch;await preload();if(version!==epoch)return;
    const modal=document.getElementById('battleMount'),api=window.ProjectVPixiBattle;
    bossId=payload.battleV2.teams.B.cards[0].id;
    spirit=String(payload.battleV2.teams.B.cards[0].projectVMonsterArt?.primaryUrl).includes('azure-spirit');
    visible=new Set([...payload.battleV2.teams.A.cards,...payload.battleV2.teams.A.mercenaries,...payload.battleV2.teams.A.supports,...payload.battleV2.teams.B.cards].map(f=>f.id));
    const original=api.mountForBattle,reset=api.resetSession;
    api.mountForBattle=async(data,host)=>{engine=await original(data,host);return engine;};
    api.resetSession=async(data,host)=>{engine=await reset(data,host);return engine;};
    try{
      const prepared=window.ProjectVBattleV3Live.prepareLoading({modal,mode:'RAID',playerName:payload.accountNickname,opponentName:'마다라',autoText:'마다라 전장 준비 중'});
      const candidate=await window.ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'RAID',playUltimateCinematics:false});
      if(version!==epoch){candidate.destroy();return;}renderer=candidate;
      modal.querySelector('.battle-v3-header strong').textContent='마다라 레이드';
      modal.querySelector('.battle-v3-header small').textContent='공대의 판단이 전장을 바꾼다';
      await engine.deployCards({instant:true,force:true});
      telegraph=window.MadaraPresentation.telegraph(engine);
    }finally{api.mountForBattle=original;api.resetSession=reset;}
  }
  function sync(){
    if(!engine||!snapshot)return;const key=JSON.stringify([snapshot.bossHp,snapshot.fighters]);if(key===synced)return;
    engine.syncFinalState({A:snapshot.fighters.filter(f=>!f.isMercenary),mercenaries:{A:snapshot.fighters.filter(f=>f.isMercenary),B:[]},B:[{id:bossId,hp:snapshot.bossHp,maxHp:snapshot.bossMaxHp}]});
    engine.updateStatus(`${snapshot.phaseName} · ${snapshot.step==='DAMAGE'?'공격 기회':'협동 기믹'}`);synced=key;
  }
  function present(cue,options={}){
    window.MadaraPresentation.dialogue(cue);if(!engine||!cue)return Promise.resolve();
    scene?.dispose();scene=window.MadaraPresentation.create(engine,cue,{spirit,...options});return scene.playback;
  }
  function cueFor(state){
    const cue=state.presentation;window.MadaraPresentation.dialogue(cue);
    if(!cue||cue.id===lastCue||state.status!=='ACTIVE'||state.serverNow-cue.at>5000)return null;
    lastCue=cue.id;return cue;
  }
  function restore(state){epoch++;scene?.dispose();scene=null;engine?.cancelTimelines();pending=0;queue=Promise.resolve();snapshot=state;synced='';sync();const cue=cueFor(state);if(cue)queue=present(cue);}
  function update(state){
    snapshot=state;if(!engine)return;
    if(state.events.some(e=>['MADARA_PHASE','MADARA_RESULT'].includes(e.type))||pending>18){restore(state);return;}
    const cue=cueFor(state);
    const events=state.events.filter(e=>!e.type.startsWith('MADARA_')&&e.type!=='RESULT'&&(!e.actorId||visible.has(e.actorId)))
      .map(e=>({...e,...(e.hits?{hits:e.hits.filter(h=>visible.has(h.targetId))}:{})}));
    if(!events.length&&!cue){if(!pending)sync();return;}
    const version=epoch;pending+=events.length;
    queue=queue.then(async()=>{if(cue&&version===epoch)await present(cue);for(const e of events){if(version!==epoch||!engine)return;try{await engine.playEvents([e]);}finally{if(version===epoch)pending=Math.max(0,pending-1);}}if(version===epoch)sync();})
      .catch(error=>{console.warn('[Madara preview playback]',error);if(version===epoch){pending=0;sync();}});
  }
  function teardown(){epoch++;scene?.dispose();scene=null;telegraph?.dispose();telegraph=null;engine?.cancelTimelines();renderer?.destroy();renderer=null;engine=null;queue=Promise.resolve();pending=0;snapshot=null;synced='';void window.MadaraPresentation.release().catch(error=>console.warn('[Varsen assets]',error));}
  window.MadaraBattle={preload,mount,update,restore,teardown,telegraph:(state,now)=>telegraph?.draw(state,now),showcase:(cue,options)=>present(cue,{review:true,...options}),control:(action,value)=>scene?.control(action,value),diagnostics:()=>({ready:Boolean(engine),pending,canvasCount:document.querySelectorAll('canvas').length,engine:engine?.diagnostics(),presentation:scene?.diagnostics(),art:window.MadaraPresentation.diagnostics(),telegraphLayers:engine?.effectLayer.children.filter(c=>c.label==='MadaraMechanicTelegraph').length||0,madaraEffects:engine?.effectLayer.children.filter(c=>c.label==='MadaraAuthoredFX').length||0})};
  window.addEventListener('pagehide',teardown,{once:true});
})();
