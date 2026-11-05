export const SLOTS=Object.freeze(['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY']);
export const MODES=Object.freeze(['PVE','PVP']);
export const LABELS=Object.freeze({WEAPON:'무기',TOP:'상의',BOTTOM:'하의',SHOES:'신발',ACCESSORY:'장신구'});
const empty=()=>Object.fromEntries(SLOTS.map(slot=>[slot,null]));
export const gearSlots=(state,code,mode)=>state.loadouts[code]?.[mode]??empty();
export const wornItems=(state,code,mode)=>Object.values(gearSlots(state,code,mode)).filter(Boolean).map(id=>state.items.find(i=>i.instanceId===id)).filter(Boolean);
export const power=(item,mode)=>item?.[mode==='PVE'?'pvePower':'pvpPower']??0;
export function wearer(state,id){
 for(const [code,modes] of Object.entries(state.loadouts)){
  const active=MODES.filter(mode=>Object.values(modes[mode]).includes(id));
  if(active.length)return {code,name:state.mercenaries.find(m=>m.code===code)?.name??code,modes:active};
 }
 return null;
}
export function stats(state,code,mode){
 const items=wornItems(state,code,mode),groups=new Map();
 for(const item of items)if(item.setId)groups.set(item.setId,(groups.get(item.setId)??0)+1);
 const sets=[...groups].map(([id,count])=>({...state.sets.find(s=>s.setId===id),count}));
 return {power:items.reduce((total,item)=>total+power(item,mode),0),count:items.length,sets};
}
export class LoadoutError extends Error{constructor(code,message){super(message);this.code=code;}}
function validate(state,input){
 if(!state.mercenaries.some(m=>m.code===input.mercenaryCode&&m.owned))throw new LoadoutError('MERCENARY','보유 용병을 선택하세요.');
 if(!MODES.includes(input.mode)||!SLOTS.includes(input.slot))throw new LoadoutError('INPUT','장비 부위와 전장을 확인하세요.');
 if(input.instanceId!==null){const item=state.items.find(i=>i.instanceId===input.instanceId);
  if(!item||item.available===false||item.locked||item.slot!==input.slot)throw new LoadoutError('OWNERSHIP','사용 가능한 보유 장비를 선택하세요.');
 }
}
export function previewChange(state,input){
 validate(state,input);
 const before=stats(state,input.mercenaryCode,input.mode),next=structuredClone(state),owner=input.instanceId?wearer(state,input.instanceId):null;
 const transfer=owner&&owner.code!==input.mercenaryCode?owner:null;
 const currentId=gearSlots(state,input.mercenaryCode,input.mode)[input.slot];
 if(transfer)for(const mode of MODES)for(const slot of SLOTS)if(next.loadouts[transfer.code][mode][slot]===input.instanceId)next.loadouts[transfer.code][mode][slot]=null;
 next.loadouts[input.mercenaryCode]??={PVE:empty(),PVP:empty()};
 next.loadouts[input.mercenaryCode][input.mode][input.slot]=input.instanceId;
 return {next,before,after:stats(next,input.mercenaryCode,input.mode),transfer,replaced:state.items.find(i=>i.instanceId===currentId)??null};
}
export function assertState(state){
 if(state.schemaVersion!==2||!Number.isSafeInteger(state.revision)||state.revision<0)throw new LoadoutError('STATE','장비 정보를 다시 불러오세요.');
 const ids=new Set();for(const item of state.items){if(!item.instanceId||ids.has(item.instanceId))throw new LoadoutError('STATE','장비 실물 정보가 중복되었습니다.');ids.add(item.instanceId);}
 const owners=new Map();
 for(const [code,modes]of Object.entries(state.loadouts))for(const mode of MODES){
  if(!modes[mode]||Object.keys(modes[mode]).length!==SLOTS.length)throw new LoadoutError('STATE','장비 슬롯 정보를 다시 확인하세요.');
  for(const slot of SLOTS){const id=modes[mode][slot];if(id===null)continue;validate(state,{mercenaryCode:code,mode,slot,instanceId:id});
   if(owners.has(id)&&owners.get(id)!==code)throw new LoadoutError('DUPLICATE','같은 장비를 여러 용병에게 착용할 수 없습니다.');owners.set(id,code);
  }
 }
 return true;
}
export function applyChange(state,input){
 if(typeof input.requestId!=='string'||!input.requestId||input.requestId.length>100)throw new LoadoutError('REQUEST','저장 요청을 다시 확인하세요.');
 const fingerprint=JSON.stringify([input.mercenaryCode,input.mode,input.slot,input.instanceId,input.revision,!!input.transferConfirmed]);
 const receipt=state.receipts?.[input.requestId];
 if(receipt){if(receipt.fingerprint!==fingerprint)throw new LoadoutError('REQUEST_REUSE','다른 장비에 같은 저장 요청을 사용할 수 없습니다.');return {state,replayed:true};}
 assertState(state);
 if(input.revision!==state.revision)throw new LoadoutError('CONFLICT','다른 창에서 장비가 변경됐습니다. 최신 장비를 불러온 뒤 다시 비교하세요.');
 const plan=previewChange(state,input);
 if(plan.transfer&&!input.transferConfirmed)throw new LoadoutError('CONFIRM_TRANSFER','이전 용병의 착용 해제를 확인하세요.');
 plan.next.revision++;
 plan.next.receipts={...state.receipts,[input.requestId]:{fingerprint,revision:plan.next.revision}};
 assertState(plan.next);
 return {state:plan.next,replayed:false,plan};
}
