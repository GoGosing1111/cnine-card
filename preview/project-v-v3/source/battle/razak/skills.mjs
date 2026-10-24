// Visual choreography only; damage, target limits, cooldowns and rank are unassigned.
export const POSES={idle:'고정 대기',dash:'암살 이동',cross:'교차 베기',flurry:'연속 베기',eclipse:'회전 참격',hit:'피격',defeat:'전투 불능'};
export const SKILLS={
 cross:{name:'그림자 교차',type:'ATTACK',description:'순간 돌진 · 쌍곡도 교차 베기 · 즉시 회수',duration:1.8,peak:.68,
 poses:[[0,'idle'],[.08,'cross',0],[.16,'dash',0],[.35,'cross',0],[.47,'cross',1],[.62,'cross',2],[.78,'cross',3],[.94,'dash',1],[1.2,'cross',4],[1.4,'idle']],
 movement:[[0,0],[.16,0],[.35,1],[.85,1],[.94,.96],[1.2,0],[1.8,0]],
 effects:[{key:'cross',start:.36,end:.52,from:0,to:3,target:0,size:1.4},{key:'cross',start:.52,end:.8,from:4,to:6,target:0,size:1.4},{key:'cross',start:.8,end:1.28,from:7,to:11,target:0,size:1.4}],
 hits:[{at:.52,target:0},{at:.68,target:0}],cues:[[0,'준비'],[.16,'잔상 돌진'],[.47,'첫 검격'],[.62,'교차 베기'],[.94,'회수'],[1.4,'대기 복귀']]},
 flurry:{name:'무영 연살',type:'ATTACK',description:'낮은 베기 → 올려 베기 → 내려찍기 · 빠른 후퇴',duration:2.35,peak:1.17,
 poses:[[0,'idle'],[.08,'flurry',0],[.14,'dash',0],[.34,'flurry',0],[.46,'flurry',1],[.7,'flurry',2],[.9,'flurry',3],[1.08,'flurry',4],[1.3,'flurry',5],[1.48,'dash',1],[1.75,'idle']],
 movement:[[0,0],[.14,0],[.34,1],[.65,1],[.72,1.06],[.92,1.02],[1.32,1.02],[1.48,.98],[1.75,0],[2.35,0]],
 effects:[{key:'flurry',start:.34,end:.67,from:0,to:3,target:0,size:1.28,y:.17},{key:'flurry',start:.67,end:.92,from:4,to:5,target:0,size:1.28},{key:'flurry',start:.92,end:1.28,from:6,to:7,target:0,size:1.4},{key:'flurry',start:1.28,end:1.8,from:8,to:11,target:0,size:1.4}],
 hits:[{at:.52,target:0},{at:.8,target:0},{at:1.17,target:0}],cues:[[0,'낮은 자세'],[.14,'잔상 돌진'],[.46,'하단 베기'],[.7,'상단 올려 베기'],[1.08,'종결 참격'],[1.48,'회수'],[1.75,'대기 복귀']]},
 eclipse:{name:'월식 난무',type:'AREA',description:'적 진형에 진입해 회전하며 원형 검격을 펼친 뒤 복귀',duration:3,peak:1.15,
 poses:[[0,'idle'],[.08,'eclipse',0],[.17,'dash',0],[.39,'eclipse',0],[.57,'eclipse',1],[.77,'eclipse',2],[.98,'eclipse',3],[1.19,'eclipse',4],[1.49,'eclipse',5],[1.75,'dash',1],[2.05,'idle']],
 movement:[[0,0],[.17,0],[.39,1],[.58,1],[.8,1.06],[1.05,.98],[1.28,1.04],[1.6,1],[1.75,1],[2.05,0],[3,0]],
 effects:[{key:'eclipse',start:.53,end:1.95,from:0,to:11,target:'area',size:3.4}],
 hits:Array.from({length:5},(_,i)=>({at:1.03+i*.055,target:i})),cues:[[0,'회전 준비'],[.17,'진형 진입'],[.57,'회전 시작'],[.98,'광역 참격'],[1.75,'잔상 회수'],[2.05,'대기 복귀']]}
};
export function posePlan(mode){return{name:POSES[mode],type:'POSE',description:mode==='idle'?'몸체 한 프레임 고정':POSES[mode]+' 동작 검수',duration:mode==='idle'?1:1.4,peak:.7,poses:[[0,mode]],movement:mode==='dash'?[[0,0],[.2,0],[.65,.7],[.95,.7],[1.4,0]]:[[0,0],[1.4,0]],effects:[],hits:[],cues:[[0,POSES[mode]]]};}
export function sampleMovement(steps,time){for(let i=1;i<steps.length;i++){const[a,x]=steps[i-1],[b,y]=steps[i];if(time<=b){const p=Math.max(0,Math.min(1,(time-a)/(b-a)));return x+(y-x)*p*p*(3-2*p);}}return steps.at(-1)[1];}
export function sampleStep(steps,time){let value=steps[0][1];for(const[t,v]of steps){if(t>time)break;value=v;}return value;}

