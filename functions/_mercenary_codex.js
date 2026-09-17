import {MERCENARY_CMS_SEED as seed} from './_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_COMBAT_LINK,mercenaryCombatLinkText} from '../shared/mercenary-combat-link-v2103.mjs';
import {MERCENARY_ART_RELEASES,MERCENARY_ART_RELEASE_VERSION} from '../shared/mercenary-art-releases-v1.mjs';
import {mercenaryAttackStyle} from '../shared/mercenary-attack-style-v1.mjs';
import {isRangedMercenarySkill,rangedMercenarySkillText,MERCENARY_RANGED_SUMMARY,MERCENARY_RANGED_BALANCE_VERSION} from '../shared/mercenary-ranged-balance-v1.mjs';
import {mercenaryGuardSkillText,MERCENARY_GUARD_BALANCE_VERSION} from '../shared/mercenary-guard-balance-v1.mjs';
import {mercenaryMoonDrawSkillText,MERCENARY_MOON_DRAW_VERSION} from '../shared/mercenary-moon-draw-v1.mjs';

// Public, read-only projection. Never publish operator notes, audit records,
// account ownership, acquisition drafts, or unassigned skill associations.
export function mercenaryCodexDocument(row){
  const document=expandMercenarySkillCatalog(JSON.parse(row.payload_json),seed.document,seed.catalog);
  const skills=new Map(document.skills.map(skill=>[skill.id,skill]));
  return {version:'mercenary-codex-2098',revision:Number(row.revision),updatedAt:row.updated_at,artReleaseVersion:MERCENARY_ART_RELEASE_VERSION,rangedBalanceVersion:MERCENARY_RANGED_BALANCE_VERSION,guardBalanceVersion:MERCENARY_GUARD_BALANCE_VERSION,moonDrawVersion:MERCENARY_MOON_DRAW_VERSION,
    formation:{regularCardSlots:5,mercenarySlots:1,maxDeployedUnits:6},
    combatLink:MERCENARY_COMBAT_LINK,
    ranks:seed.catalog.ranks,positions:seed.catalog.positions,roles:Object.fromEntries(Object.entries(seed.catalog.roles).map(([key,value])=>[key,{label:value.label}])),
    cards:document.mercenaries.map(card=>{
      const art=seed.catalog.cards.find(a=>a.code===card.code),actor={...card,attackStyle:mercenaryAttackStyle(card)};
      const upgraded=document.assignments.find(a=>a.code===card.code).skillIds.some(id=>isRangedMercenarySkill(actor,skills.get(id)));
      return {code:card.code,name:card.name,title:card.title,rank:card.rank,position:card.position,role:card.role,
        sourceArt:art.sourceArt,battleSprite:art.battleSprite,accent:art.accent,
        basePower:MERCENARY_POWER_STANDARD.basePowerByRank[card.rank]??null,
        combatLinkDescription:mercenaryCombatLinkText(card.rank)+(upgraded?' '+MERCENARY_RANGED_SUMMARY:''),
        specialty:card.specialty,weakness:upgraded?'회피·피해 경감에 대응되며 자원 소모와 재사용 대기의 영향을 받습니다.':card.weakness,basicTarget:seed.catalog.targets[card.basicTarget].label,
        skills:document.assignments.find(a=>a.code===card.code).skillIds.map(id=>{
          const s=mercenaryMoonDrawSkillText(mercenaryGuardSkillText(rangedMercenarySkillText(skills.get(id),actor))),ready=s.review==='REVIEWED'&&Object.values(s.balance).every(Number.isFinite);
          return {id:s.id,name:s.name,role:seed.catalog.roles[s.role]?.label||s.role,target:seed.catalog.targets[s.target]?.label||s.target,
            trigger:s.trigger,effect:s.effect,counterplay:s.counterplay,bossRule:s.bossRule,procRule:s.procRule,balance:{...s.balance},ready};
        })};
    }).concat(MERCENARY_ART_RELEASES.filter(art=>!document.mercenaries.some(c=>c.code===art.code)).map(art=>({...art,skills:[]})))};
}

export async function handleMercenaryCodex({path,request,env,deps}){
  if(path!=='mercenary-codex')return null;
  if(request.method!=='GET')return deps.json({error:'도감은 조회만 가능합니다.'},405,{Allow:'GET'});
  const row=await env.DB.prepare("SELECT payload_json,revision,updated_at FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first();
  if(!row)return deps.json({error:'용병 정보를 준비하고 있습니다.'},503);
  return deps.json(mercenaryCodexDocument(row),200,{'cache-control':'no-store'});
}
