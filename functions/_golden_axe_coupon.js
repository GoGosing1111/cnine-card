// Retired on 2026-09-23. Old receipts stay in the audit ledger, never reissue axes.
export async function redeemOldAxeCoupon({coupon,deps}){
 if(String(coupon?.reward_type||'').toUpperCase()!=='PINGDU_OLD_AXE')return null;
 return deps.json({error:'도끼 이벤트가 종료되어 낡은도끼 쿠폰은 사용할 수 없습니다.',code:'EVENT_RETIRED'},410);
}
