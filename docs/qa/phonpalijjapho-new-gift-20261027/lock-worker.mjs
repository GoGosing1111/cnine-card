import plan from '../../../scripts/ops/phonpalijjapho-new-user-gift-20261027.plan.json';
const ids=plan.targets.map(t=>t.userId),op=plan.operationKey;
export default {async fetch(request,env){
 const action=new URL(request.url).pathname.slice(1);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','release','state'].includes(action))return new Response('Denied',{status:403});
 const call=async(id,kind,body)=>{
  const stub=env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+id));
  const r=await stub.fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok)throw Error('Lock service unavailable');return r.json();
 };
 try{
  if(action==='state'){
   const states=await Promise.all(ids.map(async id=>{const s=await call(id,'state',{});return {id,owned:s.held&&s.lock?.token===env.OPS_KEY+':'+id&&s.lock?.actionPath===op,leaseUntil:s.lock?.leaseUntil};}));
   return Response.json({owned:states.filter(s=>s.owned).length,expected:ids.length,leaseUntil:Math.min(...states.filter(s=>s.owned).map(s=>s.leaseUntil))});
  }
  if(action==='release'){await Promise.all(ids.map(id=>call(id,'release',{token:env.OPS_KEY+':'+id})));return Response.json({released:true});}
  const results=await Promise.all(ids.map(async id=>{
   for(let attempt=0;attempt<8;attempt++){
    const r=await call(id,'acquire',{token:env.OPS_KEY+':'+id,actionPath:op,leaseMs:120000});
    if(r.acquired)return r;await new Promise(resolve=>setTimeout(resolve,350));
   }return {acquired:false};
  }));
  if(results.some(r=>!r.acquired)){await Promise.all(ids.map(id=>call(id,'release',{token:env.OPS_KEY+':'+id})));throw Error('An account is busy; no grant performed');}
  return Response.json({acquired:true,count:results.length,leaseUntil:Math.min(...results.map(r=>r.leaseUntil))});
 }catch(e){return Response.json({error:e.message},{status:409});}
}};
