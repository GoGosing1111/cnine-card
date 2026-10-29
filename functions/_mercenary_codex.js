import {KAMISHIRO_ART,kamishiroCodexSkills} from '../shared/mercenary-kamishiro-v1.mjs';
import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {CARDGU_ART,cardguCodexSkills} from '../shared/mercenary-cardgu-v1.mjs';
import {blackcrownSssCodexCard} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {REVAN_ART,revanCodexSkills} from '../shared/mercenary-revan-v1.mjs';
import {blackcrownCodexCard,BLACKCROWN_CODEX_VERSION} from '../shared/mercenary-blackcrown-codex-v2.mjs';
import {AWAKENED_OMEGA_ART} from '../shared/mercenary-awakened-omega-v1.mjs';
import {RAZAK_ART} from '../shared/mercenary-razak-v1.mjs';
import {EUNSEOL_ART,EUNSEOL_CODE,eunseolCodexSkills} from '../shared/mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_ART,GENERAL_JOK_CODE,generalJokCodexSkills} from '../shared/mercenary-general-jok-v1.mjs';
import {JOKRO_CODE} from '../shared/mercenary-jokro-v1.mjs';
import {PRIME_ART,PRIME_CODE,primeCodexSkills} from '../shared/mercenary-prime-requiem-v1.mjs';
import {ZERO_ART,ZERO_CODE,zeroCodexSkills} from '../shared/mercenary-zero-v1.mjs';
import {LEONEL_CODE,LEONEL_ART} from '../shared/mercenary-leonel-v1.mjs';
import {KANGYUN_CODE,IMPERIAL_ARCHER_COMBAT} from '../shared/mercenary-kangyun-v1.mjs';
import {HALLOWEEN_SSS_CARDS} from '../shared/mercenary-halloween-pool-v3.mjs';
import {SHIRANUI_ART} from '../shared/mercenary-shiranui-v1.mjs';
import {KAIRON_ART} from '../shared/mercenary-kairon-v1.mjs';
import {MERCENARY_CMS_SEED as seed} from './_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_COMBAT_LINK,mercenaryCombatLinkText} from '../shared/mercenary-combat-link-v2103.mjs';
import {MERCENARY_ART_RELEASES,MERCENARY_ART_RELEASE_VERSION} from '../shared/mercenary-art-releases-v1.mjs';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {isRangedMercenarySkill,rangedMercenarySkillText,MERCENARY_RANGED_SUMMARY,MERCENARY_RANGED_BALANCE_VERSION} from '../shared/mercenary-ranged-balance-v1.mjs';
import {mercenaryGuardSkillText,MERCENARY_GUARD_BALANCE_VERSION} from '../shared/mercenary-guard-balance-v1.mjs';
import {mercenaryMoonDrawSkillText,MERCENARY_MOON_DRAW_VERSION} from '../shared/mercenary-moon-draw-v1.mjs';
import {ALL_LIMITED_MERCENARIES as LIMITED_MERCENARIES} from '../shared/mercenary-limited-catalog-v1.mjs';
import {limitedDeploymentSnapshot,LIMITED_DEPLOYMENT_VERSION} from '../shared/mercenary-limited-deployment-v1.mjs';
import {ssRearPveSkillText} from '../shared/mercenary-ss-rear-pve-v1.mjs';
import {ssLimitedCombatDescription,SS_LIMITED_BALANCE_VERSION} from '../shared/mercenary-ss-limited-v1.mjs';
import {HELIOS_CODE,HELIOS_COMBAT_DESCRIPTION} from '../shared/mercenary-helios-v1.mjs';
import {VALTER_CODE,VALTER_COMBAT_DESCRIPTION} from '../shared/mercenary-valter-v1.mjs';
import {MERCENARY_PVP_GROWTH_DESCRIPTION} from '../shared/mercenary-growth-review-v2.mjs';
import {MERCENARY_RANK_GROWTH_DESCRIPTION} from '../shared/mercenary-rank-growth-v1.mjs';

