import {isOpenDuo} from '../shared/ranked-duo-random-v4.mjs';
import {duoWeeklyConfig,DUO_WEEKLY_POLICY_KEY} from '../shared/ranked-duo-weekly-v3.mjs';
import {validateDuoConfig} from '../shared/ranked-duo-v1.mjs';
import {DUO_CURRENT_KEY} from './_ranked_duo_schema.js';
import {readDuoPolicy} from './_ranked_duo_economy.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

const p=env=>(sql,...args)=>env.DB.prepare(sql).bind(...args);
const rowSeason=row=>row?{...row,revision:Number(row.revision),config:validateDuoConfig(JSON.parse(row.config_json))}:null;
export async function readOpenDuoSeason(env){
 return rowSeason(await p(env)(`SELECT s.* FROM ranked_duo_seasons_v1 s JOIN app_meta m ON m.value=s.id WHERE m.key=?`,DUO_CURRENT_KEY).first());
}
export async function ensureOpenDuoWindow(env,s,now){
 if(!isOpenDuo(s?.config)||!s.config.weekly||!s.config.automatic||!s.config.visible||now<Date.parse(s.config.endsAt)||!['ACTIVE','SETTLING','CLOSED'].includes(s.status))return s;
 const snapshot=await readDuoPolicy(env,{snapshot:true});
 if(!snapshot?.policy.enabled||!isOpenDuo(snapshot.policy))return s;
 const q=p(env),config=validateDuoConfig(duoWeeklyConfig(snapshot.policy,now,s.config.weekly.sequence+1));
 const id=crypto.randomUUID(),guard=crypto.randomUUID(),at=new Date(now).toISOString();
 try{
  await env.DB.batch([
   ...(env.DB.dialect==='postgres'?[q('SELECT key FROM app_meta WHERE key=? FOR SHARE',DUO_WEEKLY_POLICY_KEY),q('SELECT id FROM ranked_duo_seasons_v1 WHERE id=? FOR UPDATE',s.id)]:[]),
   jointGuard(env.DB,guard,`EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM ranked_duo_seasons_v1 WHERE id=? AND revision=? AND status=?)`,[DUO_CURRENT_KEY,s.id,DUO_WEEKLY_POLICY_KEY,snapshot.value,s.id,s.revision,s.status]),
   ...(s.status==='CLOSED'?[]:[q("UPDATE ranked_duo_seasons_v1 SET status='SETTLING',revision=revision+1 WHERE id=?",s.id)]),
   q("INSERT INTO ranked_duo_seasons_v1(id,status,config_json,recruit_until,created_at) VALUES(?,'ACTIVE',?,NULL,?)",id,JSON.stringify(config),at),
   q('INSERT INTO ranked_duo_auto_v2(source_key,season_id,created_at) VALUES(?,?,?)',config.rankedSeason.key,id,at),
   q('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',id,DUO_CURRENT_KEY),
   jointGuardEnd(env.DB,guard)
  ]);
 }catch(error){
  const current=await readOpenDuoSeason(env);
  if(current?.id!==s.id&&isOpenDuo(current?.config))return current;
  throw error;
 }
 return readOpenDuoSeason(env);
}
