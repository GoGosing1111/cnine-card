import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {validateCityCareer} from '../shared/jokgak-city-career-v1.mjs';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
// A shift's wage table is immutable: delayed/offline settlement uses the same
// rates as online players. Emergency OFF still takes effect immediately.
export async function cityCareerPolicy(env,policy,now){
 if(!policy.career?.enabled||!['TEST','ON'].includes(policy.mode))return policy;
 const key='jokgak_city_career_policy_v1:'+policy.mode+':'+cityShift(now).id;
 let career=readRuntimeData(env,key);
 if(!career){
  let row=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();
  if(!row){await p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,JSON.stringify(policy.career)).run();row=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();}
  career=validateCityCareer(JSON.parse(row.value));cacheRuntimeData(env,key,career,300000);
 }
 return {...policy,career:{...career,enabled:policy.career.enabled,jobsEnabled:policy.career.jobsEnabled}};
}
