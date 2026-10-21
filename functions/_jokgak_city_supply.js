import {cityDisplayName} from '../shared/jokgak-city-disguise-v1.mjs';
import {cityShift,cityState} from '../shared/jokgak-city-v1.mjs';
import {createCitySupplyPlan,citySupplyEligible,citySupplyPublic,citySupplyWeapon,citySupplyWeaponExpiresAt} from '../shared/jokgak-city-supply-v1.mjs';
import {CITY_SETTINGS_KEY,cityCanAccess,cityRolePolicy} from '../shared/jokgak-city-settings-v1.mjs';
import {readCityLife,projectCityLife,cityLifeKey} from '../shared/jokgak-city-life-v1.mjs';
import {cityExplorationBag} from '../shared/jokgak-city-exploration-v1.mjs';
import {cityArmory} from '../shared/jokgak-city-expansion-v1.mjs';
import {cityLifeClaim} from './_jokgak_city_life.js';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
import {cityRoundWriteGuards} from './_jokgak_city_top.js';
import {cityOffScheduleWriteGuards} from './_jokgak_city_scheduled_off.js';
import {readCitySettings,cityRoleWeights} from './_jokgak_city_settings.js';
import {cityCareerPolicy} from './_jokgak_city_career.js';
import {assignedCityRole} from './_jokgak_city_roles.js';

