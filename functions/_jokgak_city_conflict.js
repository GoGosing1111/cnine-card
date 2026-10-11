import {cityShift,cityPlace} from '../shared/jokgak-city-v1.mjs';
import {cityConflictState,defaultCityConflict,selectCityBounty,validateCityConflictState} from '../shared/jokgak-city-conflict-v1.mjs';
import {changeCityCash} from '../shared/jokgak-city-cash-v1.mjs';
import {readRuntimeData,cacheRuntimeData,invalidateRuntimeData} from './_runtime_data_cache.js';

const p=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
export const CITY_INCIDENT_PREFIX='jokgak_city_incident_v1:';
export const CITY_BOUNTY_PREFIX='jokgak_city_bounty_v1:';
const epochPart=epoch=>String(epoch).padStart(12,'0')+':';
const scope=(prefix,epoch,mode)=>prefix+epochPart(epoch)+mode+':';
const instant=at=>String(at).padStart(13,'0');
export const cityBountyKey=(epoch,mode,id)=>scope(CITY_BOUNTY_PREFIX,epoch,mode)+id;
const riotCache=(policy,epoch)=>'city-riot:'+epoch+':'+policy.mode+':'+JSON.stringify(policy.conflict?.riot);
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const json=(env,column,...keys)=>env.DB.dialect==='postgres'?`(${column}::jsonb#>>'{${keys.join(',')}}')`:`json_extract(${column},'$.${keys.join('.')}')`;

