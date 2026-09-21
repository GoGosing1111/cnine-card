import {WEEKLY_RAID_BOSSES_V1,WEEKLY_RAID_ROTATION_V1,WEEKLY_RAID_DAY_LABELS,WEEKLY_RAID_SETTINGS_KEY,ensureWeeklyRaidBossesV1} from './_raid_weekly_bosses_v1.js';
import {cleanRaidSettingsV1293,RAID_COIN_REWARD_CAP_V2140} from './_raid_overhaul.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const codes=WEEKLY_RAID_BOSSES_V1.map(boss=>boss.code);
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const number=(value,fallback,min,max,integer=false)=>{
  const n=value===undefined?fallback:Number(value);
  if(value===null||value===''||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))fail(`레이드 설정값은 ${min}~${max}${integer?' 사이 정수':' 범위'}여야 합니다.`);
  return n;
};
function rewardSettings(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('보상 설정이 올바르지 않습니다.');
  const clean=cleanRaidSettingsV1293({rewards:raw}).rewards;
  for(const key of ['participation','clear','minionClear','rareDrops','damageMilestones','rankRewards']){
    if(!Array.isArray(raw[key])||raw[key].length>20)fail('보상 목록은 종류별 20개 이하로 입력하세요.');
  }
  const types=new Set(['COIN','CARD_SHARD','PREMIUM_CUBE','EQUIPMENT_SUPPLY_BOX','MAGIC_CARD_PACK','MASTER_STAR','CORE_RAID_ENTRY_TICKET']);
  const items=[...raw.participation,...raw.clear,...raw.minionClear,...raw.rareDrops,...raw.damageMilestones.flatMap(x=>x.rewards||[]),...raw.rankRewards.flatMap(x=>x.rewards||[])];
  for(const item of items){
    if(!types.has(item?.type))fail('지원하지 않는 레이드 보상입니다.');
    number(item.amount,0,1,item.type==='COIN'?RAID_COIN_REWARD_CAP_V2140:1_000_000,true);
    if('chance' in item)number(item.chance,0,0,100);
  }
  for(const row of raw.damageMilestones){number(row.damage,0,1,2_000_000_000,true);if(!Array.isArray(row.rewards)||row.rewards.length>20)fail('누적 피해 보상 목록이 올바르지 않습니다.');}
  for(const row of raw.rankRewards){number(row.from,0,1,1000,true);number(row.to,0,row.from,1000,true);if(!Array.isArray(row.rewards)||row.rewards.length>20)fail('순위 보상 목록이 올바르지 않습니다.');}
  const bands=[...raw.rankRewards].sort((a,b)=>a.from-b.from);
  if(bands.some((b,i)=>i&&b.from<=bands[i-1].to))fail('최종 순위 보상 구간이 겹칩니다.');
  if(new Set(raw.damageMilestones.map(row=>row.damage)).size!==raw.damageMilestones.length)fail('누적 피해 보상 기준값이 중복되었습니다.');
  return clean;
}
export function normalizeWeeklyRaidConfig(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('주간 레이드 설정이 올바르지 않습니다.');
  const rotation=raw.rotation===undefined?[...WEEKLY_RAID_ROTATION_V1]:raw.rotation;
  if(!Array.isArray(rotation)||rotation.length!==7||rotation.some(code=>!codes.includes(code))||new Set(rotation).size!==3)fail('7일 로테이션에는 나가토·요리이치·이치고 3종만 모두 배치해야 합니다.');
  if(raw.bosses&&Object.keys(raw.bosses).some(code=>!codes.includes(code)))fail('허용되지 않은 레이드 보스입니다.');
  const bosses={};
  for(const base of WEEKLY_RAID_BOSSES_V1){
    const row=raw.bosses?.[base.code]||{};
    if(row.minions!==undefined&&(!Array.isArray(row.minions)||row.minions.length!==2))fail('보스별 쫄몹은 2종입니다.');
    bosses[base.code]={
      powerRating:number(row.powerRating,base.powerRating,1,2_000_000_000,true),
      bossAttackPower:number(row.bossAttackPower,Math.floor(base.powerRating/2300),1,100_000_000,true),
      bossAttackIntervalMs:number(row.bossAttackIntervalMs,5000,500,60000,true),
      minionGuardRatio:number(row.minionGuardRatio,.65,0,.95),
      ultimate:{everyAttacks:number(row.ultimate?.everyAttacks,base.ultimate.everyAttacks,2,20,true),multiplier:number(row.ultimate?.multiplier,base.ultimate.multiplier,1,10)},
      minions:base.minions.map((minion,i)=>({maxHp:number(row.minions?.[i]?.maxHp,minion.maxHp,1,2_000_000_000,true),spawnAtHpPct:number(row.minions?.[i]?.spawnAtHpPct,minion.spawnAtHpPct,.05,1)})),
      rewards:rewardSettings(row.rewards===undefined?clone(base.rewards):row.rewards)
    };
  }
  return {revision:String(raw.revision||'0'),rotation:[...rotation],bosses};
}
export async function readWeeklyRaidCms(env){
  await ensureWeeklyRaidBossesV1(env);
  const names=WEEKLY_RAID_BOSSES_V1.map(row=>row.name),marks=names.map(()=>'?').join(',');
  const [stored,result]=await Promise.all([
    env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WEEKLY_RAID_SETTINGS_KEY).first(),
    env.DB.prepare(`SELECT id,name,image_url AS image,max_hp AS maxHp,defense_rate AS defenseRate,is_active AS isActive FROM raid_bosses WHERE name IN (${marks}) ORDER BY id`).bind(...names).all()
  ]);
  const config=normalizeWeeklyRaidConfig(JSON.parse(stored?.value||'{}'));
  const bosses=WEEKLY_RAID_BOSSES_V1.map(base=>{
    const row=result.results.find(row=>row.name===base.name),tuning=config.bosses[base.code];
    return {...clone(base),...tuning,...row,image:row?.image||base.sourceArt,isActive:Number(row?.isActive)===1,
      ultimate:{...base.ultimate,...tuning.ultimate},minions:base.minions.map((minion,i)=>({...minion,...tuning.minions[i]}))};
  });
  const days=config.rotation.map((code,weekday)=>({...bosses.find(boss=>boss.code===code),weekday,dayLabel:WEEKLY_RAID_DAY_LABELS[weekday]}));
  return {config,bosses,days};
}
export async function saveWeeklyRaidCms(env,admin,draft){
  if(admin?.role!=='OWNER')throw Object.assign(new Error('레이드 관리는 OWNER 전용입니다.'),{status:403});
  if(!draft?.rotation||!draft?.bosses||codes.some(code=>!draft.bosses[code]))fail('요일 배치와 보스 3종 설정을 모두 전송하세요.');
  const clean=normalizeWeeklyRaidConfig(draft);
  await ensureWeeklyRaidBossesV1(env);
  const stored=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WEEKLY_RAID_SETTINGS_KEY).first();
  const before=normalizeWeeklyRaidConfig(JSON.parse(stored?.value||'{}'));
  if(clean.revision!==before.revision)throw Object.assign(new Error('다른 창에서 레이드 설정을 수정했습니다. 새로고침 후 다시 저장하세요.'),{status:409});
  clean.revision=crypto.randomUUID();
  const next=JSON.stringify(clean),guard='EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
  const result=await env.DB.batch([
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(next,WEEKLY_RAID_SETTINGS_KEY,stored.value),
    env.DB.prepare(`INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,'RAID_WEEKLY_UPDATE','SETTINGS',?,?,? WHERE ${guard}`).bind(admin.id,WEEKLY_RAID_SETTINGS_KEY,JSON.stringify(before),next,WEEKLY_RAID_SETTINGS_KEY,next)
  ]);
  if(Number(result[0]?.meta?.changes)!==1)throw Object.assign(new Error('레이드 설정이 변경되었습니다. 새로고침 후 다시 저장하세요.'),{status:409});
  return readWeeklyRaidCms(env);
}
