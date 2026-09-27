import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../../functions/_postgres_d1_compat.js';
import {handleIconCms} from '../../functions/_icon_cms.js';

export async function iconCmsFixture(){
  const pg=new PGlite();let calls=0,fail=false;
  await pg.exec("CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL AS $$ SELECT CURRENT_TIMESTAMP::text $$; CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT DEFAULT sqlite_now());");
  const client={async query(input){calls++;const sql=typeof input==='string'?input:input.text;if(fail&&sql.startsWith('UPDATE app_meta'))throw Error('injected failure');const result=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const handle=(request,options={})=>handleIconCms({env,path:options.path||'admin/icons',request,deps:{requirePermission:async()=>options.denied?null:{id:options.owner||1,role:options.role||'OWNER'},json:(data,status=200)=>Response.json(data,{status})}});
  const call=async(body,options={})=>{
    const response=await handle(new Request('https://qa.test/api/admin/icons',{method:options.method||(body?'PATCH':'GET'),...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),options);
    return response?{status:response.status,headers:response.headers,body:await response.json()}:null;
  };
  return {pg,env,handle,call,count:()=>calls,fail:value=>{fail=value;},close:()=>pg.close()};
}
