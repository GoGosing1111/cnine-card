// The iframe is a genuine viewport for the unmodified live V3 shell/roster.
// No formation CSS, card markup, animation or damage implementation is copied.
(() => {
  if (parent === window) { location.replace('./'); return; }
  let renderer = null, engine = null, playing = false, disposed = false, epoch = 0;
  const api = window.ProjectVPixiBattle;
  const mount = api.mountForBattle;
  api.mountForBattle = async (...args) => {
    engine = await mount(...args);
    // User requested silence. Dispose this preview's mixer before any playback,
    // including its gesture listeners; never alter the live account sound key.
    engine.audio?.destroy();
    window.IdleDamageStyleCache?.install(engine);
    return engine;
  };
  window.cnineBattleSpriteUrl = path => {
    const key = String(path || '').replace(/^\/+/, '').split('?')[0];
    const sprite = window.CNineResponsiveBattleSprites?.[key];
    if (sprite) return sprite;
    const card = window.CNineResponsiveCardImages?.[key];
    return card ? `${card}-384.webp` : path;
  };
  async function prepare(payload) {
    if (disposed || playing) throw new Error('전장이 아직 사용 중입니다.');
    renderer?.destroy();
    window.cnineCardCatalog = () => payload.cards;
    const modal = document.getElementById('idle-modal');
    const prepared = ProjectVBattleV3Live.prepareLoading({modal, mode: 'HUNT', playerName: '원정대 · 검수 덱',
      opponentName: payload.monster.name, autoText: '다음 원정 구간을 준비합니다.'});
    renderer = await ProjectVBattleV3Live.createRenderer({...prepared, modal, data: payload, mode: 'HUNT',
      playerName: '원정대 · 검수 덱', playUltimateCinematics: false});
    // Only a supported background is selected. Art identity stays HUNT, and
    // V3's exact 2-front / 3-back character formation remains untouched.
    if (payload.previewBattlefield !== 'HUNT') await api.setBattlefield(payload.previewBattlefield);
    prepared.stage.querySelector('.battle-v3-header strong').textContent = '심연 원정';
    prepared.stage.querySelector('#battlePhase').textContent = 'IDLE PREVIEW';
    prepared.stage.querySelector('#pvBattleStatus').textContent = '검수 전투 · 실제 계정 / 재화 미연결';
    await api.restoreDeployedFormation();
    return true;
  }
  async function play() {
    if (playing || !renderer || disposed) throw new Error('V3 전투 준비가 필요합니다.');
    const token = epoch;
    playing = true;
    try { return (await renderer.play()) === true && token === epoch && !disposed; }
    finally { playing = false; }
  }
  function cancel() {
    epoch++;
    renderer?.destroy();
    api.cancelActiveAnimations();
  }
  function dispose() {
    if (disposed) return;
    disposed = true; cancel(); api.mountForBattle = mount; api.destroy();
  }
  window.addEventListener('pagehide', dispose, {once: true});
  window.IdleBattleBridge = {prepare, play, cancel, dispose,
    spriteUrl: path => window.cnineBattleSpriteUrl(path),
    diagnostics: () => ({ready: !!renderer && !disposed, playing, cards: document.querySelectorAll('[data-v3-roster-card]').length,
      canvasCount: document.querySelectorAll('canvas').length, audioPolicy: 'MUTED',
      audioDisposed: engine?.audio?.destroyed === true,
      damageStyleCount: engine?.pools?.damage?.__idleStyleCache?.keys.size || 0, engine: api.diagnostics()})};
})();
