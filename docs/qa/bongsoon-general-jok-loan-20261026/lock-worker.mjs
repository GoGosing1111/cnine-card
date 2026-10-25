const USER_ID=5426,OP='ops:bongsoon:general-jok:loan:20261026:v1';
export default {async fetch(request,env){
 const action=new URL(request.url).pathname.slice(1);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','state','release'].includes(action))return new Response('Denied',{status:403});
 const call=async(kind,body)=>{const r=await env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+USER_ID)).fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Account lock unavailable');return r.json();};
 try{
  if(action==='release'){await call('release',{token:env.OPS_KEY});return Response.json({released:true});}
  if(action==='state'){const r=await call('state',{});return Response.json({owned:Boolean(r.held&&r.lock.token===env.OPS_KEY&&r.lock.actionPath===OP),leaseDeadline:r.lock?.leaseUntil||0});}
  const r=await call('acquire',{token:env.OPS_KEY,actionPath:OP,leaseMs:120000});if(!r.acquired)return Response.json({error:'Account busy'},{status:409});return Response.json({acquired:true,leaseDeadline:r.leaseUntil});
 }catch(error){return Response.json({error:error.message},{status:409});}
}};
