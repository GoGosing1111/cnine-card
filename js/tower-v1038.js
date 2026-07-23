(()=>{
  const AUTO_KEY='cnine:tower:autoProgress:v1';
  const S={data:null,busy:false,enabled:true,ensureBusy:false,ensureTimer:null,lastConfigAt:0,autoEnabled:loadAuto(),autoRunning:false,autoTimer:null};
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function loadAuto(){try{return localStorage.getItem(AUTO_KEY)==='ON'}catch{return false}}
  function saveAuto(value){S.autoEnabled=Boolean(value);try{localStorage.setItem(AUTO_KEY,S.autoEnabled?'ON':'OFF')}catch{}}
  function clearAutoTimer(){if(S.autoTimer){clearTimeout(S.autoTimer);S.autoTimer=null}}
  function stopAuto(){clearAutoTimer();S.autoRunning=false}
  function privileged(){const user=loadUser?.();return ['OWNER','ADMIN'].includes(String(user?.role||'').toUpperCase())}
  function towerButtons(tabs){return [...tabs.querySelectorAll('[data-pve-mode="tower"]')]}
  function normalizeTowerDom(tabs){
    const buttons=towerButtons(tabs);buttons.slice(1).forEach(x=>x.remove());
    const views=[...document.querySelectorAll('#pveTowerView')];views.slice(1).forEach(x=>x.remove());
    return {button:buttons[0]||null,view:views[0]||null};
  }
  function scheduleEnsure(){clearTimeout(S.ensureTimer);S.ensureTimer=setTimeout(ensure,40)}
  async function ensure(){
    const tabs=document.querySelector('.pve-mode-tabs');if(!tabs)return;
    const normalized=normalizeTowerDom(tabs);
    if(normalized.button&&normalized.view&&tabs.dataset.towerBound==='1'&&tabs.dataset.towerReady==='1')return;
    if(S.ensureBusy)return;
    S.ensureBusy=true;
    try{
      let cfg={enabled:S.enabled};
      if(!S.lastConfigAt||Date.now()-S.lastConfigAt>15000){try{cfg=await apiRequest('tower/config',{}, {ttl:0})||cfg}catch{}S.lastConfigAt=Date.now()}
      S.enabled=cfg.enabled!==false;
      if(!S.enabled&&!privileged()){
        towerButtons(tabs).forEach(x=>x.remove());
        document.querySelectorAll('#pveTowerView').forEach(x=>x.remove());tabs.dataset.towerReady='0';
        return;
      }
      let button=normalized.button||tabs.querySelector('[data-pve-mode="tower"]');
      if(!button){button=document.createElement('button');button.type='button';button.className='pve-mode-btn';button.dataset.pveMode='tower';button.textContent='무한의탑';tabs.appendChild(button)}
      towerButtons(tabs).slice(1).forEach(x=>x.remove());
      let box=normalized.view||document.getElementById('pveTowerView');
      if(!box){const raid=document.getElementById('pveRaidView');if(!raid)return;box=document.createElement('div');box.id='pveTowerView';box.className='pve-tower-view';box.hidden=true;raid.insertAdjacentElement('afterend',box)}
      if(tabs.dataset.towerBound!=='1'){
        tabs.dataset.towerBound='1';
        tabs.addEventListener('click',e=>{
          const btn=e.target.closest('[data-pve-mode]');if(!btn)return;
          if(btn.dataset.pveMode==='tower'){e.preventDefault();openTower()}
          else{stopAuto();const view=document.getElementById('pveTowerView');if(view)view.hidden=true}
        });
      }
      tabs.dataset.towerReady='1';
    }finally{S.ensureBusy=false}
  }
  async function openTower(){
    stopAuto();
    document.querySelectorAll('.pve-mode-btn').forEach(x=>x.classList.toggle('active',x.dataset.pveMode==='tower'));
    ['pveHuntView','pveRaidView'].forEach(id=>{const el=document.getElementById(id);if(el)el.hidden=true});
    const box=document.getElementById('pveTowerView');if(!box)return;box.hidden=false;box.innerHTML='<section class="tower-loading"><div class="tower-spinner"></div><h2>무한의탑을 불러오는 중...</h2></section>';
    try{S.data=await apiRequest('tower/status',{}, {ttl:0});render()}catch(e){box.innerHTML=`<section class="tower-empty"><h2>무한의탑</h2><p>${esc(e.message)}</p></section>`}
  }
  function currentDeckCards(){return (S.data?.deck||[]).map(id=>cards.find(x=>String(x.id)===String(id))).filter(Boolean)}
  function render(){
    const d=S.data,box=document.getElementById('pveTowerView');if(!box)return;
    if(!d?.active){box.innerHTML='<section class="tower-empty"><h2>무한의탑을 이용할 수 없습니다</h2><p>운영 설정을 확인해 주세요.</p></section>';return}
    const p=d.progress||{},f=d.floor||{},rank=d.ranking||[];
    if(d.configured===false||Number(d.maxFloor||0)<1){box.innerHTML=`<section class="tower-empty tower-unconfigured"><p class="eyebrow">INFINITE TOWER</p><h2>아직 개방되지 않았습니다</h2><p>${esc(d.message||'운영자가 무한의탑 층을 아직 설정하지 않았습니다.')}</p><strong>설정된 층이 생기면 이곳에서 바로 도전할 수 있습니다.</strong></section>`;return}
    if(d.blocked||!d.floor){box.innerHTML=`<section class="tower-empty tower-blocked"><p class="eyebrow">FLOOR LOCKED</p><h2>${Number(p.currentFloor||1)}층은 아직 설정되지 않았습니다</h2><p>${esc(d.message||'운영자가 다음 층을 배치할 때까지 진행할 수 없습니다.')}</p><strong>임의 몬스터는 출현하지 않으며, 설정된 최고층까지만 등반할 수 있습니다.</strong></section>`;return}
    if(d.completed||p.completed){box.innerHTML=`<section class="tower-empty tower-completed"><p class="eyebrow">INFINITE TOWER COMPLETE</p><h2>최고층 등반 완료</h2><p>${Number(d.maxFloor||p.highestFloor||0)}층까지 모두 클리어했습니다.</p><strong>자동으로 1층으로 돌아가지 않습니다.</strong><span>운영자가 진행도를 직접 초기화하거나 새로운 층을 추가하면 다시 도전할 수 있습니다.</span></section>`;return}
    box.innerHTML=`
    <section class="tower-hero ${f.isBoss?'boss-ready':''}">
      <div class="tower-hero-copy"><p class="eyebrow">INFINITE TOWER</p><h2>무한의탑</h2><p>저장된 PVE 덱 5장으로 최고층까지 도전하세요.</p></div>
      <div class="tower-hero-art" aria-hidden="true"><span class="tower-spire"></span><span class="tower-body"></span><span class="tower-base"></span><i></i><i></i><i></i></div>
      <div class="tower-season-clock"><span>운영 방식</span><b>상시 운영</b></div>
    </section>
    <section class="tower-overview">
      <article><small>CURRENT FLOOR</small><strong>${Number(p.currentFloor||1)}F</strong><span>현재 도전층</span></article>
      <article><small>BEST FLOOR</small><strong>${Number(p.highestFloor||0)}F</strong><span>개인 최고층</span></article>
      <article><small>MY RANK</small><strong>${Number(p.rank||1)}위</strong><span>현재 순위</span></article>
      <article class="next-boss"><small>NEXT BOSS</small><strong>${Math.ceil(Number(p.currentFloor||1)/10)*10}F</strong><span>다음 보스층</span></article>
    </section>
    <section class="tower-main-grid">
      <div class="tower-floor-card ${f.isBoss?'boss-floor':''}">
        <div class="tower-floor-number"><span>${f.isBoss?'BOSS FLOOR':'FLOOR'}</span><b>${Number(f.floorNo||1)}</b></div>
        <div class="tower-monster-visual">${f.monsterImage?`<img src="${esc(f.monsterImage)}" alt="">`:'<div class="tower-monster-placeholder">👹</div>'}<i></i></div>
        <div class="tower-floor-info"><p>${f.isBoss?'강력한 층주가 기다리고 있습니다':'탑의 수문장이 길을 막고 있습니다'}</p><h3>${esc(f.monsterName||'탑의 수문장')}</h3><div><span>권장 전투력</span><b>${Number(f.monsterPower||0).toLocaleString()}</b></div><div><span>클리어 보상</span><b>◈ ${Number(f.rewardCoin||0).toLocaleString()}</b></div></div>
        <div class="tower-action-panel">
          <label class="tower-auto-option" for="towerAutoProgress"><input type="checkbox" id="towerAutoProgress" ${S.autoEnabled?'checked':''}><span class="tower-auto-switch"><i></i></span><span class="tower-auto-copy"><b>자동진행</b><small>승리하면 다음 층을 자동으로 도전합니다.</small></span></label>
          <button class="tower-enter-btn ${f.isBoss?'boss':''}" id="towerStart"><span class="tower-enter-mark">${f.isBoss?'!':'▲'}</span><span><small>${f.isBoss?'BOSS FLOOR':'INFINITE TOWER'}</small><strong>${Number(f.floorNo||1)}층 도전</strong></span><i>도전 시작</i></button>
        </div>
      </div>
      <aside class="tower-side-panel">
        <div class="tower-deck-preview"><div class="tower-deck-head"><div><p class="eyebrow">PVE SAVED DECK</p><h3>현재 저장 덱</h3></div><button id="towerGoDeck" class="tower-deck-manage"><span class="tower-deck-glyph"><i></i><i></i><i></i></span><span><b>PVE 덱 편성</b><small>저장 덱 변경하기</small></span><em>편성</em></button></div><div class="tower-deck-slots">${(d.deck||[]).map(id=>{const c=cards.find(x=>String(x.id)===String(id));return c?`<div><img src="${esc(c.image)}"><span>${esc(c.title)}</span></div>`:'<div class="empty">?</div>'}).join('')}${Array.from({length:Math.max(0,5-(d.deck||[]).length)},()=>'<div class="empty">+</div>').join('')}</div><small>무한의탑은 PVE에 저장된 덱을 그대로 사용합니다.</small></div>
        <div class="tower-ranking"><div class="panel-title"><div><p class="eyebrow">TOWER RANKING</p><h3>최고층 랭킹</h3></div></div><div class="tower-rank-list">${rank.slice(0,10).map((r,i)=>`<div class="${Number(r.user_id)===Number(loadUser()?.id)?'me':''}"><b>${i+1}</b><span>${esc(r.nickname)}</span><strong>${Number(r.highest_floor||0)}F</strong></div>`).join('')||'<p>아직 기록이 없습니다.</p>'}</div></div>
      </aside>
    </section>`;
    const auto=document.getElementById('towerAutoProgress');
    auto.onchange=()=>{saveAuto(auto.checked);syncTowerStartCopy()};
    document.getElementById('towerStart').onclick=()=>startFight(false);
    document.getElementById('towerGoDeck').onclick=()=>{stopAuto();document.querySelector('[data-pve-mode="hunt"]')?.click();setTimeout(()=>document.querySelector('[data-pve-tab="deck"]')?.click(),120)};
    syncTowerStartCopy();
  }
  function syncTowerStartCopy(){const btn=document.getElementById('towerStart'),copy=btn?.querySelector('i');if(copy)copy.textContent=S.autoEnabled?'자동 등반 시작':'도전 시작'}
  function towerBattleMarkup(f,deckCards,previewPower){
    const monster={name:f.monsterName||'탑의 수문장',image:f.monsterImage||'',battlePower:Number(f.monsterPower||0),isBoss:Boolean(f.isBoss)};
    return `<div class="modal-panel battle-stage intro tower-pve-battle-stage ${monster.isBoss?'tower-boss-stage':''}">
      <div class="battle-backdrop"></div><div class="battle-fx-layer"></div>
      <div class="tower-floor-intro"><small>${monster.isBoss?'WARNING · BOSS FLOOR':'INFINITE TOWER'}</small><strong>${Number(f.floorNo||1)} FLOOR</strong><span>${esc(monster.name)}</span></div>
      <div class="battle-topline"><span>INFINITE TOWER</span><b id="towerBattlePhase">FLOOR ${Number(f.floorNo||1)}</b></div>
      <div class="tower-battle-progress"><span>${Math.max(1,Number(f.floorNo||1)-1)}F</span><i><u></u></i><b>${Number(f.floorNo||1)}F</b><i><u></u></i><span>${Number(f.floorNo||1)+1}F</span></div>
      ${S.autoRunning?`<div class="tower-auto-stage-status"><i></i><b>자동진행</b><span>${Number(f.floorNo||1)}F</span><small>승리 시 다음 층으로 이동</small></div>`:''}
      <div class="battle-hud">
        <div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>MEMBER TEAM</b><span data-hp-text="team">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="team"></u><i data-hp-fill="team"></i><em>K.O.</em></div><small>전투력 ${Number(previewPower||0).toLocaleString()}</small></div>
        <div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${esc(monster.name)}</b><span data-hp-text="enemy">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="enemy"></u><i data-hp-fill="enemy"></i><em>K.O.</em></div><small>${monster.isBoss?'BOSS · ':''}전투력 ${monster.battlePower.toLocaleString()}</small></div>
      </div>
      <div class="battle-arena">
        <div class="battle-side player-side"><div class="battle-team" id="towerBattleTeam">${deckCards.map((c,i)=>battleFighterHtml(c,i)).join('')}</div><small>MEMBER TEAM</small></div>
        <div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="towerBattleCountdown"></span></div>
        <div class="battle-side enemy-side"><div class="battle-enemy-card ${monster.isBoss?'boss':''}"><div class="enemy-card-badge">${monster.isBoss?'BOSS FLOOR':'TOWER MONSTER'}</div><div class="battle-enemy-visual">${monster.image?`<img src="${esc(monster.image)}">`:'<div class="monster-placeholder">👹</div>'}</div><div class="battle-enemy-title">${esc(monster.name)}</div><div class="enemy-card-power">POWER ${monster.battlePower.toLocaleString()}</div></div></div>
      </div>
      <div class="battle-impact"><i></i><i></i><i></i></div>
      <div id="towerBattleMessage" class="battle-message"><span>탑의 문이 열리고 있습니다</span></div>
    </div>`;
  }
  async function startFight(fromAuto=false){
    if(S.busy)return;
    if((S.data?.deck||[]).length!==5)return alert('먼저 PVE 덱 5장을 저장하세요.');
    clearAutoTimer();S.busy=true;S.autoRunning=Boolean(fromAuto||S.autoEnabled);
    const f=S.data.floor||{},modal=document.getElementById('modal'),deckCards=currentDeckCards();
    const previewPower=deckCards.reduce((sum,c)=>sum+(typeof battleCardPower==='function'?battleCardPower(c,loadUser(),battleState?.config):Number(c.basePower||0)),0);
    modal.className='modal show battle-modal tower-battle-modal';modal.innerHTML=towerBattleMarkup(f,deckCards,previewPower);
    const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('towerBattlePhase'),count=document.getElementById('towerBattleCountdown'),msg=document.getElementById('towerBattleMessage');
    ensureBattleSoundButton(stage);
    try{
      battleTone(f.isBoss?58:96,.2,'sawtooth',.045);await battleSleep(f.isBoss?1000:760);
      stage.classList.add('cards-enter');phase.textContent='TEAM DEPLOY';await battleSleep(850);
      stage.classList.add('enemy-enter');phase.textContent=f.isBoss?'BOSS APPEARS':'GUARDIAN APPEARS';battleSfx(f.isBoss?'warning':'swing');if(navigator.vibrate)navigator.vibrate(f.isBoss?[100,45,150]:60);await battleSleep(f.isBoss?1000:780);
      count.textContent='READY';stage.classList.add('ready');await battleSleep(600);count.textContent='FIGHT';battleTone(440,.18,'square',.075);stage.classList.add('fight');await battleSleep(480);count.textContent='';
      const d=await apiRequest('tower/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`})}),win=d.result==='WIN';
      if(d.cubeReward&&window.showCubeDropAcquisition)await window.showCubeDropAcquisition(d.cubeReward);
      if(d.magicReward?.amount>0||d.weeklyPremiumCube){const current=loadUser();if(current){if(d.magicReward?.amount>0)current.magicCrystals=Number(d.magicReward.balance||current.magicCrystals||0);if(d.weeklyPremiumCube)current.weeklyPremiumCube=d.weeklyPremiumCube;saveUser(current)}}
      const magicRewardText=d.magicReward?.amount>0?` · 마법 결정 ✦ ${Number(d.magicReward.amount).toLocaleString()}`:'';
      const teamPowerLabel=stage.querySelector('.battle-hp-team small'),enemyPowerLabel=stage.querySelector('.battle-hp-enemy small');if(teamPowerLabel)teamPowerLabel.textContent=`전투력 ${Number(d.playerPower||0).toLocaleString()}`;if(enemyPowerLabel)enemyPowerLabel.textContent=`${f.isBoss?'BOSS · ':''}전투력 ${Number(d.monsterPower||0).toLocaleString()}`;
      if(Array.isArray(d.cards)&&d.cards.length===5){const team=document.getElementById('towerBattleTeam');if(team)team.innerHTML=d.cards.map((c,i)=>battleFighterHtml(c,i)).join('')}
      const fighters=(d.cards?.length?d.cards:deckCards),enemySteps=win?[13,16,18,21,32]:[8,10,12,14,16],teamHits=win?[9,12]:[19,27,35];let enemyHp=100,teamHp=100;
      if(d.bossUltimate){
        const bossHit=typeof playBossBattleUltimate==='function'?await playBossBattleUltimate(stage,phase,d.bossUltimate):{teamHpLoss:Math.max(12,Math.min(55,Number(d.bossUltimate.damagePercent||15)))};
        teamHp=Math.max(0,teamHp-Number(bossHit.teamHpLoss||0));
        battleSetHp(stage,'team',teamHp);
      }

      for(let i=0;i<fighters.length;i++){
        const c=fighters[i],grade=String(c.grade||c.rarity||'C').toUpperCase(),high=(gradeOrder?.[grade]||1)>=(gradeOrder?.UR||6);
        battleActivateCard(stage,i,grade);phase.textContent=`${grade} MEMBER STRIKE`;
        stage.classList.remove('member-strike','member-skill');void stage.offsetWidth;stage.classList.add(high?'member-skill':'member-strike');
        const damage=enemySteps[i]||15;enemyHp=Math.max(win&&i<4?4:0,enemyHp-damage);battleSetHp(stage,'enemy',enemyHp);battleBurst(stage,'73%','43%',high?30:17);battleDamage(stage,high?`${grade} BURST!`:`-${Math.max(120,Math.round(Number(d.monsterPower||0)*damage/100)).toLocaleString()}`,'enemy',high);await battleSleep(high?700:540);
        if((i===1||i===3||(!win&&i===4))&&teamHp>0){stage.classList.remove('member-strike','member-skill');stage.classList.add('monster-heavy-attack');phase.textContent=f.isBoss?'TOWER BOSS RAGE':'GUARDIAN COUNTER';const hit=teamHits.shift()||18;teamHp=Math.max(win?12:0,teamHp-hit);battleSetHp(stage,'team',teamHp);battleBurst(stage,'28%','43%',f.isBoss?34:24);battleDamage(stage,f.isBoss?'HEAVY HIT!':`-${Math.max(100,Math.round(Number(d.playerPower||0)*hit/100)).toLocaleString()}`,'player',Boolean(f.isBoss));await battleSleep(f.isBoss?820:670);stage.classList.remove('monster-heavy-attack')}
      }
      stage.querySelectorAll('.battle-card-fighter').forEach(el=>el.classList.remove('active-attacker'));
      phase.textContent=win?'FINAL STRIKE':'TOWER GUARDIAN FINISH';stage.classList.add(win?'final-strike-v863':'final-fail-v863');
      if(win){battleSetHp(stage,'enemy',0);battleBurst(stage,'74%','43%',55);battleDamage(stage,'FLOOR CLEAR!','enemy',true);if(navigator.vibrate)navigator.vibrate([70,30,180])}
      else{battleSetHp(stage,'team',0);battleBurst(stage,'26%','43%',48);battleDamage(stage,'K.O.','player',true);if(navigator.vibrate)navigator.vibrate([160,50,160])}
      await battleSleep(1000);stage.classList.add(win?'battle-win-v863':'battle-lose-v863');phase.textContent=win?`${Number(d.floorNo)}F CLEAR`:'CHALLENGE FAILED';battleSfx(win?'victory':'defeat');
      if(win&&d.completed){
        stopAuto();saveAuto(false);msg.innerHTML=`<strong>최고층 등반 완료</strong><span>${Number(d.floorNo)}층까지 모두 클리어했습니다.${magicRewardText} 자동으로 1층으로 돌아가지 않습니다.</span><button type="button" class="tower-result-button" id="towerResultBtn">완료 화면 확인</button>`;document.getElementById('towerResultBtn').onclick=e=>{e.stopPropagation();closeBattleAndRefresh()};
      }else if(win&&S.autoRunning&&S.autoEnabled){
        msg.innerHTML=`<strong>${Number(d.floorNo)}층 클리어</strong><span>보상 ◈ ${Number(d.reward||0).toLocaleString()}${magicRewardText} · 다음 ${Number(d.nextFloor)}층</span><div class="tower-auto-next"><i></i><b>다음 층 자동진행 중</b><small>잠시 후 ${Number(d.nextFloor)}층 전투가 시작됩니다.</small></div><button type="button" class="tower-auto-stop" id="towerAutoStop">자동진행 중단</button>`;
        document.getElementById('towerAutoStop').onclick=e=>{e.stopPropagation();saveAuto(false);stopAuto();closeBattleAndRefresh()};
        S.autoTimer=setTimeout(()=>continueAuto(),1900);
      }else{
        if(!win)S.autoRunning=false;
        msg.innerHTML=win?`<strong>${Number(d.floorNo)}층 클리어</strong><span>보상 ◈ ${Number(d.reward||0).toLocaleString()}${magicRewardText} · 다음 ${Number(d.nextFloor)}층</span><button type="button" class="tower-result-button" id="towerResultBtn">다음 층 확인</button>`:`<strong>${Number(d.floorNo)}층 도전 실패</strong><span>${S.autoEnabled?'패배하여 자동진행이 중단되었습니다. ':''}현재 층에서 다시 도전할 수 있습니다.</span><button type="button" class="tower-result-button retry" id="towerResultBtn">무한의탑으로 돌아가기</button>`;
        document.getElementById('towerResultBtn').onclick=e=>{e.stopPropagation();closeBattleAndRefresh()};
      }
    }catch(e){stopAuto();msg.innerHTML=`<span>${esc(e.message)}</span><button class="tower-result-button retry" id="towerCloseErr">닫기</button>`;document.getElementById('towerCloseErr').onclick=e=>{e.stopPropagation();closeBattleAndRefresh()}}
  }
  async function continueAuto(){
    clearAutoTimer();
    if(!S.autoEnabled){stopAuto();return closeBattleAndRefresh()}
    const modal=document.getElementById('modal');modal.className='modal';modal.innerHTML='';S.busy=false;
    try{S.data=await apiRequest('tower/status',{}, {ttl:0});if(!S.data?.active){stopAuto();return openTower()}return startFight(true)}
    catch(e){stopAuto();alert(e.message);openTower()}
  }
  function closeBattleAndRefresh(){clearAutoTimer();S.busy=false;S.autoRunning=false;const modal=document.getElementById('modal');modal.className='modal';modal.innerHTML='';openTower()}
  const observer=new MutationObserver(scheduleEnsure);observer.observe(document.documentElement,{childList:true,subtree:true});ensure();
})();
