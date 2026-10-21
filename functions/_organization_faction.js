import {ORGANIZATIONS,orgAssert} from '../shared/organization-system-v1.mjs';
import {ORGANIZATION_DISTRICTS,ORGANIZATION_SESSION_RULES as FACTION_SESSION_RULES,organizationDistrictById,defaultOrganizationFactionPolicy,validateOrganizationFactionPolicy,FACTION_RULES as R,SQUADS} from '../shared/organization-faction-v1.mjs';
import {createFactionDay,factionDayKey} from '../shared/clan-faction-sessions-v1.mjs';
import {factionEvent,finishFactionBattle,factionStrikeDamage} from './_clan_faction_model.js';
import {newOrganizationFactionState,restrictOrganizationDistricts,advanceOrganizationFaction,validateOrganizationFormation as validateFormation,organizationCaptains as factionCaptains,validateOrganizationCaptains as validateFactionCaptains,assignOrganizationGarrison} from './_organization_faction_model.js';
import {buildClanBattle} from './_clan.js';
import {readJointBody} from './_joint_request.js';
import {jointHash} from './_joint_transactions.js';
import {organizationElderIds,validateOrganizationElders} from '../shared/organization-faction-v1.mjs';

export const ORGANIZATION_FACTION_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS organization_faction_policy_v1(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL DEFAULT 0,policy_json TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS organization_faction_state_v1(round_id TEXT PRIMARY KEY REFERENCES organization_rounds_v1(id),revision INTEGER NOT NULL DEFAULT 0,state_json TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS organization_faction_days_v1(round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),day_key TEXT NOT NULL,schedule_json TEXT NOT NULL,PRIMARY KEY(round_id,day_key))',
 'CREATE TABLE IF NOT EXISTS organization_faction_treasury_v1(round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),organization_id INTEGER NOT NULL CHECK(organization_id BETWEEN 1 AND 15),balance BIGINT NOT NULL DEFAULT 0 CHECK(balance>=0),total_earned BIGINT NOT NULL DEFAULT 0 CHECK(total_earned>=0),PRIMARY KEY(round_id,organization_id))',
 'CREATE TABLE IF NOT EXISTS organization_faction_ledger_v1(id TEXT PRIMARY KEY,round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),organization_id INTEGER NOT NULL CHECK(organization_id BETWEEN 1 AND 15),delta BIGINT NOT NULL,balance BIGINT NOT NULL CHECK(balance>=0),reason TEXT NOT NULL,reference_key TEXT NOT NULL,created_at BIGINT NOT NULL,UNIQUE(round_id,organization_id,reference_key))',
 'CREATE INDEX IF NOT EXISTS organization_faction_ledger_round_v1 ON organization_faction_ledger_v1(round_id,created_at DESC)',
 'CREATE TABLE IF NOT EXISTS organization_faction_receipts_v1(actor_id BIGINT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,response_json TEXT NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(actor_id,request_id))',
 'CREATE TABLE IF NOT EXISTS organization_faction_settlements_v1(round_id TEXT NOT NULL REFERENCES organization_rounds_v1(id),session_key TEXT NOT NULL,snapshot_json TEXT NOT NULL,created_at BIGINT NOT NULL,PRIMARY KEY(round_id,session_key))'
];
export async function installOrganizationFactionSchema(DB){
 if(DB.dialect!=='postgres'||!DB.execSchema)throw Error('Organization faction requires PostgreSQL');
 await DB.execSchema(ORGANIZATION_FACTION_SCHEMA);
 await DB.prepare('INSERT INTO organization_faction_policy_v1(id,policy_json) VALUES(1,?) ON CONFLICT(id) DO NOTHING').bind(JSON.stringify(defaultOrganizationFactionPolicy())).run();
}
const query=DB=>async(text,values=[]) => (await DB.client.query({text,values})).rows;
const nowOf=deps=>(deps.now||Date.now)();
const publicRound=r=>r?{id:r.id,scope:r.scope,name:r.name,phase:r.phase,revision:Number(r.revision),createdAt:Number(r.created_at),assignedAt:r.assigned_at?Number(r.assigned_at):null}:null;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
async function tx(env,work){
 orgAssert(env.DB?.dialect==='postgres'&&env.DB.enqueue,'DATABASE','조직 DB를 확인하세요.',503);
 return env.DB.enqueue(async()=>{const q=query(env.DB);await q('BEGIN');try{await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL statement_timeout='10s'");const result=await work(q);await q('COMMIT');return result;}catch(error){try{await q('ROLLBACK');}catch{}throw error;}});
}
async function readPolicy(q,lock=''){
 const [row]=await q('SELECT * FROM organization_faction_policy_v1 WHERE id=1'+lock);
 return row?validateOrganizationFactionPolicy({...JSON.parse(row.policy_json),revision:Number(row.revision)}):defaultOrganizationFactionPolicy();
}
async function readRound(q,id){
 const [round]=id?await q('SELECT * FROM organization_rounds_v1 WHERE id=$1 FOR SHARE',[id]):await q("SELECT * FROM organization_rounds_v1 WHERE scope='LIVE' ORDER BY created_at DESC LIMIT 1 FOR SHARE");
 return round||null;
}
async function authorize(q,user,round,policy,{write=false}={}){
 orgAssert(user&&(!user.status||user.status==='ACTIVE'),'AUTH','활성 계정으로 로그인하세요.',403);
 if(round?.scope==='TEST'){
  const [row]=await q('SELECT policy_json FROM organization_policy_v1 WHERE id=1'),p=JSON.parse(row?.policy_json||'{}');
  orgAssert(user.role==='OWNER'||p.testUserIds?.includes(Number(user.id)),'TEST_ONLY','지정된 조직 테스트 계정만 이용할 수 있습니다.',403);
 }
 if(write){
  orgAssert(round?.phase==='ASSIGNED','ASSIGNMENT','조직 배정이 완료된 뒤 세력전에 참여할 수 있습니다.');
  orgAssert(policy.mode!=='OFF','FACTION_OFF','조직 세력전이 OFF 상태입니다.');
  orgAssert(policy.mode==='ON'?round.scope==='LIVE':round.scope==='TEST','FACTION_SCOPE','현재 운영 모드와 회차가 일치하지 않습니다.');
 }
}
async function rosterFor(q,r){
 if(!r)return [];
 return (await q('SELECT m.user_id,m.organization_id,m.slot,u.nickname,u.role,u.status FROM organization_members_v1 m JOIN users u ON u.id=m.user_id WHERE m.round_id=$1 ORDER BY m.organization_id,m.slot',[r.id])).map(m=>({userId:Number(m.user_id),clanId:Number(m.organization_id),organizationId:Number(m.organization_id),slot:Number(m.slot),nickname:m.nickname,role:m.role,status:m.status}));
}
async function stateFor(q,r,now){
 if(!r||r.phase!=='ASSIGNED')return {revision:0,state:newOrganizationFactionState(now)};
 await q('INSERT INTO organization_faction_state_v1(round_id,state_json) VALUES($1,$2) ON CONFLICT(round_id) DO NOTHING',[r.id,JSON.stringify(newOrganizationFactionState(now))]);
 const [row]=await q('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1 FOR UPDATE',[r.id]);
 const state=JSON.parse(row.state_json),changed=restrictOrganizationDistricts(state,now);
 if(changed)await saveState(q,r,state);
 return {revision:Number(row.revision)+(changed?1:0),state};
}
async function saveState(q,r,state){
 await q('UPDATE organization_faction_state_v1 SET state_json=$1,revision=revision+1 WHERE round_id=$2',[JSON.stringify(state),r.id]);
}
async function accountFunds(q,r,organizationId,delta,reason,referenceKey,now){
 orgAssert(Number.isSafeInteger(delta),'FUNDS','조직자금 계산 범위를 확인하세요.');
 await q('INSERT INTO organization_faction_treasury_v1(round_id,organization_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[r.id,organizationId]);
 const [account]=await q('SELECT balance,total_earned FROM organization_faction_treasury_v1 WHERE round_id=$1 AND organization_id=$2 FOR UPDATE',[r.id,organizationId]);
 const balance=Number(account.balance)+delta;
 orgAssert(Number.isSafeInteger(balance)&&balance>=0&&Number.isSafeInteger(Number(account.total_earned)+Math.max(0,delta)),'FUNDS','조직자금이 부족하거나 보관 한도를 초과했습니다.');
 await q('UPDATE organization_faction_treasury_v1 SET balance=$1,total_earned=total_earned+$2 WHERE round_id=$3 AND organization_id=$4',[balance,Math.max(0,delta),r.id,organizationId]);
 await q('INSERT INTO organization_faction_ledger_v1 VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[crypto.randomUUID(),r.id,organizationId,delta,balance,reason,referenceKey,now]);
 return balance;
}
async function settle(q,r,snapshot,now){
 const inserted=await q('INSERT INTO organization_faction_settlements_v1 VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING session_key',[r.id,snapshot.key,JSON.stringify(snapshot),now]);
 if(!inserted.length)return;
 if(snapshot.status!=='SETTLED')return;
 if(snapshot.fundsPerRegion!==null&&snapshot.fundsPerRegion!==undefined){
  for(const [id,regions] of Object.entries(snapshot.holdings)){
   const amount=regions*snapshot.fundsPerRegion;
   if(amount>0)await accountFunds(q,r,Number(id),amount,'세력전 회차 점령 정산','session:'+snapshot.key,now);
  }
 }
 if(r.scope!=='LIVE')return; // TEST is isolated and never awards live accounts.
 const rewards=[];
 for(const recipient of snapshot.recipients)for(const reward of [{type:'COIN',amount:recipient.amount,label:'코인'},{type:'MASTER_STAR',amount:recipient.masterStars,label:'마스터의 별'},{type:'STARLIGHT_ARMOR_CORE',amount:recipient.mysticEnergy,label:'미스틱 에너지'}]){
  if(!reward.amount)continue;
  rewards.push({user_id:recipient.userId,reward_type:reward.type,reward_amount:reward.amount,title:'조직 세력전 점령 보상 · '+reward.label,body:snapshot.dayKey+' '+snapshot.ordinal+'회차 종료 시 '+recipient.territories+'개 지역 점령. '+reward.label+' '+reward.amount.toLocaleString('ko-KR')+'개를 수령하세요.',message_type:reward.type==='COIN'?'COIN_REWARD':'ITEM_REWARD',campaign_key:'organization-faction:'+r.id+':'+snapshot.key+':'+reward.type});
 }
 if(rewards.length){
  const messages=await q("INSERT INTO user_messages(user_id,sender_type,title,body,message_type,campaign_key) SELECT x.user_id,'SYSTEM',x.title,x.body,x.message_type,x.campaign_key FROM jsonb_to_recordset($1::jsonb) AS x(user_id bigint,title text,body text,message_type text,campaign_key text) RETURNING id,user_id,campaign_key",[JSON.stringify(rewards)]);
  const byKey=new Map(messages.map(m=>[m.user_id+':'+m.campaign_key,m.id]));
  orgAssert(messages.length===rewards.length,'SETTLEMENT','세력전 보상 메시지 수를 확인하지 못했습니다.',503);
  const rows=rewards.map(x=>({...x,message_id:byKey.get(x.user_id+':'+x.campaign_key)}));
  orgAssert(rows.every(x=>x.message_id),'SETTLEMENT','세력전 보상 메시지를 확인하지 못했습니다.',503);
  await q('INSERT INTO user_message_rewards(message_id,user_id,reward_type,reward_amount) SELECT message_id,user_id,reward_type,reward_amount FROM jsonb_to_recordset($1::jsonb) AS x(message_id bigint,user_id bigint,reward_type text,reward_amount bigint)',[JSON.stringify(rows)]);
 }
}
async function sync(q,r,row,roster,policy,now,deps){
 const enabled=r?.phase==='ASSIGNED'&&(policy.mode==='ON'?r.scope==='LIVE':policy.mode==='TEST'&&r.scope==='TEST');
 if(!enabled)return {active:false,enabled:false,state:'CLOSED',schedule:[],history:[],current:null,rules:FACTION_SESSION_RULES,recipientPolicy:'PARTICIPANTS',mapPolicy:'KEEP'};
 const day=factionDayKey(now);
 await q('INSERT INTO organization_faction_days_v1 VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[r.id,day,JSON.stringify(createFactionDay(day,deps.randomFactionSchedule))]);
 const [published]=await q('SELECT schedule_json FROM organization_faction_days_v1 WHERE round_id=$1 AND day_key=$2',[r.id,day]);
 const wars=await q("SELECT id,status,starts_at,ends_at,settled_at FROM territory_war_v3_rounds WHERE status IN ('ACTIVE','PREPARING') OR id IN (SELECT id FROM territory_war_v3_rounds WHERE status='FINISHED' ORDER BY id DESC LIMIT 32)");
 const paused=(row.state.session?.pauses?.at(-1)?.territoryRoundIds||[]).filter(id=>!wars.some(w=>Number(w.id)===Number(id)));
 if(paused.length)wars.push(...await q('SELECT id,status,starts_at,ends_at,settled_at FROM territory_war_v3_rounds WHERE id=ANY($1::bigint[])',[paused]));
 const before=JSON.stringify(row.state),result=advanceOrganizationFaction(row.state,{schedule:JSON.parse(published.schedule_json),wars,roster,policy,now,assignedAt:Number(r.assigned_at||r.created_at)});
 for(const snapshot of result.settlements)await settle(q,r,snapshot,now);
 if(before!==JSON.stringify(row.state)){await saveState(q,r,row.state);row.revision++;}
 return result.view;
}
const formationOf=(state,roster,id)=>Object.fromEntries(SQUADS.map(s=>[s.id,(state.formations[id]?.[s.id]||[]).filter(userId=>roster.some(m=>m.userId===userId&&m.clanId===id)).slice(0,R.squadSize)]));
const sideOf=(b,id,userId)=>b?(b.attacker===id&&b.attackers.includes(userId)?'ATTACK':b.defender===id&&b.defenders.includes(userId)?'DEFENSE':''):'';
function alertsFor(state,id,userId,sessions){return sessions.active?state.battles.filter(b=>b.status==='ACTIVE'&&sideOf(b,id,userId)).map(b=>({id:b.id,districtId:b.districtId,districtName:organizationDistrictById(b.districtId)?.name,side:sideOf(b,id,userId),attackerClan:b.attackerName,attackerName:b.initiatorName,startedAt:b.startedAt,endsAt:b.endsAt,attackerHp:b.attackerHp,defenderHp:b.defenderHp})):[];}
async function treasuryFor(q,r,roster,state,policy){
 const funds=r?(await q('SELECT * FROM organization_faction_treasury_v1 WHERE round_id=$1',[r.id])):[];
 const progress=r?(await q('SELECT * FROM organization_progress_v1 WHERE round_id=$1',[r.id])):[];
 return ORGANIZATIONS.map(o=>({id:o.id,name:o.name,color:o.color,memberCount:roster.filter(m=>m.clanId===o.id).length,roster:roster.filter(m=>m.clanId===o.id).map(({userId,nickname,slot})=>({userId,nickname,slot})),funds:Number(funds.find(f=>Number(f.organization_id)===o.id)?.balance||0),stage:Number(progress.find(p=>Number(p.organization_id)===o.id)?.stage||1),elderIds:organizationElderIds(state,roster,o.id),commanderId:organizationElderIds(state,roster,o.id)[0]||null,upgradeCosts:policy.upgradeCosts}));
}
async function overview(q,user,r,policy,row,roster,sessions,now,{admin=false,alertsOnly=false}={}){
 const s=row.state,my=roster.find(m=>m.userId===Number(user.id)),id=my?.clanId||0,userId=Number(user.id);
 if(alertsOnly)return {ok:true,roundId:r?.id,userId,serverNow:now,alerts:alertsFor(s,id,userId,sessions)};
 const all=await treasuryFor(q,r,roster,s,policy),own=all.find(o=>o.id===id),isMaster=Boolean(id)&&organizationElderIds(s,roster,id).includes(userId),formation=formationOf(s,roster,id),captains=factionCaptains(s.captains[id],roster.filter(m=>m.clanId===id).map(m=>m.userId));
 const treasury={funds:own?.funds||0,stage:own?.stage||1,nextCost:own&&own.stage<5?policy.upgradeCosts[own.stage]:null,elderIds:own?.elderIds||[],commanderId:own?.commanderId||null,canUpgrade:isMaster&&r?.phase==='ASSIGNED'&&(policy.mode==='ON'?r.scope==='LIVE':policy.mode==='TEST'&&r.scope==='TEST')&&own.stage<5&&policy.upgradeCosts[own.stage]!==null&&own.funds>=policy.upgradeCosts[own.stage]};
 if(admin){
  const ledger=r?(await q('SELECT * FROM organization_faction_ledger_v1 WHERE round_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[r.id])).map(x=>({id:x.id,organizationId:Number(x.organization_id),delta:Number(x.delta),balance:Number(x.balance),reason:x.reason,createdAt:Number(x.created_at)})):[];
  return {ok:true,policy,round:publicRound(r),organizations:all,ledger,state:s,sessions};
 }
 const clans=all.map(o=>({clanId:o.id,name:o.name,color:o.color,masterUserId:o.commanderId,markKey:'ORGANIZATION_'+o.id}));
 return {ok:true,serverNow:now,roundId:r?.id,revision:row.revision,organizationMode:true,policy,round:publicRound(r),
  season:{id:r?.id,seasonNo:1,phase:r?.phase==='ASSIGNED'&&policy.mode!=='OFF'?'ACTIVE':'PREPARATION',active:r?.phase==='ASSIGNED'&&(policy.mode==='ON'?r.scope==='LIVE':policy.mode==='TEST'&&r.scope==='TEST'),endsAt:null},
  userId,mine:id?{clanId:id,isElder:isMaster,isMaster,canManageFormation:isMaster||Object.values(captains).includes(userId),canManageGarrison:isMaster||Object.values(captains).includes(userId)}:null,
  clans,organizations:all.map(({roster,...o})=>o),roster:roster.filter(m=>m.clanId===id),formation,captains,
  districts:s.districts.map(d=>({...d,defenders:d.owner?(formationOf(s,roster,d.owner)[d.defense]||[]).map(userId=>roster.find(m=>m.userId===userId)).filter(Boolean):[]})),
  battles:s.battles,events:s.events,alerts:alertsFor(s,id,userId,sessions),holdings:s.districts.filter(d=>d.owner===id&&id).length,sessions:{...sessions,history:(sessions.history||[]).map(h=>{const receipt=s.sessionHistory?.find(x=>x.key===h.key)?.recipients?.find(x=>x.userId===userId);return {...h,myReward:r?.scope==='LIVE'?receipt?.amount||0:0,myMasterStars:r?.scope==='LIVE'?receipt?.masterStars||0:0,myMysticEnergy:r?.scope==='LIVE'?receipt?.mysticEnergy||0:0};})},treasury,
  tax:{pool:0,balance:0,totalEarned:0,perHour:0,abolished:true,pendingSeasons:[]},
  squadReady:Object.fromEntries(SQUADS.map(x=>[x.id,s.squadReady[id+':'+x.id]||0])),targetReady:Object.fromEntries(s.districts.map(d=>[d.id,s.targetReady[id+':'+d.id]||0])),strikeReady:s.strikeReady[userId]||0,rules:R};
}
async function context(q,user,roundId,now,deps,{write=false}={}){
 const policy=await readPolicy(q,' FOR SHARE'),r=await readRound(q,roundId);
 await authorize(q,user,r,policy,{write});
 const roster=await rosterFor(q,r),row=await stateFor(q,r,now),sessions=await sync(q,r,row,roster,policy,now,deps);
 return {policy,r,roster,row,sessions};
}
async function replay(q,user,requestId,fingerprint){
 const [old]=await q('SELECT * FROM organization_faction_receipts_v1 WHERE actor_id=$1 AND request_id=$2',[user.id,requestId]);
 if(!old)return null;
 orgAssert(old.fingerprint===fingerprint,'REQUEST_CONFLICT','같은 요청 식별자에 다른 내용을 사용할 수 없습니다.');
 return {...JSON.parse(old.response_json),replayed:true};
}
async function mutation(env,user,action,body,deps){
 orgAssert(/^[A-Za-z0-9:_-]{8,100}$/.test(String(body.requestId||'')),'REQUEST_ID','요청 식별자를 확인하세요.',400);
 const fingerprint=await jointHash(canonical({action,body}));
 let computed=null;
 if(action==='strike'){
  const preview=await tx(env,async q=>{
   const old=await replay(q,user,body.requestId,fingerprint);if(old)return {old};
   const c=await context(q,user,body.roundId,nowOf(deps),deps,{write:true}),my=c.roster.find(m=>m.userId===Number(user.id)),b=c.row.state.battles.find(b=>b.id===body.battleId&&b.status==='ACTIVE'),side=sideOf(b,my?.clanId,Number(user.id));
   orgAssert(c.sessions.active&&b&&side&&b.entries?.[user.id],'BATTLE','현재 입장한 부대의 교전만 실행할 수 있습니다.',403);
   orgAssert((c.row.state.strikeReady[user.id]||0)<=nowOf(deps),'COOLDOWN','다음 교전까지 잠시 기다려 주세요.');
   const enemyId=side==='ATTACK'?b.defender:b.attacker,ids=side==='ATTACK'?b.defenders:b.attackers;
   const enemies=c.roster.filter(m=>m.clanId===enemyId&&ids.includes(m.userId)&&m.status==='ACTIVE');
   orgAssert(enemies.length,'OPPONENT','상대 부대원을 확인할 수 없습니다.');
   const enemy=enemies[crypto.getRandomValues(new Uint32Array(1))[0]%enemies.length];
   return {battleId:b.id,opponent:{id:enemy.userId,nickname:enemy.nickname,role:enemy.role}};
  });
  if(preview.old)return preview.old;
  // Account snapshots and V3 simulation run outside organization locks.
  const built=await (deps.buildFactionBattle||buildClanBattle)(env,deps,user,preview.opponent,crypto.getRandomValues(new Uint32Array(1))[0]);
  computed={...preview,...built,player:{id:Number(user.id),nickname:user.nickname},damage:factionStrikeDamage(built.battleV2)};
 }
 return tx(env,async q=>{
  await q('INSERT INTO organization_actors_v1(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user.id]);
  await q('SELECT user_id FROM organization_actors_v1 WHERE user_id=$1 FOR UPDATE',[user.id]);
  const old=await replay(q,user,body.requestId,fingerprint);if(old)return old;
  const now=nowOf(deps);
  let result={ok:true,kind:action};
  if(action==='policy'){
   const before=await readPolicy(q,' FOR UPDATE'),next=validateOrganizationFactionPolicy(body.policy);
   orgAssert(before.revision===next.revision,'STALE','조직 세력전 설정이 변경되었습니다. 새로고침하세요.');
   next.revision++;
   await q('UPDATE organization_faction_policy_v1 SET policy_json=$1,revision=$2 WHERE id=1',[JSON.stringify(next),next.revision]);
   result.policy=next;
  }else{
   const c=await context(q,user,body.roundId,now,deps,{write:!['commander','elders'].includes(action)}),{r,policy,roster,row,sessions}=c,s=row.state;
   orgAssert(r?.phase==='ASSIGNED','ASSIGNMENT','조직 배정이 완료된 뒤 설정할 수 있습니다.');
   const my=roster.find(m=>m.userId===Number(user.id)),id=my?.clanId||0,userId=Number(user.id),master=Boolean(id)&&organizationElderIds(s,roster,id).includes(userId),memberIds=roster.filter(m=>m.clanId===id).map(m=>m.userId),formation=formationOf(s,roster,id),captains=factionCaptains(s.captains[id],memberIds);
   if(!['commander','elders'].includes(action))orgAssert(id,'MEMBERSHIP','조직에 배정된 구성원만 참여할 수 있습니다.',403);
   const canManage=master||Object.values(captains).includes(userId);
   if(['launch','enter','strike'].includes(action))orgAssert(sessions.active,'WINDOW',sessions.blockedByTerritory?'영토전 동안 세력전이 일시정지됩니다.':'현재 세력전 개방 시간이 아닙니다.');
   result.roundId=r.id;
   if(action==='commander'||action==='elders'){
    orgAssert(Number.isInteger(body.organizationId)&&body.organizationId>=1&&ORGANIZATIONS.some(o=>o.id===body.organizationId),'INPUT','조직을 확인하세요.',400);
    const current=organizationElderIds(s,roster,body.organizationId);
    if(action==='commander')orgAssert(current.length<=1,'ELDERS','여러 원로가 지정되어 있습니다. 최신 원로 관리 화면에서 변경하세요.');
    else orgAssert(Array.isArray(body.baseUserIds)&&JSON.stringify(body.baseUserIds)===JSON.stringify(current),'STALE','원로 명단이 변경되었습니다. 새로 불러온 뒤 저장하세요.');
    const ids=validateOrganizationElders(action==='elders'?body.userIds:body.userId===null?[]:[body.userId],roster,body.organizationId);
    s.elders||={};s.commanders||={};s.elders[body.organizationId]=ids;s.commanders[body.organizationId]=ids[0]||null;
    factionEvent(s,{id:crypto.randomUUID(),kind:'ELDERS',clanId:body.organizationId,by:user.nickname,names:ids.map(id=>roster.find(m=>m.userId===id).nickname),at:now});
    result.elderIds=ids;
   }else if(action==='formation'||action==='captains'){
    orgAssert(canManage,'PERMISSION','조직 원로 또는 행동대장만 부대를 편성할 수 있습니다.',403);
    if(action==='captains'||body.captains!==undefined)orgAssert(master,'PERMISSION','행동대장 임명은 조직 원로만 가능합니다.',403);
    if(action==='formation'){
     orgAssert(!s.battles.some(b=>b.status==='ACTIVE'&&(b.attacker===id||b.defender===id)),'BATTLE','교전이 끝난 뒤 편성을 변경하세요.');
     if(body.baseFormation!==undefined)orgAssert(JSON.stringify(validateFormation(body.baseFormation,memberIds))===JSON.stringify(formation),'STALE','다른 사람이 편성을 변경했습니다. 새로고침하세요.');
     s.formations[id]=validateFormation(body.formation,memberIds);
     for(const d of s.districts)if(d.owner===id&&d.defense&&!s.formations[id][d.defense]?.length)d.defense='';
    }
    if(body.captains!==undefined)s.captains[id]=validateFactionCaptains(body.captains,memberIds);
    factionEvent(s,{id:crypto.randomUUID(),kind:action==='formation'?'FORMATION':'CAPTAINS',clanId:id,by:user.nickname,at:now});
   }else if(action==='garrison'){
    orgAssert(canManage,'PERMISSION','조직 원로 또는 행동대장만 주둔할 수 있습니다.',403);
    assignOrganizationGarrison(s,id,body.districtId,body.squad,formation);
   }else if(action==='launch'){
    const d=s.districts.find(d=>d.id===String(body.districtId)),squad=String(body.squad);
    orgAssert(SQUADS.some(x=>x.id===squad&&x.role==='ATTACK')&&formation[squad]?.length,'FORMATION','공격대를 먼저 편성하세요.');
    orgAssert(master||formation[squad].includes(userId),'PERMISSION','해당 공격대원 또는 원로만 출정할 수 있습니다.',403);
    orgAssert(d&&d.owner!==id,'DISTRICT','다른 조직 지역 또는 무주지를 선택하세요.');
    orgAssert(d.protectedUntil<=now&&!s.battles.some(b=>b.status==='ACTIVE'&&b.districtId===d.id),'PROTECTED','점령 보호 또는 교전 중인 지역입니다.');
    orgAssert(!s.battles.some(b=>b.status==='ACTIVE'&&b.attacker===id&&b.squad===squad)&&(s.squadReady[id+':'+squad]||0)<=now&&(s.targetReady[id+':'+d.id]||0)<=now,'COOLDOWN','공격대 재출정 또는 해당 지역 재공격 대기 중입니다.');
    const defenders=formationOf(s,roster,d.owner)[d.defense]||[],b={id:crypto.randomUUID(),districtId:d.id,attacker:id,attackerName:ORGANIZATIONS[id-1].name,defender:d.owner,squad,defenseSquad:d.defense,attackers:[...formation[squad]],defenders:[...defenders],initiator:userId,initiatorName:user.nickname,attackerHp:R.sharedHp,defenderHp:R.sharedHp,entries:{},status:'ACTIVE',startedAt:now,endsAt:Math.min(now+R.battleDurationMs,s.session.endsAt),sessionKey:s.session.key};
    s.battles.unshift(b);s.session.participants=[...new Set([...s.session.participants,userId])];s.session.participantClans[userId]=id;
    Object.assign(result,{battleId:b.id,districtId:d.id});
    if(!d.owner||!defenders.length){finishFactionBattle(s,b,id,'UNDEFENDED',now);result.captured=true;}
    else factionEvent(s,{id:b.id,kind:'INVASION',districtId:d.id,clanId:id,attacker:id,defender:d.owner,by:user.nickname,at:now});
   }else if(action==='enter'||action==='strike'){
    const b=s.battles.find(b=>b.id===body.battleId&&b.status==='ACTIVE'),side=sideOf(b,id,userId);
    orgAssert(b&&side,'BATTLE','해당 전투의 공격대·방어대원만 입장할 수 있습니다.',403);
    if(action==='enter'){b.entries||={};b.entries[userId]||={enteredAt:now,hits:0,damage:0,lastStrikeAt:0};s.session.participants=[...new Set([...s.session.participants,userId])];s.session.participantClans[userId]=id;Object.assign(result,{battleId:b.id,districtId:b.districtId,side,enteredAt:b.entries[userId].enteredAt});}
    else{
     orgAssert(b.entries?.[userId]&&(s.strikeReady[userId]||0)<=now,'COOLDOWN','먼저 전투에 입장하고 재교전 대기를 확인하세요.');
     const enemyId=side==='ATTACK'?b.defender:b.attacker,enemyIds=side==='ATTACK'?b.defenders:b.attackers;
     orgAssert(computed.battleId===b.id&&enemyIds.includes(computed.opponent.id)&&roster.some(m=>m.userId===computed.opponent.id&&m.clanId===enemyId&&m.status==='ACTIVE'),'STALE','상대 부대가 변경되었습니다. 다시 확인하세요.');
     const field=side==='ATTACK'?'defenderHp':'attackerHp',damage=Math.min(b[field],computed.damage);
     b[field]-=damage;s.strikeReady[userId]=now+R.strikeCooldownMs;b.entries[userId].hits++;b.entries[userId].damage+=damage;b.entries[userId].lastStrikeAt=now;
     if(b[field]===0)finishFactionBattle(s,b,id,'HP_ZERO',now);
     Object.assign(result,computed,{damage,battleId:b.id,districtId:b.districtId,side,attackerHp:b.attackerHp,defenderHp:b.defenderHp,captured:b.status==='COMPLETED'&&b.winner===b.attacker,battleCompleted:b.status==='COMPLETED',winner:b.winner||0,result:computed.battleV2.result.winner==='A'?'WIN':'LOSE'});
    }
   }else if(action==='upgrade'){
    orgAssert(master,'PERMISSION','아지트 업그레이드는 조직 원로만 실행할 수 있습니다.',403);
    const [progress]=await q('SELECT stage FROM organization_progress_v1 WHERE round_id=$1 AND organization_id=$2 FOR UPDATE',[r.id,id]),stage=Number(progress?.stage||1),cost=policy.upgradeCosts[stage];
    orgAssert(progress,'PROGRESS','아지트 상태를 확인하지 못했습니다.',503);
    orgAssert(body.expectedStage===stage&&body.policyRevision===policy.revision,'STALE','아지트 단계 또는 업그레이드 비용이 변경되었습니다. 최신 상태를 확인한 뒤 다시 실행하세요.');
    orgAssert(stage<5,'MAX_STAGE','최고 단계 아지트입니다.');orgAssert(cost!==null&&cost!==undefined,'COST_UNSET','다음 아지트 비용이 아직 설정되지 않았습니다.');
    const funds=await accountFunds(q,r,id,-cost,'아지트 '+(stage+1)+'단계 업그레이드','upgrade:'+body.requestId,now);
    await q('UPDATE organization_progress_v1 SET stage=$1 WHERE round_id=$2 AND organization_id=$3',[stage+1,r.id,id]);
    Object.assign(result,{stage:stage+1,cost,funds});
   }else orgAssert(false,'ROUTE','지원하지 않는 조직 세력전 작업입니다.',404);
   await saveState(q,r,s);
  }
  const durable={...result};delete durable.battleV2;delete durable.attackerDeck;delete durable.defenderDeck;
  await q('INSERT INTO organization_faction_receipts_v1 VALUES($1,$2,$3,$4,$5)',[user.id,body.requestId,fingerprint,JSON.stringify(durable),now]);
  return {...result,replayed:false};
 });
}
export async function handleOrganizationFaction({path,request,env,deps}){
 const admin=path==='admin/organization/faction'||path.startsWith('admin/organization/faction/');
 if(!admin&&!path.startsWith('organization/faction/'))return null;
 const json=(data,status=200)=>deps.json(data,status,{'Cache-Control':'no-store'});
 try{
  const user=await deps.authenticate(request,env);orgAssert(user,'AUTH','로그인이 필요합니다.',401);
  if(admin)orgAssert(user.role==='OWNER','PERMISSION','조직 운영 설정은 OWNER 전용입니다.',403);
  const action=admin?path.slice('admin/organization/faction'.length).replace(/^\//,''):path.slice('organization/faction/'.length);
  if(request.method==='GET'&&['','overview','alerts'].includes(action)){
   const url=new URL(request.url),data=await tx(env,async q=>{const now=nowOf(deps),c=await context(q,user,url.searchParams.get('roundId')||undefined,now,deps);return overview(q,user,c.r,c.policy,c.row,c.roster,c.sessions,now,{admin,alertsOnly:action==='alerts'});});return json(data);
  }
  orgAssert(request.method==='POST','METHOD','지원하지 않는 요청 방식입니다.',405);
  orgAssert(admin?['policy','commander','elders'].includes(action):['formation','captains','garrison','launch','enter','strike','upgrade'].includes(action),'ROUTE','지원하지 않는 요청입니다.',404);
  const fields={policy:['requestId','policy'],commander:['requestId','roundId','organizationId','userId'],elders:['requestId','roundId','organizationId','userIds','baseUserIds'],formation:['requestId','roundId','formation','captains','baseFormation'],captains:['requestId','roundId','captains'],garrison:['requestId','roundId','districtId','squad'],launch:['requestId','roundId','districtId','squad'],enter:['requestId','roundId','battleId'],strike:['requestId','roundId','battleId'],upgrade:['requestId','roundId','expectedStage','policyRevision']}[action];
  const body=await readJointBody(request,{fields,maxBytes:16000});
  return json(await mutation(env,user,action,body,deps));
 }catch(error){deps.onError?.(error);return json({ok:false,error:error.status?error.message:'조직 세력전 처리 중 오류가 발생했습니다. 같은 요청으로 다시 확인하세요.',code:error.code||'ORG_FACTION_ERROR'},error.status||503);}
}
export async function tickOrganizationFaction(env,deps={}){
 return tx(env,async q=>{
  const policy=await readPolicy(q,' FOR SHARE');if(policy.mode==='OFF')return {enabled:false};
  const rounds=await q("SELECT * FROM organization_rounds_v1 WHERE scope=$1 AND phase='ASSIGNED' LIMIT 1 FOR SHARE",[policy.mode==='ON'?'LIVE':'TEST']);
  for(const r of rounds){const now=nowOf(deps),roster=await rosterFor(q,r),row=await stateFor(q,r,now);await sync(q,r,row,roster,policy,now,deps);}
  return {enabled:true,rounds:rounds.length};
 });
}
