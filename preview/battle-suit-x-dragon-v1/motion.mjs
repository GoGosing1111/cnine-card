// Authored dragon sequence: one visual clock, no server damage or health writes.
export const DURATION=4.6;
export const CONTACTS=[2.18,2.24,2.30,2.36,2.42];
export const POSES=[
 {at:0,bank:'dragon',index:0},{at:.12,bank:'dash',index:2},{at:.20,bank:'dash',index:3},
 {at:.29,bank:'dragon',index:0},{at:.44,bank:'dragon',index:1},{at:.61,bank:'dragon',index:2},
 {at:.80,bank:'dragon',index:3},{at:1.22,bank:'dragon',index:4},{at:1.42,bank:'dragon',index:5},
 {at:2.64,bank:'dragon',index:6},{at:3.52,bank:'dragon',index:7}
];
export const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function sampleDragon(time){
 const t=Math.max(0,Math.min(DURATION,time)),frame=Math.max(0,POSES.findLastIndex(p=>p.at<=t));
 const effects=[];
 const add=(key,start,end,opts={})=>{if(t<start||t>=end)return;const q=(t-start)/(end-start),first=opts.first??0,last=opts.last??11;effects.push({key,frame:Math.min(last,Math.floor(first+q*(last-first+1))),q,start,end,alpha:1,...opts});};
 add('dash',.12,.40,{layer:'wake'});
 add('dragon-ring',.28,1.63,{layer:'caster',alpha:.80});
 add('dragon-coil',.46,1.42,{layer:'summon'});
 add('dragon-rush',1.39,2.68,{layer:'dragon'});
 add('dragon-impact',2.12,3.62,{layer:'crater'});
 add('dragon-ring',2.32,4.24,{layer:'wave',first:6,alpha:Math.min(1,(4.24-t)/.60)});
 const impact=CONTACTS.reduce((v,at,i)=>Math.max(v,t>=at&&t<at+.16?(1-(t-at)/.16)*(i===2?1:.50):0),0);
 return{time:t,frame,pose:POSES[frame],effects,impact,contactCount:CONTACTS.filter(at=>t>=at).length,
 phase:t<.29?'진입':t<.80?'검압 응축':t<1.39?'천룡 소환':t<2.12?'전장 돌파':t<2.50?'광역 강타':t<3.62?'지면 파열 · 파편':t<4.24?'용기 소멸':'자세 회복',
 done:t>=DURATION};
}