export function prepareCityConflict(env,{action,winner,me,target,myLife,targetLife,policy,now,requestId,location,roll=random}){
  if(!['attack','arrest'].includes(action))return {statements:[],result:null};
  const epoch=cityShift(now).id,mode=policy.mode,rule=(policy.conflict||defaultCityConflict()).bounty;
  const statements=[],result={issued:null,claimed:null};
  // Arrests can reduce HP in the existing city engine. They deliberately never
  // count as bounty kills, consume a warrant, or pay a bounty, including defense.
  const killed=action==='attack'&&(winner==='A'&&target.health===0||winner==='B'&&me.health===0);
  if(killed){
    const killer=winner==='A'?me:target,victim=winner==='A'?target:me;
    const killerLife=winner==='A'?myLife:targetLife,victimLife=winner==='A'?targetLife:myLife;
    const k=cityConflictState(killerLife,mode,now),v=cityConflictState(victimLife,mode,now),warrant=v.bounty;
    k.kills=Math.min(1000000,k.kills+1);
    if(warrant){
      v.bounty=null;v.nextEligibleAt=now+rule.cooldownMs;
      statements.push(p(env,'DELETE FROM app_meta WHERE key=?',cityBountyKey(epoch,mode,victim.userId)));
      if(rule.enabled){
        changeCityCash(killerLife,policy,warrant.amount);
        result.claimed={id:warrant.id,epoch,mode,targetId:victim.userId,targetName:victim.nickname,killerId:killer.userId,killerName:killer.nickname,amount:warrant.amount,createdAt:now,location};
      }
    }
    if(rule.enabled&&!k.bounty&&k.kills>=rule.minKills&&now>=k.nextEligibleAt){
      const amount=selectCityBounty(rule,k.kills,roll(),roll());
      if(amount){
        k.bounty={id:requestId+':wanted:'+killer.userId,amount,issuedAt:now,kills:k.kills};
        result.issued={...k.bounty,userId:killer.userId,nickname:killer.nickname,epoch,mode,createdAt:now,location};
        statements.push(p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',cityBountyKey(epoch,mode,killer.userId),JSON.stringify(result.issued)));
      }
    }
  }
  const incident={epoch,mode,action,location,createdAt:now,...result};
  statements.push(p(env,'INSERT INTO app_meta(key,value) VALUES(?,?)',scope(CITY_INCIDENT_PREFIX,epoch,mode)+instant(now)+':'+requestId,JSON.stringify(incident)));
  return {statements,result:killed?result:null};
}
export function invalidateCityRiots(env,policy,epoch){invalidateRuntimeData(env,riotCache(policy,epoch));}
export function cityConflictCleanup(env,epoch){
  return [CITY_INCIDENT_PREFIX,CITY_BOUNTY_PREFIX].map(prefix=>p(env,'DELETE FROM app_meta WHERE key>=? AND key<?',prefix,prefix+epochPart(epoch)));
}
export async function cityConflictWorld(env,policy,now){
  const shift=cityShift(now),cfg=policy.conflict||defaultCityConflict(),prefix=scope(CITY_INCIDENT_PREFIX,shift.id,policy.mode),upper=prefix+instant(now+1);
  let riots=[];
  if(cfg.riot.enabled){
    const key=riotCache(policy,shift.id),cached=readRuntimeData(env,key,now);
    if(cached)riots=cached;
    else{
      const place=json(env,'value','location'),created=json(env,'value','createdAt');
      const rows=(await p(env,`SELECT ${place} AS location,COUNT(*) AS fights,MAX(CAST(${created} AS BIGINT)) AS last_at FROM app_meta WHERE key>=? AND key<? GROUP BY ${place}`,prefix+instant(Math.max(shift.startsAt,now-cfg.riot.windowMs)),upper).all()).results||[];
      riots=rows.filter(r=>cityPlace(r.location)&&Number(r.fights)>=cfg.riot.minBattles).map(r=>({location:r.location,battles:Number(r.fights),windowMs:cfg.riot.windowMs,expiresAt:Number(r.last_at)+cfg.riot.windowMs,intensity:Math.min(3,Math.floor(Number(r.fights)/cfg.riot.minBattles))}));
      cacheRuntimeData(env,key,riots,2000,now);
    }
  }
  let bounties=[],notices=[];
  if(cfg.bounty.enabled){
    const bountyPrefix=scope(CITY_BOUNTY_PREFIX,shift.id,policy.mode);
    const access=policy.mode==='TEST'?` AND (u.role='OWNER'${policy.testUserIds.length?` OR c.user_id IN (${policy.testUserIds.map(()=>'?').join(',')})`:''})`:'';
    const rows=(await p(env,`SELECT b.value,c.user_id,c.location,c.health,c.jailed_until,u.nickname,life.value AS life_raw FROM app_meta b JOIN jokgak_city_players_v1 c ON b.key=?||CAST(c.user_id AS TEXT) JOIN users u ON u.id=c.user_id JOIN app_meta life ON life.key='jokgak_city_life_v1:'||CAST(c.user_id AS TEXT) WHERE c.active=1 AND c.epoch=? AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))${access} ORDER BY c.user_id`,bountyPrefix,shift.id,...(policy.mode==='TEST'?policy.testUserIds:[])).all()).results||[];
    bounties=rows.flatMap(row=>{
      const record=JSON.parse(row.value),life=JSON.parse(row.life_raw);validateCityConflictState(life);
      const current=cityConflictState(life,policy.mode,now)?.bounty;if(!current||current.id!==record.id)return [];
      return [{...current,userId:Number(row.user_id),nickname:row.nickname,location:row.location,kills:life.conflict[policy.mode].kills,deadUntil:life.death&&!life.death.resolved?life.death.until:0,jailedUntil:Number(row.jailed_until)}];
    }).sort((a,b)=>b.amount-a.amount||b.kills-a.kills||a.userId-b.userId);
    const events=(await p(env,`SELECT value FROM app_meta WHERE key>=? AND key<? AND (${json(env,'value','issued','id')} IS NOT NULL OR ${json(env,'value','claimed','id')} IS NOT NULL) ORDER BY key DESC LIMIT 12`,prefix+instant(Math.max(shift.startsAt,now-120000)),upper).all()).results||[];
    notices=events.reverse().flatMap(row=>{const event=JSON.parse(row.value);return [event.claimed&&{...event.claimed,id:event.claimed.id+':cleared',kind:'CLAIMED'},event.issued&&{...event.issued,kind:'ISSUED'}].filter(Boolean);});
  }
  return {epoch:shift.id,mode:policy.mode,riots,bounties,notices};
}
