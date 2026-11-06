export const ROOT='/assets/ui/project-v/monsters/apocalypse-trio-20261106';
export const ART_ROOT='/assets/ui/project-v/monsters/approved-20261106/apocalypse-trio';
export const REFERENCE_POWER=220_000_000;
const definitions=[
 {key:'infected-soldier',prefix:'INFECTED_SOLDIER',monsterId:81,name:'카르겐',subtitle:'종말의 저격수',color:0x9cf548,battlePower:2_200_000_000,names:['감염 표식 · 신경 구속','역병 포자 · 회복 고갈','종말 사격 · 사멸탄'],ultimateLine:'명령은 끝나지 않았다.',role:'폐허에서 표적을 고정한 뒤, 감염탄으로 전선을 꿰뚫습니다.'},
 {key:'hell-general',prefix:'HELL_GENERAL',monsterId:82,name:'발카르',subtitle:'지옥군단의 대장군',color:0xeac17d,battlePower:3_300_000_000,names:['군령 · 철쇄 봉인','낙인 · 불멸의 군율','최후의 군령 · 왕검 처형'],ultimateLine:'무릎 꿇어라. 이것이 마지막 군령이다.',role:'방패로 퇴로를 봉쇄하고, 전장을 가르는 왕검으로 처형합니다.'},
 {key:'archdemon',prefix:'ARCHDEMON',monsterId:83,name:'모르가스',subtitle:'세계를 찢는 자',color:0xc58bff,battlePower:4_400_000_000,names:['골옥 · 영혼 구속','공허 침식 · 생명 소거','세계 붕괴 · 종언의 균열'],ultimateLine:'너희의 세계는, 여기까지다.',role:'네 팔로 공간을 벌리고, 거대한 균열 속으로 전장을 무너뜨립니다.'}
];
const clearRewards=Object.freeze({
 'infected-soldier':Object.freeze({coin:1_500_000_000,masterStars:1_000_000,mysticEnergy:null}),
 'hell-general':Object.freeze({coin:2_500_000_000,masterStars:2_000_000,mysticEnergy:null}),
 'archdemon':Object.freeze({coin:4_000_000_000,masterStars:3_000_000,mysticEnergy:null})
});
export const BOSSES=Object.freeze(definitions.map(d=>Object.freeze({...d,clearRewards:clearRewards[d.key],battleScale:d.key==='infected-soldier'?.82:d.key==='hell-general'?1.12:1.35,code:'APOCALYPSE_'+d.prefix,reviewOnly:false,sourceArt:`${ART_ROOT}/${d.key}-source-art-approved-v3.png`,battleSprite:`${ROOT}/assets/${d.key}-battle-ready-v1.png`,battleSuitSkillDefensePercent:50,actionCadence:'PARTY_ACTIONS',skills:['seal','curse','ultimate'].map((kind,i)=>({code:d.prefix+'_'+kind.toUpperCase(),boss:d.key,kind,name:d.names[i],visual:'APOCALYPSE_TRIO',impactAt:kind==='ultimate'?2.85:1.12,duration:kind==='ultimate'?4.6:2.2,targetCount:kind==='seal'?4:'ALL',...(kind==='ultimate'?{attackPercent:30,shieldPiercePercent:65}:{statusActions:4,dispel:true,...(kind==='curse'?{healReductionPercent:100}:{})}),description:kind==='seal'?'공격력이 높은 적 4명의 기술을 각자 4행동 동안 봉인합니다. 일반 공격과 정화는 가능합니다.':kind==='curse'?'적 전체의 회복·재생·흡혈을 각자 4행동 동안 차단합니다. 정화로 해제할 수 있습니다.':'적 전체에 공격력 30% 피해를 가합니다. 피해의 65%가 보호막을 관통합니다.'}))})));
export const bossByKey=key=>BOSSES.find(b=>b.key===key)||null;
export const draftBoss=monster=>{const values=typeof monster==='object'?[monster?.monsterId,monster?.id,monster?.cardId]:[monster];return BOSSES.find(b=>values.some(v=>Number(String(v??'').match(/(?:^|:)(\d+)$/)?.[1])===b.monsterId))||null;};

// The extended CMS bounds apply only to the three registered apocalypse IDs.
export const apocalypseTrioLimits=monster=>draftBoss(monster)?{battlePower:1_000_000_000_000,masterStars:3_000_000}:{battlePower:1_000_000_000,masterStars:1_000_000};
export function apocalypseTrioLiveProfile(boss,reference){
 if(draftBoss(boss)!==boss||!(reference?.battlePower>0))throw Error('Verified trio boss and Sahyeon profile required');
 return {...structuredClone(reference),battlePower:boss.battlePower,rewardCoin:boss.clearRewards.coin/10,rewardPercent:1000,
  clearBonus:{coinPercent:null,masterStars:boss.clearRewards.masterStars,mysticEnergy:null},
  skillName:boss.skills.map(s=>s.name).join(' · ').slice(0,60),skillDescription:boss.role,
  skillEnabled:true,legionUltimate:{enabled:true,attackPercent:30,shieldPiercePercent:65},battleSuitSkillDefensePercent:50};
}
