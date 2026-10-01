// Permanent retirement: reject before authentication, database setup or settlement.
// Keep historical balances/receipts intact; no runtime flag can reopen these APIs.
export function retiredContentResponse(path,json){
  const key=String(path||'');
  const matches=prefix=>key===prefix||key.startsWith(prefix+'/');
  const content=matches('administration/treasury')||matches('admin/administration/treasury')
    ?{code:'TREASURY_RETIRED',name:'세금 시스템'}
    :matches('idle-dungeon')||matches('admin/idle-dungeon')
      ?{code:'IDLE_DUNGEON_RETIRED',name:'방치형 원정'}:null;
  return content?json({ok:false,enabled:false,retired:true,code:content.code,error:`${content.name}은 종료되었습니다.`},410):null;
}
