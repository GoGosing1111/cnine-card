import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {handleEscortOperation,defaultEscortSettings,cleanEscortSettings,finalizeEscortObjectiveTimeline} from '../functions/_escort_operation.js';
import {buildFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';

import {escortContractOptions,deliveryGrade} from '../functions/_escort_contracts.js';
import {jointFixture} from './helpers/joint-db.mjs';
import {ensureRankRewardFixture} from './helpers/rank-reward-schema.mjs';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('호송작전은 5구간 정식 공개를 기본 계약으로 사용한다',()=>{
  const settings=defaultEscortSettings();
  assert.equal(settings.mode,'ON');
  assert.equal(settings.sectors.length,5);
  assert.deepEqual(settings.sectors.map(sector=>sector.key),['DEPARTURE','AMBUSH','BLOCKADE','REPAIR','FINAL_BOSS']);
  assert.equal(settings.sectors.at(-1).isBoss,true);
  assert.equal(cleanEscortSettings({mode:'INVALID'}).mode,'ON');
});

test('기존 전투는 100%, 호송전은 전달된 카드 체력에서 시작한다',()=>{
  const base={id:'CARD-1',title:'테스트 카드',power:1000,power_type:'ATTACK'};
  const normal=buildFighter(base,0,'A',null,'PVE');
  const wounded=buildFighter({...base,startingHpPercent:40},0,'A',null,'PVE');
  const knockedOut=buildFighter({...base,startingHpPercent:0},0,'A',null,'PVE');
  assert.equal(normal.hp,normal.maxHp);
  assert.ok(Math.abs(wounded.hp/wounded.maxHp-.4)<.01);
  assert.equal(knockedOut.hp,0);
  assert.equal(knockedOut.alive,false);
});

test('호송 몬스터는 게이지와 무관하게 차량을 선제 공격하고 카드를 타격하지 않는다',()=>{
  const cards=Array.from({length:5},(_,index)=>({id:`ESCORT-CARD-${index+1}`,title:`호위 카드 ${index+1}`,power:180000,power_type:'ATTACK'}));
  const battle=createPveBattleV2({
    cards,
    monster:{id:'ESCORT-MONSTER',name:'호송 습격대',battle_power:190000,is_boss:0},
    seed:1832,
    escortObjective:{id:'ESCORT_OBJECTIVE',name:'장갑 수송차'}
  });
  const timeline=battle.result.timeline;
  const strikes=timeline.filter(event=>event.type==='ESCORT_OBJECTIVE_ATTACK');
  assert.ok(strikes.length>=1);
  assert.equal(strikes[0].forced,true);
  assert.equal(strikes[0].ignoreInitiative,true);
  assert.ok(strikes.every(event=>event.targetId==='ESCORT_OBJECTIVE'));
  assert.equal(timeline.some(event=>String(event.actorId||'').startsWith('B:')&&String(event.targetId||'').startsWith('A:')&&['TURN','ATTACK','SKILL','COUNTER','ULTIMATE','BOSS_ULTIMATE'].includes(event.type)),false);
  assert.ok(battle.result.final.A.every(card=>card.hp===card.maxHp));

  finalizeEscortObjectiveTimeline(battle,{hpBefore:10000,maxHp:10000,totalDamage:1234});
  assert.equal(strikes.reduce((sum,event)=>sum+event.damage,0),1234);
  assert.equal(strikes.at(-1).objectiveHpAfter,8766);
  assert.equal(battle.escortObjective.targetPriority,'ABSOLUTE');
});

test('API·V3·클라이언트·CMS 연결 계약이 함께 존재한다',async()=>{
  const [handler,worker,app,client,engine,bundle,wrapper,admin,adminIndex,migration,cleanup,index,sw,style,headers,router,adapter,integrationStyle]=await Promise.all([
    read('functions/_escort_operation.js'),read('functions/api/[[path]].js'),read('js/app.js'),read('js/escort-operation-v1830.js'),
    read('preview/project-v-v3/source/battle/BattleEngine.js'),read('preview/project-v-v3/project-v-pixi-battle.bundle.js'),read('js/battle-v3-live.js'),read('admin/escort-operation-admin-v1830.js'),
    read('admin/index.html'),read('database/migrations/0084_v1830_escort_operation.sql'),read('functions/_storage_cleanup.js'),read('index.html'),read('service-worker.js'),read('css/escort-operation-v1830.css'),read('_headers'),read('js/soopketmon-v21-runtime-router.js'),read('js/soopketmon-v21-exact-shell-adapter.js'),read('css/soopketmon-v21-production-integration.css')
  ]);
  assert.match(worker,/handleEscortOperation/);
  assert.match(worker,/'escort\/fight'/);
  assert.match(handler,/cfg\.mode==='TEST'&&!isOwner\(user\)/);
  assert.match(handler,/mode:'ON'/);
  assert.match(handler,/env\.DB\.execSchema\(statements\)/);
  assert.match(handler,/env\.DB\?\.dialect==='postgres'/);
  assert.match(handler,/const userForeignKey=postgres\?'':/);
  assert.match(handler,/response_json/);
  assert.match(handler,/WHERE \$\{RECEIPT_TABLE\}\.user_id=excluded\.user_id/);
  assert.doesNotMatch(handler,/INSERT INTO[^`'\n]*timeline/i);
  assert.match(app,/data-pve-mode="escort"/);
  assert.doesNotMatch(app,/id="pveEscortTab"[^>]*hidden[^>]*>호송작전[^<]*<small>TEST/);
  assert.match(app,/data-mobile-tab="escort"/);
  assert.match(app,/data-v21-route="escort"/);
  assert.match(app,/CNineEscortBridge/);
  assert.match(client,/ProjectVBattleV3Live\.createRenderer/);
  assert.match(client,/data-escort-action="contract"/);
  assert.doesNotMatch(client,/localOwner/);
  assert.match(client,/공개 콘텐츠 탭은 일시적인 API\/DB 오류로 사라지지 않는다/);
  assert.match(client,/다음 구간 전술 선택/);
  assert.match(client,/escort-v1833-tactic-grid/);
  assert.match(client,/tactic-field-repair-v1835\.webp/);
  assert.match(client,/objectiveHud\?\.native/);
  assert.match(engine,/ESCORT:'.*escort-fortress-route-bg-v1\.webp/);
  assert.match(engine,/async setObjective/);
  assert.match(engine,/escortObjectiveAttack\(event=/);
  assert.match(engine,/createObjectiveHud\(\)/);
  assert.match(engine,/syncObjectiveHud\(\{hp,maxHp,status/);
  assert.match(engine,/objectiveHud:\{\s*native:true/);
  assert.match(bundle,/EscortObjectiveHud/);
  assert.match(bundle,/DIRECT IMPACT/);
  assert.match(handler,/finalizeEscortObjectiveTimeline/);
  assert.match(wrapper,/철벽 호송작전/);
  assert.match(admin,/admin\/escort\/settings/);
  assert.match(adminIndex,/escort-operation-admin-v1830\.js\?v=20261128-cargo/);
  assert.match(migration,/pve_escort_action_receipts_v1830/);
  assert.match(cleanup,/escort_receipts/);
  assert.match(app,/project-v-pixi-battle\.bundle\.js\?[^'"]*\bv=[^&'"]+/);
  assert.match(app,/battle-v3-live\.js\?[^'"]*\bv=[^&'"]+/);
  const appShellVersion=index.match(/js\/app\.js\?v=([^&"']+)/)?.[1];
  const serviceWorkerShellVersion=sw.match(/soop-card-shell-v([^"']+)/)?.[1];
  assert.ok(appShellVersion,'index.html app.js cache version is required');
  assert.equal(serviceWorkerShellVersion,appShellVersion,'app.js and service worker shell cache versions must advance together');
  assert.match(index,/escort-operation-v1830\.js\?v=20261128-field-v3/);
  assert.match(index,/escort-operation-v1830\.css\?v=20261128-cargo/);
  assert.match(index,/soopketmon-v21-exact-shell-adapter\.js\?[^" ']*\bv=[^"']+/);
  assert.match(index,/soopketmon-v21-runtime-router\.js\?[^" ']*\bv=[^"']+/);
  assert.match(sw,/\['script','style','worker'\]\.includes\(request\.destination\)[\s\S]*?networkFirst\(request,SHELL_CACHE\)/);
  assert.doesNotMatch(headers,/\/(?:js|css|preview)\/\*[\s\S]{0,100}?immutable/);
  assert.equal((headers.match(/Cache-Control: public, max-age=0, must-revalidate/g)||[]).length>=3,true);
  assert.match(style,/#pveEscortView \.escort-v1833-tactic-card/);
  assert.match(style,/grid-template-columns:34px minmax\(104px,136px\) minmax\(0,1fr\) 18px!important/);
  assert.match(style,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(router,/escort:\s*\{ shell: 'battle', actions: \[\{ selector: '\[data-pve-mode="escort"\]'/);
  assert.match(adapter,/escort: Object\.freeze\(\{ title: '호송작전', group: 'pve', icon: 'swords' \}\)/);
  assert.match(adapter,/pve: Object\.freeze\(\{ title: '[^']*PVE', routes: Object\.freeze\(\[[^\]]*'escort'/);
  assert.match(integrationStyle,/padding: 14px 12px max\(24px, env\(safe-area-inset-bottom\)\)/);
});

test('보상 지급 CLAIMING 고착은 자동 복구되고 모든 지급 쓰기는 상태 가드를 사용한다',async()=>{
  const [handler,client]=await Promise.all([read('functions/_escort_operation.js'),read('js/escort-operation-v1830.js')]);
  assert.match(handler,/CLAIM_RECOVERY_SECONDS=30/);
  assert.match(handler,/async function recoverStaleClaim/);
  assert.match(handler,/statusPayload[\s\S]*await recoverStaleClaim\(env,user\.id\)/);
  assert.match(handler,/async function releaseClaim/);
  assert.match(handler,/UPDATE users SET coin=coin\+CAST\(\? AS BIGINT\),card_shards=card_shards\+\? WHERE id=\? AND \$\{claimGuard\}/);
  assert.match(handler,/INSERT INTO coin_logs[\s\S]*\$\{claimGuard\}/);
  assert.match(handler,/INSERT INTO shard_logs[\s\S]*\$\{claimGuard\}/);
  assert.match(handler,/claimed\?\.status!==['"]CLAIMED['"]/);
  assert.match(client,/지급 상태 자동 확인 실패/);
  assert.match(client,/data-escort-action="reload" data-escort-primary="1">지급 상태 확인/);
});

test('호송 이미지 리소스는 런타임 예산 안으로 압축됐다',async()=>{
  const background=await stat(new URL('../assets/ui/escort/escort-fortress-route-bg-v1.webp',import.meta.url));
  const vehicle=await stat(new URL('../assets/ui/escort/escort-armored-carrier-v1.webp',import.meta.url));
  const tacticIcons=await Promise.all(['field-repair','aegis-barrier','carpet-strike','core-overdrive','signal-jammer'].map(name=>stat(new URL(`../assets/ui/escort/tactics/tactic-${name}-v1835.webp`,import.meta.url))));
  assert.ok(background.size<180_000,`background ${background.size}`);
  assert.ok(vehicle.size<230_000,`vehicle ${vehicle.size}`);
  tacticIcons.forEach(icon=>assert.ok(icon.size<50_000,`tactic icon ${icon.size}`));
});

test('three freight manifests quote fixed sector risks, capped rewards and hull grades',()=>{
  const cfg=defaultEscortSettings(),[relief,freight,priority]=escortContractOptions(cfg);
  assert.deepEqual([relief,freight,priority].map(x=>x.key),['RELIEF','FREIGHT','PRIORITY']);
  for(let i=0;i<5;i++){
    const [a,b,c]=[relief,freight,priority].map(x=>x.sectors[i]);
    assert.ok(a.enemyPower<b.enemyPower&&b.enemyPower<c.enemyPower);
    assert.ok(a.hazardPercent<b.hazardPercent&&b.hazardPercent<c.hazardPercent);
    assert.ok(a.rewardStars<b.rewardStars&&b.rewardStars<c.rewardStars);
    assert.equal(c.rewardTickets,0);
    assert.equal(b.rewardCoin,cfg.sectors[i].rewardCoin);
  }
  assert.deepEqual([8000,7999,5000,4999].map(hp=>deliveryGrade(hp,10000).bonusPercent),[100,80,80,60]);
});

async function escortFixture(t,postgres){
  const f=await jointFixture(t,{postgres});await ensureRankRewardFixture(f.env);
  const schema=[
    'CREATE TABLE shard_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT,card_id TEXT)',
    'CREATE TABLE user_mercenary_loadout_v1(user_id BIGINT PRIMARY KEY,mercenary_code TEXT,revision INTEGER DEFAULT 0,updated_at TEXT)'
  ];
  if(postgres){
    const sql=await read('scripts/postgres-runtime-compat.sql');
    const from=sql.indexOf('CREATE OR REPLACE FUNCTION sqlite_datetime');
    await f.pg.exec(sql.slice(from,sql.indexOf('CREATE OR REPLACE FUNCTION sqlite_date(',from)));
    await f.pg.exec(schema.join(';'));
  }
  else f.DB.sql.exec(schema.join(';'));
  const deps={...f.deps,authenticate:async request=>{
    const user=await f.deps.authenticate(request);
    return user&&{...user,role:'USER'};
  },readBody:r=>r.json(),pveDeckSnapshot:async()=> (await f.deps.raidDeckPower(f.env,7,null,'PVE')).cards,
    battleSettings:async()=>({engine:{}}),createPveBattleV2};
  async function call(action,body,expectedStatus=200){
    const request=new Request('http://localhost/api/escort/'+action,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-7','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const response=await handleEscortOperation({path:'escort/'+action,request,env:f.env,deps});
    const result=await response.json();assert.equal(response.status,expectedStatus,result.error);return result;
  }
  return {...f,call};
}

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: dispatch, combat, handoff and claim survive retries and CMS edits`,async t=>{
  const f=await escortFixture(t,postgres);
  await f.call('start',{contract:'INVALID'},400);
  let run=(await f.call('start',{requestId:'dep-1',contract:'PRIORITY'})).run;
  const manifest=run.contract;
  assert.equal(manifest.key,'PRIORITY');
  const changed=defaultEscortSettings();changed.sectors[0].rewardStars=1;
  await f.setting('escort_operation_settings_v1840',changed);
  const fight={requestId:'fight-1',runId:run.runId,sectorIndex:0};
  const combat=await f.call('fight',fight);
  run=combat.run;
  assert.equal(run.phase,'TACTIC');assert.equal(run.reward.stars,manifest.sectors[0].rewardStars);
  assert.deepEqual(combat.characterBonus,{pve:0});assert.equal(combat.battleV2.mode,'ESCORT');
  assert.equal(combat.monster.name,manifest.sectors[0].enemyName);assert.equal(combat.objective.id,'ESCORT_OBJECTIVE');
  const replay=await f.call('fight',fight);
  assert.equal(replay.replayed,true);assert.deepEqual(replay.sectorSummary,combat.sectorSummary);
  for(const field of ['battleV2','monster','objective'])assert.equal(Object.hasOwn(replay,field),false);
  assert.deepEqual((await f.call('status')).run.reward,run.reward);
  const delivery={runId:run.runId,sectorIndex:0};
  await f.call('deliver',{...delivery,sectorIndex:1},409);
  await f.call('deliver',delivery);run=(await f.call('deliver',delivery)).run;
  assert.equal(run.phase,'DELIVERED');
  const claim={runId:run.runId,requestId:'claim-1'},before=await f.coin();
  f.fail('INSERT INTO shard_logs');
  await f.call('claim',claim,500);assert.equal(await f.coin(),before);
  f.fail('');
  const paid=await f.call('claim',claim);assert.deepEqual(paid.reward,run.reward);
  assert.deepEqual((await f.call('claim',claim)).reward,paid.reward);
  assert.equal(await f.coin(),before+paid.reward.coin);
  const item=code=>f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code=?',code).first();
  assert.equal(Number((await item('MASTER_STAR')).quantity),paid.reward.stars);assert.equal(Number((await item('SCRAPYARD_ENTRY_TICKET')).quantity),5);
  const after=await f.call('start',{requestId:'dep-1',contract:'RELIEF'});
  assert.equal(after.run,null);assert.equal(after.weekly.startedCount,1);assert.equal(after.weekly.rewardCount,1);assert.equal(after.weekly.completedCount,0);
});

test('five sectors settle a graded delivery; pre-renewal runs still pay their saved tickets',async t=>{
  const f=await escortFixture(t,false);
  let run=(await f.call('start',{contract:'FREIGHT'})).run;
  for(let i=0;i<5;i++){
    const fight={runId:run.runId,sectorIndex:i,requestId:'f'+i};
    if(i===4){
      const prior=run.reward;
      f.fail('INSERT INTO pve_escort_weekly_v1830');
      await f.call('fight',fight,500);
      f.fail('');
      const interrupted=await f.call('status');
      assert.equal(interrupted.run.phase,'READY');
      assert.deepEqual(interrupted.run.reward,prior);
      assert.equal(interrupted.weekly.completedCount,0);
    }
    run=(await f.call('fight',fight)).run;
    if(i===4){assert.equal((await f.call('fight',fight)).replayed,true);break;}
    assert.equal(run.phase,'TACTIC');
    run=(await f.call('tactic',{requestId:'t'+i,tactic:run.choices[0].key})).run;
  }
  assert.equal(run.phase,'COMPLETE');assert.equal(run.clearedSectors,5);
  assert.equal(run.reward.coin,run.contract.sectors.reduce((v,s)=>v+s.rewardCoin,0)+Math.round(run.contract.clearBonusCoin*run.deliveryGrade.bonusPercent/100));
  await f.call('claim',{requestId:'freight-claim'});
  const old=(await f.call('start',{})).run;
  const row=await f.p('SELECT state_json FROM pve_escort_runs_v1830 WHERE run_id=?',old.runId).first();
  const state=JSON.parse(row.state_json);delete state.contract;delete state.bankedStars;
  await f.p('UPDATE pve_escort_runs_v1830 SET state_json=? WHERE run_id=?',JSON.stringify(state),old.runId).run();
  run=(await f.call('fight',{requestId:'old-fight'})).run;
  assert.equal(run.reward.tickets,1);assert.equal(run.reward.stars,0);
  await f.call('deliver',{runId:run.runId,sectorIndex:0},409);
  const banked=run.reward;
  await f.call('tactic',{requestId:'old-tactic',tactic:run.choices[0].key});
  await f.p('UPDATE pve_escort_runs_v1830 SET vehicle_hp=1 WHERE run_id=?',run.runId).run();
  const stopped=await f.call('fight',{requestId:'old-loss'});
  assert.equal(stopped.sectorSummary.vehicleDestroyed,true);
  assert.equal(stopped.sectorSummary.result,'LOSE');
  assert.equal(stopped.run.phase,'FAILED');
  assert.equal(stopped.run.history.at(-1).result,'LOSE');
  assert.deepEqual(stopped.run.reward,banked);
  const paid=await f.call('claim',{requestId:'old-claim',runId:run.runId});
  assert.deepEqual(paid.reward,banked);
  const tickets=await f.p("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='SCRAPYARD_ENTRY_TICKET'").first();
  assert.equal(Number(tickets.quantity),6);
  const final=await f.call('status');
  assert.equal(final.weekly.completedCount,1);assert.equal(final.weekly.rewardCount,2);
});

test('a stale claim resumes with its original request and grants banked currency once',async t=>{
  const f=await escortFixture(t,false);
  const run=(await f.call('start',{contract:'RELIEF'})).run;
  const fight={requestId:'to-first-checkpoint',runId:run.runId,sectorIndex:0};
  await f.p("INSERT INTO pve_escort_action_receipts_v1830(request_id,user_id,run_id,action_type,status) VALUES(?,7,?,'FIGHT','PENDING')",fight.requestId,run.runId).run();
  await f.call('claim',{requestId:fight.requestId,runId:run.runId},409);
  const receipt=await f.p('SELECT status FROM pve_escort_action_receipts_v1830 WHERE request_id=?',fight.requestId).first();
  assert.equal(receipt.status,'PENDING');
  await f.call('fight',fight);
  const banked=(await f.call('deliver',{runId:run.runId,sectorIndex:0})).run.reward;
  const claim={runId:run.runId,requestId:'dropped-connection'};
  const before=await f.coin();
  await f.p("INSERT INTO pve_escort_action_receipts_v1830(request_id,user_id,run_id,action_type,status) VALUES(?,7,?,'CLAIM','PENDING')",claim.requestId,run.runId).run();
  await f.p("UPDATE pve_escort_runs_v1830 SET status='CLAIMING',version=version+1,updated_at='2000-01-01 00:00:00' WHERE run_id=?",run.runId).run();
  assert.equal((await f.call('status')).run.status,'COMPLETED_PENDING');
  assert.deepEqual((await f.call('claim',claim)).reward,banked);
  assert.equal((await f.call('claim',claim)).replayed,true);
  assert.equal(await f.coin(),before+banked.coin);
  assert.equal((await f.call('status')).weekly.rewardCount,1);
});

test('paused and owner-test modes gate new escort contracts and settlement',async t=>{
  const f=await escortFixture(t,false);
  for(const [mode,httpStatus,code] of [['OFF',503,'ESCORT_OFF'],['TEST',403,'ESCORT_OWNER_TEST']]){
    await f.setting('escort_operation_settings_v1840',{...defaultEscortSettings(),mode});
    assert.equal((await f.call('status',undefined,httpStatus)).code,code);
    assert.equal((await f.call('start',{contract:'RELIEF'},httpStatus)).code,code);
    assert.equal((await f.call('claim',{requestId:'no-claim'},httpStatus)).code,code);
  }
});
