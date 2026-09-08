import {createEncounter, NORMAL_COUNT} from './encounter-model.mjs';
const $ = id => document.getElementById(id);
const number = n => Math.round(Number(n || 0)).toLocaleString('ko-KR');
let catalog, equipment, bridge, payload, busy = false, ready = false, ended = false, paused = false, disposed = false, epoch = 0;
let cardDamage = 0, suitDamage = 0;
let preparation = 0;
const records = [];
function log(text) {
  records.unshift(text); records.length = Math.min(records.length, 6);
  $('combat-log').replaceChildren(...records.map(text => Object.assign(document.createElement('li'), {textContent: text})));
}
function controls() {
  $('start').disabled = !ready || busy; $('power').disabled = !ready || busy;
  $('pause').disabled = !busy; $('reset').disabled = !ready;
  $('pause').textContent = paused ? '이어하기' : '일시정지';
  $('start').textContent = ended ? '다시 출격 →' : '작전 시작 →';
}
function event(event, state) {
  if (disposed) return;
  const count = state?.defeated || 0;
  $('survivors').textContent = `${state?.survivors ?? 5} / 5`;
  $('kill-count').innerHTML = `${String(count).padStart(2, '0')} <small>/ 10</small>`;
  $('progress').style.width = `${count * 10}%`;
  const step = state?.spawned >= 10 ? 3 : state?.spawned > 3 ? 2 : 1;
  for (let i = 1; i <= 3; i++) {
    $('step-' + i).classList.toggle('current', i === step);
    $('step-' + i).classList.toggle('done', i < step || count === 10);
  }
  if (event.type === 'PREVIEW_PAUSED') {
    $('battle-state').textContent = '일시정지'; $('action-label').textContent = '현재 공격까지 완료하고 대기 중입니다'; return;
  }
  if (event.type === 'ENEMY_SPAWN') {
    log(event.boss ? '최종 목표 출현 — 고철군주 브레이커.' : `회수 방어대 증원. 현재 격파 ${count}/${NORMAL_COUNT}.`);
    $('battle-state').textContent = event.boss ? '최종 보스 교전' : '증원 차단 중';
    $('action-label').textContent = event.boss ? '고철군주 브레이커를 제압하세요' : '방어대가 계속 합류하고 있습니다';
  }
  if (event.type === 'KO' && String(event.targetId).startsWith('A:')) log('아군 전투 불능. 남은 회수대가 교전을 이어갑니다.');
  const damage = Math.max(0, Number(event.damage || 0)) + Math.max(0, Number(event.absorbed || 0));
  if (event.actorId?.startsWith('A:SUPPORT:')) suitDamage += damage;
  else if (event.actorId?.startsWith('A:')) cardDamage += damage;
  $('card-damage').textContent = number(cardDamage);
  $('suit-damage').textContent = number(suitDamage);
}
async function prepare() {
  const token = ++preparation;
  ready = false; ended = false; controls(); $('boot').hidden = false;
  $('boot').querySelector('.loader').hidden = false;
  $('boot').querySelector('strong').textContent = '회수대를 전개하고 있습니다';
  $('boot').querySelector('small').textContent = '전투 엔진 · 카드 원화 · 전투 SD 연결 중';
  payload = createEncounter({catalog, equipment, seed: 7123, powerScale: Number($('power').value)});
  const prepared = await bridge.prepare(payload);
  if (!prepared || disposed || token !== preparation) return false;
  ready = true; $('boot').hidden = true; $('battle-state').textContent = '출격 준비 완료';
  $('result-title').textContent = '출격 대기'; $('result-note').textContent = '실제 입장권·보상은 사용하지 않습니다.';
  $('survivors').textContent = '5 / 5'; cardDamage = 0; suitDamage = 0;
  $('action-label').textContent = '한 번의 출격, 끊김 없는 전투';
  $('action-detail').textContent = '카드 체력 · 방벽 · 게이지 · 지원 사격이 끝까지 이어집니다.';
  $('reset').textContent = '처음부터 다시';
  event({type: 'READY'}, {spawned: 3, defeated: 0}); controls();
  return true;
}
async function start() {
  if (!ready || busy) return;
  const token = ++epoch;
  try {
    if (ended && !await prepare()) return;
    if (token !== epoch || disposed) return;
    busy = true; paused = false; controls();
    $('battle-state').textContent = '외곽 방어대 교전'; $('result-title').textContent = '작전 수행 중';
    log('회수대 출격. 일반 카드 5명과 배틀슈트가 동시 전개됩니다.');
    const complete = await bridge.play(event);
    if (!complete || token !== epoch || disposed) return;
    ended = true;
    const result = payload.battleV2.result, win = result.winner === 'A';
    $('battle-state').textContent = win ? '회수 작전 완료' : '작전 실패';
    $('result-title').textContent = win ? '구역 제압 완료' : '돌파 실패';
    $('action-label').textContent = win ? '고철군주 격파 · 작전 종료' : '회수대의 전력이 부족합니다';
    $('action-detail').textContent = '연출 결과는 동일 시드의 전투 엔진 판정입니다. 실제 보상은 지급하지 않습니다.';
    $('survivors').textContent = `${result.final.A.filter(row => row.hp > 0).length} / 5`;
    $('result-note').textContent = `${result.actions}행동 · ${result.encounter.defeated}/10 격파 · 탄착 대기열 정리 완료`;
    log(win ? '고철군주 격파. 회수 작전을 완료했습니다.' : `작전 종료. ${result.encounter.defeated}마리 격파 후 돌파에 실패했습니다.`);
  } catch (error) {if (token === epoch && !disposed) fail(error);}
  finally {if (token === epoch) {busy = false; paused = false; controls();}}
}
function fail(error) {
  bridge?.cancel(); busy = false; ready = false; controls();
  $('boot').hidden = false; $('boot').querySelector('.loader').hidden = true;
  $('boot').querySelector('strong').textContent = '전장을 준비하지 못했습니다';
  $('boot').querySelector('small').textContent = error.message || String(error);
  $('battle-state').textContent = '연결 실패'; console.error('[Scrapyard preview]', error);
  // Retry stays available even when initialization fails.
  $('reset').disabled = false; $('reset').textContent = '다시 연결';
}
async function reset() {
  ++epoch; bridge.cancel(); busy = false; paused = false;
  try {await prepare(); log('검수 전투를 초기화했습니다.');} catch (error) {fail(error);}
}
const json = async url => {const r = await fetch(url, {credentials: 'omit'}); if (!r.ok) throw new Error(`자산 로드 실패 (${r.status})`); return r.json();};
async function boot() {
  try {
    const [fur, zenith, superstar, suits] = await Promise.all([
      json('/assets/ui/project-v/characters/fur/manifest-v2.json'),
      json('/assets/ui/project-v/characters/zenith/manifest-v1.json'),
      json('/assets/ui/project-v/characters/superstar/manifest-v1.json'),
      json('/assets/ui/project-v/account-battle-suits/manifest-v2.json')]);
    catalog = [fur, zenith, superstar].flatMap(m => m.characters.map(c => ({...c, grade: m.rarity,
      sourceArt: '/' + c.sourceArt.replace(/^\/+/, ''), battleSprite: '/' + c.battleSprite.replace(/^\/+/, '')})));
    equipment = suits;
    const deadline = performance.now() + 20000;
    while (!bridge && !disposed) {
      bridge = $('battle-frame').contentWindow?.ScrapyardBattleBridge;
      if (performance.now() > deadline) throw new Error('V3 전장 모듈 로드 시간이 초과됐습니다.');
      if (!bridge) await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (!disposed) await prepare();
  } catch (error) {fail(error);}
}
$('start').addEventListener('click', start);
$('reset').addEventListener('click', () => bridge && catalog && equipment ? reset() : location.reload());
$('power').addEventListener('change', () => prepare().catch(fail));
$('speed').addEventListener('change', () => bridge?.setSpeed(Number($('speed').value)));
$('pause').addEventListener('click', () => {
  if (!busy) return;
  paused = !paused;
  if (paused) {bridge.pause(); $('battle-state').textContent = '공격 완료 후 정지';}
  else {bridge.resume(); $('battle-state').textContent = '교전 재개'; $('action-label').textContent = '회수 작전이 계속됩니다';}
  controls();
});
$('fullscreen').addEventListener('click', async () => {
  try {if (document.fullscreenElement) await document.exitFullscreen(); else await $('viewport').requestFullscreen();}
  catch {log('이 브라우저는 전장 전체화면을 지원하지 않습니다.');}
});
window.addEventListener('pagehide', () => {disposed = true; ++epoch; bridge?.dispose();}, {once: true});
window.ScrapyardPreview = {diagnostics: () => ({ready, busy, ended, paused, epoch, payloadResult: payload?.battleV2.result,
  bridge: bridge?.diagnostics()}), start, reset};
boot();
