// Canonical catalog, receipt and opening contents. Existing Reversecall gifts stay unchanged.
import {REVERSECALL_STREAMER_GIFT} from './reversecall-streamer-gift-v1.mjs';
export const CNINE_STREAMER_BOX = Object.freeze({
  code: 'CNINE_STREAMER_BOX',
  name: '씨나인 스트리머 박스',
  image: 'assets/ui/packs/cnine-streamer-box-20261103/gift-768.webp',
  coin: 25_000_000_000_000,
  masterStar: 200_000_000,
  repairCoupon: REVERSECALL_STREAMER_GIFT.repairCoupon,
  suitCore6: REVERSECALL_STREAMER_GIFT.suitCore6,
  description: '개봉 시 코인 25조, 마스터의 별 2억 개, 핑두 리페어 쿠폰 3개, 슈트 코어 6 10개를 모두 받습니다. 상자 1개당 확정 지급됩니다.'
});
export const CNINE_STREAMER_BOX_REWARDS = Object.freeze({
  coin: CNINE_STREAMER_BOX.coin,
  masterStar: CNINE_STREAMER_BOX.masterStar,
  repairCoupon: CNINE_STREAMER_BOX.repairCoupon,
  suitCore6: CNINE_STREAMER_BOX.suitCore6
});
