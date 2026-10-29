export const AWAKENED_OMEGA_CODE='V-972';
export const AWAKENED_OMEGA_EVENT='MERCENARY_AWAKENED_OMEGA_COSMIC_SWORD';
export const AWAKENED_OMEGA_MECHANIC='AWAKENED_OMEGA_COSMIC_SWORD';
export const AWAKENED_OMEGA_ROOT='assets/ui/project-v/mercenaries/awakened-omega-20261024/';
export const AWAKENED_OMEGA_PLAYBACK_RATE=2;
// 2026-10-29: independent Jokro 2.2m stat band; retain the four sword forms.
// No character-specific immunity is added.
const scale=2200000/1940890;
export const AWAKENED_OMEGA_COMBAT=Object.freeze({version:2,basePower:2200000,
 statsReferencePower:1123200,statScale:1.728*scale,speedReferencePower:1080000,
 speedScale:3.12,actionCredit:3.12,motionPlaybackRate:2,
 link:Object.freeze({attackPercent:3162.9312*scale,hpPercent:2012.7744*scale,shieldPercent:(1126.0992+60)*scale-60}),
 basicCapScale:3.456*scale,damageTakenScale:.2,hardCounter:null,pvpSkillDamageRatio:1});
export const AWAKENED_OMEGA_SKILLS=Object.freeze([
 {id:'MS-064',name:'성운 횡참',visualMode:'cleave',targetCount:1,target:'적 전열 하나',ratio:15.12,effect:'성운을 두른 검으로 적 하나를 가로 벱니다.'},
 {id:'MS-065',name:'천극 단절',visualMode:'sever',targetCount:1,target:'적 전열 하나',ratio:15.12,effect:'검에 우주 에너지를 모아 적 하나를 내려 벱니다.'},
 {id:'MS-066',name:'성환 검역',visualMode:'orbit',targetCount:null,target:'적 전체 · PVE',pveOnly:true,ratio:15.12,effect:'교차하는 천체 궤도의 검격으로 적 진형을 휩씁니다.'},
 {id:'MS-067',name:'종언의 열개',visualMode:'rupture',targetCount:null,target:'적 전체 · PVE',pveOnly:true,ratio:15.12,effect:'특이점과 공간 균열을 일으켜 적 진형을 가릅니다.'}
].map(({ratio,...s})=>Object.freeze({...s,role:'VANGUARD',mechanic:AWAKENED_OMEGA_MECHANIC,ready:true,
 balance:Object.freeze({damageRatio:ratio,cooldownTurns:5,cost:35}),
 trigger:'자기 행동 · 에너지 35 · 네 기술 공통 재사용 5행동'+(s.pveOnly?' · PVE 전용':''),
 effect:s.effect+` PVE 한 시전의 총 ${Math.round(ratio*100).toLocaleString('en-US')}% 피해를 실제 대상 수에 나누어 적용합니다.`+(s.pveOnly?'':' PVP는 일반 공격 1회 기준의 100% 단일 피해를 사용합니다.'),
 counterplay:'회피·방어·방벽·피해 경감에 대응됩니다.',bossRule:'단일 보스도 같은 총 피해 예산을 사용합니다.',
 procRule:'대상당 서버 피해는 한 번입니다. 모션 2배속·다중 참격은 추가 피해나 행동을 만들지 않습니다.'})));
export const isAwakenedOmega=a=>a?.isMercenary===true&&(a.code||a.cardId)===AWAKENED_OMEGA_CODE;
export const awakenedOmegaActionCredit=actors=>actors.some(a=>isAwakenedOmega(a)&&a.alive!==false&&a.hp>0)?AWAKENED_OMEGA_COMBAT.actionCredit:1;
export function awakenedOmegaIncomingDamage(target,incoming){return isAwakenedOmega(target)?Math.floor(Math.max(0,Number(incoming)||0)*AWAKENED_OMEGA_COMBAT.damageTakenScale):incoming;}
export const AWAKENED_OMEGA_ART=Object.freeze({
 code:AWAKENED_OMEGA_CODE,name:'각성 오메가',title:'우주의 검신',rank:'SSS',edition:'LIMITED',
 nameStatus:'USER_CONFIRMED_20261024',rankStatus:'USER_ASSIGNED_RANK',position:'FRONT',role:'VANGUARD',attackStyle:'MELEE',basicTarget:'적 전열 우선',
 artOnly:false,releaseStatus:'CRAFT_ONLY_RELEASED',acquisition:'CRAFT_ONLY',acquisitionEnabled:true,craftAcquisitionEnabled:true,packAcquisitionEnabled:false,deploymentEnabled:true,
 acquisitionDescription:'용병 제작: 오메가-X 50장 + 100조 코인 · 성공률 10% · 10회 연속 실패 후 11회째 확정. 팩·합성·기적의 큐브에서는 획득할 수 없습니다.',
 sourceArt:AWAKENED_OMEGA_ROOT+'source-art.png',sourceArtSha256:'AB09619FAEE3ACA132DA86BA43256480B4CA3C5B94BC2F778F0BAC2F24AA4A8E',
 battleSprite:AWAKENED_OMEGA_ROOT+'idle.png',battleSpriteSha256:'7A7FBC793DB983ECC54BA4AA04DA18EE48DB79C837A636F7EE32891244EF5B27',
 thumbnailArt:AWAKENED_OMEGA_ROOT+'art-320.webp',displayArt:AWAKENED_OMEGA_ROOT+'art-640.webp',accent:'#b88aff',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),
 battleSpriteViewport:Object.freeze({x:138,y:19,width:493,height:730,imageWidth:768,imageHeight:768}),
 basePower:AWAKENED_OMEGA_COMBAT.basePower,skills:AWAKENED_OMEGA_SKILLS,
 specialty:'우주 검격 · 공격기 2종 · PVE 광역기 2종',weakness:'적 방어·방벽·피해 경감과 공통 재사용 시간의 영향을 받음',
 combatLinkDescription:'기본 전투력 2,200,000. 족로와 같은 공격·체력·방벽·기본 피해 상한 기준, 아군 카드 행동당 3.12회 추가 행동, 개인 피해 80% 경감과 상태이상·반격 보호를 적용합니다. PVE 네 기술은 각각 총 1,512% 피해이며 단일기는 한 대상, 광역기는 적 전체에 나눠 적용합니다. PVP 성운 횡참·천극 단절은 일반 공격 1회 기준의 100% 단일 피해를 사용합니다. 네 기술은 에너지 35와 공통 재사용 5행동을 공유합니다. 대기 자세 고정·모션 2배속·스킬은 캐릭터 앞에 표시됩니다. 제작 전용 · 현재 획득 불가.'
});
export function awakenedOmegaDeploymentSnapshot(){return {...AWAKENED_OMEGA_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',basicTarget:'FRONT_ENEMY',skills:structuredClone(AWAKENED_OMEGA_SKILLS),pendingSkillIds:[],awakenedOmegaPolicyVersion:AWAKENED_OMEGA_COMBAT.version,deploymentVersion:'20261029-awakened-omega-220-v2'};}
