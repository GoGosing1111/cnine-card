// Review-only rules. No live reward, combat or account API consumes these values.
export const MECHANICS=Object.freeze({
 CENTER:{name:'코어 동조',english:'RESONANCE LOCK',instruction:'빛이 중앙에 들어오면 정지하세요.',detail:'3회 중 2회 성공 · 중앙의 흰 영역은 PERFECT',windowMs:11000},
 CIRCUIT:{name:'회로 복원',english:'CIRCUIT RECONNECT',instruction:'같은 기호의 단자를 연결하세요.',detail:'3개 회로 연결 · 드래그 또는 단자 두 번 터치',windowMs:14000},
 SHELTER:{name:'차폐 구역 이동',english:'SHELTER SHIFT',instruction:'폭발 전에 파란 차폐 구역을 선택하세요.',detail:'3번의 폭발 회피 · 느낌표 구역은 위험',windowMs:10800}
});
export function cursorPosition(elapsed,round=0){const period=[1800,1560,1320][round%3];const phase=Math.max(0,elapsed)%period/period;return 1-Math.abs(phase*2-1);}
export function gradeTiming(position){if(!Number.isFinite(position)||position<0||position>1)return 'MISS';const distance=Math.abs(position-.5);return distance<=.045+1e-9?'PERFECT':distance<=.12+1e-9?'GOOD':'MISS';}
export function circuitOrder(seed=0){return [[1,2,0],[2,0,1],[2,1,0]][Math.abs(Math.trunc(seed))%3].slice();}
export function circuitTarget(source,order){return order.indexOf(Number(source));}
export function safeCells(wave,seed=0){const patterns=[[0,4,8],[1,3,7],[2,5,6],[0,5,7],[2,3,8]];return patterns[(Math.abs(Math.trunc(seed))+wave)%patterns.length].slice();}
export function insidePort(point,center,radius){return Math.hypot(point.x-center.x,point.y-center.y)<=radius;}
export function summarize(kind,rounds){
 if(kind==='CENTER'){const hits=rounds.filter(r=>['GOOD','PERFECT'].includes(r.grade)).length;return {success:hits>=2,score:hits,total:3,perfect:rounds.length===3&&rounds.every(r=>r.grade==='PERFECT')};}
 if(kind==='CIRCUIT')return {success:new Set(rounds.filter(r=>r.correct).map(r=>r.source)).size===3,score:new Set(rounds.filter(r=>r.correct).map(r=>r.source)).size,total:3};
 return {success:rounds.length===3&&rounds.every(r=>r.safe),score:rounds.filter(r=>r.safe).length,total:3};
}
