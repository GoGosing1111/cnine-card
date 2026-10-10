import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {cityRoleWeights,readCitySettings} from './_jokgak_city_settings.js';
async function roleKey(env){
 const key='jokgak_city_role_seed_v1';let value=readRuntimeData(env,'city_role_seed');
 if(!value){
  value=(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first())?.value;
  if(!value){await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(key,crypto.randomUUID()+crypto.randomUUID()).run();value=(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first()).value;}
  cacheRuntimeData(env,'city_role_seed',value,1800000);
 }
 return crypto.subtle.importKey('raw',new TextEncoder().encode(value),{name:'HMAC',hash:'SHA-256'},false,['sign']);
}
export async function assignedCityRole(env,userId,epoch,weights=null){
 weights||=await cityRoleWeights(env,epoch,(await readCitySettings(env)).policy);
 const hash=await crypto.subtle.sign('HMAC',await roleKey(env),new TextEncoder().encode(`${epoch}:${userId}`));
 let point=new DataView(hash).getUint32(0)%weights.reduce((sum,r)=>sum+r.weight,0);
 for(const row of weights){point-=row.weight;if(point<0)return row.code;}
 throw Error('CITY_ROLE_WEIGHTS');
}
