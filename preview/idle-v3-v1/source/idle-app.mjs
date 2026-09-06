import {ACTION_LIMIT, BATTLE_SUIT, CARD_IDS, IdleSession, MAX_TRAINING, STAGES, STORAGE_KEY, ZONES,
  farmableStages, freshState, powerMultiplier, previewPower, simulateStage, trainingCost} from './idle-model.mjs';

const $ = id => document.getElementById(id);
const number = value => Number(value || 0).toLocaleString('ko-KR');
const absolute = path => '/' + String(path || '').replace(/^\/+/, '');
let catalog, monsters, equipment, bridge, session, ready = false, wanted = false, inBattle = false;
let disposed = false, epoch = 0, loopPromise = null, waitTimer = null, releaseWait = null;
let currentStage = 0, inspectedStage = 3, resultSummary = null, resetUntil = 0;
const forecasts = new Map();

function notify(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session.serialize())); }
  catch { notify('브라우저 저장이 차단되어 이번 원정 기록은 새로고침하면 사라집니다.'); }
}
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}
async function json(path) {
  const response = await fetch(path, {credentials: 'omit'});
  if (!response.ok) throw new Error(`자산을 불러오지 못했습니다 (${response.status}).`);
  return response.json();
}
function battle(stageIndex, training, seed) {
  return simulateStage({catalog, monsters, equipment, stageIndex, training, seed});
}
function forecast(index) {
  const key = `${index}:${session.state.training}`;
  if (!forecasts.has(key)) {
    const runs = [17, 41, 67, 89, 113].map(seed => battle(index, session.state.training, seed));
    forecasts.set(key, {wins: runs.filter(p => p.battleV2.result.winner === 'A').length,
      hp: runs[0].battleV2.teams.B.cards[0].maxHp,
      attack: runs[0].battleV2.teams.B.cards[0].attack,
      remaining: Math.round(runs.reduce((sum, p) => sum + p.battleV2.result.final.B[0].hp / p.battleV2.result.final.B[0].maxHp, 0) * 20)});
  }
  return forecasts.get(key);
}
function renderTarget() {
  const stage = STAGES[inspectedStage], zone = ZONES[stage.zone];
  const monster = monsters.find(m => m.mode === 'HUNT' && m.monsterId === stage.monsterId);
  const estimate = forecast(inspectedStage);
  $('target-code').textContent = `${stage.boss ? '관문 보스' : '일반 구간'} · ${stage.code}`;
  $('target-type').textContent = stage.boss ? 'BOSS' : 'FIELD';
  $('target-heading').textContent = monster.name;
  $('target-region').textContent = `${zone.name} · ${stage.index > session.state.cleared + 1 ? '이전 구간 돌파 필요' : stage.index <= session.state.cleared ? '돌파 완료' : '다음 돌파 대상'}`;
  if ($('target-art').dataset.monster !== String(monster.monsterId)) {
    // A unit portrait, not a deck/card illustration. The V3 dock owns sourceArt.
    const responsive = bridge?.spriteUrl?.(absolute(monster.battleSprite));
    $('target-art').src = responsive || absolute(monster.battleSprite);
    $('target-art').alt = `${monster.name} 전투 SD`;
    $('target-art').dataset.monster = String(monster.monsterId);
  }
  $('target-hp').textContent = number(estimate.hp);
  $('target-attack').textContent = number(estimate.attack);
  $('forecast-label').textContent = `${estimate.wins}/5승 · ${estimate.wins === 5 ? '돌파 유력' : estimate.wins > 0 ? '접전 예상' : '성장 필요'}`;
  $('forecast-fill').style.width = `${estimate.wins * 20}%`;
  $('forecast-note').textContent = '동일 덱 5회 모의 전투 기준 · 실제 결과는 전투마다 달라질 수 있습니다.';
  $('wall-hint').textContent = estimate.wins === 0
    ? `${ACTION_LIMIT}행동 종료 후 적 HP가 평균 ${estimate.remaining}% 남습니다. 열린 구간에서 훈련 데이터를 모아보세요.`
    : `${ACTION_LIMIT}행동 안에 적을 쓰러뜨려야 돌파합니다. 패배해도 데이터와 돌파 기록은 유지됩니다.`;
}
function renderRoute() {
  const state = session.state;
  for (const node of document.querySelectorAll('[data-stage]')) {
    const index = Number(node.dataset.stage);
    node.classList.toggle('cleared', index <= state.cleared);
    node.classList.toggle('current', index === session.target);
    node.classList.toggle('locked', index > state.cleared + 1);
    node.classList.toggle('selected', index === inspectedStage);
    node.setAttribute('aria-pressed', String(index === inspectedStage));
    node.setAttribute('aria-label', `${STAGES[index].code} ${STAGES[index].boss ? '관문 보스' : '일반 구간'} · ${index <= state.cleared ? '돌파 완료' : index > state.cleared + 1 ? '잠김' : '도전 가능'} · 정보 보기`);
  }
  for (const label of document.querySelectorAll('[data-region-status]')) {
    const zone = Number(label.dataset.regionStatus);
    label.textContent = state.cleared >= zone * 4 + 3 ? 'COMPLETE' : state.cleared + 1 >= zone * 4 ? 'OPEN' : 'LOCKED';
  }
  $('route-progress').textContent = `${state.cleared + 1} / ${STAGES.length}`;
}
function render() {
  if (!catalog || !session) return;
  const state = session.state;
  $('power').textContent = number(previewPower(state.training));
  $('suit-power').textContent = number(BATTLE_SUIT.basePower * powerMultiplier(state.training));
  $('suit-last-damage').textContent = resultSummary ? `직전 전투 피해 ${number(resultSummary.battleSuitDamage)}` : '일반 카드 5장 + 별도 지원 유닛';
  $('cleared').textContent = state.cleared < 0 ? '미진입' : STAGES[state.cleared].code;
  $('balance').textContent = number(state.data);
  $('wins').replaceChildren(document.createTextNode(number(state.wins)), Object.assign(document.createElement('small'), {textContent: '회'}));
  $('training-level').textContent = String(state.training).padStart(2, '0');
  $('training-cost').textContent = state.training >= MAX_TRAINING ? '최대 단계' : `${number(trainingCost(state.training))} 데이터`;
  $('training-bonus').textContent = `기본 전투력 +${state.training * 20}%${state.training < MAX_TRAINING ? ` → +${(state.training + 1) * 20}%` : ' · 훈련 완료'}`;
  $('train').disabled = !ready || state.data < trainingCost(state.training) || state.training >= MAX_TRAINING;
  $('train').title = state.data < trainingCost(state.training) ? '열린 구간을 사냥해 연구 데이터를 모으세요.' : '다음 전투부터 적용됩니다.';
  const farms = farmableStages(state.cleared);
  const farmSignature = farms.map(s => s.index).join(',');
  if ($('farm').dataset.options !== farmSignature) {
    $('farm').dataset.options = farmSignature;
    $('farm').replaceChildren(...(farms.length ? farms.map(s => Object.assign(document.createElement('option'), {
      value: String(s.index), textContent: `${s.code} · ${ZONES[s.zone].name} / +${s.reward} 데이터`
    })) : [Object.assign(document.createElement('option'), {textContent: '첫 구간 돌파 후 열립니다'})]));
  }
  if (farms.length) $('farm').value = String(state.farm);
  $('farm').disabled = !ready || !farms.length;
  $('farm-mode').disabled = !ready || !farms.length;
  $('retry').disabled = !ready || state.cleared === STAGES.length - 1 || (wanted && state.mode === 'ADVANCE');
  $('retry').textContent = state.wall !== null ? `${STAGES[state.wall].code} 재도전` : '다음 구간 도전';
  $('start').disabled = !ready || (inBattle && !wanted);
  $('start').textContent = inBattle && !wanted ? '이번 전투 후 정지' : wanted ? '자동 원정 중지' : '자동 원정 시작 →';
  $('start').classList.toggle('stopping', wanted || inBattle);
  $('quick-start').disabled = $('start').disabled;
  $('quick-start').textContent = inBattle && !wanted ? '정지 대기' : wanted ? '중지' : '시작 →';
  $('quick-start').setAttribute('aria-label', wanted ? '자동 원정 중지' : '자동 원정 시작');
  $('reset').disabled = !ready || !!loopPromise;
  $('run-state').textContent = inBattle && !wanted ? '정지 대기' : wanted ? state.mode === 'FARM' ? '안전 사냥' : '자동 돌파' : '대기 중';
  $('run-state').dataset.state = wanted ? state.mode : 'PAUSED';
  $('activity-dot').classList.toggle('active', wanted);
  const active = STAGES[currentStage];
  $('stage-code').textContent = active.code;
  $('zone-name').textContent = ZONES[active.zone].name;
  $('encounter-name').textContent = monsters.find(m => m.mode === 'HUNT' && m.monsterId === active.monsterId).name;
  if (wanted) {
    $('action-label').textContent = state.mode === 'FARM' ? `${STAGES[state.farm].code} 안전 구간 반복 사냥` : `${STAGES[session.target].code} 자동 돌파 진행`;
    $('action-detail').textContent = state.mode === 'FARM' ? '훈련 후 ‘다음 구간 도전’으로 전선을 밀어보세요.' : '패배하면 열린 일반 구간으로 자동 복귀합니다.';
  } else {
    $('action-label').textContent = inBattle ? '지금 전투를 마친 뒤 멈춥니다' : resultSummary ? '원정이 정지되었습니다' : '진행할수록 강한 적이 등장합니다';
    $('action-detail').textContent = `다음 전투: ${STAGES[session.target].code} · ${state.mode === 'FARM' ? '반복 사냥' : '구간 돌파'} / 기록은 이 브라우저에 유지됩니다.`;
  }
  const logs = state.log.map(row => {
    const li = document.createElement('li'); li.className = row.kind; li.textContent = row.text; return li;
  });
  $('journal').replaceChildren(...(logs.length ? logs : [Object.assign(document.createElement('li'), {className: 'empty', textContent: '첫 원정의 기록이 이곳에 쌓입니다.'})]));
  renderRoute(); renderTarget();
}
function wake() {
  clearTimeout(waitTimer); waitTimer = null;
  const done = releaseWait; releaseWait = null; done?.();
}
function intermission() {
  return new Promise(resolve => { releaseWait = resolve; waitTimer = setTimeout(wake, 2200); });
}
async function run(token) {
  try {
    while (wanted && token === epoch && !disposed) {
      const round = session.begin();
      const payload = battle(round.stageIndex, round.training, round.seed);
      currentStage = round.stageIndex; inBattle = true; save(); render();
      await bridge.prepare(payload);
      if (token !== epoch || disposed) { session.cancel(round); break; }
      const played = await bridge.play();
      if (!played || token !== epoch || disposed) { session.cancel(round); break; }
      resultSummary = session.finish(round, payload);
      if (resultSummary && !resultSummary.won) {
        inspectedStage = round.stageIndex;
        notify(`${STAGES[round.stageIndex].code} 돌파 실패. ${session.state.cleared >= 0 ? `${STAGES[session.state.farm].code}에서 자동 사냥하며 성장할 수 있습니다.` : '훈련 후 재도전해 주세요.'} 기존 재료와 돌파 기록은 잃지 않습니다.`);
      } else if (resultSummary?.first && STAGES[round.stageIndex].boss) {
        inspectedStage = Math.min(STAGES.length - 1, round.stageIndex + 4);
        notify(`${STAGES[round.stageIndex].code} 관문 돌파! ${round.stageIndex === STAGES.length - 1 ? '모든 구간을 돌파했습니다. 안전 사냥을 계속합니다.' : '다음 지역이 열렸습니다.'}`);
      }
      if (resultSummary?.shouldStop) wanted = false;
      inBattle = false; save(); render();
      if (wanted) await intermission();
    }
  } catch (error) {
    wanted = false; session.cancel(session.active); bridge?.cancel();
    notify(`전투를 안전하게 중지했습니다. 완료 전 보상은 지급하지 않았습니다. ${error.message} 다시 시작할 수 있습니다.`);
    console.error('[Idle V3 preview]', error);
  } finally {
    inBattle = false; loopPromise = null; wanted = false; render();
  }
}
function start() {
  if (!ready || disposed) return;
  wanted = true; resetUntil = 0; $('reset').textContent = '프리뷰 초기화';
  if (!loopPromise) loopPromise = run(epoch);
  render();
}
function pause(immediate = false) {
  wanted = false; wake();
  if (immediate) {
    epoch++; session?.cancel(session.active); bridge?.cancel();
    notify('화면을 떠나 전투를 정지했습니다. 돌아오면 ‘자동 원정 시작’을 눌러 이어갈 수 있습니다.');
  }
  render();
}
function train() {
  if (!ready || !session.train()) return false;
  resetUntil = 0; save(); render(); return true;
}
function inspect(index) {
  if (!STAGES[index]) return;
  inspectedStage = index; renderRoute(); renderTarget();
}
function createRoute() {
  $('route').replaceChildren(...ZONES.map((zone, zoneIndex) => {
    const region = document.createElement('div'); region.className = 'region';
    const label = document.createElement('div'); label.className = 'region-label';
    const status = document.createElement('span'); status.dataset.regionStatus = String(zoneIndex);
    label.append(Object.assign(document.createElement('small'), {textContent: `0${zoneIndex + 1}`}),
      Object.assign(document.createElement('strong'), {textContent: zone.name}), status);
    const list = document.createElement('div'); list.className = 'route-nodes';
    for (const stage of STAGES.filter(s => s.zone === zoneIndex)) {
      const button = document.createElement('button'); button.className = `route-node${stage.boss ? ' boss' : ''}`;
      button.type = 'button'; button.dataset.stage = String(stage.index); button.textContent = stage.code;
      button.addEventListener('click', () => inspect(stage.index)); list.append(button);
    }
    region.append(label, list); return region;
  }));
}
function bridgeReady() {
  return new Promise((resolve, reject) => {
    const frame = $('battle-frame');
    const check = () => {
      const candidate = frame.contentWindow?.IdleBattleBridge;
      if (!candidate) return;
      clearTimeout(timeout); frame.removeEventListener('load', check); resolve(candidate);
    };
    const timeout = setTimeout(() => { frame.removeEventListener('load', check); reject(new Error('V3 전장 연결 시간이 초과되었습니다.')); }, 20000);
    frame.addEventListener('load', check); check();
  });
}
async function boot() {
  try {
    session = new IdleSession(load());
    const [fur, zenith, superstar, roster, suitAssets, view] = await Promise.all([
      json('/assets/ui/project-v/characters/fur/manifest-v2.json'),
      json('/assets/ui/project-v/characters/zenith/manifest-v1.json'),
      json('/assets/ui/project-v/characters/superstar/manifest-v1.json'),
      json('/assets/ui/project-v/monsters/hunt-tower/manifest-v1.json'),
      json('/assets/ui/project-v/account-battle-suits/manifest-v2.json'), bridgeReady()
    ]);
    bridge = view;
    equipment = suitAssets;
    $('suit-art').src = equipment.suits.find(s => s.code === BATTLE_SUIT.code).image;
    catalog = [fur, zenith, superstar].flatMap(m => m.characters.filter(c => CARD_IDS.includes(c.cardId)).map(c => ({
      ...c, grade: m.rarity, sourceArt: absolute(c.sourceArt), battleSprite: absolute(c.battleSprite)
    })));
    monsters = roster.sprites;
    currentStage = session.target;
    inspectedStage = session.state.wall ?? Math.min(STAGES.length - 1, Math.floor((session.state.cleared + 1) / 4) * 4 + 3);
    createRoute(); render();
    await bridge.prepare(battle(currentStage, session.state.training, 17));
    ready = true; $('boot').hidden = true; render();
    $('start').addEventListener('click', () => wanted ? pause() : start());
    $('quick-start').addEventListener('click', () => wanted ? pause() : start());
    $('train').addEventListener('click', train);
    $('farm').addEventListener('change', () => { session.setFarm(Number($('farm').value)); save(); render(); });
    $('farm-mode').addEventListener('click', () => { if (session.setFarm(Number($('farm').value))) { save(); start(); } });
    $('retry').addEventListener('click', () => { if (session.advance()) { notify(''); save(); start(); } });
    $('reset').addEventListener('click', async () => {
      if (loopPromise) return;
      if (Date.now() > resetUntil) { resetUntil = Date.now() + 5000; $('reset').textContent = '다시 눌러 초기화'; return; }
      ready = false; epoch++; session = new IdleSession(freshState()); resultSummary = null; currentStage = 0; inspectedStage = 3;
      save(); notify(''); $('reset').textContent = '프리뷰 초기화'; render();
      try { await bridge.prepare(battle(0, 0, 17)); }
      catch (error) { notify(`전장 재구성이 필요합니다. ${error.message}`); }
      finally { ready = true; resetUntil = 0; render(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && (wanted || inBattle)) pause(true); });
    window.addEventListener('pagehide', () => { disposed = true; epoch++; wanted = false; wake(); bridge.dispose(); }, {once: true});
    window.IdlePreview = {start, pause, train, inspect,
      diagnostics: () => ({ready, wanted, inBattle, hasLoop: !!loopPromise, state: session.serialize(), currentStage,
        resultSummary, scope: 'INDEPENDENT_PREVIEW_ONLY', networkPolicy: 'STATIC_GET_ONLY', bridge: bridge.diagnostics()})};
  } catch (error) {
    $('boot').replaceChildren(Object.assign(document.createElement('strong'), {textContent: '원정 준비를 완료하지 못했습니다'}),
      Object.assign(document.createElement('small'), {textContent: error.message}));
    $('start').disabled = false; $('start').textContent = '다시 준비하기'; $('start').addEventListener('click', () => location.reload(), {once: true});
    console.error('[Idle V3 boot]', error);
  }
}
void boot();
