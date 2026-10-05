import {LIMITED_MERCENARIES} from './mercenary-limited-catalog-v1.mjs';
import {readLimitedPolicy} from './mercenary-limited-policy-v1.mjs';
// Preparation only. CMS values never bypass this explicit release gate.
export const LIMITED_PACK_RELEASE_ENABLED=false;
export const LIMITED_PACK_KEY='mercenary_limited_pack_v1';
export const LIMITED_PACK_KIND='MERCENARY_LIMITED_OPEN';
export const LIMITED_PACK=Object.freeze({
 id:'mercenary-limited',name:'리미티드 용병팩',maxBatch:10,maxAuto:1000,
 featurePath:'mercenary-limited-pack/config',openPath:'mercenary-limited-pack/open',
 receiptPath:'mercenary-limited-pack/receipt',adminPath:'admin/mercenaries/limited-pack',
 image:'assets/ui/packs/limited-v1/pack-640.webp',frame:'assets/ui/packs/limited-v1/frame-640.webp',
 backdrop:'assets/ui/packs/limited-v1/chamber.webp'
});
export const LIMITED_EXTRA_REWARDS=Object.freeze([
 {id:'MASTER_STAR',name:'마스터의 별',itemCode:'MASTER_STAR'},
 {id:'MYSTIC_ENERGY',name:'미스틱 에너지',itemCode:'STARLIGHT_ARMOR_CORE'},
 {id:'NONE',name:'꽝',itemCode:null}
]);
const codes=LIMITED_MERCENARIES.map(c=>c.code);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function limitedPackDraft(){
 return {format:'MERCENARY_LIMITED_PACK_V1',mode:'OFF',prices:{single:null,ten:null},
 stockLimits:Object.fromEntries(codes.map(code=>[code,null])),
 extraRewards:LIMITED_EXTRA_REWARDS.map(r=>({id:r.id,chancePpm:null,quantity:r.id==='NONE'?0:null}))};
}
export function validateLimitedPack(raw,{releaseEnabled=LIMITED_PACK_RELEASE_ENABLED}={}){
 if(!exact(raw,['format','mode','prices','stockLimits','extraRewards'])||raw.format!=='MERCENARY_LIMITED_PACK_V1'||
 !['OFF','ON'].includes(raw.mode)||(!releaseEnabled&&raw.mode!=='OFF'))throw Error('리미티드팩은 출시 준비 중입니다. 개봉 OFF로 저장하세요.');
 if(!exact(raw.prices,['single','ten'])||Object.values(raw.prices).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<1||n>100000000000000)))throw Error('가격은 미정 또는 1~100조 코인 정수로 입력하세요.');
 if(!exact(raw.stockLimits,codes)||Object.values(raw.stockLimits).some(n=>n!==null&&(!Number.isSafeInteger(n)||n<0||n>1000000)))throw Error('용병별 발행 한도는 미정 또는 0~1,000,000장으로 입력하세요.');
 if(!Array.isArray(raw.extraRewards)||raw.extraRewards.length!==3)throw Error('마스터의 별·미스틱 에너지·꽝을 각각 설정하세요.');
 for(const meta of LIMITED_EXTRA_REWARDS){
  const rows=raw.extraRewards.filter(r=>r?.id===meta.id),r=rows[0];
  if(rows.length!==1||!exact(r,['id','chancePpm','quantity'])||r.chancePpm!==null&&(!Number.isSafeInteger(r.chancePpm)||r.chancePpm<0||r.chancePpm>1000000)||
  (meta.id==='NONE'?r.quantity!==0:r.quantity!==null&&(!Number.isSafeInteger(r.quantity)||r.quantity<1||r.quantity>1000000000)))throw Error('추가 보상의 확률과 수량을 확인하세요.');
 }
 return structuredClone(raw);
}
export function readLimitedPack(value,options){
 const next=structuredClone(value??limitedPackDraft());
 if(next.stockLimits)for(const code of codes)if(!Object.hasOwn(next.stockLimits,code))next.stockLimits[code]=null;
 return validateLimitedPack(next,options);
}
export function limitedPackReadiness(settings,policy,stock=[]){
 const blockers=[],rates=[...Object.values(policy.rankRatesPpm),...settings.extraRewards.map(r=>r.chancePpm)];
 if(Object.values(settings.prices).some(n=>n===null))blockers.push('1회·10회 가격을 설정하세요.');
 if(rates.some(n=>n===null)||rates.reduce((a,n)=>a+(n??0),0)!==1000000)blockers.push('리미티드 등급·재료·꽝 확률의 합계를 100%로 설정하세요.');
 for(const r of settings.extraRewards)if(r.chancePpm>0&&r.id!=='NONE'&&r.quantity===null)blockers.push('재료 보상 수량을 설정하세요.');
 const counts=new Map(stock.map(r=>[r.code,Number(r.issued||0)])),pools={};
 for(const rank of ['SS','SSS']){
  pools[rank]=LIMITED_MERCENARIES.filter(c=>c.rank===rank&&policy.cardWeights[c.code]>0&&Number.isSafeInteger(settings.stockLimits[c.code])&&settings.stockLimits[c.code]>(counts.get(c.code)||0));
  const selected=LIMITED_MERCENARIES.filter(c=>c.rank===rank&&policy.cardWeights[c.code]>0);
  if(policy.rankRatesPpm[rank]>0){
   if(selected.some(c=>settings.stockLimits[c.code]===null))blockers.push(rank+' 용병 발행 한도를 설정하세요.');
   if(!pools[rank].length)blockers.push(rank+' 리미티드 잔여 수량이 없습니다.');
  }
 }
 if(!(policy.rankRatesPpm.SS>0||policy.rankRatesPpm.SSS>0))blockers.push('리미티드 획득 확률을 설정하세요.');
 return {ready:!blockers.length,blockers,pools,totalPpm:rates.reduce((a,n)=>a+(n??0),0)};
}
export function limitedPackPrice(settings,count){
 if(![1,10].includes(count))throw Object.assign(Error('1회 또는 10회 개봉을 선택하세요.'),{code:'MERCENARY_LIMITED_COUNT',status:400});
 const cost=count===10?settings.prices.ten:settings.prices.single;
 if(!Number.isSafeInteger(cost)||cost<1)throw Object.assign(Error('개봉 가격이 아직 설정되지 않았습니다.'),{code:'MERCENARY_LIMITED_PRICE',status:409});
 return cost;
}
export function validateLimitedOpeningBody(body){
 if(!exact(body,['requestId','count','expectedRevision','expectedPolicyRevision'])||
 !/^[A-Za-z0-9_-]{16,100}$/.test(body.requestId)||![1,10].includes(body.count)||
 !Number.isSafeInteger(body.expectedRevision)||body.expectedRevision<0||
 !Number.isSafeInteger(body.expectedPolicyRevision)||body.expectedPolicyRevision<1)throw Object.assign(Error('개봉 횟수와 가격 버전을 다시 확인하세요.'),{code:'MERCENARY_LIMITED_INPUT',status:400});
 return body;
}
export function limitedPackCatalogRow(settings=limitedPackDraft()){
 return {id:LIMITED_PACK.id,name:LIMITED_PACK.name,subtitle:'LIMITED EDITION / MERCENARY',theme:'mercenary-limited',
 description:'용병별 서버 한정 발행 · 전용 계약 개봉',range:'SS · SSS LIMITED',price:settings.prices.single,
 prices:settings.prices,allowed:[],drawMode:'MERCENARY_LIMITED',drawEnabled:LIMITED_PACK_RELEASE_ENABLED&&settings.mode==='ON',
 ownerDrawEnabled:false,maxDrawCount:10,imageUrl:LIMITED_PACK.image,revealMode:'LIMITED_SEQUENCE'};
}
export function limitedReceiptResults(receipt){
 if(receipt?.status!=='COMPLETED'||!Array.isArray(receipt.draws)||!receipt.draws.length||receipt.draws.length>10)throw Error('확정된 리미티드 개봉 결과가 필요합니다.');
 return receipt.draws.map((r,index)=>({...r,kind:r.mercenaryCode?'MERCENARY':r.outcomeId==='NONE'?'MISS':r.outcomeId,
 receiptId:receipt.requestId+':'+index,preview:false,granted:true,
 artUrl:r.mercenaryCode?'/assets/ui/packs/limited-v1/'+r.mercenaryCode.toLowerCase()+'-640.webp':null}));
}
export function limitedPolicyForPack(value){return readLimitedPolicy(value);}
