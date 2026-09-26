import {sniperOrikkungSelectionWeights} from './mercenary-sniper-orikkung-v1.mjs';
import {nurseSelectionWeights} from './mercenary-nurse-healers-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';
import {cryvernSelectionWeights} from './mercenary-cryvern-v1.mjs';

export const DRAW_TOTAL = 1_000_000;
export const DRAW_MAX_BYTES = 24 * 1024;
export const MERCENARY_CARD_RULES=Object.freeze({sameRankSelection:'WEIGHTED',ownershipWeighting:'NONE',duplicateHandling:'COUNT_EXTRA_COPIES',cardWeights:Object.freeze({})});
export const MAX_MERCENARY_CARD_WEIGHT=1_000_000;
export const DRAW_OUTCOMES = Object.freeze([
  ...MERCENARY_RANKS.map(rank=>Object.freeze({id:`CARD_${rank}`,type:'MERCENARY_CARD',rank,label:`${rank} 용병카드`})),
  Object.freeze({id:'MASTER_STAR',type:'MASTER_STAR',rank:null,label:'마스터의 별'}),
  Object.freeze({id:'MYSTIC_ENERGY',type:'MYSTIC_ENERGY',rank:null,label:'미스틱에너지'}),
  Object.freeze({id:'NONE',type:'NONE',rank:null,label:'꽝'})
]);
export function suggestedMercenaryDraw(){
  const chances=[100000,10000,1000,100,10,1,100000,200000,588889];
  return {format:'MERCENARY_DRAW_DRAFT_V1',status:'DRAFT',openingEnabled:false,
    cardRules:{...MERCENARY_CARD_RULES,cardWeights:{}},
    outcomes:DRAW_OUTCOMES.map((row,i)=>({id:row.id,chancePpm:chances[i],quantity:row.id==='NONE'?0:1})),
    notes:'SSS 0.0001%를 기준으로 한 단계 낮아질 때마다 10배로 설정한 확률·수량 제안 초안. 등급 안에서는 용병별 가중치로 추첨하며 미설정 가중치는 1입니다. 보유 여부는 반영하지 않고 중복 당첨은 수량으로 집계합니다.'};
}
function exactKeys(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))throw Error(`${label}: 누락되거나 허용되지 않은 항목이 있습니다.`);
}
export function validateMercenaryDraw(policy,{catalogCodes}={}){
  const fields=['format','status','openingEnabled','outcomes','notes'];
  exactKeys(policy,Object.hasOwn(policy||{},'cardRules')?[...fields,'cardRules']:fields,'개봉 확률');
  const cardRules=validateMercenaryCardRules(policy.cardRules,catalogCodes);
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
  return {...policy,cardRules,outcomes:ordered};
}
export function validateMercenaryCardRules(rules,catalogCodes){
  if(rules===undefined)return {...MERCENARY_CARD_RULES,cardWeights:{}};
  const legacy=rules?.sameRankSelection==='UNIFORM';
  exactKeys(rules,legacy?['sameRankSelection','ownershipWeighting','duplicateHandling']:Object.keys(MERCENARY_CARD_RULES),'카드 추첨 규칙');
  if(!['UNIFORM','WEIGHTED'].includes(rules.sameRankSelection)||rules.ownershipWeighting!=='NONE'||rules.duplicateHandling!=='COUNT_EXTRA_COPIES')throw Error('카드 추첨 규칙: 용병별 가중치·보유 여부 미반영·중복 수량 집계를 사용하세요.');
  const weights=legacy?{}:rules.cardWeights;
  if(!weights||typeof weights!=='object'||Array.isArray(weights)||Object.keys(weights).length>1000)throw Error('카드 추첨 규칙: 용병별 가중치를 확인하세요.');
  const cardWeights={};
  for(const code of Object.keys(weights).sort()){
    const weight=weights[code];
    if(!/^V-\d{3}$/.test(code)||(catalogCodes&&!catalogCodes.includes(code))||!Number.isSafeInteger(weight)||weight<1||weight>MAX_MERCENARY_CARD_WEIGHT)throw Error('카드 추첨 규칙: 등록된 용병의 가중치를 1~1,000,000 정수로 입력하세요.');
    cardWeights[code]=weight;
  }
  return {...MERCENARY_CARD_RULES,cardWeights};
}
export function mercenaryCardChances(chancePpm,codes,rules){
  const effective=sniperOrikkungSelectionWeights(codes,nurseSelectionWeights(codes,cryvernSelectionWeights(codes,rules?.cardWeights||{})));
  const weights=codes.map(code=>effective[code]??1),totalWeight=weights.reduce((a,b)=>a+b,0);
  return codes.map((code,i)=>({code,weight:weights[i],totalWeight,withinRankPercent:weights[i]/totalWeight*100,
    percent:Number.isSafeInteger(chancePpm)?chancePpm*weights[i]/(10000*totalWeight):null}));
}
// The catalog is the pool authority. Ownership and per-card dropRate are not inputs.
export function mercenaryGradePools(mercenaries,catalogCodes){
  if(!Array.isArray(catalogCodes)||!catalogCodes.length||new Set(catalogCodes).size!==catalogCodes.length||
     !Array.isArray(mercenaries)||mercenaries.length!==catalogCodes.length||new Set(mercenaries.map(row=>row?.code)).size!==catalogCodes.length||
     mercenaries.some(row=>!catalogCodes.includes(row?.code)||(row.rank!==null&&!MERCENARY_RANKS.includes(row.rank))))throw Error('등록된 용병의 코드와 등급을 확인하세요.');
  return Object.fromEntries(MERCENARY_RANKS.map(rank=>[rank,mercenaries.filter(row=>row.rank===rank).map(row=>row.code).sort()]));
}
export function equalMercenaryCardChance(chancePpm,count){
  if(!Number.isSafeInteger(chancePpm)||chancePpm<0||chancePpm>DRAW_TOTAL||!Number.isSafeInteger(count)||count<1)return null;
  return {numerator:chancePpm,denominator:DRAW_TOTAL*count,percent:chancePpm/(10000*count)};
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
