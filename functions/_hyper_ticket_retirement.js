// Server-only retirement policy; no extra public asset is needed.
export const RETIRED_HYPER_TICKET='SOOPKETLAND_HYPER_BURNING_TICKET';
export const HYPER_TICKET_RETIRED_MESSAGE='하이퍼버닝 발동권은 삭제되어 사용할 수 없습니다.';
export function isRetiredHyperReward(item){
  return [item?.ref,item?.rewardRef,item?.itemCode,item?.code].some(value=>value===RETIRED_HYPER_TICKET||value==='INVENTORY_ITEM:'+RETIRED_HYPER_TICKET);
}
export const withoutHyperTickets=items=>items.filter(item=>!isRetiredHyperReward(item));
