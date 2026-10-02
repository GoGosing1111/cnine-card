// A round freezes this policy at formation. CMS edits affect future formations.
export const BATTLEFIELD_VERSION = 5;
export const BATTLEFIELD_DEFAULTS = Object.freeze({
  enabled:true,relayCapturePoints:20,relayWinPoints:4,relayLossPoints:1,relaySiegeBonusPercent:15,relayCaptureCharge:20,
  chargeMax:100,siegeWinCharge:3,siegeLossCharge:1,supportCharge:1,relayChargeBonus:2,
  supplyIntervalMinutes:15,supplyWindowMinutes:5,supplyGoal:20,supplyWinPoints:5,supplyLossPoints:1,supplyEnergy:3,supplyCaptureCharge:25,supplyBuffSeconds:180,supplySiegeBonusPercent:15,
  empSeconds:120,breachSeconds:180,breachDefenseReductionPercent:50,
  cannonWarningSeconds:30,cannonHpPercent:10,cannonCounterReductionPercent:50,cannonDisableSeconds:60
});
export const BATTLEFIELD_CONFIG_RANGES={relayCapturePoints:[5,100],relayWinPoints:[1,10],relayLossPoints:[0,5],relaySiegeBonusPercent:[0,30],relayCaptureCharge:[0,100],chargeMax:[20,1000],siegeWinCharge:[1,20],siegeLossCharge:[0,10],supportCharge:[0,10],relayChargeBonus:[0,10],supplyIntervalMinutes:[5,120],supplyWindowMinutes:[1,30],supplyGoal:[5,100],supplyWinPoints:[1,10],supplyLossPoints:[0,5],supplyEnergy:[1,5],supplyCaptureCharge:[0,100],supplyBuffSeconds:[30,600],supplySiegeBonusPercent:[0,30],empSeconds:[15,300],breachSeconds:[15,300],breachDefenseReductionPercent:[0,75],cannonWarningSeconds:[15,120],cannonHpPercent:[1,15],cannonCounterReductionPercent:[0,90],cannonDisableSeconds:[0,120]};
export function normalizeBattlefieldConfig(raw={},current=BATTLEFIELD_DEFAULTS){
  const out={...BATTLEFIELD_DEFAULTS};
  if(typeof current?.enabled==='boolean')out.enabled=current.enabled;
  for(const [key,[min,max]] of Object.entries(BATTLEFIELD_CONFIG_RANGES)){
    const n=Number(current?.[key]);if(current?.[key]!=null&&Number.isFinite(n))out[key]=Math.max(min,Math.min(max,Math.round(n)));
  }
  if(typeof raw?.enabled==='boolean')out.enabled=raw.enabled;
  for(const [key,[min,max]] of Object.entries(BATTLEFIELD_CONFIG_RANGES)){
    if(raw?.[key]==null||raw[key]==='')continue;
    const n=Number(raw[key]);if(Number.isFinite(n))out[key]=Math.max(min,Math.min(max,Math.round(n)));
  }
  out.supplyWindowMinutes=Math.min(out.supplyWindowMinutes,out.supplyIntervalMinutes-1);
  return out;
}
export const BATTLEFIELD_OBJECTIVES = Object.freeze({SIEGE:'전선 공성',RELAY:'중계탑 확보',SUPPLY:'보급열차 호위'});
export function battlefieldObjectives(value='SIEGE'){
  const code=String(value).toUpperCase();return BATTLEFIELD_OBJECTIVES[code]?code:null;
}
export function supplyWindow(startedAt,config,now=Date.now()){
  const start=typeof startedAt==='number'?startedAt:Date.parse(String(startedAt||'').includes('T')?startedAt:String(startedAt||'').replace(' ','T')+'Z');
  if(!Number.isFinite(start)||now<start)return{cycle:0,active:false,startsAt:0,endsAt:0,nextAt:Number.isFinite(start)?start:0};
  const interval=config.supplyIntervalMinutes*60000,cycle=Math.floor((now-start)/interval)+1,startsAt=start+(cycle-1)*interval,endsAt=startsAt+config.supplyWindowMinutes*60000;
  return{cycle,active:now<endsAt,startsAt,endsAt,nextAt:startsAt+interval};
}
export function battlefieldSkillCatalog(config=BATTLEFIELD_DEFAULTS){
  const asset='assets/ui/territory-war/battlefield-v5/battlefield-panorama-1600.webp';
  return{
    EMP_PULSE:{name:'EMP 파동',icon:'09',category:'CONTROL',summary:'중계탑 점령 스킬 · 적 시설 '+config.empSeconds+'초 정지',description:'중계탑 확보 진영만 사용합니다. 적 시설 버프·추가 충전·공성포 발사 준비를 차단하며 예약된 포격은 유지됩니다.',counter:'ENGINEER',cooldownMinutes:45,asset:'assets/ui/territory-war/battlefield-v5/relay-640.webp'},
    WALL_BREAKER:{name:'성벽 파쇄탄',icon:'10',category:'OFFENSE',summary:'철벽 피해 감소 효과 '+config.breachDefenseReductionPercent+'% 약화',description:config.breachSeconds+'초간 개인 공성 공격에 적용합니다. 기존 방어 작전을 제거하지 않습니다.',counter:'IRON_WALL',cooldownMinutes:45,asset},
    ENGINEER:{name:'공병 투입',icon:'11',category:'SUPPORT',summary:'아군 시설 즉시 복구',description:'EMP 또는 공성포 착탄으로 정지된 아군 시설을 재가동합니다.',counter:'EMP_PULSE',cooldownMinutes:45,asset},
    SIEGE_CANNON:{name:'거대 공성포',icon:'12',category:'ULTIMATE',summary:'전력 '+config.chargeMax+' · 적 최대 HP '+config.cannonHpPercent+'%',description:config.cannonWarningSeconds+'초 예고 후 발사합니다. 적 대포병 반격으로 피해가 감소하며 거점 점령은 개인 교전으로 확정합니다.',counter:'COUNTER_BATTERY',cooldownMinutes:45,asset:'assets/ui/territory-war/battlefield-v5/cannon-640.webp'}
  };
}
export function battlefieldIronWallMultiplier(reductionPercent,breachUntil,config,now=Date.now()){
  const weakened=Number(breachUntil)>now?1-config.breachDefenseReductionPercent/100:1;
  return 1-Math.max(0,Math.min(100,Number(reductionPercent)||0))*weakened/100;
}
export function battlefieldSiegeMultiplier(context,side,now=Date.now()){
  if(!context?.enabled)return 1;
  const own=side==='A'?'a':'b',data=context.data,config=context.config;
  if(Number(data?.['emp_'+own+'_until_ms'])>now)return 1;
  return (data?.relay_owner===side?100+config.relaySiegeBonusPercent:100)*(Number(data?.['supply_'+own+'_until_ms'])>now?100+config.supplySiegeBonusPercent:100)/10000;
}
