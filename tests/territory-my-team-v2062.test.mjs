import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const client = read('js/territory-war-v1811.js');
const css = read('css/territory-war-v1824.css');
const index = read('index.html');

function renderer(mine, settings = {}) {
  const sandbox = {};
  const bootstrap = client.lastIndexOf("  document.addEventListener('visibilitychange'");
  assert.ok(bootstrap > 0, 'isolate real renderers before browser bootstrap');
  vm.runInNewContext(client.slice(0, bootstrap) + `
    globalThis.qa = { setState: value => { state = value; }, mergeLite,
      team: tw4MyTeamHtml, rail: tw4DetailRailHtml, loadout: tw4LoadoutHtml,
      scoreboard: tw4ScoreboardHtml, selectNode: index => { selectedNodeIndex = index; } };
  })();`, sandbox);
  const state = {
    round: { id: 11, status: 'ACTIVE', current_front_index: 4 },
    settings: { teamAName: '청순녀', teamBName: '섹시녀', energyMax: 15, ...settings },
    front: { a_hp: 800, a_max_hp: 1000, b_hp: 700, b_max_hp: 1000 },
    mine, commanders: { mineSide: 'B' }, counts: { A: 20, B: 20 },
  };
  sandbox.qa.setState(state);
  return { ...sandbox.qa, state };
}

test('본인 참가 정보에 따라 A/B 팀명과 강조 색상을 표시한다', () => {
  for (const [side, name] of [['A', '청순녀'], ['B', '섹시녀']]) {
    const html = renderer({ side }).team();
    assert.match(html, new RegExp(`is-assigned side-${side.toLowerCase()}`));
    assert.ok(html.includes(`<strong class="tw4-my-team-name">${name}</strong>`));
    assert.match(html, /내 소속팀/);
    assert.match(html, /내 영토전 소속팀/);
    assert.match(html, /MY TEAM/);
  }
});

test('미참가자는 지휘관 정보가 있어도 내 팀으로 오인하지 않는다', () => {
  const html = renderer(null).team();
  assert.match(html, /is-unassigned/);
  assert.match(html, />미참가<|이번 영토전에 참가하지 않았습니다/);
  assert.doesNotMatch(html, /is-assigned|side-a|side-b|MY TEAM/);
});

test('참가 신청 후 미배정·잘못된 side는 중립 대기 표시다', () => {
  for (const side of [null, undefined, '', 'C', 'A" onclick="alert(1)']) {
    const html = renderer({ side }).team();
    assert.match(html, />팀 배정 대기</);
    assert.match(html, /참가 신청 완료/);
    assert.doesNotMatch(html, /is-assigned|side-a|side-b|onclick/);
  }
});

test('CMS 팀명은 이스케이프하며 미설정 이름은 기존 진영명을 사용한다', () => {
  const html = renderer({ side: 'A' }, { teamAName: '<img src=x onerror="bad()"> & 팀' }).team();
  assert.match(html, /&lt;img src=x onerror=&quot;bad\(\)&quot;&gt; &amp; 팀/);
  assert.doesNotMatch(html, /<img/);
  assert.match(renderer({ side: 'B' }, { teamBName: '' }).team(), />B 진영</);
});

test('선택 거점·상대 진영과 무관하며 폴링으로 받은 소속 변경·삭제를 반영한다', () => {
  const ui = renderer({ side: 'A', energy: 12, damage: 500, attacks: 3 });
  ui.selectNode(8);
  assert.match(ui.rail(), /tw4-my-team-name">청순녀</);
  ui.mergeLite({ mine: { side: 'B' } });
  assert.match(ui.team(), /is-assigned side-b/);
  assert.match(ui.rail(), /tw4-my-team-name">섹시녀</);
  ui.mergeLite({ mine: null });
  assert.match(ui.team(), /tw4-my-team-name">미참가</);
});

test('PC 상세·모바일 상단·내 전투단이 같은 팀 배너를 공유하고 통계는 보존한다', () => {
  const ui = renderer({ side: 'B', energy: 12, damage: 500, attacks: 3, contribution_rank: 2, contribution_total: 40 });
  const original = JSON.stringify(ui.state);
  const badge = ui.team();
  for (const html of [ui.rail(), ui.loadout(), ui.scoreboard(false)]) assert.ok(html.includes(badge));
  assert.match(ui.scoreboard(false), /tw4-mobile-my-team/);
  assert.match(ui.rail(), /행동력<\/small><b>12/);
  assert.match(ui.rail(), /누적 피해<\/small><b>500/);
  assert.match(ui.rail(), /공격<\/small><b>3회/);
  assert.match(ui.loadout(), /2위<em>\/ 40명/);
  assert.equal(JSON.stringify(ui.state), original, 'team emphasis never changes gameplay state');
});

test('큰 팀명·줄바꿈·모바일 상시 표시와 진영별 테두리를 유지한다', () => {
  assert.match(css, /\.tw4-my-team \.tw4-my-team-name\s*\{[^}]*font-size:\s*28px;[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.tw4-mobile-my-team \.tw4-my-team-name\s*\{[^}]*font-size:\s*22px/);
  assert.match(css, /\.tw4-mobile-my-team\s*\{\s*display:\s*block;\s*grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /\.tw4-my-team\.side-a\s*\{[^}]*--team-rgb:\s*79, 225, 255/);
  assert.match(css, /\.tw4-my-team\.side-b\s*\{[^}]*--team-rgb:\s*255, 80, 109/);
  assert.match(css, /\.tw4-scoreboard article\.side-b\s*\{[^}]*padding-left:\s*50px/);
});

test('강조는 저속 테두리 광원이며 모션 줄이기 설정에서는 정지한다', () => {
  assert.match(css, /animation:\s*tw4MyTeamGlow 3\.2s ease-in-out infinite/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.tw4-my-team\.is-assigned::before\s*\{\s*animation:\s*none/);
  assert.match(css, /@keyframes tw4MyTeamGlow \{ 0%, 100% \{ opacity: \.4; \} 50% \{ opacity: 1; \} \}/);
});

test('배포 HTML이 새 팀 강조 CSS/JS 버전을 함께 요청한다', () => {
  assert.match(index, /css\/territory-war-v1824\.css\?v=2062-my-team-emphasis/);
  assert.match(index, /js\/territory-war-v1811\.js\?v=2062-my-team-emphasis/);
});
