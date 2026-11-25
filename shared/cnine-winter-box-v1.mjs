export const CNINE_STREAMER_SHARD = Object.freeze({
  code: 'CNINE_STREAMER_SHARD',
  name: '씨나인 스트리머 조각',
  image: 'assets/items/cnine-streamer-shard-v1.webp',
  description: '씨나인 겨울박스에서 획득하는 수집 재료입니다.'
});

export const WINTER_BOX_CONTENTS = Object.freeze([
  {code:'COIN', name:'코인', quantity:50_000_000_000_000, scale:1_000_000_000_000, unit:'조', image:'assets/ui/icon-fusion-20261004/coin.webp'},
  {code:'MASTER_STAR', name:'마스터의 별', quantity:500_000_000, scale:100_000_000, unit:'억 개', image:'assets/ui/icon-fusion-20261004/master-star.webp'},
  {code:'WEAPON_ENHANCEMENT_SCROLL', name:'무기 강화주문서', quantity:1, unit:'장', image:'assets/items/weapon-enhancement-scroll-v1.webp'},
  {code:'ARMOR_ENHANCEMENT_SCROLL', name:'방어구 강화주문서', quantity:3, unit:'장', image:'assets/items/armor-enhancement-scroll-v1.webp'},
  {code:'SUIT_CORE_8', name:'슈트 코어 8', quantity:1, unit:'개', image:'assets/items/suit-core-8-20261117.webp'},
  {code:'RANK_EXP_POTION_2X_60M', name:'계급 경험치 2배 물약 (60분)', quantity:1, unit:'개', image:'assets/items/rank-exp-potions-20261020/2x.webp'},
  {code:CNINE_STREAMER_SHARD.code, name:CNINE_STREAMER_SHARD.name, quantity:1, unit:'개', image:CNINE_STREAMER_SHARD.image}
].map(Object.freeze));

export const CNINE_WINTER_BOX = Object.freeze({
  code: 'CNINE_WINTER_BOX',
  name: '씨나인 겨울박스',
  image: 'assets/items/cnine-winter-box-v1.webp',
  description: WINTER_BOX_CONTENTS.map(item => item.name+' '+(item.quantity/(item.scale||1))+item.unit).join(', ')+'를 모두 받습니다.'
});
