(() => {
  if (parent === window) { location.replace('./'); return; }
  const api = window.ProjectVPixiBattle, mount = api.mountForBattle;
  let engine, renderer, payload, playing = false, disposed = false, epoch = 0;
  let pauseWanted = false, paused = false, releasePause = null;
  let listener = null, speed = 1;
  api.mountForBattle = async (...args) => {
    engine = await mount(...args);
    engine.audio?.destroy(); // Never change the live sound preference.
    window.IdleDamageStyleCache?.install(engine);
    return engine;
  };
  window.cnineBattleSpriteUrl = path => {
    const key = String(path || '').replace(/^\/+/, '').split('?')[0];
    return window.CNineResponsiveBattleSprites?.[key] || (window.CNineResponsiveCardImages?.[key]
      ? `${window.CNineResponsiveCardImages[key]}-384.webp` : path);
  };
  function emit(event) { listener?.(event, engine?.scrapyardState?.()); }
  window.addEventListener('scrapyard-combat-event', event => emit(event.detail));
  async function prepare(next) {
    if (disposed || playing) throw new Error('전투가 진행 중입니다.');
    const token = ++epoch;
    payload = next; pauseWanted = false; paused = false;
    renderer?.destroy();
    window.cnineCardCatalog = () => payload.cards;
    const modal = document.getElementById('scrapyard-modal');
    const prepared = ProjectVBattleV3Live.prepareLoading({modal, mode: 'HUNT',
      playerName: '폐차장 회수대', opponentName: '외곽 방어대', autoText: '연속 교전 검수'});
    // Remove only the generic forest CSS backdrop behind the Pixi canvas.
    // Formation, card dock, grade frames and all renderer CSS stay untouched.
    prepared.stage.querySelector('.battle-v3-canvas-host').style.backgroundImage = 'none';
    const nextRenderer = await ProjectVBattleV3Live.createRenderer({...prepared, modal, data: payload,
      mode: 'HUNT', playerName: '폐차장 회수대', playUltimateCinematics: false});
    if (token !== epoch || disposed) {nextRenderer.destroy(); return false;}
    renderer = nextRenderer;
    engine.previewSpeed = speed;
    prepared.stage.querySelector('.battle-v3-header strong').textContent = '폐차장 회수 작전';
    prepared.stage.querySelector('#battlePhase').textContent = 'SECTOR 01';
    await api.restoreDeployedFormation();
    return true;
  }
  async function pauseBoundary(token, runEngine) {
    if (!pauseWanted || token !== epoch || disposed) return;
    await runEngine.stopAccountBattleUnitSustainedFire({drain: true});
    if (token !== epoch || disposed) return;
    runEngine.settlePendingTails(runEngine.characters);
    paused = true; emit({type: 'PREVIEW_PAUSED'});
    await new Promise(resolve => {releasePause = resolve; if (!pauseWanted) resolve();});
    releasePause = null; paused = false;
    if (token === epoch && !disposed) runEngine.startAccountBattleUnitSustainedFire();
  }
  async function play(onEvent) {
    if (playing || !renderer || disposed) throw new Error('전투 준비가 필요합니다.');
    const token = epoch, runEngine = engine, runRenderer = renderer, runPayload = payload;
    playing = true; listener = onEvent;
    try {
      runEngine.previewSpeed = speed;
      runEngine.startAccountBattleUnitSustainedFire();
      for (const event of runPayload.battleV2.result.timeline) {
        await pauseBoundary(token, runEngine);
        if (token !== epoch || disposed) return false;
        if (await api.playEvents([event]) === false) return false;
      }
      if (token !== epoch || disposed) return false;
      await runEngine.drainGeneration();
      if (token !== epoch || disposed) return false;
      await runEngine.stopAccountBattleUnitSustainedFire({drain: true});
      if (token !== epoch || disposed) return false;
      await api.syncFinalState(runPayload.battleV2.result.final);
      runRenderer.showResult();
      return true;
    } finally {
      if (token === epoch) {
        playing = false; pauseWanted = false; paused = false;
        await runEngine.stopAccountBattleUnitSustainedFire();
      }
    }
  }
  function pause() {pauseWanted = true;}
  function resume() {pauseWanted = false; releasePause?.();}
  function cancel() {
    ++epoch; resume(); renderer?.destroy(); api.cancelActiveAnimations(); playing = false;
  }
  function dispose() {if (disposed) return; disposed = true; cancel(); api.mountForBattle = mount; api.destroy();}
  window.addEventListener('pagehide', dispose, {once: true});
  window.ScrapyardBattleBridge = {prepare, play, pause, resume, cancel, dispose,
    setSpeed(value) {speed = value === 2 ? 2 : 1; if (engine) engine.previewSpeed = speed;},
    diagnostics: () => ({playing, paused, pauseWanted, disposed, epoch,
      canvasCount: document.querySelectorAll('canvas').length,
      cards: document.querySelectorAll('[data-v3-roster-card]').length,
      audioDisposed: engine?.audio?.destroyed === true, engine: api.diagnostics()})};
})();
