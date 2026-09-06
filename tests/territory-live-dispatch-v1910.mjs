import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [client,css,server,index,worker]=await Promise.all([
  readFile(new URL('js/territory-war-v1811.js',root),'utf8'),
  readFile(new URL('css/territory-war-v1824.css',root),'utf8'),
  readFile(new URL('functions/_territory_war.js',root),'utf8'),
  readFile(new URL('index.html',root),'utf8'),
  readFile(new URL('service-worker.js',root),'utf8')
]);

test('live dispatch is a non-blocking, deduplicated battlefield feed',()=>{
  assert.match(client,/function warDispatchSnapshot\(\)/);
  assert.match(client,/function enqueueWarDispatch\(item\)/);
  assert.match(client,/function syncWarDispatches\(\)/);
  assert.match(client,/warDispatchBaseline=next;[\s\S]*?SITUATION SYNC[\s\S]*?return\}const previous/,'first state establishes a baseline and only briefs the current front');
  assert.match(client,/warDispatchSeen\.has\(item\.key\)/);
  assert.match(client,/warDispatchQueue\.length>4/);
  assert.match(client,/setAttribute\('aria-live','polite'\)/);
  assert.match(client,/COMBAT MOMENTUM/);
  assert.match(client,/SITUATION SYNC/,'active entry receives one current-front briefing');
  assert.match(client,/battleStreak>=5[\s\S]*?battleStreak>=3/);
  assert.match(client,/capture:[\s\S]*?a_capture_streak[\s\S]*?b_capture_streak/);
  assert.match(client,/renderBattle\(\);showMassAssaultBriefing\(\);showOperationBriefing\(\);showTruceBriefing\(\);syncWarDispatches\(\)/);
  assert.match(client,/function warDispatchBlocked\(\)/);
  assert.match(client,/layer\.classList\.add\('is-holding'\)/,'the latest situation remains visible after its entrance animation');
  assert.doesNotMatch(client,/layer\.replaceChildren\(\)/,'the last situation is not cleared while waiting for a new event');
  const dispatchBlock=client.slice(client.indexOf('function warDispatchSnapshot'),client.indexOf('function rewardHtml'));
  assert.doesNotMatch(dispatchBlock,/aria-modal|role=.?dialog|\balert\(|\bconfirm\(/,'dispatch never opens a modal or blocks input');
});

test('broadcast strip uses safe desktop and mobile lanes with premium motion',()=>{
  assert.match(css,/\.tw4-dispatch-layer\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(css,/\.tw4-dispatch-layer\s*\{[\s\S]*?z-index:\s*100020/,'live dispatch must sit above the z-index 100000 territory screen');
  assert.match(css,/\.tw4-dispatch-layer\.is-holding/,'the previous situation has a compact persistent state');
  assert.match(css,/top:\s*calc\(202px \+ env\(safe-area-inset-top/);
  assert.match(css,/@media \(max-width: 820px\)[\s\S]*?\.tw4-dispatch-layer\s*\{[^}]*top:\s*calc\(184px \+ env\(safe-area-inset-top/,'narrow mouse-driven PC keeps the upper lane');
  assert.match(css,/@media \(max-width: 520px\), \(max-width: 820px\) and \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.tw4-dispatch-layer\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*calc\(146px \+ env\(safe-area-inset-bottom/);
  assert.match(css,/body\.territory-war-dispatch-active \.tw4-map-event\s*\{[^}]*opacity:\s*0/,'mobile bulletin yields to the live strip');
  assert.match(css,/@keyframes tw4DispatchPass/);
  assert.match(css,/@keyframes tw4DispatchSweep/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[\s\S]*?tw4DispatchFade/);
  assert.match(css,/\.tw4-dispatch-layer\.tier-5/);
});

test('lite state carries a cached twenty-result pulse and deploy assets are cache-busted',()=>{
  assert.match(server,/let publicStateSharedCache=null,realtimePulseCache=null/);
  assert.match(server,/async function realtimePulse\(env,round\)/);
  assert.match(server,/SELECT id,side,winner_side,created_at FROM territory_war_v3_actions[\s\S]*?LIMIT 20/);
  assert.match(server,/recentActionPulse:pulse\.recentActionPulse,notice:pulse\.notice/);
  assert.match(server,/SELECT a\.id,a\.side,a\.winner_side/);
  assert.match(index,/territory-war-v1824\.css\?v=1994-commander-direct-live-status/);
  assert.match(index,/territory-war-v1811\.js\?v=1995-territory-coin-sync/);
  assert.match(worker,/soop-card-shell-v2047-superstar-batch/);
});
