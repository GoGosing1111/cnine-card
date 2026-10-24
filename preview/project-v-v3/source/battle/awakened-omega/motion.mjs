// Visual choreography only; no damage, balance, rarity or acquisition assignment.
export const POSES={idle:'고정 대기',cleave:'횡베기',sever:'내려베기',orbit:'원형 검파',rupture:'지면 참격'};
export const SKILLS={
 cleave:{name:'성운 횡참',type:'ATTACK',description:'넓은 보폭으로 접근하며 몸통을 비틀어 수평으로 베고 회수한다',duration:2.2,peak:1.04,
 poses:[[0,'idle',0],[.12,'cleave',0],[.3,'cleave',1],[.62,'cleave',2],[.9,'cleave',3],[1.08,'cleave',4],[1.3,'cleave',5],[1.6,'idle',0]],movement:[[0,0],[.2,0],[.85,1],[1.24,1],[1.64,0],[2.2,0]],
 effects:[{key:'cleave',start:.66,end:1.4,from:0,to:11,target:0,size:1.85}],hits:[{at:1.03,target:0}],cues:[[0,'고정 대기'],[.12,'준비'],[.3,'접근'],[.9,'횡베기'],[1.3,'회수']]},
 sever:{name:'천극 단절',type:'ATTACK',description:'검을 높이 들고 긴 보폭으로 체중을 실어 대각선으로 내려벤다',duration:2.6,peak:1.24,
 poses:[[0,'idle',0],[.15,'sever',0],[.38,'sever',1],[.78,'sever',2],[1.12,'sever',3],[1.34,'sever',4],[1.58,'sever',5],[1.95,'idle',0]],movement:[[0,0],[.22,0],[1.08,1],[1.62,1],[2,0],[2.6,0]],
 effects:[{key:'sever',start:.65,end:1.7,from:0,to:5,target:0,size:2.1}],hits:[{at:1.18,target:0}],cues:[[0,'고정 대기'],[.15,'검 들어올리기'],[.78,'힘 모으기'],[1.12,'내려베기'],[1.58,'회수']]},
 orbit:{name:'성환 검역',type:'AREA',description:'발을 축으로 골반과 몸통을 회전시켜 적 진형에 원형 검파를 펼친다',duration:2.8,peak:1.25,
 poses:[[0,'idle',0],[.12,'orbit',0],[.36,'orbit',1],[.7,'orbit',2],[1.04,'orbit',3],[1.32,'orbit',4],[1.58,'orbit',5],[1.96,'idle',0]],movement:[[0,0],[.22,0],[.96,.65],[1.6,.65],[2,0],[2.8,0]],
 effects:[{key:'orbit',start:.55,end:1.85,from:0,to:5,target:'area',size:3.7}],hits:Array.from({length:5},(_,i)=>({at:1.2+i*.035,target:i})),cues:[[0,'고정 대기'],[.12,'회전 준비'],[.7,'회전 베기'],[1.04,'원형 검파'],[1.96,'대기 복귀']]},
 rupture:{name:'종언의 열개',type:'AREA',description:'전신으로 검을 들어 내려찍고 적 진형에 연속 공간 참격을 펼친다',duration:3.4,peak:1.72,
 poses:[[0,'idle',0],[.14,'rupture',0],[.45,'rupture',1],[.92,'rupture',2],[1.38,'rupture',3],[1.67,'rupture',4],[2.1,'rupture',5],[2.5,'idle',0]],movement:[[0,0],[.2,0],[1.25,.28],[2.1,.28],[2.55,0],[3.4,0]],
 effects:[{key:'rupture',start:1.05,end:2.25,from:0,to:5,target:'area',size:3.8}],hits:Array.from({length:5},(_,i)=>({at:1.65+i*.045,target:i})),cues:[[0,'고정 대기'],[.14,'검 들어올리기'],[.92,'집중'],[1.38,'지면 참격'],[1.67,'연속 열개'],[2.5,'대기 복귀']]}
};
export function posePlan(mode){return{name:POSES[mode],type:'POSE',description:mode==='idle'?'몸체 한 프레임 고정':'전신 연속 모션 스프라이트 확인',duration:mode==='idle'?1:2,peak:1.15,poses:[[0,mode]],movement:[[0,0],[2,0]],effects:[],hits:[],cues:[[0,POSES[mode]]]};}
export function sampleMovement(steps,time){for(let i=1;i<steps.length;i++){const[a,x]=steps[i-1],[b,y]=steps[i];if(time<=b){const p=Math.max(0,Math.min(1,(time-a)/(b-a)));return x+(y-x)*p*p*(3-2*p);}}return steps.at(-1)[1];}
export function sampleStep(steps,time){let value=steps[0][1];for(const[t,v]of steps){if(t>time)break;value=v;}return value;}
