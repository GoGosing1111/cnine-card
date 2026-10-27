const IDS=[1,91,4199],OP='ops:blackcrown-early-opening-reversal:20261027:v1';
export default {async fetch(request,env){
 const action=new URL(request.url).pathname.slice(1);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','state','release'].includes(action))return new Response('Denied',{status:403});
 const call=async(id,kind,body)=>{const r=await env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+id)).fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Account lock unavailable');return r.json();};
 try{
  if(action==='release'){for(const id of IDS)await call(id,'release',{token:env.OPS_KEY});const states=await Promise.all(IDS.map(id=>call(id,'state',{})));return Response.json({released:states.every(s=>!s.held||s.lock?.token!==env.OPS_KEY)});}
  if(action==='state'){const states=await Promise.all(IDS.map(id=>call(id,'state',{})));return Response.json({owned:states.every(r=>r.held&&r.lock.token===env.OPS_KEY&&r.lock.actionPath===OP),leaseDeadline:Math.min(...states.map(r=>r.lock?.leaseUntil||0))});}
  const deadlines=[];for(const id of IDS){const r=await call(id,'acquire',{token:env.OPS_KEY,actionPath:OP,leaseMs:120000});if(!r.acquired)throw Error('Account busy: '+id);deadlines.push(r.leaseUntil);}
  return Response.json({acquired:true,leaseDeadline:Math.min(...deadlines)});
 }catch(error){if(action==='acquire')for(const id of IDS)await call(id,'release',{token:env.OPS_KEY}).catch(()=>{});return Response.json({error:error.message},{status:409});}
}};
