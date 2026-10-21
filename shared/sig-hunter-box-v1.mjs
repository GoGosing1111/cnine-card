// One source for the material catalog, server receipt and opening screen.
export const SIG_HUNTER_BOX = Object.freeze({
  code: 'SIG_HUNTER_BOX',
  name: '시그헌터 박스',
  category: 'MATERIAL',
  image: 'assets/ui/packs/sig-hunter-box-20261022/gift-768.webp',
  coin: 30_000_000_000_000,
  masterStar: 20_000_000,
  repairCoupon: 3,
  suitCore6: 10,
  limitedShard: 1,
  description: '개봉 시 코인 30조, 마스터의 별 2,000만 개, 핑두 리페어권 3장, 슈트 코어 6 10개, SSS 리미티드 조각 1개를 모두 받습니다. 상자 1개당 확정 지급됩니다.'
});
export const SIG_HUNTER_BOX_REWARDS = Object.freeze({
  coin: SIG_HUNTER_BOX.coin,
  masterStar: SIG_HUNTER_BOX.masterStar,
  repairCoupon: SIG_HUNTER_BOX.repairCoupon,
  suitCore6: SIG_HUNTER_BOX.suitCore6,
  limitedShard: SIG_HUNTER_BOX.limitedShard
});
