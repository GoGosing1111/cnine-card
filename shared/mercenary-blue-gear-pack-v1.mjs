import {BLUE_GEAR_CODES,BLUE_GEAR_MERCENARIES,BLUE_GEAR_PACK_ART} from './mercenary-blue-gear-catalog-v1.mjs';
import {ZERO_ART} from './mercenary-zero-v1.mjs';
import {HAKUYA_ART} from './mercenary-hakuya-v1.mjs';
import {BLOODMOON_UNLIMITED_CARDS} from './mercenary-bloodmoon-pool-v3.mjs';
import {BLACKCROWN_CODES} from './mercenary-blackcrown-catalog-v1.mjs';
import {MERCENARY_RANKS} from './mercenary-ranks-v1.mjs';
import {blackcrownPersonalOdds} from './mercenary-blackcrown-ownership-v1.mjs';

export const BLUE_GEAR_PACK_KEY='mercenary_blue_gear_pack_v1';
export const BLUE_GEAR_OPENS_AT='2026-11-19T15:00:00.000Z';
export const BLUE_GEAR_STOCK_PREFIX='BLUE_GEAR:';
const route='mercenaries/v3/blue-gear-pack/';
export const BLUE_GEAR_PACK=Object.freeze({id:'mercenary-blue-gear',name:'블루기어팩',image:BLUE_GEAR_PACK_ART+'pack-768.webp',
 featurePath:route+'feature',openPath:route+'open',receiptPath:route+'receipt',storageNamespace:'blue-gear-pack',maxBatch:10});
export const BLUE_GEAR_LEGENDS=Object.freeze([ZERO_ART,HAKUYA_ART].map(card=>Object.freeze({code:card.code,name:card.name,rank:'SSS',
 group:'SSS_LIMITED',stockPolicy:'PACK_ONLY',serverLimit:3,thumbnailArt:BLUE_GEAR_PACK_ART+card.code+'-320.webp',displayArt:card.sourceArt,sourceArt:card.sourceArt})));
export const BLUE_GEAR_LIMITED_CARDS=Object.freeze([...BLUE_GEAR_MERCENARIES,...BLUE_GEAR_LEGENDS]);
export const BLUE_GEAR_DRAW_POLICY=Object.freeze({pool:Object.freeze([...BLUE_GEAR_LIMITED_CARDS,...BLOODMOON_UNLIMITED_CARDS]),
 ssCodes:BLUE_GEAR_CODES,ssEdition:'BLUE_GEAR_LIMITED',outcomePrefix:'BLUE_GEAR',bulkFormat:'BLUE_GEAR_BULK_V1',
 isLimited:code=>BLUE_GEAR_LIMITED_CARDS.some(card=>card.code===code)});
export function blueGearRegistration(blood,black){
 const rank=blood.settings.normalRankRatesPpm;
 const rates=BLACKCROWN_CODES.map(code=>black.settings.cardRatesPpm[code]);
 if(rates.length!==6||rates.some(n=>n!==5000)||blood.settings.cardRatesPpm['V-975']!==1||blood.settings.cardRatesPpm['V-058']!==400||
    blood.settings.prices.single!==1500000000||blood.settings.prices.ten!==15000000000||blood.settings.missRatePpm!==800000||
    MERCENARY_RANKS.some((r,i)=>rank[r]!==[104500,30000,30000,30000,4700,800][i]))throw Error('기준 팩의 운영 설정이 변경됐습니다.');
 const cardRatesPpm=Object.fromEntries(BLUE_GEAR_DRAW_POLICY.pool.map(c=>[c.code,c.rank==='SS'?rates[0]/10:c.stockPolicy==='UNLIMITED'?blood.settings.cardRatesPpm[c.code]:blood.settings.cardRatesPpm['V-975']]));
 return {revision:1,openingAt:BLUE_GEAR_OPENS_AT,references:{bloodmoon:blood.revision,blackcrown:black.revision},
  settings:{prices:{single:blood.settings.prices.single*1.5,ten:blood.settings.prices.ten*1.5},missRatePpm:blood.settings.missRatePpm,
   normalRankRatesPpm:{...rank},cardRatesPpm,normalSssRatePpm:1000000-Object.values(cardRatesPpm).reduce((a,b)=>a+b,0),
   stockLimits:Object.fromEntries(BLUE_GEAR_LIMITED_CARDS.map(c=>[c.code,c.serverLimit]))}};
}
export function blueGearStock(doc,rows){
 return BLUE_GEAR_LIMITED_CARDS.map(card=>{const row=rows.find(r=>r.code===BLUE_GEAR_STOCK_PREFIX+card.code);
  const limit=doc.settings.stockLimits[card.code],issued=Number(row?.issued||0),prepared=Boolean(row&&Number(row.stock_limit)===limit&&issued>=0&&issued<=limit);
  return {code:card.code,limit,issued,remaining:prepared?limit-issued:0,prepared};});
}
export function blueGearCatalog(doc,rows,serverNow){
 if(!doc)return null;
 const stock=blueGearStock(doc,rows),scheduled=Date.parse(serverNow)<Date.parse(doc.openingAt),drawEnabled=!scheduled&&stock.every(s=>s.prepared);
 return {...BLUE_GEAR_PACK,theme:'blue-gear',range:'일반 C~SSS · SS/SSS 리미티드',description:'블루기어 SS 5종 · 제로 · 하쿠야 신',
  price:doc.settings.prices.single,prices:doc.settings.prices,drawMode:'MERCENARY_BLUE_GEAR',imageUrl:BLUE_GEAR_PACK.image,allowed:[],maxDrawCount:10,
  drawEnabled,comingSoon:scheduled,openingScheduled:scheduled,openingAt:doc.openingAt,previewCards:BLUE_GEAR_LIMITED_CARDS.map(({code,name,rank,thumbnailArt},i)=>({code,name,rank,thumbnailArt,...stock[i]}))};
}
export function blueGearState(doc,rows,normalCards,serverNow,ownedRows=[]){
 const shop=blueGearCatalog(doc,rows,serverNow),stock=blueGearStock(doc,rows);
 const blockers=[];
 if(!stock.every(s=>s.prepared))blockers.push('리미티드 발행 한도를 확인하세요.');
 if(MERCENARY_RANKS.some(rank=>!normalCards.some(c=>c.rank===rank&&c.weight>0)))blockers.push('일반 용병 추첨 목록을 확인하세요.');
 const settings={...doc.settings,mode:shop.drawEnabled?'ON':'OFF'};
 const personal=blackcrownPersonalOdds(settings,stock,ownedRows,BLUE_GEAR_CODES);
 return {...shop,pack:BLUE_GEAR_PACK,settings,serverNow,revision:doc.revision,normalCards,stock,readiness:{ready:blockers.length===0,blockers},
  userOpeningEnabled:shop.drawEnabled&&!blockers.length,...personal,ownershipRule:{...personal.ownershipRule,basis:'CURRENT_DISTINCT_BLUE_GEAR_SS',divisors:[1,1,2,4,8,16]}};
}
