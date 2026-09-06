import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

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

test('소탕은 첫 1회 V3 전투 뒤 잔여 횟수를 짧은 서버 묶음으로 이어서 처리한다',()=>{
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
  assert.match(startAuto,/const PVE_SWEEP_CHUNK_SIZE=4/);
  assert.match(startAuto,/while\(processed<remaining\)/);
  assert.match(startAuto,/requestedBattles=Math\.min\(PVE_SWEEP_CHUNK_SIZE,remaining-processed\)/);
  assert.match(startAuto,/pveSweepChunkRequestId\(battleState\.autoRequestId,chunkIndex\)/);
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
  assert.match(route,/battleCount=Math\.min\(requestedBattles,availableBattles,PVE_SWEEP_BATCH_LIMIT\)/);
  assert.match(route,/serverCapped:requestedBattles>PVE_SWEEP_BATCH_LIMIT/);
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

test('주간 프리미엄 큐브 당첨 뒤 소탕은 미선언 캐시 참조로 중단되지 않는다',()=>{
  const cubeFlow=section(api,'async function grantWeeklyPremiumCube','async function readTowerSettings');
  assert.doesNotMatch(cubeFlow,/\brecentPremiumCubeCache\b/,'지급 완료 뒤 존재하지 않는 캐시를 무효화하면 소탕 영수증이 FAILED로 남습니다.');
  assert.match(cubeFlow,/const reward=rolled\.won\?await grantPremiumCubeInventory/);
  assert.match(cubeFlow,/if\(weekly\.won\)return grantPremiumCubeInventory/);
});

test('소탕 결과는 주요 보상 전체를 합산하고 실패 시 현재 묶음 영수증으로 재확인한다',()=>{
  const flow=section(app,'function pveSweepFirstResult','window.completePveSweepAfterAnimatedBattle=completePveSweepAfterAnimatedBattle');
  assert.match(flow,/cardRewards/);
  assert.match(flow,/cubeRewards/);
  assert.match(flow,/equipmentRewards/);
  assert.match(flow,/blackMiracleRewards/);
  assert.match(flow,/unifiedDrops/);
  assert.match(flow,/requestPveSweepChunk\(\{protocolVersion:2,requestId:activeRequestId/);
  assert.match(flow,/같은 요청 번호로 다시 확인하면 중복 지급되지 않습니다/);
  const route=section(api,"if(path==='battle/auto'&&request.method==='POST')","if(path==='battle/fight'&&request.method==='POST')");
  assert.match(route,/if\(previous\)return pveSweepReceiptResponse\(env,user,requestId,previous,\{legacyRunningError:sweepProtocolVersion<2\}\)/);
  assert.match(route,/INSERT OR IGNORE INTO pve_auto_runs/,'같은 요청이 동시에 도착해도 처리기를 하나만 선점해야 합니다.');
  assert.match(route,/blackMiracleRewards\.push/);
  assert.match(route,/outcomes\.push/);
});

test('진행 중 영수증은 오류 팝업 대신 202 상태 조회와 자동 폴링으로 복구한다',()=>{
  const helper=section(api,'const PVE_SWEEP_BATCH_LIMIT=4;','const readBody=');
  const statusRoute=section(api,"if(path==='battle/auto/status'&&request.method==='POST')","if(path==='battle/auto'&&request.method==='POST')");
  const flow=section(app,'const PVE_SWEEP_CHUNK_SIZE=4;','function pveSweepQuantity');
  assert.match(helper,/state==='RUNNING'[\s\S]*status:'RUNNING'[\s\S]*PVE_SWEEP_RUNNING[\s\S]*},202/);
  assert.match(helper,/PVE_SWEEP_LOCK_LEASE_MS=10\*60\*1000/);
  assert.match(helper,/PVE_SWEEP_HEARTBEAT_STALE_MS=2\*60\*1000/);
  assert.match(helper,/recoverPveSweepBlockingLock/);
  assert.match(helper,/STALE_RUNNING_RECOVERED/);
  assert.match(helper,/state==='FAILED'/);
  assert.match(statusRoute,/SELECT user_id,status,response_json,error_message,created_at,updated_at FROM pve_auto_runs/);
  assert.match(statusRoute,/pveSweepReceiptResponse\(env,user,requestId,receipt\)/);
  assert.match(flow,/path=checking\?'battle\/auto\/status':'battle\/auto'/);
  assert.match(flow,/status==='RUNNING'\|\|code==='PVE_SWEEP_RUNNING'/);
  assert.match(flow,/code==='PVE_SWEEP_NOT_FOUND'/);
  assert.match(flow,/PVE_SWEEP_POLL_DEADLINE_MS=180000/);
  assert.match(api,/sweepProtocolVersion<2&&requestedBattles>PVE_SWEEP_BATCH_LIMIT/,'캐시된 구형 클라이언트의 장시간 단일 요청을 차단해야 합니다.');
  assert.match(api,/PVE_SWEEP_CLIENT_UPDATE_REQUIRED/);
  assert.match(app,/protocolVersion:2,requestId:activeRequestId/);
});

test('각 묶음은 회차별 하트비트로 활성 영수증과 사용자 락을 연장한다',()=>{
  const route=section(api,"if(path==='battle/auto'&&request.method==='POST')","if(path==='battle/fight'&&request.method==='POST')");
  assert.match(route,/recoverPveSweepBlockingLock\(env,user\.id,requestId\)/);
  assert.match(route,/heartbeatUntil=new Date\(Date\.now\(\)\+PVE_SWEEP_LOCK_LEASE_MS\)/);
  assert.match(route,/UPDATE pve_auto_runs SET updated_at=CURRENT_TIMESTAMP/);
  assert.match(route,/UPDATE pve_auto_locks SET expires_at=\?,updated_at=CURRENT_TIMESTAMP/);
  assert.match(route,/await assertPveSweepLease\(env,user\.id,requestId\)/);
  assert.match(route,/status='COMPLETED'[\s\S]*status='RUNNING'/,'잃어버린 영수증 소유권으로 완료 상태를 덮어쓰면 안 됩니다.');
  assert.match(route,/status='FAILED'[\s\S]*status='RUNNING'/,'완료 영수증을 실패 정리로 덮어쓰면 안 됩니다.');
  assert.match(route,/pve sweep failure receipt cleanup failed/);
});

test('고아 소탕 락은 하트비트 기준으로 회수하고 실제 실행 중인 락은 보존한다',async()=>{
  const runtimeSource=section(api,'const CORS_HEADERS=','const readBody=');
  const context=vm.createContext({Response,console:{error(){},warn(){},log(){}},Date,Number,String,JSON});
  vm.runInContext(`${runtimeSource}\nglobalThis.__pveSweepLock={recoverPveSweepBlockingLock};`,context);
  const {recoverPveSweepBlockingLock}=context.__pveSweepLock;
  const now=Date.now(),stale=new Date(now-3*60*1000).toISOString(),recent=new Date(now-30000).toISOString();
  const fakeDb=row=>{
    const calls=[];
    return {calls,env:{DB:{prepare(sql){return {bind(...values){return {
      async first(){calls.push({kind:'first',sql,values});return row},
      async run(){calls.push({kind:'run',sql,values});return {meta:{changes:1}}}
    }}}}}}};
  };

  const staleSetup=fakeDb({request_id:'older-sweep-request-1234',lock_updated_at:stale,run_request_id:'older-sweep-request-1234',run_status:'RUNNING',run_updated_at:stale});
  const recovered=await recoverPveSweepBlockingLock(staleSetup.env,7,'newer-sweep-request-5678',now);
  assert.equal(recovered.recovered,true);
  assert.equal(recovered.state,'STALE');
  assert.ok(staleSetup.calls.some(call=>call.kind==='run'&&call.sql.includes('STALE_RUNNING_LOCK_RECOVERED')));
  assert.ok(staleSetup.calls.some(call=>call.kind==='run'&&call.sql.includes('DELETE FROM pve_auto_locks')));

  const activeSetup=fakeDb({request_id:'active-sweep-request-1234',lock_updated_at:recent,run_request_id:'active-sweep-request-1234',run_status:'RUNNING',run_updated_at:recent});
  const active=await recoverPveSweepBlockingLock(activeSetup.env,7,'newer-sweep-request-5678',now);
  assert.equal(active.recovered,false);
  assert.equal(active.state,'RUNNING');
  assert.equal(activeSetup.calls.filter(call=>call.kind==='run').length,0,'살아 있는 요청의 락을 회수하면 안 됩니다.');

  const orphanSetup=fakeDb({request_id:'orphan-sweep-request-1234',lock_updated_at:stale,run_request_id:null,run_status:null,run_updated_at:null});
  const orphan=await recoverPveSweepBlockingLock(orphanSetup.env,7,'newer-sweep-request-5678',now);
  assert.equal(orphan.recovered,true);
  assert.ok(orphanSetup.calls.some(call=>call.kind==='run'&&call.sql.includes('NOT EXISTS')),'영수증 없는 락은 경쟁 상태를 막는 조건부 삭제로 회수해야 합니다.');
});

test('영수증 상태 판정은 실행 중·완료·실패·고아 실행을 구분한다',async()=>{
  const runtimeSource=section(api,'const CORS_HEADERS=','const readBody=');
  const context=vm.createContext({Response,console:{error(){},warn(){},log(){}},Date,Number,String,JSON});
  vm.runInContext(`${runtimeSource}\nglobalThis.__pveSweep={pveSweepReceiptState,pveSweepReceiptResponse};`,context);
  const {pveSweepReceiptState,pveSweepReceiptResponse}=context.__pveSweep;
  const now=Date.now(),recent=new Date(now-30000).toISOString(),stale=new Date(now-11*60*1000).toISOString();
  assert.equal(pveSweepReceiptState({status:'RUNNING',updated_at:recent},now),'RUNNING');
  assert.equal(pveSweepReceiptState({status:'RUNNING',updated_at:stale},now),'STALE');
  assert.equal(pveSweepReceiptState({status:'RUNNING',updated_at:stale.replace('T',' ').replace('Z','+00')},now),'STALE');
  assert.equal(pveSweepReceiptState({status:'RUNNING',updated_at:stale.replace('T',' ').replace('Z','')},now),'STALE');
  assert.equal(pveSweepReceiptState({status:'COMPLETED',updated_at:recent},now),'COMPLETED');
  const calls=[];
  const env={DB:{prepare(sql){return {bind(...values){return {async run(){calls.push({sql,values});return {meta:{changes:1}}},async first(){return null}}}}}}};
  const user={id:7},requestId='sweep-recovery-123456';
  const runningResponse=await pveSweepReceiptResponse(env,user,requestId,{user_id:7,status:'RUNNING',updated_at:recent});
  assert.equal(runningResponse.status,202);
  assert.equal((await runningResponse.json()).code,'PVE_SWEEP_RUNNING');
  const completedResponse=await pveSweepReceiptResponse(env,user,requestId,{user_id:7,status:'COMPLETED',response_json:JSON.stringify({ok:true,mode:'PVE_SWEEP',battles:4}),updated_at:recent});
  assert.equal(completedResponse.status,200);
  assert.equal((await completedResponse.json()).replayed,true);
  const failedResponse=await pveSweepReceiptResponse(env,user,requestId,{user_id:7,status:'FAILED',error_message:'internal detail',updated_at:recent});
  assert.equal(failedResponse.status,409);
  const failedBody=await failedResponse.json();
  assert.equal(failedBody.code,'PVE_SWEEP_FAILED');
  assert.doesNotMatch(failedBody.error,/internal detail/);
  const staleResponse=await pveSweepReceiptResponse(env,user,requestId,{user_id:7,status:'RUNNING',updated_at:stale});
  assert.equal(staleResponse.status,409);
  assert.equal((await staleResponse.json()).code,'PVE_SWEEP_STALE');
  assert.ok(calls.some(call=>call.sql.includes('STALE_RUNNING_RECOVERED')));
});

test('클라이언트는 RUNNING 응답을 보여주지 않고 같은 영수증의 완료 결과를 자동 조회한다',async()=>{
  const runtimeSource=section(app,'function pveSweepNumber','function pveSweepQuantity');
  const calls=[];
  const context=vm.createContext({
    console:{error(){},warn(){},log(){}},
    async battleSleep(){},
    async apiRequest(path,options){
      calls.push({path,body:JSON.parse(options.body)});
      if(calls.length===1)return {ok:true,status:'RUNNING',code:'PVE_SWEEP_RUNNING',retryAfterMs:1};
      return {ok:true,mode:'PVE_SWEEP',status:'COMPLETED',requestId:'sweep-client-123456-1',battles:4};
    }
  });
  vm.runInContext(`${runtimeSource}\nglobalThis.__pveSweepClient={requestPveSweepChunk};`,context);
  const payload={requestId:'sweep-client-123456-1',monsterId:3,cardIds:['1','2','3','4','5'],requestedBattles:4};
  const result=await context.__pveSweepClient.requestPveSweepChunk(payload);
  assert.equal(result.status,'COMPLETED');
  assert.deepEqual(calls.map(call=>call.path),['battle/auto','battle/auto/status']);
  assert.equal(calls[0].body.requestId,payload.requestId);
  assert.deepEqual(calls[1].body,{requestId:payload.requestId});
});

test('클라이언트는 다른 요청의 활성 락을 자동 대기한 뒤 자기 소탕을 재개한다',async()=>{
  const runtimeSource=section(app,'function pveSweepNumber','function pveSweepQuantity');
  const calls=[];
  const blocker='older-sweep-request-1234',requestId='newer-sweep-request-5678';
  const context=vm.createContext({
    console:{error(){},warn(){},log(){}},
    async battleSleep(){},
    async apiRequest(path,options){
      const body=JSON.parse(options.body);calls.push({path,body});
      if(calls.length===1){const error=new Error('이전 소탕 요청을 정리하고 있습니다.');Object.assign(error,{code:'PVE_SWEEP_LOCKED',blockingRequestId:blocker,retryAfterMs:1});throw error}
      if(calls.length===2)return {ok:true,status:'RUNNING',code:'PVE_SWEEP_RUNNING',retryAfterMs:1};
      if(calls.length===3)return {ok:true,mode:'PVE_SWEEP',status:'COMPLETED',requestId:blocker,battles:4};
      return {ok:true,mode:'PVE_SWEEP',status:'COMPLETED',requestId,battles:4};
    }
  });
  vm.runInContext(`${runtimeSource}\nglobalThis.__pveSweepClient={requestPveSweepChunk};`,context);
  const payload={requestId,monsterId:3,cardIds:['1','2','3','4','5'],requestedBattles:4};
  const result=await context.__pveSweepClient.requestPveSweepChunk(payload);
  assert.equal(result.requestId,requestId,'이전 요청 결과를 현재 소탕 결과로 합산하면 안 됩니다.');
  assert.deepEqual(calls.map(call=>call.path),['battle/auto','battle/auto/status','battle/auto/status','battle/auto']);
  assert.deepEqual(calls.slice(1,3).map(call=>call.body.requestId),[blocker,blocker]);
  assert.equal(calls[3].body.requestId,requestId);
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
  assert.match(index,/js\/app\.js\?v=2048-boss-signatures/);
  assert.match(index,/css\/pve-command-v2\.css\?v=2034-superstar-power-deck/);
  assert.match(index,/js\/pve-command-v2-live\.js\?v=2034-superstar-power-deck/);
  assert.match(app,/js\/battle-v2-live\.js\?v=1991-sweep-result-front/);
  assert.match(serviceWorker,/soop-card-shell-v2048-boss-signatures/);
  assert.match(packageJson.scripts['release:gate']||'',/npm run test:pve-sweep/);
});
