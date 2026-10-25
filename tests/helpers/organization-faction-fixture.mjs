import assert from 'node:assert/strict';
import {organizationFixture} from './organization-fixture.mjs';
import {installOrganizationFactionSchema,handleOrganizationFaction} from '../../functions/_organization_faction.js';
const start=Date.parse('2026-10-15T00:00:00+09:00');
export async function organizationFactionFixture(t,{live=false,funds=null}={}){
 const f=await organizationFixture(t,{people:10});f.advance(start+1000-f.clock());
 await installOrganizationFactionSchema(f.env.DB);
 await f.pg.exec('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 await f.pg.exec("CREATE TABLE territory_war_v3_rounds(id BIGINT PRIMARY KEY,status TEXT,starts_at TEXT,ends_at TEXT,settled_at TEXT);CREATE TABLE user_messages(id BIGSERIAL PRIMARY KEY,user_id BIGINT,sender_type TEXT,title TEXT,body TEXT,message_type TEXT,campaign_key TEXT,UNIQUE(user_id,campaign_key));CREATE TABLE user_message_rewards(id BIGSERIAL PRIMARY KEY,message_id BIGINT UNIQUE,user_id BIGINT,reward_type TEXT,reward_amount BIGINT)");
 const roundId=await f.prepare({survey:false});
 await f.pg.query("UPDATE organization_rounds_v1 SET phase='ASSIGNED',scope=$1,assigned_at=$2 WHERE id=$3",[live?'LIVE':'TEST',start-1000,roundId]);
 for(let id=2;id<=11;id++)await f.pg.query('INSERT INTO organization_members_v1(round_id,user_id,organization_id,slot,seed_power,joined_at) VALUES($1,$2,$3,$4,1000,$5)',[roundId,id,id<7?1:2,(id-2)%5+1,start]);
 for(let id=1;id<=15;id++)await f.pg.query('INSERT INTO organization_progress_v1(round_id,organization_id) VALUES($1,$2)',[roundId,id]);
 let builds=0;
 const errors=[],deps={now:f.clock,randomFactionSchedule:()=>0,json:(data,status=200,headers={})=>Response.json(data,{status,headers}),authenticate:async req=>(await f.pg.query('SELECT * FROM users WHERE id=$1',[Number(req.headers.get('x-user'))])).rows[0],onError:e=>errors.push(e),buildFactionBattle:async()=>{builds++;return {battleV2:{teams:{B:{cards:[{maxHp:100}]}},result:{winner:'A',final:{B:[{hp:0}]}}},attackerPower:1000,defenderPower:1000};}};
 const call=async(path,{user=2,body,method=body?'POST':'GET'}={})=>{
  const response=await handleOrganizationFaction({path:path.split('?')[0],request:new Request('https://example.test/api/'+path,{method,headers:{'x-user':String(user),'Content-Type':'application/json',Origin:'https://example.test'},...(body?{body:JSON.stringify(body)}:{})}),env:f.env,deps});return {status:response.status,data:await response.json()};
 };
 const post=(path,body={},user=2)=>call(path,{user,body:{requestId:crypto.randomUUID(),roundId,...body}});
 const admin=()=>call('admin/organization/faction?roundId='+roundId,{user:1});
 const overview=(user=2)=>call('organization/faction/overview?roundId='+roundId,{user});
 const initial=await admin();
 const saved=await call('admin/organization/faction/policy',{user:1,body:{requestId:crypto.randomUUID(),policy:{...initial.data.policy,mode:live?'ON':'TEST',fundsPerRegion:funds,upgradeCosts:[0,1000,2000,3000,4000]}}});assert.equal(saved.status,200,JSON.stringify(saved));
 const commander=(organizationId,userId)=>post('admin/organization/faction/commander',{organizationId,userId},1);
 assert.equal((await commander(1,2)).status,200);assert.equal((await commander(2,7)).status,200);
 const mutateState=async change=>{const [row]=(await f.pg.query('SELECT * FROM organization_faction_state_v1 WHERE round_id=$1',[roundId])).rows;const s=JSON.parse(row.state_json);change(s);await f.pg.query('UPDATE organization_faction_state_v1 SET state_json=$1 WHERE round_id=$2',[JSON.stringify(s),roundId]);};
 return {...f,roundId,call,post,admin,overview,commander,mutateState,deps,errors,builds:()=>builds};
}
