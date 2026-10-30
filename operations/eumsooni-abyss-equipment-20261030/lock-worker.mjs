const ids=[65],op='ops:eumsooni-abyss-equipment:20261030:v1';
export default {async fetch(request,env){
 const action=new URL(request.url).pathname.slice(1);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','release','state'].includes(action))return new Response('Denied',{status:403});
 const call=async(id,kind,body)=>{const stub=env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+id)),r=await stub.fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Lock service unavailable');return r.json();};
 const release=async()=>{for(const id of ids)await call(id,'release',{token:env.OPS_KEY+':'+id});};
 try{
  if(action==='state'){const states=await Promise.all(ids.map(async id=>{const r=await call(id,'state',{});return {owned:r.held&&r.lock?.token===env.OPS_KEY+':'+id&&r.lock?.actionPath===op,leaseUntil:r.lock?.leaseUntil||0};}));return Response.json({owned:states.every(s=>s.owned),anyOwned:states.some(s=>s.owned),leaseUntil:Math.min(...states.map(s=>s.leaseUntil))});}
  if(action==='release'){await release();return Response.json({released:true});}
  const leases=[];for(const id of ids){let acquired;for(let attempt=0;attempt<8;attempt++){const r=await call(id,'acquire',{token:env.OPS_KEY+':'+id,actionPath:op,leaseMs:120000});if(r.acquired){acquired=r;break;}await new Promise(r=>setTimeout(r,350));}if(!acquired)throw Error('Account busy: '+id);leases.push(acquired.leaseUntil);}return Response.json({acquired:true,leaseUntil:Math.min(...leases)});
 }catch(e){if(action==='acquire')await release().catch(()=>{});return Response.json({error:e.message},{status:409});}
}};
