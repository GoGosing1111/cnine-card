import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {WEEKLY_RAID_BOSSES_V1,weeklyRaidBossForKst,weeklyRaidBossSettings} from '../functions/_raid_weekly_bosses_v1.js';
import {RAID_COIN_REWARD_CAP_V2140,cleanRaidSettingsV1293,defaultRaidSettingsV1293,raidCombatSnapshotV1293,raidRewardPlanV1293} from '../functions/_raid_overhaul.js';

const root=path.resolve('.');
const local=webPath=>path.join(root,String(webPath).replace(/^\//,''));
const text=file=>fs.readFile(path.join(root,file),'utf8');

test('요일별 보스는 7일을 정확히 한 번씩 사용하고 하시라마급 전투력을 넘긴다',()=>{
  assert.equal(WEEKLY_RAID_BOSSES_V1.length,7);
  assert.deepEqual(WEEKLY_RAID_BOSSES_V1.map(x=>x.weekday).sort(),[0,1,2,3,4,5,6]);
  assert.equal(new Set(WEEKLY_RAID_BOSSES_V1.map(x=>x.code)).size,7);
  assert.equal(new Set(WEEKLY_RAID_BOSSES_V1.map(x=>x.ultimate.code)).size,7);
  for(const boss of WEEKLY_RAID_BOSSES_V1){assert.ok(boss.powerRating>=5_500_000,boss.name);assert.equal(boss.minions.length,2,boss.name);assert.ok(boss.rewards.clear.some(x=>x.type==='CORE_RAID_ENTRY_TICKET'),boss.name);}
  assert.equal(weeklyRaidBossForKst(Date.parse('2026-09-21T12:00:00+09:00')).name,'나가토');
  assert.equal(weeklyRaidBossForKst(Date.parse('2026-09-25T12:00:00+09:00')).name,'이치고');
});

test('신규 보스 SD는 투명 RGBA와 경량 768 WebP를 함께 제공하고 나가토 V2만 연결한다',async()=>{
  const expected=['nagato-sd-v2.png','yoriichi-sd-v1.png','ichigo-sd-v1.png'];
  for(const name of expected){const meta=await sharp(path.join(root,'assets/ui/project-v/monsters/weekly-raid-v1',name)).metadata();assert.equal(meta.hasAlpha,true,name);assert.ok(meta.width>=1024&&meta.height>=1024,name);}
  for(const boss of WEEKLY_RAID_BOSSES_V1){await fs.access(local(boss.battleSprite));for(const add of boss.minions)await fs.access(local(add.sprite));}
  const nagato=WEEKLY_RAID_BOSSES_V1.find(x=>x.code==='NAGATO');assert.match(nagato.battleSprite,/nagato-sd-v2-768\.webp$/);assert.doesNotMatch(nagato.battleSprite,/nagato-sd-v1/);
});

test('보스별 궁극기는 개별 12프레임 Pixi atlas이고 런타임은 Sprite 시퀀스와 GSAP을 사용한다',async()=>{
  for(const boss of WEEKLY_RAID_BOSSES_V1){const atlas=JSON.parse(await fs.readFile(local(boss.ultimate.atlas),'utf8')),frames=Object.keys(atlas.frames||{}).filter(name=>name.startsWith(boss.ultimate.framePrefix));assert.equal(frames.length,12,boss.name);}
  const runtime=await text('js/raid-weekly-boss-fx-v1.src.js');assert.match(runtime,/new Sprite\(frames\[0\]\)/);assert.match(runtime,/sprite\.texture=frames\[/);assert.match(runtime,/gsap\.timeline/);assert.match(runtime,/powerPreference:'low-power'/);assert.doesNotMatch(runtime,/Audio|Oscillator|createOscillator/);
});

test('쫄몹은 서버 타임라인에서 보스 피해를 차단하고 궁극기는 서버 공격 틱으로 확정된다',()=>{
  const boss=WEEKLY_RAID_BOSSES_V1.find(x=>x.code==='NAGATO'),cfg=weeklyRaidBossSettings({...defaultRaidSettingsV1293(),battleSeconds:120,bossAttackPower:1000,bossAttackIntervalMs:5000,deckHpMultiplier:20},boss),instance={status:'BATTLE',starts_at:'2026-09-21T00:00:00.000Z',ends_at:'2026-09-21T00:02:00.000Z',max_hp:boss.maxHp};
  const early=raidCombatSnapshotV1293([{userId:1,totalPower:10_000_000,totalDamage:120_000_000}],instance,cfg,Date.parse('2026-09-21T00:00:05.000Z'));
  assert.equal(early.minions[0].spawned,true);assert.ok(early.minions[0].currentHp<early.minions[0].maxHp);assert.equal(early.bossDamageReduction,.65);assert.equal(early.ultimateCasts,0);
  const later=raidCombatSnapshotV1293([{userId:1,totalPower:10_000_000,totalDamage:240_000_000}],instance,cfg,Date.parse('2026-09-21T00:00:26.000Z'));
  assert.equal(later.ultimateCasts,1);assert.equal(later.lastUltimate.name,'초신성 천도');assert.ok(later.minionsDefeated>=1);
});

test('보스별 보상 스냅샷은 분리되고 코인 항목은 100억까지 허용한다',()=>{
  const boss=WEEKLY_RAID_BOSSES_V1.find(x=>x.code==='GILGAMESH'),cfg=weeklyRaidBossSettings(defaultRaidSettingsV1293(),boss),plan=raidRewardPlanV1293({cfg,instanceId:77,userId:9,totalDamage:40_000_000,finalRank:1,cleared:true,minionsDefeated:2});
  assert.ok(plan.inventoryRewards.some(x=>x.itemCode==='CORE_RAID_ENTRY_TICKET'));assert.ok(plan.entries.some(x=>x.source.includes('쫄몹 2기')));
  const capped=cleanRaidSettingsV1293({rewards:{participation:[{type:'COIN',amount:RAID_COIN_REWARD_CAP_V2140+1}],clear:[],minionClear:[],damageMilestones:[],rankRewards:[],rareDrops:[]}});assert.equal(capped.rewards.participation[0].amount,RAID_COIN_REWARD_CAP_V2140);
});

test('요일 로스터 조회와 라이브 패치는 N+1 재조회·전체 리렌더를 피한다',async()=>{
  const [api,app,css]=await Promise.all([text('functions/api/[[path]].js'),text('js/app.js'),text('css/raid-weekly-bosses-v2140.css')]);
  assert.match(api,/name IN \(\$\{marks\}\)/);assert.match(api,/raidMemo\('weekly-bosses-v2140',30000/);assert.match(app,/function patchRaidLiveView/);assert.match(app,/data-raid-minion/);assert.match(app,/replayRaidUltimate/);assert.match(css,/@media\(max-width:520px\)/);
  assert.match(api,/weeklyProfile=weeklyRaidBossByName\(boss\.name\),roomCfg=weeklyProfile\?weeklyRaidBossSettings\(cfg,weeklyProfile\):cfg/);
});
