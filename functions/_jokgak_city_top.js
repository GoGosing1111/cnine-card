import {cityShift,CITY_SHIFT_MS} from '../shared/jokgak-city-v1.mjs';
import {readCityLife,cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {projectCityCareer} from '../shared/jokgak-city-career-v1.mjs';
import {readCitySettings,cityRoleWeights} from './_jokgak_city_settings.js';
import {cityCareerPolicy} from './_jokgak_city_career.js';
import {assignedCityRole} from './_jokgak_city_roles.js';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
import {cityTopKey,milestoneValue,CITY_TOP_GOAL} from './_milestone_trophies.js';
export const CITY_TOP_CURSOR='jokgak_city_top_next_epoch_v1';
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
// Share the epoch lock with settlement. A request that finished computing just
// before the boundary must not write an old wallet/receipt after TOP was closed.
export function cityRoundWriteGuards(env,epoch,token){
 const tag=token+':round',statements=[];
 if(env.DB.dialect==='postgres')statements.push(p(env,'SELECT key FROM app_meta WHERE key=? FOR SHARE',CITY_TOP_CURSOR));
 statements.push(cityGuard(env,tag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[CITY_TOP_CURSOR,String(epoch)]),cityGuardEnd(env,tag));
 return statements;
}
export async function prepareCityTopSettlement(env,shift){
 // Start with this deployment's current shift, never invent deleted history.
 let marker=await p(env,'SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first();
 if(!marker){await p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',CITY_TOP_CURSOR,String(shift.id)).run();marker=await p(env,'SELECT value FROM app_meta WHERE key=?',CITY_TOP_CURSOR).first();}
 const raw=marker.value,from=Number(raw);
 if(!Number.isSafeInteger(from)||from<0)throw Error('CITY_TOP_CURSOR_INVALID');
 if(from>=shift.id)return {statements:[],awards:[],from};
 // A private token distinguishes this claim from a concurrent successful writer.
 const token='city-top:'+crypto.randomUUID(),statements=[
  p(env,'UPDATE app_meta SET value=? WHERE key=? AND value=?',token,CITY_TOP_CURSOR,raw),
  cityGuard(env,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[CITY_TOP_CURSOR,token])
 ];
 const mode=env.DB.dialect==='postgres'?"(a.result_json::jsonb->>'mode')":"json_extract(a.result_json,'$.mode')";
 const candidatesSql=`FROM jokgak_city_players_v1 c
  JOIN users u ON u.id=c.user_id JOIN app_meta life ON life.key='jokgak_city_life_v1:'||CAST(c.user_id AS TEXT)
  WHERE c.epoch>=? AND c.epoch<? AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))
  AND EXISTS(SELECT 1 FROM jokgak_city_actions_v1 a WHERE a.user_id=c.user_id AND ${mode}='ON'
   AND a.created_at>=c.epoch*${CITY_SHIFT_MS}-32400000 AND a.created_at<(c.epoch+1)*${CITY_SHIFT_MS}-32400000)`;
 const rows=(await p(env,`SELECT c.*,life.value AS life_raw ${candidatesSql} ORDER BY c.user_id`,from,shift.id).all()).results||[];
 // New entrants committed while this plan was being prepared require a fresh
 // snapshot too, even when none of the previously seen rows changed.
 statements.push(cityGuard(env,token+':participants',`(SELECT COUNT(*) ${candidatesSql})=?`,[from,shift.id,rows.length]),cityGuardEnd(env,token+':participants'));
 const {policy}=await readCitySettings(env),byEpoch=new Map(),awards=[];
 for(const row of rows){
  const guard=token+':'+row.user_id;
  if(env.DB.dialect==='postgres')statements.push(p(env,'SELECT user_id FROM jokgak_city_players_v1 WHERE user_id=? FOR UPDATE',row.user_id),p(env,'SELECT key FROM app_meta WHERE key=? FOR UPDATE',cityLifeKey(row.user_id)));
  statements.push(cityGuard(env,guard,'EXISTS(SELECT 1 FROM jokgak_city_players_v1 WHERE user_id=? AND revision=? AND epoch=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[row.user_id,row.revision,row.epoch,cityLifeKey(row.user_id),row.life_raw]),cityGuardEnd(env,guard));
  const epoch=Number(row.epoch),round=cityShift(epoch*CITY_SHIFT_MS-32400000),at=round.endsAt-1;
  let group=byEpoch.get(epoch);
  if(!group){const rules=await cityCareerPolicy(env,{...policy,mode:'ON'},at);group={round,rules,weights:await cityRoleWeights(env,epoch,rules),candidates:[]};byEpoch.set(epoch,group);}
  const life=readCityLife(row.life_raw,at);if(!life.wallets?.ON)continue;
  const role=await assignedCityRole(env,Number(row.user_id),epoch,group.weights);
  projectCityCareer({role,active:false},life,at,group.rules);
  group.candidates.push({id:Number(row.user_id),cash:life.wallets.ON.balance});
 }
 for(const [epoch,group] of [...byEpoch].sort((a,b)=>a[0]-b[0])){
  const max=group.candidates.reduce((value,c)=>Math.max(value,c.cash),-1);
  for(const candidate of group.candidates.filter(c=>c.cash===max)){
   const key=cityTopKey(candidate.id),stored=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
   const before=milestoneValue(stored,CITY_TOP_GOAL),count=before.count+1,at=new Date(group.round.endsAt).toISOString();
   const value=JSON.stringify({count,acquiredAt:before.acquiredAt||(count>=CITY_TOP_GOAL?at:null),lastAt:at,lastEpoch:epoch,lastCash:max});
   const guard=token+':honor:'+candidate.id;
   statements.push(stored===null?p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,value):p(env,'UPDATE app_meta SET value=? WHERE key=? AND value=?',value,key,stored),cityGuard(env,guard,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,value]),cityGuardEnd(env,guard));
   awards.push({userId:candidate.id,epoch,cash:max,count});
  }
 }
 statements.push(p(env,'UPDATE app_meta SET value=? WHERE key=? AND value=?',String(shift.id),CITY_TOP_CURSOR,token),cityGuardEnd(env,token));
 return {statements,awards,from};
}
