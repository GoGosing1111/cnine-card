// User-approved on 2026-09-06: normal Battle Suit shot x2.5 / x5, every 3s / 15s.
// A new scheduler is created for every fight; inventory is never consumed by firing.
export const SKILL_CHIP_MAX_SLOTS=3;
export const SKILL_CHIP_RUNTIME_ENABLED=true;
export const SKILL_CHIP_BALANCE_STATUS=null;
export const SKILL_CHIP_CLOCK='V3_COMBAT_MS_V1';
export const SKILL_CHIP_CATALOG=Object.freeze([
  Object.freeze({code:'SKILL_CHIP_ROCKET_LAUNCHER',name:'로켓런처',effectKey:'missile',damageMultiplier:2.5,intervalMs:3000,impactOffsetsMs:Object.freeze([360]),effectDurationMs:2250,image:'/assets/ui/project-v/skill-chips/rocket-launcher-v1.webp',description:'3초마다 배틀슈트 1발 피해의 2.5배로 대상 발끝에서 폭발합니다.',sortOrder:10}),
  Object.freeze({code:'SKILL_CHIP_HELICOPTER_AIRSTRIKE',name:'헬기폭격',effectKey:'airstrike',damageMultiplier:5,intervalMs:15000,impactOffsetsMs:Object.freeze([610,830,1050,1270]),effectDurationMs:3600,image:'/assets/ui/project-v/skill-chips/helicopter-airstrike-v1.webp',description:'15초마다 배틀슈트 1발 피해의 총 5배를 4회 폭격으로 나눠 가합니다.',sortOrder:20})
]);
export function skillChipByCode(code){return SKILL_CHIP_CATALOG.find(chip=>chip.code===code)||null;}
export function skillChipDamage(baseDamage,code){
  const chip=skillChipByCode(code);
  if(!chip)throw new RangeError('등록되지 않은 스킬칩입니다.');
  if(!Number.isSafeInteger(baseDamage)||baseDamage<0)throw new RangeError('기준 피해는 0 이상의 안전한 정수여야 합니다.');
  const damage=Math.round(baseDamage*chip.damageMultiplier);
  if(!Number.isSafeInteger(damage))throw new RangeError('스킬칩 피해가 안전한 정수 범위를 초과했습니다.');
  return damage;
}

export function normalizeSkillChipCodes(codes){
  return [...new Set((Array.isArray(codes)?codes:[]).filter(code=>typeof code==='string'&&skillChipByCode(code)))].slice(0,SKILL_CHIP_MAX_SLOTS);
}
export function splitSkillChipDamage(damage,count){
  if(!Number.isSafeInteger(damage)||damage<0||!Number.isInteger(count)||count<1||count>8)throw new RangeError('Invalid skill-chip damage split');
  return Array.from({length:count},(_,i)=>Math.floor(damage/count)+(i<damage%count?1:0));
}
export function createSkillChipSchedule(codes){
  const entries=normalizeSkillChipCodes(codes).map(code=>({chip:skillChipByCode(code),activation:0}));
  return {
    peek(){return entries.map(entry=>({...entry,atMs:(entry.activation+1)*entry.chip.intervalMs})).sort((a,b)=>a.atMs-b.atMs||a.chip.sortOrder-b.chip.sortOrder)[0]||null;},
    take(){const next=this.peek();if(next)entries.find(entry=>entry.chip.code===next.chip.code).activation++;return next?{...next,activation:next.activation+1}:null;}
  };
}

// Canonical 1x V3 presentation budgets, separate from the legacy speed-gauge clock.
// These describe the existing authored animations at their base 1.3 playback scale.
// Replaying faster only scales this clock, never the server's cast count or damage.
export function skillChipCombatEventMs(event,{apocalypseBoss=false}={}){
  const type=String(event?.type||'').toUpperCase();
  if(type==='TURN'&&event.actorKind==='BATTLE_SUIT')return 0;
  const ms=seconds=>Math.ceil(seconds/1.3*1000)+8;
  const damage=Number(event?.damage||0)+Number(event?.absorbed||0);
  const advancement=String(event.advancementClass||event.classCode||'');
  if(type==='DEPLOY')return ms(.6);
  if(type==='TURN'||type==='ATTACK'||type==='COUNTER'){
    if(event.dodge)return ms(.92+(advancement==='AFTERIMAGE'?.62:0));
    return ms(advancement==='SHATTER'?.982:advancement==='RIPOSTE'?1.044:.73);
  }
  if(type==='ESCORT_OBJECTIVE_ATTACK')return ms(.78);
  if(type==='SKILL'||type==='ULTIMATE'||type==='PVE_ULTIMATE')return ms(.9);
  if(type==='BOSS_ULTIMATE')return ms(event.apocalypse||apocalypseBoss?1.16:.92+(event.hits?.length||1)*.73);
  if(type==='MAGIC_CARD')return ms(damage>0?.9:(event.amount||event.healing?1.37:.92));
  if(type==='ADVANCEMENT'||type==='ADVANCEMENT_SEALED')return advancement==='IMMORTAL'?ms(1.87):0;
  if(type==='ADVANCEMENT_BLOCKED'||type==='ESCORT_OBJECTIVE_RECOVERY')return ms(.92);
  if(['TEAM_HEAL','REGEN','EMERGENCY_HEAL','SURVIVE','INDOMITABLE','SINGLE_HEALER_AURA'].includes(type))return ms(1.37);
  return 0;
}
