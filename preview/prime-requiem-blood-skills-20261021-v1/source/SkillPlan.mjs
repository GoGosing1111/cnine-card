import {READY_POSE} from './MotionAtlas.mjs';
export const clamp=(n,a=0,b=1)=>Math.min(b,Math.max(a,Number(n)||0));
const hit=(time,pose,group=0,target=0,extra={})=>({time,pose,group,target,...extra});
const skills=[
  {
    id:'blood-dash',name:'혈섬 돌진',subtitle:'BLOOD FLASH',type:'일반기',kind:'dash',
    description:'낮게 파고들어 검끝으로 관통하고, 몸을 틀어 한 번 더 벤다. 혈광과 잔상이 돌진 궤적을 뒤따른다.',
    duration:2,phases:[.1,.3,.64,1.24,1.78],
    hits:[hit(.64,3,0),hit(.99,5,1)],
    effect:'fx-blood-dash',targetMode:'single',previewTargetCount:1
  },
  {
    id:'blood-echo',name:'혈영 연참',subtitle:'SCARLET ECHO',type:'일반기',kind:'echo',
    description:'횡베기와 내려베기를 연이어 꽂은 뒤, 검을 내질러 마무리한다. 네 번의 검격마다 혈영이 한 박자 늦게 겹친다.',
    duration:2.65,phases:[.1,.34,.68,1.98,2.44],
    hits:[hit(.68,5,0),hit(1.04,6,1),hit(1.4,5,2),hit(1.76,3,3)],
    effect:'fx-blood-echo',targetMode:'single',previewTargetCount:1
  },
  {
    id:'blood-frenzy',name:'혈검 난무',subtitle:'BLOOD BLADE FRENZY',type:'일반기',kind:'frenzy',
    description:'올려베기·내려베기·횡베기를 일곱 번 몰아친다. 검이 맞는 순간 짧게 멈추고, 다음 혈검을 즉시 이어 넣는다.',
    duration:2.85,phases:[.08,.3,.56,2.36,2.68],
    hits:[hit(.56,5,0),hit(.82,6,1),hit(1.08,5,2),hit(1.34,3,3),hit(1.6,5,0),hit(1.86,6,1),hit(2.16,3,3,0,{heavy:true})],
    effect:'fx-blood-frenzy-v2',targetMode:'single',previewTargetCount:1,replaces:'blood-core'
  },
  {
    id:'blood-tiger',name:'혈호 강림',subtitle:'SANGUINE WHITE TIGER',type:'광역기',kind:'tiger',
    description:'검을 내리긋는 순간 적진에 포효하는 혈백호의 머리가 나타난다. 응축된 혈기가 즉시 터져 전열을 덮친다.',
    duration:2.5,phases:[.1,.42,1.02,1.48,2.28],
    hits:[hit(1.02,6,0,0,{area:true}),hit(1.28,6,0,0,{area:true,heavy:true})],
    poses:[[0,READY_POSE],[.24,4],[.55,5],[.94,6],[1.48,5],[1.92,READY_POSE]],
    effect:'fx-blood-tiger-burst',effectStartFrame:4,targetMode:'area',previewTargetCount:5
  },
  {
    id:'blood-execution',name:'혈영섬 · 참형',subtitle:'BLOODSHADOW EXECUTION',type:'광역기',kind:'execution',
    description:'적진 사이를 연속 돌파하며 열 번 벤다. 마지막 검격에 모든 혈영이 교차해 거대한 십자 참격을 남긴다.',
    duration:3.85,phases:[.08,.34,.62,3.2,3.65],
    hits:[hit(.62,3,0,0),hit(.88,5,1,1),hit(1.14,6,0,2),hit(1.4,3,1,3),hit(1.66,5,0,4),
      hit(1.92,6,1,3),hit(2.18,3,0,2),hit(2.44,5,1,1),hit(2.7,6,0,0),hit(3.05,5,2,2,{area:true,heavy:true})],
    effect:'fx-blood-execution-v2',targetMode:'area',previewTargetCount:5,replaces:'requiem'
  },
  {
    id:'blood-cataclysm',name:'혈천개벽',subtitle:'SANGUINE CATACLYSM',type:'특수 광역기',kind:'cataclysm',showcase:true,
    description:'검에 혈기를 끌어모아 거대 혈검으로 응축한다. 도약 내려베기로 대지를 가르고, 적진 전체에 혈류 기둥을 연쇄 분출시킨다.',
    duration:4.5,phases:[.22,.7,1.68,3.2,4.16],
    phaseNames:['혈기 흡수','거대 혈검 · 도약','대지 절단 · 연쇄 분출','혈류 소멸'],
    hits:[hit(1.68,6,0,1,{area:true,heavy:true}),
      ...[1.96,2.15,2.34,2.53,2.82].map((t,i)=>hit(t,6,i,i%5,{area:true,heavy:i===4,contactMode:'effect'}))],
    poses:[[0,READY_POSE],[.28,1],[.64,4],[1.35,4],[1.48,5],[1.625,6],[3.2,6],[3.75,1],[4.15,READY_POSE]],
    effect:'fx-blood-cataclysm-v3',targetMode:'area',previewTargetCount:5,iconFrame:9,
    videoReference:{url:'https://youtu.be/vfBuylrhTFc',range:[15.3,22.5],playbackRate:.4,
      choreography:'INWARD_BLOOD_GATHER_SWORD_RELEASE_THEN_TOWERING_GROUND_ERUPTION'}
  },
  {
    id:'blood-moonfall',name:'적월 무간참',subtitle:'CRIMSON MOON ONSLAUGHT',type:'특수 광역기',kind:'moonfall',showcase:true,
    description:'열두 번의 검격으로 적진을 꿰뚫고 혈영을 남긴다. 잠깐의 정적 뒤 거대한 혈월 참격이 전장을 가르며 모든 혈흔을 터뜨린다.',
    duration:4.95,phases:[.12,.34,.68,3.7,4.65],
    phaseNames:['혈검 해방','혈영 돌파','열두 연참 · 적월 절단','핏빛 잔상'],
    hits:[...Array.from({length:12},(_,i)=>hit(Number((.68+i*.2).toFixed(2)),[3,5,6,5][i%4],i%2,[0,1,3,4,2,4,3,1,0,1,3,2][i])),
      hit(3.62,5,2,1,{area:true,heavy:true})],
    effect:'fx-blood-mooncleave-v3',targetMode:'area',previewTargetCount:5,iconFrame:10,
    videoReference:{url:'https://youtu.be/vfBuylrhTFc',range:[24.5,28.5],playbackRate:.4,
      choreography:'FAST_SWORD_RUSH_LIQUID_AFTERTRAILS_BRIEF_HOLD_THEN_OVERSIZED_FINISHER'}
  }
];
function makePoses(s){
  if(s.poses)return s.poses;
  const poses=[[0,READY_POSE],[.2,2]];
  for(const [i,h] of s.hits.entries()){
    if(i>0)poses.push([h.time-.14,h.pose===3?2:4]);
    poses.push([h.time-.055,h.pose],[h.time+.085,h.pose===3?6:2]);
  }
  if(s.kind==='moonfall')poses.push([3.08,4]);
  poses.push([s.duration-.24,READY_POSE]);
  return poses.sort((a,b)=>a[0]-b[0]);
}
export const SKILLS=skills.map(s=>({
  ...s,sheet:'motion-user-eight-v2',poses:makePoses(s),contacts:s.hits.map(h=>h.time),
  nameStatus:'USER_APPROVED_20261021',runtimeEnabled:true,damage:null,cooldown:null,range:null,
  gameplayTargetCount:null,bloodCost:null,contactAuthority:'VISUAL_CUE_ONLY_SERVER_RECEIPT',
  gameplayPolicy:'shared/mercenary-prime-requiem-v1.mjs'
}));
export function ease(q){q=clamp(q);return q*q*(3-2*q);}
export function sample(plan,time){
  const t=clamp(time,0,plan.duration),done=t>=plan.duration;
  const state={time:t,done,pose:plan.poses.findLast(p=>t>=p[0])?.[1]??READY_POSE,
    effectFrame:null,phase:'전투 준비',phaseIndex:-1,progress:0,contactIndex:-1,strike:0};
  if(t>0&&!done){
    const names=plan.phaseNames||['검격 준비','돌파 · 연속 검격','연속 타격','혈흔 소멸'];
    for(let i=0;i<4;i++)if(t>=plan.phases[i]&&t<plan.phases[i+1]){
      state.phaseIndex=i;state.progress=(t-plan.phases[i])/(plan.phases[i+1]-plan.phases[i]);
      state.effectFrame=i*4+Math.min(3,Math.floor(state.progress*4));state.phase=names[i];
    }
    if(t>=plan.phases[4])state.phase='검 회수';
    for(let i=0;i<plan.hits.length;i++)if(t>=plan.hits[i].time&&t<plan.hits[i].time+.14){
      state.contactIndex=i;state.strike=Math.sin((t-plan.hits[i].time)/.14*Math.PI);
      state.phase=`${i+1} / ${plan.hits.length} 연속 타격`;
    }
  }
  if(done){state.pose=READY_POSE;state.phase='완료';}
  return state;
}
