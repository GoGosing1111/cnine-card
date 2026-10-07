// Visual-only area cast. One clock; no server damage, HP or reward writes.
export const DURATION=5.7, STRIKE=2.02;
export const POSES=[
 {at:0,bank:'ultimate',index:0,facing:1},
 {at:.32,bank:'ultimate',index:0,facing:1},
 {at:.76,bank:'sweep',index:0,facing:1},
 {at:1.10,bank:'spin',index:2,facing:1},
 {at:1.72,bank:'sweep',index:1,facing:1},
 {at:1.96,bank:'spin',index:3,facing:1},
 {at:3.35,bank:'rise',index:0,facing:1},
 {at:4.05,bank:'dash',index:7,facing:1}
];
export const clamp=n=>Math.max(0,Math.min(1,n));
export const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
export function sampleUltimate(time){
 const t=Math.max(0,Math.min(DURATION,time)),frame=Math.max(0,POSES.findLastIndex(p=>p.at<=t));
 const drop=clamp((t-1.72)/(STRIKE-1.72));
 return {time:t,mode:'ultimate',frame,pose:POSES[frame],done:t>=DURATION,lift:0,
  standing:t<=.22||t>=4.62,
  entry:smooth((t-.18)/.45)*(1-smooth((t-4.10)/.95)),
  blade:{visible:t>.48&&t<3.86,height:3.28,drop:drop*drop*drop,
   alpha:smooth((t-.48)/.44)*(1-smooth((t-2.94)/.92)),
   tipHeight:t<STRIKE?1.12*(1-drop*drop*drop):-.07},
  impact:t>=STRIKE&&t<STRIKE+.22?1-(t-STRIKE)/.22:0,
  phase:t<.48?'검압 응축':t<1.72?'거대 영혼검 · 천공 개방':t<STRIKE?'낙하 · 지면 강타':t<2.64?'창천멸진 · 전열 광역 파열':t<3.86?'청색 충격파 · 지면 균열':t<4.62?'검신 소멸 · 잔향':'자세 회복'};
}
// A circular ground wave reaches every real target, ordered by distance from the impact.
export function areaHits(points,center,size){
 const distances=points.map(p=>Math.hypot(p.x-center.x,(p.y-center.y)*1.15));
 const radius=Math.max(size*.5,...distances);
 return distances.map((distance,index)=>({index,distance,at:STRIKE+.035+distance/radius*.25}));
}
