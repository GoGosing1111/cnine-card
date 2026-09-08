export const DURATION=13.4;
export const MODES=Object.freeze({
  suit:{title:'배틀슈트 조립',english:'EXOSUIT ASSEMBLY',item:'H-BODY',descriptor:'백색 판금 · 엠버 코어',accent:0xffc178,phases:[
    [0,'조립 준비','ASSEMBLY INITIALIZED'],[.8,'하체 프레임 결합','LOWER FRAME'],[2.3,'흉부 장갑 장착','CHEST ARMOR'],[3.7,'견갑 · 팔 모듈 결합','ARM MODULES'],[6,'헬멧 잠금','HELMET LOCK'],[7.5,'슈트 코어 장착','REACTOR INSERT'],[8.5,'시스템 검사','SYSTEM CHECK'],[10.3,'코어 점화','REACTOR ONLINE'],[12,'조립 완료','ASSEMBLY COMPLETE']
  ]},
  vehicle:{title:'차량 제작',english:'VEHICLE ASSEMBLY',item:'LAMBORGHINI VENENO',descriptor:'람보르기니 베네노 · 제작 연출 샘플',accent:0xa8d7e1,phases:[
    [0,'생산 라인 가동','LINE INITIALIZED'],[.6,'차체 프레임 진입','CHASSIS DELIVERY'],[2,'엔진 모듈 탑재','POWERTRAIN INSTALL'],[3.7,'휠 · 구동계 장착','WHEEL FITMENT'],[5.4,'차체 외장 결합','BODY MARRIAGE'],[7.2,'차체 용접 · 체결','PRECISION WELD'],[9.2,'최종 품질 검사','FINAL INSPECTION'],[10.3,'엔진 시동','FIRST IGNITION'],[12,'출고 준비 완료','READY TO ROLL']
  ]}
});
// Presentation only. Never roll success, spend resources or call a crafting API.
export function acceptResult(result){
  if(!result||typeof result.success!=='boolean'||typeof result.requestId!=='string'||!result.requestId)throw new TypeError('확정된 제작 결과가 필요합니다.');
  if(result.success&&!result.output)throw new TypeError('성공 결과의 아이템이 없습니다.');
  return Object.freeze({requestId:result.requestId,success:result.success,output:result.output?Object.freeze({...result.output}):null});
}
export function phaseAt(mode,time,success=true){
  const phases=MODES[mode].phases;
  if(!success&&time>=10.3)return time>=12?['제작 실패','ASSEMBLY FAILED']:['최종 검사 불합격','INSPECTION FAILED'];
  const p=[...phases].reverse().find(p=>p[0]<=time)||phases[0];return p.slice(1);
}
export function previewResult(success){return acceptResult({requestId:'PREVIEW-NO-TRANSACTION',success,output:success?{name:'연출 검수 샘플'}:null});}
