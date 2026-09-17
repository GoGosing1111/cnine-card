import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

// Deduplicate only within this request's env. Cross-request caches contain
// completed schema flags, never a pending query or a database connection.
const pending=new WeakMap();
export async function ensureRuntimeFoundation(env,key,markers,initialize,verify){
  if(readRuntimeData(env,key))return;
  let tasks=pending.get(env);if(!tasks){tasks=new Map();pending.set(env,tasks);}
  if(tasks.has(key))return tasks.get(key);
  const task=(async()=>{
    const result=await env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${markers.map(()=>'?').join(',')})`).bind(...markers).all();
    const completed=new Set((result.results||[]).filter(row=>row.value==='1').map(row=>row.key));
    if(!markers.every(marker=>completed.has(marker))||(verify&&!await verify()))await initialize();
    cacheRuntimeData(env,key,true,1800000);
  })();
  tasks.set(key,task);
  try{await task;}finally{tasks.delete(key);}
}
