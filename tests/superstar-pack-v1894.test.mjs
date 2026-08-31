import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  SUPERSTAR_PACK_DEFAULTS,
  SUPERSTAR_PACK_EARLY_ACCESS_NICKNAMES,
  __superstarPackTest,
  handleSuperstarPackDraw,
} from '../functions/_superstar_pack.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

test('슈퍼스타팩 기본 운영값은 공개·일반 개봉 OFF·1장 3억·10%다', () => {
  const settings = __superstarPackTest.cleanSuperstarPackSettings({});
  assert.deepEqual(settings, {
    visible: true,
    drawEnabled: false,
    price: 300_000_000,
    successRate: 10,
    drawCount: 1,
    imageUrl: 'assets/ui/packs/superstar-card-pack-v1.png',
  });
  const row = __superstarPackTest.superstarPackCatalogRow(settings);
  assert.equal(row.maxDrawCount, 1);
  assert.equal(row.price, 300_000_000);
  assert.equal(row.successRate, 10);
  assert.equal(row.missRate, 90);
  assert.equal(row.drawEnabled, false);
  assert.equal(row.ownerDrawEnabled, true);
  assert.equal(row.revealMode, 'SWIPE');
});

test('일반 공개 OFF 상태에서 OWNER와 지정 닉네임 다섯 명만 개봉할 수 있다', () => {
  assert.deepEqual([...SUPERSTAR_PACK_EARLY_ACCESS_NICKNAMES], ['조은', '강구열', '진짜디임', '오리꿍', '요닝']);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: '일반유저' }), false);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'ADMIN' }), false);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'owner' }), true);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: '조은' }), true);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: ' 강구열 ' }), true);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: ' 진짜디임 ' }), true);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: ' 오리꿍 ' }), true);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: ' 요닝 ' }), true);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: '조은1' }), false);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: '강구열님' }), false);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: '진짜디임님' }), false);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: '오리꿍님' }), false);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: false }, { role: 'USER', nickname: '요닝님' }), false);
  assert.equal(__superstarPackTest.canOpenSuperstarPack({ drawEnabled: true }, { role: 'USER' }), true);
});

