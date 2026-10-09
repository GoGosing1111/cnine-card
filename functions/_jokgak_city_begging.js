import {cityShift} from '../shared/jokgak-city-v1.mjs';
import {cityRolePolicy} from '../shared/jokgak-city-settings-v1.mjs';
import {changeCityCash} from '../shared/jokgak-city-cash-v1.mjs';
import {cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
const p=(env,sql,...values)=>env.DB.prepare(sql).bind(...values);
const parse=raw=>{try{return JSON.parse(raw);}catch{return null;}};
const fail=message=>{throw Object.assign(Error(message),{status:409,code:'CITY_BEGGING'});};
const access=policy=>policy.mode==='TEST'?` AND (u.role='OWNER'${policy.testUserIds.length?` OR c.user_id IN (${policy.testUserIds.map(()=>'?').join(',')})`:''})`:'';
const accessIds=policy=>policy.mode==='TEST'?policy.testUserIds:[];

export function beggingNotifications(env,{user,me,requestId,begging,policy,now}){
  const summary={requestId,action:begging.kind,actorId:Number(user.id),actorName:user.nickname,location:me.location,mode:policy.mode,createdAt:now,endsAt:begging.endsAt,cash:begging.cash};
  return p(env,`INSERT INTO jokgak_city_notifications_v1(id,user_id,request_id,created_at,summary_json)
    SELECT ?||':b:'||CAST(c.user_id AS TEXT),c.user_id,?,?,? FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id
    WHERE c.active=1 AND c.location=? AND c.user_id<>? AND c.health>0 AND c.jailed_until<=? AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))${access(policy)}`,
    requestId,requestId,now,JSON.stringify(summary),me.location,user.id,now,...accessIds(policy));
}
export async function cityBeggingOffers(env,user,mine,now,policy){
  if(!mine?.active||mine.restUntil>now||mine.deadUntil>now||mine.jailedUntil>now||mine.hospitalRequired||!cityRolePolicy(policy,'BEGGAR').begEnabled)return [];
  const rows=(await p(env,`SELECT n.id,n.summary_json,life.value AS life_raw FROM jokgak_city_notifications_v1 n
    JOIN jokgak_city_actions_v1 a ON a.request_id=n.request_id JOIN jokgak_city_players_v1 c ON c.user_id=a.user_id JOIN users u ON u.id=c.user_id
    LEFT JOIN app_meta life ON life.key='jokgak_city_life_v1:'||CAST(c.user_id AS TEXT)
    WHERE n.user_id=? AND n.read_at=0 AND n.created_at>? AND a.action IN ('beg','alms') AND c.active=1 AND c.location=? AND c.health>0 AND c.jailed_until<=?
    AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))${access(policy)} ORDER BY n.created_at DESC,n.id LIMIT 50`,
    user.id,now-120000,mine.location,now,...accessIds(policy)).all()).results||[];
  return rows.flatMap(row=>{
    const summary=parse(row.summary_json),beg=parse(row.life_raw)?.begging;
    return summary&&beg?.requestId===summary.requestId&&beg.mode===policy.mode&&beg.epoch===cityShift(now).id&&beg.endsAt>now&&beg.location===mine.location?[{id:row.id,...summary}]:[];
  }).slice(0,10);
}
export async function prepareCityDonation(env,{user,me,target,myLife,targetLife,policy,offerId,requestId,now}){
  const role=cityRolePolicy(policy,target.role),beg=targetLife.begging;
  if(target.role!=='BEGGAR'||!role.begEnabled||!beg||beg.requestId!==offerId||beg.endsAt<=now||beg.epoch!==cityShift(now).id||beg.mode!==policy.mode||beg.location!==me.location)fail('동냥이 끝났거나 상대가 이동했습니다.');
  const id=offerId+':b:'+user.id,row=await p(env,'SELECT summary_json FROM jokgak_city_notifications_v1 WHERE id=? AND user_id=? AND request_id=? AND read_at=0',id,user.id,offerId).first();
  if(!row||parse(row.summary_json)?.actorId!==target.userId)fail('이미 응답했거나 참여할 수 없는 동냥입니다.');
  // Amount is fixed by the saved offer, never by the donor's request body.
  changeCityCash(myLife,policy,-beg.cash);changeCityCash(targetLife,policy,beg.cash);
  const claimed=JSON.stringify({...parse(row.summary_json),donationRequestId:requestId}),tag=requestId+':donation';
  return {endsAt:beg.endsAt,result:{amount:beg.cash,currency:'CITY_CASH',unit:'원',mode:policy.mode,offerId,donorName:me.nickname,recipientName:target.nickname},statements:[
    p(env,'UPDATE jokgak_city_notifications_v1 SET read_at=?,summary_json=? WHERE id=? AND user_id=? AND read_at=0 AND summary_json=?',now,claimed,id,user.id,row.summary_json),
    cityGuard(env,tag,'EXISTS(SELECT 1 FROM jokgak_city_notifications_v1 WHERE id=? AND summary_json=?)',[id,claimed]),cityGuardEnd(env,tag)
  ]};
}