// Public, read-only projection. Never publish operator notes, audit records,
// account ownership, acquisition drafts, or unassigned skill associations.
export function mercenaryCodexDocument(row){
  const document=expandMercenarySkillCatalog(JSON.parse(row.payload_json),seed.document,seed.catalog);
  const skills=new Map(document.skills.map(skill=>[skill.id,skill]));
  const projection={version:'mercenary-codex-2098',revision:Number(row.revision),updatedAt:row.updated_at,artReleaseVersion:MERCENARY_ART_RELEASE_VERSION,rangedBalanceVersion:MERCENARY_RANGED_BALANCE_VERSION,guardBalanceVersion:MERCENARY_GUARD_BALANCE_VERSION,moonDrawVersion:MERCENARY_MOON_DRAW_VERSION,ssLimitedBalanceVersion:SS_LIMITED_BALANCE_VERSION,
    formation:{regularCardSlots:5,mercenarySlots:COMPANION_RELEASE.dualMercenaries?2:1,maxDeployedUnits:COMPANION_RELEASE.dualMercenaries?7:6},
    combatLink:MERCENARY_COMBAT_LINK,
    ranks:seed.catalog.ranks,positions:seed.catalog.positions,roles:{...Object.fromEntries(Object.entries(seed.catalog.roles).map(([key,value])=>[key,{label:value.label}])),LIMITED:{label:'리미티드'}},
    cards:document.mercenaries.map(card=>{
      const art=seed.catalog.cards.find(a=>a.code===card.code),actor={...card,attackStyle:mercenaryAttackStyle(card)};
      const upgraded=document.assignments.find(a=>a.code===card.code).skillIds.some(id=>isRangedMercenarySkill(actor,skills.get(id)));
      return {code:card.code,name:card.name,title:card.title,rank:card.rank,position:card.position,role:card.role,
        sourceArt:art.sourceArt,battleSprite:art.battleSprite,accent:art.accent,
        basePower:card.code===KANGYUN_CODE?IMPERIAL_ARCHER_COMBAT.basePower:MERCENARY_POWER_STANDARD.basePowerByRank[card.rank]??null,
        combatLinkDescription:mercenaryCombatLinkText(card.rank,card.position,actor)+(upgraded?' '+MERCENARY_RANGED_SUMMARY:''),
        specialty:card.specialty,weakness:upgraded?'회피·피해 경감에 대응되며 자원 소모와 재사용 대기의 영향을 받습니다.':card.weakness,basicTarget:seed.catalog.targets[card.basicTarget].label,
        skills:document.assignments.find(a=>a.code===card.code).skillIds.map(id=>{
          const s=ssRearPveSkillText(mercenaryMoonDrawSkillText(mercenaryGuardSkillText(rangedMercenarySkillText(skills.get(id),actor))),actor),ready=s.review==='REVIEWED'&&Object.values(s.balance).every(Number.isFinite);
          return {id:s.id,name:s.name,role:seed.catalog.roles[s.role]?.label||s.role,target:seed.catalog.targets[s.target]?.label||s.target,
            trigger:s.trigger,effect:s.effect,counterplay:s.counterplay,bossRule:s.bossRule,procRule:s.procRule,balance:{...s.balance},...(s.pveBalance?{pveBalance:{...s.pveBalance}}:{}),ready};
        })};
    }).concat(MERCENARY_ART_RELEASES.filter(art=>!document.mercenaries.some(c=>c.code===art.code)).map(art=>({...art,skills:[]})),[EUNSEOL_ART,GENERAL_JOK_ART,PRIME_ART,ZERO_ART,SHIRANUI_ART,LEONEL_ART,...LIMITED_MERCENARIES,...HALLOWEEN_SSS_CARDS.filter(c=>!LIMITED_MERCENARIES.some(a=>a.code===c.code)),{...KAIRON_ART,artOnly:true,basePower:null,skills:[],releaseStatus:'LIMITED_PREVIEW',acquisitionEnabled:false}].map(art=>({...art,...(art.code===EUNSEOL_CODE?{skills:eunseolCodexSkills()}:{}),...(art.code===GENERAL_JOK_CODE?{skills:generalJokCodexSkills()}:{}),...(art.code===PRIME_CODE?{skills:primeCodexSkills()}:{}),...(art.code===ZERO_CODE?{skills:zeroCodexSkills()}:{}),...([LEONEL_CODE,SHIRANUI_ART.code].includes(art.code)?{skills:art.skills.map(s=>({...s,ready:true,target:'적 전체',effect:art.code===SHIRANUI_ART.code?'망령 포대가 생존한 적 전체에 총 560% 피해를 나눠 적용합니다.':'검압이 전장을 가르며 생존한 적 전체에 피해를 한 번씩 나눠 적용합니다.',trigger:'PVE · 에너지 35 · 재사용 5행동',counterplay:'방어·보호막에 대응됩니다.',bossRule:'서버 전투 규칙 적용',procRule:'한 시전당 한 번 적용'}))}:{}),...(art.season==='HALLOWEEN'||art.code==='V-989'||art.code===JOKRO_CODE?{releaseStatus:'OWNER_PACK_CONTROLLED',basePower:limitedDeploymentSnapshot(art.code)?.basePower??null,skills:(limitedDeploymentSnapshot(art.code)?.skills||[]).map(s=>({...s,ready:true,target:s.target||'적 전체',effect:s.effect||(s.pveOnly?'PVE에서 적 전체에 피해를 나눠 적용합니다.':'고유 기술'),trigger:'자기 행동 · 에너지 및 재사용 충족',counterplay:s.counterplay||'방어·보호막에 대응됩니다.',bossRule:s.bossRule||'서버 전투 규칙 적용',procRule:s.procRule||'한 시전당 한 번 적용'}))}:{}),deploymentEnabled:Boolean(limitedDeploymentSnapshot(art.code)),deploymentVersion:LIMITED_DEPLOYMENT_VERSION,...(art.code===VALTER_CODE?{combatLinkDescription:VALTER_COMBAT_DESCRIPTION}:art.code===HELIOS_CODE?{combatLinkDescription:HELIOS_COMBAT_DESCRIPTION}:ssLimitedCombatDescription(art.code)?{combatLinkDescription:ssLimitedCombatDescription(art.code)}:{})})))};
  projection.cards.push({...KAMISHIRO_ART,skills:kamishiroCodexSkills()});
  projection.cards.push(blackcrownSssCodexCard({...CARDGU_ART,skills:cardguCodexSkills()}));
  projection.cards.push(blackcrownSssCodexCard({...REVAN_ART,skills:revanCodexSkills()}));
  projection.cards.push({...AWAKENED_OMEGA_ART,skills:structuredClone(AWAKENED_OMEGA_ART.skills)});
  projection.cards.push({...RAZAK_ART,skills:structuredClone(RAZAK_ART.skills)});
  projection.cards=projection.cards.map(blackcrownCodexCard);
  projection.blackcrownCodexVersion=BLACKCROWN_CODEX_VERSION;
  for(const card of projection.cards)if(card.deploymentEnabled||document.mercenaries.some(c=>c.code===card.code)){
    card.combatLinkDescription=[card.combatLinkDescription,MERCENARY_PVP_GROWTH_DESCRIPTION,MERCENARY_RANK_GROWTH_DESCRIPTION].filter(Boolean).join(' ');
  }
  return projection;
}

export async function handleMercenaryCodex({path,request,env,deps}){
  if(path!=='mercenary-codex')return null;
  if(request.method!=='GET')return deps.json({error:'도감은 조회만 가능합니다.'},405,{Allow:'GET'});
  const row=await env.DB.prepare("SELECT payload_json,revision,updated_at FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first();
  if(!row)return deps.json({error:'용병 정보를 준비하고 있습니다.'},503);
  return deps.json(mercenaryCodexDocument(row),200,{'cache-control':'no-store'});
}
