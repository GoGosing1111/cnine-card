async function startBattle(){
  if(document.getElementById('battleAuto')?.checked)return startAutoBattle();
  if(battleState.fightStarting)return;
  const modal=document.getElementById('modal');
  const monster=(battleState.monsters||[]).find(m=>Number(m.id)===Number(battleState.selectedMonster));
  if(!modal){alert('전투 화면을 준비하지 못했습니다. PVE 화면을 다시 열어주세요.');return;}
  if(!monster){battleState.selectedMonster=Number((battleState.monsters||[])[0]?.id||0)||null;renderBattleBuilder();alert('선택한 몬스터 정보가 갱신되었습니다. 다시 전투를 시작해주세요.');return;}
  if((battleState.deck||[]).length!==5){alert('PvE 출전 카드 5장을 먼저 편성해주세요.');return;}
  const energy=battleState.energy;if(energy&&!energy.unlimited&&Number(energy.energy||0)<Math.max(1,Number(energy.costPerBattle||1))){renderBattleEnergy();alert('남은 전투 횟수가 부족합니다.');return;}
  
  battleState.fightStarting=true;
  const entryButton=document.getElementById('battleStart'),entryButtonLabel=entryButton?.textContent||'전투 시작';
  if(entryButton){entryButton.disabled=true;entryButton.textContent='전장 연결 중…'}
  let msg=null;

  try{
    const playUltimateCinematics=!battleState.autoRunning||Number(battleState.autoSummary?.battles||0)===0;
    const v2Playback=Boolean(battleState.battleEngine?.active);
    saveLastPveMonsterId(battleState.selectedMonster);
    const user=loadUser();
    let deckCards=battleState.deck.map(id=>cards.find(x=>String(x.id)===String(id))).filter(Boolean);

    if(v2Playback){
      const earlyLive=prepareImmediateBattleV3Entry({modal,playerName:user?.nickname||'MEMBER TEAM',opponentName:monster.name||'MONSTER'});
      msg=earlyLive?.msg||null;

      const [_, d] = await Promise.all([
        ensureFeatureResources('battleV2'),
        apiRequest('battle/fight',{
          method:'POST',
          body:JSON.stringify({
            requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,
            monsterId:battleState.selectedMonster,
            cardIds:battleState.deck,
            autoBattle:Boolean(battleState.autoRunning)
          })
        },{timeoutMs:20000})
      ]);

      if(!d?.battleV2)throw new Error('PROJECT V V3 전투 응답을 받지 못했습니다.');
      const live=window.prepareBattleV2LiveLoading({modal,mode:'PVE',playerName:user?.nickname||'MEMBER TEAM',opponentName:monster.name||'MONSTER'});
      const stage=live.stage,phase=live.phase;
      msg=live.msg;
      ensureBattleSoundButton(stage);
      await window.playPveBattleV2Live({stage,phase,msg,modal,data:d,monster,playUltimateCinematics});
      return;
    }

    const previewCardPower=deckCards.reduce((sum,c)=>sum+battleCardPower(c,user,battleState.config),0),previewPower=previewCardPower+Number(battleState.characterBonus?.pve||0);
    modal.className=`modal show battle-modal${battleState.autoRunning?' auto-battle-modal':''}`;
    modal.innerHTML=`<div class="modal-panel battle-stage intro">
      <div class="battle-backdrop"></div><div class="battle-fx-layer"></div>
      <div class="battle-topline"><span>SOOP PVE BATTLE</span><b id="battlePhase">ENCOUNTER</b></div>
      ${battleState.autoRunning?`<div class="auto-battle-stage-status"><i></i><b>자동전투</b><span>${Number(battleState.autoSummary?.battles||0)+1} / ${Number(battleState.autoTargetBattles||1)}</span><small>전투 연출 진행 중</small></div>`:''}
      <div class="battle-hud">
        <div class="battle-hp battle-hp-team"><div class="battle-hp-head"><b>MEMBER TEAM</b><span data-hp-text="team">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="team"></u><i data-hp-fill="team"></i><em>K.O.</em></div><small>전투력 ${previewPower.toLocaleString()}</small></div>
        <div class="battle-hp battle-hp-enemy"><div class="battle-hp-head"><b>${escapeHtml(monster.name)}</b><span data-hp-text="enemy">100 / 100 · 100%</span></div><div class="battle-hp-track"><u data-hp-trail="enemy"></u><i data-hp-fill="enemy"></i><em>K.O.</em></div><small>전투력 ${Number(monster.battlePower||0).toLocaleString()}</small></div>
      </div>
      <div class="battle-arena">
        <div class="battle-side player-side"><div class="battle-team">${deckCards.map((c,i)=>battleFighterHtml(c,i)).join('')}</div><small>MEMBER TEAM</small></div>
        <div class="battle-center"><strong class="battle-vs-mark">VS</strong><span id="battleCountdown"></span></div>
        <div class="battle-side enemy-side"><div class="battle-enemy-card ${monster.isBoss?'boss':''}"><div class="enemy-card-badge">${monster.isBoss?'BOSS':'MONSTER'}</div><div class="battle-enemy-visual">${monster.image?`<img src="${monster.image}">`:'<div class="monster-placeholder">👹</div>'}</div><div class="battle-enemy-title">${escapeHtml(monster.name)}</div><div class="enemy-card-power">POWER ${Number(monster.battlePower||0).toLocaleString()}</div></div></div>
      </div>
      <div class="battle-impact"><i></i><i></i><i></i></div>
      <div id="battleMessage" class="battle-message"><span>전투 준비 중...</span></div>
    </div>`;
    
    const stage=modal.querySelector('.battle-stage'),phase=document.getElementById('battlePhase'),count=document.getElementById('battleCountdown');
    msg=document.getElementById('battleMessage');
    ensureBattleSoundButton(stage);

    const [d] = await Promise.all([
      apiRequest('battle/fight',{method:'POST',body:JSON.stringify({requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,monsterId:battleState.selectedMonster,cardIds:battleState.deck,autoBattle:Boolean(battleState.autoRunning)})}),
      (async()=>{
        battleTone(90,.18,'sawtooth',.035); await battleSleep(250);
        stage.classList.add('cards-enter'); phase.textContent='TEAM DEPLOY'; await battleSleep(350);
        stage.classList.add('enemy-enter'); phase.textContent=monster.isBoss?'BOSS APPEARS':'ENEMY APPEARS'; await battleSleep(350);
        count.textContent='FIGHT'; battleTone(440,.18,'square',.075); stage.classList.add('fight'); await battleSleep(250); count.textContent='';
      })()
    ]);

    if(Array.isArray(d.cards)&&d.cards.length===deckCards.length){deckCards=d.cards;const team=stage.querySelector('.player-side .battle-team');if(team)team.innerHTML=deckCards.map((card,index)=>battleFighterHtml(card,index)).join('');stage.classList.add('cards-enter')}
    const teamPowerLabel=stage.querySelector('.battle-hp-team small'),shownPower=Number(d.battleV2?.teams?.A?.summary?.power||d.playerPower||previewPower);if(teamPowerLabel)teamPowerLabel.textContent=`전투력 ${shownPower.toLocaleString()}`;
    if(d.uniqueAbility?.battleEffects?.events?.length){await playUniqueBattleEventSequence(stage,phase,msg,d.uniqueAbility,deckCards,false);phase.textContent='UNIQUE ABILITY READY';await battleSleep(180);}
    
    let enemyHp=100,teamHp=100,battleEnded=false;
    const win=d.result==='WIN';
    const enemySteps=win?[14,17,18,20,31]:[9,11,13,15,17];
    const teamCounter=win?[8,10]:[18,25,31];

    for(let i=0;i<deckCards.length&&!battleEnded;i++){
      const c=deckCards[i],high=gradeOrder[c.grade]>=gradeOrder.UR;
      battleActivateCard(stage,i,c.grade);phase.textContent=`${c.grade} MEMBER STRIKE`;
      stage.classList.remove('member-strike','member-skill');void stage.offsetWidth;stage.classList.add(high?'member-skill':'member-strike');
      const dmg=enemySteps[i]||15; enemyHp=Math.max(win&&i<4?4:0,enemyHp-dmg); battleSetHp(stage,'enemy',enemyHp);
      battleBurst(stage,'73%','43%',high?30:16); battleDamage(stage,high?`${c.grade} BURST!`:`-${Math.max(120,Math.round(d.monsterPower*dmg/100))}`,'enemy',high);
      await battleSleep(high?450:350);
      if(enemyHp<=0){break;}
      if((i===1||i===3||(!win&&i===4))&&teamHp>0&&!battleEnded){
        stage.classList.remove('member-strike','member-skill');stage.classList.add('monster-heavy-attack');phase.textContent=monster.isBoss?'BOSS RAGE':'MONSTER COUNTER';
        const hit=teamCounter.shift()||18;teamHp=Math.max(win?12:0,teamHp-hit);battleSetHp(stage,'team',teamHp);
        battleBurst(stage,'28%','43%',monster.isBoss?34:24);battleDamage(stage,monster.isBoss?'HEAVY HIT!':`-${Math.max(100,Math.round(d.playerPower*hit/100))}`,'player',monster.isBoss);
        await battleSleep(monster.isBoss?550:450);
        stage.classList.remove('monster-heavy-attack');
      }
    }
    
    stage.classList.add(win?'battle-win-v863':'battle-lose-v863');phase.textContent=win?'MISSION CLEAR':'MISSION FAILED';battleSfx(win?'victory':'defeat');
    msg.innerHTML=win?`<strong>VICTORY</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><div class="battle-reward-pop"><small>REWARD</small><b>◈ ${d.reward.toLocaleString()}</b></div><em>화면을 눌러 돌아가기</em>`:`<strong>DEFEAT</strong><span>전투력 ${d.playerPower.toLocaleString()} VS ${d.monsterPower.toLocaleString()}</span><em>화면을 눌러 돌아가기</em>`;
    battleState.energy=d.energy||battleState.energy;
    saveUser(apiUserToLocal(d.user));
    setTimeout(()=>{modal.onclick=()=>renderShell('battle')},450);

  }catch(e){
    battleState.autoRunning=false;
    console.error('PVE 전투 시작 실패:',e);
    if(msg){msg.innerHTML=`<span>${escapeHtml(e.message||'전투를 시작하지 못했습니다.')}</span><em>화면을 눌러 돌아가기</em>`;modal.onclick=()=>renderShell('battle')}
    else{modal.className='modal';modal.innerHTML='';alert(e.message||'전투 화면을 준비하지 못했습니다.');renderShell('battle')}
  }finally{
    battleState.fightStarting=false;
    if(entryButton?.isConnected){entryButton.disabled=false;entryButton.textContent=entryButtonLabel}
  }
}