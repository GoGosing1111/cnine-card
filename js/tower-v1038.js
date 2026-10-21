(()=>{
  'use strict';
  const PROTOCOL='TOWER_ABYSS_20261022';
  const ui=()=>window.TowerAbyssUI,user=()=>typeof loadUser==='function'?loadUser():null;
  const S={data:null,busy:false,enabled:true,ensureBusy:false,ensureTimer:null,lastConfigAt:0,tab:'challenge',filter:'all',request:0,battleGeneration:0,releaseFocus:null};
  let requestedTower=new URL(location.href).searchParams.get('pve')==='tower';
  const pendingKey=()=>`cnine:tower:battle:v2094:${Number(user()?.id||0)}`;
  function pendingBattle(){try{const p=JSON.parse(sessionStorage.getItem(pendingKey())||'null');return p&&typeof p.requestId==='string'&&Number.isSafeInteger(p.floorNo)&&p.floorNo>0?p:null;}catch{return null;}}
  function rememberBattle(value,key=pendingKey()){try{sessionStorage.setItem(key,JSON.stringify(value));}catch(error){console.warn('무한의탑 전투 복구 기록을 저장하지 못했습니다.',error);}}
  function acknowledgeBattle(){try{sessionStorage.removeItem(pendingKey());}catch{}}
  function currentDeckCards(){const list=typeof cards==='undefined'?[]:cards;return (S.data?.deck||[]).map(id=>list.find(x=>String(x.id)===String(id))).filter(Boolean);}
  function currentPower(deckCards){const state=typeof battleState==='undefined'?{}:battleState;return deckCards.reduce((sum,c)=>sum+(typeof battleCardPower==='function'?battleCardPower(c,user(),state.config):Number(c.basePower||0)),0)+Number(S.data?.characterBonus?.pve||state.characterBonus?.pve||0);}
  function privileged(){return String(user()?.role||'').toUpperCase()==='OWNER';}
  function scheduleEnsure(){clearTimeout(S.ensureTimer);S.ensureTimer=setTimeout(ensure,40);}
  function exitTower(){document.querySelector('[data-pve-mode="hunt"]')?.click();}
  function editDeck(){exitTower();setTimeout(()=>document.querySelector('[data-pve-tab="deck"]')?.click(),120);}
  function bindView(box){
    if(box.dataset.abyssBound)return;box.dataset.abyssBound='1';
    box.addEventListener('click',event=>{
      const target=event.target.closest('[data-abyss-action]');if(!target||!box.contains(target)||target.disabled)return;
      const action=target.dataset.abyssAction;
      if(action==='exit')exitTower();
      else if(action==='refresh')void openTower();
      else if(action==='tab'){S.tab=target.dataset.tab;render();box.querySelector(`[data-tab="${S.tab}"][data-abyss-action]`)?.focus({preventScroll:true});}
      else if(action==='fight')void startFight();
      else if(action==='deck')editDeck();
      else if(action==='guide')ui().guide(box);
    });
    box.addEventListener('change',event=>{if(event.target.matches('[data-abyss-filter]')){S.filter=event.target.value;render();box.querySelector('[data-abyss-filter]')?.focus({preventScroll:true});}});
  }
  async function ensure(){
    const tabs=document.querySelector('.pve-mode-tabs');if(!tabs||!ui())return;
    const buttons=[...tabs.querySelectorAll('[data-pve-mode="tower"]')];buttons.slice(1).forEach(x=>x.remove());
    const views=[...document.querySelectorAll('#pveTowerView')];views.slice(1).forEach(x=>x.remove());
    if(buttons[0]&&views[0]&&tabs.dataset.towerBound==='1'&&tabs.dataset.towerReady==='1')return;
    if(S.ensureBusy)return;S.ensureBusy=true;
    try{
      let cfg={enabled:S.enabled};
      if(!S.lastConfigAt||Date.now()-S.lastConfigAt>15000){try{cfg=await apiRequest('tower/config',{}, {ttl:0})||cfg;}catch{}S.lastConfigAt=Date.now();}
      S.enabled=cfg.enabled!==false;
      if(!S.enabled&&!privileged()){buttons.forEach(x=>x.remove());views.forEach(x=>x.remove());tabs.dataset.towerReady='0';return;}
      let button=buttons[0];
      if(!button){button=document.createElement('button');button.type='button';button.className='pve-mode-btn';button.dataset.pveMode='tower';button.textContent='무한의탑';tabs.appendChild(button);}
      const anchor=document.getElementById('pveRaidHubView')||document.getElementById('pveRaidView');if(!anchor)return;
      let box=views[0];
      if(!box){box=document.createElement('div');box.id='pveTowerView';box.className='pve-tower-view';box.hidden=true;anchor.insertAdjacentElement('afterend',box);}
      else if(box.parentElement!==anchor.parentElement)anchor.insertAdjacentElement('afterend',box);
      bindView(box);
      if(tabs.dataset.towerBound!=='1'){
        tabs.dataset.towerBound='1';
        tabs.addEventListener('click',event=>{const btn=event.target.closest('[data-pve-mode]');if(!btn)return;if(btn.dataset.pveMode==='tower'){event.preventDefault();void openTower();}else{S.request++;box.hidden=true;}});
      }
      tabs.dataset.towerReady='1';
      if(requestedTower){requestedTower=false;const url=new URL(location.href);url.searchParams.delete('pve');history.replaceState(history.state,'',url);void openTower();}
    }finally{S.ensureBusy=false;}
  }
  async function openTower(restoreBattle=true){
    if(S.busy)return false;
    const token=++S.request;
    document.querySelectorAll('.pve-mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.pveMode==='tower'));
    ['pveRaidHubView','pveRaidView','pveHuntView','pveRiftView','pveEscortView','pveSealBattleView','pveIdleDungeonView'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=true;});
    const box=document.getElementById('pveTowerView');if(!box)return false;
    bindView(box);box.hidden=false;ui().state(box);
    try{
      const [data,recovery]=await Promise.all([apiRequest('tower/status',{}, {ttl:0}),apiRequest('tower/pending',{}, {ttl:0})]);
      if(token!==S.request||!box.isConnected||box.hidden)return false;
      if(recovery.pending){const old=pendingBattle();rememberBattle({requestId:recovery.pending.requestId,floorNo:recovery.pending.floorNo,result:recovery.pending,playbackComplete:old?.requestId===recovery.pending.requestId&&old?.playbackComplete===true});}
      S.data=data;render();
      if(restoreBattle&&pendingBattle()?.result&&!S.busy)void startFight();
      return true;
    }catch(error){if(token===S.request&&box.isConnected&&!box.hidden)ui().state(box,{title:'도전 정보를 불러오지 못했습니다',description:error.message,error:true});return false;}
  }
  function render(){
    const box=document.getElementById('pveTowerView');if(!box||!S.data)return;
    const d=S.data;
    if(!d.active){ui().state(box,{title:'지금은 성소의 문이 닫혀 있습니다',description:d.message||'무한의탑 운영이 재개되면 다시 도전할 수 있습니다.',error:true});return;}
    if(d.configured===false||Number(d.maxFloor||0)<1){ui().state(box,{title:'첫 번째 봉인을 준비하고 있습니다',description:d.message||'아직 개방된 층이 없습니다. 운영 준비가 끝나면 이곳에서 도전할 수 있습니다.',error:true});return;}
    const deckCards=currentDeckCards();
    ui().render(box,{data:d,tab:S.tab,filter:S.filter,cards:deckCards,power:currentPower(deckCards),records:ui().readRecords(user()?.id),userId:user()?.id});
  }
  async function settleBattle(data,view,isCurrent){
    for(let attempt=0;attempt<2;attempt++){
      if(!isCurrent())return null;
      ui().settling(view,0);
      try{return await apiRequest('tower/finish',{method:'POST',body:JSON.stringify({requestId:data.requestId})});}
      catch(error){
        if(error.code!=='TOWER_PLAYBACK_PENDING'||attempt>0)throw error;
        const remaining=Math.max(0,Math.min(240000,Number(error.retryAfterMs)||0)),until=performance.now()+remaining+150;
        while(isCurrent()&&performance.now()<until){ui().settling(view,Math.ceil((until-performance.now())/1000));await new Promise(resolve=>setTimeout(resolve,500));}
      }
    }
    return null;
  }
  function lockBattleFocus(stage){
    S.releaseFocus?.();
    const onKey=event=>{
      if(!stage.isConnected)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();return;}
      if(event.key!=='Tab')return;
      const items=[...stage.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(!items.length){event.preventDefault();stage.focus({preventScroll:true});return;}
      const first=items[0],last=items.at(-1),active=document.activeElement;
      if(!stage.contains(active)||(event.shiftKey&&active===first)){event.preventDefault();(event.shiftKey?last:first).focus();}
      else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
    };
    stage.tabIndex=-1;document.addEventListener('keydown',onKey,true);stage.focus({preventScroll:true});
    S.releaseFocus=()=>{document.removeEventListener('keydown',onKey,true);S.releaseFocus=null;};
  }
  function disposeBattle(){
    S.battleGeneration++;
    S.releaseFocus?.();const modal=document.getElementById('modal');
    if(modal){modal.__battleV2Renderer?.destroy?.();modal.__battleV2Renderer=null;modal.onclick=null;modal.className='modal';modal.innerHTML='';}
    S.busy=false;
  }
  async function closeBattle({acknowledge=true,tab='challenge',retry=false}={}){
    if(acknowledge)acknowledgeBattle();disposeBattle();S.tab=tab;
    const opened=await openTower(false);
    if(opened&&retry)await startFight();
    else if(opened)document.querySelector('#pveTowerView [data-abyss-action="fight"],#pveTowerView .abyss-nav .is-active')?.focus({preventScroll:true});
  }
  async function startFight(){
    if(S.busy)return;
    const pending=pendingBattle(),saved=pending?.result,deckCards=currentDeckCards();
    if(!saved&&deckCards.length!==5){S.tab='formation';render();return;}
    if(!pending&&(S.data?.completed||S.data?.blocked||!S.data?.floor))return;
    const floorNo=pending?.floorNo||Number(S.data.floor.floorNo);
    const f=saved?{floorNo,monsterName:saved.monster?.name}:S.data.floor||{floorNo};
    const modal=document.getElementById('modal');if(!modal)return;
    S.busy=true;let view=null;
    const generation=++S.battleGeneration,accountId=Number(user()?.id),recordKey=pendingKey(),isCurrent=()=>generation===S.battleGeneration&&Number(user()?.id)===accountId;
    try{
      if(typeof ensureFeatureResources==='function')await ensureFeatureResources('battleV2');
      if(!isCurrent())return;
      if(!window.ProjectVBattleV3Live?.ready?.())throw Error('전투 화면을 준비하지 못했습니다. 다시 연결해 주세요.');
      view=window.prepareBattleV2LiveLoading({modal,mode:'TOWER',playerName:user()?.nickname||'원정대',opponentName:f.monsterName||'탑의 수호자',autoText:'나락의 시련 · 원정대 준비'});
      ui().prepareBattle(view,{floorNo});lockBattleFocus(view.stage);
      window.ensureBattleSoundButton?.(view.stage);
      const ticket=pending||{requestId:crypto.randomUUID(),floorNo};
      if(!saved)rememberBattle(ticket,recordKey);
      let data=saved||await apiRequest('tower/start',{method:'POST',body:JSON.stringify({requestId:ticket.requestId,floorNo:ticket.floorNo,protocol:PROTOCOL})});
      data.requestId||=ticket.requestId;rememberBattle({...ticket,requestId:data.requestId,floorNo:data.floorNo,result:data},recordKey);
      if(!isCurrent())return;
      const playbackComplete=Boolean(saved?.settlement?.protocol===PROTOCOL&&ticket.playbackComplete);
      const renderer=playbackComplete?{showResult(){modal.classList.remove('battle-v3-preparing');view.stage.querySelector('.battle-v3-loader')?.remove();}}:await window.playTowerBattleV3Live({...view,modal,data,floor:{...f,floorNo:data.floorNo},cards:data.cards?.length?data.cards:deckCards,isActive:()=>isCurrent()&&view.stage.isConnected&&modal.classList.contains('show')});
      if(!renderer||!isCurrent()){if(isCurrent()){S.releaseFocus?.();S.busy=false;}return;}
      modal.__battleV2Renderer=renderer;
      rememberBattle({requestId:data.requestId,floorNo:data.floorNo,result:data,playbackComplete:true},recordKey);
      if(data.settlement?.protocol===PROTOCOL&&data.settlement.status!=='COMPLETED'){
        data=await settleBattle(data,view,isCurrent);if(!data||!isCurrent())return;
        rememberBattle({requestId:data.requestId,floorNo:data.floorNo,result:data,playbackComplete:true},recordKey);
      }
      if(data.magicReward?.amount>0){const current=user();if(current){current.magicCrystals=Number(data.magicReward.balance??current.magicCrystals??0);saveUser(current);}}
      if(data.equipmentReward&&window.showEquipmentDropReward){
        S.releaseFocus?.();
        try{await window.showEquipmentDropReward(data.equipmentReward);}catch(error){console.warn('무한의탑 장비 획득 연출을 표시하지 못했습니다.',error);}
        if(!isCurrent()||!view.stage.isConnected)return;
        lockBattleFocus(view.stage);
      }
      ui().remember(user()?.id,data);
      renderer.showResult?.();view.phase.textContent=data.result==='WIN'?'한계 돌파':'도전 기록';ui().result(view,data,ui().readRecords(user()?.id));
      view.towerMsg.onclick=event=>{
        const action=event.target.closest('[data-abyss-action]')?.dataset.abyssAction;if(!action)return;event.stopPropagation();
        view.towerMsg.querySelectorAll('button').forEach(b=>b.disabled=true);
        void closeBattle({tab:action==='formation'?'formation':action==='records'||data.completed?'records':'challenge',retry:action==='retry'});
      };
    }catch(error){
      if(!isCurrent())return;
      const stale=['TOWER_FLOOR_CHANGED','TOWER_COMPLETED','TOWER_CLIENT_UPDATE'].includes(error.code);
      if(stale)acknowledgeBattle();
      if(!view){disposeBattle();const box=document.getElementById('pveTowerView');if(box)ui().state(box,{title:'전장을 열지 못했습니다',description:error.message,error:true});return;}
      modal.classList.remove('battle-v3-preparing');view.stage.querySelector('.battle-v3-loader')?.remove();
      ui().errorResult(view,error.message,Boolean(pendingBattle()));
      view.towerMsg.onclick=event=>{const action=event.target.closest('[data-abyss-action]')?.dataset.abyssAction;if(!action)return;event.stopPropagation();view.towerMsg.querySelectorAll('button').forEach(b=>b.disabled=true);void closeBattle({acknowledge:false,retry:action==='resume'});};
      view.towerMsg.querySelector('button')?.focus({preventScroll:true});
    }
  }
  window.addEventListener('cnine:character-power-changed',event=>{const bonuses=event.detail?.bonuses;if(!bonuses)return;if(S.data)S.data.characterBonus=bonuses;const view=document.getElementById('pveTowerView');if(view&&!view.hidden&&S.data)render();});
  window.addEventListener('cnine:route-will-change',()=>{S.request++;S.battleGeneration++;S.releaseFocus?.();S.busy=false;});
  const observer=new MutationObserver(scheduleEnsure);observer.observe(document.documentElement,{childList:true,subtree:true});void ensure();
})();
