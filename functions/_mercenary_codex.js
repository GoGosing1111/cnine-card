import {MERCENARY_CMS_SEED as seed} from './_mercenary_cms_seed.js';
import {expandMercenarySkillCatalog} from '../shared/mercenary-cms-model-v1.mjs';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
import {MERCENARY_COMBAT_LINK,mercenaryCombatLinkText} from '../shared/mercenary-combat-link-v2103.mjs';

// Public, read-only projection. Never publish operator notes, audit records,
// account ownership, acquisition drafts, or unassigned skill associations.
export function mercenaryCodexDocument(row){
  const document=expandMercenarySkillCatalog(JSON.parse(row.payload_json),seed.document,seed.catalog);
  const skills=new Map(document.skills.map(skill=>[skill.id,skill]));
  return {version:'mercenary-codex-2098',revision:Number(row.revision),updatedAt:row.updated_at,
    formation:{regularCardSlots:5,mercenarySlots:1,maxDeployedUnits:6},
    combatLink:MERCENARY_COMBAT_LINK,
    ranks:seed.catalog.ranks,positions:seed.catalog.positions,roles:Object.fromEntries(Object.entries(seed.catalog.roles).map(([key,value])=>[key,{label:value.label}])),
    cards:document.mercenaries.map(card=>{
      const art=seed.catalog.cards.find(a=>a.code===card.code);
      return {code:card.code,name:card.name,title:card.title,rank:card.rank,position:card.position,role:card.role,
        sourceArt:art.sourceArt,battleSprite:art.battleSprite,accent:art.accent,
        basePower:MERCENARY_POWER_STANDARD.basePowerByRank[card.rank]??null,
        combatLinkDescription:mercenaryCombatLinkText(card.rank),
        specialty:card.specialty,weakness:card.weakness,basicTarget:seed.catalog.targets[card.basicTarget].label,
        skills:document.assignments.find(a=>a.code===card.code).skillIds.map(id=>{
          const s=skills.get(id),ready=s.review==='REVIEWED'&&Object.values(s.balance).every(Number.isFinite);
          return {id:s.id,name:s.name,role:seed.catalog.roles[s.role]?.label||s.role,target:seed.catalog.targets[s.target]?.label||s.target,
            trigger:s.trigger,effect:s.effect,counterplay:s.counterplay,bossRule:s.bossRule,procRule:s.procRule,balance:{...s.balance},ready};
        })};
    })};
}

export async function handleMercenaryCodex({path,request,env,deps}){
  if(path!=='mercenary-codex')return null;
  if(request.method!=='GET')return deps.json({error:'도감은 조회만 가능합니다.'},405,{Allow:'GET'});
  const row=await env.DB.prepare("SELECT payload_json,revision,updated_at FROM mercenary_cms_documents_v1 WHERE doc_key='config'").first();
  if(!row)return deps.json({error:'용병 정보를 준비하고 있습니다.'},503);
  return deps.json(mercenaryCodexDocument(row),200,{'cache-control':'no-store'});
}
