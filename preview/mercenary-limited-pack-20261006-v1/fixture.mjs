import {LIMITED_MERCENARIES} from '../../shared/mercenary-limited-catalog-v1.mjs';
import {limitedPolicyDraft} from '../../shared/mercenary-limited-policy-v1.mjs';
import {limitedPackDraft,LIMITED_PACK} from '../../shared/mercenary-limited-pack-v1.mjs';
import {PREVIEW_NORMAL_CARDS} from './normal-roster.mjs';
export function previewState(){
 const policy=limitedPolicyDraft(),packSettings=limitedPackDraft();
 // Illustration-only values; this fixture never writes production economics.
 policy.rankRatesPpm={SS:10,SSS:1};
 packSettings.normalRankRatesPpm={C:500000,B:300000,A:140000,S:50000,SS:9000,SSS:989};
 packSettings.prices={single:500000000,ten:5000000000};packSettings.stockLimits=Object.fromEntries(LIMITED_MERCENARIES.map(c=>[c.code,c.rank==='SSS'?20:100]));
 packSettings.extraRewards=[{id:'MASTER_STAR',chancePpm:0,quantity:50000},{id:'MYSTIC_ENERGY',chancePpm:0,quantity:50},{id:'NONE',chancePpm:0,quantity:0}];
 const normalCards=structuredClone(PREVIEW_NORMAL_CARDS);
 return {revision:1,packRevision:0,policy,packSettings,cards:LIMITED_MERCENARIES,normalCards,stock:LIMITED_MERCENARIES.map(c=>({code:c.code,issued:0,limit:packSettings.stockLimits[c.code],remaining:packSettings.stockLimits[c.code]})),releaseEnabled:false,userOpeningEnabled:true};
}
export function previewService(){
 const state=previewState(),receipts=new Map(),stats={opens:0,active:0,maxActive:0,draws:0},copies=new Map();let index=0;
 // Cycle normal and limited artwork deliberately; this is not a probability simulation.
 const demoCards=[state.normalCards.find(c=>c.rank==='C'),state.cards.find(c=>c.rank==='SS'),state.cards.find(c=>c.rank==='SSS'),...['B','A','S','SS','SSS'].map(rank=>state.normalCards.find(c=>c.rank===rank))];
 const api=async(path,options={})=>{
  if(path===LIMITED_PACK.featurePath)return structuredClone(state);
  if(path.startsWith(LIMITED_PACK.receiptPath)){const receipt=receipts.get(new URLSearchParams(path.split('?')[1]).get('requestId'));if(!receipt)throw Object.assign(Error('검수 내역 없음'),{code:'JOINT_NOT_FOUND'});return structuredClone(receipt);}
  if(path!==LIMITED_PACK.openPath||options.method!=='POST')throw Error('검수 API 범위 밖입니다.');
  const {body}=options;if(receipts.has(body.requestId))return structuredClone(receipts.get(body.requestId));
  stats.active++;stats.maxActive=Math.max(stats.maxActive,stats.active);stats.opens++;
  try{
   await new Promise(r=>setTimeout(r,100));const draws=[];
   for(let i=0;i<body.count;i++){
    const card=demoCards[index++%demoCards.length],stock=state.stock.find(s=>s.code===card.code);if(stock){stock.issued++;stock.remaining--;}
    const count=(copies.get(card.code)||0)+1;copies.set(card.code,count);
    draws.push({mercenaryCode:card.code,outcomeId:(stock?'LIMITED_':'CARD_')+card.rank,edition:stock?'LIMITED':'STANDARD',rank:card.rank,name:card.name,sourceArt:card.sourceArt,...(stock?{serial:stock.issued}:{}),quantity:1,duplicate:count>1,duplicateCount:count-1});
   }
   stats.draws+=body.count;
   const receipt={requestId:body.requestId,status:'COMPLETED',accountId:7,count:body.count,coinCost:body.count===10?5000000000:500000000,coin:'999999999999',draws};
   receipts.set(body.requestId,receipt);return structuredClone(receipt);
  }finally{stats.active--;}
 };
 return {state,api,stats,receipts};
}
export function memoryStorage(){const rows=new Map();return {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)};}
