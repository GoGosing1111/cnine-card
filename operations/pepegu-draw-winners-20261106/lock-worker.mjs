import plan from './plan.json';
const allIds=plan.targets.map(t=>t.userId).sort((a,b)=>Number(a)-Number(b)),op=plan.operationKey,chunkSize=20;
export default {async fetch(request,env){
 const [action,indexText]=new URL(request.url).pathname.slice(1).split('/'),index=Number(indexText),ids=allIds.slice(index*chunkSize,(index+1)*chunkSize);
 if(request.method!=='POST'||request.headers.get('x-ops-key')!==env.OPS_KEY||Date.now()>Number(env.OPS_EXPIRES_AT)||!['acquire','release','state'].includes(action)||!Number.isInteger(index)||index<0||ids.length===0)return new Response('Denied',{status:403});
 const call=async(id,kind,body)=>{const stub=env.USER_LOCK.get(env.USER_LOCK.idFromName('user:'+id)),r=await stub.fetch('https://user-lock/'+kind,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('Lock service unavailable');return r.json();};
 const release=()=>Promise.all(ids.map(id=>call(id,'release',{token:env.OPS_KEY+':'+id})));
 try{
  if(action==='state'){const states=await Promise.all(ids.map(async id=>{const r=await call(id,'state',{});return {owned:r.held&&r.lock?.token===env.OPS_KEY+':'+id&&r.lock?.actionPath===op,leaseUntil:r.lock?.leaseUntil||0};}));return Response.json({owned:states.filter(s=>s.owned).length,expected:ids.length,leaseUntil:Math.min(...states.map(s=>s.leaseUntil))});}
  if(action==='release'){await release();return Response.json({released:true});}
  const leases=await Promise.all(ids.map(async id=>{const s=await call(id,'state',{});if(s.held&&s.lock?.token===env.OPS_KEY+':'+id&&s.lock?.actionPath===op)return {acquired:true,leaseUntil:s.lock.leaseUntil};return call(id,'acquire',{token:env.OPS_KEY+':'+id,actionPath:op,leaseMs:120000});}));
  if(leases.some(r=>!r.acquired))return Response.json({acquired:false,busyIds:ids.filter((id,i)=>!leases[i].acquired)});
  return Response.json({acquired:true,count:ids.length,leaseUntil:Math.min(...leases.map(r=>r.leaseUntil))});
 }catch(e){if(action==='acquire')await release().catch(()=>{});return Response.json({error:e.message},{status:409});}
}};
