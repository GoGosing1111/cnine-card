export const NURSE_SKILL=Object.freeze({
 id:'NURSE_WHITE_OATH',name:'백의의 맹세',role:'HEALER',runtimeEnabled:false,
 description:'치유의 빛을 모아 아군에게 펼치는 공통 회복 스킬.',
 targetConcept:'ALL_ALLIES',healCoefficient:null,cooldown:null,
 duration:2.6,contactAt:.88,contactFrame:7,
 frameKeys:Object.freeze([[.14,0],[.48,3],[.72,5],[.88,7],[1.16,9],[1.52,11],[1.94,13],[2.4,15]])
});

// Pure visual sampling: no HP, target selection, damage or live combat rules.
export function sampleNurseSkill(time){
 const t=Math.max(0,Math.min(NURSE_SKILL.duration,Number(time)||0));
 const keys=NURSE_SKILL.frameKeys;
 if(t<keys[0][0]||t>=keys.at(-1)[0])return {time:t,visible:false,index:null,next:null,blend:0,alpha:0,phase:t<.14?'시전 대기':'회복 완료'};
 let frame=0;
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,fa]=keys[i-1],[b,fb]=keys[i];frame=fa+(fb-fa)*(t-a)/(b-a);break;}
 const index=Math.floor(frame);
 return {time:t,visible:true,index,next:Math.min(15,index+1),blend:frame-index,
  alpha:Math.min(1,(t-.14)/.08,(2.4-t)/.15),
  phase:t<.48?'치유 에너지 집중':t<.88?'백의의 빛 전개':t<1.16?'아군 회복':t<1.94?'치유 잔향':'빛 소멸'};
}