test('신규 영수증 테이블은 D1과 PostgreSQL 운영 스키마를 모두 지원한다', () => {
  const d1 = __superstarPackTest.superstarPackSchemaStatements({ DB: {} }).join('\n');
  const postgres = __superstarPackTest.superstarPackSchemaStatements({ DB: { dialect: 'postgres' } }).join('\n');
  assert.match(d1, /user_id INTEGER NOT NULL/);
  assert.match(d1, /cost INTEGER NOT NULL/);
  assert.match(postgres, /user_id BIGINT NOT NULL/);
  assert.match(postgres, /cost BIGINT NOT NULL/);
  assert.match(postgres, /to_char\(timezone\('UTC',CURRENT_TIMESTAMP\)/);
  assert.match(postgres, /WHERE status='PENDING'/);
});

test('10% 경계와 당첨 카드 선택이 결정론적으로 계산된다', () => {
  const cards = [{ id: 'S-1' }, { id: 'S-2' }, { id: 'S-3' }];
  assert.deepEqual(
    __superstarPackTest.resolveSuperstarPackRoll({ successRate: 10, hitRoll: 0.099999, cardRoll: 0.51, cards }),
    { outcome: 'WIN', hit: true, card: cards[1] },
  );
  assert.deepEqual(
    __superstarPackTest.resolveSuperstarPackRoll({ successRate: 10, hitRoll: 0.1, cardRoll: 0, cards }),
    { outcome: 'MISS', hit: false, card: null },
  );
});

test('일반 유저의 전용 개봉 요청은 서버에서 423으로 차단된다', async () => {
  const statement = {
    bind() { return this; },
    async first() { return { value: JSON.stringify({ ...SUPERSTAR_PACK_DEFAULTS, drawEnabled: false }) }; },
  };
  const env = { DB: { prepare() { return statement; } } };
  const request = new Request('https://game.example/api/superstar-pack/draw', {
    method: 'POST',
    headers: {
      origin: 'https://game.example',
      'sec-fetch-site': 'same-origin',
      'x-cnine-draw-client': 'client_1234567890abcdef',
    },
  });
  const response = await handleSuperstarPackDraw({
    request,
    env,
    deps: {
      authenticate: async () => ({ id: 7, role: 'USER' }),
      readBody: async () => ({ packId: 'superstar', count: 1, requestId: 'request_1234567890' }),
      json: (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    },
  });
  assert.equal(response.status, 423);
  assert.equal((await response.json()).code, 'SUPERSTAR_PACK_OFF');
});

test('클라이언트는 일반팩을 제거하고 슈퍼스타팩을 우측 끝에 배치한다', () => {
  const source = read('js/app.js');
  assert.doesNotMatch(source, /id:\s*'basic',\s*name:\s*'일반 카드팩'/);
  const advanced = source.indexOf("id: 'advanced'");
  const premium = source.indexOf("id: 'premium'");
  const pickup = source.indexOf("id: 'pickup'");
  const superstar = source.indexOf("id: 'superstar'");
  assert.ok(advanced >= 0 && advanced < premium && premium < pickup && pickup < superstar);
  assert.match(source, /rows\.filter\(row => String\(row\.id\) !== 'basic'\)/);
  assert.match(source, /const SUPERSTAR_PACK_EARLY_ACCESS_NICKNAMES=new Set\(\['조은','강구열','진짜디임','오리꿍','요닝'\]\);/);
  assert.match(source, /const early=SUPERSTAR_PACK_EARLY_ACCESS_NICKNAMES\.has\(nickname\);/);
  assert.match(source, /OWNER OPEN/);
  assert.match(source, /access\.owner&&pack\.ownerDrawEnabled===true/);
  assert.match(source, /EARLY OPEN/);
  assert.match(source, /class="btn superstar-opening-off" type="button" disabled/);
  assert.doesNotMatch(source.slice(source.indexOf('function superstarPackHero'),source.indexOf('function standardPackHero')), /OWNER TEST|OWNER 전용 검증/);
});

test('결제는 스와이프 완료 콜백 뒤에서만 요청되고 결과 연출을 제공한다', () => {
  const source = read('js/app.js');
  const bindStart = source.indexOf('function bindSuperstarSwipe');
  const mountStart = source.indexOf('function mountSuperstarPackOpening');
  assert.ok(bindStart >= 0 && mountStart > bindStart);
  assert.match(source.slice(bindStart, mountStart), /progress>=\.82/);
  assert.match(source.slice(bindStart, mountStart), /onComplete\(\)/);
  assert.match(source, /await requestFactory\(\);await revealSuperstarPackResult/);
  assert.match(source, /statusCode>=400&&statusCode<500&&!pending\)clearPendingSuperstarDraw/);
  assert.match(source, /window\.SuperstarPackV1894/);
  assert.match(source, /outcome-win/);
  assert.match(source, /outcome-miss/);
});

test('전용 서버 경로 우회와 폐기 일반팩 요청을 차단한다', () => {
  const api = read('functions/api/[[path]].js');
  const module = read('functions/_superstar_pack.js');
  assert.match(api, /path==='superstar-pack\/draw'/);
  assert.match(api, /BASIC_PACK_RETIRED/);
  assert.match(api, /SUPERSTAR_DRAW_ROUTE_REQUIRED/);
  assert.match(module, /idx_superstar_pack_one_pending_per_user/);
  assert.match(module, /superstar_pack_debits_v1/);
  assert.match(module, /SELECT \?,\?,\? WHERE EXISTS\(SELECT 1 FROM users WHERE id=\? AND status='ACTIVE' AND coin>=\?\)/);
  assert.match(module, /if \(!Number\(batchResults\?\.\[0\]\?\.meta\?\.changes \|\| 0\)\)/);
});

test('팩 원본·반응형 리소스와 전용 스타일이 배포 엔트리에 연결된다', () => {
  const files = [
    'assets/ui/packs/superstar-card-pack-v1.png',
    'assets/responsive/ui/superstar-card-pack-v1-160.avif',
    'assets/responsive/ui/superstar-card-pack-v1-160.webp',
    'assets/responsive/ui/superstar-card-pack-v1-320.avif',
    'assets/responsive/ui/superstar-card-pack-v1-320.webp',
    'css/superstar-pack-v1894.css',
  ];
  files.forEach((file) => {
    assert.equal(existsSync(path.join(root, file)), true, `${file} missing`);
    assert.ok(statSync(path.join(root, file)).size > 1_000, `${file} unexpectedly small`);
  });
  const png = readFileSync(path.join(root, files[0]));
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1536);
  const index = read('index.html');
  const serviceWorker = read('service-worker.js');
  assert.match(index, /superstar-pack-v1894\.css\?v=1895-larger-pack-clean-label/);
  assert.match(index, /app\.js\?v=1941-superstar-pack-early-access/);
  assert.match(serviceWorker, /soop-card-shell-v1941-superstar-pack-early-access/);
  assert.match(index, /app\.js\?v=1941-superstar-pack-early-access-1945-yoning/);
  assert.match(serviceWorker, /soop-card-shell-v1941-superstar-pack-early-access-1945-yoning/);
  const css = read('css/superstar-pack-v1894.css');
  assert.match(css, /\.superstar-swipe-track/);
  assert.match(css, /\.pack-splitting \.pack-half-left/);
  assert.match(css, /\.pack-product-image\.v21-store-contain-asset/);
  assert.match(css, /width:286px!important/);
  assert.match(css, /prefers-reduced-motion/);
});
