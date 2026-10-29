import {BERKAN_CODE} from './mercenary-berkan-v1.mjs';

// 2026-10-23: one Halloween slot added; direct gifts and crafting remain separate.
export const JOKRO_CODE='V-979';
export const JOKRO_PACK_SERVER_LIMIT=3;
export const JOKRO_OWNER_ID=1;
export const JOKRO_AREA_EVENT='MERCENARY_JOKRO_AREA';
export const JOKRO_AREA_MECHANIC='AZURE_DRAGON_SKY_CLEAVE';
export const JOKRO_AREA_SKILL=Object.freeze({id:'MS-979',name:'청룡단천',mechanic:JOKRO_AREA_MECHANIC,target:'ALL_ENEMIES',pveOnly:true,
 balance:Object.freeze({damageRatio:15.12,cooldownTurns:5,cost:35})});
// 2026-10-25: scale the approved offensive/stat band to 2,200,000; retain cadence/protection.
const powerScale=2200000/1940890;
export const JOKRO_COMBAT=Object.freeze({
 version:3,basePower:2200000,statsReferencePower:1123200,statScale:1.728*powerScale,speedReferencePower:1080000,speedScale:3.12,actionCredit:3.12,
 motionPlaybackRate:2,effectPlaybackRate:1,
 // Scale the full front shield, including the common +60% contribution.
 link:Object.freeze({attackPercent:3162.9312*powerScale,hpPercent:2012.7744*powerScale,shieldPercent:(1126.0992+60)*powerScale-60}),
 basicCapScale:3.456*powerScale,damageTakenScale:.2,hardCounter:BERKAN_CODE
});
export const isJokro=actor=>actor?.isMercenary===true&&(actor.code||actor.cardId)===JOKRO_CODE;
// User-authorized loan. The server closes access at 04:00 KST even if the
// scheduled holding cleanup is delayed; the original owner never expires.
export const JOKRO_LOAN=Object.freeze({userId:5950,expiresAt:Date.parse('2026-10-19T04:00:00+09:00')});
// Exact stock-exempt gifts approved on 2026-10-22: [C9] Jokjjogi (303), Eumju (4817).
// 2026-10-23 direct prizes add Hatsi (1768) and Danjeonghanbam (5008), stock-exempt.
// 2026-10-23 stock-exempt OWNER gifts: Inception (2) and Bichon (5663).
// Callers still require a positive holding; this does not grant or restore cards.
// T-Money (5147) is an authorized permanent direct-grant recipient; ownership is required.
// 2026-10-25: Jokgujoa (525), one authorized stock-exempt gift; ownership is required.
// 2026-10-26: [C9] Gasi (4866), one authorized stock-exempt gift; ownership is required.
// 2026-10-29: ε연두з (3), existing stock-exempt gift (audit 52534); ownership is required.
// 2026-10-29: Jokdan (4582), one authorized stock-exempt gift; ownership is required.
export const jokroAccountAllowed=(userId,code,now=Date.now(),hasPackIssue=false)=>code!==JOKRO_CODE||Number(userId)===JOKRO_OWNER_ID||Number(userId)===2||Number(userId)===3||Number(userId)===5663||Number(userId)===303||Number(userId)===4817||Number(userId)===1768||Number(userId)===5008||Number(userId)===5147||Number(userId)===525||Number(userId)===4866||Number(userId)===4582||hasPackIssue===true||
 (Number(userId)===JOKRO_LOAN.userId&&now<JOKRO_LOAN.expiresAt);
export const jokroActionCredit=actors=>actors.some(a=>isJokro(a)&&a.alive!==false&&a.hp>0)?JOKRO_COMBAT.actionCredit:1;
export function jokroIncomingDamage(target,incoming,source){
 if(!isJokro(target))return incoming;
 if(source?.isMercenary===true&&(source.code||source.cardId)===JOKRO_COMBAT.hardCounter)return 0;
 return Math.floor(Math.max(0,Number(incoming)||0)*JOKRO_COMBAT.damageTakenScale);
}
export const JOKRO_ART=Object.freeze({
 code:JOKRO_CODE,name:'족로',title:'SSS 리미티드 · 청룡의 발도',rank:'SSS',edition:'LIMITED',role:'VANGUARD',position:'FRONT',
 artOnly:false,releaseStatus:'EXCLUSIVE_RELEASED',exclusiveGrant:true,excludedFromLimitedCount:true,
 sourceArt:'assets/ui/project-v/mercenaries/jokro-20261018/source-art.png',
 sourceArtSha256:'82297D41E879DAB7DF179345875EBF329A3E825BB20BD76C68BFBE91667DFBDB',
 battleSprite:'assets/ui/project-v/mercenaries/jokro-20261018/idle.png',
 battleSpriteSha256:'A1ECEAED8C5C5C427B6F3FB374E6B03EF0B10BEFAC64207CA24A26070DFB127D',
 frame:'assets/ui/project-v/mercenaries/limited-20261002/frame-valter-slim-v3.png',
 artWindow:Object.freeze({left:5.957,top:5.794,width:88.086,height:88.086}),accent:'#66ffc2',
 basePower:JOKRO_COMBAT.basePower,skills:Object.freeze([JOKRO_AREA_SKILL]),acquisitionEnabled:false,packAcquisitionEnabled:true,deploymentEnabled:true,
 combatLinkDescription:'족로 · SSS 리미티드. 할로윈팩에서 서버 3장 한정이며 기존 지정 계정 지급분은 팩 수량에서 제외됩니다. 용병 제작은 별도 2장 한도이며 공개·운영 설정에 따라 이용할 수 있습니다. 기본 전투력 2,200,000. 아군 카드 행동당 3.12회 추가 행동. 개인 피해 80% 경감, 상태이상·반격 보호, 베르칸 피해 면역. PVE 청룡단천은 생존한 적 전체에 총 1,512% 피해를 나눠 한 번씩 적용합니다(에너지 35 · 재사용 5행동). 발도 동작은 2배속, 이펙트는 원래 길이를 유지합니다.'
});
export function jokroDeploymentSnapshot(){
 return {...JOKRO_ART,actorKind:'MERCENARY',level:1,statMode:'RANK_FIXED',attackStyle:'MELEE',skills:[structuredClone(JOKRO_AREA_SKILL)],pendingSkillIds:[],
  jokroPolicyVersion:JOKRO_COMBAT.version,deploymentVersion:'20261025-jokro-power-2200000-v3'};
}
