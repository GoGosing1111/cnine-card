// The socket is generic. Rune type and physical copy identity are deliberately separate.
export const SOCKET_SLOTS=Object.freeze(['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY']);
export const RUNE_SOCKET=Object.freeze({id:'ITEM_RUNE',name:'룬 소켓',scope:'EQUIPMENT_INSTANCE',slots:SOCKET_SLOTS});
export const RUNE_TYPE='S1_IMMORTAL_RUNE', RUNE_LIMIT=5;
const royalArt='/assets/ui/character-runes/v4/';
const commonImmortal={mode:'COMMON',stackGroup:'S1_IMMORTAL_RUNE',effect:{label:'PVE 공격력 · PVP 체력',base:800,upgraded:1000},effects:{PVE:{stat:'attackBp'},PVP:{stat:'hpBp'}},visual:{animation:'sovereign-fire-v3',image:'/assets/ui/character-runes/v3/sovereign-fire-still.webp',color:'#ffc14b',tone:'red-gold',skin:{id:'immortal-king',background:royalArt+'immortal-king-backplate.webp',frame:royalArt+'immortal-king-frame.webp',equipmentLayers:{'assets/items/sovereign-weapon-v1.webp':royalArt+'equipment/sovereign-weapon-layer.webp','assets/items/sovereign-top-v1.webp':royalArt+'equipment/sovereign-top-layer.webp'}}}};
export const IMMORTAL=Object.freeze({...commonImmortal,code:RUNE_TYPE,name:'불멸왕 룬',art:'immortal-seal',source:'S1 불멸의 왕 · 공용 참여 보상 / 제작',image:'/assets/items/season-s1-immortal-king/immortal-seal-v3.webp'});
export const RUNE_CATALOG=Object.freeze([IMMORTAL]);
export const runeCopies=state=>Object.entries(state.owned||{}).filter(([,v])=>v.kind==='RUNE'&&v.typeCode===RUNE_TYPE);
export function addImmortal(state,upgraded=false){
 if(runeCopies(state).length>=RUNE_LIMIT)return null;
 for(let i=1;i<=RUNE_LIMIT;i++){
  const id=RUNE_TYPE+':'+i;
  if(!state.owned[id]){state.owned[id]={typeCode:RUNE_TYPE,copy:i,kind:'RUNE',mode:'COMMON',name:IMMORTAL.name,art:IMMORTAL.art,upgraded};return id;}
 }
 return null;
}
export function migrateImmortalItems(state){
 for(const [legacy,mode] of [['S1_IMMORTAL_SEAL','PVE'],['S1_IMMORTAL_CREST','PVP']]){
  const old=state.owned[legacy];if(!old||!['CORE','RUNE'].includes(old.kind)||![mode,'COMMON'].includes(old.mode))continue;
  const id=addImmortal(state,old.upgraded===true);if(!id)continue;
  let bound=false;for(const [slot,code] of Object.entries(state.itemRunes))if(code===legacy){if(!bound){state.itemRunes[slot]=id;bound=true;}else delete state.itemRunes[slot];}
  delete state.owned[legacy];
 }
}
function resolve(state,code,catalog){
 const item=state?.owned?.[code];if(!item||!['RUNE','CORE'].includes(item.kind))return null;
 const spec=catalog.find(r=>r.code===(item.typeCode||code));if(!spec||item.mode!==(spec.acquisitionMode||spec.mode))return null;
 return {...spec,code,typeCode:spec.code,copy:item.copy||null,owned:true,upgraded:item.upgraded===true,valueBp:item.upgraded?spec.effect.upgraded:spec.effect.base};
}
export function publicRunes(state,catalog=RUNE_CATALOG){
 const owned=Object.keys(state.owned||{}).map(code=>resolve(state,code,catalog)).filter(Boolean);
 return {enabled:true,catalog:catalog.flatMap(spec=>{const copies=owned.filter(r=>r.typeCode===spec.code).sort((a,b)=>a.copy-b.copy);return copies.length?copies:[{...spec,typeCode:spec.code,owned:false,upgraded:false,valueBp:spec.effect.base}];})};
}
export function socketRune(input,{instanceId,code},catalog=RUNE_CATALOG){
 const fail=message=>{throw Object.assign(new Error(message),{status:409,code:'SEASON_CONDITION'});};
 if(!Number.isSafeInteger(instanceId)||instanceId<=0)fail('룬을 넣을 장비를 선택하세요.');
 if(code!==null&&!resolve(input,code,catalog))fail('보유한 룬만 장비에 넣을 수 있습니다.');
 const state=structuredClone(input);state.itemRunes={...state.itemRunes};
 if(code!==null)for(const [id,bound] of Object.entries(state.itemRunes))if(bound===code)delete state.itemRunes[id];
 if(code===null)delete state.itemRunes[instanceId];else state.itemRunes[instanceId]=code;
 return state;
}
export function runeOnItem(state,instanceId,catalog=RUNE_CATALOG){return resolve(state,state.itemRunes?.[instanceId],catalog);}
export function itemRuneBonus(state,mode,equippedIds,catalog=RUNE_CATALOG){
 const result={attackBp:0,hpBp:0},seen=new Set();
 for(const id of equippedIds){
  const r=runeOnItem(state,id,catalog);if(!r||seen.has(r.code)||seen.size>=SOCKET_SLOTS.length)continue;
  const effect=r.effects?.[mode]||(r.mode===mode?r.effect:null);if(!effect||!Object.hasOwn(result,effect.stat))continue;
  seen.add(r.code);result[effect.stat]+=r.valueBp;
 }
 return result;
}
export function publicItemRunes(state,equipmentIds,equippedIds,catalog=RUNE_CATALOG){
 const ids=new Set(equipmentIds.map(String)),placements={};
 for(const [id,code] of Object.entries(state.itemRunes||{}))if(ids.has(id)&&runeOnItem(state,id,catalog))placements[id]=code;
 const equipped=[...new Set(equippedIds)].filter(id=>ids.has(String(id)));
 return {...publicRunes(state,catalog),socket:RUNE_SOCKET,placements,equippedInstances:equipped,activeCount:new Set(equipped.map(id=>placements[id]).filter(Boolean)).size,bonuses:Object.fromEntries(['PVE','PVP'].map(mode=>[mode,itemRuneBonus(state,mode,equipped,catalog)]))};
}
