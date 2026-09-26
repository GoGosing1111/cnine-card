(() => {
  const $=id=>document.getElementById(id),api=window.ProjectVPixiBattle,originalMount=api.mountForBattle;
  const liveMode=document.body.dataset.legionLive==='true';
  const ownerMode=liveMode||new URLSearchParams(location.search).get('owner')==='1'||!['localhost','127.0.0.1'].includes(location.hostname);
  const ownerTransport=ownerMode?import('/js/joint-account-transport.mjs'):null;
  let ownerRequests=Promise.resolve();
  let engine,renderer,session,csrf,payload,policies=[],epoch=0,playing=false,paused=false,ending=false,finishing=false,ack=0,kills=0,bosses=0,renderedAt=0,picked=0;
  let reveals=Promise.resolve(),finishTimer=null,toastTimer=null,starting=false,liveDifficulty='normal',entryReceived=false,failed=false;
  const notifyParent=(type,extra={})=>{if(liveMode&&window.parent!==window)window.parent.postMessage({type,...extra},location.origin);};
  const message=t=>{$('hunt-message').textContent=t;};
  const time=ms=>String(Math.floor(Math.max(0,ms)/60000)).padStart(2,'0')+':'+String(Math.floor(Math.max(0,ms)/1000)%60).padStart(2,'0');
  api.mountForBattle=async(...args)=>{engine=await originalMount(...args);return engine;};
  window.cnineBattleSpriteUrl=path=>{const key=String(path||'').replace(/^\/+/, '').split('?')[0];return window.CNineResponsiveBattleSprites?.[key]||(window.CNineResponsiveCardImages?.[key]?window.CNineResponsiveCardImages[key]+'-384.webp':path);};
  async function request(action,body={}){
    if(ownerMode){
      // Reveals and manual pickup can happen together. Queue this window's writes
      // so they do not compete for the same account mutation lock.
      const next=ownerRequests.then(async()=>{
        const transport=await ownerTransport;
        for(let attempt=0;;attempt++){
          try{return await transport.jointAccountRequest('legion-hunt/'+action,{method:'POST',body});}
          catch(error){if(error.code!=='JOINT_LOCK_BUSY'||attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));}
        }
      });
      ownerRequests=next.catch(()=>{});return next;
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch('/__hunt/'+action,{method:'POST',headers:{'content-type':'application/json','x-preview-token':csrf},body:JSON.stringify(body),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw Error(data.error||'원정 요청 실패');return data;
    }finally{clearTimeout(timer);}
  }
  const errorText=e=>({DROP_EXPIRED:'아이템이 사라졌습니다.',DROP_CLICK_RATE_LIMIT:'잠시 후 다시 클릭하세요.',DROP_POSITION_MISMATCH:'아이템 위치를 다시 확인해 주세요.'}[e.message]||e.message);
  function buttons(){
    $('hunt-start').disabled=(!engine&&!liveMode)||playing||finishing||starting;$('hunt-start').textContent=liveMode?'다시 준비':engine?'사냥 시작':'전장 준비 중';
    if(liveMode)$('hunt-start').hidden=!failed;
    $('hunt-pause').disabled=!playing||ending||finishing;$('hunt-pause').textContent=paused?'계속 사냥':'일시정지';
    $('hunt-stop').disabled=!playing||finishing;$('hunt-stop').textContent=ending?'전리품 정산':'철수';
    if(!liveMode){$('hunt-difficulty').disabled=playing||!engine||starting;$('hunt-party').disabled=playing||!engine||starting;$('hunt-setup').hidden=playing;}
  }
  function inventory(rows=[]){
    $('bag-items').replaceChildren();
    if(!rows.length){$('bag-items').textContent='아직 획득한 아이템이 없습니다';return;}
    for(const row of rows){const span=document.createElement('span'),img=document.createElement('img');img.src=row.image;img.alt='';span.append(img,document.createTextNode(row.name+' ×'+row.quantity));$('bag-items').append(span);}
  }
  function toast(text){clearTimeout(toastTimer);$('hunt-pickup-toast').textContent=text;$('hunt-pickup-toast').classList.add('show');toastTimer=setTimeout(()=>$('hunt-pickup-toast').classList.remove('show'),1800);}
  function updatePolicy(){
    if(liveMode)return;
    const p=policies.find(d=>d.id===$('hunt-difficulty').value);if(!p)return;
    $('difficulty-description').textContent=p.description+' · '+Math.round(p.limitMs/1000)+'초';
    $('hunt-threat').textContent=p.name+' · 전멸 / 시간 초과 시 실패';
  }
  async function prepare(){
    const token=++epoch,oldSession=session;clearInterval(finishTimer);finishTimer=null;playing=paused=ending=finishing=starting=failed=false;ack=kills=bosses=renderedAt=picked=0;reveals=Promise.resolve();
    clearTimeout(toastTimer);$('hunt-pickup-toast').classList.remove('show');$('hunt-pickup-toast').textContent='';
    engine?.setHuntPaused(false);renderer?.destroy();api.destroy();engine=null;session=null;buttons();
    if(oldSession)await request('cancel',{id:oldSession}).catch(()=>{});
    $('hunt-kills').textContent=$('hunt-bosses').textContent=$('hunt-picked').textContent='0';$('hunt-boss-hud').hidden=true;
    $('hunt-stage').textContent='1 / 4 구간';$('hunt-objective').textContent='첫 번째 무리를 처치하세요';inventory();updatePolicy();message('원정대와 몬스터를 배치하고 있습니다.');
    const data=await request('start',{difficulty:liveMode?liveDifficulty:$('hunt-difficulty').value,...(ownerMode?{}:{party:$('hunt-party').value})});
    if(token!==epoch){void request('cancel',{id:data.id});return;}
    session=data.id;payload=data.payload;notifyParent('legion-hunt-session',{id:session});window.cnineCardCatalog=()=>payload.cards;
    const playerName=payload.accountNickname||'원정대';
    const modal=$('hunt-modal'),prepared=ProjectVBattleV3Live.prepareLoading({modal,mode:'HUNT',playerName,opponentName:'몬스터 군단',autoText:'잊혀진 섬에 진입하고 있습니다.'});
    prepared.stage.querySelector('.battle-v3-canvas-host').style.backgroundImage='none';
    renderer=await ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:'HUNT',playerName,playUltimateCinematics:false,continuousPlayback:true});
    if(token!==epoch)return;
    document.removeEventListener('visibilitychange',engine.onVisibility);
    engine.previewSpeed=Number($('hunt-speed').value);engine.paceScale=engine.previewSpeed;
    prepared.stage.querySelector('.battle-v3-header strong').textContent='잊혀진 섬 · '+payload.huntPolicy.name;
    prepared.stage.querySelector('#battlePhase').textContent='37개체 · 보스 3';
    await api.restoreDeployedFormation();
    engine.attachGroundDrops({
      claim:drop=>request('claim',{id:session,dropId:drop.id,token:drop.token,x:drop.position.x,y:drop.position.y}),
      onPicked:r=>{picked++;$('hunt-picked').textContent=picked;inventory(r.inventory);toast(r.item.name+' +'+r.item.quantity+' 획득');},
      onExpired:()=>{if(playing)message('드랍이 사라졌습니다. 다음 아이템은 다른 위치에 나타납니다.');},
      onError:e=>message(errorText(e))
    });
    $('hunt-time').textContent=time(payload.huntPolicy.limitMs);$('hunt-threat').textContent=payload.huntPolicy.name+' · 전멸 / 시간 초과 시 실패';message('아이템은 필드에서 직접 클릭해야 획득합니다.');buttons();
  }
  function bossHud(){
    const a=engine.enemies.filter(a=>engine.isAlive(a)&&a.isBoss).at(-1);
    $('hunt-boss-hud').hidden=!a;if(!a)return;
    $('boss-name').textContent=a.name;$('boss-percent').textContent=Math.max(0,Math.ceil(a.hp))+'%';$('boss-fill').style.width=Math.max(0,a.hp)+'%';
  }
  function onEvent(event){
    ack=event.seq;renderedAt=Math.min(payload.huntPolicy.limitMs,Math.max(renderedAt,event.combatAtMs||0));
    $('hunt-time').textContent=time(payload.huntPolicy.limitMs-renderedAt);
    if(event.huntStage){$('hunt-stage').textContent=event.huntStage+' / 4 구간';$('hunt-objective').textContent=event.huntStage===4?'태고의 수호자를 처치하세요':event.huntStage===1?'첫 번째 무리를 처치하세요':event.huntStage+'차 습격 · 중간 보스 처치';}
    if(event.huntKill){
      $('hunt-kills').textContent=++kills;if(event.boss)$('hunt-bosses').textContent=++bosses;
      const token=epoch,id=session;reveals=reveals.then(async()=>{
        const r=await request('reveal',{id,seq:event.seq});if(token!==epoch||!playing||finishing)return;
        if(r.drop){await engine.groundDrops.add(r.drop,r.serverNow);message('아이템 드랍 · 필드의 빛나는 아이템을 직접 클릭하세요.');}
      }).catch(e=>{if(token===epoch)message(errorText(e));});
    }
    if(event.type==='ENEMY_SPAWN'&&event.boss)toast(event.name+' 출현');
    bossHud();
  }
  async function start(){
    if(playing||starting||!engine)return;const token=epoch;starting=true;buttons();
    try{
      await request('begin',{id:session});starting=false;playing=true;buttons();message('전투 중 · 드랍 아이템을 놓치지 마세요.');
      await engine.initialArrival();if(token!==epoch||!playing)return;
      engine.startAccountBattleUnitSustainedFire();
      await engine.playEvents(payload.battleV2.result.timeline,{sequential:true,afterEvent:onEvent,isPaused:()=>paused});
      if(token!==epoch||!playing||finishing)return;
      ending=true;await reveals;buttons();
      message('전투가 끝났습니다. 남은 드랍을 클릭하세요. 사라지면 자동 정산합니다.');
      finishTimer=setInterval(()=>{if(!engine.groundDrops.rows.size){clearInterval(finishTimer);finishTimer=null;void finish();}},200);
    }catch(e){if(token===epoch){starting=false;failed=true;message(errorText(e)+' · 다시 시도하거나 철수할 수 있습니다.');buttons();}}
  }
  function pause(){
    if(!playing||ending)return;paused=!paused;engine.setHuntPaused(paused);buttons();
    message(paused?'전투 일시정지 · 드랍 소멸 시간은 계속 흐릅니다.':'사냥을 이어갑니다.');
  }
  async function finish(){
    if(!playing||finishing)return;finishing=true;buttons();clearInterval(finishTimer);finishTimer=null;
    paused=false;engine.setHuntPaused(false);engine.cancelTimelines();
    try{
      await reveals;const receipt=await request('finish',{id:session,seq:ack});playing=false;ending=false;
      const labels={CLEAR:['사냥 클리어','태고의 수호자를 포함한 모든 적을 처치했습니다.'],DEFEAT:['원정 실패','전력이 부족해 끝까지 돌파하지 못했습니다.'],TIME_LIMIT:['시간 초과','제한 시간 안에 모든 적을 처치하지 못했습니다.'],RETREAT:['원정 철수','사냥을 중단했습니다. 직접 획득한 전리품만 집계합니다.']};
      const [title,reason]=labels[receipt.reason];$('result-title').textContent=title;$('result-reason').textContent=reason;$('result-eyebrow').textContent=payload.huntPolicy.name+' · 원정 결과';
      $('result-kills').textContent=receipt.kills+' / 37 · '+receipt.bosses+' / 3';
      $('result-picked').textContent=receipt.picked+'개';$('result-missed').textContent=receipt.missed+'개';$('result-time').textContent=time(receipt.combatMs);
      $('result-items').replaceChildren();for(const r of receipt.inventory){const p=document.createElement('p');p.textContent=r.name+' ×'+r.quantity;$('result-items').append(p);}
      if(!receipt.inventory.length)$('result-items').textContent='획득한 전리품 없음';
      $('hunt-result').showModal();message('원정 결과가 정산됐습니다.');
    }catch(e){message(errorText(e)+' · 정산을 다시 눌러 주세요.');}
    finally{finishing=false;buttons();}
  }
  async function enterBattle(){try{await prepare();await start();}catch(e){failed=true;message(errorText(e));buttons();}}
  async function again(play){$('hunt-result').close();if(liveMode&&!play){notifyParent('legion-hunt-return');return;}try{await prepare();if(play)await start();}catch(e){failed=true;message(errorText(e));buttons();}}
  $('hunt-start').onclick=()=>void(liveMode?enterBattle():start());$('hunt-pause').onclick=pause;$('hunt-stop').onclick=()=>void finish();
  $('hunt-speed').onchange=()=>{if(engine){engine.previewSpeed=Number($('hunt-speed').value);engine.paceScale=engine.previewSpeed;}};
  if(!liveMode)$('hunt-difficulty').onchange=$('hunt-party').onchange=()=>void prepare().catch(e=>message(errorText(e)));
  $('hunt-again').onclick=()=>void again(true);$('hunt-review').onclick=()=>void again(false);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused&&!ending)pause();});
  window.addEventListener('pagehide',()=>{++epoch;clearInterval(finishTimer);clearTimeout(toastTimer);engine?.setHuntPaused(false);api.destroy();});
  window.HuntPreviewV2={diagnostics:()=>({playing,paused,ending,ack,kills,bosses,picked,renderedAt,session,canvasCount:document.querySelectorAll('canvas').length,engine:engine?.diagnostics()})};
  if(liveMode){
    $('hunt-return').onclick=()=>notifyParent('legion-hunt-return');
    $('hunt-result').addEventListener('cancel',event=>{event.preventDefault();void again(false);});
    window.addEventListener('message',event=>{
      if(entryReceived||event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='legion-hunt-enter')return;
      if(!['normal','hard','nightmare','inferno'].includes(event.data.difficulty))return;
      entryReceived=true;liveDifficulty=event.data.difficulty;void enterBattle();
    });
    message('저장된 편성으로 전장을 준비합니다.');notifyParent('legion-hunt-ready');return;
  }
  const bootstrap=ownerMode?ownerTransport.then(t=>t.jointAccountRequest('legion-hunt/bootstrap')):fetch('/__hunt/bootstrap').then(r=>r.json());
  bootstrap.then(async data=>{csrf=data.csrf;policies=data.difficulties;
    if(ownerMode){document.querySelector('.preview-badge').textContent='OWNER';$('hunt-party').closest('label').hidden=true;document.querySelector('.review-note').textContent='저장된 계정 편성 · 실계정 보상 지급 OFF';}
    await prepare();if(ownerMode&&!data.activeItems)message('CMS → 군단토벌에서 드랍 후보를 추가하고 사용을 켜면 다음 원정부터 반영됩니다.');
  }).catch(e=>{message(errorText(e));$('hunt-start').textContent='다시 불러오기';$('hunt-start').disabled=false;$('hunt-start').onclick=()=>location.reload();});
})();
