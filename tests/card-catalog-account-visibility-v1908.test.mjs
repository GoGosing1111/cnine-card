import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');

const policySource = read('js/card-visibility-v1908.js');
const index = read('index.html');
const app = read('js/app.js');
const pve = read('js/pve-command-v2-live.js');
const bulk = read('js/bulk-enhancement-v1899.js');
const serviceWorker = read('service-worker.js');

const HIDDEN_CARD_IDS = Object.freeze([
  'CN-011CAD85BBB2470F',
  'CN-8D3E40884AC04D2C'
]);

function loadPolicy() {
  const context = {};
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(policySource, context, { filename: 'card-visibility-v1908.js' });
  assert.ok(context.CNineCardVisibilityV1908, 'V1908 카드 공개 정책이 전역에 설치되어야 합니다.');
  return context.CNineCardVisibilityV1908;
}

function ids(rows) {
  return Array.from(rows || [], row => String(row.id ?? row.cardId ?? row.card_id ?? ''));
}

function assetVersion(documentSource, assetPath) {
  const escaped = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = documentSource.match(new RegExp(`${escaped}\\?v=([^"'\\s>]+)`, 'i'));
  assert.ok(match, `${assetPath}에 캐시 버전이 필요합니다.`);
  return match[1];
}

test('정확한 조은 계정은 기존·향후 감스트 카드만 숨기고 나머지 순서를 유지한다', () => {
  const policy = loadPolicy();
  assert.equal(policy.TARGET_NICKNAME, '조은');
  assert.deepEqual(Array.from(policy.HIDDEN_CARD_IDS), HIDDEN_CARD_IDS);

  const rows = [
    { id: 'SAFE-BEFORE', member: '손흥민', title: '첫 번째 안전 카드' },
    { id: HIDDEN_CARD_IDS[0], member: '다른 멤버', title: 'ID로 차단되는 카드' },
    { id: 'FUTURE-GAMST-MEMBER', memberName: '감스트', title: '향후 멤버 카드' },
    { id: 'SAFE-MIDDLE', name: '김민교', title: '감사합니다' },
    { id: 'FUTURE-GAMST-TITLE', name: '다른 멤버', title: '신규 감스트 기념 카드' },
    { id: HIDDEN_CARD_IDS[1], name: '다른 멤버', title: '두 번째 ID 차단 카드' },
    { id: 'SAFE-AFTER', name: '제우스', title: '마지막 안전 카드' }
  ];

  const expected = ['SAFE-BEFORE', 'SAFE-MIDDLE', 'SAFE-AFTER'];
  for (const nickname of ['조은', ' 조은 ', '\u00a0조은\u00a0', '\t조은\r\n', '조은'.normalize('NFD')]) {
    assert.equal(policy.isTargetUser({ nickname }), true, JSON.stringify(nickname));
    assert.deepEqual(ids(policy.filterCollectionCards(rows, { nickname })), expected, JSON.stringify(nickname));
  }
});

test('오조은·조은2·다른 계정·익명 사용자의 카탈로그는 변경하지 않는다', () => {
  const policy = loadPolicy();
  const rows = [
    { id: 'SAFE', name: '다른 멤버', title: '일반 카드' },
    { id: HIDDEN_CARD_IDS[0], name: '감스트', title: '조폭 감스트' },
    { id: 'FUTURE-GAMST', member: '감스트', title: '향후 감스트 카드' },
    { id: HIDDEN_CARD_IDS[1], name: '감스트', title: '훈훈한 감스트' }
  ];
  const expected = ids(rows);

  for (const viewer of [
    { nickname: '오조은' },
    { nickname: '조은2' },
    { nickname: '조 은' },
    { nickname: '다른유저' },
    { nickname: '' },
    { nickname: null },
    {},
    null,
    undefined
  ]) {
    assert.equal(policy.isTargetUser(viewer), false, JSON.stringify(viewer));
    assert.deepEqual(ids(policy.filterCollectionCards(rows, viewer)), expected, JSON.stringify(viewer));
  }
});

test('정책 스크립트는 bulk와 app보다 먼저 로드되고 모든 카드 화면이 같은 필터를 사용한다', () => {
  const policyPosition = index.indexOf('js/card-visibility-v1908.js');
  const bulkPosition = index.indexOf('js/bulk-enhancement-v1899.js');
  const appPosition = index.indexOf('js/app.js');
  const pvePosition = index.indexOf('js/pve-command-v2-live.js');

  assert.ok(policyPosition >= 0, 'index.html이 V1908 카드 공개 정책을 로드해야 합니다.');
  assert.ok(policyPosition < bulkPosition, '정책은 일괄 강화 스크립트보다 먼저 로드되어야 합니다.');
  assert.ok(policyPosition < appPosition, '정책은 앱 카탈로그보다 먼저 로드되어야 합니다.');
  assert.ok(policyPosition < pvePosition, '정책은 PVE 카드 편성 스크립트보다 먼저 로드되어야 합니다.');

  for (const [label, source] of [['app', app], ['PVE', pve], ['bulk', bulk]]) {
    assert.match(source, /CNineCardVisibilityV1908/, `${label}가 V1908 정책 객체를 참조해야 합니다.`);
    assert.match(source, /filterCollectionCards\s*\(/, `${label}가 표시 직전에 카드 배열을 필터링해야 합니다.`);
  }
});

test('V1908 정책·앱·PVE·bulk는 같은 버전이며 서비스워커는 그보다 오래되지 않는다', () => {
  const versions = [
    assetVersion(index, 'js/card-visibility-v1908.js'),
    assetVersion(index, 'js/bulk-enhancement-v1899.js'),
    assetVersion(index, 'js/app.js'),
    assetVersion(index, 'js/pve-command-v2-live.js')
  ];
  for (const version of versions) assert.match(version, /^1908(?:[-._a-z0-9]+)?$/i, `V1908 캐시 키가 아닙니다: ${version}`);
  assert.equal(new Set(versions).size, 1, 'V1908 관련 브라우저 리소스는 동일한 캐시 키를 써야 합니다.');

  const shell = serviceWorker.match(/SHELL_CACHE\s*=\s*['"]soop-card-shell-v([^'"]+)['"]/i);
  assert.ok(shell, '서비스워커 셸 캐시 키가 필요합니다.');
  assert.ok(Number.parseInt(shell[1],10)>=1908, `서비스워커 캐시가 V1908보다 오래됐습니다: ${shell[1]}`);
});
