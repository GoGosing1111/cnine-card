import {ORGANIZATIONS,orgAssert} from './organization-system-v1.mjs';
export const ORGANIZATION_INTERVIEW_VERSION=1;
const choice=(id,label,detail,traits)=>({id,label,detail,traits});
export const ORGANIZATION_INTERVIEW=[
 {id:'motive',chapter:'문을 두드린 이유',title:'오늘, 조직의 문을 두드린 이유는 무엇입니까?',context:'같은 도시를 바라보더라도, 그 안에서 원하는 자리는 다릅니다.',options:[
  choice('name','내 이름을 도시 위에 남기고 싶다.','작은 골목에 머무르지 않고 더 큰 세력을 만든다.',{ambition:3,influence:2}),
  choice('crew','등을 맡길 수 있는 동료가 필요하다.','혼자 얻는 승리보다 함께 오래 살아남는 쪽을 택한다.',{loyalty:3,guard:2}),
  choice('skill','내 실력으로 자리를 증명하고 싶다.','남이 정한 서열보다 내가 해낸 결과로 인정받는다.',{precision:3,resolve:2}),
  choice('board','도시의 흐름을 읽고 판을 바꾸고 싶다.','정보와 자원을 모아 다음 기회를 설계한다.',{strategy:3,wealth:2})]},
 {id:'approach',chapter:'거점을 여는 방식',title:'새 거점의 문이 굳게 닫혀 있습니다. 당신의 첫 움직임은?',context:'정면에는 경계가 삼엄하고, 주변 골목의 사정은 아직 확실하지 않습니다.',options:[
  choice('front','정면에서 기세를 잡는다.','주저하는 사이를 주지 않고 선두에서 흐름을 만든다.',{assault:3,resolve:2}),
  choice('flank','빠르게 돌아 빈틈을 찾는다.','상대의 시선 밖으로 움직여 필요한 순간에 들어간다.',{mobility:3,precision:2}),
  choice('observe','주변 동선을 먼저 파악한다.','조급히 움직이지 않고 정보를 모아 확실한 때를 고른다.',{intel:3,patience:2}),
  choice('cover','동료의 진입과 퇴로부터 확보한다.','한 번의 돌파보다 모두가 움직일 수 있는 길을 만든다.',{guard:3,discipline:2})]},
 {id:'pressure',chapter:'불리한 판에서의 선택',title:'거점 경쟁이 예상보다 불리해졌습니다. 무엇부터 결정합니까?',context:'남은 기회는 많지 않습니다. 한 번의 판단이 조직 전체의 다음 움직임을 정합니다.',options:[
  choice('turn','아직 남은 역전 지점에 힘을 모은다.','결정적인 순간에는 물러서지 않고 승부를 건다.',{resolve:3,assault:2}),
  choice('lure','상대가 예상하는 흐름을 뒤집는다.','정해 둔 방식을 버리고 다른 거점과 동선을 이용한다.',{strategy:3,intel:2}),
  choice('regroup','흩어진 동료를 모아 전열을 다시 갖춘다.','조직의 손실을 줄이고 함께 다음 기회를 만든다.',{loyalty:3,guard:2}),
  choice('trade','지킬 것과 내줄 것을 냉정하게 나눈다.','이번 자리보다 조직에 남을 실익을 우선한다.',{wealth:3,influence:2})]},
 {id:'information',chapter:'정보를 다루는 태도',title:'다른 조직의 약점이라는 정보가 들어왔습니다. 어떻게 다룹니까?',context:'정보가 사실이라면 유리한 기회입니다. 하지만 출처는 완전히 확인되지 않았습니다.',options:[
  choice('verify','교차 확인해 사실부터 가린다.','작은 어긋남도 확인하고 확실한 근거를 남긴다.',{intel:3,precision:2}),
  choice('negotiate','정보가 열어 줄 협상 기회를 찾는다.','직접 움직이는 것보다 관계와 거래가 유리할 수 있다.',{influence:3,wealth:2}),
  choice('wait','바로 쓰지 않고 결정적인 때까지 묵힌다.','상대의 움직임을 더 지켜본 뒤 가장 큰 효과를 노린다.',{patience:3,strategy:2}),
  choice('system','조직 안에서 확인 절차와 대응책을 정한다.','누가 움직여도 같은 판단을 할 수 있도록 준비한다.',{discipline:3,industry:2})]},
 {id:'role',chapter:'내가 맡을 자리',title:'조직이 함께 움직일 때, 가장 자신 있게 맡을 자리는?',context:'조직의 힘은 같은 사람이 열 명 모였을 때보다, 서로의 빈틈을 채울 때 커집니다.',options:[
  choice('vanguard','가장 먼저 길을 여는 선봉.','결단이 필요한 순간에 앞으로 나서 흐름을 만든다.',{assault:3,resolve:2}),
  choice('specialist','필요한 곳을 정확히 짚는 별동대.','빠른 이동과 정교한 실행으로 결정적인 일을 끝낸다.',{precision:3,mobility:2}),
  choice('coordinator','전체를 읽고 사람을 잇는 조율자.','서로 다른 움직임을 하나의 작전으로 연결한다.',{strategy:3,influence:2}),
  choice('foundation','조직이 흔들리지 않도록 받치는 기반.','보급과 거점을 정비해 동료가 돌아올 자리를 지킨다.',{industry:3,guard:2})]},
 {id:'resources',chapter:'함께 얻은 성과',title:'첫 공동 성과를 얻었습니다. 조직의 자원을 어디에 먼저 씁니까?',context:'모든 곳에 한꺼번에 쓸 수는 없습니다. 다음 성장의 우선순위를 골라야 합니다.',options:[
  choice('base','아지트와 운영 기반을 먼저 다진다.','한 번 얻은 성과가 오래 이어지도록 체계를 만든다.',{industry:3,discipline:2}),
  choice('members','동료들의 부족한 부분을 함께 채운다.','일부의 강함보다 조직 전체가 성장하는 쪽을 택한다.',{loyalty:3,guard:2}),
  choice('expand','새 영역에 도전할 준비를 한다.','지금의 기세를 다음 거점과 더 큰 기회로 이어 간다.',{ambition:3,assault:2}),
  choice('reserve','다음 기회를 위해 여력을 남긴다.','서두르지 않고 자원을 쥐고 가장 유리한 때를 기다린다.',{wealth:3,patience:2})]},
 {id:'pledge',chapter:'입단을 앞둔 마지막 말',title:'마지막으로, 이 조직에 남기고 싶은 약속을 고르십시오.',context:'어떤 말이 가장 멋진지보다, 당신이 실제로 지킬 수 있는 말을 고르세요.',options:[
  choice('promise','함께하기로 한 약속은 끝까지 지키겠습니다.','동료의 신뢰와 조직의 원칙을 가볍게 여기지 않는다.',{loyalty:3,discipline:2}),
  choice('finish','맡은 일은 정확히, 끝까지 해내겠습니다.','기회를 기다릴 줄 알고 결정적인 순간에는 실수하지 않는다.',{precision:3,patience:2}),
  choice('decide','조직이 망설일 때 먼저 결단하겠습니다.','어려운 상황에서도 다음 목표를 향해 움직인다.',{resolve:3,ambition:2}),
  choice('connect','더 넓은 시야와 연결을 가져오겠습니다.','도시의 흐름을 읽고 조직에 필요한 기회를 잇는다.',{intel:3,influence:2})]}
];
export const ORGANIZATION_IDENTITIES=[
 ['선두에서 길을 여는 조직','돌파력과 결단으로 새로운 영역을 여는 성향.',{assault:3,resolve:2,loyalty:1}],
 ['두 번의 빈틈을 남기지 않는 조직','빠른 움직임과 정교한 실행을 중시하는 성향.',{precision:3,mobility:2,strategy:1}],
 ['판을 읽고 기회를 쥐는 조직','계획과 타이밍을 맞춰 한 수 앞을 보는 성향.',{strategy:3,precision:2,patience:1}],
 ['동료가 돌아올 자리를 지키는 조직','버티는 힘과 책임감으로 동료를 받치는 성향.',{guard:3,resolve:2,loyalty:1}],
 ['흐름을 잡으면 놓치지 않는 조직','기동력과 과감한 확장으로 주도권을 잡는 성향.',{assault:3,mobility:2,ambition:1}],
 ['도시의 소식을 가장 먼저 읽는 조직','정보와 관찰을 모아 전략을 만드는 성향.',{intel:3,strategy:2,patience:1}],
 ['서로의 등을 끝까지 지키는 조직','유대감과 빠른 협동을 가장 큰 힘으로 보는 성향.',{loyalty:3,mobility:2,resolve:1}],
 ['흔들리지 않는 질서의 조직','역할과 원칙을 지켜 단단한 전열을 만드는 성향.',{discipline:3,guard:2,resolve:1}],
 ['한 번 세운 기반을 무너뜨리지 않는 조직','준비와 실행을 쌓아 성과를 만드는 성향.',{industry:3,assault:2,guard:1}],
 ['결정적인 한 순간을 놓치지 않는 조직','신중한 관찰 뒤 정확히 움직이는 성향.',{precision:3,patience:2,mobility:1}],
 ['보이지 않는 흐름을 움직이는 조직','관계와 정보로 조직의 영향력을 넓히는 성향.',{influence:3,strategy:2,intel:1}],
 ['기회의 가치를 알아보는 조직','자원과 실익을 더 큰 성장으로 잇는 성향.',{wealth:3,ambition:2,influence:1}],
 ['서두르지 않고 틈을 찾아드는 조직','기다림과 관찰로 유리한 동선을 찾는 성향.',{patience:3,intel:2,mobility:1}],
 ['오래 버티는 힘을 만드는 조직','기반과 약속을 차곡차곡 쌓는 성향.',{discipline:3,industry:2,loyalty:1}],
 ['물러서지 않는 의지의 조직','강한 결단과 야심으로 어려운 판을 넘는 성향.',{resolve:3,assault:2,ambition:1}]
].map(([motto,description,traits],i)=>({...ORGANIZATIONS[i],motto,description,traits}));
export const ORGANIZATION_TRAIT_NAMES={assault:'돌파',resolve:'결단',precision:'정밀',mobility:'기동',strategy:'설계',guard:'수호',loyalty:'신뢰',ambition:'야심',intel:'통찰',patience:'인내',influence:'교섭',wealth:'실리',industry:'기반',discipline:'원칙'};
export function reviewOrganizationAnswers(answers){
  orgAssert(answers&&typeof answers==='object'&&!Array.isArray(answers)&&Object.keys(answers).length===ORGANIZATION_INTERVIEW.length,'INTERVIEW','입단 심사 7개 질문에 모두 답해주세요.',400);
  const chosen=ORGANIZATION_INTERVIEW.map(q=>{const option=q.options.find(o=>o.id===answers[q.id]);orgAssert(option,'INTERVIEW','입단 심사 답변을 확인하세요.',400);return {question:q,option};});
  const dot=(a,b)=>Object.entries(a).reduce((n,[key,value])=>n+value*(b[key]||0),0),traits={};
  for(const {option} of chosen)for(const [key,value] of Object.entries(option.traits))traits[key]=(traits[key]||0)+value;
  const recommendations=ORGANIZATION_IDENTITIES.map(org=>{
    const maximum=ORGANIZATION_INTERVIEW.reduce((n,q)=>n+Math.max(...q.options.map(o=>dot(o.traits,org.traits))),0);
    const score=Math.round(dot(traits,org.traits)/maximum*100);
    const reasons=chosen.map(({question,option})=>({chapter:question.chapter,answer:option.label,weight:dot(option.traits,org.traits)})).filter(r=>r.weight>0).sort((a,b)=>b.weight-a.weight).slice(0,2).map(({chapter,answer})=>({chapter,answer}));
    return {...org,score,reasons};
  }).sort((a,b)=>b.score-a.score||a.id-b.id);
  return {version:ORGANIZATION_INTERVIEW_VERSION,answers:Object.fromEntries(chosen.map(({question,option})=>[question.id,option.id])),traits:Object.entries(traits).sort((a,b)=>b[1]-a[1]).map(([key,value])=>({key,label:ORGANIZATION_TRAIT_NAMES[key],value})),recommendations,organizationFit:ORGANIZATIONS.map(org=>recommendations.find(r=>r.id===org.id).score)};
}
