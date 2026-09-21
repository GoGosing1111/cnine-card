import {FACTION_RULES as R,SQUADS,districtById} from '../shared/clan-faction-rules-v1.mjs';
import {newFactionState,advanceFactionState,validateFormation,factionCaptains,validateFactionCaptains,factionEvent,finishFactionBattle,factionStrikeDamage,splitFactionTax,factionFail as fail} from './_clan_faction_model.js';
import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
import {syncFactionSessions,factionTerritoryBlockSql} from './_clan_faction_sessions.js';
const SCHEMA='clan_faction_schema_v1',rows=r=>r?.results||[];
const date=v=>{const s=String(v||'');return Date.parse(/Z$|[+]\d\d:\d\d$/.test(s)?s:s.replace(' ','T')+'Z');};
const nowOf=deps=>deps.now?deps.now():Date.now();
export function factionSchema(postgres=false){
  const int=postgres?'BIGINT':'INTEGER';
  return [
    `CREATE TABLE IF NOT EXISTS clan_faction_state(season_id ${int} PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,state_json TEXT NOT NULL,last_action TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS clan_faction_receipts(request_key TEXT PRIMARY KEY,user_id ${int} NOT NULL,season_id ${int} NOT NULL,kind TEXT NOT NULL,input_json TEXT NOT NULL,result_json TEXT NOT NULL,created_ms ${int} NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_faction_receipts_user ON clan_faction_receipts(user_id,created_ms)',
    `CREATE TABLE IF NOT EXISTS clan_faction_wallets(user_id ${int} PRIMARY KEY,balance ${int} NOT NULL DEFAULT 0,total_earned ${int} NOT NULL DEFAULT 0)`,
  ];
}
export async function ensureFactionSchema(env){
  if(readRuntimeData(env,SCHEMA))return;
  const marker=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(SCHEMA).first();
  if(!marker){
    const sql=factionSchema(env.DB.dialect==='postgres');
    if(env.DB.dialect==='postgres')await env.DB.execSchema(sql);else await env.DB.batch(sql.map(s=>env.DB.prepare(s)));
    await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(SCHEMA,'1').run();
  }
  cacheRuntimeData(env,SCHEMA,true,1800000);
}
async function context(env,season,user){
  const [members,teams]=await Promise.all([
    env.DB.prepare('SELECT m.user_id,m.clan_id,u.nickname FROM clan_members m JOIN users u ON u.id=m.user_id WHERE m.season_id=? ORDER BY m.user_id').bind(season.id).all(),
    env.DB.prepare('SELECT t.clan_id,t.master_user_id,o.name,o.mark_key,o.primary_color FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id WHERE t.season_id=?').bind(season.id).all(),
  ]);
  const roster=rows(members).map(m=>({userId:Number(m.user_id),clanId:Number(m.clan_id),nickname:m.nickname}));
  const clans=rows(teams).map(t=>({clanId:Number(t.clan_id),masterUserId:Number(t.master_user_id),name:t.name,markKey:t.mark_key,color:t.primary_color}));
  const mine=roster.find(m=>m.userId===Number(user.id));
  return {roster,clans,mine,isMaster:Boolean(mine)&&clans.some(t=>t.clanId===mine.clanId&&t.masterUserId===Number(user.id))};
}
async function readState(env,season,now,deps={}){
  const sessions=await syncFactionSessions(env,season,deps);
  if(sessions)return {...sessions.row,sessions:sessions.view};
  await env.DB.prepare('INSERT INTO clan_faction_state(season_id,state_json) VALUES(?,?) ON CONFLICT(season_id) DO NOTHING').bind(season.id,JSON.stringify(newFactionState(Math.min(now,date(season.ends_at))))).run();
  const row=await env.DB.prepare('SELECT * FROM clan_faction_state WHERE season_id=?').bind(season.id).first();
  return {...row,state:advanceFactionState(JSON.parse(row.state_json),now,date(season.ends_at))};
}
function formationOf(state,ctx,clanId){
  const ids=new Set(ctx.roster.filter(m=>m.clanId===clanId).map(m=>m.userId));
  return Object.fromEntries(SQUADS.map(s=>[s.id,(state.formations[clanId]?.[s.id]||[]).filter(id=>ids.has(id))]));
}
// starts_at belongs to the first scheduled regular match. The completed draft
// opens this independent mode immediately for the ACTIVE season.
const activeSeason=(s,now)=>s.phase==='ACTIVE'&&now<date(s.ends_at);
function battleSide(b,clanId,userId){
  return b.attacker===clanId&&b.attackers.includes(userId)?'ATTACK':b.defender===clanId&&b.defenders.includes(userId)?'DEFENSE':'';
}
function battleAlert(b,clanId,userId){
  return {id:b.id,districtId:b.districtId,districtName:districtById(b.districtId)?.name,side:battleSide(b,clanId,userId),attackerClan:b.attackerName||'상대 클랜',attackerName:b.initiatorName,startedAt:b.startedAt,endsAt:b.endsAt,attackerHp:b.attackerHp,defenderHp:b.defenderHp};
}
async function pendingSeasons(env,current,user,now){
  const past=rows(await env.DB.prepare(`SELECT f.state_json,s.id,s.season_no,s.ends_at,m.clan_id FROM clan_faction_state f
    JOIN clan_seasons s ON s.id=f.season_id JOIN clan_members m ON m.season_id=s.id AND m.user_id=?
    WHERE s.id<>? ORDER BY s.season_no DESC LIMIT 24`).bind(user.id,current.id).all());
  return past.map(s=>({seasonId:Number(s.id),seasonNo:Number(s.season_no),pool:advanceFactionState(JSON.parse(s.state_json),now,date(s.ends_at)).pools[s.clan_id]||0})).filter(s=>s.pool>0);
}
export async function factionOverview(env,season,user,deps,{alertsOnly=false}={}){
  await ensureFactionSchema(env);
  const sessions=await syncFactionSessions(env,season,deps);
  if(alertsOnly){
    const now=nowOf(deps),[row,m]=await Promise.all([
      sessions?{state_json:JSON.stringify(sessions.row.state)}:env.DB.prepare('SELECT state_json FROM clan_faction_state WHERE season_id=?').bind(season.id).first(),
      env.DB.prepare('SELECT clan_id FROM clan_members WHERE season_id=? AND user_id=?').bind(season.id,user.id).first()]);
    const battles=row?JSON.parse(row.state_json).battles:[];
    const alerts=activeSeason(season,now)&&(!sessions||sessions.view.active)&&m?battles.filter(b=>b.status==='ACTIVE'&&b.endsAt>now&&battleSide(b,Number(m.clan_id),Number(user.id))&&(!sessions||b.sessionKey===sessions.view.current?.key)).map(b=>battleAlert(b,Number(m.clan_id),Number(user.id))):[];
    return {ok:true,seasonId:Number(season.id),userId:Number(user.id),alerts,serverNow:now,...(sessions?{sessions:sessions.view}:{})};
  }
  const now=nowOf(deps),[stored,ctx,wallet]=await Promise.all([sessions?sessions.row:readState(env,season,now),context(env,season,user),env.DB.prepare('SELECT balance,total_earned FROM clan_faction_wallets WHERE user_id=?').bind(user.id).first()]);
  const state=stored.state,mine=ctx.mine?.clanId||0,formation=formationOf(state,ctx,mine),captains=factionCaptains(state.captains[mine],ctx.roster.filter(m=>m.clanId===mine).map(m=>m.userId));
  const battles=state.battles.map(b=>({...b,attackers:b.attackers.filter(id=>ctx.roster.some(m=>m.userId===id&&m.clanId===b.attacker)),defenders:b.defenders.filter(id=>ctx.roster.some(m=>m.userId===id&&m.clanId===b.defender))}));
  const alerts=activeSeason(season,now)&&(!sessions||sessions.view.active)?battles.filter(b=>b.status==='ACTIVE'&&battleSide(b,mine,Number(user.id))).map(b=>battleAlert(b,mine,Number(user.id))):[];
  if(alertsOnly)return {ok:true,seasonId:Number(season.id),userId:Number(user.id),alerts,serverNow:now};
  return {ok:true,serverNow:now,revision:Number(stored.revision),season:{id:Number(season.id),seasonNo:Number(season.season_no),phase:season.phase,endsAt:date(season.ends_at),active:activeSeason(season,now)},
    userId:Number(user.id),mine:mine?{clanId:mine,isMaster:ctx.isMaster,canManageFormation:ctx.isMaster||Object.values(captains).includes(Number(user.id))}:null,clans:ctx.clans,roster:ctx.roster.filter(m=>m.clanId===mine),formation,captains,
    districts:state.districts.map(d=>({...d,defenders:d.owner?(formationOf(state,ctx,d.owner)[d.defense]||[]).map(id=>ctx.roster.find(m=>m.userId===id)).filter(Boolean):[]})),
    battles,events:state.events,alerts,holdings:state.districts.filter(d=>d.owner===mine&&mine).length,
    ...(sessions?{sessions:{...sessions.view,recipientPolicy:sessions.policy.recipients,mapPolicy:sessions.policy.mapPolicy,history:sessions.view.history.map(h=>({...h,myReward:state.sessionHistory?.find(s=>s.key===h.key)?.recipients?.find(r=>r.userId===Number(user.id))?.amount||0}))}}:{}),
    tax:{pool:state.pools[mine]||0,balance:Number(wallet?.balance||0),totalEarned:Number(wallet?.total_earned||0),perHour:sessions?0:R.taxPerHour,abolished:Boolean(sessions),pendingSeasons:sessions?[]:await pendingSeasons(env,season,user,now)},
    squadReady:Object.fromEntries(SQUADS.map(s=>[s.id,state.squadReady[`${mine}:${s.id}`]||0])),targetReady:Object.fromEntries(state.districts.map(d=>[d.id,state.targetReady[`${mine}:${d.id}`]||0])),strikeReady:state.strikeReady[user.id]||0,rules:R};
}
async function receipt(env,key,user,kind,input){
  const row=await env.DB.prepare('SELECT * FROM clan_faction_receipts WHERE request_key=?').bind(key).first();
  if(!row)return null;
  if(Number(row.user_id)!==Number(user.id)||row.kind!==kind||row.input_json!==input)fail('다른 작업에 사용한 요청 키입니다.');
  return {...JSON.parse(row.result_json),replayed:true};
}
export async function mutateFaction(env,season,user,kind,body,deps,mode='ON'){
  await ensureFactionSchema(env);
  if(!/^[A-Za-z0-9:_-]{8,120}$/.test(String(body.requestId||'')))fail('요청 키가 올바르지 않습니다.',400);
  const key=`${user.id}:${body.requestId}`,clean={...body};delete clean.requestId;
  const input=JSON.stringify(clean),old=await receipt(env,key,user,kind,input);if(old)return old;
  if(!['formation','captains','garrison','launch','enter','strike','collect'].includes(kind))fail('지원하지 않는 세력전 작업입니다.',404);
  let computed=null;
  for(let attempt=0;attempt<5;attempt++){
    const now=nowOf(deps),[row,ctx]=await Promise.all([readState(env,season,now,deps),context(env,season,user)]),state=row.state;
    const replay=await receipt(env,key,user,kind,input);if(replay)return replay;
    if(!ctx.mine)fail('이번 시즌 클랜 소속이 필요합니다.',403);
    if(row.sessions&&kind==='collect')fail('징수세가 폐지되었습니다. 회차 종료 보상은 메시지함으로 지급됩니다.');
    if(row.sessions&&['launch','enter','strike'].includes(kind)&&!row.sessions.active)fail(row.sessions.blockedByTerritory?'영토전 진행 중에는 세력전에 참여할 수 없습니다.':'현재 세력전 개방 시간이 아닙니다.');
    if(kind!=='collect'&&!activeSeason(season,now))fail('세력전은 정규 클랜 시즌 진행 중에 참여할 수 있습니다.');
    const clanId=ctx.mine.clanId,userId=Number(user.id),memberIds=ctx.roster.filter(m=>m.clanId===clanId).map(m=>m.userId);
    const token=crypto.randomUUID(),formation=formationOf(state,ctx,clanId),payouts=[],result={ok:true,kind,seasonId:Number(season.id)};
    if(kind==='formation'){
      if(!ctx.isMaster&&!Object.values(factionCaptains(state.captains[clanId],memberIds)).includes(userId))fail('공격대·방어대 편성은 클랜장 또는 행동대장만 변경할 수 있습니다.',403);
      if(!ctx.isMaster&&body.captains!==undefined)fail('행동대장 임명·해제는 클랜장만 할 수 있습니다.',403);
      if(body.baseFormation!==undefined&&JSON.stringify(validateFormation(body.baseFormation,memberIds))!==JSON.stringify(formation))fail('다른 편성자가 라인업을 변경했습니다. 전황을 새로고침한 뒤 다시 편성하세요.');
      if(state.battles.some(b=>b.status==='ACTIVE'&&(b.attacker===clanId||b.defender===clanId)))fail('진행 중인 교전이 끝난 뒤 부대를 변경하세요.');
      const nextFormation=validateFormation(body.formation,memberIds);
      const captains=body.captains===undefined?factionCaptains(state.captains[clanId],memberIds):validateFactionCaptains(body.captains,memberIds);
      state.formations[clanId]=nextFormation;state.captains[clanId]=captains;
      factionEvent(state,{id:token,kind:'FORMATION',clanId,captains,by:ctx.mine.nickname,at:now});
    }
    if(kind==='captains'){
      if(!ctx.isMaster)fail('행동대장 임명·해제는 클랜장만 할 수 있습니다.',403);
      const captains=validateFactionCaptains(body.captains,memberIds);
      state.captains[clanId]=captains;result.captains=captains;
      factionEvent(state,{id:token,kind:'CAPTAINS',clanId,captains,by:ctx.mine.nickname,
        names:Object.fromEntries(Object.entries(captains).map(([squad,id])=>[squad,ctx.roster.find(m=>m.userId===id)?.nickname||'미지정'])),at:now});
    }
    if(kind==='garrison'){
      if(!ctx.isMaster)fail('방어대 배치는 클랜장만 변경할 수 있습니다.',403);
      const d=state.districts.find(d=>d.id===String(body.districtId));
      if(!d||d.owner!==clanId)fail('우리 클랜의 점령지를 선택하세요.');
      if(state.battles.some(b=>b.status==='ACTIVE'&&b.districtId===d.id))fail('교전 중에는 방어대를 변경할 수 없습니다.');
      if(!SQUADS.some(s=>s.id===body.squad&&s.role==='DEFENSE')||!formation[body.squad]?.length)fail('먼저 방어대를 편성하세요.');
      d.defense=body.squad;result.districtId=d.id;
    }
    if(kind==='launch'){
      const squad=String(body.squad),d=state.districts.find(d=>d.id===String(body.districtId));
      if(!SQUADS.some(s=>s.id===squad&&s.role==='ATTACK')||!formation[squad]?.length)fail('편성된 공격대를 선택하세요.');
      if(!ctx.isMaster&&!formation[squad].includes(userId))fail('해당 공격대원이나 클랜장만 출정할 수 있습니다.',403);
      if(!d||d.owner===clanId)fail('다른 클랜의 지역이나 무주지를 선택하세요.');
      if(d.protectedUntil>now)fail('점령 보호 중인 지역입니다.');
      if(state.battles.some(b=>b.status==='ACTIVE'&&b.districtId===d.id))fail('이미 교전 중인 지역입니다.');
      if(state.battles.some(b=>b.status==='ACTIVE'&&b.attacker===clanId&&b.squad===squad))fail('이 공격대는 다른 지역에서 교전 중입니다.');
      if((state.squadReady[`${clanId}:${squad}`]||0)>now)fail('공격대 재출정 대기 중입니다.');
      if((state.targetReady[`${clanId}:${d.id}`]||0)>now)fail('같은 지역의 재공격 대기 중입니다.');
      const defenders=formationOf(state,ctx,d.owner)[d.defense]||[];
      const b={id:token,districtId:d.id,attacker:clanId,attackerName:ctx.clans.find(c=>c.clanId===clanId)?.name,defender:d.owner,squad,defenseSquad:d.defense,attackers:[...formation[squad]],defenders:[...defenders],initiator:userId,initiatorName:ctx.mine.nickname,
        attackerHp:R.sharedHp,defenderHp:R.sharedHp,entries:{},status:'ACTIVE',startedAt:now,endsAt:Math.min(now+R.battleDurationMs,date(season.ends_at))};
      if(row.sessions){b.sessionKey=state.session.key;b.endsAt=Math.min(b.endsAt,state.session.endsAt);state.session.participants=[...new Set([...state.session.participants,userId])];state.session.participantClans[userId]=clanId;}
      state.battles.unshift(b);Object.assign(result,{battleId:b.id,districtId:d.id});
      if(!d.owner||!defenders.length){finishFactionBattle(state,b,clanId,'UNDEFENDED',now);result.captured=true;}
      else factionEvent(state,{id:token,kind:'INVASION',districtId:d.id,clanId,attacker:clanId,defender:d.owner,by:ctx.mine.nickname,at:now});
    }
    if(kind==='enter'){
      const b=state.battles.find(b=>b.id===body.battleId&&b.status==='ACTIVE');if(!b)fail('종료됐거나 찾을 수 없는 교전입니다.');
      const side=battleSide(b,clanId,userId);if(!side)fail('이 전투에 편성된 공격대·방어대만 입장할 수 있습니다.',403);
      b.entries||={};b.entries[userId]||={enteredAt:now,hits:0,damage:0,lastStrikeAt:0};
      if(row.sessions){state.session.participants=[...new Set([...state.session.participants,userId])];state.session.participantClans[userId]=clanId;}
      Object.assign(result,{battleId:b.id,districtId:b.districtId,side,enteredAt:b.entries[userId].enteredAt});
    }
    if(kind==='strike'){
      const b=state.battles.find(b=>b.id===body.battleId&&b.status==='ACTIVE');if(!b)fail('종료됐거나 찾을 수 없는 교전입니다.');
      const side=battleSide(b,clanId,userId);
      if(!side)fail('이 전투에 편성된 공격대·방어대만 교전할 수 있습니다.',403);
      if(!b.entries?.[userId])fail('전투 팝업에 먼저 입장한 뒤 교전하세요.',403);
      if((state.strikeReady[userId]||0)>now)fail('다음 교전까지 잠시 기다려 주세요.');
      const enemyClan=side==='ATTACK'?b.defender:b.attacker;
      const ids=(side==='ATTACK'?b.defenders:b.attackers).filter(id=>ctx.roster.some(m=>m.userId===id&&m.clanId===enemyClan));
      if(!ids.length)fail('상대 부대 명단이 변경됐습니다. 교전 종료를 기다려 주세요.');
      if(!computed){
        const opponentId=ids[crypto.getRandomValues(new Uint32Array(1))[0]%ids.length];
        const opponent=await env.DB.prepare('SELECT id,nickname,role FROM users WHERE id=?').bind(opponentId).first();if(!opponent)fail('상대 정보를 찾지 못했습니다.');
        const built=await deps.buildFactionBattle(env,deps,user,opponent,crypto.getRandomValues(new Uint32Array(1))[0]);
        computed={...built,opponent:{id:Number(opponent.id),nickname:opponent.nickname},player:{id:userId,nickname:user.nickname},damage:factionStrikeDamage(built.battleV2),battleId:b.id};
        continue; // Re-read current HP, membership and cooldown after simulation.
      }
      if(computed.battleId!==b.id||!ids.includes(computed.opponent.id))fail('상대 편성이 변경됐습니다. 다시 교전하세요.');
      const field=side==='ATTACK'?'defenderHp':'attackerHp',damage=Math.min(b[field],computed.damage);
      b[field]=Math.max(0,b[field]-damage);state.strikeReady[userId]=now+R.strikeCooldownMs;
      b.entries[userId].hits++;b.entries[userId].damage+=damage;b.entries[userId].lastStrikeAt=now;
      if(b[field]===0)finishFactionBattle(state,b,clanId,'HP_ZERO',now);
      Object.assign(result,computed,{damage,battleId:b.id,districtId:b.districtId,side,attackerHp:b.attackerHp,defenderHp:b.defenderHp,captured:b.status==='COMPLETED'&&b.winner===b.attacker,battleCompleted:b.status==='COMPLETED',winner:b.winner||0,result:computed.battleV2.result.winner==='A'?'WIN':'LOSE'});
    }
    if(kind==='collect'){
      if(mode!=='ON')fail('TEST 모드에서는 징수코인을 지급하지 않습니다.');
      const pool=state.pools[clanId]||0;if(pool<=0)fail('아직 분배할 징수세가 없습니다.');
      payouts.push(...splitFactionTax(pool,memberIds));state.pools[clanId]=0;
      Object.assign(result,{total:pool,members:payouts.length,myAmount:payouts.find(p=>p.userId===userId)?.amount||0});
      factionEvent(state,{id:token,kind:'TAX',clanId,amount:pool,members:payouts.length,at:now});
    }
    // A compare-and-swap and every guarded side effect share one transaction.
    // Losing races cannot create receipts, mint tax, or advance cooldowns.
    const master=['captains','garrison'].includes(kind)||(kind==='formation'&&ctx.isMaster);
    const sessionCombat=Boolean(row.sessions&&['launch','enter','strike'].includes(kind));
    if(sessionCombat&&nowOf(deps)>=state.session.endsAt)continue;
    const phaseGuard=(kind==='collect'?'':" AND EXISTS(SELECT 1 FROM clan_seasons WHERE id=? AND phase='ACTIVE' AND ends_at=?)")+(sessionCombat?` AND NOT EXISTS(SELECT 1 FROM territory_war_v3_rounds WHERE ${factionTerritoryBlockSql(env)})`:'');
    const masterGuard=master?' AND EXISTS(SELECT 1 FROM clan_season_teams WHERE season_id=? AND clan_id=? AND master_user_id=?)':'';
    const rosterGuard=` AND (SELECT COUNT(*) FROM clan_members WHERE season_id=? AND clan_id=?)=? AND NOT EXISTS(SELECT 1 FROM clan_members WHERE season_id=? AND clan_id=? AND user_id NOT IN (${memberIds.map(()=>'?').join(',')}))`;
    const targetMember=kind==='strike'?ctx.roster.find(m=>m.userId===computed.opponent.id):null;
    const enemyGuard=targetMember?' AND EXISTS(SELECT 1 FROM clan_members WHERE season_id=? AND user_id=? AND clan_id=?)':'';
    const bindings=[JSON.stringify(state),token,season.id,row.revision,key,season.id,userId,clanId,...(kind==='collect'?[]:[season.id,season.ends_at]),...(sessionCombat?[new Date(nowOf(deps)).toISOString()]:[]),...(master?[season.id,clanId,userId]:[]),season.id,clanId,memberIds.length,season.id,clanId,...memberIds,...(targetMember?[season.id,targetMember.userId,targetMember.clanId]:[])];
    // Keep permanent settlement receipts compact. Reconnection recovers the award,
    // while the initial response carries the existing V3 timeline for playback.
    const durable={...result};delete durable.battleV2;delete durable.attackerDeck;delete durable.defenderDeck;
    const statements=[env.DB.prepare(`UPDATE clan_faction_state SET state_json=?,last_action=?,revision=revision+1 WHERE season_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM clan_faction_receipts WHERE request_key=?) AND EXISTS(SELECT 1 FROM clan_members WHERE season_id=? AND user_id=? AND clan_id=?)${phaseGuard}${masterGuard}${rosterGuard}${enemyGuard}`).bind(...bindings),
      env.DB.prepare('INSERT INTO clan_faction_receipts(request_key,user_id,season_id,kind,input_json,result_json,created_ms) SELECT ?,?,?,?,?,?,? FROM clan_faction_state WHERE season_id=? AND last_action=?').bind(key,userId,season.id,kind,input,JSON.stringify(durable),now,season.id,token),
      ...payouts.filter(p=>p.amount>0).map(p=>env.DB.prepare(`INSERT INTO clan_faction_wallets(user_id,balance,total_earned) SELECT ?,?,? FROM clan_faction_state WHERE season_id=? AND last_action=? ON CONFLICT(user_id) DO UPDATE SET balance=clan_faction_wallets.balance+excluded.balance,total_earned=clan_faction_wallets.total_earned+excluded.total_earned`).bind(p.userId,p.amount,p.amount,season.id,token))];
    const settled=await env.DB.batch(statements);
    const saved=await receipt(env,key,user,kind,input);if(saved)return Number(settled[0]?.meta?.changes||0)>0?{...result,replayed:false}:saved;
    const fresh=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(season.id).first();if(fresh)season=fresh;
  }
  fail('다른 부대의 작전을 반영 중입니다. 같은 요청으로 다시 확인하세요.');
}
export async function handleClanFaction({path,request,env,deps,user,season,mode}){
  const prefix='clan/faction/';if(!path.startsWith(prefix))return null;const action=path.slice(prefix.length);
  try{
    if(request.method==='GET'&&['overview','alerts'].includes(action))return deps.json(await factionOverview(env,season,user,deps,{alertsOnly:action==='alerts'}),200,{'cache-control':'no-store'});
    if(request.method!=='POST')return deps.json({error:'지원하지 않는 요청 방식입니다.'},405);
    const body=await deps.readBody(request);
    if(action==='collect'&&body.seasonId&&Number(body.seasonId)!==Number(season.id)){
      const past=await env.DB.prepare('SELECT * FROM clan_seasons WHERE id=?').bind(Number(body.seasonId)).first();if(!past)fail('시즌을 찾지 못했습니다.',404);season=past;
    }
    return deps.json(await mutateFaction(env,season,user,action,body,deps,mode),200,{'cache-control':'no-store'});
  }catch(error){return deps.json({error:error.status?error.message:'세력전 처리 중 오류가 발생했습니다. 같은 요청으로 다시 확인하세요.',code:'CLAN_FACTION_ERROR'},error.status||500);}
}
