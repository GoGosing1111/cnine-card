export const MODES=Object.freeze({idle:'흑린 수호 · 대기',dash:'흑영보 · 이동',attack:'흑룡일섬 · 검격',cross:'암월십자 · 연속 참격',cast:'흑룡천겁 · 광역기 1',ultimate:'암월멸검 · 광역기 2',hit:'피격',defeat:'전투 불능'});
export const AREA_SKILLS=Object.freeze({
 cast:{name:'흑룡천겁',bank:'cataclysm',waves:[1.9,2.5,3.1],stagger:.025,description:'쌍룡 돌진 → 흑룡 강림 → 적 전체 3연쇄 폭발'},
 ultimate:{name:'암월멸검',bank:'eclipsecut',waves:[2.05,2.6,3.15,3.7],stagger:.025,description:'암월 개방 → 장검 폭우 → 전장 절단 → 파편 소멸'}
});
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
// Only the body/held sword samples this clock. FX, travel and damage keep the
// authored clock and the existing live playback rate.
export const SWORD_SWING_RATE=2;
const SWORD_SWINGS=Object.freeze({
 attack:[[.43,.8,1.4]],
 cross:[[.42,.87,1.02],[1.02,1.24,2]],
 ultimate:[[.55,1.45,3.05]]
});
export function swordSwingTime(mode,t){
 for(const [from,contact,to] of SWORD_SWINGS[mode]||[]){
  if(t>=from&&t<=to)return clamp(contact+(t-contact)*SWORD_SWING_RATE,from,to);
 }
 return t;
}
export const effectScale=mode=>mode==='ultimate'?1.6:['dash','attack','cross','cast'].includes(mode)?1.5:1;
export function track(keys,t){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const[a,x]=keys[i-1],[b,y]=keys[i];return x+(y-x)*clamp((t-a)/(b-a));}return keys.at(-1)[1];}
const poses=(key,rows)=>rows.map(([t,frame])=>[t,key,frame]);
export function plan(mode='idle',targetCount=5){
 if(!MODES[mode])throw Error('Unknown mode');
 const plans={
  idle:{duration:2.4,peak:1,poses:[[0,'idle',0]],hits:[]},
  dash:{duration:1.8,peak:.5,poses:[...poses('dash',[[0,0],[.12,1],[.26,2],[.46,3],[.64,4],[.8,5],[1.05,1],[1.2,2],[1.4,4]]),[1.6,'idle',0]],hits:[]},
  attack:{duration:2.3,peak:.8,poses:[[0,'idle',0],...poses('dash',[[.1,0],[.18,1],[.3,2]]),[.43,'slash',0],[.52,'cross',1],[.78,'slash',3],[.92,'slash',4],[1.18,'slash',5],...poses('dash',[[1.45,2],[1.62,4]]),[1.85,'idle',0]],hits:[{at:.8,target:0}]},
  cross:{duration:2.85,peak:1.24,poses:[[0,'idle',0],[.1,'dash',1],[.25,'dash',2],...poses('cross',[[.42,0],[.57,1],[.85,2],[1.18,3],[1.33,4],[1.62,5]]),[2.05,'dash',2],[2.34,'idle',0]],hits:[{at:.87,target:0},{at:1.24,target:0}]},
  cast:{duration:5.1,peak:2.58,poses:poses('cast',[[0,0],[.22,1],[.61,2],[1.08,3],[3.85,4],[4.35,5]]).concat([[4.85,'idle',0]]),hits:[]},
  ultimate:{duration:5.65,peak:3.77,poses:poses('ultimate',[[0,0],[.55,2],[1.45,3],[3.05,4],[4.6,5]]).concat([[5.3,'idle',0]]),hits:[]},
  hit:{duration:1.45,peak:.36,poses:poses('hit',[[0,0],[.12,1],[.24,2],[.46,3],[.77,4],[1.03,5]]).concat([[1.25,'idle',0]]),hits:[]},
  defeat:{duration:2.6,peak:2.5,poses:poses('defeat',[[0,0],[.25,1],[.58,2],[1.02,3],[1.52,4],[2.05,5]]),hits:[]}
 };
 const result={mode,name:MODES[mode],...plans[mode]},area=AREA_SKILLS[mode];
 if(area){const count=Math.max(0,Math.floor(targetCount));result.area=true;result.hits=area.waves.flatMap((at,wave)=>Array.from({length:count},(_,target)=>({at:at+target*area.stagger,target,wave}))).sort((a,b)=>a.at-b.at);}
 return result;
}
