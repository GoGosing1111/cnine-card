import {mercenaryLevelDraft,initialMercenaryLevel} from '../../shared/mercenary-level-v1.mjs';
// Isolated visual/behavior QA numbers. Never copied into live CMS or API inputs.
export function levelDemo(){
 const policy=mercenaryLevelDraft();policy.sameCardMultiplier=2;policy.xpPerCard=Object.fromEntries(Object.keys(policy.xpPerCard).map(r=>[r,100]));policy.levels.forEach(r=>r.requiredXp=200+r.level*50);policy.milestones.forEach((m,i)=>Object.assign(m,{successChancePpm:500000,bonus:{type:['HP_PERCENT','ATTACK_PERCENT','DEFENSE_PERCENT','SKILL_POWER_PERCENT'][i],value:5}}));
 const cards=[{code:'V-004',name:'베스페라',rank:'SS',sourceArt:'assets/ui/project-v/mercenaries/female-office-sniper-red-v1.png'},{code:'V-009',name:'련화',rank:'SS',sourceArt:'assets/ui/project-v/mercenaries/crimson-constellation-rifle-mercenary-v2.png'},{code:'V-013',name:'라비에나',rank:'S',sourceArt:'assets/ui/project-v/mercenaries/short-bob-k2-amethyst-officer-mercenary-source-art-v1.png'}].map(c=>({...c,totalCopies:31,duplicates:30,growth:initialMercenaryLevel()}));
 return {enabled:true,userId:null,policy,cards};
}
