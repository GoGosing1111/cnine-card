import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {defaultEscortSettings,cleanEscortSettings,finalizeEscortObjectiveTimeline} from '../functions/_escort_operation.js';
import {buildFighter,createPveBattleV2} from '../functions/_battle_v2_preview.js';

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
  assert.match(client,/4–6 MIN MISSION/);
  assert.doesNotMatch(client,/localOwner/);
  assert.match(client,/공개 콘텐츠 탭은 일시적인 API\/DB 오류로 사라지지 않는다/);
  assert.match(client,/TACTICAL BUFFER/);
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
  assert.match(adminIndex,/escort-operation-admin-v1830\.js\?v=1843-public-launch/);
  assert.match(migration,/pve_escort_action_receipts_v1830/);
  assert.match(cleanup,/escort_receipts/);
  assert.match(app,/project-v-pixi-battle\.bundle\.js\?v=66-boss-barrage/);
  assert.match(app,/battle-v3-live\.js\?v=3\.20\.0-escort-hp-gauge/);
  assert.match(index,/app\.js\?v=1844-escort-public-mobile/);
  assert.match(index,/escort-operation-v1830\.js\?v=1844-escort-public-mobile/);
  assert.match(index,/escort-operation-v1830\.css\?v=1844-public-mobile-fit/);
  assert.match(index,/soopketmon-v21-exact-shell-adapter\.js\?v=21\.9\.1-escort-mobile/);
  assert.match(index,/soopketmon-v21-runtime-router\.js\?v=1\.1\.0-escort-route/);
  assert.match(sw,/soop-card-shell-v1844-escort-public-mobile/);
  assert.match(sw,/\['script','style','worker'\]\.includes\(request\.destination\)[\s\S]*?networkFirst\(request,SHELL_CACHE\)/);
  assert.doesNotMatch(headers,/\/(?:js|css|preview)\/\*[\s\S]{0,100}?immutable/);
  assert.equal((headers.match(/Cache-Control: public, max-age=0, must-revalidate/g)||[]).length>=3,true);
  assert.match(style,/#pveEscortView \.escort-v1833-tactic-card/);
  assert.match(style,/grid-template-columns:34px minmax\(104px,136px\) minmax\(0,1fr\) 18px!important/);
  assert.match(style,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(router,/escort:\s*\{ shell: 'battle', actions: \[\{ selector: '\[data-pve-mode="escort"\]'/);
  assert.match(adapter,/escort:\s*\['호송작전', '전투·경쟁', 'swords'\]/);
  assert.match(adapter,/routes: \['battle', 'deck', 'hunt', 'raid', 'escort'/);
  assert.match(integrationStyle,/padding: 14px 12px max\(24px, env\(safe-area-inset-bottom\)\)/);
});

test('호송 이미지 리소스는 런타임 예산 안으로 압축됐다',async()=>{
  const background=await stat(new URL('../assets/ui/escort/escort-fortress-route-bg-v1.webp',import.meta.url));
  const vehicle=await stat(new URL('../assets/ui/escort/escort-armored-carrier-v1.webp',import.meta.url));
  const tacticIcons=await Promise.all(['field-repair','aegis-barrier','carpet-strike','core-overdrive','signal-jammer'].map(name=>stat(new URL(`../assets/ui/escort/tactics/tactic-${name}-v1835.webp`,import.meta.url))));
  assert.ok(background.size<180_000,`background ${background.size}`);
  assert.ok(vehicle.size<230_000,`vehicle ${vehicle.size}`);
  tacticIcons.forEach(icon=>assert.ok(icon.size<50_000,`tactic icon ${icon.size}`));
});
