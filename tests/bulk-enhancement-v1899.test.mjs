import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');

const index = read('index.html');
const serviceWorker = read('service-worker.js');
const app = read('js/app.js');
const api = read('functions/api/[[path]].js');
const exactShell = read('js/soopketmon-v21-exact-shell-adapter.js');
const runtimeRouter = read('js/soopketmon-v21-runtime-router.js');

function routeBlock(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing route start: ${start}`);
  assert.ok(to > from, `missing route end: ${end}`);
  return source.slice(from, to);
}

function loadNavigationContracts() {
  const document = {
    currentScript: null,
    readyState: 'loading',
    documentElement: { dataset: {} },
    body: null,
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const context = {
    console,
    document,
    location: { search: '' },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(exactShell, context, { filename: 'soopketmon-v21-exact-shell-adapter.js' });
  vm.runInContext(runtimeRouter, context, { filename: 'soopketmon-v21-runtime-router.js' });
  return { context, document };
}

test('v1899 일괄 강화 리소스와 앱 셸 캐시는 함께 버전이 오른다', () => {
  for (const relative of ['css/bulk-enhancement-v1899.css', 'js/bulk-enhancement-v1899.js']) {
    assert.equal(existsSync(path.join(root, relative)), true, `${relative} missing`);
  }
  assert.match(index, /css\/bulk-enhancement-v1899\.css\?v=1899(?:[-._a-z0-9]+)?/i);
  assert.match(index, /js\/bulk-enhancement-v1899\.js\?v=1899(?:[-._a-z0-9]+)?/i);
  assert.match(index, /js\/app\.js\?v=1904-superstar-son-zeus-sd/i);
  assert.match(serviceWorker, /SHELL_CACHE\s*=\s*['"]soop-card-shell-v1904-superstar-son-zeus-sd['"]/i);
});

test('legacy 앱 셸은 upgrade 화면을 도감 그룹에서 렌더하고 바인딩한다', () => {
  assert.match(app, /\[['"]magic['"],['"]upgrade['"]\]\.includes\(tab\)\)return ['"]dex['"]/);
  assert.match(app, /data-tab=['"]upgrade['"][^>]*>일괄 강화<\/button>/);
  assert.match(app, /data-mobile-tab=['"]upgrade['"]/);
  assert.match(app, /id=['"]dexBulkEnhancementBtn['"]/);
  assert.match(app, /bulkEnhancementEntry\.onclick=\(\)=>renderShell\(['"]upgrade['"]\)/);
  assert.match(app, /upgrade:\(typeof window\.bulkEnhancementView===['"]function['"]\?window\.bulkEnhancementView:/);
  assert.match(app, /if\(tab===['"]upgrade['"]&&typeof window\.bindBulkEnhancementView===['"]function['"]\)window\.bindBulkEnhancementView\(\)/);
  assert.match(app, /\[['"]dex['"],['"]upgrade['"],['"]evolution['"],['"]magic['"]\]\.includes\(tab\)/);
});

test('V21 exact shell과 runtime router가 동일한 native upgrade 계약을 공유한다', async () => {
  const { context, document } = loadNavigationContracts();
  const navigation = context.SoopketmonV21NavigationContract;
  const router = context.SoopketmonV21RuntimeRouter;

  assert.ok(navigation, 'exact shell navigation contract missing');
  assert.ok(router, 'runtime router contract missing');
  assert.strictEqual(router.navigationContract, navigation);
  assert.deepEqual(Array.from(navigation.groups.collection.routes), ['dex', 'upgrade', 'evolution', 'magic']);
  assert.equal(navigation.routes.upgrade.title, '일괄 강화');
  assert.equal(navigation.routes.upgrade.group, 'collection');
  assert.ok(Array.from(router.shellRoutes).includes('upgrade'));
  assert.equal(router.routeContract.upgrade.shell, 'upgrade');
  assert.strictEqual(router.routeMeta('upgrade'), navigation.routes.upgrade);

  const rendered = [];
  const result = await router.navigate('upgrade', {
    runtime: {
      document,
      global: context,
      now: () => Date.now(),
      setTimeout,
      renderShell(route) { rendered.push(route); },
    },
  });
  assert.deepEqual(rendered, ['upgrade']);
  assert.equal(result.shell, 'upgrade');
});

test('auto 강화는 목표 단계와 실행 옵션을 영수증 지문에 묶고 완료 결과만 재생한다', () => {
  const auto = routeBlock(
    api,
    "if(path==='card/breakthrough/auto'&&request.method==='POST')",
    "if(path==='card/breakthrough'&&request.method==='POST')",
  );

  assert.match(auto, /payload\.targetLevel/);
  assert.match(auto, /targetLevel\s*=\s*requestedTargetLevel>0\?[\s\S]*?Math\.min\(maxLevel,requestedTargetLevel\)/);
  assert.match(auto, /while\(attempts<maxAttempts\)[\s\S]*?if\(level>=targetLevel\)/);
  assert.match(auto, /stopReason=['"]TARGET_REACHED['"]/);
  assert.match(auto, /stopReason=['"]MATERIAL_EXHAUSTED['"]/);
  assert.match(auto, /HIGH_MANUAL_ONLY/);
  assert.match(auto, /duplicateCost=highStep\?Math\.max\(0,Math\.floor\(Number\(rule\.duplicateCards\)\|\|0\)\):0/);
  assert.match(auto, /if\(duplicateCost>0\)\{stopReason=['"]HIGH_MANUAL_ONLY['"]/);
  assert.match(auto, /MAX_LEVEL/);
  assert.match(auto, /BREAKTHROUGH_AUTO_REQUEST_MISMATCH/);

  const fingerprint = api.match(
    /(?:function\s+[\w$]*(?:fingerprint|requestKey|receiptKey|binding)[\w$]*\s*\([^)]*\)|(?:const|let)\s+[\w$]*(?:fingerprint|requestKey|receiptKey|binding)[\w$]*\s*=)[^;\n]*/i,
  );
  assert.ok(fingerprint, 'auto receipt fingerprint declaration missing');
  for (const field of ['cardId', 'targetLevel', 'maxAttempts']) {
    assert.match(fingerprint[0], new RegExp(field, 'i'), `receipt fingerprint must bind ${field}`);
  }

  assert.match(auto, /INSERT OR IGNORE INTO breakthrough_auto_receipts_v1616/);
  assert.match(auto, /status===['"]COMPLETED['"][\s\S]*?JSON\.parse\(receipt\.responseJson\)/);
  assert.match(auto, /BREAKTHROUGH_AUTO_RECEIPT_CORRUPT/);
  const responseDeclaration = auto.match(/response=\{[\s\S]*?\};/)?.[0] || '';
  assert.match(responseDeclaration, /targetLevel/);
  assert.match(responseDeclaration, /maxAttempts/);
});

test('auto 강화 CAS는 상태·재화·영수증을 함께 확정하고 자기 marker만 원복한다', () => {
  const auto = routeBlock(
    api,
    "if(path==='card/breakthrough/auto'&&request.method==='POST')",
    "if(path==='card/breakthrough'&&request.method==='POST')",
  );

  assert.match(auto, /const marker=-\(3000000000\+Math\.floor\(Math\.random\(\)\*900000000\)\)/);
  const markerCas = auto.match(/UPDATE user_cards SET breakthrough_fail_count=\? WHERE[\s\S]*?\)\$\{starSpent>0/)?.[0]||'';
  assert.match(markerCas, /breakthrough_level=\?[\s\S]*?COALESCE\(breakthrough_fail_count,0\)=\?/);
  assert.match(markerCas, /breakthrough_auto_receipts_v1616[\s\S]*?request_id=\?[\s\S]*?user_id=\?[\s\S]*?card_id=\?[\s\S]*?status=['"]PENDING['"]/);
  assert.match(auto, /UPDATE user_cards SET breakthrough_fail_count=\?[\s\S]{0,1200}\.bind\(marker,user\.id,cardId,initial\.level,initial\.failCount,requestId,user\.id,receiptFingerprint/);
  assert.match(auto, /const balanceGuard=`EXISTS\(SELECT 1 FROM users WHERE id=\? AND card_shards=\?\)/);
  assert.match(auto, /const receiptIndex=statements\.length/);
  assert.match(auto, /UPDATE breakthrough_auto_receipts_v1616 SET status=['"]COMPLETED['"][\s\S]*?status=['"]PENDING['"][\s\S]*?breakthrough_level=\?[\s\S]*?breakthrough_fail_count=\?/);
  assert.match(auto, /results\[receiptIndex\]\?\.meta\?\.changes/);
  assert.match(auto, /UPDATE user_cards SET breakthrough_level=\?,breakthrough_fail_count=\? WHERE user_id=\? AND card_id=\?[\s\S]{0,240}breakthrough_fail_count=\?/);
  assert.doesNotMatch(auto, /breakthrough_level IN \(\?,\?\)[\s\S]{0,100}breakthrough_fail_count IN \(\?,\?\)/);
  assert.match(auto, /status=['"]FAILED['"][\s\S]*?error_message=['"]STATE_CONFLICT['"]/);
  assert.match(auto, /BREAKTHROUGH_AUTO_STATE_CONFLICT/);
  const receiptResultGuard=auto.indexOf('if(Number(results[receiptIndex]?.meta?.changes||0)!==1)');
  const shardLog=auto.indexOf('INSERT INTO shard_logs',receiptResultGuard);
  const starLog=auto.indexOf('INSERT INTO inventory_logs',receiptResultGuard);
  assert.ok(receiptResultGuard>=0&&shardLog>receiptResultGuard&&starLog>receiptResultGuard,'economy logs must run only after this execution completes the receipt');
  assert.doesNotMatch(auto.slice(0,receiptResultGuard), /INSERT INTO (?:shard_logs|inventory_logs)/);
});

test('고경제성 auto 라우트는 사용자 락 timeout/error에서 fail-closed 된다', () => {
  assert.match(api, /(?:FAIL_CLOSED|HIGH_ECONOMY|STRICT_MUTATION_LOCK)[A-Z0-9_]*\s*=\s*new Set\(\[[\s\S]{0,400}['"]card\/breakthrough\/auto['"]/i);
  const start = api.indexOf('const acquired=await Promise.race');
  const end = api.indexOf('// V1784: 락 해제', start);
  assert.ok(start >= 0 && end > start, 'mutation lock guard block missing');
  const guard = api.slice(start, end);
  assert.match(guard, /acquired===['"]LOCK_GUARD_TIMEOUT['"]\|\|acquired===['"]LOCK_ERROR['"]/);
  assert.match(guard, /BREAKTHROUGH_LOCK_UNAVAILABLE/);
  assert.match(guard, /retryable:true/);
  assert.match(guard, /503/);
  assert.match(guard, /mutationLock=null[\s\S]*?(?:else|\})/, 'ordinary receipt-backed routes may retain their documented fallback');
});

test('bulk client는 다중 선택을 round-robin 단일 시도로 처리하고 중지할 수 있다', () => {
  const client = read('js/bulk-enhancement-v1899.js');
  assert.match(client, /window\.bulkEnhancementView\s*=/);
  assert.match(client, /window\.bindBulkEnhancementView\s*=/);
  assert.match(client, /new Set\(/, 'selected card ids must be deduplicated');
  assert.match(client, /type=['"]checkbox['"]|role=['"]checkbox['"]|data-bulk-card=[\s\S]{0,240}aria-pressed=/);
  assert.match(client, /while\(hasWork[\s\S]{0,600}for\(const card of selectedCards\)/, 'auto mode must revisit selected cards in round-robin order');
  assert.match(client, /maxAttempts\s*:\s*1/);
  assert.match(client, /targetLevel\s*:/);
  assert.doesNotMatch(client, /Promise\.all\([^)]*(?:breakthrough|enhance|upgrade)/i, 'economy mutations must remain sequential');
  assert.match(client, /(?:stopRequested|stopPending|shouldStop)/);
  assert.match(client, /(?:data-bulk-stop|bulkEnhancementStop|bulk-enhancement-stop)/i);
  assert.match(client, /(?:stopRequested|stopPending|shouldStop)[\s\S]{0,300}(?:break|return)/);
  assert.match(client, /if\(state\.stopRequested\|\|!sameRunAccount\(runContext\)\)throw cancelledRunError/);
});

test('bulk client는 네트워크 재시도에 같은 requestId를 쓰고 FUR/ZENITH +10을 수동으로 남긴다', () => {
  const client = read('js/bulk-enhancement-v1899.js');
  assert.match(client, /(?:const|let)\s+requestId\s*=\s*[^;]+;/);
  assert.match(client, /(?:payload|body)\s*=\s*JSON\.stringify\(\{[\s\S]{0,260}requestId[\s\S]{0,260}maxAttempts\s*:\s*1/);

  const retryLoop = client.match(/(?:for|while)\s*\([^)]*(?:retry|retries)[^)]*\)\s*\{[\s\S]{0,1600}?\n?\s*\}/i);
  assert.ok(retryLoop, 'bounded network retry loop missing');
  assert.match(retryLoop[0], /(?:fetch|apiFetch|request)/i);
  assert.doesNotMatch(retryLoop[0], /(?:crypto\.randomUUID|requestId\s*=|createRequestId|newRequestId)\s*\(/i, 'retry loop must not mint another requestId');

  assert.match(client, /['"]FUR['"][\s\S]{0,80}['"]ZENITH['"]|['"]ZENITH['"][\s\S]{0,80}['"]FUR['"]/);
  assert.match(client, /level\s*>=\s*10/);
  assert.match(client, /(?:MANUAL_ONLY|manualOnly|수동)/);
  assert.match(client, /duplicateCards:Math\.max\(0,Math\.floor\(Number\(rule\?\.duplicateCards\)\|\|0\)\)/);
  assert.match(client, /level>=10&&Number\(rule\.duplicateCards\|\|0\)>0/);
  assert.match(client, /ownerKey:['"]['"],epoch:0/);
  assert.match(client, /function alignAccount\(/);
  assert.match(client, /state\.selected\.clear\(\);state\.outcomes\.clear\(\);state\.finishedCards\.clear\(\)/);
  assert.match(client, /const runContext=\{ownerKey:state\.ownerKey,epoch:state\.epoch\}/);
});

test('MA·LIMITED 고급 설정은 중복 카드 비용을 보존해 auto 우회를 차단한다', () => {
  assert.match(api, /MA_MASTER_STAR_BREAKTHROUGH_DEFAULT[^;]+duplicateCards:0/);
  assert.match(api, /LIMITED_MASTER_STAR_BREAKTHROUGH_DEFAULT[^;]+duplicateCards:0/);
  assert.match(api, /function cleanMaMasterStarBreakthrough[\s\S]{0,900}duplicateCards:Math\.max/);
  assert.match(api, /function cleanLimitedMasterStarBreakthrough[\s\S]{0,900}duplicateCards:Math\.max/);
});

test('bulk client UI는 모바일 safe-area, 터치 크기와 진행 상태 접근성을 제공한다', () => {
  const client = read('js/bulk-enhancement-v1899.js');
  const css = read('css/bulk-enhancement-v1899.css');
  assert.match(client, /aria-live=['"]polite['"]|role=['"]status['"]/);
  assert.match(client, /aria-label=/);
  assert.match(client, /aria-pressed=|aria-checked=/);
  assert.match(css, /@media\s*\(max-width\s*:\s*(?:600|640|700|720|760|768|820|860)px\)/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /min-height\s*:\s*(?:44|46|48|50|52|54|56)px/);
  assert.match(css, /:focus(?:-visible)?/);
  assert.match(css, /@media\s*\(prefers-reduced-motion\s*:\s*reduce\)/);
});
