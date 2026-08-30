import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BURNING_EVENT_DEFAULT_DURATION_MINUTES,
  BURNING_EVENT_DURATION_MINUTES,
  BURNING_EVENT_OPERATOR_NICKNAME,
  burningEventEndsAt,
  burningEventIsLive,
  canManageBurningEvent,
  isBurningEventDurationMinutes,
  normalizeBurningEventDurationMinutes
} from '../functions/_burning_event_access.js';

const root=path.resolve(import.meta.dirname,'..');
const text=file=>readFile(path.join(root,file),'utf8');

test('버닝 운영자는 정확한 OWNER 핑크빛유두 계정 한 명뿐이다',()=>{
  assert.equal(BURNING_EVENT_OPERATOR_NICKNAME,'핑크빛유두');
  assert.equal(canManageBurningEvent({role:'OWNER',nickname:'핑크빛유두'}),true);
  assert.equal(canManageBurningEvent({role:'owner',nickname:'핑크빛유두'}),true);
  for(const user of [
    {role:'USER',nickname:'핑크빛유두'},
    {role:'ADMIN',nickname:'핑크빛유두'},
    {role:'EVENT_MANAGER',nickname:'핑크빛유두'},
    {role:'OWNER',nickname:'다른계정'},
    {role:'OWNER',nickname:' 핑크빛유두'},
    {role:'OWNER',nickname:'핑크빛유두 '},
    {role:'OWNER',nickname:'핑크빛유두님'},
    {role:'OWNER',nickname:'핑크빛\u200b유두'},
    {role:'OWNER',nickname:'핑크빛유두'.normalize('NFD')}
  ])assert.equal(canManageBurningEvent(user),false,JSON.stringify(user));
});

test('버닝 진행 시간은 30분·1시간·2시간만 허용한다',()=>{
  assert.deepEqual([...BURNING_EVENT_DURATION_MINUTES],[30,60,120]);
  assert.equal(BURNING_EVENT_DEFAULT_DURATION_MINUTES,60);
  for(const duration of [30,60,120]){
    assert.equal(isBurningEventDurationMinutes(duration),true);
    assert.equal(normalizeBurningEventDurationMinutes(String(duration)),duration);
  }
  for(const duration of [null,0,29,30.5,31,59,61,121,180,NaN,'']){
    assert.equal(isBurningEventDurationMinutes(duration),false,String(duration));
    assert.equal(normalizeBurningEventDurationMinutes(duration),60,String(duration));
  }
});

test('종료 시각은 서버 시작 시각에서 정확히 선택 시간 뒤로 계산된다',()=>{
  const start='2026-08-29T00:00:00.000Z',startMs=Date.parse(start);
  for(const duration of BURNING_EVENT_DURATION_MINUTES){
    const end=burningEventEndsAt(start,duration);
    assert.equal(Date.parse(end)-startMs,duration*60_000);
  }
  assert.throws(()=>burningEventEndsAt(start,31),RangeError);
  assert.throws(()=>burningEventEndsAt('invalid',60),TypeError);
});

test('정확한 종료 경계부터 버닝은 비활성이다',()=>{
  const settings={enabled:true,endsAt:'2026-08-29T01:00:00.000Z'};
  assert.equal(burningEventIsLive(settings,Date.parse('2026-08-29T00:59:59.999Z')),true);
  assert.equal(burningEventIsLive(settings,Date.parse(settings.endsAt)),false);
  assert.equal(burningEventIsLive({...settings,enabled:false},Date.parse('2026-08-29T00:00:00.000Z')),false);
  assert.equal(burningEventIsLive({enabled:true,endsAt:null},Date.parse('2026-08-29T00:00:00.000Z')),false);
});

test('서버는 전용 계정·허용 시간·서버 계산 종료 시각·상호 배제를 강제한다',async()=>{
  const api=await text('functions/api/[[path]].js');
  assert.match(api,/if\(!canManageBurningEvent\(admin\)\)return json\(\{error:'버닝·하이퍼 버닝 관리는 OWNER 핑크빛유두 계정 전용입니다\.'/);
  assert.match(api,/code:'INVALID_BURNING_DURATION'/);
  assert.match(api,/endsAt:activated\?burningEventEndsAt\(changedAt,durationMinutes\):null/);
  assert.match(api,/shouldDisableOther=activated/);
  assert.match(api,/enabled:false,endsAt:null,updatedAt:changedAt/);
  assert.match(api,/cleanBurningEventPair\(burningEventCache\.value\)/);
  assert.match(api,/serverNow:new Date\(\)\.toISOString\(\)/);
});

test('족장은 예전 기준의 일반·하이퍼 버닝 권한을 사용한다',async()=>{
  const [chiefApi,chiefUi,chiefAdmin]=await Promise.all([text('functions/_chief.js'),text('js/chief-system-v1.js'),text('admin/chief-admin-v1.js')]);
  assert.match(chiefApi,/burningControl:'CHIEF_FULL'/);
  assert.match(chiefApi,/u\.burningToday>=2/);
  assert.match(chiefApi,/u\.hyperToday>=1/);
  assert.match(chiefApi,/type!=='BURNING'&&type!=='HYPER'&&type!=='TOWER_RESET'/);
  assert.match(chiefUi,/powerButton\('HYPER'/);
  assert.match(chiefUi,/powerButton\('BURNING'/);
  assert.match(chiefUi,/매일 3시간 버닝 2회/);
  assert.match(chiefAdmin,/오늘 족장 버닝/);
  assert.match(chiefAdmin,/오늘 족장 하이퍼/);
});

test('CMS와 게임 HUD는 선택 시간 및 초 단위 카운트다운 계약을 사용한다',async()=>{
  const [admin,adminShell,app,equipment,index,worker]=await Promise.all([
    text('admin/burning-admin.js'),text('admin/admin-v1276.js'),text('js/app.js'),text('functions/_equipment.js'),text('index.html'),text('service-worker.js')
  ]);
  assert.match(admin,/const ALLOWED_DURATIONS=Object\.freeze\(\[30,60,120\]\)/);
  assert.match(admin,/id="\$\{prefix\}DurationMinutes"/);
  assert.match(admin,/role==='OWNER'&&nickname===OPERATOR_NICKNAME/);
  assert.match(admin,/setInterval\(updateCountdownUi,1000\)/);
  assert.match(adminShell,/soop:cms-identity/);
  assert.match(app,/function burningEventIsActive\(state=burningEventState\)/);
  assert.match(app,/data-burning-countdown/);
  assert.match(app,/setInterval\(syncBurningCountdownUi,1000\)/);
  assert.match(app,/syncBurningServerClock\(d\.serverNow\)/);
  assert.match(equipment,/burningEventIsLive\(hyper,now\)/);
  assert.match(index,/js\/app\.js\?v=1935-battlefield-unique-fix/);
  assert.match(index,/js\/chief-system-v1\.js\?v=1919-chief-powers-restored/);
  assert.match(worker,/soop-card-shell-v1935-battlefield-unique-fix/);
});
