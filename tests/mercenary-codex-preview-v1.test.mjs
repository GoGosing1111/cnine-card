import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';
import { ROSTER_URL, ENTRY, assetUrl, mediaPath, queryMatches, filterCards, validateRoster, summarize, collectionEntries, readState, artStatus, sdStatus } from '../preview/mercenary-codex-v1/model.js';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const roster = JSON.parse(fs.readFileSync(ROSTER_URL, 'utf8'));
const html = read('preview/mercenary-codex-v1/index.html');
const client = read('preview/mercenary-codex-v1/codex.js');
const css = read('preview/mercenary-codex-v1/codex.css');
const media = JSON.parse(read('assets/ui/project-v/mercenaries/codex-v1/manifest.json'));

test('reads the canonical 21-card preview roster and never inherits historic ranks', () => {
  assert.equal(validateRoster(roster), roster);
  assert.equal(roster.status, 'PREVIEW_ONLY_NOT_RUNTIME_CONNECTED');
  assert.equal(roster.rankPolicy.inheritLegacyRanks, false);
  assert.ok(roster.cards.every(card => card.rank === null));
  assert.deepEqual(summarize(roster.cards), { total: 21, sourceReady: 21, spriteReady: 21, rankPending: 21, positions: { 전위: 11, 중거리: 5, 후열: 5 } });
});
test('preview menu inserts the codex next to dex without mutating the real navigation contract', () => {
  const context = { console, URLSearchParams, location: { search: '' }, document: { currentScript: { dataset: { enabled: 'false' } }, readyState: 'loading', addEventListener() {} } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('js/soopketmon-v21-exact-shell-adapter.js'), context);
  const original = context.SoopketmonV21NavigationContract;
  const before = JSON.stringify(original);
  const entries = collectionEntries(original);
  assert.deepEqual(entries.map(item => item.id), ['dex', 'mercenaryDex', 'upgrade', 'evolution', 'magic']);
  assert.equal(entries[1], ENTRY);
  assert.equal(entries[1].previewOnly, true);
  assert.equal(JSON.stringify(original), before);
  assert.equal(original.routes.mercenaryDex.title, '용병도감');
  assert.equal(Array.from(original.groups.collection.routes).filter(id => id === ENTRY.id).length, 1);
  assert.match(html, /data-enabled="false"/);
});
test('search supports Korean names, titles, whitespace, code normalization and initial consonants', () => {
  const raviena = roster.cards[12];
  for (const query of ['라비에나', '라 비 에 나', 'ㄹㅂㅇㄴ', '자천', 'v-013', 'V013', '013', '지휘']) assert.ok(queryMatches(raviena, query), query);
  assert.equal(queryMatches(raviena, '<script>'), false);
  assert.equal(queryMatches(raviena, '아우렌'), false);
});
test('combined position/role/search filters do not mutate or omit roster records', () => {
  const before = roster.cards.map(card => card.code);
  assert.equal(filterCards(roster.cards).length, 21);
  assert.deepEqual(filterCards(roster.cards, { position: '후열', role: '저격' }).map(card => card.code), ['V-004', 'V-008']);
  assert.deepEqual(filterCards(roster.cards, { position: '중거리', q: '라비에나' }).map(card => card.code), ['V-013']);
  assert.equal(filterCards(roster.cards, { position: '후열', q: '라비에나' }).length, 0);
  assert.equal(filterCards(roster.cards, { sort: 'name' })[0].name, '녹시아');
  assert.equal(filterCards(roster.cards, { sort: 'position' })[0].role.split(' ')[0], '전위');
  assert.deepEqual(roster.cards.map(card => card.code), before);
});
test('favorites are a separate local selection, including empty and intersected results', () => {
  const saved = new Set(['V-013', 'V-020', 'INVALID']);
  assert.equal(filterCards(roster.cards, { favoritesOnly: true }).length, 0);
  assert.deepEqual(filterCards(roster.cards, { favoritesOnly: true }, saved).map(card => card.code), ['V-013', 'V-020']);
  assert.deepEqual(filterCards(roster.cards, { favoritesOnly: true, position: '전위' }, saved).map(card => card.code), ['V-020']);
  assert.match(html, /이 브라우저에만 저장/);
  assert.match(client, /cnine\.mercenaryCodex\.preview\.v1/);
  assert.match(client, /이번 화면에서만 유지/);
});
test('URL state is sanitized and deep links never assign ownership or a grade', () => {
  assert.deepEqual(readState('https://example.test/?q=라비에나&position=중거리&role=지휘&sort=name&saved=1', roster.cards), { q: '라비에나', position: '중거리', role: '지휘', sort: 'name', favoritesOnly: true });
  assert.deepEqual(readState('https://example.test/?position=wrong&role=admin&sort=unknown&saved=true', roster.cards), { q: '', position: '', role: '', sort: 'code', favoritesOnly: false });
  assert.equal(readState(`https://example.test/?q=${'a'.repeat(200)}`, roster.cards).q.length, 80);
});
test('image paths reject external URLs, traversal and malformed codes', () => {
  assert.ok(assetUrl(roster.cards[0].sourceArt).includes('/assets/ui/project-v/mercenaries/'));
  for (const value of ['https://evil.test/a.png', '//evil.test/a.png', 'assets/../secret', 'assets/a.png?x=1', 'assets/a<.png']) assert.throws(() => assetUrl(value));
  assert.throws(() => mediaPath('V-013/../../a'));
  assert.throws(() => mediaPath('V-013', 'invalid'));
  const invalid = structuredClone(roster); invalid.cards[1].code = invalid.cards[0].code;
  assert.throws(() => validateRoster(invalid));
});
test('resource states preserve approval differences, including the supplied Omega-X original', () => {
  assert.equal(artStatus(roster.cards[0]), '기존 로스터 원화');
  assert.equal(artStatus(roster.cards[12]), '승인 원화');
  assert.equal(artStatus(roster.cards[20]), '사용자 지정 원본');
  assert.equal(sdStatus(roster.cards[0]), '기술검수 완료');
  assert.match(sdStatus(roster.cards[20]), /시각검수 대기/);
  assert.match(client, /736 × 1104 JPEG/);
  assert.ok(roster.cards.every(card => card.sourceArt !== card.battleSprite));
  assert.match(client, /data-media="sourceArt"/);
  assert.match(client, /data-media="battleSprite"/);
});
test('responsive WebP derivatives are complete, traceable, transparent for SD and keep every source hash', async () => {
  assert.equal(media.originalsModified, false);
  assert.equal(media.entries.length, 63);
  let listBytes = 0;
  const seen = new Set();
  for (const entry of media.entries) {
    const full = path.join(root, 'assets/ui/project-v/mercenaries/codex-v1', entry.file);
    const bytes = fs.readFileSync(full);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(), entry.sha256);
    const original = fs.readFileSync(path.join(root, entry.source));
    assert.equal(crypto.createHash('sha256').update(original).digest('hex').toUpperCase(), entry.sourceSha256);
    const m = await sharp(bytes).metadata();
    assert.equal(m.width, entry.width);
    if (entry.kind === 'art') assert.equal(m.height / m.width, 1.5);
    else assert.equal(m.hasAlpha, true);
    if (entry.kind === 'art' && entry.width === 320) listBytes += entry.bytes;
    assert.equal(seen.has(entry.file), false);
    seen.add(entry.file);
  }
  assert.ok(listBytes < 1100000, `${listBytes} byte list exceeds 1.1MB budget`);
  for (const card of roster.cards) for (const [kind, size] of [['art', 320], ['art', 640], ['sd', 640]]) assert.ok(fs.existsSync(path.join(root, mediaPath(card.code, kind, size))));
});
test('preview has no live boot, mutation APIs, inherited stats, audio, or ownership claims', () => {
  assert.doesNotMatch(html, /src="[^\"]*(?:app\.js|runtime-router|battle-engine|gsap|pixi)/i);
  assert.doesNotMatch(client, /apiRequest|\/api\/|method:\s*['"](?:POST|PUT|DELETE)|new Audio|AudioContext|battleSprite\s*\|\|\s*card.sourceArt/);
  for (const file of ['index.html', 'js/app.js', 'js/soopketmon-v21-runtime-router.js', 'service-worker.js']) assert.doesNotMatch(read(file), /mercenary-codex-v1/);
  assert.match(client, /credentials: 'omit'/);
  assert.match(client, /AbortSignal.timeout\(12000\)/);
  assert.match(client, /등급.*능력치.*스킬.*획득 경로.*확정/);
});
test('interaction contract includes dialogs, focus return, history, keyboard tabs, motion preference and safe states', () => {
  assert.match(html, /<dialog id="detailDialog"[^>]+aria-labelledby="detailName"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(client, /detail.showModal\(\)/);
  assert.match(client, /returnFocus\?\.isConnected/);
  assert.match(client, /addEventListener\('popstate'/);
  assert.match(client, /addEventListener\('cancel'/);
  assert.match(client, /ArrowLeft/);
  assert.match(client, /data-retry/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /focus-visible/);
});
