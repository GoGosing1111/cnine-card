export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
// Shoulder rests pass behind the head. Forward swings pass in front of the body.
export const weaponBehindBody=(pose,frame)=>pose==='idle'||({danjoe:[0,7,8],heukwol:[0,8],jongeon:[0,1,2,8],myeol:[0,7,8]}[pose]||[]).includes(frame);
export const SKILLS=Object.freeze({
 idle:{id:'idle',name:'대기',kind:'IDLE',description:'검은 연무와 붉은 균열이 몸과 대검을 감싼다.',duration:4,contacts:[],events:[[0,'검은 연무'],[2,'붉은 균열']],motion:[]},
 danjoe:{id:'danjoe',name:'단죄',kind:'SINGLE',description:'낮게 파고들어 대검으로 한 적을 가르는 전진 베기.',duration:2.5,contacts:[.83],impact:.83,fxAt:.52,fxDuration:1.55,dash:240,events:[[0,'준비'],[.35,'전진'],[.83,'절단'],[1.3,'잔향'],[2.2,'복귀']],motion:[[0,0],[.20,1],[.38,2],[.60,3],[.78,4],[.91,5],[1.12,6],[1.65,7],[2.1,8]]},
 heukwol:{id:'heukwol',name:'흑월',kind:'SINGLE',description:'올려 베기로 띄운 뒤 양손 대검을 내려찍는 두 차례의 참격.',duration:3.05,contacts:[.70,1.20],impact:1.20,fxAt:.39,fxDuration:1.9,dash:300,events:[[0,'낮은 준비'],[.70,'올려 베기'],[.99,'대검 들어올리기'],[1.20,'내려찍기'],[2.4,'복귀']],motion:[[0,0],[.22,1],[.58,2],[.76,3],[.96,4],[1.15,5],[1.36,6],[2.15,7],[2.6,8]]},
 jongeon:{id:'jongeon',name:'종언',kind:'AREA',description:'아우라를 대검에 응축해 내려찍고, 전장 전체로 검은 검기와 붉은 균열을 퍼뜨린다.',duration:3.8,contacts:[1.46,1.66,1.84],impact:1.66,fxAt:1.13,fxDuration:2.2,dash:70,events:[[0,'기운 응축'],[.68,'대검 들어올리기'],[1.30,'지면 절단'],[1.66,'전장 파열'],[2.60,'검은 잔향'],[3.4,'복귀']],motion:[[0,0],[.18,1],[.49,2],[.72,3],[1.00,4],[1.27,5],[1.52,6],[2.70,7],[3.25,8]]},
 myeol:{id:'myeol',name:'멸참',kind:'AREA',description:'대검에 검은 연무를 압축한 뒤 크게 횡으로 베어, 붉은 칼날의 검기가 적진 전체를 관통한다.',duration:3.4,contacts:[1.10,1.23,1.36],impact:1.23,fxAt:.75,fxDuration:1.9,dash:135,events:[[0,'검기 압축'],[.55,'뒤로 당기기'],[1.10,'대검 횡베기'],[1.23,'적진 관통'],[1.80,'붉은 검흔'],[2.88,'복귀']],motion:[[0,0],[.30,1],[.55,2],[.90,3],[1.05,4],[1.21,5],[1.48,6],[2.40,7],[2.88,8]]}
});
export function sampleSkill(id,time){
 const p=SKILLS[id]||SKILLS.idle,t=clamp(time,0,p.duration);
 let frame=0;for(const [at,n]of p.motion)if(t>=at)frame=n;
 const travel=p.kind==='IDLE'?0:smooth((t-.22)/.45)*(1-smooth((t-(p.duration-.68))/.62))*p.dash;
 const hits=p.contacts.map(at=>({at,age:t-at,strength:t>=at&&t<at+.25?Math.exp(-(t-at)*15):0}));
 const charge=p.kind==='AREA'?smooth(t/.95)*(1-smooth((t-1.3)/.18)):0;
 const stage=[...p.events].reverse().find(([at])=>at<=t)?.[1]||'';
 return {id:p.id,time:t,frame,travel,hits,charge,stage,finished:p.kind!=='IDLE'&&t>=p.duration-.001};
}
