import presentation from './presentation.json' with {type:'json'};
const clamp=x=>Math.max(0,Math.min(1,x));
// Each authored sequence has a readable anticipation, a concentrated contact, then decay.
const phase=(t,start,peak,end)=>t<peak?(t-start)/(peak-start)*.44:.44+(t-peak)/(end-peak)*.56;
function draw(fx,id,t,start,peak,end,point,width,height,options={}){
 fx.paint(id,phase(t,start,peak,end),point,width/presentation.effectScale,{height:height/presentation.effectScale,...options});
}
function targetChest(target){return{x:target.root.x,y:target.root.y-(target.art?.bodyHeight||285)*Math.abs(target.root.scale.x)*.48};}
function frame(fx){
 const f=fx.field,w=f.right-f.left,h=f.bottom-f.top,travel=fx.adapter.travel,s=Math.abs(fx.adapter.actor.root.scale.x),facing=travel.facing;
 const xs=fx.targets.map(t=>t.root.x),ys=fx.targets.map(t=>t.root.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 // Lift the iaido cut through the front row's torso instead of the gap between rows.
 const cutLift=fx.id==='storm'?120*s:0;
 return{w,h,s,facing,cx,cy,center:{x:(f.left+f.right)/2,y:(f.top+f.bottom)/2},floor:{x:cx,y:Math.min(f.bottom-28*s,Math.max(...ys)+22*s)},chest:{x:cx,y:cy-135*s-cutLift}};
}
export function installSwordUltimate(fx){
 const common=[['charge','sword-shock',true],['charge-ray','sword-flash'],['ground','razor-ground',true],['ground-echo','razor-ground',true],['shock','sword-shock'],['splinters','sword-splinters'],['finish-ray','sword-flash']];
 for(const row of common)fx.add(...row);
 if(fx.id==='storm'){
  for(const row of [['draw-line','heaven-line'],['seam','severed-space'],['echo-upper','heaven-line'],['echo-lower','heaven-line'],['cross-seam','severed-space',true]])fx.add(...row);
 }else{
  for(let i=0;i<4;i++){fx.add('orbit'+i,'blade-orbit');fx.add('stroke-ray'+i,'sword-flash');}
  for(const row of [['prison','crosscut-prison',true],['trinity','trinity-cleave'],['final-cross-a','heaven-line'],['final-cross-b','heaven-line']])fx.add(...row);
 }
 fx.targets.forEach((_,i)=>{fx.add('target-line'+i,'heaven-line');fx.add('target-ray'+i,'sword-flash');});
 fx.composition={revision:'sword-ultimates-v10',concept:fx.id==='storm'?'delayed iaido field severance':'traveling four-cut trinity execution',paintedSequences:6,clock:'V3 shared registered timeline',damage:'one authoritative impact per valid target'};
}
export function renderSwordUltimate(fx,t){
 const ad=fx.adapter,q=frame(fx),{w,h,s,facing,cx,cy,floor,chest}=q;
 const final=fx.id==='storm'?1.08:2.75;
 // The darkened field creates separation without turning the red cuts into an opaque fill.
 fx.shade.alpha=(fx.id==='storm'?.34:.30)*clamp(t/.18)*clamp((ad.actionSpec.duration-.25-t)/.55);
 draw(fx,'charge',t,.02,.28,.66,ad.rootAt(.10),520*s,125*s,{alpha:.72,mirror:facing});
 draw(fx,'charge-ray',t,.18,.51,.72,ad.socket('grip_front',.50),220*s,160*s,{alpha:.9,mirror:facing});
 if(fx.id==='storm'){
  const cut={x:q.center.x,y:chest.y};
  draw(fx,'draw-line',t,.66,.86,1.42,cut,w*.96,h*.14,{mirror:facing,angle:-.07*facing});
  draw(fx,'seam',t,.98,1.17,2.42,{x:cx,y:chest.y+24*s},w*.86,h*.30,{mirror:facing,angle:-.07*facing});
  draw(fx,'echo-upper',t,1.10,1.26,1.88,{x:cx,y:chest.y-115*s},w*.86,h*.10,{mirror:facing,angle:-.13*facing,alpha:.88});
  draw(fx,'echo-lower',t,1.19,1.38,2.10,{x:cx,y:chest.y+135*s},w*.82,h*.12,{mirror:facing,angle:.08*facing,alpha:.82});
  draw(fx,'cross-seam',t,1.17,1.42,2.60,{x:cx,y:chest.y+60*s},w*.67,h*.16,{mirror:-facing,angle:.18*facing,alpha:.75});
  draw(fx,'ground',t,1.06,1.42,2.92,floor,w*.78,h*.22,{mirror:facing});
  draw(fx,'ground-echo',t,1.22,1.65,3.02,{x:cx-facing*120*s,y:floor.y-130*s},w*.64,h*.13,{alpha:.62,mirror:-facing});
 }else{
  const beats=[.67,1.06,1.52,1.94],angles=[-.44,.58,.38,-.55];
  beats.forEach((beat,i)=>{
   const p=ad.rootAt(beat),center={x:(p.x+cx)/2,y:(p.y+cy)/2-120*s},face=ad.facingAt(beat-.01);
   draw(fx,'orbit'+i,t,beat-.17,beat+.015,beat+.56,center,w*(i===3?.78:.68),h*(i===3?.50:.42),{mirror:face,angle:angles[i]*facing});
   draw(fx,'stroke-ray'+i,t,beat-.015,beat+.045,beat+.20,center,360*s,230*s,{mirror:face,angle:angles[i]*facing,alpha:.92});
  });
  // A persistent cut lattice connects the successive attacks before the triple finisher.
  const latticePhase=t<2.18?(t-.54)/(2.18-.54)*.44:t<2.50?.44:.44+(t-2.50)/.82*.56;
  fx.paint('prison',latticePhase,{x:cx,y:chest.y},w*.82/presentation.effectScale,{height:h*.68/presentation.effectScale,mirror:facing,alpha:.78});
  draw(fx,'trinity',t,2.47,2.79,3.73,{x:cx,y:chest.y},w*.90,h*.86,{mirror:facing});
  draw(fx,'final-cross-a',t,2.63,2.79,3.25,{x:cx,y:chest.y},w*.94,h*.12,{angle:-.47*facing,mirror:facing});
  draw(fx,'final-cross-b',t,2.70,2.88,3.42,{x:cx,y:chest.y+30*s},w*.88,h*.10,{angle:.47*facing,mirror:-facing,alpha:.92});
  draw(fx,'ground',t,2.72,3.00,4.06,floor,w*.88,h*.28,{mirror:facing});
  draw(fx,'ground-echo',t,2.89,3.22,4.17,{x:cx,y:floor.y-135*s},w*.74,h*.17,{mirror:-facing,alpha:.74});
 }
 draw(fx,'finish-ray',t,final-.015,final+.055,final+.28,chest,480*s,360*s,{mirror:facing});
 draw(fx,'shock',t,final,final+.24,final+1.06,floor,w*.94,h*.24,{mirror:facing,alpha:.83});
 draw(fx,'splinters',t,final+.025,final+.31,final+1.30,{x:cx,y:chest.y+85*s},w*.90,h*.80,{mirror:facing});
 fx.targets.forEach((target,i)=>{
  const p=targetChest(target),beat=final+i*.035;
  draw(fx,'target-line'+i,t,beat-.015,beat+.075,beat+.53,p,Math.max(520*s,w*.34),180*s,{mirror:facing,angle:(i%2?-.28:.24)*facing,alpha:.92});
  draw(fx,'target-ray'+i,t,beat,beat+.07,beat+.34,p,340*s,260*s,{mirror:facing});
 });
}
