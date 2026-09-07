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

test('reads the canonical 37-card preview roster and never inherits historic ranks', () => {
  assert.equal(validateRoster(roster), roster);
  assert.equal(roster.status, 'PREVIEW_ONLY_NOT_RUNTIME_CONNECTED');
  assert.equal(roster.rankPolicy.inheritLegacyRanks, false);
  assert.ok(roster.cards.every(card => card.rank === null));
  assert.deepEqual(summarize(roster.cards), { total: 37, sourceReady: 37, spriteReady: 21, rankPending: 37, positions: { 전위: 17, 중거리: 12, 후열: 8 } });
});
test('current mercenary frame is the native transparent slim V3 asset, never a checkerboard draft', async () => {
  assert.equal(roster.cardComposition.frame, 'assets/ui/card-frames/mercenary-contract-frame-slim-v3.png');
  const bytes = fs.readFileSync(path.join(root, roster.cardComposition.frame));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(), roster.cardComposition.frameSha256);
  const metadata = await sharp(bytes).metadata();
  assert.deepEqual([metadata.width, metadata.height, metadata.channels, metadata.hasAlpha], [1024, 1536, 4, true]);
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let solidMetal = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparent++;
    if (data[i] >= 240) solidMetal++;
  }
  assert.ok(transparent > info.width * info.height * 0.8, 'opening and exterior must contain genuine alpha');
  assert.ok(solidMetal > 100000, 'the metal frame must remain visually solid (native alpha peaks at 254)');
  for (const [x, y] of [[0, 0], [1023, 0], [0, 1535], [1023, 1535]]) {
    assert.ok(data[(y * info.width + x) * 4 + 3] <= 1, `clear exterior sample ${x},${y}`);
  }
  for (const [x, y] of [[512, 768], [160, 240], [864, 1296]]) {
    assert.equal(data[(y * info.width + x) * 4 + 3], 0, `transparent sample ${x},${y}`);
  }
  assert.match(client, /assetUrl\(roster\.cardComposition\.frame\)/);
  assert.match(client, /class="card-display-name"/);
  assert.doesNotMatch(client, /class="card-name"/);
  assert.match(css, /\.card-display-name\{[^}]*font-size:17px/);
  const systemPreview = read('preview/project-v-mercenary-system-v1/mercenary-system.js');
  assert.match(systemPreview, /assetUrl\(state\.roster\.cardComposition\.frame\)/);
  assert.doesNotMatch(systemPreview, /mercenary-contract-frame-premium-v2/);
});
test('all sixteen approved additions match their reviewed originals and remain art-only', () => {
  const approval = JSON.parse(read('assets/ui/project-v/mercenaries/mercenary-art-approval-20260907.json'));
  assert.equal(approval.newCards, 16);
  assert.equal(approval.existingCardsPreserved, 21);
  assert.equal(approval.totalCards, 37);
  assert.match(approval.userRequest, /다 승인/);
  assert.deepEqual(approval.entries.map(entry => entry.code), Array.from({length:16}, (_, index) => `V-${String(index + 22).padStart(3, '0')}`));
  for (const entry of approval.entries) {
    const card = roster.cards.find(card => card.code === entry.code);
    assert.equal(card.sourceArtStatus, 'APPROVED_SOURCE_ART');
    assert.equal(card.nameStatus, 'PROVISIONAL_CONCEPT_NAME');
    assert.equal(card.roleStatus, 'ART_CONCEPT_ONLY');
    assert.equal(card.catalogRelease, 'READ_ONLY_USER_APPROVED');
    assert.equal(card.sourceArt, entry.sourceArt);
    assert.equal(card.sourceArtSha256, entry.sha256);
    assert.equal(card.battleSprite, null);
    assert.equal(card.battleSpriteStatus, 'NOT_YET_PRODUCED');
    const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').toUpperCase();
    assert.equal(hash(entry.reviewSource), entry.sha256);
    assert.equal(hash(entry.sourceArt), entry.sha256);
  }
  assert.equal(roster.cards[23].weapon, 'SKS');
  assert.equal(roster.cards[23].sourceArtSha256, '27F309BF365B42CCC167F33358793E3EA6863F8642CFEBA8621F28D22B5678D5');
  assert.ok(!roster.cards.some(card => /01-pistol-nocturne-v[12]/.test(card.sourceArt)));
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
  assert.equal(filterCards(roster.cards).length, 37);
  assert.deepEqual(filterCards(roster.cards, { position: '후열', role: '저격' }).map(card => card.code), ['V-004', 'V-008', 'V-025', 'V-036']);
  assert.deepEqual(filterCards(roster.cards, { position: '중거리', q: '라비에나' }).map(card => card.code), ['V-013']);
  assert.equal(filterCards(roster.cards, { position: '후열', q: '라비에나' }).length, 0);
  assert.equal(filterCards(roster.cards, { sort: 'name' })[0].name, '네레이아');
  assert.equal(filterCards(roster.cards, { sort: 'newest' })[0].code, 'V-037');
  assert.deepEqual(filterCards(roster.cards, { q: 'SKS' }).map(card => card.code), ['V-024']);
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
  assert.equal(media.entries.length, 95);
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
  assert.ok(listBytes < 1100000 / 21 * roster.cards.length, `${listBytes} byte list exceeds the existing per-card budget`);
  for (const card of roster.cards) {
    for (const [kind, size] of [['art', 320], ['art', 640], ...(card.battleSprite ? [['sd', 640]] : [])]) assert.ok(fs.existsSync(path.join(root, mediaPath(card.code, kind, size))));
    if (!card.battleSprite) assert.ok(!media.entries.some(entry => entry.code === card.code && entry.kind === 'sd'));
  }
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
