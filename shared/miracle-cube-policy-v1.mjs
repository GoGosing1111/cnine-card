export const MIRACLE_RANKS=Object.freeze(['C','B','A','S','SS','SSS']);
export const MIRACLE_TOTAL=100_000_000;
export const MIRACLE_CUBE=Object.freeze({code:'MIRACLE_CUBE',name:'미라클 큐브',image:'/assets/ui/miracle-cube-v1/cube-closed.webp',counts:[1,10],version:'20261003-v1'});
export const emptyMiraclePolicy=()=>({mode:'OFF',ranks:Object.fromEntries(MIRACLE_RANKS.map(rank=>[rank,0])),cards:{},notes:''});
export const miraclePercent=units=>Number((Number(units||0)/1_000_000).toFixed(6));
export function parseMiraclePercent(value){
 const text=String(value).trim();if(!/^\d+(?:\.\d{1,6})?$/.test(text))throw Error('확률은 0~100%, 소수점 6자리까지 입력하세요.');
 const [whole,fraction='']=text.split('.'),units=Number(whole)*1_000_000+Number(fraction.padEnd(6,'0'));
 if(!Number.isSafeInteger(units)||units>MIRACLE_TOTAL)throw Error('확률은 0~100%로 입력하세요.');return units;
}
export function validateMiraclePolicy(raw,catalog){
 if(!raw||!['OFF','ON'].includes(raw.mode))throw Error('개봉 상태를 확인하세요.');
 if(!raw.ranks||Object.keys(raw.ranks).sort().join()!==[...MIRACLE_RANKS].sort().join())throw Error('C부터 SSS까지 등급 확률을 입력하세요.');
 const value=n=>{if(!Number.isSafeInteger(n)||n<0||n>MIRACLE_TOTAL)throw Error('확률 입력값을 확인하세요.');return n;};
 const ranks=Object.fromEntries(MIRACLE_RANKS.map(rank=>[rank,value(raw.ranks[rank])])),cards={};
 if(!raw.cards||Array.isArray(raw.cards)||Object.keys(raw.cards).length>300)throw Error('용병별 확률을 확인하세요.');
 for(const [code,units]of Object.entries(raw.cards)){
  if(!/^V-\d{3}$/.test(code)||!catalog.some(card=>card.code===code))throw Error('등록된 용병만 확률을 지정할 수 있습니다.');
  cards[code]=value(units);
 }
 if(typeof raw.notes!=='string'||raw.notes.length>1000)throw Error('운영 메모는 1,000자 이내로 입력하세요.');
 return {mode:raw.mode,ranks,cards,notes:raw.notes};
}
export function miracleReadiness(policy,catalog){
 const blockers=[];
 const total=MIRACLE_RANKS.reduce((n,rank)=>n+policy.ranks[rank],0);
 if(total!==MIRACLE_TOTAL)blockers.push(`등급 확률 합계가 ${miraclePercent(total)}%입니다. 100%로 맞추세요.`);
 for(const rank of MIRACLE_RANKS){
  const pool=catalog.filter(card=>card.rank===rank),sum=pool.reduce((n,card)=>n+(policy.cards[card.code]||0),0);
  if(policy.ranks[rank]>0&&sum!==MIRACLE_TOTAL)blockers.push(`${rank} 등급 안의 용병 확률 합계가 ${miraclePercent(sum)}%입니다. 100%로 맞추세요.`);
 }
 for(const card of catalog)if((policy.cards[card.code]||0)>0&&!card.available)blockers.push(`${card.name}: 현재 획득이 잠긴 용병입니다.`);
 return {ready:blockers.length===0,blockers,total};
}
export function miracleOdds(policy,catalog){return catalog.map(card=>({...card,withinRankPercent:miraclePercent(policy.cards[card.code]),percent:policy.ranks[card.rank]/MIRACLE_TOTAL*miraclePercent(policy.cards[card.code])}));}
export function rollMiracleCube(policy,catalog,randomInt){
 const pick=rows=>{let ticket=randomInt(MIRACLE_TOTAL);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=MIRACLE_TOTAL)throw Error('Invalid miracle random value');for(const [value,weight]of rows){ticket-=weight;if(ticket<0)return value;}throw Error('Incomplete miracle distribution');};
 const rank=pick(MIRACLE_RANKS.map(rank=>[rank,policy.ranks[rank]]));
 const card=pick(catalog.filter(card=>card.rank===rank&&card.available).map(card=>[card,policy.cards[card.code]||0]));
 return {rank,mercenaryCode:card.code,name:card.name,sourceArt:card.sourceArt,quantity:1};
}
