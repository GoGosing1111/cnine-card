const id=4866,op='ops:c9-gasi-jokro-exempt-grant:20261026:v1';
export default {async fetch(request,env){
 const action=new URL(request.url).pathname.slice(1);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','release','state'].includes(action))return new Response('Denied',{status:403});
 const token=env.OPS_KEY+':'+id,stub=env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+id));
 const call=async(kind,body)=>{const r=await stub.fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Lock service unavailable');return r.json();};
 try{
  if(action==='state'){const r=await call('state',{});return Response.json({owned:r.held&&r.lock?.token===token&&r.lock?.actionPath===op,leaseUntil:r.lock?.leaseUntil});}
  if(action==='release'){await call('release',{token});return Response.json({released:true});}
  for(let attempt=0;attempt<8;attempt++){const r=await call('acquire',{token,actionPath:op,leaseMs:120000});if(r.acquired)return Response.json(r);await new Promise(resolve=>setTimeout(resolve,350));}
  throw Error('Account busy');
 }catch(e){return Response.json({error:e.message},{status:409});}
}};
