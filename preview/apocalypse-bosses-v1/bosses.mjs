// Registration preparation only. No production route imports this module.
export const ROOT='/preview/apocalypse-bosses-v1/';
export const RELEASE=Object.freeze({enabled:false,registered:false,visualApproval:false,status:'USER_REVIEW_PENDING'});
export const REFERENCE=Object.freeze({monsterId:74,name:'센쥬 하시라마',snapshotDate:'2026-09-11',battlePower:5500000,hpPercent:350,attackPercent:475,defensePercent:375,speedPercent:375,shieldPercent:70,attackCount:2,forcedActionEvery:4});
const art=key=>({sourceArt:ROOT+'assets/'+key+'-source.jpg',battleSprite:ROOT+'assets/'+key+'-sd-v1.png'});
const skill=(boss,kind,name,description,options={})=>Object.freeze({code:`${boss.toUpperCase()}_${kind.toUpperCase()}`,boss,kind,name,description,asset:`${boss}-${kind}`,atlas:ROOT+`assets/${boss}-${kind}-atlas.json`,frameCount:12,collisionFrame:6,impactAt:kind==='ultimate'?1.15:.8,duration:kind==='ultimate'?2.25:1.8,anchor:{x:.5,y:.90},...options});
export const BOSSES=Object.freeze([
 Object.freeze({key:'alucard',code:'APOCALYPSE_ALUCARD',previewId:'DRAFT_ALUCARD',name:'아카드',subtitle:'붉은 밤의 불사왕',color:'#fa5b66',powerRatio:7500000/5500000,...art('alucard'),skills:[
  skill('alucard','seal','혈계 · 구속의 사슬','공격력이 높은 적 2명의 스킬을 각자 2행동 동안 봉인합니다. 일반 공격은 유지됩니다.',{targetCount:2,statusActions:2,dispel:true}),
  skill('alucard','curse','불사의 저주 · 메마른 성혈','적 전체의 회복을 각자 2행동 동안 100% 차단합니다. 재생·흡혈도 차단하며 정화로 해제할 수 있습니다.',{targetCount:'ALL',statusActions:2,healReductionPercent:100,dispel:true}),
  skill('alucard','ultimate','구속 해제 · 불사군단','불사군단의 마수가 적 전체를 덮칩니다. 공격력 190% 피해를 가하며 피해의 40%가 보호막을 관통합니다.',{targetCount:'ALL',attackPercent:190,shieldPiercePercent:40})
 ]}),
 Object.freeze({key:'kaneki',code:'APOCALYPSE_KANEKI_KEN',previewId:'DRAFT_KANEKI',name:'카네키 켄',subtitle:'척안의 재앙',color:'#e9eaf2',powerRatio:10000000/5500000,...art('kaneki'),skills:[
  skill('kaneki','seal','린카쿠 · 가시 감옥','공격력이 높은 적 3명의 스킬을 각자 3행동 동안 봉인합니다. 일반 공격은 유지됩니다.',{targetCount:3,statusActions:3,dispel:true}),
  skill('kaneki','curse','구울의 허기 · 회복 포식','적 전체의 회복을 각자 3행동 동안 100% 차단합니다. 재생·흡혈도 차단하며 정화로 해제할 수 있습니다.',{targetCount:'ALL',statusActions:3,healReductionPercent:100,dispel:true}),
  skill('kaneki','ultimate','카쿠자 · 백족의 종언','거대한 백족 카쿠자가 적 전체를 내려칩니다. 공격력 225% 피해를 가하며 피해의 60%가 보호막을 관통합니다.',{targetCount:'ALL',attackPercent:225,shieldPiercePercent:60})
 ]})
]);
export function makeRegistrationDraft(reference=REFERENCE){
 if(!Number.isFinite(reference.battlePower)||reference.battlePower<=0)throw Error('HASHIRAMA_REFERENCE_REQUIRED');
 const tuning=Object.fromEntries(['hpPercent','attackPercent','defensePercent','speedPercent','shieldPercent','attackCount','forcedActionEvery'].map(key=>[key,reference[key]??REFERENCE[key]]));
 return BOSSES.map(boss=>({code:boss.code,name:boss.name,sourceArt:boss.sourceArt,battleSprite:boss.battleSprite,monsterId:null,isActive:false,pveEnabled:false,pveTab:'APOCALYPSE',rewardCoin:null,rewardConfigurationRequired:true,visualApproval:false,
  battleProfile:{...tuning,battlePower:Math.ceil(reference.battlePower*boss.powerRatio/1000)*1000},
  skills:boss.skills,skillSchedule:{seal:{bossAction:1,maxUses:1},curse:{bossAction:2,maxUses:1},ultimate:{bossAction:3,maxUses:1}},
  reference:{monsterId:74,battlePower:reference.battlePower,powerRatio:boss.powerRatio,refreshAtRegistration:true},status:'PREPARED_OFF'}));
}
