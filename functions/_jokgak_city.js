import {CITY_PLACES,cityShift,cityState,cityPlace} from '../shared/jokgak-city-v1.mjs';
import {ensureCitySchema} from './_jokgak_city_schema.js';
import {readJointBody} from './_joint_request.js';
import {prepareCityBattle} from './_jokgak_city_battle.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {CITY_SETTINGS_KEY,cityCanAccess,cityRolePolicy} from '../shared/jokgak-city-settings-v1.mjs';
import {readCitySettings,cityRoleWeights,cityPublicPolicy,handleCityCms,requireCityAccess} from './_jokgak_city_settings.js';
import {prepareCityReward,cityRewardEvent,cityGuard,cityGuardEnd} from './_jokgak_city_rewards.js';
import {readCityLife,projectCityLife,applyCityLifeView,markCityDeath} from '../shared/jokgak-city-life-v1.mjs';
import {cityLifeClaim,prepareCityService} from './_jokgak_city_life.js';
import {transferCityCash} from '../shared/jokgak-city-cash-v1.mjs';

const p=(env,sql,...v)=>env.DB.prepare(sql).bind(...v);
const parse=(value,fallback={})=>{try{return JSON.parse(value)??fallback;}catch{return fallback;}};
const fail=(code,message,status=409)=>{throw Object.assign(Error(message),{code:'CITY_'+code,status});};
const tokenValid=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{8,100}$/.test(value);
const activeUserSql="u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))";
const lifeJoin=" LEFT JOIN app_meta life ON life.key='jokgak_city_life_v1:'||CAST(c.user_id AS TEXT) ";
const player=(env,id)=>p(env,`SELECT c.*,u.nickname,u.role AS account_role,life.value AS life_raw FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id ${lifeJoin} WHERE c.user_id=? AND ${activeUserSql}`,id).first();
const lifeStates=new WeakMap();
async function roleKey(env){
  const key='jokgak_city_role_seed_v1';let value=readRuntimeData(env,'city_role_seed');
  if(!value){
    value=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first())?.value;
    if(!value){await p(env,'INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING',key,crypto.randomUUID()+crypto.randomUUID()).run();value=(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first()).value;}
    // Workers cannot structuredClone CryptoKey. Cache only the stable seed;
    // importing it locally preserves the same role for the current shift.
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
async function publicPlayer(env,row,now,policy,weights){
  if(!row)return null;
  const role=await assignedCityRole(env,Number(row.user_id),cityShift(now).id,weights);
  const life=readCityLife(row.life_raw,now),state=projectCityLife(cityState(row,role,now,cityRolePolicy(policy,role)),life,now,policy);
  lifeStates.set(state,life);return state;
}
// Persist automatic hospital arrival/respawn with the same player revision as
// combat. No scheduler, client timer, role rollover or reload can reroll it.
async function syncCityPlayer(env,user,policy,weights,now,policyRaw){
  for(let attempt=0;attempt<3;attempt++){
    const row=await player(env,user.id),state=await publicPlayer(env,row,now,policy,weights);if(!row)return null;
    const life=lifeStates.get(state),storedDeath=row.life_raw?parse(row.life_raw).death:null;
    const cashMissing=['TEST','ON'].includes(policy.mode)&&!parse(row.life_raw).wallets?.[policy.mode];
    if(row.life_raw!=null&&!cashMissing&&state.location===row.location&&!(storedDeath&&!storedDeath.resolved&&life.death?.resolved))return state;
    const id='city-auto:'+crypto.randomUUID();
    const guards=[];if(env.DB.dialect==='postgres')guards.push(p(env,'SELECT key FROM app_meta WHERE key=? FOR SHARE',CITY_SETTINGS_KEY));
    guards.push(cityGuard(env,id+':policy',policyRaw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',policyRaw===null?[CITY_SETTINGS_KEY]:[CITY_SETTINGS_KEY,policyRaw]),cityGuardEnd(env,id+':policy'));
    try{await env.DB.batch([...guards,...claim(env,row,state,id,cityShift(now).id,now),...cityLifeClaim(env,row,life,id)]);state.revision++;return state;}
    catch(error){if(!/guard|constraint|duplicate|unique/i.test(error.message))throw error;}
  }
  fail('CONFLICT','도시 상태가 변경되었습니다. 다시 확인하세요.');
}
export async function cityStatus(env,user,location='HOME',after=0,now=Date.now()){
  const {policy,raw:policyRaw}=await readCitySettings(env);requireCityAccess(policy,user);
  if(!cityPlace(location))fail('PLACE','장소를 확인하세요.',400);
  const weights=await cityRoleWeights(env,cityShift(now).id,policy);
  const testerFilter=policy.mode==='TEST'?` AND (u.role='OWNER'${policy.testUserIds.length?` OR c.user_id IN (${policy.testUserIds.map(()=>'?').join(',')})`:''})`:'';
  const mine=await syncCityPlayer(env,user,policy,weights,now,policyRaw);
  const roster=await p(env,`SELECT c.*,u.nickname,life.value AS life_raw FROM jokgak_city_players_v1 c JOIN users u ON u.id=c.user_id ${lifeJoin} WHERE c.active=1 AND c.location=? AND c.user_id>? AND ${activeUserSql}${testerFilter} ORDER BY c.user_id LIMIT 11`,location,after,...(policy.mode==='TEST'?policy.testUserIds:[])).all();
  const rows=roster.results||[];
  const people=(await Promise.all(rows.slice(0,10).map(row=>publicPlayer(env,row,now,policy,weights)))).filter(row=>row.location===location).map(({bag,cash,cashMode,cashUnit,...row})=>row);
  return {ok:true,serverNow:now,shift:cityShift(now),...cityPublicPolicy(policy),places:CITY_PLACES,mine,location,people,nextCursor:rows.length>10?Number(rows[9].user_id):null};
}
async function receipt(env,user,requestId,fingerprint=null,includeTarget=false){
  const row=await p(env,'SELECT * FROM jokgak_city_actions_v1 WHERE request_id=?',requestId).first();if(!row)return null;
  if(Number(row.user_id)!==Number(user.id)&&!(includeTarget&&Number(row.target_id)===Number(user.id)))fail('RECEIPT','이 기록에 접근할 수 없습니다.',403);
  if(fingerprint&&row.fingerprint!==fingerprint)fail('REQUEST_REUSED','같은 요청 번호에 다른 행동을 보낼 수 없습니다.');
  const result={...parse(row.result_json),replayed:true};
  if(Number(row.user_id)!==Number(user.id)){
    const {cash,cashMode,cashUnit,bag,...visibleMine}=result.mine||{};
    result.mine=visibleMine;
    // A defender may inspect the fight, but not the attacker's private wallet
    // balance embedded in activity/service reward receipts.
    result.reward=null;result.service=null;
  }
  return result;
}
function claim(env,row,next,requestId,epoch,now){
  const tag=requestId+':'+row.user_id;
  return [p(env,`UPDATE jokgak_city_players_v1 SET active=?,epoch=?,location=?,health=?,health_at=?,wanted=?,jailed_until=?,next_action_at=?,next_move_at=?,protected_until=?,revision=revision+1,last_token=?,updated_at=? WHERE user_id=? AND revision=?`,next.active?1:0,epoch,next.location,next.health,now,next.wanted,next.jailedUntil,next.nextActionAt,next.nextMoveAt,next.protectedUntil,requestId,now,row.user_id,row.revision),
    p(env,'INSERT INTO jokgak_city_guards_v1(token,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM jokgak_city_players_v1 WHERE user_id=? AND last_token=?) THEN 1 ELSE 0 END',tag,row.user_id,requestId),p(env,'DELETE FROM jokgak_city_guards_v1 WHERE token=?',tag)];
}
function actionable(mine,now){if(!mine?.active)fail('JOIN','먼저 도시에 입장하세요.');if(mine.deadUntil>now)fail('DEAD','사망 후 3분이 지나면 병원에서 자동 부활합니다.');if(mine.jailedUntil>now)fail('JAILED','구금 시간이 끝나면 다시 행동할 수 있습니다.');}
export async function cityAction(env,deps,user,action,body){
  const clock=deps.now||Date.now,now=clock(),epoch=cityShift(now).id;
  if(!['join','leave','move','attack','arrest','heal','inspect','eat','treat','buy','use'].includes(action))fail('ACTION','지원하지 않는 행동입니다.',404);
  if(!tokenValid(body.requestId)||body.requestId.length>80||!Number.isSafeInteger(body.epoch))fail('REQUEST','요청 정보를 확인하세요.',400);
  const targetId=Number(body.targetId||0),location=body.location||'',product=body.product||'';
  if(targetId&&!Number.isSafeInteger(targetId)||targetId<0)fail('TARGET','대상을 확인하세요.',400);
  const needsTarget=['attack','arrest','heal','inspect'].includes(action);
  if(needsTarget&&(!targetId||typeof body.targetId!=='number')||!needsTarget&&body.targetId!==undefined||action!=='move'&&body.location!==undefined)fail('FIELDS','행동에 맞는 대상과 장소를 확인하세요.',400);
  if(['buy','use'].includes(action)?typeof body.product!=='string'||!body.product:body.product!==undefined)fail('FIELDS','상품 정보를 확인하세요.',400);
  const fingerprint=JSON.stringify({action,targetId,location,epoch:body.epoch,...(product?{product}:{})});
  const previous=await receipt(env,user,body.requestId,fingerprint);if(previous)return previous;
  const {policy,raw:policyRaw}=await readCitySettings(env);
  if(action!=='leave')requireCityAccess(policy,user);
  if(body.epoch!==epoch)fail('SHIFT','역할이 교대되었습니다. 현황을 새로 확인하세요.');
  const weights=await cityRoleWeights(env,epoch,policy);
  const rows=await Promise.all([player(env,user.id),targetId&&targetId!==Number(user.id)?player(env,targetId):null]);let [raw,targetRaw]=rows;
  const mine=await publicPlayer(env,raw,now,policy,weights);let me=mine?{...mine}:null;
  const myLife=mine?lifeStates.get(mine):readCityLife(null,now);
  let target=targetId===Number(user.id)?me:await publicPlayer(env,targetRaw,now,policy,weights);
  const targetLife=targetId===Number(user.id)?myLife:target?lifeStates.get(target):null;
  if(targetRaw&&!cityCanAccess(policy,{id:targetId,role:targetRaw.account_role}))fail('TARGET_ACCESS','현재 운영 모드에 참여할 수 없는 상대입니다.',403);
  const roleCode=me?.role||await assignedCityRole(env,user.id,epoch,weights),role=cityRolePolicy(policy,roleCode),rules=policy.rules;
  const targetHealthBefore=target?.health,healthBefore=me?.health;
  const isFight=action==='attack'||action==='arrest',isService=['eat','treat','buy','use'].includes(action);let simulation=null,inspection=null,service=null;
  if(action==='join'){
    if(me?.active)fail('ALREADY_JOINED','이미 도시에 체류 중입니다.');
    if(me?.deadUntil>now)fail('DEAD','사망 대기 중입니다. 3분 후 병원에서 부활합니다.');
    if(me?.nextActionAt>now)fail('COOLDOWN',`퇴장 후 ${rules.rejoinCooldownMs/1000}초가 지나면 다시 입장할 수 있습니다.`,429);
    const deck=await deps.pvpDeckSnapshot(env,user.id);if(deck.length!==5)fail('DECK','PVP 덱에 일반 카드 5장을 편성한 뒤 입장하세요.');
    me={...(me||{userId:Number(user.id),nickname:user.nickname,role:roleCode,health:role.maxHealth,maxHealth:role.maxHealth,wanted:0,jailedUntil:0,protectedUntil:0,nextActionAt:0,nextMoveAt:0,revision:-1}),active:true,location:me?.hospitalRequired||myLife.death&&me?.location==='HOSPITAL'?'HOSPITAL':role.startLocation};
  }else if(action==='leave'){
    if(!me?.active)fail('JOIN','현재 도시에 체류 중이 아닙니다.');
    me.active=false;me.nextActionAt=Math.max(me.nextActionAt,now+rules.rejoinCooldownMs);
  }else{
    actionable(me,now);
    if(me.hospitalRequired&&!['treat','use'].includes(action))fail('HOSPITAL','건강이 위험해 병원으로 이송되었습니다. 진료로 건강을 회복하세요.');
    if(action==='move'){
      if(!cityPlace(location))fail('PLACE','장소를 확인하세요.',400);
      if(me.nextMoveAt>now)fail('COOLDOWN','이동 대기시간을 확인하세요.',429);
      if(me.location===location)fail('SAME_PLACE','현재 머무르는 장소입니다.');
      me.location=location;me.nextMoveAt=now+rules.moveCooldownMs;
    }else if(isService){
      service=await prepareCityService(env,{user,action,product,me,life:myLife,policy,now,requestId:body.requestId});
    }else{
      if(me.nextActionAt>now)fail('COOLDOWN','다음 행동까지 잠시 기다려 주세요.',429);
      {
        if(!target?.active||target.location!==me.location)fail('MOVED','상대가 이동했거나 도시에 체류 중이 아닙니다.');
        if(target.deadUntil>now)fail('DEAD','사망 대기 중인 상대에게 행동할 수 없습니다.');
        if(target.hospitalRequired&&action!=='heal')fail('HOSPITAL','응급 진료 중인 상대입니다.');
        if(target.jailedUntil>now)fail('JAILED','구금 중인 상대에게는 행동할 수 없습니다.');
        if(action!=='heal'&&targetId===Number(user.id))fail('SELF','자신을 대상으로 선택할 수 없습니다.',400);
        if(action==='heal'){
          if(!['NURSE','DOCTOR'].includes(me.role))fail('ROLE','간호사와 의사만 치료할 수 있습니다.',403);
          if(!role.healAmount||targetId===Number(user.id)&&!role.selfHeal)fail('HEAL_DISABLED','현재 역할 설정에서는 이 치료를 사용할 수 없습니다.',403);
          if(target.health>=target.maxHealth)fail('FULL_HEALTH','이미 체력이 가득 찼습니다.');
          target.health=Math.min(target.maxHealth,target.health+role.healAmount);me.nextActionAt=now+role.healCooldownMs;
        }else if(action==='inspect'){
          if(me.role!=='POLICE'||!role.inspectEnabled)fail('ROLE','검문을 사용할 수 있는 경찰만 가능합니다.',403);
          const deck=await deps.pvpDeckSnapshot(env,targetId,true),battle=await deps.battleSettings(env);
          inspection={nickname:target.nickname,role:target.role,wanted:target.wanted,cards:deck.map(c=>({id:String(c.id),name:c.name,title:c.title,rarity:c.rarity,image:c.image})),cardPower:deck.reduce((n,c)=>n+deps.cardBattlePower(c,c.breakthrough_level,battle),0)};
          me.nextActionAt=now+role.inspectCooldownMs;
        }else if(isFight){
          if(me.health<=0||target.health<=0)fail('HEALTH','체력을 회복한 뒤 교전할 수 있습니다.');
          if(target.protectedUntil>now)fail('PROTECTED','상대는 방금 교전하여 잠시 보호 중입니다.');
          if(action==='attack'&&!role.attackEnabled)fail('ATTACK_DISABLED','현재 역할은 공격을 사용할 수 없습니다.',403);
          if(action==='arrest'&&(me.role!=='POLICE'||!role.arrestEnabled||target.wanted<role.arrestMinWanted))fail('ARREST','경찰은 설정된 수배 단계 이상의 상대만 체포할 수 있습니다.',403);
          simulation=await (deps.prepareCityBattle||prepareCityBattle)(env,deps,user,{id:targetId,nickname:target.nickname,role:targetRaw.account_role});
          const winner=simulation.battleV2?.result?.winner;if(!['A','B','DRAW'].includes(winner))fail('BATTLE','전투 결과를 확인하지 못했습니다.',503);
          if(winner==='A')target.health=Math.max(0,target.health-role.defeatDamage);
          else if(winner==='B')me.health=Math.max(0,me.health-cityRolePolicy(policy,target.role).defeatDamage);
          if(action==='attack')me.wanted=Math.min(5,me.wanted+role.wantedPerAttack);
          if(action==='arrest'&&winner==='A'){target.jailedUntil=now+role.arrestMs;target.location='POLICE';target.wanted=0;}
          me.nextActionAt=now+role.attackCooldownMs;me.protectedUntil=target.protectedUntil=now+rules.targetProtectionMs;
        }
      }
    }
  }
  const committedAt=clock();if(cityShift(committedAt).id!==epoch)fail('SHIFT','역할이 교대되었습니다. 새 역할을 확인한 뒤 다시 행동하세요.');
  const elapsed=committedAt-now;
  if(action==='leave'||needsTarget||isService)me.nextActionAt+=elapsed;
  if(action==='move')me.nextMoveAt+=elapsed;
  if(isFight){me.protectedUntil+=elapsed;target.protectedUntil+=elapsed;if(action==='arrest'&&simulation.battleV2.result.winner==='A')target.jailedUntil+=elapsed;}
  if(isFight&&me.health<=0)markCityDeath(me,myLife,target,committedAt,mine.location);
  if(isFight&&target.health<=0)markCityDeath(target,targetLife,me,committedAt,mine.location);
  const theft=isFight?transferCityCash(myLife,targetLife,policy,simulation.battleV2.result.winner,Number(user.id),targetId):null;
  myLife.at=committedAt;applyCityLifeView(me,myLife,policy);if(targetLife){targetLife.at=committedAt;applyCityLifeView(target,targetLife,policy);}
  const reward=await prepareCityReward(env,{user,policy,role:roleCode,event:cityRewardEvent(action,simulation?.battleV2?.result?.winner,targetId===Number(user.id)),targetId,requestId:body.requestId,now:committedAt,life:myLife});
  applyCityLifeView(me,myLife,policy);
  if(cityShift(clock()).id!==epoch)fail('SHIFT','역할이 교대되었습니다. 현황을 다시 확인하세요.');
  const {cash:targetCash,cashMode:targetCashMode,cashUnit:targetCashUnit,bag:targetBag,...visibleTarget}=target||{};
  const result={ok:true,requestId:body.requestId,action,epoch,mode:policy.mode,policyRevision:policy.revision,createdAt:committedAt,location:mine?.location||me.location,mine:me,target:targetId?visibleTarget:null,inspection,...simulation,reward:reward.result,theft,service:service?.result||null,
    effects:{damageToMine:Math.max(0,(healthBefore??me.health)-me.health),damageToTarget:Math.max(0,(targetHealthBefore??0)-(target?.health??0)),healed:action==='heal'?target.health-targetHealthBefore:0,jailMs:action==='arrest'&&simulation?.battleV2?.result?.winner==='A'?role.arrestMs:0}};
  if(simulation)result.result=simulation.battleV2.result.winner==='A'?'WIN':simulation.battleV2.result.winner==='B'?'LOSE':'DRAW';
  const policyGuard=body.requestId+':policy',statements=[];
  if(env.DB.dialect==='postgres')statements.push(p(env,'SELECT key FROM app_meta WHERE key=? FOR SHARE',CITY_SETTINGS_KEY));
  statements.push(cityGuard(env,policyGuard,policyRaw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',policyRaw===null?[CITY_SETTINGS_KEY]:[CITY_SETTINGS_KEY,policyRaw]),cityGuardEnd(env,policyGuard));
  if(!raw){
    statements.push(p(env,`INSERT INTO jokgak_city_players_v1(user_id,active,epoch,location,health,health_at,last_token,updated_at) VALUES(?,1,?,?,?,?,?,?)`,user.id,epoch,me.location,me.health,committedAt,body.requestId,committedAt));
    statements.push(...cityLifeClaim(env,{user_id:user.id,life_raw:null},myLife,body.requestId));
  }else{
    const changes=[{raw,next:me}];if(targetRaw&&['heal','attack','arrest','inspect'].includes(action))changes.push({raw:targetRaw,next:target});
    changes.sort((a,b)=>Number(a.raw.user_id)-Number(b.raw.user_id));
    for(const entry of changes)statements.push(...claim(env,entry.raw,entry.next,body.requestId,epoch,committedAt),...cityLifeClaim(env,entry.raw,Number(entry.raw.user_id)===Number(user.id)?myLife:targetLife,body.requestId));
  }
  statements.push(...(service?.statements||[]),...reward.statements,p(env,'INSERT INTO jokgak_city_actions_v1(request_id,user_id,target_id,action,fingerprint,result_json,created_at) VALUES(?,?,?,?,?,?,?)',body.requestId,user.id,targetId||null,action,fingerprint,JSON.stringify(result),committedAt));
  if(targetId&&targetId!==Number(user.id)){
    const summary={requestId:body.requestId,action,actorId:Number(user.id),actorName:user.nickname,location:mine.location,winner:simulation?.battleV2?.result?.winner||null,theft,health:target.health,maxHealth:target.maxHealth,jailedUntil:target.jailedUntil,jailMs:result.effects.jailMs,death:target.death,deadUntil:target.deadUntil,mode:policy.mode,createdAt:committedAt};
    statements.push(p(env,'INSERT INTO jokgak_city_notifications_v1(id,user_id,request_id,created_at,summary_json) VALUES(?,?,?,?,?)',body.requestId+':notice',targetId,body.requestId,committedAt,JSON.stringify(summary)));
  }
  try{await env.DB.batch(statements);}catch(error){const saved=await receipt(env,user,body.requestId,fingerprint);if(saved)return saved;if(/guard|constraint|duplicate|unique/i.test(error.message))fail('CONFLICT','전황이 바뀌었습니다. 최신 위치와 상태를 확인하세요.');throw error;}
  return result;
}
export async function handleJokgakCity({path,request,env,deps}){
  if(!path.startsWith('jokgak-city/')&&!['admin/jokgak-city','admin/jokgak-city/test-users'].includes(path))return null;
  const json=deps.json;const user=await deps.authenticate(request,env);if(!user)return json({error:'로그인이 필요합니다.'},401);
  try{
    const cms=await handleCityCms({path,request,env,deps,user});if(cms)return cms;
    await ensureCitySchema(env);
    const part=path.slice('jokgak-city/'.length),url=new URL(request.url);
    if(request.method==='GET'&&part==='notifications'){
      const rows=(await p(env,'SELECT id,summary_json FROM jokgak_city_notifications_v1 WHERE user_id=? AND read_at=0 ORDER BY created_at,id LIMIT 10',user.id).all()).results||[];
      const now=(deps.now||Date.now)(),{policy,raw:policyRaw}=await readCitySettings(env),allowed=cityCanAccess(policy,user);
      const mine=allowed?await syncCityPlayer(env,user,policy,await cityRoleWeights(env,cityShift(now).id,policy),now,policyRaw):null;
      return json({ok:true,active:!!mine?.active,mine:mine?{userId:mine.userId,active:mine.active,health:mine.health,location:mine.location,deadUntil:mine.deadUntil,death:mine.death,hospitalRequired:mine.hospitalRequired,wellness:mine.wellness}:null,items:rows.map(row=>({id:row.id,...parse(row.summary_json)})),serverNow:now});
    }
    if(request.method==='GET'&&part==='result'){
      const id=url.searchParams.get('requestId');if(!tokenValid(id))fail('REQUEST','기록 번호를 확인하세요.',400);
      const saved=await receipt(env,user,id,null,true);return saved?json(saved):json({error:'아직 확정된 기록이 없습니다.',code:'CITY_PENDING'},404);
    }
    if(request.method==='GET'&&part==='status'){
      const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)fail('CURSOR','목록 위치를 확인하세요.',400);
      return json(await cityStatus(env,user,url.searchParams.get('location')||'HOME',after,(deps.now||Date.now)()));
    }
    if(request.method==='POST'&&part==='ack'){
      const body=await readJointBody(request,{fields:['ids']});if(!Array.isArray(body.ids)||body.ids.length>10||body.ids.some(id=>!tokenValid(id)))fail('REQUEST','알림을 확인하세요.',400);
      if(body.ids.length)await p(env,`UPDATE jokgak_city_notifications_v1 SET read_at=? WHERE user_id=? AND id IN (${body.ids.map(()=>'?').join(',')})`,Date.now(),user.id,...body.ids).run();
      return json({ok:true});
    }
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{fields:['requestId','epoch','targetId','location','product']});
    return json(await deps.withUserMutationLock(env,user.id,path,()=>cityAction(env,deps,user,part,body)));
  }catch(error){
    if(error.status)return json({error:error.message,code:error.code||'CITY_REQUEST'},error.status);
    console.error('CITY_REQUEST_FAILED',{code:error.code||'UNKNOWN',name:error.name||'Error'});return json({error:'처리 상태를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.',code:'CITY_RETRY',retryable:true},503);
  }
}
