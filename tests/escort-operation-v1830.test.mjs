import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {defaultEscortSettings,cleanEscortSettings} from '../functions/_escort_operation.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('호송작전은 5구간과 OWNER TEST를 기본 계약으로 사용한다',()=>{
  const settings=defaultEscortSettings();
  assert.equal(settings.mode,'TEST');
  assert.equal(settings.sectors.length,5);
  assert.deepEqual(settings.sectors.map(sector=>sector.key),['DEPARTURE','AMBUSH','BLOCKADE','REPAIR','FINAL_BOSS']);
  assert.equal(settings.sectors.at(-1).isBoss,true);
  assert.equal(cleanEscortSettings({mode:'INVALID'}).mode,'TEST');
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

test('API·V3·클라이언트·CMS 연결 계약이 함께 존재한다',async()=>{
  const [handler,worker,app,client,engine,wrapper,admin,adminIndex,migration,cleanup,index,sw]=await Promise.all([
    read('functions/_escort_operation.js'),read('functions/api/[[path]].js'),read('js/app.js'),read('js/escort-operation-v1830.js'),
    read('preview/project-v-v3/source/battle/BattleEngine.js'),read('js/battle-v3-live.js'),read('admin/escort-operation-admin-v1830.js'),
    read('admin/index.html'),read('database/migrations/0084_v1830_escort_operation.sql'),read('functions/_storage_cleanup.js'),read('index.html'),read('service-worker.js')
  ]);
  assert.match(worker,/handleEscortOperation/);
  assert.match(worker,/'escort\/fight'/);
  assert.match(handler,/cfg\.mode==='TEST'&&!isOwner\(user\)/);
  assert.match(handler,/env\.DB\.execSchema\(statements\)/);
  assert.match(handler,/env\.DB\?\.dialect==='postgres'/);
  assert.match(handler,/response_json/);
  assert.match(handler,/WHERE \$\{RECEIPT_TABLE\}\.user_id=excluded\.user_id/);
  assert.doesNotMatch(handler,/INSERT INTO[^`'\n]*timeline/i);
  assert.match(app,/data-pve-mode="escort"/);
  assert.match(app,/CNineEscortBridge/);
  assert.match(client,/ProjectVBattleV3Live\.createRenderer/);
  assert.match(client,/4–6 MIN MISSION/);
  assert.match(client,/localOwner/);
  assert.match(client,/OWNER 테스트 탭은 일시적인 API\/DB 오류로 사라지지 않는다/);
  assert.match(engine,/ESCORT:'.*escort-fortress-route-bg-v1\.webp/);
  assert.match(engine,/async setObjective/);
  assert.match(wrapper,/철벽 호송작전/);
  assert.match(admin,/admin\/escort\/settings/);
  assert.match(adminIndex,/escort-operation-admin-v1830\.js\?v=1830-owner-test/);
  assert.match(migration,/pve_escort_action_receipts_v1830/);
  assert.match(cleanup,/escort_receipts/);
  assert.match(index,/escort-operation-v1830\.js\?v=1831-owner-tab/);
  assert.match(sw,/soop-card-shell-v1831-escort-owner-tab/);
});

test('호송 이미지 리소스는 런타임 예산 안으로 압축됐다',async()=>{
  const background=await stat(new URL('../assets/ui/escort/escort-fortress-route-bg-v1.webp',import.meta.url));
  const vehicle=await stat(new URL('../assets/ui/escort/escort-armored-carrier-v1.webp',import.meta.url));
  assert.ok(background.size<180_000,`background ${background.size}`);
  assert.ok(vehicle.size<230_000,`vehicle ${vehicle.size}`);
});
