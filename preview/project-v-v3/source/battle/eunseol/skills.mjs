// Visual timing only. This file deliberately carries no damage, cooldown,
// acquisition, deck or live account configuration.
export const POSES=Object.freeze({idle:'대기',dash:'대시',slash:'광역 참격',cast:'백호 개방',ultimate:'만월 검술',hit:'피격',defeat:'전투 불능'});
export const SKILLS=Object.freeze({
  moon:{name:'설백월참',description:'검을 크게 휘둘러 전열을 가르는 반월 검기',duration:3.6,peak:1.12,
    poses:[[0,'idle'],[.16,'windup'],[.74,'slash'],[1.65,'recover'],[2.38,'idle']],
    movement:[[0,0],[.16,-18],[.66,-26],[.91,155],[1.65,155],[2.4,0],[3.6,0]],
    cues:[[0,'검기 응축'],[.74,'광역 횡참'],[.99,'전열 관통'],[1.65,'검기 잔광'],[2.4,'자세 복귀']],
    effects:[{kind:'slash',start:.74,end:1.5,from:.29,to:.93,y:.56,width:.61,angle:-.1}],
    impacts:[.99,1.09,1.19],auraBoost:1.35},
  tiger:{name:'백호천류',description:'직선으로 내지른 검끝에서 솟구치는 백호',duration:4.8,peak:2.36,
    poses:[[0,'idle'],[.14,'windup'],[.85,'cast'],[1.32,'slash'],[2.9,'recover'],[3.7,'idle']],
    movement:[[0,0],[.7,-25],[1.3,-25],[1.58,115],[2.7,115],[3.7,0],[4.8,0]],
    cues:[[0,'백호 검기 집중'],[.85,'전신 아우라 개방'],[1.32,'검끝의 돌파'],[1.65,'백호 검기 질주'],[2.25,'광역 충돌'],[3.7,'자세 복귀']],
    effects:[{kind:'slash',start:1.32,end:2.15,from:.3,to:.95,y:.58,width:.53,angle:.03},{kind:'tiger',start:1.65,end:3.1,from:.34,to:.94,y:.51,width:.53,angle:0}],
    impacts:[2.25,2.39,2.53],auraBoost:1.9},
  domain:{name:'만월검역',description:'전신 아우라를 펼쳐 쏟아내는 연속 광역 검격',duration:6.3,peak:4.2,
    poses:[[0,'idle'],[.16,'windup'],[.8,'cast'],[1.6,'ultimate'],[4.8,'recover'],[5.55,'idle']],
    movement:[[0,0],[.75,-20],[1.55,-20],[1.8,120],[2.17,100],[2.65,175],[3.15,145],[3.85,195],[4.8,195],[5.55,0],[6.3,0]],
    cues:[[0,'전신 검기 응축'],[.8,'만월 검역 개방'],[1.6,'첫 번째 광역 검격'],[2.43,'교차 반월 검격'],[3.12,'백호 검혼 강림'],[3.66,'백호 종결참'],[5.55,'자세 복귀']],
    effects:[{kind:'slash',start:1.6,end:2.42,from:.31,to:.94,y:.55,width:.6,angle:-.3},{kind:'slash',start:2.43,end:3.3,from:.35,to:.97,y:.57,width:.65,angle:.25},{kind:'slash',start:3.66,end:4.7,from:.36,to:.97,y:.57,width:.78,angle:0},{kind:'tiger',start:3.8,end:5.05,from:.39,to:.97,y:.49,width:.66,angle:0}],
    impacts:[1.93,2.02,2.11,2.78,2.88,2.98,4.12,4.25,4.38],auraBoost:2.3}
});
export function posePlan(pose){return {name:pose==='idle'?'전신 아우라':POSES[pose],description:pose==='idle'?'머리부터 발끝까지 이어지는 은백·자색 아우라':`${POSES[pose]} · 전투 전신 동작`,duration:4,peak:1.6,poses:[[0,pose]],movement:[[0,0],[4,0]],cues:[[0,POSES[pose]]],effects:[],impacts:[],auraBoost:pose==='cast'?1.65:1};}
export function sampleStep(frames,time){let value=frames[0][1];for(const [at,next]of frames){if(at>time)break;value=next;}return value;}
export function sampleMovement(frames,time){for(let i=1;i<frames.length;i++){const [end,to]=frames[i],[start,from]=frames[i-1];if(time<=end){const p=Math.max(0,Math.min(1,(time-start)/(end-start))),e=p*p*(3-2*p);return from+(to-from)*e;}}return frames.at(-1)[1];}
