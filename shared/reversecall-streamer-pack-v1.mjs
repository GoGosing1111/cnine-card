import {BLACKCROWN_PACK,blackcrownPackDraft,blackcrownPackState,blackcrownPackCatalogRow} from './mercenary-blackcrown-pack-v1.mjs';
import {BLACKCROWN_LIMITED_CARDS} from './mercenary-blackcrown-pool-v3.mjs';

export const STREAMER_PACK_KEY='mercenary_reversecall_streamer_pack_v1';
export const STREAMER_OPEN_KIND='MERCENARY_REVERSECALL_STREAMER_OPEN';
export const STREAMER_STOCK_PREFIX='REVERSECALL_STREAMER:';
export const STREAMER_PACK=Object.freeze({...BLACKCROWN_PACK,id:'mercenary-reversecall-streamer',name:'리버스콜 스트리머 팩',edition:'REVERSECALL_STREAMER',featurePath:'mercenaries/v3/streamer-pack/feature',openPath:'mercenaries/v3/streamer-pack/open',receiptPath:'mercenaries/v3/streamer-pack/receipt',adminPath:'admin/mercenaries/streamer-pack',image:'assets/ui/packs/reversecall-streamer-20261105-v4/pack-768.webp',storageNamespace:'reversecall-streamer-pack',stockEvent:'reversecall-streamer-pack:stock',streamerOnly:true});
export const streamerStockCode=code=>STREAMER_STOCK_PREFIX+code;
export const streamerPackInitial=()=>({revision:1,mode:'OFF',stockLimits:Object.fromEntries(BLACKCROWN_LIMITED_CARDS.map(c=>[c.code,c.rank==='SS'?10:3])),updatedAt:null});
export function validateStreamerPackDocument(doc){
 if(!doc||!Number.isSafeInteger(doc.revision)||doc.revision<1||doc.revision>=2147483646||!['ON','OFF'].includes(doc.mode)||!doc.stockLimits||Object.keys(doc.stockLimits).sort().join(',')!==BLACKCROWN_LIMITED_CARDS.map(c=>c.code).sort().join(',')||Object.values(doc.stockLimits).some(n=>!Number.isSafeInteger(n)||n<1||n>1000000))throw Error('스트리머 팩 판매 상태와 독립 한도를 확인하세요.');
 return doc;
}
export function streamerPackSettings(source,doc){
 validateStreamerPackDocument(doc);
 return {...structuredClone(source||blackcrownPackDraft()),mode:doc.mode,stockLimits:{...doc.stockLimits}};
}
export function streamerPackState(source,doc,stock,normalCards,options={}){
 const state=blackcrownPackState(streamerPackSettings(source,doc),stock,normalCards,options);
 return {...state,pack:STREAMER_PACK,acquisitionSource:STREAMER_PACK.id,limitScope:'PER_CHARACTER_STREAMER_PACK',cards:state.cards.map(c=>c.stockPolicy==='UNLIMITED'?c:{...c,serverLimit:doc.stockLimits[c.code],stockPolicy:'PACK_ONLY'}),stock:state.stock.map(s=>({...s,scope:'REVERSECALL_STREAMER_PACK'}))};
}
export function streamerPackCatalogRow(source,doc,stock){
 return {...blackcrownPackCatalogRow(streamerPackSettings(source,doc),stock),id:STREAMER_PACK.id,name:STREAMER_PACK.name,theme:'blackcrown',subtitle:'REVERSE CALL · STREAMER',description:'리버스랜드 등록 스트리머 전용 · 블랙크라운 동일 구성·확률',drawMode:'MERCENARY_REVERSECALL_STREAMER',imageUrl:STREAMER_PACK.image,streamerOnly:true,stockScope:'REVERSECALL_STREAMER_PACK'};
}
