import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const [api,app,battleLive,pveLive,pveCss,index,serviceWorker,packageRaw]=await Promise.all([
  'functions/api/[[path]].js','js/app.js','js/battle-v2-live.js','js/pve-command-v2-live.js','css/pve-command-v2.css','index.html','service-worker.js','package.json'
].map(path=>readFile(new URL(path,root),'utf8')));
const packageJson=JSON.parse(packageRaw);

function section(source,startNeedle,endNeedle){
  const start=source.indexOf(startNeedle);
  assert.ok(start>=0,`${startNeedle} 구간을 찾을 수 있어야 합니다.`);
  const end=source.indexOf(endNeedle,start+startNeedle.length);
  assert.ok(end>start,`${startNeedle} 구간의 끝을 찾을 수 있어야 합니다.`);
  return source.slice(start,end);
}

test('소탕은 첫 1회 V3 전투가 끝난 뒤 잔여 횟수만 일괄 요청한다',()=>{
  const startAuto=section(app,'async function startAutoBattle()','const battleAutoUiObserver');
  const startBattle=section(app,'async function startBattle()','function magicView');
  const finish=section(battleLive,'async function finishPve','window.playPveBattleV2Live');
  assert.match(startAuto,/autoRemaining=remaining-1/);
  assert.match(startAuto,/autoRequestId=/);
  assert.match(startBattle,/await window\.playPveBattleV2Live/,'첫 회차는 기존 V3 플레이어를 끝까지 거쳐야 합니다.');
  assert.match(finish,/await window\.completePveSweepAfterAnimatedBattle\(\{data,modal,msg,renderer\}\)/);
  assert.match(finish,/const sweeping = Boolean\(battleState\.autoRunning\)/);
  assert.match(finish,/if \(!sweeping && data\.equipmentReward/,'소탕 첫 회차의 개별 보상 팝업은 합산 결과 전까지 열리면 안 됩니다.');
  assert.doesNotMatch(finish,/setTimeout\(\(\)=>\{if\(battleState\.autoRunning\)[\s\S]*startBattle\(\)/,'소탕 중 전투 화면을 회차마다 다시 만들면 안 됩니다.');
  assert.match(startAuto,/requestedBattles:remaining/);
});

test('아포칼립스는 UI와 클라이언트 실행 경로에서 소탕이 차단된다',()=>{
  const startAuto=section(app,'async function startAutoBattle()','const battleAutoUiObserver');
  assert.match(startAuto,/if\(selectedPveIsApocalypse\(\)\)return alert\('아포칼립스는 소탕할 수 없습니다/);
  assert.match(pveLive,/data-pve-sweep-policy="APOCALYPSE_EXCLUDED"/);
  assert.match(pveLive,/전용 기믹 전투는 매회 직접 진행합니다/);
  assert.match(pveLive,/const sweepControl = apocalypse[\s\S]*?:\s*`<label class="pvev2-auto pvev2-sweep/);
  assert.match(app,/start\.closest\('\.pvev2-hunt-actions'\)\|\|selectedPveIsApocalypse\(\)/,'레거시 토글 삽입기도 아포칼립스에 소탕을 되살리면 안 됩니다.');
});

test('서버는 아포칼립스를 강제 거부하고 요청한 잔여 행동력까지만 처리한다',()=>{
  const route=section(api,"if(path==='battle/auto'&&request.method==='POST')","if(path==='battle/fight'&&request.method==='POST')");
  assert.match(route,/if\(autoDifficulty\.isApocalypse\)return json\(\{error:'아포칼립스는 소탕할 수 없습니다/);
  assert.match(route,/code:'PVE_SWEEP_APOCALYPSE_EXCLUDED'/);
  assert.match(route,/requestedBattles=Math\.floor\(Number\(payload\.requestedBattles\)\)/);
  assert.match(route,/battleCount=Math\.min\(requestedBattles,availableBattles\)/);
  assert.match(route,/energy=await consumeBattleEnergy\(env,user,settings\)/);
  assert.doesNotMatch(route,/consumeApocalypseEnergy|consumePveEnergyForDifficulty/);
  assert.match(route,/energyKind:'STANDARD'/);
  assert.match(route,/apocalypseExcluded:true/);
});

test('잔여 회차도 동일한 V3 엔진과 회차별 시드로 독립 판정한다',()=>{
  const resolver=section(api,'async function resolveAutoBattle','function defaultBreakthroughConfig');
  assert.match(resolver,/createPveBattleV2\(/);
  assert.match(resolver,/drawIntegrityHash\(`\$\{user\.id\}:\$\{monster\.id\}:\$\{requestId\}`\)/);
  assert.match(resolver,/battleV2\.result\.winner==='A'\?'WIN':'LOSE'/);
  assert.match(resolver,/magicCards:magicLoadout\.cards\|\|\[\]/);
  assert.match(resolver,/battleSuit/);
  assert.match(resolver,/singleHealerBonus:engineState\.singleHealerBonus/);
  assert.match(resolver,/Promise\.all\(\[/,'회차별 독립 지급은 직렬 병목 없이 병렬 처리해야 합니다.');
  assert.match(resolver,/grantBattleCube\(/);
  assert.match(resolver,/resolveMagicCrystalReward\(/);
});

test('소탕 결과는 주요 보상 전체를 합산하고 실패 시 같은 영수증으로 재확인한다',()=>{
  const flow=section(app,'function pveSweepFirstResult','window.completePveSweepAfterAnimatedBattle=completePveSweepAfterAnimatedBattle');
  assert.match(flow,/cardRewards/);
  assert.match(flow,/cubeRewards/);
  assert.match(flow,/equipmentRewards/);
  assert.match(flow,/blackMiracleRewards/);
  assert.match(flow,/unifiedDrops/);
  assert.match(flow,/requestId:battleState\.autoRequestId/);
  assert.match(flow,/같은 요청 번호로 다시 확인하면 중복 지급되지 않습니다/);
  const route=section(api,"if(path==='battle/auto'&&request.method==='POST')","if(path==='battle/fight'&&request.method==='POST')");
  assert.match(route,/previous\.status==='COMPLETED'&&previous\.response_json/);
  assert.match(route,/blackMiracleRewards\.push/);
  assert.match(route,/outcomes\.push/);
});

test('소탕 처리·결과 화면은 잔류 V3 프레임보다 앞에서 활성 결과창 하나만 표시한다',()=>{
  const flow=section(app,'async function completePveSweepAfterAnimatedBattle','window.completePveSweepAfterAnimatedBattle=completePveSweepAfterAnimatedBattle');
  assert.doesNotMatch(flow,/battleSleep\(650\)/,'기존 1회 결과를 먼저 노출하는 지연이 남으면 안 됩니다.');
  assert.match(flow,/modal\.classList\.add\('pve-sweep-modal'\)/);
  assert.match(pveCss,/\.battle-v3-live-shell>#battleMessage:not\(\[hidden\]\)/,'활성 PVE 결과창만 전면 레이어가 되어야 합니다.');
  assert.match(pveCss,/\.battle-v3-result\[hidden\]\{display:none!important\}/,'숨긴 탑 결과창이 CSS로 되살아나면 안 됩니다.');
  assert.match(pveCss,/z-index:2147483500!important/);
  assert.match(pveCss,/\.battle-v3-live-shell>\.battle-v3-canvas-host[\s\S]*visibility:hidden!important/,'소탕 결과 동안 잔류 WebGL 프레임은 숨겨야 합니다.');
});

test('소탕 전용 UI와 캐시 버전이 운영 셸에 연결된다',()=>{
  assert.match(pveCss,/\.pvev2-sweep\{/);
  assert.match(pveCss,/\.pve-sweep-panel\.is-processing/);
  assert.match(pveCss,/\.pve-sweep-stats/);
  assert.match(pveCss,/@media\(max-width:620px\)/);
  assert.match(index,/js\/app\.js\?v=1995-refresh-home-sticky/);
  assert.match(index,/css\/pve-command-v2\.css\?v=1991-sweep-result-front/);
  assert.match(index,/js\/pve-command-v2-live\.js\?v=1991-sweep-result-front/);
  assert.match(app,/js\/battle-v2-live\.js\?v=1991-sweep-result-front/);
  assert.match(serviceWorker,/soop-card-shell-v1995-refresh-home-sticky/);
  assert.match(packageJson.scripts['release:gate']||'',/npm run test:pve-sweep/);
});
