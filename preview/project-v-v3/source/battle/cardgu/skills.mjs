export const MODES={idle:'고정 대기',attack:'기본 공격',deal:'스킬 1 · 스페이드 관통',rip:'스킬 2 · 찢어진 에이스',storm:'광역 1 · 블랙 셔플',crown:'광역 2 · 로열 브레이크',dash:'이동',hit:'피격',defeat:'전투 불능'};
const seq=(key,times)=>times.map((t,i)=>[t,key,i]);
export function plan(mode){
 const common={name:MODES[mode],duration:1,peak:0,poses:[[0,'idle',0]],hits:[],release:0,bank:null};
 if(mode==='idle')return common;
 if(mode==='dash')return {...common,duration:1.4,poses:[[0,'utility',0],[.16,'utility',1],[.32,'utility',0],[.48,'utility',1],[.64,'utility',0],[.8,'utility',1],[1,'idle',0]]};
 if(mode==='hit')return {...common,poses:[[0,'idle',0],[.08,'utility',2],[.65,'idle',0]]};
 if(mode==='defeat')return {...common,duration:1.5,poses:[[0,'idle',0],[.12,'utility',2],[.45,'utility',3]]};
 if(mode==='attack'||mode==='deal')return {...common,bank:'deal',duration:2.55,release:.56,peak:1.15,hits:[{at:.96,target:1}],poses:[...seq('deal',[0,.27,.56,.72,1.36,1.85]),[2.3,'idle',0]]};
 if(mode==='rip')return {...common,bank:'rip',duration:3.15,release:.84,peak:1.47,hits:[{at:1.3,target:1}],poses:[...seq('rip',[0,.3,.59,.84,1.48,2.45]),[2.9,'idle',0]]};
 if(mode==='storm')return {...common,bank:'storm',duration:3.9,release:.8,peak:2.04,hits:[0,1,2,3,4].map((target,i)=>({target,at:1.5+i*.14})),poses:[...seq('storm',[0,.28,.59,.8,1.7,2.95]),[3.6,'idle',0]]};
 if(mode==='crown')return {...common,bank:'crown',duration:4.3,release:1.12,peak:2.14,hits:[0,1,2,3,4].map((target,i)=>({target,at:1.86+i*.075})),poses:[...seq('crown',[0,.32,.68,1.12,1.77,3.26]),[4,'idle',0]]};
 throw Error('Unknown mode '+mode);
}
