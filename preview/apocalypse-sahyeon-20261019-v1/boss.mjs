export const ROOT='/preview/apocalypse-sahyeon-20261019-v1';
const skill=(kind,name,description,extra)=>({code:'SAHYEON_'+kind.toUpperCase(),boss:'sahyeon',kind,name,description,visual:'HOLLOW_LENS',impactAt:kind==='ultimate'?2.85:1.12,duration:kind==='ultimate'?4.6:2.2,...extra});
export const SAHYEON=Object.freeze({
 key:'sahyeon',code:'APOCALYPSE_SAHYEON',monsterId:80,name:'사현',subtitle:'지워진 미래의 관측자',color:'#d5b992',reviewOnly:true,
 sourceArt:ROOT+'/assets/sahyeon-source-v1.png',battleSprite:ROOT+'/assets/sahyeon-sd-v3.png',battleSuitSkillDefensePercent:50,
 skills:[
  skill('seal','현문안 · 정지선','시선이 교차한 적의 다음 선택을 봉인합니다. 공격력이 높은 적 4명의 스킬을 각자 4행동 동안 봉인하며 정화로 해제할 수 있습니다.',{targetCount:4,statusActions:4,dispel:true}),
  skill('curse','현문안 · 공백회랑','대상의 상처가 회복되는 미래를 지웁니다. 적 전체의 회복·재생·흡혈을 각자 4행동 동안 차단하며 정화로 해제할 수 있습니다.',{targetCount:'ALL',statusActions:4,healReductionPercent:100,dispel:true}),
  skill('ultimate','공허법상 · 천경붕괴','거대한 유리 수호체가 두 손으로 전장의 상을 접어 부숩니다. 적 전체에 공격력 30% 피해를 한 번 적용하며 피해의 65%가 보호막을 관통합니다.',{targetCount:'ALL',attackPercent:30,shieldPiercePercent:65})
 ]
});
export const STORY={
 premise:'쿠온이 사라진 이들의 기억을 지킨다면, 사현은 그들이 사라지기 직전의 미래에 갇혀 있다.',
 paragraphs:[
  '관측소가 무너진 밤, 사현은 눈앞에서 한 도시가 소멸하는 순간을 보았다. 그는 현문안을 열어 멸망에 이르는 선택을 하나씩 지웠다. 그러나 남은 미래마다 같은 사람이 죽었다. 마지막 선택을 지운 뒤, 관측소에는 사현 혼자 남았다.',
  '공허법상은 사현이 소환한 신이 아니다. 지워진 미래 속에서 끝내 돌아오지 못한 사람들의 윤곽이다. 사현이 눈을 감으면 법상도 멎는다. 그가 다시 눈을 뜰 때마다 유리 가슴 안에는 이름 없는 그림자가 하나씩 늘어난다.',
  '쿠온은 관측소 문 앞에 그날의 명부를 두고 갔다. 사현은 아직 그것을 펼치지 못했다. 이름을 읽는 순간 자신이 구하려던 사람들이 누구였는지, 그리고 누구를 지워 왔는지 알게 될 것이기 때문이다.'
 ],
 dialogue:[['쿠온','살린 사람의 이름을 기억하나.'],['사현','다음에는 아무도 잃지 않는다.'],['쿠온','그 말을 몇 번이나 했지.'],['사현','…이번에는 네가 보지 못한 길이 있다.']],
 entry:'눈을 감아. 네가 사라지는 미래까지 보고 싶지는 않다.',
 ultimate:'남은 가능성은, 내가 접겠다.'
};
export function doubledProfile(reference){
 if(!Number.isFinite(reference?.battlePower)||reference.battlePower<=0)throw Error('Verified Azuma profile required');
 return {...structuredClone(reference),battlePower:reference.battlePower*2,rewardCoin:0,rewardPercent:0,clearBonus:{coinPercent:null,masterStars:null,mysticEnergy:null},skillName:SAHYEON.skills.map(s=>s.name).join(' · '),skillDescription:'현문안 봉인 → 공백회랑 → 공허법상. 보스와 여섯 잔영을 모두 처치해야 합니다.'};
}
