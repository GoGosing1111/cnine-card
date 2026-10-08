const labels={hpPercent:'최대 체력',shieldPercent:'시작 보호막',damageReductionPercent:'받는 피해 감소',speedPercent:'공격 속도',attackPercent:'공격력',bossDamagePercent:'보스 피해',shieldDamagePercent:'보호막 대상 피해',criticalExtraPercent:'치명타 기본공격 추가 피해',criticalChancePoints:'치명타 확률',criticalDamagePoints:'치명타 피해',penetrationPoints:'방어 관통'};
export function equipmentEffectText(effects={}){
  const parts=Object.entries(labels).filter(([key])=>effects[key]).map(([key,label])=>label+' +'+effects[key]+(key.endsWith('Points')?'%p':'%'));
  if(effects.echoEvery)parts.push('기본공격 '+effects.echoEvery+'회마다 '+effects.echoPercent+'% 추가 타격');
  if(effects.uniqueEchoEvery)parts.push('기본공격 '+effects.uniqueEchoEvery+'회마다 '+effects.uniqueEchoPercent+'% 추가 타격');
  if(effects.leechPercent)parts.push('기본공격 피해의 '+effects.leechPercent+'% 회복 (1회 최대 체력 1.5%·전투 누적 25% 한도)');
  return parts.join(' · ');
}
