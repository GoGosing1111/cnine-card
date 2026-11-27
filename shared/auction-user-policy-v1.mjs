import {createLootProductDraft} from './loot-shop-policy-v1.mjs?v=20261103-live-v1';
import {coinInteger,coinValue} from './coin-integer-v1.mjs';

export const AUCTION_USER_POLICY_KEY='auction_user_policy_v1';
export const AUCTION_TICKET='AUCTION_HOST_TICKET';
export const AUCTION_TICKET_IMAGE='/assets/items/auction-host-ticket-20261103-v1.png';
export const AUCTION_DEFAULT_MINUTES=120;
export const AUCTION_DURATION_MINUTES=Object.freeze([30,60,120]);
export const AUCTION_DURATION_MS=AUCTION_DEFAULT_MINUTES*60_000;
export const AUCTION_ITEM_LISTING_LIMIT=10;
export const AUCTION_LISTING_WINDOW_MS=24*60*60*1000;
export const auctionDurationLabel=(minutes=AUCTION_DEFAULT_MINUTES)=>minutes===30?'30분':(minutes/60)+'시간';
export const AUCTION_MAX_BID=100_000_000_000_000_000n;
export const AUCTION_QUICK_BIDS=Object.freeze([
  {label:'1,000만',amount:10_000_000},{label:'1,000억',amount:100_000_000_000},
  {label:'1조',amount:1_000_000_000_000},{label:'10조',amount:10_000_000_000_000},
  {label:'100조',amount:100_000_000_000_000}
]);
export const AUCTION_ASSET_TYPES=Object.freeze({CARD:'카드',MERCENARY:'용병',PET:'펫',EQUIPMENT:'장비',VEHICLE:'이동수단',ITEM:'아이템',MASTER_STAR:'마스터의 별'});
export const AUCTION_USER_DRAFT=Object.freeze({version:1,enabled:false,durationMs:AUCTION_DURATION_MS,feePercent:20,maxActive:1,growth:'ACCOUNT_RETAINED',ticketCode:AUCTION_TICKET,ticketQuantity:1,rewardSources:[]});
export const auctionMoney=coinValue;
// Keep existing numeric receipts canonical and carry larger JSON amounts as decimal strings.
export function auctionAmount(value,minimum=1n){
  try{
    const amount=coinInteger(value);
    return amount>=minimum&&amount<=AUCTION_MAX_BID?coinValue(amount):null;
  }catch{return null;}
}
export function auctionProceeds(value){
  const gross=coinInteger(value),fee=gross*20n/100n;
  return {gross:coinValue(gross),fee:coinValue(fee),net:coinValue(gross-fee)};
}
export function auctionCoinLabel(value){
  const n=coinInteger(value);
  for(const [unit,divisor] of [['경',10n**16n],['조',10n**12n],['억',10n**8n],['만',10n**4n]]){
    if(n<divisor)continue;
    if(n>BigInt(Number.MAX_SAFE_INTEGER)&&n*100n%divisor!==0n)return n.toLocaleString('ko-KR');
    const hundredths=(n*100n+divisor/2n)/divisor;
    return (Number(hundredths)/100).toLocaleString('ko-KR')+unit;
  }
  return n.toLocaleString('ko-KR');
}
// Pure preparation only. The caller must preserve the current policy and save it
// through the existing shop policy transaction during a later release.
export function prepareAuctionTicketShop(before,shop){
  if(!['RANKED','LOOT'].includes(shop))throw Error('지원하지 않는 상점입니다.');
  const next=structuredClone(before),id='auction_host_ticket';
  if(!Array.isArray(next.products))throw Error('기존 상점 설정을 먼저 읽으세요.');
  if(next.products.some(p=>p.id===id))throw Error('이미 개최 티켓 상품이 있습니다. 기존 상품을 검토하세요.');
  next.products.push({...createLootProductDraft('ITEM_BUNDLE',id),name:'경매 개최 티켓',enabled:false,visible:false,
    price:shop==='RANKED'?300:500,accountLimit:null,image:AUCTION_TICKET_IMAGE,items:[{code:AUCTION_TICKET,quantity:1}],
    description:'본인 보유 물품으로 경매 1회를 개최합니다. 진행 중인 경매가 있으면 순서대로 예약됩니다.'});
  return next;
}
