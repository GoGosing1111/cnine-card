import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {handleNoxLive,NOX_SCHEMA,NOX_SETTINGS,NOX_CLIENT_VERSION} from '../../functions/_raid_nox_live.js';
import {REVIEW_DECK} from '../../preview/lich-king-raid-v1/fixture.mjs';
export const NOX_DECK=REVIEW_DECK.map(c=>({...c,power:c.power*6}));
export async function noxFixture(t,{handler=handleNoxLive,queryDelayMs=0}={}){
  const pg=new PGlite();t?.after(()=>pg.close());let queries=[],failAt='',serial=0;
  await pg.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE users(id BIGINT PRIMARY KEY,nickname TEXT,role TEXT,status TEXT DEFAULT 'ACTIVE',banned_until TEXT,coin BIGINT DEFAULT 999999999999999999);
    CREATE TABLE coin_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT);
    CREATE TABLE cnine_user_inventory(user_id BIGINT,item_code TEXT,quantity BIGINT NOT NULL,unseen_quantity BIGINT NOT NULL,updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,is_active INTEGER);
    CREATE TABLE inventory_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
    CREATE TABLE admin_logs(id BIGSERIAL PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);
    INSERT INTO users(id,nickname,role) VALUES(1,'검수 공대장','OWNER'),(2,'테스터2','USER'),(3,'테스터3','USER'),(4,'미지정','USER'),(5,'관리자','ADMIN'),(6,'테스터6','USER'),(7,'테스터7','USER'),(8,'테스터8','USER');
    ${NOX_SCHEMA.join(';')};`);
  const client={async query(input){const text=typeof input==='string'?input:input.text;queries.push(text);if(queryDelayMs)await new Promise(r=>setTimeout(r,queryDelayMs));if(failAt&&text.includes(failAt))throw Error('INJECTED_FAILURE');const r=await pg.query(text,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
  const DB=new __postgresCompatTest.PostgresD1Database(client),env={DB},decks=new Map();
  const deps={authenticate:async request=>{const id=Number(request.headers.get('authorization')?.replace('Bearer qa-',''));return id?await DB.enqueue(async()=>(await client.query({text:'SELECT * FROM users WHERE id=$1',values:[id]})).rows[0]):null;},json:(data,status=200)=>Response.json(data,{status}),pveDeckCards:async()=>NOX_DECK.map(c=>c.id),raidDeckPower:async(_e,id)=>structuredClone(decks.get(Number(id))||{cards:NOX_DECK})};
  const one=async(text,values=[])=>(await pg.query(text,values)).rows[0];
  const all=async(text,values=[])=>(await pg.query(text,values)).rows;
  const uid=()=>`nox_request_${++serial}`;
  async function call(route,{user=1,body,method=body?'POST':'GET',origin='https://test.invalid'}={}){const path=route.startsWith('admin/')?route:'raid/nox/'+route;const request=new Request('https://test.invalid/api/'+path,{method,headers:{authorization:'Bearer qa-'+user,'content-type':'application/json',origin},...(body?{body:JSON.stringify(body)}:{})});const response=await handler({path:path.split('?')[0],request,env,deps});return {status:response.status,body:await response.json()};}
  const command=(kind,body={},user=1)=>call(kind,{user,body:{requestId:uid(),clientVersion:NOX_CLIENT_VERSION,...body}});
  async function configure(changes={}){const before=await call('admin/raid/nox/settings');const r=await call('admin/raid/nox/settings',{body:{settings:{...before.body.settings,...changes}}});if(r.status!==200)throw Error(JSON.stringify(r));return r;}
  async function party(size=3,difficulty='NORMAL'){const ids=[1,2,3,6,7,8].slice(0,size);const {body:feature}=await call('feature');const created=await command('create',{size,difficulty,acceptedCreateCoins:feature.createCoins});if(created.status!==200)throw Error(JSON.stringify(created));const roomId=created.body.roomId;for(const id of ids.slice(1)){const r=await command('join',{roomId},id);if(r.status!==200)throw Error(JSON.stringify(r));}for(const id of ids){const r=await command('ready',{roomId,ready:true,acceptedCoins:created.body.state.entryCoins},id);if(r.status!==200)throw Error(JSON.stringify(r));}return {roomId,ids};}
  async function changeRoom(roomId,work){const room=JSON.parse((await one('SELECT state_json FROM raid_nox_rooms_v1 WHERE room_id=$1',[roomId])).state_json);work(room);await pg.query('UPDATE raid_nox_rooms_v1 SET state_json=$1,status=$2,version=version+1 WHERE room_id=$3',[JSON.stringify(room),room.status,roomId]);return room;}
  await configure({mode:'TEST',testUserIds:[2,3,6,7,8]});
  return {pg,env,deps,call,command,configure,party,one,all,uid,changeRoom,decks,close:()=>pg.close(),failAt:v=>{failAt=v;},queries:()=>queries,resetQueries:()=>{queries=[];}};
}
