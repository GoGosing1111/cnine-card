import {CHUSEOK_COIN} from '../js/chuseok-model-v1.js';
export const CHUSEOK_COUPON_MAX=100000;
export async function redeemChuseokCoinCoupon({coupon,deps}){
 if(String(coupon?.reward_type||'').toUpperCase()!==CHUSEOK_COIN)return null;
 return deps.json({error:'추석 이벤트가 종료되어 추석 코인 쿠폰은 사용할 수 없습니다.',code:'EVENT_RETIRED'},410);
}
