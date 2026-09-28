import {duoLifecycle} from '../../functions/_ranked_duo.js';
export const ADDITIONAL_RECRUITMENT_RECEIPT='ops_ranked_duo_additional_12h_20260928';
// One user-authorized opening. A lost response cannot extend the deadline on retry.
export async function openAdditionalRecruitment12h(env,{seasonId,revision,now=Date.now()}){
 const p=duoLifecycle.statement(env),key=ADDITIONAL_RECRUITMENT_RECEIPT;
 const owner=await p("SELECT id,role FROM users WHERE id=1 AND role='OWNER' AND status='ACTIVE'").first();
 if(!owner)throw Error('Active OWNER required');
 const previous=await p('SELECT value FROM app_meta WHERE key=?',key).first();
 if(previous){const result=JSON.parse(previous.value);if(result.seasonId!==seasonId)throw Error('Receipt season mismatch');return {...result,replayed:true};}
 const season=await duoLifecycle.currentSeason(env);
 if(!season||season.id!==seasonId||season.revision!==revision||season.status!=='ACTIVE')throw Error('Season changed since inspection');
 if(season.config.additionalRecruitment&&season.config.additionalRecruitment.phase!=='CLOSED')throw Error('Additional recruitment already open');
 const result={seasonId,hours:12,openedAt:new Date(now).toISOString(),until:new Date(now+12*3600000).toISOString(),startsAt:season.config.startsAt,endsAt:season.config.endsAt};
 const operationEnv={...env,DB:{
  dialect:env.DB.dialect,prepare:env.DB.prepare.bind(env.DB),
  batch:statements=>env.DB.batch([...statements,p('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,JSON.stringify(result))])
 }};
 await duoLifecycle.adminChange(operationEnv,owner,season,{seasonId,revision,hours:12},'recruit',now);
 return {...result,replayed:false};
}
