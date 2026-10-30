export const SSS_CUBE=Object.freeze({code:'SSS_MIRACLE_CUBE',name:'SSS 미라클큐브',image:'/assets/ui/sss-miracle-cube-20261021/cube-768.webp',counts:[1,10],version:'20261021-v1',path:'/sss-miracle-cube/'});
export const SSS_CUBE_TOTAL=10_000_000_000;
export const emptySssCubePolicy=()=>({mode:'OFF',cards:{},stockLimits:{},notes:''});
export function sssCubePercent(units){
 if(units===null||units===undefined)return '';
 return String(Math.floor(units/100_000_000))+(units%100_000_000?'.'+String(units%100_000_000).padStart(8,'0').replace(/0+$/,''):'');
}
export function parseSssCubePercent(value){
 const text=String(value).trim();if(!text)return null;
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(text))throw Error('확률은 0~100%, 소수점 8자리까지 입력하세요.');
 const [whole,fraction='']=text.split('.'),units=Number(whole)*100_000_000+Number(fraction.padEnd(8,'0'));
 if(!Number.isSafeInteger(units)||units>SSS_CUBE_TOTAL)throw Error('확률은 0~100%로 입력하세요.');return units;
}
export function validateSssCubePolicy(raw,catalog){
 if(!raw||!['cards,mode,notes','cards,mode,notes,stockLimits'].includes(Object.keys(raw).sort().join(','))||!['OFF','ON'].includes(raw.mode))throw Error('개봉 상태와 확률 설정을 확인하세요.');
 if(!raw.cards||typeof raw.cards!=='object'||Array.isArray(raw.cards)||Object.keys(raw.cards).length>300)throw Error('용병별 확률을 확인하세요.');
 const cards={};
 for(const [code,units] of Object.entries(raw.cards)){
  if(!catalog.some(c=>c.code===code&&c.rank==='SSS'))throw Error('SSS 일반·SSS 리미티드 용병만 선택할 수 있습니다.');
  if(units!==null&&(!Number.isSafeInteger(units)||units<0||units>SSS_CUBE_TOTAL))throw Error('용병 확률 입력값을 확인하세요.');
  cards[code]=units;
 }
 if(typeof raw.notes!=='string'||raw.notes.length>1000)throw Error('운영 메모는 1,000자 이내로 입력하세요.');
 const stockLimits={};
 if(raw.stockLimits!==undefined&&(!raw.stockLimits||typeof raw.stockLimits!=='object'||Array.isArray(raw.stockLimits)))throw Error('큐브 전용 한도를 확인하세요.');
 for(const [code,limit] of Object.entries(raw.stockLimits||{})){
  const card=catalog.find(c=>c.code===code&&c.limited&&c.cubeEligible);
  if(!card||!Number.isSafeInteger(limit)||limit<0||limit>1_000_000||limit<(card.issued??0))throw Error('큐브 한도는 이미 발행한 수량 이상, 0~1,000,000장으로 입력하세요.');
  stockLimits[code]=limit;
 }
 for(const card of catalog)if(card.cubeEligible&&!Object.hasOwn(stockLimits,card.code)&&Number.isSafeInteger(card.stockLimit))stockLimits[card.code]=card.stockLimit;
 return {mode:raw.mode,cards,stockLimits,notes:raw.notes};
}
export const sssCubeSoldOut=card=>Boolean(card?.limited&&card.cubeEligible&&card.rank==='SSS'&&Number.isSafeInteger(card.stockLimit)&&card.stockLimit>0&&card.issued===card.stockLimit&&card.remaining===0);
export function sssCubeEffectivePercent(units,total){
 if(units===null||units===undefined)return '';
 if(!units||!total)return '0';
 return sssCubePercent(Number((BigInt(units)*BigInt(SSS_CUBE_TOTAL)+BigInt(Math.floor(total/2)))/BigInt(total)));
}
export function sssCubeReadiness(policy,catalog){
 const total=Object.values(policy.cards).reduce((sum,n)=>sum+(n??0),0),blockers=[],excludedCodes=[];let availableTotal=0;
 if(total!==SSS_CUBE_TOTAL)blockers.push(`개별 용병 확률 합계를 100%로 맞추세요. 현재 ${sssCubePercent(total)}%입니다.`);
 for(const [code,units] of Object.entries(policy.cards))if(units>0){
  const card=catalog.find(c=>c.code===code);
  if(sssCubeSoldOut(card))excludedCodes.push(code);
  else if(!card?.available||card.rank!=='SSS')blockers.push(`${card?.name||code}: ${card?.lockReason||'획득할 수 없는 용병입니다.'}`);
  else availableTotal+=units;
 }
 if(!blockers.length&&!availableTotal)blockers.push('획득 가능한 용병이 모두 소진됐습니다.');
 return {ready:!blockers.length,total,availableTotal,excludedCodes,blockers};
}
export function pickSssCubeBatch(policy,catalog,count,random){
 if(!SSS_CUBE.counts.includes(count)||!sssCubeReadiness(policy,catalog).ready)throw Error('SSS 미라클큐브 구성과 개봉 횟수를 확인하세요.');
 const selected=catalog.filter(c=>policy.cards[c.code]>0&&c.available),used=new Map(),draws=[];
 for(let i=0;i<count;i++){
  // Sample the original integer weights directly: no rounding or retry rolls.
  // Exhausted stock is removed before the next draw, including within a batch.
  const candidates=selected.filter(c=>!c.limited||(used.get(c.code)||0)<c.remaining),total=candidates.reduce((sum,c)=>sum+policy.cards[c.code],0);
  if(!total)throw Object.assign(Error('선택한 개봉에 필요한 리미티드 잔여 수량이 부족합니다. 큐브는 소모되지 않았습니다.'),{code:'SSS_CUBE_STOCK',status:409,terminal:true});
  let ticket=random(total);if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=total)throw Error('Invalid SSS cube random value');
  const card=candidates.find(c=>{ticket-=policy.cards[c.code];return ticket<0;});if(!card)throw Error('Incomplete SSS cube distribution');
  if(card.limited){
   const n=(used.get(card.code)||0)+1;used.set(card.code,n);
   if(n>card.remaining)throw Object.assign(Error('선택한 개봉에 필요한 리미티드 잔여 수량이 부족합니다. 큐브는 소모되지 않았습니다.'),{code:'SSS_CUBE_STOCK',status:409,terminal:true});
  }
  draws.push({mercenaryCode:card.code,name:card.name,rank:'SSS',limited:card.limited,edition:card.limited?'SSS_LIMITED':'STANDARD',sourceArt:card.sourceArt,quantity:1,...(card.limited?{stockLimit:card.stockLimit,...(card.stockCode?{stockCode:card.stockCode,stockScope:card.stockScope}:{})}:{})});
 }
 return draws;
}
