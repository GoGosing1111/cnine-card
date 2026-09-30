import {MAGIC_S2_RELEASE,MAGIC_S2_RULES,MAGIC_S2_GROWTH,MAGIC_SEASON2_REVIEW,magicS2Card,magicS2Params} from '../shared/magic-season2-v1.mjs';

// Connection data only. Not imported by _magic.js, an API, a migration or a
// purchase handler. Inserting these records as-is leaves all cards inactive.
export function magicSeason2RegistrationDraft(){return {
 ...MAGIC_S2_RELEASE,pack:{code:'MAGIC_CARD_SEASON2_PACK',name:'마법카드 시즌2 팩',imageUrl:'assets/cards/magic-season2-pack-768-v1.webp',active:false,price:null,weights:null},
 enhancement:{maxLevel:9,growth:[...MAGIC_S2_GROWTH],costs:null,successRates:null},
 cards:Object.entries(MAGIC_S2_RULES).map(([code,rule],index)=>({code,name:rule.name,season:'S2',rarity:'MAGIC',active:0,sortOrder:index+1,effectType:code,activationModel:'CONDITIONAL',
  imageUrl:`assets/ui/magic-cards/season2/${rule.slug}-source-v1.png`,triggerChance:100,maxActivations:rule.uses,baseStats:{...rule.stats},scopes:rule.pvpOnly?['PVP']:['PVE','PVP']}))
};}
export function normalizeMagicSeason2ReviewRows(rows=[],options={}){
 if(options[MAGIC_SEASON2_REVIEW]!==true)return [];
 if(!Array.isArray(rows)||rows.length>5)throw Error('INVALID_MAGIC_S2_LOADOUT');
 const slots=new Set();
 return rows.map(row=>{
  const code=String(row.effect_type||row.effectType||row.code||'');
  const card=magicS2Card(code,Number(row.slot_no??row.slotNo),Number(row.enhancement_level??row.enhancementLevel??0));
  if(slots.has(card.slotNo))throw Error('DUPLICATE_MAGIC_S2_SLOT');slots.add(card.slotNo);
  return {...card,id:row.id,params:magicS2Params(code,card.enhancementLevel)};
 });
}
