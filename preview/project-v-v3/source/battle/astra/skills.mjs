export const BLUEGEAR_CODE='V-059';
export const BLUEGEAR_EVENT='MERCENARY_ASTRA_MECHANICAL_STRIKE';
export const SKILLS=Object.freeze({
 skill_drone:{name:'쌍드론 협공',type:'ATTACK',area:false,reference:'MS-1101',duration:2.35,contact:.94,description:'두 기의 공중 드론을 전개해 한 대상을 교차 사격합니다.'},
 skill_siege:{name:'기갑 포탑 집중사격',type:'ATTACK',area:false,reference:'MS-1102',duration:3.05,contact:1.48,description:'지상 기갑 포탑을 소환해 한 대상에게 세 차례 포격합니다.'},
 skill_fortress:{name:'블루기어 포트리스',type:'AREA',area:true,pveOnly:true,reference:'MS-1103',duration:4.0,contact:1.72,description:'대형 메카를 소환해 적 진형에 레일 포격을 가합니다.'}
});
export const ACTIONS={attack_basic:{name:'장총·자율 포탑 협동 사격',duration:1.45,contact:.52},...SKILLS};
export function prepareStrike(engine,actor,options){
 const skill=SKILLS[options.action],allowed=t=>t&&engine.isAlive(t)&&!t.root?.destroyed&&t.team!==actor.team&&!t.untargetable;
 const rows=new Map();
 if(Array.isArray(options.hits)){for(const h of options.hits){const t=engine.combatantById(h.targetId);if(!allowed(t)||rows.has(t))continue;if(!skill?.area&&options.target&&t!==options.target)continue;rows.set(t,h);if(!skill?.area)break;}}
 else if(!skill?.area&&allowed(options.target))rows.set(options.target,null);
 const targets=[...rows.keys()],applied=new Set();
 return {targets,primary:rows.has(options.target)?options.target:targets[0],owners:[actor,...targets],
 apply(){for(const [t,h]of rows){if(applied.has(t)||!allowed(t))continue;applied.add(t);const hp=h?engine.eventHpPercent(t,h.targetHpAfter,h.targetMaxHp??h.maxHp):options.targetHp;const shield=h?h.targetShieldAfter:options.targetShield;if(shield!=null)engine.syncTargetShield(t,Number(shield),h?.targetMaxShield);if(hp!=null)engine.syncTargetHp(t,Number(hp));options.onImpact?.(t);if(h?.dodge)engine.queueBanner('빗나감',actor.accent,t.name);else engine.showAccountBattleUnitDamage(t,{damage:Number((h?h.damage:options.damage)??0)+Number(h?.absorbed||0),compactArea:targets.length>1});}},
 get count(){return applied.size;}
 };
}