const PREFIX='jokgak_city_supply_v1:';
const epochPart=epoch=>String(epoch).padStart(12,'0');
export const citySupplyPlanKey=(epoch,mode)=>`${PREFIX}${epochPart(epoch)}:${mode}:plan`;
export const citySupplyDropKey=id=>{const [epoch,mode,n]=id.split(':');return `${PREFIX}${epochPart(epoch)}:${mode}:drop:${n}`;};
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const conflict=error=>/guard|constraint|duplicate|unique|deadlock|serializ/i.test(error.message);
const fail=(code,message)=>{throw Object.assign(Error(message),{status:409,code:'CITY_SUPPLY_'+code});};
export function citySupplyPolicyGuards(env,policyRaw,token,now){
  const tag=token+':policy',out=cityRoundWriteGuards(env,cityShift(now).id,token);
  out.push(...cityOffScheduleWriteGuards(env,now,token));
  if(env.DB.dialect==='postgres')out.push(p(env,'SELECT key FROM app_meta WHERE key=? FOR SHARE',CITY_SETTINGS_KEY));
  return [...out,cityGuard(env,tag,policyRaw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',policyRaw===null?[CITY_SETTINGS_KEY]:[CITY_SETTINGS_KEY,policyRaw]),cityGuardEnd(env,tag)];
}
function storeDrop(env,record,next,token){
  const raw=JSON.stringify(next),tag=token+':drop';
  return [p(env,'UPDATE app_meta SET value=? WHERE key=? AND value=?',raw,record.key,record.raw),cityGuard(env,tag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[record.key,raw]),cityGuardEnd(env,tag)];
}
async function readRecords(env,policy,policyRaw,now,roll=random){
  if(!['ON','TEST'].includes(policy.mode))return [];
  const epoch=cityShift(now).id,key=citySupplyPlanKey(epoch,policy.mode);
  let stored=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();
  if(!stored){
    const plan=createCitySupplyPlan(now,policy.mode,roll),raw=JSON.stringify(plan),tag='city-supply-plan:'+crypto.randomUUID();
    try{await env.DB.batch([...citySupplyPolicyGuards(env,policyRaw,tag,now),
      p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,raw),
      cityGuard(env,tag,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,raw]),cityGuardEnd(env,tag),
      ...plan.drops.map(d=>p(env,'INSERT INTO app_meta(key,value) VALUES(?,?)',citySupplyDropKey(d.id),JSON.stringify(d)))
    ]);}catch(error){stored=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();if(!stored)throw error;}
    stored??=await p(env,'SELECT value FROM app_meta WHERE key=?',key).first();
  }
  const plan=JSON.parse(stored.value),keys=plan.drops.map(d=>citySupplyDropKey(d.id));
  if(!keys.length)return [];
  const rows=(await p(env,`SELECT key,value FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')}) ORDER BY key`,...keys).all()).results||[];
  if(rows.length!==keys.length)throw Object.assign(Error('보급 낙하 기록을 확인하지 못했습니다.'),{status:503,code:'CITY_SUPPLY_UNAVAILABLE'});
  return rows.map(r=>({key:r.key,raw:r.value,drop:JSON.parse(r.value)}));
}
async function holderState(env,drop,policy,now){
  if(!drop.holder)return null;
  const id=drop.holder.userId,row=await p(env,`SELECT c.*,u.nickname,u.role AS account_role,u.status AS account_status,u.banned_until,life.value AS life_raw FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id LEFT JOIN app_meta life ON life.key=? WHERE c.user_id=?`,cityLifeKey(id),id).first();
  if(!row)return null;
  const life=readCityLife(row.life_raw,now),weights=await cityRoleWeights(env,drop.epoch,policy),role=await assignedCityRole(env,id,drop.epoch,weights);
  const state=projectCityLife(cityState(row,role,now,cityRolePolicy(policy,role)),structuredClone(life),now,policy);
  const allowed=row.account_status==='ACTIVE'&&(!row.banned_until||Date.parse(String(row.banned_until).replace(' ','T')+'Z')<=now)&&cityCanAccess(policy,{id,role:row.account_role});
  return {row,life,state,eligible:allowed&&Number(row.epoch)===drop.epoch&&citySupplyEligible(state,drop,now)};
}
function lockHolder(env,row,token){
  const tag=token+':player';
  // Same player -> life -> crate lock order as city actions; no lost inventory writes.
  return [p(env,'UPDATE jokgak_city_players_v1 SET revision=revision+1,last_token=? WHERE user_id=? AND revision=?',token,row.user_id,row.revision),cityGuard(env,tag,'EXISTS(SELECT 1 FROM jokgak_city_players_v1 WHERE user_id=? AND last_token=?)',[row.user_id,token]),cityGuardEnd(env,tag)];
}
async function syncAwardedWeapons(env,records,policy,policyRaw,now,expiryTime=now){
  const awards=records.map(r=>r.drop).filter(d=>d.status==='AWARDED'&&d.winner).sort((a,b)=>a.endsAt-b.endsAt);
  for(const id of new Set(awards.map(d=>d.winner.userId))){
    for(let attempt=0;attempt<3;attempt++){
      const row=await p(env,`SELECT c.*,life.value AS life_raw FROM jokgak_city_players_v1 c LEFT JOIN app_meta life ON life.key=? WHERE c.user_id=?`,cityLifeKey(id),id).first();
      if(!row||Number(row.epoch)!==cityShift(now).id)break;
      const life=readCityLife(row.life_raw,now),bag=life.armory?.[policy.mode];
      if(!bag)break;
      const before=JSON.stringify(bag);
      // Old grants have no timer. Recover their original award deadline once,
      // never from deployment/login time and never resurrect a removed weapon.
      for(const d of awards.filter(d=>d.winner.userId===id)){
        if(!bag.owned.includes(d.weaponCode)||bag.supplyExpiresAt?.[d.weaponCode])continue;
        (bag.supplyExpiresAt??={})[d.weaponCode]=citySupplyWeaponExpiresAt(d.endsAt);
      }
      cityArmory(life,policy.mode,expiryTime);
      if(JSON.stringify(bag)===before)break;
      const token='city-supply-expiry:'+crypto.randomUUID();
      try{
        await env.DB.batch([...citySupplyPolicyGuards(env,policyRaw,token,now),...lockHolder(env,row,token),...cityLifeClaim(env,row,life,token)]);
        break;
      }catch(error){
        // Read back after a lost commit response as well as a competing action.
        const saved=await p(env,'SELECT value FROM app_meta WHERE key=?',cityLifeKey(id)).first();
        if(saved?.value===JSON.stringify(life))break;
        if(!conflict(error)||attempt===2)throw error;
      }
    }
  }
}
export async function processCitySupply(env,{policy,policyRaw,now=Date.now(),roll=random}={}){
  if(!policy){const saved=await readCitySettings(env);policy=await cityCareerPolicy(env,saved.policy,now);policyRaw=saved.raw;}
  if(!['ON','TEST'].includes(policy.mode))return {records:[],world:citySupplyPublic([],policy.mode,now)};
  let records=await readRecords(env,policy,policyRaw,now,roll),changed=false;
  // Settle delayed contests in award-time order before removing their prior
  // prizes, so a late duplicate cannot incorrectly restart a lifetime.
  const firstDue=Math.min(now,...records.filter(r=>r.drop.status==='OPEN'&&r.drop.endsAt<=now).map(r=>r.drop.endsAt));
  await syncAwardedWeapons(env,records,policy,policyRaw,now,firstDue);
  for(const initial of records){
    for(let attempt=0;attempt<3;attempt++){
      const record=attempt?await p(env,'SELECT value FROM app_meta WHERE key=?',initial.key).first().then(r=>r?{key:initial.key,raw:r.value,drop:JSON.parse(r.value)}:null):initial;
      if(!record||record.drop.status!=='OPEN'||record.drop.dropsAt>now)break;
      const d=record.drop,ended=d.endsAt<=now,owner=await holderState(env,d,policy,ended?d.endsAt:now);
      if(!ended&&(!d.holder||owner?.eligible))break;
      const token='city-supply:'+crypto.randomUUID(),next={...d,revision:d.revision+1,holder:null};
      const statements=citySupplyPolicyGuards(env,policyRaw,token,now);
      if(owner?.row)statements.push(...lockHolder(env,owner.row,token));
      if(ended){
        next.status=owner?.eligible?'AWARDED':'EXPIRED';next.settledAt=d.endsAt;
        if(owner?.eligible){
          const {row,life,state}=owner,weapon=citySupplyWeapon(d.weaponCode),id=Number(row.user_id);
          cityExplorationBag(life,policy.mode,d.endsAt);const armory=cityArmory(life,policy.mode,d.endsAt),duplicate=armory.owned.includes(weapon.code);
          if(!duplicate){armory.owned.push(weapon.code);(armory.supplyExpiresAt??={})[weapon.code]=citySupplyWeaponExpiresAt(d.endsAt);}
          const expiresAt=(armory.supplyExpiresAt??={})[weapon.code]??=citySupplyWeaponExpiresAt(d.endsAt);
          next.winner={userId:id,nickname:cityDisplayName(state)};
          const requestId='city-supply-award:'+d.id,supply={kind:'AWARDED',dropId:d.id,location:d.location,weapon,duplicate,winner:next.winner,endsAt:d.endsAt,expiresAt};
          const result={ok:true,requestId,action:'rewardSupply',epoch:d.epoch,mode:d.mode,cityMode:d.mode,createdAt:d.endsAt,location:d.location,mine:{...state,ownedWeapons:[...armory.owned],supplyWeaponExpiresAt:{...armory.supplyExpiresAt}},target:null,supply};
          statements.push(...cityLifeClaim(env,row,life,token),p(env,'INSERT INTO jokgak_city_actions_v1(request_id,user_id,action,fingerprint,result_json,created_at) VALUES(?,?,?,?,?,?)',requestId,id,'rewardSupply',JSON.stringify({dropId:d.id}),JSON.stringify(result),d.endsAt),
            p(env,'INSERT INTO jokgak_city_notifications_v1(id,user_id,request_id,created_at,summary_json) VALUES(?,?,?,?,?)',requestId+':notice',id,requestId,d.endsAt,JSON.stringify({requestId,action:'rewardSupply',actorName:'도시 관제',location:d.location,mode:d.mode,createdAt:d.endsAt,supply})));
        }
      }
      statements.push(...storeDrop(env,record,next,token));
      try{await env.DB.batch(statements);changed=true;break;}catch(error){
        const saved=await p(env,'SELECT value FROM app_meta WHERE key=?',record.key).first();
        if(saved&&JSON.parse(saved.value).status!=='OPEN'){changed=true;break;}
        if(!conflict(error)||attempt===2)throw error;
      }
    }
  }
  if(changed){
    records=await readRecords(env,policy,policyRaw,now,roll);
    await syncAwardedWeapons(env,records,policy,policyRaw,now);
  }
  const world=citySupplyPublic(records,policy.mode,now);
  // Active carriers reflect a newly used or expired disguise on each world read.
  for(const drop of world.drops.filter(d=>d.status==='OPEN'&&d.holder)){
    const owner=await holderState(env,records.find(r=>r.drop.id===drop.id).drop,policy,now);
    if(owner?.state)drop.holder={...drop.holder,nickname:cityDisplayName(owner.state)};
  }
  return {records,world};
}
export function requireCitySupply(records,id,now){
  const record=records.find(r=>r.drop.id===id);
  if(!record||record.drop.status!=='OPEN'||record.drop.dropsAt>now||record.drop.endsAt<=now)fail('CLOSED','진행 중인 보급상자를 확인하세요.');
  return record;
}
export function prepareCitySupplyChanges(env,{records,action,dropId,me,target,winner,now,requestId}){
  const statements=[];let result=null;
  const contest=['claimSupply','attackSupply'].includes(action);
  if(contest)requireCitySupply(records,dropId,now);
  for(const record of records){
    const d=record.drop;if(d.status!=='OPEN'||d.dropsAt>now)continue;
    // An action computed across the deadline must not invalidate the winner.
    if(d.endsAt<=now)fail('DEADLINE','보급 쟁탈전이 마감되었습니다. 전황을 새로 확인하세요.');
    let next=null;
    if(contest&&d.id===dropId){
      if(!citySupplyEligible(me,d,now)&&!(action==='attackSupply'&&winner!=='A'))fail('LOCATION','보급 낙하 지점에서 참여하세요.');
      if(action==='claimSupply'){
        if(d.holder)fail('HELD','이미 보유자가 있습니다. 최신 전황에서 쟁탈전에 참여하세요.');
        next={...d,holder:{userId:me.userId,nickname:cityDisplayName(me)},claimedAt:now};
      }else{
        if(d.holder?.userId!==target?.userId)fail('CHANGED','보급상자 보유자가 바뀌었습니다. 다시 확인하세요.');
        if(winner==='A')next={...d,holder:{userId:me.userId,nickname:cityDisplayName(me)},claimedAt:now};
      }
      result={kind:action==='claimSupply'?'CLAIMED':winner==='A'?'TAKEN':'DEFENDED',dropId:d.id,location:d.location,endsAt:d.endsAt,holder:next?.holder||d.holder};
    }
    const affected=[me,target].find(s=>s?.userId===(next||d).holder?.userId);
    if(affected&&!citySupplyEligible(affected,d,now))next={...(next||d),holder:null,claimedAt:0};
    // Even a defended/drawn contest CASes the crate with the player transaction.
    if(!next&&contest&&d.id===dropId)next={...d};
    if(next){next.revision=d.revision+1;statements.push(...storeDrop(env,record,next,requestId+':'+d.number));}
  }
  return {statements,result};
}
export function citySupplyCleanup(env,epoch){return [p(env,'DELETE FROM app_meta WHERE key>=? AND key<?',PREFIX,PREFIX+epochPart(epoch))];}
