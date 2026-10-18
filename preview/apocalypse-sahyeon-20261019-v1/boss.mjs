import {ROOT,SAHYEON as LIVE_SAHYEON} from "../../shared/apocalypse-sahyeon-v1.mjs";
export {ROOT};
export const SAHYEON=Object.freeze({...LIVE_SAHYEON,reviewOnly:true});
export const STORY={
 premise:'쿠온이 사라진 이들의 기억을 지킨다면, 사현은 그들이 사라지기 직전의 미래에 갇혀 있다.',
 paragraphs:[
  '관측소가 무너진 밤, 사현은 눈앞에서 한 도시가 소멸하는 순간을 보았다. 그는 현문안을 열어 멸망에 이르는 선택을 하나씩 지웠다. 그러나 남은 미래마다 같은 사람이 죽었다. 마지막 선택을 지운 뒤, 관측소에는 사현 혼자 남았다.',
  '공허법상은 사현이 소환한 신이 아니다. 지워진 미래 속에서 끝내 돌아오지 못한 사람들의 윤곽이다. 사현이 눈을 감으면 법상도 멎는다. 그가 다시 눈을 뜰 때마다 유리 가슴 안에는 이름 없는 그림자가 하나씩 늘어난다.',
  '쿠온은 관측소 문 앞에 그날의 명부를 두고 갔다. 사현은 아직 그것을 펼치지 못했다. 이름을 읽는 순간 자신이 구하려던 사람들이 누구였는지, 그리고 누구를 지워 왔는지 알게 될 것이기 때문이다.'
 ],
 dialogue:[['쿠온','살린 사람의 이름을 기억하나.'],['사현','다음에는 아무도 잃지 않는다.'],['쿠온','그 말을 몇 번이나 했지.'],['사현','…이번에는 네가 보지 못한 길이 있다.']],
 entry:'눈을 감아. 네가 사라지는 미래까지 보고 싶지는 않다.',
 ultimate:'남은 가능성은, 내가 접겠다.'
};
export function doubledProfile(reference){
 if(!Number.isFinite(reference?.battlePower)||reference.battlePower<=0)throw Error('Verified Azuma profile required');
 return {...structuredClone(reference),battlePower:reference.battlePower*2,rewardCoin:0,rewardPercent:0,clearBonus:{coinPercent:null,masterStars:null,mysticEnergy:null},skillName:SAHYEON.skills.map(s=>s.name).join(' · '),skillDescription:'현문안 봉인 → 공백회랑 → 공허법상. 보스와 여섯 잔영을 모두 처치해야 합니다.'};
}
