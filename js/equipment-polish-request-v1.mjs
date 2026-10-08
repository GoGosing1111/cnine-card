// One durable intent per account. A lost reply never creates a second roll.
export function createPolishRequest({request,storage,userId,uuid=()=>crypto.randomUUID()}){
  const key='cnine_polish_pending_v1:'+userId;
  let pending=null;
  try{pending=JSON.parse(storage.getItem(key)||'null');}catch{}
  if(pending&&(!pending.requestId||!pending.instanceId||!Number.isInteger(pending.expectedAttempts)))pending=null;
  const clear=()=>{storage.removeItem(key);pending=null;};
  return {
    get pending(){return pending;},
    async recover(){
      if(!pending)return null;
      const result=await request('receipt?requestId='+encodeURIComponent(pending.requestId));
      if(result.receipt){clear();return result.receipt;}
      return null;
    },
    async execute(input){
      if(pending&&pending.instanceId!==input.instanceId)throw Error('이전 장비의 연마 결과를 먼저 확인하세요.');
      if(!pending){pending={...input,requestId:uuid()};try{storage.setItem(key,JSON.stringify(pending));}catch{pending=null;throw Error('연마 요청을 기기에 보관할 수 없습니다. 브라우저 저장 공간을 확인하세요.');}}
      try{const receipt=await request('execute',{method:'POST',body:{...pending}});clear();return receipt;}
      catch(error){
        try{const receipt=await this.recover();if(receipt)return receipt;}catch{}
        if(['POLISH_CONFLICT','POLISH_NOT_OWNED','POLISH_COMPLETE','POLISH_POLICY_CHANGED','POLISH_REQUEST_CONFLICT'].includes(error.code))clear();
        throw error;
      }
    }
  };
}
