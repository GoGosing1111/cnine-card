import {MERCENARY_EQUIPMENT_SLOTS as SLOTS} from '../shared/mercenary-equipment-v1.mjs';
export const EQUIPMENT_MODES=['PVE','PVP'];
export const equipmentSlots=()=>Object.fromEntries(SLOTS.map(s=>[s,null]));
export const equipmentState=()=>({schemaVersion:2,revision:0,loadouts:{}});
export const equipmentInstanceId=id=>typeof id==='string'&&/^[1-9][0-9]{0,17}$/.test(id);
export const equipmentMercenaryCode=code=>typeof code==='string'&&/^V-\d{3}$/.test(code);
export function validateEquipmentState(state){
 if(!state||state.schemaVersion!==2||!Number.isSafeInteger(state.revision)||state.revision<0||state.revision>=2147483647||!state.loadouts||Array.isArray(state.loadouts)||Object.keys(state.loadouts).length>1000)throw Error('Invalid equipment state');
 const owners=new Map();
 for(const [code,modes] of Object.entries(state.loadouts)){
  if(!equipmentMercenaryCode(code)||!modes||Object.keys(modes).length!==2)throw Error('Invalid mercenary');
  for(const mode of EQUIPMENT_MODES){const slots=modes[mode];if(!slots||Object.keys(slots).length!==SLOTS.length)throw Error('Invalid slots');
   for(const slot of SLOTS){const id=slots[slot];if(id===null)continue;if(!equipmentInstanceId(id)||owners.has(id)&&owners.get(id)!==code)throw Error('Invalid wearer');owners.set(id,code);}
  }
 }
 return state;
}
export function equipmentWearer(state,id){
 for(const [code,modes]of Object.entries(state.loadouts)){const active=EQUIPMENT_MODES.filter(mode=>Object.values(modes[mode]).includes(id));if(active.length)return {code,modes:active};}return null;
}
export function legacyEquipmentToV2(legacy,selections){
 const next=equipmentState(),owners=new Map(),cleared=[];
 // User-approved 2026-11-05: PVP keeps shared instances; conflicting PVE references clear.
 for(const mode of ['PVP','PVE']){
  const code=selections[mode]?.mercenaryCode||selections[mode]?.blockedMercenaryCode;
  if(!equipmentMercenaryCode(code))continue;
  for(const slot of SLOTS){const id=legacy[mode].slots[slot];if(!id)continue;
   if(owners.has(id)&&owners.get(id)!==code){cleared.push({mode,slot,instanceId:id,previousCode:code,keptCode:owners.get(id)});continue;}
   next.loadouts[code]??={PVE:equipmentSlots(),PVP:equipmentSlots()};next.loadouts[code][mode][slot]=id;owners.set(id,code);
  }
 }
 return validateEquipmentState({...next,migration:{policy:'PVP_FIRST',cleared}});
}
export function changeEquipment(state,{mercenaryCode,mode,slot,instanceId,transferConfirmed=false}){
 validateEquipmentState(state);
 if(!equipmentMercenaryCode(mercenaryCode)||!EQUIPMENT_MODES.includes(mode)||!SLOTS.includes(slot)||instanceId!==null&&!equipmentInstanceId(instanceId))throw Error('Invalid equipment input');
 const next=structuredClone(state),owner=instanceId?equipmentWearer(state,instanceId):null,transfer=owner&&owner.code!==mercenaryCode?owner:null;
 if(transfer&&!transferConfirmed)throw Object.assign(Error('이전 용병의 착용 해제를 확인하세요.'),{code:'MERCENARY_EQUIPMENT_TRANSFER',status:409});
 if(transfer)for(const m of EQUIPMENT_MODES)for(const s of SLOTS)if(next.loadouts[owner.code][m][s]===instanceId)next.loadouts[owner.code][m][s]=null;
 next.loadouts[mercenaryCode]??={PVE:equipmentSlots(),PVP:equipmentSlots()};next.loadouts[mercenaryCode][mode][slot]=instanceId;next.revision++;
 return {next:validateEquipmentState(next),transfer};
}
