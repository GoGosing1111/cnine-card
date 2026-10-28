import {KAMISHIRO_CODE,KAMISHIRO_AREA_EVENT} from '../../../../shared/mercenary-kamishiro-v1.mjs';
import {kamishiroBattleArt,setupKamishiroActor,warmKamishiroActor,clearKamishiroActors,cancelKamishiroPlayback,resumeKamishiroPlayback,playKamishiroBasic,playKamishiroArea} from './KamishiroCombatPlayback.js';
import {prepareMercenaryAreaPresentation,cancelMercenaryAreaPresentation,clearMercenaryAreaPresentation,withMercenaryAreaPresentation} from './MercenaryAreaCutinPlayback.js';
import {CARDGU_CODE,CARDGU_AREA_EVENT} from '../../../../shared/mercenary-cardgu-v1.mjs';
import {cardguBattleArt,setupCardguActor,warmCardguActor,clearCardguActors,cancelCardguPlayback,resumeCardguPlayback,playCardguBasic,playCardguArea} from './CardguCombatPlayback.js';
import {REVAN_CODE,REVAN_AREA_EVENT} from '../../../../shared/mercenary-revan-v1.mjs';
import {revanBattleArt,setupRevanActor,warmRevanActor,clearRevanActors,cancelRevanPlayback,resumeRevanPlayback,playRevanBasic,playRevanArea} from './RevanCombatPlayback.js';
import {BLACKCROWN_EVENT} from '../../../../shared/mercenary-blackcrown-combat-v1.mjs';
import {blackcrownBattleArt,setupBlackCrownActor,warmBlackCrownActor,clearBlackCrownActors,cancelBlackCrownPlayback,resumeBlackCrownPlayback,playBlackCrownBasic,playBlackCrownSkill} from './BlackCrownCombatPlayback.js';
import {bloodmoonBattleArt,setupBloodmoonActor,warmBloodmoonActor,clearBloodmoonActors,cancelBloodmoonPlayback,resumeBloodmoonPlayback,playBloodmoonBasic,playBloodmoonSkill,playBloodmoonStatus} from './BloodmoonCombatPlayback.js';
import {AWAKENED_OMEGA_CODE,AWAKENED_OMEGA_EVENT} from '../../../../shared/mercenary-awakened-omega-v1.mjs';
import {awakenedOmegaBattleArt,setupAwakenedOmegaActor,warmAwakenedOmegaActor,clearAwakenedOmegaActors,cancelAwakenedOmegaPlayback,resumeAwakenedOmegaPlayback,playAwakenedOmegaBasic,playAwakenedOmegaSkill} from './AwakenedOmegaCombatPlayback.js';
import {RAZAK_CODE,RAZAK_EVENT} from '../../../../shared/mercenary-razak-v1.mjs';
import {razakBattleArt,setupRazakActor,warmRazakActor,clearRazakActors,cancelRazakPlayback,resumeRazakPlayback,playRazakBasic,playRazakSkill} from './RazakCombatPlayback.js';
import {NAMSUDAENG_CODE,NAMSUDAENG_EVENT} from '../../../../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
import {namsudaengBattleArt,setupNamsudaengActor,warmNamsudaengActor,clearNamsudaengActors,cancelNamsudaengPlayback,resumeNamsudaengPlayback,playNamsudaengBasic,playNamsudaengSkill} from './BloodmoonNamsudaengPlayback.js';
import {EUNSEOL_CODE,EUNSEOL_AREA_EVENT} from '../../../../shared/mercenary-eunseol-v1.mjs';
import {battleImageUrl} from './BattleAssetMemory.mjs';
import {eunseolBattleArt,warmEunseolActor,clearEunseolActors,cancelEunseolPlayback,resumeEunseolPlayback,playEunseolBasic,playEunseolArea} from './EunseolCombatPlayback.js';
import {GENERAL_JOK_CODE,GENERAL_JOK_AREA_EVENT} from '../../../../shared/mercenary-general-jok-v1.mjs';
import {generalJokBattleArt,warmGeneralJokActor,clearGeneralJokActors,cancelGeneralJokPlayback,resumeGeneralJokPlayback,playGeneralJokBasic,playGeneralJokArea} from './GeneralJokCombatPlayback.js';
import {PRIME_CODE,PRIME_AREA_EVENT} from '../../../../shared/mercenary-prime-requiem-v1.mjs';
import {primeBattleArt,warmPrimeActor,clearPrimeActors,cancelPrimePlayback,resumePrimePlayback,playPrimeBasic,playPrimeArea} from './PrimeRequiemCombatPlayback.js';
import {ZERO_CODE,ZERO_AREA_EVENT} from '../../../../shared/mercenary-zero-v1.mjs';
import {zeroBattleArt,setupZeroActor,clearZeroActors,cancelZeroPlayback,resumeZeroPlayback,playZeroBasic,playZeroArea} from './ZeroCombatPlayback.js';
import {BATHORY_CODE} from '../../../../shared/mercenary-bathory-v1.mjs';
import {bathoryBattleArt,setupBathoryActor,clearBathoryActors,cancelBathoryPlayback,resumeBathoryPlayback,playBathoryBasic,playBathorySkill} from './BathoryCombatPlayback.js';
import {LEONEL_CODE,LEONEL_AREA_EVENT} from '../../../../shared/mercenary-leonel-v1.mjs';
import {leonelBattleArt,setupLeonelActor,clearLeonelActors,cancelLeonelPlayback,resumeLeonelPlayback,playLeonelBasic,playLeonelArea} from './LeonelCombatPlayback.js';
import {KANGYUN_CODE,KANGYUN_VOLLEY_SKILL,KANGYUN_AREA_SKILL} from '../../../../shared/mercenary-kangyun-v1.mjs';
import {kangyunBattleArt,setupKangyunActor,clearKangyunActors,cancelKangyunPlayback,resumeKangyunPlayback,playKangyunBasic,playKangyunSkill} from './KangyunCombatPlayback.js';
import {JOKRO_CODE,JOKRO_AREA_EVENT} from '../../../../shared/mercenary-jokro-v1.mjs';
import {jokroBattleArt,setupJokroActor,clearJokroActors,cancelJokroPlayback,resumeJokroPlayback,playJokroBasic,playJokroArea} from './JokroCombatPlayback.js';
import {SHIRANUI_CODE,SHIRANUI_AREA_EVENT} from '../../../../shared/mercenary-shiranui-v1.mjs';
import {shiranuiBattleArt,setupShiranuiActor,clearShiranuiActors,cancelShiranuiPlayback,resumeShiranuiPlayback,playShiranuiBasic,playShiranuiArea} from './ShiranuiCombatPlayback.js';
import {limitedDuo} from '../../../../shared/mercenary-limited-duo-20261008.mjs';
import {limitedDuoBattleArt,playLimitedDuoBasic,playLimitedDuoSkill} from './LimitedDuoCombatPlayback.js';
import {preloadSniperOrikkung,playSniperOrikkungSkill,playSniperOrikkungBasic} from './SniperOrikkungCombatPlayback.js';
import {playNurseHeal} from './NurseHealCombatPlayback.js';
import {BERKAN_CODE,BERKAN_SKILL_ID,BERKAN_AREA_SKILL_ID} from '../../../../shared/mercenary-berkan-v1.mjs';
import {preloadBerkan,setupBerkanActor,clearBerkanActors,cancelBerkanPlayback,playBerkanSkill,playBerkanBasic} from './BerkanCombatPlayback.js';
import {CRYVERN_CODE} from '../../../../shared/mercenary-cryvern-v1.mjs';
import {preloadCryvern,setupCryvernActor,clearCryvernActors,cancelCryvernPlayback,playCryvernCrown,playCryvernBasic,showCryvernShieldImpact} from './CryvernCombatPlayback.js';
import {preloadHeukwol,playHeukwolCombo,playHeukwolBasic} from './HeukwolCombatPlayback.js';
import {preloadBikiniJoeun,playBikiniJoeunSkill,playBikiniJoeunBasic} from './BikiniJoeunCombatPlayback.js';
import {Assets} from 'pixi.js';
import {BattleCharacter,TEAM,CHARACTER_STATE} from './BattleCharacter.js';
import {createMercenaryBattleArtAdapter} from '../../../../js/project-v-mercenary-battle-art-adapter-v1.js';
import {skillById} from '../../../../shared/mercenary-skills-v1.mjs';
import {MercenarySkillFX} from '../../../project-v-mercenary-system-v1/source/MercenarySkillFX.js';
import {loadSequence,loadAuxiliary,releaseFrameViews} from '../../../project-v-mercenary-system-v1/source/MercenarySpriteSequence.js';
import {attachMercenaryArt} from '../../../project-v-mercenary-system-v1/source/MercenaryAttachmentPoints.js';
import {getMercenaryAudio} from '../../../project-v-mercenary-system-v1/source/MercenarySkillAudio.js';
import {MERCENARY_ROLE_ATTACKS,preloadMercenaryRole,playMercenaryRoleAttack} from './MercenaryRoleAttackFX.js';
import {SKILL_CHIP_CLOCK} from '../../../../shared/battle-suit-skill-chips.mjs';
import {playMangisaVolley,preloadMangisaVolley} from './MangisaCombatPlayback.js';
import {playRagnielJudgment,playRagnielBasic,preloadRagniel} from './RagnielCombatPlayback.js';
import {limitedVisual,limitedBattleArt} from '../../../../shared/mercenary-limited-visuals-v1.mjs';
import {VALTER_AREA_EVENT} from '../../../../shared/mercenary-valter-v1.mjs';
import {KAIRON_CODE,KAIRON_AREA_EVENT} from '../../../../shared/mercenary-kairon-v1.mjs';
import {kaironBattleArt,setupKaironActor,clearKaironActors,cancelKaironPlayback,resumeKaironPlayback,playKaironBasic,playKaironArea} from './KaironCombatPlayback.js';
import {JINMU_CODE,JINMU_AREA_EVENT} from '../../../../shared/mercenary-jinmu-v1.mjs';
import {jinmuBattleArt,setupJinmuActor,clearJinmuActors,cancelJinmuPlayback,resumeJinmuPlayback,playJinmuBasic,playJinmuArea} from './JinmuCombatPlayback.js';
import {HELIOS_CODE,HELIOS_AREA_EVENT} from '../../../../shared/mercenary-helios-v1.mjs';
import {heliosBattleArt,setupHeliosActor,clearHeliosActors,cancelHeliosPlayback,resumeHeliosPlayback,playHeliosBasic,playHeliosArea} from './HeliosCombatPlayback.js';
import {AZANT_CODE,AZANT_VOLLEY_EVENT,AZANT_AREA_EVENT,AZANT_VOLLEY_SKILL,AZANT_AREA_SKILL} from '../../../../shared/mercenary-azant-v1.mjs';
import {azantBattleArt,setupAzantActor,clearAzantActors,cancelAzantPlayback,resumeAzantPlayback,playAzantBasic,playAzantSkill} from './AzantCombatPlayback.js';
import {setupLimitedActor,clearLimitedActors,cancelLimitedPlayback,resumeLimitedPlayback,playLimitedBasic,playLimitedSkill,limitedDiagnostics} from './LimitedMercenaryPlayback.js';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`MERCENARY_ASSET:${r.status}`);return r.json();};
let rosterPromise,atlasPromise;
// Shared construction contract: alternate battlefields must not size a transparent
// canvas as if it were the character's body, or omit the approved idle adapters.
export async function resolveV3MercenaryArt(code){
 const roster=await (rosterPromise||=json('/assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json?kangyun=20261018-live-v1&azant=20261014-live-v1&nurseHealers=20260927&berkan=20260927'));
 return revanBattleArt(code)||blackcrownBattleArt(code)||bloodmoonBattleArt(code)||awakenedOmegaBattleArt(code)||razakBattleArt(code)||namsudaengBattleArt(code)||eunseolBattleArt(code)||cardguBattleArt(code)||kamishiroBattleArt(code)||generalJokBattleArt(code)||primeBattleArt(code)||zeroBattleArt(code)||bathoryBattleArt(code)||leonelBattleArt(code)||jokroBattleArt(code)||shiranuiBattleArt(code)||kaironBattleArt(code)||kangyunBattleArt(code)||azantBattleArt(code)||jinmuBattleArt(code)||heliosBattleArt(code)||limitedDuoBattleArt(code)||limitedBattleArt(code)||createMercenaryBattleArtAdapter(roster).resolveForConsumer('BATTLE_FIELD',code);
}
export function v3MercenaryHeight(code,art){return art.fullBodyHeight??(code==='V-048'?300:['V-046',CRYVERN_CODE].includes(code)?380:code==='V-047'?320:260);}
export async function setupV3MercenaryActor(engine,a){
 prepareMercenaryAreaPresentation(engine,a);
 if(blackcrownBattleArt(a.cardId))return setupBlackCrownActor(engine,a);
 if(bloodmoonBattleArt(a.cardId))return setupBloodmoonActor(engine,a);
 if(a.cardId===CRYVERN_CODE)return setupCryvernActor(engine,a);
 if(a.cardId===BERKAN_CODE)return setupBerkanActor(engine,a);
 if(limitedVisual(a.cardId))return setupLimitedActor(engine,a);
 if(a.cardId===BATHORY_CODE)return setupBathoryActor(engine,a);
 if(a.cardId===AWAKENED_OMEGA_CODE)return setupAwakenedOmegaActor(engine,a);
 if(a.cardId===RAZAK_CODE)return setupRazakActor(engine,a);
 if(a.cardId===NAMSUDAENG_CODE)return setupNamsudaengActor(engine,a);
 if(a.cardId===REVAN_CODE)return setupRevanActor(engine,a);
 if(a.cardId===EUNSEOL_CODE)return warmEunseolActor(engine,a);
 if(a.cardId===CARDGU_CODE)return setupCardguActor(engine,a);
 if(a.cardId===KAMISHIRO_CODE)return setupKamishiroActor(engine,a);
 if(a.cardId===GENERAL_JOK_CODE)return warmGeneralJokActor(engine,a);
 if(a.cardId===PRIME_CODE)return warmPrimeActor(engine,a);
 if(a.cardId===ZERO_CODE)return setupZeroActor(engine,a);
 if(a.cardId===LEONEL_CODE)return setupLeonelActor(engine,a);
 if(a.cardId===JOKRO_CODE)return setupJokroActor(engine,a);
 if(a.cardId===SHIRANUI_CODE)return setupShiranuiActor(engine,a);
 if(a.cardId===KAIRON_CODE)return setupKaironActor(engine,a);
 if(a.cardId===JINMU_CODE)return setupJinmuActor(engine,a);
 if(a.cardId===KANGYUN_CODE)return setupKangyunActor(engine,a);
 if(a.cardId===AZANT_CODE)return setupAzantActor(engine,a);
 if(a.cardId===HELIOS_CODE)return setupHeliosActor(engine,a);
 if(MERCENARY_ROLE_ATTACKS[a.role])await preloadMercenaryRole(a.role);
}
export function disposeV3MercenaryPresentation(engine){
 clearMercenaryAreaPresentation(engine);
 clearCryvernActors(engine);clearBerkanActors(engine);clearLimitedActors(engine);clearHeliosActors(engine);clearJinmuActors(engine);clearKaironActors(engine);clearJokroActors(engine);clearCardguActors(engine);clearKamishiroActors(engine);clearGeneralJokActors(engine);clearAwakenedOmegaActors(engine);clearRazakActors(engine);clearNamsudaengActors(engine);clearBlackCrownActors(engine);clearBloodmoonActors(engine);clearRevanActors(engine);clearEunseolActors(engine);clearPrimeActors(engine);clearZeroActors(engine);clearLeonelActors(engine);clearBathoryActors(engine);clearShiranuiActors(engine);clearAzantActors(engine);clearKangyunActors(engine);
 engine.mercenaryFx?.destroy();engine.mercenaryFx=null;
 for(const sequence of engine.mercenarySequences?.values()||[])releaseFrameViews(sequence);
 engine.mercenarySequences?.clear();void engine.mercenaryAudio?.destroy();
}
export const withMercenaryBattle=Base=>class extends Base{
 constructor(options){super(options);this.mercenaries=[];this.mercenarySequences=new Map();this.mercenaryLoads=new Map();this.mercenaryHitIndices=new Map();this.mercenaryFx=null;}
 async setVisible(next){const out=await super.setVisible(next);if(this.visible){resumeLimitedPlayback(this);resumeJinmuPlayback(this);resumeKaironPlayback(this);resumeJokroPlayback(this);resumeCardguPlayback(this);resumeKamishiroPlayback(this);resumeGeneralJokPlayback(this);resumeAwakenedOmegaPlayback(this);resumeRazakPlayback(this);resumeNamsudaengPlayback(this);resumeBlackCrownPlayback(this);resumeBloodmoonPlayback(this);resumeRevanPlayback(this);resumeEunseolPlayback(this);resumePrimePlayback(this);resumeZeroPlayback(this);resumeLeonelPlayback(this);resumeBathoryPlayback(this);resumeShiranuiPlayback(this);resumeHeliosPlayback(this);resumeAzantPlayback(this);resumeKangyunPlayback(this);}return out;}
 cancelTimelines(){cancelMercenaryAreaPresentation(this);this.mercenaryAudio?.stop();cancelCryvernPlayback(this);cancelBerkanPlayback(this);cancelLimitedPlayback(this);cancelHeliosPlayback(this);cancelJinmuPlayback(this);cancelKaironPlayback(this);cancelJokroPlayback(this);cancelCardguPlayback(this);cancelKamishiroPlayback(this);cancelGeneralJokPlayback(this);cancelAwakenedOmegaPlayback(this);cancelRazakPlayback(this);cancelNamsudaengPlayback(this);cancelBlackCrownPlayback(this);cancelBloodmoonPlayback(this);cancelRevanPlayback(this);cancelEunseolPlayback(this);cancelPrimePlayback(this);cancelZeroPlayback(this);cancelLeonelPlayback(this);cancelBathoryPlayback(this);cancelShiranuiPlayback(this);cancelAzantPlayback(this);cancelKangyunPlayback(this);super.cancelTimelines();}
 syncTargetShield(target,value,maxValue=null){const before=target?.shield,result=super.syncTargetShield(target,value,maxValue);showCryvernShieldImpact(this,target,before,target?.shield);return result;}
 normalAttack(index,options){
  if(options?.attacker?.isMercenary&&blackcrownBattleArt(options.attacker.cardId))return playBlackCrownBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&bloodmoonBattleArt(options.attacker.cardId))return playBloodmoonBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===AWAKENED_OMEGA_CODE)return playAwakenedOmegaBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===RAZAK_CODE)return playRazakBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===NAMSUDAENG_CODE)return playNamsudaengBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===BATHORY_CODE)return playBathoryBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===REVAN_CODE)return playRevanBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===EUNSEOL_CODE)return playEunseolBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===CARDGU_CODE)return playCardguBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===KAMISHIRO_CODE)return playKamishiroBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===GENERAL_JOK_CODE)return playGeneralJokBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===PRIME_CODE)return playPrimeBasic(this,options,()=>super.normalAttack(index,options));
  if(options?.attacker?.isMercenary&&options.attacker.cardId===ZERO_CODE)return playZeroBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===LEONEL_CODE)return playLeonelBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===JOKRO_CODE)return playJokroBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===SHIRANUI_CODE)return playShiranuiBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===KAIRON_CODE)return playKaironBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===KANGYUN_CODE)return playKangyunBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===AZANT_CODE)return playAzantBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===JINMU_CODE)return playJinmuBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===HELIOS_CODE)return playHeliosBasic(this,options);
  if(options?.attacker?.isMercenary&&limitedDuo(options.attacker.cardId))return playLimitedDuoBasic(this,options);
  if(options?.attacker?.isMercenary&&limitedVisual(options.attacker.cardId))return playLimitedBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===BERKAN_CODE)return playBerkanBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-050')return playSniperOrikkungBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId===CRYVERN_CODE)return playCryvernBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-048')return playHeukwolBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-047')return playBikiniJoeunBasic(this,options);
  if(options?.attacker?.isMercenary&&options.attacker.cardId==='V-046')return playRagnielBasic(this,options);
  if(options?.attacker?.isMercenary&&MERCENARY_ROLE_ATTACKS[options.attacker.role])return playMercenaryRoleAttack(this,options);
  return super.normalAttack(index,options);
 }
 clearMercenaryActors(){clearMercenaryAreaPresentation(this);this.mercenaryEpoch=(this.mercenaryEpoch||0)+1;this.cancelTimelines?.();clearCryvernActors(this);clearBerkanActors(this);clearLimitedActors(this);clearHeliosActors(this);clearJinmuActors(this);clearKaironActors(this);clearJokroActors(this);clearCardguActors(this);clearKamishiroActors(this);clearGeneralJokActors(this);clearAwakenedOmegaActors(this);clearRazakActors(this);clearNamsudaengActors(this);clearBlackCrownActors(this);clearBloodmoonActors(this);clearRevanActors(this);clearEunseolActors(this);clearPrimeActors(this);clearZeroActors(this);clearLeonelActors(this);clearBathoryActors(this);clearShiranuiActors(this);clearAzantActors(this);clearKangyunActors(this);this.mercenaryFx?.destroy();this.mercenaryFx=null;for(const a of this.mercenaries||[]){this.characters=this.characters.filter(c=>c!==a);a.destroy();}this.mercenaries=[];this.setFormationMercenaries([]);}
 async applyBattlePayload(payload){
  this.clearMercenaryActors();const epoch=this.mercenaryEpoch,result=await super.applyBattlePayload(payload);const entries=['A','B'].flatMap(side=>(payload?.battleV2?.teams?.[side]?.mercenaries||[]).map(card=>({side,card})));
  const rules=payload?.battleV2?.rules||{},perOwner=rules.mercenariesPerOwner===2?2:1,limit=rules.formation==='COOP_THREE_SQUADS'?3*perOwner:rules.formation==='DUO_TWO_SQUADS'?2*perOwner:2;
  if(!entries.length)return result;if(entries.filter(e=>e.side==='A').length>limit||entries.filter(e=>e.side==='B').length>limit)throw Error('MAX_MERCENARIES_PER_SIDE');
  if(entries.some(({card})=>card.cardId===BERKAN_CODE||card.code===BERKAN_CODE||card.skills?.some(s=>[BERKAN_SKILL_ID,BERKAN_AREA_SKILL_ID].includes(s.id))))await preloadBerkan();
  if(entries.some(({card})=>card.cardId==='V-050'||card.code==='V-050'||card.skills?.some(s=>s.mechanic==='EMERALD_ANTIMATERIEL')))await preloadSniperOrikkung();
  if(entries.some(({card})=>card.cardId===CRYVERN_CODE||card.code===CRYVERN_CODE||card.skills?.some(s=>s.mechanic==='CRYSTAL_CROWN')))await preloadCryvern();
  if(entries.some(({card})=>card.cardId==='V-048'||card.code==='V-048'||card.skills?.some(s=>s.mechanic==='BLACK_MOON_TRIPLE_SEVER')))await preloadHeukwol();
  if(entries.some(({card})=>card.cardId==='V-047'||card.code==='V-047'||card.skills?.some(s=>s.mechanic==='LAVENDER_RICOCHET')))await preloadBikiniJoeun();
  if(entries.some(({card})=>card.skills?.some(s=>s.mechanic==='GOLDEN_ORCHID_VOLLEY')))await preloadMangisaVolley();
  if(entries.some(({card})=>card.cardId==='V-046'||card.code==='V-046'||card.skills?.some(s=>s.mechanic==='PLATINUM_SANCTUARY')))await preloadRagniel();
  if(epoch!==this.mercenaryEpoch||this.mercenaryDisposed)return false;
  const roster=await (rosterPromise||=json('/assets/ui/project-v/mercenaries/mercenary-system-roster-v1.json?kangyun=20261018-live-v1&azant=20261014-live-v1&nurseHealers=20260927&berkan=20260927')),adapter=createMercenaryBattleArtAdapter(roster);
  for(const {side,card}of entries){const art=revanBattleArt(card.code||card.cardId)||blackcrownBattleArt(card.code||card.cardId)||bloodmoonBattleArt(card.code||card.cardId)||awakenedOmegaBattleArt(card.code||card.cardId)||razakBattleArt(card.code||card.cardId)||namsudaengBattleArt(card.code||card.cardId)||eunseolBattleArt(card.code||card.cardId)||cardguBattleArt(card.code||card.cardId)||kamishiroBattleArt(card.code||card.cardId)||generalJokBattleArt(card.code||card.cardId)||primeBattleArt(card.code||card.cardId)||zeroBattleArt(card.code||card.cardId)||bathoryBattleArt(card.code||card.cardId)||leonelBattleArt(card.code||card.cardId)||jokroBattleArt(card.code||card.cardId)||shiranuiBattleArt(card.code||card.cardId)||kaironBattleArt(card.code||card.cardId)||kangyunBattleArt(card.code||card.cardId)||azantBattleArt(card.code||card.cardId)||jinmuBattleArt(card.code||card.cardId)||heliosBattleArt(card.code||card.cardId)||limitedDuoBattleArt(card.code||card.cardId)||limitedBattleArt(card.code||card.cardId)||adapter.resolveForConsumer('BATTLE_FIELD',card.code||card.cardId);if(!art)throw Error('MERCENARY_SD_NOT_READY');
   const [sd,original]=await Promise.all([Assets.load(battleImageUrl(art.spriteUrl)),Assets.load(battleImageUrl('/'+art.sourceArt.replace(/^\//,''),{cutIn:true})),MERCENARY_ROLE_ATTACKS[card.role]?preloadMercenaryRole(card.role):null]);
   if(epoch!==this.mercenaryEpoch||this.mercenaryDisposed)return false;
   const a=new BattleCharacter({id:card.id,name:card.name||card.title,team:side==='A'?TEAM.ALLY:TEAM.ENEMY,fullBodyTexture:sd,texture:original,cutInTexture:original,fullBodyHeight:art.fullBodyHeight??(card.cardId==='V-048'?300:['V-046',CRYVERN_CODE].includes(card.cardId)?380:card.cardId==='V-047'?320:260),x:0,y:0,scale:.5,hp:card.hp/card.maxHp*100});
   Object.assign(a,{cardId:card.cardId||card.code,ownerId:card.ownerId,ownerName:card.ownerName,squadIndex:card.squadIndex,localSlot:card.localSlot,art,actorKind:'MERCENARY',isMercenary:true,battleActive:true,enabled:true,serverMaxHp:card.maxHp,serverMaxShield:card.maxShield||0,startingShield:card.shield||0,startingMaxShield:card.maxShield||0,mercenaryRow:card,role:card.role});
   a.fullBodySprite.anchor.set(art.footAnchor.x,art.footAnchor.y);attachMercenaryArt(a,art);a.setShield(card.shield||0,card.maxShield||0);a.root.alpha=1;a.root.visible=card.hp>0;this.combatLayer.addChild(a.root);this.characters.push(a);this.mercenaries.push(a);
  }
  for(const a of this.mercenaries)prepareMercenaryAreaPresentation(this,a);
  this.setFormationMercenaries(this.mercenaries);for(const a of this.mercenaries){a.formationHudY=-(a.art.bodyHeight?a.art.bodyHeight+118:a.fullBodyHeight*.98+88);a.hud.y=a.formationHudY;}this.sortCombatDepth();
  await Promise.all(this.mercenaries.filter(a=>a.cardId===CRYVERN_CODE).map(a=>setupCryvernActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===BERKAN_CODE).map(a=>setupBerkanActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>limitedVisual(a.cardId)).map(a=>setupLimitedActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===BATHORY_CODE).map(a=>setupBathoryActor(this,a)));
  // The approved Prime atlases total ~23 MB. They are optional presentation
  // assets, not a first-frame dependency of the 14s live-entry watchdog.
  for(const a of this.mercenaries.filter(a=>a.cardId===AWAKENED_OMEGA_CODE))warmAwakenedOmegaActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===RAZAK_CODE))warmRazakActor(this,a);
  for(const a of this.mercenaries.filter(a=>blackcrownBattleArt(a.cardId)))warmBlackCrownActor(this,a);
  for(const a of this.mercenaries.filter(a=>bloodmoonBattleArt(a.cardId)))warmBloodmoonActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===NAMSUDAENG_CODE))warmNamsudaengActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===REVAN_CODE))warmRevanActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===EUNSEOL_CODE))warmEunseolActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===CARDGU_CODE))warmCardguActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===KAMISHIRO_CODE))warmKamishiroActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===GENERAL_JOK_CODE))warmGeneralJokActor(this,a);
  for(const a of this.mercenaries.filter(a=>a.cardId===PRIME_CODE))warmPrimeActor(this,a);
  await Promise.all(this.mercenaries.filter(a=>a.cardId===ZERO_CODE).map(a=>setupZeroActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===LEONEL_CODE).map(a=>setupLeonelActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===JOKRO_CODE).map(a=>setupJokroActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===SHIRANUI_CODE).map(a=>setupShiranuiActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===KAIRON_CODE).map(a=>setupKaironActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===JINMU_CODE).map(a=>setupJinmuActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===KANGYUN_CODE).map(a=>setupKangyunActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===AZANT_CODE).map(a=>setupAzantActor(this,a)));
  await Promise.all(this.mercenaries.filter(a=>a.cardId===HELIOS_CODE).map(a=>setupHeliosActor(this,a)));return result;
 }
 syncFinalState(final={}){const out=super.syncFinalState(final);for(const a of this.mercenaries){const side=a.team===TEAM.ALLY?'A':'B',row=final.mercenaries?.[side]?.find(c=>c.id===a.id);if(!row)continue;a.serverMaxHp=row.maxHp;a.setState(row.hp>0?CHARACTER_STATE.IDLE:CHARACTER_STATE.DEAD);a.setHp(Math.max(0,row.hp)/Math.max(1,row.maxHp)*100);a.setShield(row.shield||0,row.maxShield||0);a.enabled=row.hp>0;a.root.visible=a.enabled;}this.sortCombatDepth();return out;}
 async sequenceFor(skillId){
  if(this.mercenarySequences.has(skillId))return this.mercenarySequences.get(skillId);
  if(!this.mercenaryLoads.has(skillId))this.mercenaryLoads.set(skillId,(async()=>{
   const manifest=await (atlasPromise||=json('/preview/project-v-mercenary-system-v1/skill-assets-v2/manifest.json?v=20260927-nurse-healers')),row=manifest.images.find(r=>r.skillId===skillId);if(!row)throw Error('MERCENARY_SEQUENCE_NOT_READY');
   const sequence=await loadSequence(row);if(this.mercenaryDisposed){releaseFrameViews(sequence);return null;}
   this.mercenarySequences.set(skillId,sequence);return sequence;
  })().finally(()=>this.mercenaryLoads.delete(skillId)));
  return this.mercenaryLoads.get(skillId);
 }
 async playMercenaryEvent(event){
  const limitedActor=this.combatantById(event.actorId);
  if(blackcrownBattleArt(limitedActor?.cardId)){
   if(['MERCENARY_WINDUP','MERCENARY_CAST','MERCENARY_END','MERCENARY_FINISH','MERCENARY_CANCEL'].includes(event.type))return true;
   if(event.type===BLACKCROWN_EVENT)return playBlackCrownSkill(this,event);
  }
  if(bloodmoonBattleArt(limitedActor?.cardId)){
   if(['MERCENARY_WINDUP','MERCENARY_CAST','MERCENARY_FINISH'].includes(event.type))return true;
   if(event.type==='MERCENARY_HIT')return playBloodmoonSkill(this,event);
   if(playBloodmoonStatus(this,event))return true;
  }
  if(limitedActor?.cardId===AWAKENED_OMEGA_CODE){
   if(['MERCENARY_WINDUP','MERCENARY_CAST','MERCENARY_FINISH'].includes(event.type))return true;
   if(event.type===AWAKENED_OMEGA_EVENT)return playAwakenedOmegaSkill(this,event);
  }
  if(limitedActor?.cardId===RAZAK_CODE){
   if(['MERCENARY_WINDUP','MERCENARY_CAST','MERCENARY_FINISH'].includes(event.type))return true;
   if(event.type===RAZAK_EVENT)return playRazakSkill(this,event);
  }
  if(limitedActor?.cardId===NAMSUDAENG_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===NAMSUDAENG_EVENT)return playNamsudaengSkill(this,event);
  }
  if(limitedActor?.cardId===BATHORY_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type==='MERCENARY_HIT')return playBathorySkill(this,event);
  }
  if(limitedActor?.cardId===KANGYUN_CODE){
   if(event.type==='MERCENARY_WINDUP'&&[KANGYUN_VOLLEY_SKILL,KANGYUN_AREA_SKILL].includes(event.skillId))return true;
   if(['MERCENARY_IMPERIAL_ARROW_VOLLEY','MERCENARY_IMPERIAL_ARROW_RAIN'].includes(event.type))return playKangyunSkill(this,event);
  }
  if(limitedActor?.cardId===AZANT_CODE){
   if(event.type==='MERCENARY_WINDUP'&&[AZANT_VOLLEY_SKILL,AZANT_AREA_SKILL].includes(event.skillId))return true;
   if([AZANT_VOLLEY_EVENT,AZANT_AREA_EVENT].includes(event.type))return playAzantSkill(this,event);
  }
  if(limitedActor?.cardId===REVAN_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===REVAN_AREA_EVENT)return withMercenaryAreaPresentation(this,event,limitedActor,()=>playRevanArea(this,event));
  }
  if(limitedActor?.cardId===EUNSEOL_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===EUNSEOL_AREA_EVENT)return playEunseolArea(this,event);
  }
  if(limitedActor?.cardId===CARDGU_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===CARDGU_AREA_EVENT)return withMercenaryAreaPresentation(this,event,limitedActor,()=>playCardguArea(this,event));
  }
  if(limitedActor?.cardId===KAMISHIRO_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===KAMISHIRO_AREA_EVENT)return playKamishiroArea(this,event);
  }
  if(limitedActor?.cardId===GENERAL_JOK_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===GENERAL_JOK_AREA_EVENT)return withMercenaryAreaPresentation(this,event,limitedActor,()=>playGeneralJokArea(this,event));
  }
  if(limitedActor?.cardId===PRIME_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===PRIME_AREA_EVENT)return withMercenaryAreaPresentation(this,event,limitedActor,()=>playPrimeArea(this,event));
  }
  if(limitedActor?.cardId===ZERO_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===ZERO_AREA_EVENT)return withMercenaryAreaPresentation(this,event,limitedActor,()=>playZeroArea(this,event));
  }
  if(limitedActor?.cardId===LEONEL_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===LEONEL_AREA_EVENT)return playLeonelArea(this,event);
  }
  if(limitedActor?.cardId===JOKRO_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===JOKRO_AREA_EVENT)return playJokroArea(this,event);
  }
  if(limitedActor?.cardId===SHIRANUI_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===SHIRANUI_AREA_EVENT)return playShiranuiArea(this,event);
  }
  if(limitedActor?.cardId===KAIRON_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===KAIRON_AREA_EVENT)return playKaironArea(this,event);
  }
  if(limitedActor?.cardId===JINMU_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===JINMU_AREA_EVENT)return playJinmuArea(this,event);
  }
  if(limitedActor?.cardId===HELIOS_CODE){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type===HELIOS_AREA_EVENT)return playHeliosArea(this,event);
  }
  if(limitedDuo(limitedActor?.cardId)){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type==='MERCENARY_HIT')return playLimitedDuoSkill(this,event);
  }
  if(limitedVisual(limitedActor?.cardId)){
   if(event.type==='MERCENARY_WINDUP')return true;
   if(event.type==='MERCENARY_HIT'||event.type===VALTER_AREA_EVENT||(limitedActor.cardId==='V-984'&&event.type==='MERCENARY_BUFF'&&event.effect==='SHIELD'))return playLimitedSkill(this,event);
  }
  if(event.type==='MERCENARY_GROUP_HEAL'&&event.mechanic==='WHITE_OATH_GROUP_HEAL')return playNurseHeal(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='WHITE_OATH_GROUP_HEAL')return true;
  if([BERKAN_SKILL_ID,BERKAN_AREA_SKILL_ID].includes(event.skillId)&&['MERCENARY_HIT','MERCENARY_STARFALL'].includes(event.type))return playBerkanSkill(this,event);
  if([BERKAN_SKILL_ID,BERKAN_AREA_SKILL_ID].includes(event.skillId)&&event.type==='MERCENARY_WINDUP')return true;
  if(event.type==='MERCENARY_HIT'&&event.mechanic==='EMERALD_ANTIMATERIEL')return playSniperOrikkungSkill(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='EMERALD_ANTIMATERIEL')return true;
  if(event.type==='MERCENARY_CRYSTAL_CROWN'&&event.mechanic==='CRYSTAL_CROWN')return playCryvernCrown(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='CRYSTAL_CROWN')return true;
  if(event.type==='MERCENARY_COMBO'&&event.mechanic==='BLACK_MOON_TRIPLE_SEVER')return playHeukwolCombo(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='BLACK_MOON_TRIPLE_SEVER')return true;
  if(event.type==='MERCENARY_HIT'&&event.mechanic==='LAVENDER_RICOCHET')return playBikiniJoeunSkill(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='LAVENDER_RICOCHET')return true;
  if(event.type==='MERCENARY_JUDGMENT'&&event.mechanic==='PLATINUM_SANCTUARY')return playRagnielJudgment(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='PLATINUM_SANCTUARY')return true;
  if(event.type==='MERCENARY_VOLLEY'&&event.mechanic==='GOLDEN_ORCHID_VOLLEY')return playMangisaVolley(this,event);
  if(event.type==='MERCENARY_WINDUP'&&event.mechanic==='GOLDEN_ORCHID_VOLLEY')return true;
  const epoch=this.mercenaryEpoch,playbackEpoch=this.playbackEpoch,actor=this.combatantById(event.actorId),target=this.combatantById(event.targetId),type=event.type;if(!actor)return true;
  const valid=()=>epoch===this.mercenaryEpoch&&playbackEpoch===this.playbackEpoch&&!actor.root.destroyed&&this.visible;
  const sync=()=>{if(target&&Number.isFinite(event.targetHpAfter))this.syncTargetHp(target,this.eventHpPercent(target,event.targetHpAfter));if(target&&Number.isFinite(event.targetShieldAfter))this.syncTargetShield(target,event.targetShieldAfter,event.targetMaxShield);};
  const key=`${event.actorId}:${event.skillId}`;
  if(type==='MERCENARY_END'||type==='MERCENARY_CANCEL'){this.mercenaryHitIndices.delete(key);this.queueBanner(event.skillName||'용병 스킬',0xc49cff,type==='MERCENARY_CANCEL'?'기술 중단':'시전 완료');sync();return;}
  if(type==='MERCENARY_FOCUS'||event.dodge){this.queueBanner(event.dodge?'빗나감':event.focused?'조준 완료':'집중 해제',0xc49cff,event.skillName);sync();return;}
  const skill=skillById(event.skillId);if(!skill){sync();return;}
  if(type==='MERCENARY_WINDUP')this.mercenaryHitIndices.set(key,0);
  // Police fires once. Its mark is informational; restraint uses only the
  // binding phase, never the preceding shot. Old receipts can contain a status
  // after KO while the fading corpse is still visible, so reject it by HP.
  const restraintStatus=type==='MERCENARY_DEBUFF'&&skill.mechanic==='REPEAT_OFFENDER_RESTRAINT';
  const restraintTargetAlive=()=>target?.hp>0&&target.battleActive!==false&&target.root?.visible;
  if(restraintStatus){
   if(!restraintTargetAlive())return true;
   if(event.effect==='OFFENDER_MARK'){this.queueBanner(event.skillName,0xc49cff,'위반 표식');sync();return true;}
  }
  // Secondary status records must not replay the direct hit which preceded them.
  if(type==='MERCENARY_DEBUFF'&&(['POISON','APPROACH_DELAY','DUEL_OATH','SHIELD_ONLY_BREAK','THORN_RECOIL_SEAL'].includes(event.effect)||event.effect==='OFFENSIVE_SKILL_ONLY'&&skill.mechanic==='PLATINUM_FOCUS_LOCK')){this.queueBanner(event.skillName,0xc49cff,({POISON:'독 표식',APPROACH_DELAY:'진입 지연',DUEL_OATH:'결투 맹세',SHIELD_ONLY_BREAK:'보호막 파쇄',THORN_RECOIL_SEAL:'가시 봉인',OFFENSIVE_SKILL_ONLY:'공격술 약화'})[event.effect]);sync();return true;}
  if(type==='MERCENARY_BUFF'&&event.effect==='STAND_FAST_CONSUMED'){this.queueBanner(event.skillName,0xc49cff,'백철 방호 소모');sync();return true;}
  const barrage=skill.mechanic==='TIDAL_BARRAGE';
  const hitIndex=restraintStatus||type==='MERCENARY_DEBUFF'&&['ARMOR_WINDOW','NEXT_BASIC_WEAKENED'].includes(event.effect)?1:event.skillPhaseIndex??(this.mercenaryHitIndices.get(key)||0),impact=barrage&&type==='MERCENARY_HIT'?skill.visual.impacts.at(-1):skill.visual.impacts[Math.min(hitIndex,skill.visual.impacts.length-1)];
  if(['MERCENARY_HIT','MERCENARY_HEAL','MERCENARY_DOT','MERCENARY_RIPOSTE'].includes(type))this.mercenaryHitIndices.set(key,hitIndex+1);
  const ids=event.targetIds?.length?event.targetIds:[event.targetId].filter(Boolean),actors=new Map([['M',actor]]),targets=[];
  for(const id of ids){const a=this.combatantById(id);if(!a?.root?.visible||a.battleActive===false)continue;const alias=a===actor?'M':`${a.team===actor.team?'A':'E'}${targets.length+1}`;actors.set(alias,a);targets.push(alias);}
  if(!targets.length){if(!ids.length&&type==='MERCENARY_BUFF')targets.push('M');else{sync();return true;}}
  if(event.sourceAttackerId){const attacker=this.combatantById(event.sourceAttackerId);if(attacker)actors.set('E_SOURCE',attacker);}
  const initial=[...actors].map(([id,a])=>({id,team:id.startsWith('E')?'ENEMY':'ALLY',row:'FRONT',hp:a.hp,maxHp:100,shield:0,attack:1,flags:{},alive:a.hp>0}));
  const isWindup=type==='MERCENARY_WINDUP',events=isWindup?[]:[{id:'authoritative',kind:['MERCENARY_HIT','MERCENARY_DOT','MERCENARY_RIPOSTE'].includes(type)?'HIT':'STATUS',at:impact,targets,phaseIndex:hitIndex,stage:hitIndex>0?'DETONATE':'MARK',amount:event.damage||event.amount||0,changes:{}}];
  // Approved rapid-fire animation is one server hit. Tracers never add damage.
  if(barrage&&!isWindup)events.splice(0,events.length,...skill.visual.impacts.map((at,i)=>({id:`tracer:${i}`,kind:'HIT',at,targets,phaseIndex:i,amount:i===8?event.damage||0:0,changes:{}})));
  const plan={initial,targets,events,scenario:'normal',duration:skill.visual.duration,previewOnly:false,authoritative:true,effectPhase:hitIndex,eventType:type};
  const sequence=await this.sequenceFor(skill.id);this.mercenaryAuxiliary||=await loadAuxiliary();if(!sequence||!valid())return false;
  const audio=this.audio?.enabled?.()!==false?getMercenaryAudio(this):null;
  if(audio){let timer;const ready=await Promise.race([audio.unlock().catch(()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),2500);})]).finally(()=>clearTimeout(timer));audio.setEnabled(ready);}
  if(!valid())return false;
  if(restraintStatus&&!restraintTargetAlive())return true;
  this.settlePendingTails?.([...actors.values()]);
  const fx=new MercenarySkillFX(this,actors,skill,plan,sequence,this.mercenaryAuxiliary,()=>{},{authoritative:true});fx.removeTimeline();this.mercenaryFx=fx;
  const flightLead=skill.visual.motion==='CORAL_ARCS'?.42:.26;
  const begin=isWindup?0:barrage?skill.visual.windup:Math.max(0,impact-flightLead),end=isWindup?Math.max(.25,skill.visual.impacts[0]-flightLead):barrage?skill.visual.duration:Math.min(skill.visual.duration,impact+1.2),time={value:begin};
  // Server outcomes are applied at the same authored collision timestamp. The
  // rehearsal renderer cannot edit HP or produce a second damage/target result.
  try{
   audio?.select(skill,plan,{panDirection:actor.team===TEAM.ENEMY?-1:1});
   await this.timeline(t=>{
    t.call(()=>audio?.scheduleFrom(begin,t.timeScale()),[],0);
    t.to(time,{value:end,duration:end-begin,ease:'none',onUpdate:()=>{fx.render(time.value);if(audio&&audio.lastRate!==t.timeScale())audio.scheduleFrom(time.value,t.timeScale());}});
    if(!isWindup)t.call(()=>{if(valid())sync();},[],Math.max(0,impact-begin));
   });if(valid())sync();return valid();
  }
  finally{audio?.stop();this.lastMercenaryPlayback={skillId:skill.id,eventType:type,phaseIndex:hitIndex,audio:audio?.diagnostics()||null,frames:fx.activeFrames};fx.destroy();if(this.mercenaryFx===fx)this.mercenaryFx=null;}
 }
 async playEvents(events=[],options={}){
  if(!options.timedInternal&&events.some(e=>e.combatClock===SKILL_CHIP_CLOCK)||!events.some(e=>String(e.type).startsWith('MERCENARY_')))return super.playEvents(events,options);
  const epoch=this.playbackEpoch;
  for(const e of events){if(!this.visible||this.formationCoop&&epoch!==this.playbackEpoch)return false;const played=String(e.type).startsWith('MERCENARY_')?await this.playMercenaryEvent(e):await super.playEvents([e],options);if(played===false)return false;}return true;
 }
 diagnostics(){return {...super.diagnostics(),mercenaryPlayback:{last:this.lastMercenaryPlayback||null,active:this.mercenaryFx?.diagnostics()||null,audio:this.mercenaryAudio?.diagnostics()||null,limited:limitedDiagnostics(this)}};}
 destroy(){this.mercenaryDisposed=true;this.clearMercenaryActors();void this.mercenaryAudio?.destroy();for(const sequence of this.mercenarySequences?.values()||[])releaseFrameViews(sequence);this.mercenarySequences?.clear();super.destroy();}
};
