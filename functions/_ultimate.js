export const ULTIMATE_ALLOWED_GRADES=Object.freeze(['C','U','R','SR','HR','UR','SSR','MA','LIMITED','PRESTIGE','FUR','ZENITH']);

const ULTIMATE_GRADE_PRIORITY=Object.freeze({
  C:1,U:2,R:3,SR:4,HR:5,UR:6,SSR:7,MA:8,LIMITED:9,FUR:10,PRESTIGE:11,ZENITH:100
});

function normalizedGrade(value){
  return String(value||'').trim().toUpperCase();
}

export function normalizeUltimateRequiredGrade(value){
  const grade=normalizedGrade(value||'SSR');
  return ULTIMATE_ALLOWED_GRADES.includes(grade)?grade:'SSR';
}

function ultimateGradePriority(grade){
  return Number(ULTIMATE_GRADE_PRIORITY[normalizedGrade(grade)]||0);
}

export function selectActivatedUltimate(settings={},cards=[],random=Math.random){
  const eligible=(Array.isArray(settings?.ultimateRules)?settings.ultimateRules:[]).map(rule=>{
    const requiredGrade=normalizedGrade(rule?.requiredGrade);
    const matchedCards=(Array.isArray(cards)?cards:[])
      .filter(card=>normalizedGrade(card?.rarity||card?.grade)===requiredGrade&&Number(card?.breakthrough_level??card?.breakthroughLevel??0)>=Number(rule?.minBreakthrough||0))
      .sort((a,b)=>Number(b?.power||0)-Number(a?.power||0));
    return {rule:{...rule,requiredGrade},matchedCards};
  }).filter(entry=>entry.rule.enabled!==false&&entry.matchedCards.length>=Number(entry.rule.requiredCount||1))
    .sort((a,b)=>ultimateGradePriority(b.rule.requiredGrade)-ultimateGradePriority(a.rule.requiredGrade)
      ||Number(b.rule.minBreakthrough||0)-Number(a.rule.minBreakthrough||0)
      ||Number(b.rule.requiredCount||0)-Number(a.rule.requiredCount||0));

  // ZENITH is the absolute first activation candidate. A failed ZENITH roll
  // must not be replaced by a lower-grade ultimate in the same battle.
  const highest=eligible[0]||null;
  if(!highest)return null;
  const chance=Math.max(0,Math.min(100,Number(highest.rule.activationChance??100)));
  const hit=chance>=100||(chance>0&&random()*100<chance);
  return hit?highest:null;
}
