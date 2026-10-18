export const ROOT='/preview/apocalypse-sahyeon-20261019-v1';
const skill=(kind,name,description,extra)=>({code:'SAHYEON_'+kind.toUpperCase(),boss:'sahyeon',kind,name,description,visual:'HOLLOW_LENS',impactAt:kind==='ultimate'?2.85:1.12,duration:kind==='ultimate'?4.6:2.2,...extra});
export const SAHYEON=Object.freeze({
 key:'sahyeon',code:'APOCALYPSE_SAHYEON',monsterId:80,name:'사현',subtitle:'지워진 미래의 관측자',color:'#d5b992',reviewOnly:false,battlePower:220000000,
 sourceArt:ROOT+'/assets/sahyeon-source-v1.png',battleSprite:ROOT+'/assets/sahyeon-sd-v3.png',battleSuitSkillDefensePercent:50,
 actionCadence:'PARTY_ACTIONS',
 skills:[
  skill('seal','현문안 · 정지선','시선이 교차한 적의 다음 선택을 봉인합니다. 공격력이 높은 적 4명의 스킬을 각자 4행동 동안 봉인하며 정화로 해제할 수 있습니다.',{targetCount:4,statusActions:4,dispel:true}),
  skill('curse','현문안 · 공백회랑','대상의 상처가 회복되는 미래를 지웁니다. 적 전체의 회복·재생·흡혈을 각자 4행동 동안 차단하며 정화로 해제할 수 있습니다.',{targetCount:'ALL',statusActions:4,healReductionPercent:100,dispel:true}),
  skill('ultimate','공허법상 · 천경붕괴','거대한 유리 수호체가 두 손으로 전장의 상을 접어 부숩니다. 적 전체에 공격력 30% 피해를 한 번 적용하며 피해의 65%가 보호막을 관통합니다.',{targetCount:'ALL',attackPercent:30,shieldPiercePercent:65})
 ]
});
// User authorized Azuma x2 difficulty AND x2 clear rewards on 2026-10-19.
// Keep the percentage multipliers: doubling both the base and percent pays x4.
export function sahyeonLiveProfile(reference){
 if(!(reference?.battlePower>0&&reference?.rewardCoin>=0))throw Error('Verified Azuma profile required');
 const bonus=reference.clearBonus||{};
 return {...structuredClone(reference),battlePower:reference.battlePower*2,rewardCoin:reference.rewardCoin*2,
  clearBonus:{coinPercent:bonus.coinPercent??null,masterStars:Number(bonus.masterStars||0)*2,mysticEnergy:Number(bonus.mysticEnergy||0)*2},
  skillEnabled:true,skillName:SAHYEON.skills.map(s=>s.name).join(' · ').slice(0,60),skillDescription:'현문안 봉인 → 공백회랑 → 공허법상. 보스와 여섯 잔영을 모두 처치해야 합니다.',
  legionUltimate:{enabled:true,attackPercent:30,shieldPiercePercent:65},battleSuitSkillDefensePercent:50};
}
