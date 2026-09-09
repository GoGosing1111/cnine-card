import {createEncounter} from '../../scrapyard-v3-v1/source/encounter-model.mjs';
import {bounds} from './grid-layout.mjs';
const $ = id => document.getElementById(id);
let bridge, layout, payload, ready = false, busy = false, ended = false, paused = false, preparing = false, disposed = false, epoch = 0;
let mode = new URLSearchParams(location.search).get('grid') === 'original' ? 'original' : 'wide';
let snapshotDigest = '';
const json = async url => {const response = await fetch(url, {credentials: 'omit'}); if (!response.ok) throw new Error(`자산 로드 실패 (${response.status})`); return response.json();};
function controls() {
  for (const button of document.querySelectorAll('[data-grid]')) {
    button.disabled = !ready || busy; button.classList.toggle('selected', button.dataset.grid === mode);
    button.setAttribute('aria-pressed', String(button.dataset.grid === mode));
  }
  $('start').disabled = !ready || busy; $('pause').disabled = !busy; $('reset').disabled = !bridge || preparing;
  $('pause').textContent = paused ? '이어하기' : '일시정지';
  $('start').textContent = ended ? '다시 재생 →' : '전투 재생 →';
}
function describeGrid() {
  const mobile = $('battle-frame').clientWidth <= 760;
  const widthGain = bounds(mobile).width / bounds(mobile, 'original').width - 1;
  $('width-fact').textContent = mode === 'wide' ? `전장 가로 +${Math.round(widthGain * 100)}%` : '기존 전장 크기';
  $('grid-label').textContent = mode === 'wide' ? 'EXPANDED / 63 TILES' : 'ORIGINAL / 42 TILES';
}
async function prepare(token = ++epoch) {
  ready = false; ended = false; paused = false; preparing = true; controls(); $('boot').hidden = false;
  $('boot').querySelector('.loader').hidden = false;
  $('boot').querySelector('strong').textContent = '전투 리소스를 불러오고 있습니다';
  $('boot').querySelector('small').textContent = '기존 카드 · 배틀슈트 · 몬스터 로딩 중';
  const prepared = await bridge.prepare(payload);
  if (!prepared || token !== epoch || disposed) return false;
  layout = $('battle-frame').contentWindow.WideGridLayout;
  layout.setMode(mode); bridge.setSpeed(2); ready = true; preparing = false; $('boot').hidden = true;
  $('state').textContent = '배치 비교 준비 완료'; $('kill-count').textContent = '00 / 10';
  $('action-label').textContent = '전투 전 배치 비교'; $('detail').textContent = '기존 / 확장안을 눌러 같은 크기로 비교하세요.';
  describeGrid(); controls(); return true;
}
async function selectMode(next) {
  if (!ready || busy || !['original', 'wide'].includes(next)) return;
  mode = next;
  if (ended) {await prepare();} else {layout.setMode(mode); describeGrid(); controls();}
  const url = new URL(location.href); url.searchParams.set('grid', mode); history.replaceState(null, '', url);
}
function event(row, state) {
  $('kill-count').textContent = `${String(state?.defeated || 0).padStart(2, '0')} / 10`;
  if (row.type === 'PREVIEW_PAUSED') {$('state').textContent = '일시정지'; return;}
  if (row.type === 'ENEMY_SPAWN') {
    $('state').textContent = row.boss ? '최종 보스 교전' : '방어대 증원';
    $('action-label').textContent = row.boss ? '고철군주 브레이커 출현' : '동일 전장에서 이어지는 연속 전투';
  }
}
async function start() {
  if (!ready || busy) return;
  const token = ++epoch;
  try {
    if (ended && !await prepare(token)) return;
    busy = true; paused = false; controls(); $('state').textContent = '전투 재생 중 · 2배속';
    $('action-label').textContent = '증원 9마리 → 최종 보스'; $('detail').textContent = '공격 이동 · 슈트 사격 · 탄착을 확인하세요.';
    if (!await bridge.play(event) || token !== epoch || disposed) return;
    ended = true; $('state').textContent = '전투 종료'; $('action-label').textContent = '구역 제압 완료';
    $('detail').textContent = '기존안과 동일한 판정입니다. 선택을 바꾸면 처음 배치로 돌아갑니다.';
  } catch (error) {if (token === epoch) fail(error);}
  finally {if (token === epoch) {busy = false; paused = false; controls();}}
}
async function reset() {const token = ++epoch; bridge?.cancel(); busy = false; try {await prepare(token);} catch (error) {fail(error);}}
function fail(error) {
  bridge?.cancel(); busy = false; ready = false; preparing = false; $('boot').hidden = false;
  $('boot').querySelector('.loader').hidden = true;
  $('boot').querySelector('strong').textContent = '전장을 준비하지 못했습니다';
  $('boot').querySelector('small').textContent = error.message; $('state').textContent = '오류'; controls();
  console.error('[Wide grid preview]', error);
}
async function boot() {
  try {
    const [fur, zenith, superstar, equipment] = await Promise.all([
      json('/assets/ui/project-v/characters/fur/manifest-v2.json'), json('/assets/ui/project-v/characters/zenith/manifest-v1.json'),
      json('/assets/ui/project-v/characters/superstar/manifest-v1.json'), json('/assets/ui/project-v/account-battle-suits/manifest-v2.json')]);
    const catalog = [fur, zenith, superstar].flatMap(m => m.characters.map(c => ({...c, grade: m.rarity,
      sourceArt: '/' + c.sourceArt.replace(/^\/+/, ''), battleSprite: '/' + c.battleSprite.replace(/^\/+/, '')})));
    payload = createEncounter({catalog, equipment, seed: 7123, powerScale: 1});
    snapshotDigest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload.battleV2))))].map(b => b.toString(16).padStart(2, '0')).join('');
    const deadline = performance.now() + 20000;
    while (!bridge && !disposed) {
      bridge = $('battle-frame').contentWindow?.ScrapyardBattleBridge;
      if (performance.now() > deadline) throw new Error('전투 모듈 로드 시간이 초과됐습니다. 새로고침해 주세요.');
      if (!bridge) await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (!disposed) await prepare();
  } catch (error) {fail(error);}
}
document.querySelectorAll('[data-grid]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.grid).catch(fail)));
$('start').addEventListener('click', start); $('reset').addEventListener('click', reset);
$('pause').addEventListener('click', () => {paused = !paused; paused ? bridge.pause() : bridge.resume(); $('state').textContent = paused ? '현재 공격 정리 중' : '전투 재생 중 · 2배속'; controls();});
$('fullscreen').addEventListener('click', () => $('viewport').requestFullscreen?.().catch(() => {$('state').textContent = '이 브라우저는 전체화면을 지원하지 않습니다';}));
window.addEventListener('resize', () => requestAnimationFrame(describeGrid));
window.addEventListener('pagehide', () => {disposed = true; ++epoch; bridge?.dispose();}, {once: true});
window.WideGridPreview = {selectMode, start, reset, diagnostics: () => ({ready, busy, ended, paused, mode, snapshotDigest,
  layout: layout?.diagnostics(), bridge: bridge?.diagnostics()})};
boot();
