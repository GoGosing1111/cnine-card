(() => {
  'use strict';

  const PLAYBACK_SPEED = 1.6;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch]));
  const num = value => Math.max(0, Math.round(Number(value || 0))).toLocaleString();
  const pause = ms => battleSleep(Math.max(24, Math.round(Number(ms || 0) / PLAYBACK_SPEED)));
  const typeKey = type => ({ ATTACK:'attack', DEFENSE:'defense', HP:'hp', SPEED:'speed' })[String(type || '').toUpperCase()] || '';

  function fighterHtml(card, index) {
    const type = typeKey(card.type);
    const classes = ['battle-card-fighter', 'pve-v2-fighter'];
    if (type) classes.push('unique-card-fx-host', `unique-fx-${type}`);
    return `<div class="${classes.join(' ')}" data-fighter="${index}" data-v2-id="${esc(card.id)}" ${type ? `data-unique-fx="${type}" data-unique-value="1"` : ''} style="--i:${index}">
      <div class="fighter-aura"></div>
      ${combatCardHtml(card, 'battle-fighter-card', Number(card.breakthroughLevel || 0))}
      <div class="pve-v2-card-hud">
        <div class="pve-v2-card-head"><b>${card.row === 'FRONT' ? '전열' : '후열'} · ${esc(card.typeLabel || '균형형')}</b><span data-v2-hp-text>${num(card.hp)} / ${num(card.maxHp)}</span></div>
        <div class="pve-v2-card-shield" ${Number(card.maxShield || 0) > 0 ? '' : 'hidden'}><i data-v2-shield-fill style="width:${Math.max(0, Math.min(100, Number(card.shield || 0) / Math.max(1, Number(card.maxShield || 1)) * 100))}%"></i></div>
        <div class="pve-v2-card-hp"><i data-v2-hp-fill style="width:${Math.max(0, Math.min(100, Number(card.hp || 0) / Math.max(1, Number(card.maxHp || 1)) * 100))}%"></i></div>
        <div class="pve-v2-card-gauge"><i data-v2-gauge-fill style="width:${Math.max(0, Math.min(100, Number(card.gauge || 0)))}%"></i></div>
      </div>
    </div>`;
  }

  function monsterHtml(card, monster) {
    return `<div class="battle-enemy-card ${monster?.isBoss ? 'boss' : ''} pve-v2-monster" data-v2-id="${esc(card.id)}">
      <div class="enemy-card-badge">${monster?.isBoss ? 'BOSS' : 'MONSTER'}</div>
      <div class="battle-enemy-visual">${card.image ? `<img src="${esc(card.image)}" alt="${esc(card.title)}">` : '<div class="monster-placeholder">👹</div>'}</div>
      <div class="battle-enemy-title">${esc(card.title)}</div>
      <div class="enemy-card-power">POWER ${num(card.power)}</div>
      <div class="pve-v2-monster-stats"><span>HP ${num(card.maxHp)}</span><span>ATK ${num(card.attack)}</span><span>DEF ${num(card.defense)}</span><span>SPD ${num(card.speed)}</span></div>
    </div>`;
  }

  function cloneCard(card) {
    return { ...card, id:String(card.id), hp:Number(card.hp || 0), maxHp:Number(card.maxHp || 1), shield:Number(card.shield || 0), maxShield:Number(card.maxShield || 0), gauge:Number(card.gauge || 0) };
  }

  function nodeFor(stage, id) {
    const wanted = String(id ?? '');
    return [...stage.querySelectorAll('[data-v2-id]')].find(node => node.dataset.v2Id === wanted) || null;
  }

  function syncCard(stage, card) {
    const node = nodeFor(stage, card.id);
    if (!node) return;
    const hpPct = Math.max(0, Math.min(100, Number(card.hp || 0) / Math.max(1, Number(card.maxHp || 1)) * 100));
    const shieldPct = Number(card.maxShield || 0) > 0 ? Math.max(0, Math.min(100, Number(card.shield || 0) / Number(card.maxShield) * 100)) : 0;
    node.classList.toggle('v2-ko', Number(card.hp || 0) <= 0);
    node.classList.toggle('v2-low-hp', Number(card.hp || 0) > 0 && hpPct <= 25);
    const hp = node.querySelector('[data-v2-hp-fill]'); if (hp) hp.style.width = `${hpPct}%`;
    const shield = node.querySelector('[data-v2-shield-fill]'); if (shield) shield.style.width = `${shieldPct}%`;
    const gauge = node.querySelector('[data-v2-gauge-fill]'); if (gauge) gauge.style.width = `${Math.max(0, Math.min(100, Number(card.gauge || 0)))}%`;
    const text = node.querySelector('[data-v2-hp-text]'); if (text) text.textContent = `${num(card.hp)} / ${num(card.maxHp)}`;
  }

  function syncTeamHud(stage, cards) {
    const sides = { team:[...cards.values()].filter(card => card.side === 'A'), enemy:[...cards.values()].filter(card => card.side === 'B') };
    for (const [target, rows] of Object.entries(sides)) {
      const current = rows.reduce((sum, card) => sum + Math.max(0, Number(card.hp || 0)) + Math.max(0, Number(card.shield || 0)), 0);
      const maximum = rows.reduce((sum, card) => sum + Math.max(1, Number(card.maxHp || 1)) + Math.max(0, Number(card.maxShield || 0)), 0);
      const pct = maximum > 0 ? current / maximum * 100 : 0;
      battleSetHp(stage, target, pct);
      const label = stage.querySelector(`[data-hp-text="${target}"]`);
      if (label) label.textContent = `${num(current)} / ${num(maximum)} · ${Math.ceil(pct)}%`;
    }
  }

  function syncAll(stage, cards) {
    cards.forEach(card => syncCard(stage, card));
    syncTeamHud(stage, cards);
  }

  function setActive(stage, actor, target) {
    stage.querySelectorAll('.pve-v2-fighter,.pve-v2-monster').forEach(node => node.classList.remove('v2-active','v2-target'));
    nodeFor(stage, actor?.id)?.classList.add('v2-active');
    nodeFor(stage, target?.id)?.classList.add('v2-target');
  }

  function applyHit(card, event) {
    if (!card) return;
    if (event.targetHpAfter != null) card.hp = Number(event.targetHpAfter);
    if (event.targetMaxHp != null) card.maxHp = Number(event.targetMaxHp);
    if (event.targetShieldAfter != null) card.shield = Number(event.targetShieldAfter);
    if (event.targetGaugeAfter != null) card.gauge = Number(event.targetGaugeAfter);
  }

  async function playTimeline({ stage, phase, msg, data, monster, playUltimateCinematics }) {
    const v2 = data.battleV2;
    const cards = new Map([...(v2.teams?.A?.cards || []), ...(v2.teams?.B?.cards || [])].map(card => [String(card.id), cloneCard(card)]));
    const playerRows = v2.teams?.A?.cards || [];
    const monsterCard = v2.teams?.B?.cards?.[0];
    const team = stage.querySelector('.player-side .battle-team');
    if (team) team.innerHTML = playerRows.map(fighterHtml).join('');
    const enemy = stage.querySelector('.enemy-side');
    if (enemy && monsterCard) enemy.innerHTML = monsterHtml(monsterCard, monster);
    stage.classList.remove('cards-enter', 'enemy-enter');
    stage.classList.add('pve-v2-live');
    const topline = stage.querySelector('.battle-topline span');
    if (topline) topline.textContent = 'SOOPKETMON PVE · BATTLE ENGINE V2 · 1.6X';
    syncAll(stage, cards);

    for (const event of v2.result?.timeline || []) {
      const actor = cards.get(String(event.actorId || ''));
      const target = cards.get(String(event.targetId || ''));
      if (event.type === 'START_EFFECT') {
        if (target) { target.shield = Number(event.shieldAfter ?? event.amount ?? target.shield); syncCard(stage, target); }
        if (target?.side === 'A') battleTriggerUniqueFx(stage, Number(target.slot || 0), 'defense', false);
        phase.textContent = event.label || 'BARRIER FIELD';
        await pause(180);
        continue;
      }
      if (event.type === 'PVE_ULTIMATE') {
        phase.textContent = 'ULTIMATE READY';
        if (playUltimateCinematics && data.activatedUltimate) { const ultimate={...data.activatedUltimate,playbackRate:PLAYBACK_SPEED,durationMs:Math.max(500,Math.round(Number(data.activatedUltimate.durationMs||3000)/PLAYBACK_SPEED))}; await playBattleUltimate(stage, ultimate, event.damage || data.ultimateDamage); }
        applyHit(target, event); syncAll(stage, cards);
        battleBurst(stage, '74%', '43%', 46); battleDamage(stage, `-${num((event.damage || 0) + (event.absorbed || 0))}`, 'enemy', true);
        phase.textContent = `ULTIMATE HIT · ${num(event.damage || 0)}`;
        await pause(720);
        continue;
      }
      if (event.type === 'BOSS_ULTIMATE') {
        phase.textContent = data.bossUltimate?.warningText || 'BOSS ULTIMATE';
        if (playUltimateCinematics && data.bossUltimate) { const ultimate={...data.bossUltimate,playbackRate:PLAYBACK_SPEED,durationMs:Math.max(500,Math.round(Number(data.bossUltimate.durationMs||2400)/PLAYBACK_SPEED))}; await playBossBattleUltimate(stage, phase, ultimate); }
        for (const hit of event.hits || []) applyHit(cards.get(String(hit.targetId)), hit);
        syncAll(stage, cards); battleBurst(stage, '28%', '43%', 50); battleDamage(stage, 'BOSS ULTIMATE', 'player', true);
        await pause(760);
        continue;
      }
      if (event.type === 'REGEN' || event.type === 'EMERGENCY_HEAL' || event.type === 'SURVIVE') {
        if (target) { target.hp = Number(event.hpAfter ?? target.hp); target.maxHp = Number(event.maxHp ?? target.maxHp); syncAll(stage, cards); }
        if (target?.side === 'A') battleTriggerUniqueFx(stage, Number(target.slot || 0), 'low-hp', false);
        battleDamage(stage, `+${num(event.amount || Math.max(1, Number(target?.hp || 0)))}`, target?.side === 'A' ? 'player' : 'enemy', false);
        phase.textContent = event.label || 'RECOVERY';
        await pause(420);
        continue;
      }
      if (event.type === 'TURN') {
        setActive(stage, actor, target);
        if (event.actorGaugeAfter != null && actor) actor.gauge = Number(event.actorGaugeAfter);
        if (event.targetGaugeAfter != null && target) target.gauge = Number(event.targetGaugeAfter);
        if (event.dodge) {
          if (target?.side === 'A') battleTriggerUniqueFx(stage, Number(target.slot || 0), 'attack', false);
          nodeFor(stage, target?.id)?.classList.add('v2-dodge');
          phase.textContent = `${target?.title || 'CARD'} · 회피`;
          await pause(430);
          nodeFor(stage, target?.id)?.classList.remove('v2-dodge');
          syncAll(stage, cards);
          continue;
        }
        applyHit(target, event);
        if (actor?.side === 'A') {
          battleActivateCard(stage, Number(actor.slot || 0), actor.grade);
          stage.classList.remove('monster-heavy-attack'); stage.classList.add(event.critical ? 'member-skill' : 'member-strike');
          battleBurst(stage, '73%', '43%', event.critical ? 36 : 20);
          battleDamage(stage, `-${num((event.damage || 0) + (event.absorbed || 0))}`, 'enemy', Boolean(event.critical));
          phase.textContent = `${actor.title} · ${event.critical ? 'CRITICAL' : event.execute ? 'EXECUTE' : 'STRIKE'}`;
        } else {
          stage.classList.remove('member-strike','member-skill'); stage.classList.add('monster-heavy-attack');
          if (target?.side === 'A') battleTriggerUniqueFx(stage, Number(target.slot || 0), 'defense', false);
          nodeFor(stage, target?.id)?.classList.add('v2-hit');
          battleBurst(stage, '28%', '43%', event.critical ? 38 : 24);
          battleDamage(stage, `-${num((event.damage || 0) + (event.absorbed || 0))}`, 'player', Boolean(event.critical));
          phase.textContent = `${actor?.title || 'MONSTER'} · ${event.critical ? 'HEAVY CRITICAL' : 'COUNTER ATTACK'}`;
        }
        syncAll(stage, cards);
        await pause(event.critical ? 720 : 520);
        stage.classList.remove('member-strike','member-skill','monster-heavy-attack');
        nodeFor(stage, target?.id)?.classList.remove('v2-hit');
        continue;
      }
      if (event.type === 'COUNTER') {
        setActive(stage, actor, target); applyHit(target, event);
        if (actor?.side === 'A') battleTriggerUniqueFx(stage, Number(actor.slot || 0), 'defense', false);
        battleBurst(stage, actor?.side === 'A' ? '73%' : '28%', '43%', 28);
        battleDamage(stage, `-${num((event.damage || 0) + (event.absorbed || 0))}`, target?.side === 'A' ? 'player' : 'enemy', Boolean(event.critical));
        phase.textContent = event.label || 'COUNTER'; syncAll(stage, cards); await pause(560); continue;
      }
      if (event.type === 'KO') {
        if (target) { target.hp = 0; syncAll(stage, cards); }
        nodeFor(stage, target?.id)?.classList.add('v2-ko');
        phase.textContent = `${target?.title || 'TARGET'} · K.O.`;
        await pause(360); continue;
      }
      if (event.type === 'FRONTLINE_BREAK') {
        phase.textContent = event.label || 'FRONTLINE BREAK';
        stage.classList.add('v2-frontline-break'); await pause(460); stage.classList.remove('v2-frontline-break'); continue;
      }
      if (event.type === 'RESULT') {
        phase.textContent = event.winner === 'A' ? 'MISSION CLEAR' : 'MISSION FAILED';
      }
    }
    syncAll(stage, cards);
    return cards;
  }

  async function finishBattle({ stage, phase, msg, modal, data }) {
    const win = data.result === 'WIN';
    const judged = data.battleV2?.result?.reason === 'ACTION_LIMIT';
    const actions = Math.max(0, Number(data.battleV2?.result?.actions || 0));
    stage.querySelectorAll('.battle-card-fighter').forEach(node => node.classList.remove('active-attacker','v2-active','v2-target'));
    stage.classList.add(win ? 'battle-win-v863' : 'battle-lose-v863');
    phase.textContent = win ? (judged ? 'MISSION CLEAR · JUDGEMENT' : 'MISSION CLEAR') : (judged ? 'MISSION FAILED · JUDGEMENT' : 'MISSION FAILED');
    battleSfx(win ? 'victory' : 'defeat');
    if (data.cubeReward && window.showCubeDropAcquisition) { try { await window.showCubeDropAcquisition(data.cubeReward); } catch (error) { console.warn(error); } }
    if (data.equipmentReward && window.showEquipmentDropReward) { try { await window.showEquipmentDropReward(data.equipmentReward); } catch (error) { console.warn(error); } }
    const resultDetail = `${judged ? `행동 ${actions}회 판정 · ` : ''}전투엔진 V2 · 1.6배 · 전투력 ${num(data.battleV2?.teams?.A?.summary?.power || data.playerPower)} VS ${num(data.monsterPower)}`;
    msg.innerHTML = win
      ? `<strong>VICTORY</strong><span>${resultDetail}</span><div class="battle-reward-pop"><small>REWARD</small><b>◈ ${num(data.reward)}</b>${Number(data.magicReward?.amount || 0) > 0 ? `<div class="battle-magic-drop"><strong>✦ 마법 결정 +${num(data.magicReward.amount)}</strong><span>확률 드랍 성공</span></div>` : ''}${data.cardReward ? `<div class="battle-card-drop"><strong>${esc(data.cardReward.card.grade)} ${esc(data.cardReward.card.title)}</strong><span>${data.cardReward.duplicate ? `중복 카드 · 조각 +${num(data.cardReward.shardGained)}` : '신규 카드 획득!'}</span></div>` : ''}</div><em>화면을 눌러 돌아가기</em>`
      : `<strong>DEFEAT</strong><span>${resultDetail}</span><div class="battle-defeat-tip">HP·공격·방어·속도와 전열 구성을 조정해보세요.</div><em>화면을 눌러 돌아가기</em>`;

    battleState.energy = data.energy || battleState.energy;
    battleState.serverOffset = Date.parse(data.serverNow || new Date().toISOString()) - Date.now();
    saveUser(apiUserToLocal(data.user));
    if (battleState.autoRunning) {
      const summary = battleState.autoSummary || (battleState.autoSummary = { battles:0,wins:0,losses:0,totalReward:0,magicCrystals:0,cardRewards:[],equipmentRewards:[] });
      summary.battles++; summary.totalReward += Number(data.reward || 0); summary.magicCrystals += Number(data.magicReward?.amount || 0);
      if (win) summary.wins++; else summary.losses++;
      if (data.cardReward) summary.cardRewards.push(data.cardReward);
      if (data.equipmentReward) summary.equipmentRewards.push(data.equipmentReward);
      battleState.autoRemaining = Math.max(0, Number(battleState.autoRemaining || 0) - 1);
      const available = Math.floor(Number(battleState.energy?.energy || 0) / Math.max(1, Number(battleState.energy?.costPerBattle || 1)));
      const remaining = Math.min(Number(battleState.autoRemaining || 0), available);
      if (remaining > 0) {
        msg.insertAdjacentHTML('beforeend', `<em class="auto-battle-next">자동전투 ${summary.battles}회 완료 · ${remaining}회 남음<br>잠시 후 다음 전투가 시작됩니다. 화면을 누르면 중단합니다.</em>`);
        modal.onclick = () => { battleState.autoRunning = false; renderShell('battle'); };
        setTimeout(() => { if (battleState.autoRunning) { modal.onclick = null; startBattle(); } }, Math.round(1600 / PLAYBACK_SPEED));
      } else {
        battleState.autoRunning = false;
        const boxes = (summary.equipmentRewards || []).reduce((sum, reward) => sum + Math.max(1, Number(reward?.quantity || 1)), 0);
        msg.insertAdjacentHTML('beforeend', `<div class="battle-auto-total"><b>자동전투 ${summary.battles}회 완료</b><span>승리 ${summary.wins} · 패배 ${summary.losses} · 코인 ◈ ${num(summary.totalReward)}</span>${summary.magicCrystals > 0 ? `<small>마법 결정 ✦ ${num(summary.magicCrystals)}개</small>` : ''}${summary.cardRewards.length ? `<small>카드 획득 ${summary.cardRewards.length}장</small>` : ''}${boxes ? `<small>보급상자 획득 ${boxes}개</small>` : ''}</div>`);
        setTimeout(() => { modal.onclick = () => renderShell('battle'); }, 450);
      }
    } else setTimeout(() => { modal.onclick = () => renderShell('battle'); }, 450);
  }

  window.playPveBattleV2Live = async options => {
    const { stage, phase, msg, modal, data, monster, playUltimateCinematics } = options;
    await playTimeline({ stage, phase, msg, data, monster, playUltimateCinematics });
    await pause(540);
    await finishBattle({ stage, phase, msg, modal, data });
  };
})();
