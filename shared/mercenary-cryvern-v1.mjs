// 2026-09-22: user approved name (no title), SSS, slightly above Ragniel.
// 2026-09-24: explicit live approval; conditional SSS selection share 0.1%.
export const CRYVERN_RELEASE_ENABLED = true;
export const CRYVERN_CODE = 'V-049';
export const CRYVERN_SKILL_ID = 'MS-049';
export const CRYVERN_MECHANIC = 'CRYSTAL_CROWN';
export const CRYVERN_NAME = '크라이베른';
export const CRYVERN_SSS_PERCENT = 0.1;
// Between code deployment and the audited CMS save, never give the new card a
// default weight of 1. Preserve every existing member's relative weight, and
// allocate precisely one thousandth of SSS tickets to Cryvern. Once operators
// explicitly save its weight, their policy is authoritative on every deploy.
export function cryvernSelectionWeights(codes,weights){
 if(!CRYVERN_RELEASE_ENABLED||!codes.includes(CRYVERN_CODE)||Object.hasOwn(weights,CRYVERN_CODE))return weights;
 const others=codes.filter(code=>code!==CRYVERN_CODE);
 if(!others.length)return weights;
 const gcd=(a,b)=>{while(b){const r=a%b;a=b;b=r;}return a;};
 const divisor=others.map(code=>weights[code]??1).reduce(gcd);
 const total=others.reduce((sum,code)=>sum+(weights[code]??1)/divisor,0);
 if(!Number.isSafeInteger(total)||total<1||total*1000>0xffffffff)throw Error('CRYVERN_WEIGHTS_REQUIRE_CMS');
 return {...weights,...Object.fromEntries(others.map(code=>[code,(weights[code]??1)/divisor*999])),[CRYVERN_CODE]:total};
}
export const CRYVERN_BALANCE = Object.freeze({damageRatio:5.88,cooldownTurns:5,cost:35});
export const CRYVERN_CAP_SCALE = 1.3;
export const CRYVERN_IMPACTS = Object.freeze([1.3,2.62]);
export const CRYVERN_SHARES = Object.freeze([.4,.6]);
export const CRYVERN_DURATION = 6.2;
export const CRYVERN_PREVIEW = 'preview/mercenary-ice-crystal-dual-sword-v1/';
export const CRYVERN_ASSETS = Object.freeze({
 sourceArt:'assets/ui/project-v/mercenaries/cryvern-source-art-v1.png',
 battleSprite:'assets/ui/project-v/characters/mercenary/mercenary-v049-cryvern-sd-v1.png'
});
export const CRYVERN_HASHES = Object.freeze({
 sourceArt:'321600E04E4CDB3ABD9D35CCEEFCF4AFBD9F34AED73ABD5A8AD038123A999535',
 battleSprite:'DAE9EAA500E924E8561D6823D1A89C90F63A77EF5C8727A835E196C6F98016BD'
});
export function createCryvernSkill(definition,art){
 return definition(CRYVERN_SKILL_ID,'극빙 왕관','VANGUARD','FRONT_GROUP',CRYVERN_MECHANIC,
  '자원과 재사용 조건을 충족하면 적 전열 최대 2명을 지정하고 같은 행동에서 시전합니다.',
  '빙광 질주·십자참에 피해 예산 40%, 명중한 대상의 결정 왕관 파열에 60%를 배분합니다. 각 단계의 전체 피해를 최초 대상 수로 나눕니다.',
  '회피·방어·보호막을 적용합니다. 십자참을 피한 대상에는 왕관이 발동하지 않습니다. 명중 후 쓰러진 대상의 남은 몫은 살아 있는 지정 대상에게만 이전합니다.',
  '단일 보스에도 같은 전체 피해 예산입니다. 빙결·기절·즉사·최대 HP 비례·방어 무시·추가 행동은 없습니다. 다단 타격은 한 행동의 상한을 나눕니다.',
  art('crystal-crown',CRYVERN_MECHANIC,.64,[...CRYVERN_IMPACTS],CRYVERN_DURATION,'#75dcff'),
  ['광원 집중 · 빙광 질주','빙정 십자참','결정 왕관 파열','얼음 파편 · 잔광 소멸']);
}
export function prepareCryvernDefaults(document){
 const card=document.mercenaries.find(c=>c.code===CRYVERN_CODE);if(!card)return document;
 Object.assign(card,{name:CRYVERN_NAME,title:'',rank:'SSS',review:'REVIEWED',
  acquisition:{type:'DROP',source:'하이퍼팩 · SSS 당첨 후 크라이베른 선택 확률 0.1% (전체 확률은 CMS SSS 확률 × 0.001)',coinPrice:null,dropRate:null}});
 const skill=document.skills.find(s=>s.id===CRYVERN_SKILL_ID);
 if(!skill)throw Error('CRYVERN_SKILL_MISSING');
 skill.balance={...CRYVERN_BALANCE};skill.review='REVIEWED';
 document.assignments.find(c=>c.code===CRYVERN_CODE).skillIds=[CRYVERN_SKILL_ID];
 return document;
}
export const CRYVERN_POSITION = Object.freeze({
 code:CRYVERN_CODE,position:'FRONT',role:'VANGUARD',basicTarget:'FRONT_ENEMY',skillTarget:'FRONT_GROUP',
 specialty:'쌍검 연격 · 결정 왕관 파열',weakness:'첫 검격 회피 시 해당 대상의 후속 파열 취소',
 rationale:'승인된 쌍검·광원과 한 행동 피해 예산을 사용하는 전열 SSS 용병',rank:'SSS'
});
