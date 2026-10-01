// Server-only opt-in capability. JSON/client payloads cannot enable this symbol.
export const MAGIC_SEASON2_REVIEW=Symbol('MAGIC_SEASON2_REVIEW_20260930');
export const MAGIC_S2_RELEASE=Object.freeze({season:'S2',runtimeEnabled:false,drawEnabled:false,price:null,weights:null,status:'READY_HELD_BY_OWNER'});
export const MAGIC_S2_GROWTH=Object.freeze([1,1.03,1.06,1.09,1.12,1.15,1.18,1.22,1.26,1.30]);
export const MAGIC_S2_RULES=Object.freeze({
 S2_ECLIPSE_PROPHECY:{name:'월식의 예언서',slug:'eclipse-prophecy',stats:{bonus:12},hits:6,uses:1,team:true},
 S2_CAUSAL_SEVER:{name:'인과 절단',slug:'causal-sever',stats:{ignore:50,pierce:30},every:3,uses:2},
 S2_FATE_INTERCEPT:{name:'운명의 대리',slug:'fate-intercept',stats:{mitigation:20},uses:1,team:true},
 S2_OVERHEAL_FORGE:{name:'생명 연성진',slug:'overheal-forge',stats:{conversion:60,cap:18},uses:3,team:true},
 S2_CONSTELLATION_SHIFT:{name:'성좌 전환',slug:'constellation-shift',stats:{gauge:20,reduction:20},threshold:35,hits:2,uses:1,team:true},
 S2_SHIELD_LEDGER:{name:'붕괴 장부',slug:'shield-ledger',stats:{record:50,breakDefense:12},release:60,recordAttackCap:200,hits:2,uses:1},
 S2_FALLEN_STAR:{name:'별의 유언',slug:'fallen-star',stats:{attack:8,gauge:12},uses:1,team:true},
 S2_ARCANE_MIRROR:{name:'만상 거울',slug:'arcane-mirror',stats:{efficiency:70},uses:1,pvpOnly:true},
 S2_CONTRACT_EROSION:{name:'계약 침식',slug:'contract-erosion',stats:{reduction:24},actions:4,uses:1,team:true},
 S2_COMMAND_SEVERANCE:{name:'지휘 단절',slug:'command-severance',stats:{vulnerability:10},actions:2,uses:1,team:true}
});
export const MAGIC_S2_MIRROR_ALLOW=Object.freeze(['CRISIS_HEAL','PUNISH_TRAP','ARCANE_COUNTER','FOLLOWUP_HASTE','SHIELD_SIPHON','TIME_DISTORTION','PURIFY_LIGHT','CHAIN_ECHO']);
export function magicS2Params(code,level=0){
 const rule=MAGIC_S2_RULES[code];
 if(!rule||!Number.isInteger(level)||level<0||level>9)throw Error('INVALID_MAGIC_S2_CARD');
 return Object.fromEntries(Object.entries(rule.stats).map(([key,value])=>[key,Math.round(value*MAGIC_S2_GROWTH[level]*10)/10]));
}
export function magicS2Card(code,slotNo=1,enhancementLevel=0){
 const rule=MAGIC_S2_RULES[code];magicS2Params(code,enhancementLevel);
 if(!Number.isInteger(slotNo)||slotNo<1||slotNo>5)throw Error('INVALID_MAGIC_S2_SLOT');
 return {code,effectType:code,name:rule.name,slotNo,enhancementLevel,season:'S2',activationModel:'CONDITIONAL',triggerChance:100,maxActivations:rule.uses,
  imageUrl:`assets/ui/magic-cards/season2/${rule.slug}-source-v1.png`};
}
