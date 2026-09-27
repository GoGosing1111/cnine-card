export const MODES={dash:{label:'청광 대시',duration:1.15,contact:null,steps:[0,.13,.21,.28,.37,.46,.55,.77]},attack:{label:'일섬',duration:1.05,contact:.34,steps:[0,.14,.24,.31,.43,.56,.67,.80]},skill:{label:'천광 단죄',duration:2.6,contact:1,steps:[0,.18,.42,.75,.88,1,1.22,1.6]}};
const clamp=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
export function sample(mode,t){const s=MODES[mode];t=Math.max(0,Math.min(s.duration,t));let frame=s.steps.findLastIndex(at=>at<=t);const done=t>=s.duration;
 const phase=mode==='dash'?(t<.21?'출발 준비':t<.46?'가속':t<.77?'착지':'자세 회복'):mode==='attack'?(t<.24?'베기 준비':t<.34?'검격':t<.43?'타격 정지':'자세 회복'):(t<.88?'빛 응축':t<1?'내려베기':t<1.22?'충돌':t<1.6?'후속 동작':'잔향 소멸');
 let effects=[];
 if(mode==='dash'&&t>=.20&&t<.87)effects=[{key:'dash',frame:Math.min(11,Math.floor((t-.20)/.67*12)),anchor:'wake',alpha:1}];
 if(mode==='attack'&&t>=.20&&t<.78){const f=t<.34?(t-.2)/.14*6:t<.49?6+(t-.34)/.15*3:9+(t-.49)/.29*3;effects=[{key:'attack',frame:Math.min(11,Math.floor(f)),anchor:'contact',alpha:.95}];}
 if(mode==='skill'){
  if(t>=.1&&t<.92)effects.push({key:'skill',frame:Math.min(3,Math.floor((t-.1)/.82*4)),anchor:'grip',alpha:.7});
  if(t>=.88&&t<1.04)effects.push({key:'skill',frame:4+Math.min(3,Math.floor((t-.88)/.16*4)),anchor:'contact',alpha:1});
  if(t>=1&&t<1.72)effects.push({key:'skill',frame:8+Math.min(3,Math.floor((t-1)/.72*4)),anchor:'contact',alpha:1});
  if(t>=1.65&&t<2.55)effects.push({key:'skill',frame:12+Math.min(3,Math.floor((t-1.65)/.9*4)),anchor:'contact',alpha:1-(t-1.65)/1.05});
 }
 const impact=s.contact===null?0:Math.max(0,1-(t-s.contact)/.12)*(t>=s.contact?1:0);
 return{mode,time:t,frame,phase,done,effects,impact,travel:mode==='dash'?smooth((t-.23)/.25):smooth(t/.19)};
}
