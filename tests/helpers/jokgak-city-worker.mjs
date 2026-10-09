import * as miniflare from 'miniflare';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {defaultCitySettings} from '../../shared/jokgak-city-settings-v1.mjs';
export async function cityWorkerFixture(){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const compiled=await build({stdin:{resolveDir:root,sourcefile:'isolated-city-worker.mjs',contents:`
    import {handleJokgakCity} from './functions/_jokgak_city.js';
    const now=Date.parse('2026-10-09T13:10:00Z');
    export default {async fetch(request,bindings){
      const env={...bindings,RUNTIME_DB_CACHE_SCOPE:'isolated-city-entry'};
      const id=Number(request.headers.get('x-test-user')||1);
      return handleJokgakCity({path:new URL(request.url).pathname.slice(5),request,env,deps:{
        now:()=>now,authenticate:async()=>({id,nickname:'검수 '+id,role:id===1?'OWNER':'USER'}),
        json:(body,status=200)=>Response.json(body,{status}),
        withUserMutationLock:async(_env,_id,_path,work)=>work(),
        pvpDeckSnapshot:async()=>Array.from({length:5},(_,id)=>({id:String(id),power:1000}))
      }});
    }};`},bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
  const convert=miniflare.convertV4MiniflareOptions||((x)=>x);
  const mf=new miniflare.Miniflare(convert({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],cf:false,log:new miniflare.Log(miniflare.LogLevel.ERROR),d1Databases:{DB:'isolated-city-entry'}}));
  const db=await mf.getD1Database('DB');
  await db.exec("CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,status TEXT DEFAULT 'ACTIVE',banned_until TEXT,coin INTEGER DEFAULT 123456);");
  await db.batch([
    db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind('jokgak_city_settings_v1',JSON.stringify(defaultCitySettings())),
    db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').bind('jokgak_city_role_seed_v1','isolated-test-only-seed'),
    db.prepare("INSERT INTO users(id,nickname,role) VALUES(1,'검수 1','OWNER'),(2,'검수 2','USER')")
  ]);
  const request=(path,body,user=1)=>mf.dispatchFetch('https://game.test/api/jokgak-city/'+path,{method:body?'POST':'GET',headers:{origin:'https://game.test','content-type':'application/json','x-test-user':String(user)},...(body?{body:JSON.stringify(body)}:{})});
  return {mf,db,request,dispose:()=>mf.dispose()};
}
