import {contentEnergyView,contentEnergyText} from './content-energy-v1.mjs';

const DAY=24*60*60*1000,KST=9*60*60*1000;

export function legionHuntEnergyView(record,options={}){
  const view=contentEnergyView(record,options);
  const midnight=Math.floor((view.serverNow+KST)/DAY)*DAY-KST;
  // The saved recharge anchor also identifies its Korean calendar day. A
  // midnight refill is full, so none of the old partial recharge time carries.
  return record&&record.updatedAt<midnight
    ?contentEnergyView(null,{at:view.serverNow,maximum:view.maximum})
    :view;
}

export function legionHuntEnergyText(view,at=Date.now()){
  if(!view)return '';
  const energy=legionHuntEnergyView(view,{at,maximum:view.maximum});
  return contentEnergyText(energy,energy.serverNow)+' · 매일 0시 최대 회복';
}
