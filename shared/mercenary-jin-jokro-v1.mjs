import {HELIOS_KING_COMBAT,HELIOS_KING_PVP,HELIOS_KING_GENERAL_JOK_PRIORITY,HELIOS_KING_PVE_BALANCE} from './mercenary-helios-king-v1.mjs';
export const JIN_JOKRO_CODE='V-959';
export const JIN_JOKRO_AREA_EVENT='MERCENARY_JIN_JOKRO_AREA';
export const JIN_JOKRO_AREA_MECHANIC='JIN_JOKRO_SWORD_ULTIMATES';
export const JIN_JOKRO_COMBAT=Object.freeze({...HELIOS_KING_COMBAT,motionPlaybackRate:1.5,effectPlaybackRate:1.5});
export const JIN_JOKRO_PVP=Object.freeze({...HELIOS_KING_PVP,version:'20261106-jin-jokro-pvp-v1'});
export const JIN_JOKRO_GENERAL_JOK_PRIORITY=HELIOS_KING_GENERAL_JOK_PRIORITY;
export const JIN_JOKRO_PVE_BALANCE=HELIOS_KING_PVE_BALANCE;
export const JIN_JOKRO_BASIC_FORMS=Object.freeze([
 {id:'MS-891',name:'흑뢰발도',visualMode:'iaido'},
 {id:'MS-892',name:'적섬연참',visualMode:'cross'},
 {id:'MS-893',name:'섬광관통',visualMode:'thrust'}
].map(s=>Object.freeze({...s,mechanic:'JIN_JOKRO_BASIC_FORM',target:'ENEMY',basicForm:true,balance:Object.freeze({damageRatio:JIN_JOKRO_COMBAT.basicDamageScale,cooldownTurns:0,cost:0})})));
// Three forms share one cooldown and the same mean damage/cap budget as Helios King's two forms.
export const JIN_JOKRO_AREA_SKILLS=Object.freeze([
 {id:'MS-894',name:'흑천일섬',visualMode:'eclipse',damageRatio:37.8,damageCapScale:2.5},
 {id:'MS-895',name:'비검오의 · 흑천단절',visualMode:'storm',damageRatio:41.58,damageCapScale:2.75},
 {id:'MS-896',name:'삼도오의 · 무간참옥',visualMode:'descent',damageRatio:45.36,damageCapScale:3}
].map(({damageRatio,...s})=>Object.freeze({...s,mechanic:JIN_JOKRO_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,balance:Object.freeze({...JIN_JOKRO_PVE_BALANCE,damageRatio})})));
export const isJinJokro=a=>a?.isMercenary===true&&(a.code||a.cardId)===JIN_JOKRO_CODE;
export const jinJokroActionCredit=actors=>actors.some(a=>isJinJokro(a)&&a.alive!==false&&a.hp>0)?JIN_JOKRO_COMBAT.actionCredit:1;
export const jinJokroIncomingDamage=(target,incoming)=>isJinJokro(target)?Math.floor(Math.max(0,Number(incoming)||0)*JIN_JOKRO_COMBAT.damageTakenScale):incoming;
export const JIN_JOKRO_ART=Object.freeze({
 code:JIN_JOKRO_CODE,name:'진 족로',title:'흑뢰 삼도류',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'BATTLE_RELEASED_ACQUISITION_LOCKED',acquisition:'LOCKED',
 sourceArt:'assets/ui/project-v/mercenaries/jin-jokro-20261106/source-art-approved.png',thumbnailArt:'assets/ui/project-v/mercenaries/jin-jokro-20261106/source-art-approved.png',sourceArtSha256:'f2dd7d1b862e25af5f36cab4d5a59b817825aa62814d8a78c85fb4995940f471',
 battleSprite:'assets/ui/project-v/mercenaries/jin-jokro-20261106/images/guard.png',battleSpriteSha256:'7e73203a838f17972368e7735e602b14aebee090bd00d91c4394f437b3f1a513',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#ff2020',
 basePower:JIN_JOKRO_COMBAT.basePower,skills:Object.freeze([...JIN_JOKRO_BASIC_FORMS,...JIN_JOKRO_AREA_SKILLS]),
 acquisitionEnabled:false,packAcquisitionEnabled:false,craftAcquisitionEnabled:false,deploymentEnabled:true,
 combatLinkDescription:'기본 전투력 3,500,000. 헬리오스 킹과 같은 공격·체력·방어·연계·행동 기준. 흑뢰발도·적섬연참·섬광관통은 165% 일반 공격으로 순환합니다. PVE 광역기 흑천일섬 3,780%, 비검오의 · 흑천단절 4,158%, 삼도오의 · 무간참옥 4,536% 피해를 생존한 적에게 나누어 대상당 한 번 적용합니다. 광역기 3개는 에너지 20·재사용 3행동을 공유합니다. 개인 피해 80% 경감·상태이상·반격 보호·행동 3.12배. PVP는 일반 공격과 헬리오스 킹의 보정 정책을 적용합니다. 운영자 지정 지급 전용.'
});
export function jinJokroDeploymentSnapshot(){return {...JIN_JOKRO_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:structuredClone(JIN_JOKRO_AREA_SKILLS),pendingSkillIds:[],jinJokroPolicyVersion:JIN_JOKRO_COMBAT.version,deploymentVersion:'20261106-jin-jokro-live-v1'};}
export const jinJokroCodexSkills=()=>JIN_JOKRO_ART.skills.map(s=>({...s,ready:true,target:s.basicForm?'적 1명':'적 전체',effect:s.basicForm?'삼도류 검격으로 적 하나에 165% 일반 공격을 한 번 적용합니다.':`검격과 흑뢰로 총 ${(s.balance.damageRatio*100).toLocaleString('ko-KR')}% 피해를 적 전체에 나누어 적용합니다.`,trigger:s.basicForm?'일반 공격 · 발도 → 연참 → 관통 순환':'PVE · 에너지 20 · 광역기 공통 재사용 3행동',counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'대상당 한 번 적용 · 연출 타수는 피해 횟수를 늘리지 않습니다.'}));
