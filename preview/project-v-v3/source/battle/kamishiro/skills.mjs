export const MODES={idle:'고정 대기',cleave:'흑염참',rise:'혈선역참',thrust:'암영돌파',eclipse:'적월멸검',ruin:'흑경난무'};
export const SKILL_KEYS=['cleave','rise','thrust','eclipse','ruin'];
const poses=(key,t)=>t.map((at,i)=>[at,key,i]);
export function plan(mode){
 const base={name:MODES[mode],bank:mode,duration:4,peak:0,kind:'IDLE',poses:[[0,'idle',0]],hits:[],release:0,fxEnd:0,description:'붉은 네온 윤곽 · 발밑에 낮게 깔리는 흑적 기운'};
 if(mode==='idle')return base;
 const single=(duration,release,peak,desc,times,travel)=>({...base,duration,release,peak,fxEnd:travel.leave,kind:'SINGLE',description:desc,travel:{target:1,...travel},poses:[...poses(mode,times),[duration-.18,'idle',0]],hits:[{at:peak-.12,target:1}]});
 if(mode==='cleave')return single(2.7,.68,1.08,'적 앞으로 파고들어 대검으로 직접 횡베기 후 복귀',[0,.24,.62,.82,1.5,2.05],{depart:.15,arrive:.62,leave:1.5,home:2.35,standoff:.92});
 if(mode==='rise')return single(3.0,.78,1.2,'적에게 접근해 대검을 직접 올려 베고 복귀',[0,.24,.72,1.34,1.75,2.4],{depart:.18,arrive:.72,leave:1.7,home:2.62,standoff:.67});
 if(mode==='thrust')return single(2.8,.73,1.15,'검을 앞세워 적 앞으로 돌진해 직접 찌르고 복귀',[0,.24,.67,.88,1.58,2.15],{depart:.12,arrive:.67,leave:1.55,home:2.42,standoff:1.08});
 if(mode==='eclipse')return {...base,duration:4.35,release:.95,peak:1.98,fxEnd:3.95,kind:'AREA',description:'적 진영을 크게 가르는 붉은 대검 검월',poses:[...poses(mode,[0,.35,.72,1.02,2.1,3.45]),[4.1,'idle',0]],hits:[0,1,2,3,4].map((target,i)=>({target,at:1.68+i*.12}))};
 if(mode==='ruin')return {...base,duration:4.7,release:1.05,peak:2.13,fxEnd:3.95,kind:'AREA',description:'적 앞으로 돌진해 검신·교차 검기로 연속 타격 후 복귀',travel:{target:1,depart:.40,arrive:1.15,leave:3.15,home:4.18},poses:[...poses(mode,[0,.4,.8,1.12,3.15,3.7]),[4.45,'idle',0]],hits:[1,0,2,3,4].map((target,i)=>({target,at:1.35+i*.39}))};
 throw Error('Unknown mode '+mode);
}
