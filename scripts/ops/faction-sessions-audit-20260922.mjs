// Read-only production preflight/post-deployment audit. Never logs the connection string.
import pg from 'pg';
import assert from 'node:assert/strict';
const connectionString=process.env.CNINE_DATABASE_URL;
if(!connectionString)throw Error('CNINE_DATABASE_URL is required');
const client=new pg.Client({connectionString,connectionTimeoutMillis:15000,statement_timeout:15000});
try{
 await client.connect();
 await client.query('BEGIN READ ONLY');
 const query=async sql=>(await client.query(sql)).rows;
 const identity=(await query('SELECT current_database() database,current_user role,current_timestamp checked_at'))[0];
 assert.equal(identity.database,'cnine');assert.equal(identity.role,'cnine_migrator');
 const required={users:['coin'],user_message_rewards:['reward_amount'],user_message_reward_claim_receipts_v1222:['reward_amount','balance_before','balance_after'],coin_logs:['change_amount','balance_after']};
 const columns=await query("SELECT table_name,column_name,data_type,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN ('users','user_messages','user_message_rewards','user_message_reward_claim_receipts_v1222','coin_logs')");
 const bigint=[];
 for(const [table,names] of Object.entries(required))for(const name of names){
  const column=columns.find(c=>c.table_name===table&&c.column_name===name);
  assert.equal(column?.data_type,'bigint',`${table}.${name} must be BIGINT`);bigint.push(`${table}.${name}`);
 }
 assert.ok(columns.some(c=>c.table_name==='user_messages'&&c.column_name==='campaign_key'));
 const indexes=await query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename IN ('user_messages','user_message_rewards')");
 assert.ok(indexes.some(i=>i.tablename==='user_messages'&&/UNIQUE/.test(i.indexdef)&&/\(user_id, campaign_key\)/.test(i.indexdef)),'Unique message campaign index required');
 const sequences=[];
 for(const table of ['user_messages','user_message_rewards']){
  const r=(await client.query('SELECT pg_get_serial_sequence($1,$2) sequence',[table,'id'])).rows[0];
  assert.ok(r.sequence,'Generated message id required');
  const n=(await query(`SELECT max(id) maximum FROM ${table}`))[0];
  const seq=(await client.query('SELECT last_value FROM pg_sequences WHERE schemaname=$1 AND sequencename=$2',r.sequence.split('.'))).rows[0];
  assert.ok(BigInt(seq?.last_value||0)>=BigInt(n.maximum||0),`${table} sequence behind rows`);
  sequences.push({table,lastValue:seq.last_value,maximum:n.maximum});
 }
 const settings=await query("SELECT key,value,updated_at FROM app_meta WHERE key IN ('clan_settings_v1','clan_draft_scheduler_v1','clan_faction_sessions_schema_20260921_v1')");
 const seasons=await query('SELECT id,season_no,phase,starts_at,ends_at FROM clan_seasons ORDER BY season_no DESC LIMIT 2');
 const wars=await query("SELECT id,status,starts_at,ends_at,settled_at FROM territory_war_v3_rounds WHERE status IN ('ACTIVE','PREPARING') ORDER BY id DESC LIMIT 5");
 const states=await query('SELECT season_id,revision,state_json FROM clan_faction_state WHERE season_id IN (SELECT id FROM clan_seasons ORDER BY season_no DESC LIMIT 2) ORDER BY season_id');
 const stateSummary=states.map(r=>{
  const s=JSON.parse(r.state_json),holdings={};
  for(const d of s.districts)holdings[d.owner]=(holdings[d.owner]||0)+1;
  return {seasonId:r.season_id,revision:r.revision,holdings,formations:s.formations,captains:s.captains,
   activeBattles:s.battles.filter(b=>b.status==='ACTIVE').length,taxDisabledAt:s.taxDisabledAt||null,
   session:s.session?{key:s.session.key,status:s.session.status,startsAt:s.session.startsAt,endsAt:s.session.endsAt,participantCount:s.session.participants?.length}:null,
   schedule:s.sessionPlan,queueCount:s.sessionQueue?.length||0};
 });
 const tables=(await query("SELECT to_regclass('clan_faction_days_v1') days,to_regclass('clan_faction_sessions_v1') sessions"))[0];
 const days=tables.days?await query('SELECT day_key,schedule_json FROM clan_faction_days_v1 ORDER BY day_key DESC LIMIT 2'):[];
 const settlements=tables.sessions?await query('SELECT session_key,status,recipient_count,reward_count,closed_ms FROM clan_faction_sessions_v1 ORDER BY closed_ms DESC LIMIT 4'):[];
 const campaigns=await query("SELECT m.campaign_key,COUNT(*) messages,COUNT(r.id) rewards,COUNT(r.claimed_at) claimed FROM user_messages m LEFT JOIN user_message_rewards r ON r.message_id=m.id WHERE m.campaign_key LIKE 'faction-session:%' GROUP BY m.campaign_key ORDER BY m.campaign_key DESC LIMIT 4");
 await client.query('ROLLBACK');
 console.log(JSON.stringify({identity,bigint,sequences,settings:settings.map(s=>({...s,value:JSON.parse(s.value)})),seasons,wars,states:stateSummary,days:days.map(d=>({...d,schedule_json:JSON.parse(d.schedule_json)})),settlements,campaigns},null,2));
}finally{await client.end();}
