import {DatabaseSync} from 'node:sqlite';
import {handleLichRaid,LICH_TICKET} from '../../functions/_raid_lich_live.js';
import {REVIEW_DECK} from '../../preview/lich-king-raid-v1/fixture.mjs';
export async function lichLiveFixture({postgres=false}={}){
  let sql,pg,DB,failAt='',queries=0;
  const schema=[
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    "CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT DEFAULT 'ACTIVE')",
    'CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER)',
    'CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER DEFAULT 0,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code))',
    'CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE admin_logs(admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT)',
    "INSERT INTO users(id,nickname,role) VALUES(1,'검수 공대장','OWNER'),(2,'검수 봉인대','USER'),(3,'검수 구출대','USER'),(4,'검수 미지정','USER'),(5,'검수 관리자','ADMIN'),(6,'검수 예비대','USER'),(7,'검수 참가자','USER'),(8,'검수 여덟','USER')",
    "INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,'"+LICH_TICKET+"',5,5),(2,'"+LICH_TICKET+"',2,2)"
  ];
  if(postgres){
    const [{PGlite},{__postgresCompatTest}]=await Promise.all([import('@electric-sql/pglite'),import('../../functions/_postgres_d1_compat.js')]);
    pg=new PGlite();await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$ SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;");
    await pg.exec(schema.map(q=>q.replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')).join(';'));
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){queries++;const text=typeof input==='string'?input:input.text;if(failAt&&text.includes(failAt))throw Error('INJECTED_FAILURE');const result=await pg.query(text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}});
  }else{
    sql=new DatabaseSync(':memory:');sql.exec(schema.join(';'));
    class Statement{
      constructor(source,values=[]){this.source=source;this.values=values;}
      bind(...values){return new Statement(this.source,values);}
      async first(){queries++;return sql.prepare(this.source).get(...this.values)||null;}
      async all(){queries++;return {results:sql.prepare(this.source).all(...this.values)};}
      async run(){return this.execute();}
      execute(){queries++;if(failAt&&this.source.includes(failAt))throw Error('INJECTED_FAILURE');return {meta:{changes:Number(sql.prepare(this.source).run(...this.values).changes)}};}
    }
    DB={prepare:q=>new Statement(q),async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>s.execute());sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  }
  const env={DB},locks=new Map(),decks=new Map();
  async function withLock(_env,userId,_path,work){
    const prior=locks.get(userId)||Promise.resolve(),next=prior.catch(()=>{}).then(work);
    locks.set(userId,next);try{return await next;}finally{if(locks.get(userId)===next)locks.delete(userId);}
  }
  const deps={
    authenticate:async request=>{const match=request.headers.get('authorization')?.match(/^Bearer local-qa-(\d+)$/);return match?DB.prepare('SELECT * FROM users WHERE id=?').bind(Number(match[1])).first():null;},
    json:(data,status=200)=>Response.json(data,{status}),
    raidDeckPower:async(_env,userId)=>structuredClone(decks.get(Number(userId))||{cards:REVIEW_DECK,power:290000,ids:REVIEW_DECK.map(c=>c.id),userId}),
    withUserMutationLock:withLock
  };
  let serial=0;
  const uid=()=> 'request_'+String(++serial).padStart(8,'0');
  async function call(route,{user=1,body,method=body?'POST':'GET',origin='https://test.invalid'}={}){
    if(body&&['open','join','ready','start'].includes(route.split('?')[0]))body={clientRulesVersion:2,...body};
    const path=route.startsWith('admin/')?route:'raid/lich/'+route;
    const request=new Request('https://test.invalid/api/'+path,{method,headers:{authorization:'Bearer local-qa-'+user,'content-type':'application/json',origin},...(body?{body:JSON.stringify(body)}:{})});
    const response=await handleLichRaid({path:path.split('?')[0],request,env,deps});
    return {status:response.status,body:await response.json()};
  }
  const command=(kind,body={},user=1)=>call(kind,{user,body:{requestId:uid(),...body}});
  const one=async(q,...args)=>DB.prepare(q).bind(...args).first();
  const all=async(q,...args)=>(await DB.prepare(q).bind(...args).all()).results;
  const run=async(q,...args)=>DB.prepare(q).bind(...args).run();
  async function configure(changes={}){
    const old=await call('admin/raid/lich/settings');
    return call('admin/raid/lich/settings',{body:{settings:{...old.body.settings,testUserIds:[2,3,6,7,8],...changes}}});
  }
  async function party(){
    await configure();
    const opened=await command('open');const roomId=opened.body.roomId;
    for(const user of [2,3])await command('join',{roomId},user);
    await command('assign',{roomId,targetId:'2',role:'WARDEN'});await command('assign',{roomId,targetId:'3',role:'RESCUE'});
    return roomId;
  }
  return {env,deps,call,command,configure,party,uid,one,all,run,setDeck:(userId,deck)=>decks.set(Number(userId),structuredClone(deck)),
    inject:value=>{failAt=value;},count:()=>queries,close:()=>pg?pg.close():sql.close(),
    handle:request=>handleLichRaid({path:new URL(request.url).pathname.slice(5),request,env,deps})};
}
