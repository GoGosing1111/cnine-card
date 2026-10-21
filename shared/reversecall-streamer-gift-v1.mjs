// One source for the item catalog, server receipt and pre-opening contents.
export const REVERSECALL_STREAMER_GIFT = Object.freeze({
  code: 'REVERSECALL_STREAMER_GIFT_BOX',
  name: '리버스콜 스트리머 선물',
  image: 'assets/ui/packs/reversecall-streamer-gift-20261021/gift-768.webp',
  coin: 35_000_000_000_000,
  repairCoupon: 3,
  suitCore6: 10,
  description: '개봉 시 35조 코인, 핑두 리페어 쿠폰 3개, 슈트 코어 6 10개를 모두 받습니다. 상자 1개당 확정 지급됩니다.'
});
export const REVERSECALL_STREAMER_GIFT_REWARDS = Object.freeze({
  coin: REVERSECALL_STREAMER_GIFT.coin,
  repairCoupon: REVERSECALL_STREAMER_GIFT.repairCoupon,
  suitCore6: REVERSECALL_STREAMER_GIFT.suitCore6
});
