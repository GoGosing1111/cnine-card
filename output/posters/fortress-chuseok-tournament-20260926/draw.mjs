import {randomInt} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';

const destination=new URL('./draw.json',import.meta.url);
if(existsSync(destination)) throw new Error('Draw already exists. Do not reroll an established tournament draw.');
const entrants=['나무늘봉순','주성','강구열','하이희야','오리꿍','디임'];
const shuffled=[...entrants],swaps=[];
for(let i=shuffled.length-1;i>0;i--){
  const j=randomInt(i+1);
  [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  swaps.push({i,j});
}
const result={
  title:'추석기념 포트리스 토너먼트',
  startsAt:'2026-09-26T20:00:00+09:00',
  timeZone:'Asia/Seoul',
  format:'All six entrants play three first-round matches; after three winners are known, draw one finalist by bye; the other two play for the second final place. All matches best of three.',
  drawMethod:'One Fisher-Yates shuffle using node:crypto.randomInt with unbiased indices. Existing pairings are retained and the two remaining entrants form match three. No reroll.',
  drawnAt:new Date().toISOString(),
  entrants,shuffled,swaps,
  firstRound:[
    {id:'M1',label:'1경기',players:[shuffled[0],shuffled[1]]},
    {id:'M2',label:'2경기',players:[shuffled[3],shuffled[4]]},
    {id:'M3',label:'3경기',players:[shuffled[2],shuffled[5]]}
  ],
  firstRoundByes:[],
  threeWinnerStage:{
    entrants:['1경기 승자','2경기 승자','3경기 승자'],
    draw:{count:1,among:3,when:'After the first round',status:'PENDING_FIRST_ROUND_RESULTS'},
    byeDestination:'결승',
    match:{id:'R3',label:'3강전',players:'추첨 부전승자를 제외한 남은 2명',winnerDestination:'결승'}
  },
  final:{id:'F',label:'결승',players:['부전승 진출자','3강전 승자']}
};
writeFileSync(destination,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
