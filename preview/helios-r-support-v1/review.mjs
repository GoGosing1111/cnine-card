const mode = new URLSearchParams(location.search).get('mode') === 'pvp' ? 'PVP' : 'PVE';
document.querySelector('[data-mode=' + mode + ']').setAttribute('aria-current', 'page');
const status = document.querySelector('#status');
const arrival = document.querySelector('#arrival');
const attack = document.querySelector('#attack');

try {
  const api = window.ProjectVPixiBattle;
  const response = await fetch('./' + mode.toLowerCase() + '.json');
  if (!response.ok) throw Error('전투 기록을 읽을 수 없습니다.');
  const payload = await response.json();
  window.cnineCardCatalog = () => payload.cards;
  const engine = await api.mountForBattle(payload, document.querySelector('#field'));
  const owners = payload.battleV2.teams.A.mercenaries;
  const events = owners.map(row => payload.battleV2.result.timeline.find(e => e.actorId === row.id && e.vehicleSupportHit));
  if (events.some(event => !event)) throw Error('용병의 적중 기록이 없습니다.');
  let next = 0;
  async function deploy(reset) {
    if (reset) await engine.resetSession(payload);
    await engine.setVisible(true);
    await engine.deployCards({instant: true, force: true});
    next = 0;
    status.textContent = '헬리오스-R 진입 · 족로와 흑월에게 적용';
  }
  async function playHit() {
    const event = events[next];
    const actor = owners[next];
    next = (next + 1) % events.length;
    status.textContent = actor.name + ' · 기본 공격 적중';
    // This is a selectable excerpt. Restore its recorded pre-hit state so the
    // same hit can be replayed without reviving unrelated fighters or rerolling.
    const target = engine.combatantById(event.targetId);
    const beforeHp = Math.min(event.targetMaxHp, event.targetHpAfter + event.damage);
    target.setHp(beforeHp / event.targetMaxHp * 100);
    target.root.visible = target.root.renderable = target.enabled = true;
    target.setShield(event.targetShieldAfter + event.absorbed, target.serverMaxShield);
    await engine.playEvents([event]);
  }
  async function action(fn) {
    arrival.disabled = attack.disabled = true;
    try { await fn(); } catch (error) { status.textContent = error.message; }
    finally { arrival.disabled = attack.disabled = false; }
  }
  arrival.onclick = () => action(() => deploy(true));
  attack.onclick = () => action(playHit);
  await deploy(false);
  arrival.disabled = attack.disabled = false;
  window.heliosReview = {engine, payload, events};
  window.addEventListener('pagehide', () => api.destroy(), {once: true});
} catch (error) {
  status.textContent = '시연을 열 수 없습니다. ' + error.message;
  console.error(error);
}
