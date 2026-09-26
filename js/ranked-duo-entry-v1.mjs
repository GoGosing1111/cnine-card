const transientCodes=new Set(['DUO_PROFILE_BUILDING','DUO_PROFILE_CHANGED','DUO_CONFLICT','DUO_INTERNAL','REQUEST_TIMEOUT']);
const waitFor=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const delayed=()=>Object.assign(new Error('서버 응답이 지연되고 있습니다. 진행 중인 경기에서 이어서 입장할 수 있습니다.'),{code:'DUO_ENTRY_DELAYED'});

// One click owns one ticket/request ID, including lost responses and settlement
// recovery. Bound retries and stop issuing requests when the lobby is unmounted.
export async function enterRankedDuo({call,pending=null,save,onMatched=()=>{},isActive=()=>true,wait=waitFor,now=Date.now,requestId=()=>crypto.randomUUID()}){
 const deadline=now()+45000;let body=pending;
 for(let attempt=0;attempt<24&&now()<deadline;attempt++){
  if(!isActive())return null;
  let delay=1500;
  try{
   if(!body){
    const match=await call('match',{method:'POST',body:{}});
    if(!isActive())return null;
    body=match.pendingMatchId?{matchId:match.pendingMatchId}:{requestId:requestId(),matchToken:match.token};
    save(body);if(!match.pendingMatchId)onMatched(match);
   }
   if(!isActive())return null;
   const data=await call(body.matchId?'replay':'fight',{method:'POST',body:body.matchId?{matchId:body.matchId}:body});
   if(data.status==='COMPLETED'){save(null);return data;}
   if(data.status==='CANCELLED')throw Object.assign(new Error('취소된 경기의 행동력을 돌려드렸습니다. 다시 매칭하세요.'),{code:'DUO_CANCELLED'});
   if(data.status!=='PENDING'||!data.matchId)throw Object.assign(new Error('전투 응답을 확인할 수 없습니다.'),{code:'DUO_RESPONSE'});
   body={...body,matchId:data.matchId};save(body);
   delay=Math.min(3000,Math.max(1000,Number(data.retryAfterMs)||1500));
  }catch(error){
   if(['DUO_CANCELLED','DUO_TICKET'].includes(error.code))save(null);
   if(!transientCodes.has(error.code)&&!(!error.code&&!error.status&&error instanceof TypeError))throw error;
   delay=Math.min(3000,500*2**Math.min(attempt,3));
  }
  if(!isActive())return null;
  if(attempt===23||now()+delay>=deadline)break;
  await wait(delay);
 }
 throw delayed();
}
