import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {__idleDungeonTest} from '../functions/_idle_dungeon.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [server,client,index,admin,adminIndex]=await Promise.all([
  read('functions/_idle_dungeon.js'),
  read('js/idle-dungeon-v1600.js'),
  read('index.html'),
  read('admin/idle-dungeon-admin-v1600.js'),
  read('admin/index.html')
]);

const {DAILY_ACCOUNT_COIN_CAP,clean,compute}=__idleDungeonTest;
assert.equal(DAILY_ACCOUNT_COIN_CAP,200000000);
assert.match(server,/const DAILY_ACCOUNT_COIN_CAP=200000000;/);
assert.doesNotMatch(server,/const DAILY_ACCOUNT_COIN_CAP=(?:15000000|30000000);/);

const cfg=clean({
  configVersion:4,
  mode:'ON',
  maxOfflineHours:6,
  floorSeconds:5,
  minFloorSeconds:5,
  maxSpeedMultiplier:1,
  speedExponent:.65,
  combat:{hpMode:'POWER_SCALED',effectMode:'STORYBOOK',fixedBaseHp:1000000},
  difficulties:[
    {id:'NORMAL',name:'일반',index:1,maxFloor:100,requiredPowerStart:20000,requiredPowerEnd:130000,dailyCap:DAILY_ACCOUNT_COIN_CAP,monsterHpMultiplier:10},
    {id:'ABYSS',name:'심연',index:2,maxFloor:120,requiredPowerStart:80000,requiredPowerEnd:195000,dailyCap:750000,monsterHpMultiplier:15},
    {id:'DOOM',name:'종말',index:3,maxFloor:150,requiredPowerStart:130000,requiredPowerEnd:235000,dailyCap:1000000,monsterHpMultiplier:24}
  ]
});
assert.equal(cfg.difficulties[0].dailyCap,DAILY_ACCOUNT_COIN_CAP,'CMS 난이도 코인 기준값도 계정 2억 상한까지 저장되어야 한다');

const now=Date.parse('2026-09-05T03:00:00.000Z');
const progress={
  difficulty:'NORMAL',
  unlocked_difficulty:1,
  current_floor:1,
  highest_floor:0,
  run_started_at:new Date(now-8*3600000).toISOString(),
  last_settled_at:new Date(now-60000).toISOString(),
  pending_coin:17,
  daily_coin:DAILY_ACCOUNT_COIN_CAP,
  daily_key:'2026-09-05',
  total_resets:0
};
const atCap=compute(progress,cfg,1000000000,1,[],77,now);
assert.equal(atCap.earned,0,'2억 상한 뒤에는 코인을 더 지급하면 안 된다');
assert.equal(atCap.pending_coin,17);
assert.equal(atCap.daily_coin,DAILY_ACCOUNT_COIN_CAP);
assert.equal(atCap.capReached,true);
assert.equal(atCap.steps,12,'코인 상한 뒤에도 경과한 60초의 전투 진행은 계속되어야 한다');
assert.equal(atCap.current_floor,13);
assert.equal(Date.parse(atCap.last_settled_at),now,'코인 상한 뒤에도 정산 시각이 전진해야 한다');

const nearCap=compute({...progress,daily_coin:DAILY_ACCOUNT_COIN_CAP-5},cfg,1000000000,1,[],77,now);
assert.equal(nearCap.earned,5,'남은 상한까지만 코인을 지급해야 한다');
assert.equal(nearCap.daily_coin,DAILY_ACCOUNT_COIN_CAP);
assert.equal(nearCap.steps,12,'상한에 닿은 첫 클리어 뒤에도 원정 진행을 중단하면 안 된다');
assert.equal(nearCap.current_floor,13);

assert.match(server,/while\(steps<10000\)\{/);
assert.match(server,/const settlementEnd=persistedRunning\?now:/);
assert.match(server,/sessionActive:persistedRunning/);
assert.match(server,/coinCapReached:Boolean\(p\.capReached\)/);
assert.doesNotMatch(server,/IDLE_RUN_LIMIT_HOURS|IDLE_DAILY_CAP_REACHED|autoStopped|stopsAt/);

assert.match(client,/accountCap=Number\(state\.settings\.dailyAccountCoinCap\|\|p\.dailyCap\|\|200000000\)/);
assert.match(client,/오늘 상한 도달 · 원정 계속/);
assert.match(client,/상한 이후에는 코인만 다음날까지 멈춥니다/);
assert.match(client,/dailyCap:Number\(state\?\.settings\?\.dailyAccountCoinCap\|\|p\.dailyCap\|\|200000000\)/);
assert.doesNotMatch(client,/dailyCap:p\.dailyCap\|\|d\.dailyCap/);
assert.doesNotMatch(client,/최대 (?:150만|3,000만)/);

assert.match(admin,/configVersion:4/);
assert.doesNotMatch(admin,/configVersion:3/);
assert.match(admin,/최대 오프라인 정산 시간/);
assert.match(admin,/계정 일일 코인 상한 2억에 도달해도 자동 종료되지 않습니다/);
assert.match(admin,/누적시간 기준 코인량/);
assert.match(index,/idle-dungeon-v1600\.js\?v=2026-continuous-expedition/);
assert.match(adminIndex,/idle-dungeon-admin-v1600\.js\?v=2026-continuous-expedition/);

console.log('idle dungeon 200m continuous-run checks passed');
