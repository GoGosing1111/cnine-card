// Old coupon links must not reissue retired tickets, including receipt replays.
export async function redeemWishTicketCoupon({coupon,deps}){
 if(String(coupon?.reward_type||'').toUpperCase()!=='PINGDU_WISH_TICKET')return null;
 return deps.json({error:'소원램프 종료로 소원권 쿠폰은 더 이상 사용할 수 없습니다.',code:'WISH_LAMP_RETIRED'},410);
}
