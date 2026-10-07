export const SUIT_CORE_BOX=Object.freeze({
  kind:'suit_core',coreOnly:true,itemCode:'SUIT_CORE_SUPPLY_BOX',name:'슈트코어 전용 상자',
  subtitle:'SUIT CORE SUPPLY',description:'슈트 코어 1~4 중 1개를 확정 획득합니다. 코어 1 78.8%, 코어 2 20%, 코어 3 1%, 코어 4 0.2%.',
  category:'SUPPLY_BOX',rarity:'PRIME',image:'assets/ui/packs/suit-core-supply-box-20261008.png',
  unitPrice:1000000000,priceRatio:1,poolVersion:'SUIT_CORE_BOX_20261008_1',
  settingsKey:'suit_core_box_settings_20261008',purchaseReason:'슈트코어 전용 상자 구매',referenceType:'SUIT_CORE_BOX_SHOP'
});
export const SUIT_CORE_BOX_WEIGHTS=Object.freeze([
  Object.freeze({code:'SUIT_CORE_1',weight:78.8}),Object.freeze({code:'SUIT_CORE_2',weight:20}),
  Object.freeze({code:'SUIT_CORE_3',weight:1}),Object.freeze({code:'SUIT_CORE_4',weight:.2})
]);
export const SUIT_CORE_BOX_CODES=Object.freeze(SUIT_CORE_BOX_WEIGHTS.map(row=>row.code));
