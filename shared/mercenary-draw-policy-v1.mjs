import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';

export const DRAW_TOTAL = 1_000_000;
export const DRAW_MAX_BYTES = 24 * 1024;
export const DRAW_OUTCOMES = Object.freeze([
  ...MERCENARY_RANKS.map(rank=>Object.freeze({id:`CARD_${rank}`,type:'MERCENARY_CARD',rank,label:`${rank} 용병카드`})),
  Object.freeze({id:'MASTER_STAR',type:'MASTER_STAR',rank:null,label:'마스터의 별'}),
  Object.freeze({id:'MYSTIC_ENERGY',type:'MYSTIC_ENERGY',rank:null,label:'미스틱에너지'}),
  Object.freeze({id:'NONE',type:'NONE',rank:null,label:'꽝'})
]);
export function suggestedMercenaryDraw(){
  const chances=[100000,10000,1000,100,10,1,100000,200000,588889];
  return {format:'MERCENARY_DRAW_DRAFT_V1',status:'DRAFT',openingEnabled:false,
    outcomes:DRAW_OUTCOMES.map((row,i)=>({id:row.id,chancePpm:chances[i],quantity:row.id==='NONE'?0:1})),
    notes:'SSS 0.0001%를 기준으로 한 단계 낮아질 때마다 10배로 설정한 확률·수량 제안 초안. 개봉 비용, 동일 등급 내 카드별 확률, 획득 대상, 중복 처리와 공동 출시 조건은 별도 확정 필요.'};
}
function exactKeys(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error(`${label}: 누락되거나 허용되지 않은 항목이 있습니다.`);
}
export function validateMercenaryDraw(policy){
  exactKeys(policy,['format','status','openingEnabled','outcomes','notes'],'개봉 확률');
  if(policy.format!=='MERCENARY_DRAW_DRAFT_V1'||policy.status!=='DRAFT'||policy.openingEnabled!==false)throw Error('유저 개봉 OFF 상태의 초안만 저장할 수 있습니다.');
  if(!Array.isArray(policy.outcomes)||policy.outcomes.length!==9||new Set(policy.outcomes.map(row=>row?.id)).size!==9)throw Error('용병 6등급·마스터의 별·미스틱에너지·꽝을 각각 한 번씩 설정하세요.');
  let total=0;
  const ordered=DRAW_OUTCOMES.map(meta=>{
    const row=policy.outcomes.find(row=>row?.id===meta.id);
    exactKeys(row,['id','chancePpm','quantity'],meta.label);
    if(!Number.isSafeInteger(row.chancePpm)||row.chancePpm<0||row.chancePpm>DRAW_TOTAL)throw Error(`${meta.label}: 확률은 0~100%, 소수점 넷째 자리까지 입력하세요.`);
    if(!Number.isSafeInteger(row.quantity)||row.quantity<0||row.quantity>1_000_000_000||
       (meta.type==='MERCENARY_CARD'&&row.quantity!==1)||(meta.type==='NONE'&&row.quantity!==0)||
       (['MASTER_STAR','MYSTIC_ENERGY'].includes(meta.type)&&row.quantity<1))throw Error(`${meta.label}: 카드 1장·꽝 0개, 재화는 1~1,000,000,000개의 정수로 설정하세요.`);
    total+=row.chancePpm;return {...row};
  });
  if(total!==DRAW_TOTAL)throw Error(`전체 확률 합계를 100%로 맞추세요. 현재 ${formatDrawPercent(total)}%입니다.`);
  if(typeof policy.notes!=='string'||policy.notes.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(policy.notes))throw Error('확률 메모는 2,000자 이내로 입력하세요.');
  return {...policy,outcomes:ordered};
}
export function parseDrawPercent(value){
  if(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value.trim()))return null;
  const [whole,fraction='']=value.trim().split('.');
  const result=Number(whole)*10000+Number(fraction.padEnd(4,'0'));
  return Number.isSafeInteger(result)&&result<=DRAW_TOTAL?result:null;
}
export const formatDrawPercent=units=>Number.isFinite(units)?String(Number((units/10000).toFixed(4))):'미설정';
export function summarizeMercenaryDraw(policy){
  const groups={MERCENARY_CARD:0,MASTER_STAR:0,MYSTIC_ENERGY:0,NONE:0};
  for(const row of policy.outcomes){const meta=DRAW_OUTCOMES.find(item=>item.id===row.id);if(meta&&Number.isSafeInteger(row.chancePpm))groups[meta.type]+=row.chancePpm;}
  return {groups,total:Object.values(groups).reduce((sum,value)=>sum+value,0),missing:policy.outcomes.some(row=>!Number.isSafeInteger(row.chancePpm))};
}
