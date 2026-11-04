// Server-decided visual events only. Eligibility, costs, targets, health,
// shields and proc counts are deliberately not computed in this resource pack.
export const ADVANCEMENT_FX=Object.freeze([
 {id:'vanguard',name:'선봉장',trigger:'첫 공격 적중',anchor:'target',width:420,description:'전방 돌격 문장과 압력 부채꼴'},
 {id:'duelist',name:'결투가',trigger:'동일 대상 연속 공격',anchor:'target',width:390,description:'네 방향 표식과 조여드는 결투 고리'},
 {id:'executioner',name:'처형자',trigger:'처형 조건의 공격 적중',anchor:'target',width:420,description:'보라색 봉인 문양을 가르는 교차 절단'},
 {id:'berserker',name:'광전사',trigger:'광폭 상태의 공격',anchor:'self',width:410,description:'각각 솟아오르는 불꽃과 붉은 맥동'},
 {id:'breaker',name:'파괴자',trigger:'보호막 공격 적중',anchor:'target',width:430,description:'갈라지는 황금 균열과 회전하는 방패 파편'},
 {id:'combo',name:'연격자',trigger:'서버가 확정한 추가타',anchor:'target',width:460,description:'시간차로 교차하는 청백색 세 타격선'},
 {id:'vampire',name:'흡혈귀',trigger:'흡혈 회복',anchor:'return',width:280,description:'적에게서 시전자에게 모여드는 붉은 구슬'},
 {id:'avenger',name:'복수자',trigger:'피격 충전 / 다음 공격 발동',anchor:'target',width:410,description:'피격 때 수렴하는 문양과 공격 때 터지는 봉인'},
 {id:'shield-knight',name:'방패기사',trigger:'방패 피해 경감',anchor:'self',width:390,description:'잔여 3·2·1장에 맞춰 갈라지는 은색 방패'},
 {id:'barrier',name:'결계사',trigger:'전투 시작 보호막',anchor:'self',width:440,description:'분리된 여섯 면이 조립되는 청록색 결계'},
 {id:'undying',name:'불사자',trigger:'치명 피해 생존',anchor:'self',width:420,description:'깨진 생명 조각이 돌아와 완성되는 금빛 문장'},
 {id:'regenerator',name:'재생자',trigger:'자신의 행동 종료 회복',anchor:'self',width:410,description:'발밑 광륜에서 나선으로 올라오는 생명 잎'},
 {id:'healer',name:'치유사',trigger:'지정 아군 치유',anchor:'target',width:400,description:'네 방향 빛이 합쳐지는 백금 치유 문장'},
 {id:'guardian',name:'수호자',trigger:'지정 아군 보호막',anchor:'outbound',width:350,description:'날개가 펼쳐지며 아군에게 전달되는 방패'},
 {id:'cleanser',name:'정화사',trigger:'해제 가능한 해로운 효과 제거',anchor:'target',width:410,description:'흰 파문이 검은 해로운 기운을 흩뜨림'},
 {id:'commander',name:'지휘관',trigger:'지휘 효과 활성화',anchor:'self',width:410,description:'펼쳐지는 금빛 깃발과 각 아군 발밑 표식'}
]);
export const FX_BY_ID=new Map(ADVANCEMENT_FX.map(s=>[s.id,s]));
export function resolveClips(id,{phase='proc',remaining=3}={}){
 if(!FX_BY_ID.has(id))throw Error('Unknown advancement effect '+id);
 if(id==='avenger'&&phase==='charge')return ['avenger-charge'];
 if(id==='shield-knight'){
  if(!Number.isInteger(remaining)||remaining<1||remaining>3)throw Error('Shield plate count must be 1..3');
  return ['shield-knight-'+remaining];
 }
 if(id==='cleanser')return ['cleanser-shadow','cleanser'];
 if(id==='commander')return ['commander','commander-mark'];
 return [id];
}
