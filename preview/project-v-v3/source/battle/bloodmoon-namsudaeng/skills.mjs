// Authored visual cues only. Live balance and server events are defined in mercenary-bloodmoon-namsudaeng-v1.mjs.
export const POSES={idle:'고정 대기',dash:'이동',draw:'조준',release:'발사',cast:'상공 사격',hit:'피격',defeat:'전투 불능'};
const shot=(release,hit,target=0,variant='pierce',sky=false)=>({release,hit,target,variant,sky});
export const SKILLS={
 pierce:{name:'적월 관통',description:'깊게 당긴 한 발이 목표를 꿰뚫고 붉은 파편을 남깁니다.',duration:3.4,peak:1.68,
  poses:[[0,'idle'],[.12,'draw'],[1.05,'release'],[1.95,'recover'],[2.7,'idle']],shots:[shot(1.05,1.6)],charge:[.25,1.05],cues:[[0,'조준'],[.25,'화살 응축'],[1.05,'관통 화살 발사'],[1.6,'관통 적중'],[2.7,'자세 복귀']]},
 volley:{name:'혈월 연사',description:'빠르게 세 발을 이어 쏘아 전열의 서로 다른 목표를 맞힙니다.',duration:4.4,peak:2.38,
  poses:[[0,'idle'],[.12,'draw'],[.85,'release'],[1.15,'drawFast'],[1.43,'release'],[1.72,'drawFast'],[2,'release'],[2.8,'recover'],[3.55,'idle']],shots:[shot(.85,1.35,0,'volley'),shot(1.43,1.98,1,'volley'),shot(2,2.55,2,'volley')],charge:[.3,.85],cues:[[0,'첫 조준'],[.85,'첫 발'],[1.43,'두 번째 발'],[2,'세 번째 발'],[3.55,'자세 복귀']]},
 rain:{name:'월식 화살비',description:'상공으로 쏜 화살이 갈라져 적 진형에 순차적으로 쏟아집니다.',duration:5.5,peak:3.12,
  poses:[[0,'idle'],[.15,'draw'],[.9,'cast'],[1.7,'castRelease'],[2.5,'recover'],[4.45,'idle']],shots:[shot(1.7,2.45,0,'rain',true),...Array.from({length:10},(_,i)=>shot(2.55+i*.09,2.95+i*.09,i%5,'rain'))],charge:[.6,1.7],cues:[[0,'상공 조준'],[.9,'붉은 달의 기운'],[1.7,'상공 발사'],[2.55,'화살비 낙하'],[2.95,'진형 연속 적중'],[4.45,'자세 복귀']]}
};
export function posePlan(mode){const duration=mode==='defeat'?2.4:mode==='idle'?1:2;return{name:POSES[mode],description:mode==='idle'?'몸체 한 프레임 고정':POSES[mode]+' 동작 검수',duration,peak:duration*.6,poses:[[0,mode]],shots:[],charge:null,cues:[[0,POSES[mode]]]};}
export function sampleStep(steps,t){let value=steps[0][1];for(const [at,next]of steps){if(at>t)break;value=next;}return value;}
