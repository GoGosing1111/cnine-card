import {normalizeAccountSync,changedAccountDomains,accountSyncBackoff} from '../shared/account-sync-v1.mjs';

export function createAccountSyncClient({request,openSocket,emit,clock=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 let token='',clientId='',accountId=0,snapshot=null,epoch=0,generation=0,socket=null,timer=null,watchdog=null,attempt=0,hidden=false,stopped=false,lastMessage=0,flight=false;
 const clear=()=>{cancel(timer);cancel(watchdog);timer=watchdog=null;const old=socket;socket=null;try{old?.close();}catch{}};
 const signal=(domains,reason)=>{if(!domains.length)return;epoch++;emit({domains,reason,epoch,revision:snapshot?.revision||'0',accountId});};
 function accept(value,{force=false}={}){
  const next=normalizeAccountSync(value),changes=changedAccountDomains(snapshot,next);
  if(snapshot&&BigInt(next.revision)<BigInt(snapshot.revision))return;
  snapshot=next;signal(force?['wallet','collection','inventory','loadout','pvp','messages']:changes,force?'resume':'server');
 }
 function retry(){if(stopped||hidden||!token)return;clear();timer=schedule(()=>void connect(),accountSyncBackoff(attempt++));}
 function health(){
  cancel(watchdog);if(!socket||stopped||hidden)return;
  watchdog=schedule(()=>{if(clock()-lastMessage>30000){retry();return;}try{socket.send(JSON.stringify({type:'ping'}));}catch{retry();return;}health();},15000);
 }
 async function connect(force=false){
  if(stopped||hidden||!token||flight)return;flight=true;const gen=generation,credential=token;
  try{
   const result=await request('sync/ticket',{method:'POST',body:{},token:credential,clientId});
   if(stopped||hidden||gen!==generation)return;
   if(accountId&&accountId!==result.accountId){snapshot=null;epoch++;}accountId=result.accountId;
   accept(result.snapshot,{force});clear();
   const next=openSocket(result);socket=next;
   next.onopen=()=>{if(socket!==next)return;attempt=0;lastMessage=clock();health();};
   next.onmessage=event=>{if(socket!==next||gen!==generation)return;try{const value=JSON.parse(event.data);lastMessage=clock();if(value.type==='account')accept(value.snapshot);}catch{retry();}};
   next.onclose=()=>{if(socket===next)retry();};next.onerror=()=>{if(socket===next)retry();};
  }catch(error){
   if(gen!==generation||hidden||stopped)return;
   if([401,403,423].includes(error.status)){clear();timer=schedule(()=>void connect(true),30000);}
   else retry();
  }finally{flight=false;if(gen!==generation&&!stopped&&!hidden&&token&&!socket&&!timer)timer=schedule(()=>{timer=null;void connect(true);},0);}
 }
 function configure(nextToken,nextClient,visible=true){
  const changed=nextToken!==token||nextClient!==clientId,wasHidden=hidden;hidden=!visible;
  if(changed){generation++;clear();token=nextToken;clientId=nextClient;accountId=0;snapshot=null;epoch++;attempt=0;}
  if(hidden||!token){clear();return;}
  if(changed||wasHidden||!socket&&!timer)void connect(wasHidden);
 }
 return {configure,invalidate(reason='mutation'){signal(['wallet','collection','inventory','loadout','pvp'],reason);},
  get epoch(){return epoch;},get revision(){return snapshot?.revision||'0';},get accountId(){return accountId;},
  diagnostics:()=>({connected:socket?.readyState===1,accountId,revision:snapshot?.revision||'0',epoch,attempt,hidden}),
  destroy(){stopped=true;generation++;clear();}};
}

if(typeof window!=='undefined'&&!window.CNineAccountSync){
 const client=createAccountSyncClient({
  async request(path,{method,body,token,clientId}){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
   try{const response=await fetch('/api/'+path,{method,cache:'no-store',credentials:'same-origin',signal:controller.signal,headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-cnine-client-id':clientId},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Sync retry'),{status:response.status,code:data.code});return data;
   }finally{clearTimeout(timer);}
  },
  openSocket:result=>new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/api/sync/stream?account='+result.accountId+'&ticket='+encodeURIComponent(result.ticket)),
  emit:detail=>window.dispatchEvent(new CustomEvent('cnine:account-sync',{detail}))
 });
 window.CNineAccountSync=client;
 function configure(){let token='',id='';try{token=localStorage.getItem('cnine_card_api_token')||sessionStorage.getItem('cnine_card_api_token')||'';id=localStorage.getItem('cnine_player_client_id_v1552')||'';}catch{}client.configure(token,id,!document.hidden&&/^[a-zA-Z0-9:_-]{12,120}$/.test(id));}
 addEventListener('storage',configure);addEventListener('online',configure);addEventListener('pageshow',configure);addEventListener('cnine:player-updated',configure);document.addEventListener('visibilitychange',configure);
 addEventListener('pagehide',()=>client.configure('','',false));
 setInterval(configure,5000);configure();
}
