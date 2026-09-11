(() => {
  let engine,renderer;
  const api = window.ProjectVPixiBattle, mount = api.mountForBattle;
  api.mountForBattle = async (...args) => {engine = await mount(...args); engine.audio?.destroy(); return engine;};
  async function prepare(payload) {
    renderer?.destroy();
    window.cnineCardCatalog = () => payload.cards;
    const modal = document.getElementById('common-grid-modal');
    const prepared = ProjectVBattleV3Live.prepareLoading({modal,mode:payload.mode,playerName:'공통 V3 배치 검수',opponentName:payload.monster?.name || '상대 편성',autoText:'라이브 배포 보류 · 공통 배치 검수'});
    renderer = await ProjectVBattleV3Live.createRenderer({...prepared,modal,data:payload,mode:payload.mode,playUltimateCinematics:false});
    await api.restoreDeployedFormation();
    return true;
  }
  window.CommonGridBridge = {prepare, diagnostics: () => ({formation:engine?.gridDiagnostics(), geometry:engine?.viewportGeometry(),canvasCount:document.querySelectorAll('canvas').length,
    cards:document.querySelectorAll('[data-v3-roster-card]').length,engine:api.diagnostics()}), get engine(){return engine;}};
  window.addEventListener('pagehide',()=>{renderer?.destroy(); api.mountForBattle=mount; api.destroy();},{once:true});
})();
