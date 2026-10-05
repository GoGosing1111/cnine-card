import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';
import {limitedPolicyDraft} from '../../shared/mercenary-limited-policy-v1.mjs';
import {limitedPackDraft,LIMITED_PACK} from '../../shared/mercenary-limited-pack-v1.mjs';
export function previewState(){
 const policy=limitedPolicyDraft(),packSettings=limitedPackDraft();
 policy.rankRatesPpm={SS:150000,SSS:10000};
 packSettings.prices={single:500000000,ten:5000000000};packSettings.stockLimits=Object.fromEntries(LIMITED_MERCENARIES.map(c=>[c.code,c.rank==='SSS'?20:100]));
 packSettings.extraRewards=[{id:'MASTER_STAR',chancePpm:450000,quantity:50000},{id:'MYSTIC_ENERGY',chancePpm:350000,quantity:50},{id:'NONE',chancePpm:40000,quantity:0}];
 return {revision:1,packRevision:0,policy,packSettings,cards:LIMITED_MERCENARIES,stock:LIMITED_MERCENARIES.map(c=>({code:c.code,issued:0,limit:packSettings.stockLimits[c.code],remaining:packSettings.stockLimits[c.code]})),releaseEnabled:false,userOpeningEnabled:true};
}
export function previewService(){
 const state=previewState(),receipts=new Map(),stats={opens:0,active:0,maxActive:0,draws:0};let index=0;
 const api=async(path,options={})=>{
  if(path===LIMITED_PACK.featurePath)return structuredClone(state);
  if(path.startsWith(LIMITED_PACK.receiptPath)){const receipt=receipts.get(new URLSearchParams(path.split('?')[1]).get('requestId'));if(!receipt)throw Object.assign(Error('검수 내역 없음'),{code:'JOINT_NOT_FOUND'});return structuredClone(receipt);}
  if(path!==LIMITED_PACK.openPath||options.method!=='POST')throw Error('검수 API 범위 밖입니다.');
  const {body}=options;if(receipts.has(body.requestId))return structuredClone(receipts.get(body.requestId));
  stats.active++;stats.maxActive=Math.max(stats.maxActive,stats.active);stats.opens++;
  try{
   await new Promise(r=>setTimeout(r,100));const draws=[];
   for(let i=0;i<body.count;i++){
    const card=state.cards[index++%state.cards.length],stock=state.stock.find(s=>s.code===card.code);stock.issued++;stock.remaining--;
    draws.push({mercenaryCode:card.code,outcomeId:'LIMITED_'+card.rank,rank:card.rank,name:card.name,sourceArt:card.sourceArt,serial:stock.issued,quantity:1,duplicate:stock.issued>1,duplicateCount:stock.issued-1});
   }
   stats.draws+=body.count;
   const receipt={requestId:body.requestId,status:'COMPLETED',accountId:7,count:body.count,coinCost:body.count===10?5000000000:500000000,coin:'999999999999',draws};
   receipts.set(body.requestId,receipt);return structuredClone(receipt);
  }finally{stats.active--;}
 };
 return {state,api,stats,receipts};
}
export function memoryStorage(){const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};}
