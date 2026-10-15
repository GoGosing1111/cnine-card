import {buildFighter,publicFighter,simulateBattleV2Preview,teamSummary} from '../../functions/_battle_v2_preview.js';
import {defaultIconRoles,iconRoleSnapshot,ICON_ROLES} from '../../shared/icon-roles-v1.mjs';
import {ICON_TECHNIQUE_PREPARATION,iconTechniqueDefinition} from '../../shared/icon-techniques-v1.mjs';
// Test/demo numbers only. These are not production tuning or CMS defaults.
export function iconTechniqueFixtureTuning(code){
 const values={firstAction:1,cooldownActions:5,maxCasts:2,durationActions:4,deferPercent:60,hpPercent:35,attackPercent:60,speedPercent:110,reviveHpPercent:20,bossDamagePercent:10,windowActions:5};
 return Object.fromEntries(iconTechniqueDefinition(code).fields.map(f=>[f.key,values[f.key]]));
}
export function techniqueFighter(id,side='A',slot=0,overrides={}){
 return {...buildFighter({id,power:1000,grade:'FUR',name:id},slot,side,null,'PVP'),maxHp:12000,hp:12000,attack:500,defense:100,speed:100,gauge:0,...overrides};
}
export function existingIcon(role,side='A',slot=1,tuning={}){
 const def=ICON_ROLES.find(row=>row.role===role),doc=defaultIconRoles();Object.assign(doc.cards.find(row=>row.code===def.code).tuning,tuning);
 const row={id:def.cardId,power:180000,grade:'ICON',name:def.name,iconRole:iconRoleSnapshot({id:def.cardId,grade:'ICON'},doc,'PVP')};
 return {...buildFighter(row,slot,side,null,'PVP'),maxHp:12000,hp:12000,attack:500,defense:100,speed:100,gauge:0};
}
export function iconTechniqueScenarioInput(code){
 const caster=techniqueFighter('technique-'+code,'A',0,{title:iconTechniqueDefinition(code).name,speed:220}),ally=techniqueFighter('ally','A',2,{row:'BACK',hp:7000}),front=techniqueFighter('enemy-front','B',0),back=techniqueFighter('enemy-back','B',2,{row:'BACK'});
 let teamA=[caster,ally],teamB=[front,back],tuning=iconTechniqueFixtureTuning(code),maxActions=40;
 if(code==='CROWN_USURP'){const healer=existingIcon('SUPPORT','B',2,{firstAction:1});healer.speed=240;front.hp=4000;teamB=[front,healer];tuning.firstAction=2;}
 if(code==='SKILL_ADVANCE'){const attack=existingIcon('ASSAULT','A',2,{firstAction:4,cooldownActions:4});attack.row='BACK';attack.speed=160;teamA=[caster,attack];}
 if(code==='SKILL_CENSOR'){const attack=existingIcon('ASSAULT','B',0,{firstAction:2});attack.speed=180;teamB=[attack,back];}
 if(code==='WOUND_DEFER'){ally.row='FRONT';caster.row='BACK';front.attack=1500;front.speed=260;ally.speed=150;}
 if(code==='PURSUIT_BAN'){ally.row='FRONT';caster.row='BACK';front.speed=300;front.attack=400;}
 if(code==='AUTONOMOUS_WEAPON'){front.attack=250;back.attack=250;maxActions=30;}
 if(code==='RETURN_OATH'){ally.hp=0;ally.alive=false;front.hp=1500;caster.attack=1500;back.attack=100;maxActions=35;}
 return {teamA,teamB,seed:23,maxActions,[ICON_TECHNIQUE_PREPARATION]:{assignments:[{actorId:caster.id,code,tuning}]}};
}
export function iconTechniqueScenario(code){
 const input=iconTechniqueScenarioInput(code),result=simulateBattleV2Preview(input);
 return {engine:'ICON_TECHNIQUE_PREPARATION_V1',reviewOnly:true,fixtureOnly:true,techniqueCode:code,seed:input.seed,teams:Object.fromEntries([['A',input.teamA],['B',input.teamB]].map(([side,team])=>[side,{cards:team.filter(a=>!a.isMercenary).map(publicFighter),summary:teamSummary(team)}])),result};
}
