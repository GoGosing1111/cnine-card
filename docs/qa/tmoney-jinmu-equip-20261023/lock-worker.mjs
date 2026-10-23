import plan from './plan.json';
const ids=plan.recipients.map(u=>u.id).sort((a,b)=>Number(a)-Number(b));
export default {async fetch(request,env){
 const action=new URL(request.url).pathname.slice(1);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','state','release'].includes(action))return new Response('Denied',{status:403});
 const call=async(id,kind,body)=>{const r=await env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+id)).fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Lock unavailable');return r.json();};
 const release=async()=>{for(const id of ids)await call(id,'release',{token:env.OPS_KEY+':'+id});};
 try{
  if(action==='release'){await release();return Response.json({released:ids.length});}
  if(action==='state'){let deadline=Infinity;for(const id of ids){const r=await call(id,'state',{});if(!r.held||r.lock.token!==env.OPS_KEY+':'+id||r.lock.actionPath!==plan.operationKey)throw Error('Lease not held');deadline=Math.min(deadline,r.lock.leaseUntil);}return Response.json({owned:ids.length,leaseDeadline:deadline});}
  let deadline=Infinity;
  for(const id of ids){let r;for(let i=0;i<3;i++){r=await call(id,'acquire',{token:env.OPS_KEY+':'+id,actionPath:plan.operationKey,leaseMs:120000});if(r.acquired)break;await new Promise(resolve=>setTimeout(resolve,350));}if(!r.acquired)throw Error('Account busy: '+id);deadline=Math.min(deadline,r.leaseUntil);}
  return Response.json({acquired:ids.length,leaseDeadline:deadline});
 }catch(e){if(action==='acquire')await release().catch(()=>{});return Response.json({error:e.message},{status:409});}
}};
