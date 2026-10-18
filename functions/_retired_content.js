// Permanent retirement: reject before authentication, database setup or settlement.
// Keep historical balances/receipts intact; no runtime flag can reopen these APIs.
export function retiredContentResponse(path,json){
  const key=String(path||'');
  const matches=prefix=>key===prefix||key.startsWith(prefix+'/');
  // Previously earned prize vouchers still redeem from inventory.
  const axeVoucher=['events/golden-axe/item-options','events/golden-axe/use-item','events/golden-axe/receipt'].includes(key);
  const content=matches('administration/treasury')||matches('admin/administration/treasury')
    ?{code:'TREASURY_RETIRED',name:'세금 시스템'}
    :matches('idle-dungeon')||matches('admin/idle-dungeon')
      ?{code:'IDLE_DUNGEON_RETIRED',name:'방치형 원정'}
    :matches('siege')||matches('admin/siege')
      ?{code:'MONSTER_SIEGE_RETIRED',name:'몬스터공성'}
    :matches('admin/storage-cleanup')
      ?{code:'STORAGE_CLEANUP_RETIRED',name:'DB 정리 설정'}
    :matches('events/chicken')||matches('admin/chicken-event')
      ?{code:'CHICKEN_EVENT_RETIRED',name:'치킨집 이벤트'}
    :matches('admin/golden-axe')||(matches('events/golden-axe')&&!axeVoucher)
      ?{code:'GOLDEN_AXE_EVENT_RETIRED',name:'금도끼 은도끼 이벤트'}:null;
  return content?json({ok:false,enabled:false,retired:true,code:content.code,error:`${content.name}은 종료되었습니다.`},410):null;
}
