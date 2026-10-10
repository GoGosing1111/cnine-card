import {cityShift} from '../shared/jokgak-city-v1.mjs';
const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const parse=value=>{try{return JSON.parse(value)||{};}catch{return {};}};
const prefKey=id=>'jokgak_city_notice_preferences_v1:'+id;
export async function cityNoticePreferences(env,id){return {hidePopups:parse((await p(env,'SELECT value FROM app_meta WHERE key=?',prefKey(id)).first())?.value).hidePopups===true};}
export async function saveCityNoticePreferences(env,id,hidePopups){
 if(typeof hidePopups!=='boolean')throw Object.assign(Error('알림 설정을 확인하세요.'),{status:400,code:'CITY_PREFERENCES'});
 await p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',prefKey(id),JSON.stringify({hidePopups})).run();return {hidePopups};
}
export async function cityNoticeCount(env,id,now){return Number((await p(env,"SELECT COUNT(*) AS count FROM jokgak_city_notifications_v1 n JOIN jokgak_city_actions_v1 a ON a.request_id=n.request_id WHERE n.user_id=? AND n.read_at=0 AND n.created_at>=? AND a.action NOT IN ('beg','alms')",id,cityShift(now).startsAt).first())?.count||0);}
export async function skipCityNotices(env,id,through,now){
 const shift=cityShift(now);
 if(!Number.isSafeInteger(through)||through<shift.startsAt||through>now)throw Object.assign(Error('교대가 바뀌었습니다. 알림을 다시 확인하세요.'),{status:409,code:'CITY_SHIFT'});
 await p(env,"UPDATE jokgak_city_notifications_v1 SET read_at=? WHERE user_id=? AND read_at=0 AND created_at>=? AND created_at<=? AND request_id IN (SELECT request_id FROM jokgak_city_actions_v1 WHERE action NOT IN ('beg','alms'))",now,id,shift.startsAt,through).run();
}
export async function cityActivityLog(env,id,now,before=now+1,beforeId='~'){
 if(!Number.isSafeInteger(before)||before<0||typeof beforeId!=='string'||beforeId.length>120)throw Object.assign(Error('기록 목록 위치를 확인하세요.'),{status:400,code:'CITY_CURSOR'});
 const shift=cityShift(now),args=[id,shift.startsAt,before,before,beforeId];
 const [sent,received]=await Promise.all([
  p(env,"SELECT 'sent:'||request_id AS id,result_json,created_at FROM jokgak_city_actions_v1 WHERE user_id=? AND created_at>=? AND (created_at<? OR (created_at=? AND 'sent:'||request_id<?)) ORDER BY created_at DESC,request_id DESC LIMIT 21",...args).all(),
  p(env,"SELECT 'received:'||id AS id,summary_json,read_at,created_at FROM jokgak_city_notifications_v1 WHERE user_id=? AND created_at>=? AND (created_at<? OR (created_at=? AND 'received:'||id<?)) ORDER BY created_at DESC,id DESC LIMIT 21",...args).all()
 ]);
 const rows=[...(sent.results||[]).map(r=>{const s=parse(r.result_json);return {id:r.id,createdAt:r.created_at,direction:'sent',action:s.action,actorName:s.mine?.nickname,targetName:s.target?.nickname,location:s.location,winner:s.battleV2?.result?.winner,health:s.mine?.health,theft:s.theft,donation:s.donation,service:s.service,comms:s.comms,work:s.work};}),...(received.results||[]).map(r=>({id:r.id,createdAt:r.created_at,direction:'received',read:!!r.read_at,...parse(r.summary_json)}))].sort((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?1:a.id>b.id?-1:0));
 const items=rows.slice(0,20),last=items.at(-1);
 return {items,shift,next:rows.length>20?{before:last.createdAt,beforeId:last.id}:null};
}
export async function cityBroadcasts(env,mode,now){
 const rows=(await p(env,"SELECT request_id,result_json,created_at FROM jokgak_city_actions_v1 WHERE action='broadcast' AND created_at>=? ORDER BY created_at DESC,request_id DESC LIMIT 50",Math.max(cityShift(now).startsAt,now-120000)).all()).results||[];
 return rows.flatMap(r=>{const s=parse(r.result_json);return s.mode===mode&&s.comms?.kind==='broadcast'?[{id:r.request_id,...s.comms}]:[];}).slice(0,12).reverse();
}
