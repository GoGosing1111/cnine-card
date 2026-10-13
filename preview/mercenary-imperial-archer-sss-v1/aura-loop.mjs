import registration from './aura-registration-v2.json' with {type:'json'};
export const AURA_REGISTRATION=registration;
export function sampleAura(time,reducedMotion=false){
 const {periodSeconds,order}=registration,phase=reducedMotion?0:((time%periodSeconds)+periodSeconds)%periodSeconds/periodSeconds*order.length,index=Math.floor(phase),q=phase-index,weight=q*q*(3-2*q);
 return {from:order[index],to:order[(index+1)%order.length],weight,phase,periodSeconds};
}
