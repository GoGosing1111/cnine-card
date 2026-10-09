import {CITY_RULES,CITY_ROLES,CITY_PLACES,cityShift,cityState,cityPlace} from '../shared/jokgak-city-v1.mjs';
import {ensureCitySchema} from './_jokgak_city_schema.js';
import {readJointBody} from './_joint_request.js';
import {prepareCityBattle} from './_jokgak_city_battle.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';

const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const parse=(value,fallback={})=>{try{return JSON.parse(value)??fallback;}catch{return fallback;}};
const fail=(code,message,status=409)=>{throw Object.assign(Error(message),{code:'CITY_'+code,status});};
const tokenValid=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{8,100}$/.test(value);
const activeUserSql="u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))";
const player=(env,id)=>p(env,`SELECT c.*,u.nickname,u.role AS account_role FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id WHERE c.user_id=? AND ${activeUserSql}`,id).first();
async function roleKey(env){
  const cache=readRuntimeData(env,'city_role_key');if(cache)return cache;
  const key='jokgak_city_role_seed_v1';let value=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value;
  if(!value){await p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,crypto.randomUUID()+crypto.randomUUID()).run();value=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first()).value;}
  const imported=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),{name:'HMAC',hash:'SHA-256'},false,['sign']);cacheRuntimeData(env,'city_role_key',imported,1800000);return imported;
}
export async function assignedCityRole(env,userId,epoch){
  const hash=await crypto.subtle.sign('HMAC',await roleKey(env),new TextEncoder().encode(`${epoch}:${userId}`));
  return CITY_ROLES[new DataView(hash).getUint32(0)%CITY_ROLES.length].code;
}
async function publicPlayer(env,row,now){return row?cityState(row,await assignedCityRole(env,Number(row.user_id),cityShift(now).id),now):null;}
async function enabled(env){return parse((await p(env,"SELECT value FROM app_meta WHERE key='jokgak_city_settings_v1'").first())?.value).enabled!==false;}
export async function cityStatus(env,user,location='HOME',after=0,now=Date.now()){
  if(!cityPlace(location))fail('PLACE','장소를 확인하세요.',400);
  const [mine,roster]=await Promise.all([player(env,user.id),p(env,`SELECT c.*,u.nickname FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id WHERE c.active=1 AND c.location=? AND c.user_id>? AND ${activeUserSql} ORDER BY c.user_id LIMIT 11`,location,after).all()]);
  const rows=roster.results||[];
  return {ok:true,serverNow:now,shift:cityShift(now),rules:CITY_RULES,roles:CITY_ROLES,places:CITY_PLACES,mine:await publicPlayer(env,mine,now),location,people:await Promise.all(rows.slice(0,10).map(row=>publicPlayer(env,row,now))),nextCursor:rows.length>10?Number(rows[9].user_id):null};
}
async function receipt(env,user,requestId,fingerprint=null,includeTarget=false){
  const row=await p(env,'SELECT * FROM jokgak_city_actions_v1 WHERE request_id=?',requestId).first();if(!row)return null;
  if(Number(row.user_id)!==Number(user.id)&&!(includeTarget&&Number(row.target_id)===Number(user.id)))fail('RECEIPT','이 기록에 접근할 수 없습니다.',403);
  if(fingerprint&&row.fingerprint!==fingerprint)fail('REQUEST_REUSED','같은 요청 번호에 다른 행동을 보낼 수 없습니다.');
  return {...parse(row.result_json),replayed:true};
}
function claim(env,row,next,requestId,epoch,now){
  const tag=requestId+':'+row.user_id;
  return [p(env,`UPDATE jokgak_city_players_v1 SET active=?,epoch=?,location=?,health=?,health_at=?,wanted=?,jailed_until=?,next_action_at=?,next_move_at=?,protected_until=?,revision=revision+1,last_token=?,updated_at=? WHERE user_id=? AND revision=?`,next.active?1:0,epoch,next.location,next.health,now,next.wanted,next.jailedUntil,next.nextActionAt,next.nextMoveAt,next.protectedUntil,requestId,now,row.user_id,row.revision),
    p(env,'INSERT INTO jokgak_city_guards_v1(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM jokgak_city_players_v1 WHERE user_id=? AND last_token=?) THEN 1 ELSE 0 END',tag,row.user_id,requestId),p(env,'DELETE FROM jokgak_city_guards_v1 WHERE token=?',tag)];
}
function actionable(mine,now){if(!mine?.active)fail('JOIN','먼저 도시에 입장하세요.');if(mine.jailedUntil>now)fail('JAILED','구금 시간이 끝나면 다시 행동할 수 있습니다.');}
export async function cityAction(env,deps,user,action,body){
  const clock=deps.now||Date.now,now=clock(),epoch=cityShift(now).id;
  if(!['join','leave','move','attack','arrest','heal','inspect'].includes(action))fail('ACTION','지원하지 않는 행동입니다.',404);
  if(!tokenValid(body.requestId)||body.requestId.length>80||!Number.isSafeInteger(body.epoch))fail('REQUEST','요청 정보를 확인하세요.',400);
  const targetId=Number(body.targetId||0),location=body.location||'';
  if(targetId&&!Number.isSafeInteger(targetId)||targetId<0)fail('TARGET','대상을 확인하세요.',400);
  const needsTarget=['attack','arrest','heal','inspect'].includes(action);
  if(needsTarget&&(!targetId||typeof body.targetId!=='number')||!needsTarget&&body.targetId!==undefined||action!=='move'&&body.location!==undefined)fail('FIELDS','행동에 맞는 대상과 장소를 확인하세요.',400);
  const fingerprint=JSON.stringify({action,targetId,location,epoch:body.epoch});
  const previous=await receipt(env,user,body.requestId,fingerprint);if(previous)return previous;
  if(body.epoch!==epoch)fail('SHIFT','역할이 교대되었습니다. 현황을 새로 확인하세요.');
  const rows=await Promise.all([player(env,user.id),targetId&&targetId!==Number(user.id)?player(env,targetId):null]);let [raw,targetRaw]=rows;
  const mine=await publicPlayer(env,raw,now);let me=mine?{...mine}:null;
  let target=targetId===Number(user.id)?me:await publicPlayer(env,targetRaw,now);
  const isFight=action==='attack'||action==='arrest';let simulation=null,inspection=null;
  if(action==='join'){
    if(me?.active)fail('ALREADY_JOINED','이미 도시에 체류 중입니다.');
    if(me?.nextActionAt>now)fail('COOLDOWN','퇴장 후 60초가 지나면 다시 입장할 수 있습니다.',429);
    const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)fail('DECK','PVP 덱에 일반 카드 5장을 편성한 뒤 입장하세요.');
    me={...(me||{userId:Number(user.id),nickname:user.nickname,role:await assignedCityRole(env,user.id,epoch),health:100,wanted:0,jailedUntil:0,protectedUntil:0,nextActionAt:0,nextMoveAt:0,revision:-1}),active:true,location:'HOME'};
  }else{
    actionable(me,now);
    if(action==='move'){
      if(!cityPlace(location))fail('PLACE','장소를 확인하세요.',400);
      if(me.nextMoveAt>now)fail('COOLDOWN','이동 대기시간을 확인하세요.',429);
      if(me.location===location)fail('SAME_PLACE','현재 머무르는 장소입니다.');
      me.location=location;me.nextMoveAt=now+CITY_RULES.moveCooldownMs;
    }else{
      if(me.nextActionAt>now)fail('COOLDOWN','다음 행동까지 잠시 기다려 주세요.',429);
      if(action==='leave'){me.active=false;me.nextActionAt=now+CITY_RULES.rejoinCooldownMs;}
      else{
        if(!target?.active||target.location!==me.location)fail('MOVED','상대가 이동했거나 도시에 체류 중이 아닙니다.');
        if(target.jailedUntil>now)fail('JAILED','구금 중인 상대에게는 행동할 수 없습니다.');
        if(action!=='heal'&&targetId===Number(user.id))fail('SELF','자신을 대상으로 선택할 수 없습니다.',400);
        if(action==='heal'){
          if(!['NURSE','DOCTOR'].includes(me.role))fail('ROLE','간호사와 의사만 치료할 수 있습니다.',403);
          if(target.health>=100)fail('FULL_HEALTH','이미 체력이 가득 찼습니다.');
          target.health=Math.min(100,target.health+(me.role==='DOCTOR'?50:25));me.nextActionAt=now+CITY_RULES.healCooldownMs;
        }else if(action==='inspect'){
          if(me.role!=='POLICE')fail('ROLE','경찰만 검문할 수 있습니다.',403);
          const deck=await deps.pvpDeckSnapshot(env,targetId,true),battle=await deps.battleSettings(env);
          inspection={nickname:target.nickname,role:target.role,wanted:target.wanted,cards:deck.map(c=>({id:String(c.id),name:c.name,title:c.title,rarity:c.rarity,image:c.image})),cardPower:deck.reduce((n,c)=>n+deps.cardBattlePower(c,c.breakthrough_level,battle),0)};
          me.nextActionAt=now+CITY_RULES.inspectCooldownMs;
        }else if(isFight){
          if(me.health<=0||target.health<=0)fail('HEALTH','체력을 회복한 뒤 교전할 수 있습니다.');
          if(target.protectedUntil>now)fail('PROTECTED','상대는 방금 교전하여 잠시 보호 중입니다.');
          if(action==='arrest'&&(me.role!=='POLICE'||target.wanted<1))fail('ARREST','경찰은 수배 중인 상대만 체포할 수 있습니다.',403);
          simulation=await (deps.prepareCityBattle||prepareCityBattle)(env,deps,user,{id:targetId,nickname:target.nickname,role:targetRaw.account_role});
          const winner=simulation.battleV2?.result?.winner;if(!['A','B','DRAW'].includes(winner))fail('BATTLE','전투 결과를 확인하지 못했습니다.',503);
          if(winner==='A')target.health=Math.max(0,target.health-CITY_RULES.defeatDamage);
          else if(winner==='B')me.health=Math.max(0,me.health-CITY_RULES.defeatDamage);
          if(action==='attack')me.wanted=Math.min(5,me.wanted+1);
          if(action==='arrest'&&winner==='A'){target.jailedUntil=now+CITY_RULES.arrestMs;target.location='POLICE';target.wanted=0;}
          me.nextActionAt=now+CITY_RULES.attackCooldownMs;me.protectedUntil=target.protectedUntil=now+CITY_RULES.targetProtectionMs;
        }
      }
    }
  }
  const committedAt=clock();if(cityShift(committedAt).id!==epoch)fail('SHIFT','역할이 교대되었습니다. 새 역할을 확인한 뒤 다시 행동하세요.');
  const elapsed=committedAt-now;
  if(action==='leave'||needsTarget)me.nextActionAt+=elapsed;
  if(action==='move')me.nextMoveAt+=elapsed;
  if(isFight){me.protectedUntil+=elapsed;target.protectedUntil+=elapsed;if(action==='arrest'&&simulation.battleV2.result.winner==='A')target.jailedUntil+=elapsed;}
  if(!(await enabled(env)))fail('CLOSED','족각도시 운영이 잠시 중지되었습니다.',403);
  const result={ok:true,requestId:body.requestId,action,epoch,createdAt:committedAt,location:mine?.location||'HOME',mine:me,target:targetId?target:null,inspection,...simulation};
  if(simulation)result.result=simulation.battleV2.result.winner==='A'?'WIN':simulation.battleV2.result.winner==='B'?'LOSE':'DRAW';
  const statements=[];
  if(!raw){
    statements.push(p(env,`INSERT INTO jokgak_city_players_v1(user_id,active,epoch,location,health,health_at,last_token,updated_at) VALUES(?,1,?,'HOME',100,?,?,?)`,user.id,epoch,committedAt,body.requestId,committedAt));
  }else{
    const changes=[{raw,next:me}];if(targetRaw&&['heal','attack','arrest','inspect'].includes(action))changes.push({raw:targetRaw,next:target});
    changes.sort((a,b)=>Number(a.raw.user_id)-Number(b.raw.user_id));
    for(const entry of changes)statements.push(...claim(env,entry.raw,entry.next,body.requestId,epoch,committedAt));
  }
  statements.push(p(env,'INSERT INTO jokgak_city_actions_v1(request_id,user_id,target_id,action,fingerprint,result_json,created_at) VALUES(?,?,?,?,?,?,?)',body.requestId,user.id,targetId||null,action,fingerprint,JSON.stringify(result),committedAt));
  if(targetId&&targetId!==Number(user.id)){
    const summary={requestId:body.requestId,action,actorId:Number(user.id),actorName:user.nickname,location:mine.location,winner:simulation?.battleV2?.result?.winner||null,health:target.health,jailedUntil:target.jailedUntil,createdAt:committedAt};
    statements.push(p(env,'INSERT INTO jokgak_city_notifications_v1(id,user_id,request_id,created_at,summary_json) VALUES(?,?,?,?,?)',body.requestId+':notice',targetId,body.requestId,committedAt,JSON.stringify(summary)));
  }
  try{await env.DB.batch(statements);}catch(error){const saved=await receipt(env,user,body.requestId,fingerprint);if(saved)return saved;if(/guard|constraint|duplicate|unique/i.test(error.message))fail('CONFLICT','전황이 바뀌었습니다. 최신 위치와 상태를 확인하세요.');throw error;}
  return result;
}
export async function handleJokgakCity({path,request,env,deps}){
  if(!path.startsWith('jokgak-city/'))return null;
  const json=deps.json;const user=await deps.authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  try{
    await ensureCitySchema(env);
    const part=path.slice('jokgak-city/'.length),url=new URL(request.url);
    if(request.method==='GET'&&part==='notifications'){
      const rows=(await p(env,'SELECT id,summary_json FROM jokgak_city_notifications_v1 WHERE user_id=? AND read_at=0 ORDER BY created_at,id LIMIT 10',user.id).all()).results||[];
      const row=await player(env,user.id);
      return json({ok:true,active:Number(row?.active)===1,items:rows.map(row=>({id:row.id,...parse(row.summary_json)})),serverNow:Date.now()});
    }
    if(request.method==='GET'&&part==='result'){
      const id=url.searchParams.get('requestId');if(!tokenValid(id))fail('REQUEST','기록 번호를 확인하세요.',400);
      const saved=await receipt(env,user,id,null,true);return saved?json(saved):json({error:'아직 확정된 기록이 없습니다.',code:'CITY_PENDING'},404);
    }
    if(!(await enabled(env)))fail('CLOSED','족각도시 운영이 잠시 중지되었습니다.',403);
    if(request.method==='GET'&&part==='status'){
      const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)fail('CURSOR','목록 위치를 확인하세요.',400);
      return json(await cityStatus(env,user,url.searchParams.get('location')||'HOME',after));
    }
    if(request.method==='POST'&&part==='ack'){
      const body=await readJointBody(request,{fields:['ids']});if(!Array.isArray(body.ids)||body.ids.length>10||body.ids.some(id=>!tokenValid(id)))fail('REQUEST','알림을 확인하세요.',400);
      if(body.ids.length)await p(env,`UPDATE jokgak_city_notifications_v1 SET read_at=? WHERE user_id=? AND id IN (${body.ids.map(()=>'?').join(',')})`,Date.now(),user.id,...body.ids).run();
      return json({ok:true});
    }
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{fields:['requestId','epoch','targetId','location']});
    return json(await deps.withUserMutationLock(env,user.id,path,()=>cityAction(env,deps,user,part,body)));
  }catch(error){
    if(error.status)return json({error:error.message,code:error.code||'CITY_REQUEST'},error.status);
    console.error('CITY_REQUEST_FAILED',{code:error.code||'UNKNOWN'});return json({error:'처리 상태를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',code:'CITY_RETRY',retryable:true},503);
  }
}
