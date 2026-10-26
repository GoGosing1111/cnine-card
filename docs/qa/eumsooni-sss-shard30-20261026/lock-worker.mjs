const ids=[65],op='ops:eumsooni-sss-limited-shard30:20261026:v1';
export default {async fetch(request,env){
 const action=new URL(request.url).pathname.slice(1);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','release','state'].includes(action))return new Response('Denied',{status:403});
 const call=async(id,kind,body)=>{const stub=env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+id)),response=await stub.fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!response.ok)throw Error('Lock service unavailable');return response.json();};
 try{
  if(action==='state'){const states=await Promise.all(ids.map(async id=>{const r=await call(id,'state',{});return {owned:r.held&&r.lock?.token===env.OPS_KEY+':'+id&&r.lock?.actionPath===op,leaseUntil:r.lock?.leaseUntil||0};}));return Response.json({owned:states.every(s=>s.owned),anyOwned:states.some(s=>s.owned),leaseUntil:Math.min(...states.map(s=>s.leaseUntil))});}
  if(action==='release'){for(const id of ids)await call(id,'release',{token:env.OPS_KEY+':'+id});return Response.json({released:true});}
  const leases=[];
  for(const id of ids){
   let acquired;
   for(let attempt=0;attempt<8;attempt++){const r=await call(id,'acquire',{token:env.OPS_KEY+':'+id,actionPath:op,leaseMs:120000});if(r.acquired){acquired=r;break;}await new Promise(resolve=>setTimeout(resolve,350));}
   if(!acquired)throw Error('Account busy: '+id);leases.push(acquired.leaseUntil);
  }
  return Response.json({acquired:true,leaseUntil:Math.min(...leases)});
 }catch(e){return Response.json({error:e.message},{status:409});}
}};
