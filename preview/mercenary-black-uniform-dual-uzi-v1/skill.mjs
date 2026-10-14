export const SKILL = Object.freeze({name:'일제난사',duration:5.8,release:.9,interval:.11,volleys:20,finish:[3.25,3.47,3.69]});
export const QUANTUM = Object.freeze({name:'양자 탄도 폭쇄',duration:7.8,release:.95,interval:.075,volleys:24,detonation:3.25,finish:[3.65,3.83,4.01,4.19,4.37]});
export const PLANS=Object.freeze({barrage:SKILL,quantum:QUANTUM});
export const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const shots=Object.freeze(Array.from({length:SKILL.volleys},(_,i)=>({at:SKILL.release+i*SKILL.interval,target:Math.min(2,Math.floor(i/7)),pair:2})));
export const quantumShots=Object.freeze(Array.from({length:QUANTUM.volleys},(_,i)=>({at:QUANTUM.release+i*QUANTUM.interval,target:i%5,pair:2})));
export const missiles=Object.freeze([
 Object.freeze({id:'primary',target:null,launch:2.15,impact:QUANTUM.detonation,scale:1}),
 ...QUANTUM.finish.map((impact,target)=>Object.freeze({id:'target-'+target,target,launch:impact-1.05,impact,scale:.58}))
]);
export function sample(time,mode='barrage'){
 if(mode==='quantum')return sampleQuantum(time);
 const t=clamp(time,0,SKILL.duration),firing=t>=.9&&t<3.1;
 let pose=0;if(t>=.55&&t<.9)pose=1;else if(firing)pose=2+Math.floor((t-.9)/.11)%4;else if(t>=3.1&&t<3.4)pose=6;else if(t>=3.4&&t<3.85)pose=7;
 return {time:t,pose,firing,done:t>=SKILL.duration,auraFrame:Math.floor(t*8)%12,shots:shots.filter(s=>t>=s.at&&t<s.at+.26),label:t<.9?'스코프 · 표적 포착':t<3.1?'일제난사 · 쌍우지 연속 사격':t<4?'집중 타격 · 조준점 파열':t<5.5?'잔광 · 탄도 소멸':'사격 종료',finishes:SKILL.finish.map((at,target)=>({target,age:t-at})).filter(e=>e.age>=0&&e.age<1.7)};
}
export function sampleQuantum(time){
 const t=clamp(time,0,QUANTUM.duration),firing=t>=.95&&t<2.8;
 let pose=0;if(t>=.6&&t<.95)pose=1;else if(firing)pose=2+Math.floor((t-.95)/.075)%4;else if(t>=2.8&&t<3.15)pose=6;else if(t>=3.15&&t<3.65)pose=7;
 return {time:t,pose,firing,done:t>=QUANTUM.duration,auraFrame:Math.floor(t*8)%12,shots:quantumShots.filter(s=>t>=s.at&&t<s.at+.26),
  label:t<.95?'전원 포착 · 다중 스코프 전개':t<2.15?'쌍우지 난사 · 폭격 좌표 지정':t<3.25?'상공 미사일 강하 · 표적 직격':t<5.1?'양자 탄도 폭쇄 · 미사일 연쇄 폭격':t<6.5?'충격파 · 연쇄 타격 잔향':'광역 사격 종료',
  charge:null,
  missiles:missiles.filter(m=>t>=m.launch&&t<m.impact+.55),
  blast:t>=3.25&&t<6.55?{frame:4+clamp((t-3.25)/3.3)*11,alpha:Math.min(1,(6.55-t)*1.7),age:t-3.25}:null,
  finishes:QUANTUM.finish.map((at,target)=>({target,age:t-at})).filter(e=>e.age>=0&&e.age<1.7),
  dim:clamp(t/.65)*clamp((6.7-t)/1.35)*.46,
  flash:t>=3.25&&t<3.55?Math.sin((t-3.25)/.3*Math.PI)*.24:0};
}
