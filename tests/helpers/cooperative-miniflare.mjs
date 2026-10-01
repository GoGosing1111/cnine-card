import * as miniflare from 'miniflare';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';
import {MERCENARY_RUNTIME_DRAFT} from '../../functions/_mercenary_account.js';
import {fixture} from './cooperative-fixture.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {Miniflare,Log,LogLevel}=miniflare,convertV4MiniflareOptions=miniflare.convertV4MiniflareOptions||((x)=>x);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
export async function cooperativeMiniflare(){
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cooperative-qa-'));
 const compiled=await build({entryPoints:[path.join(root,'tests/helpers/cooperative-worker.mjs')],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],write:false});
 const mf=new Miniflare(convertV4MiniflareOptions({script:compiled.outputFiles[0].text,modules:true,compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],cf:false,log:new Log(LogLevel.WARN),host:'127.0.0.1',port:0,
  bindings:{API_RUNTIME_KEY:Buffer.alloc(32,73).toString('base64')},d1Databases:{DB:'qa-cooperative'},d1Persist:path.join(temp,'db'),durableObjectsPersist:path.join(temp,'rooms'),
  durableObjects:{COOP_ROOMS:{className:'CooperativeRoom',useSQLite:true},COOP_PLAYERS:{className:'CooperativePlayer',useSQLite:true},USER_LOCK:{className:'UserMutationLock',useSQLite:true}},
  serviceBindings:{ASSETS:async request=>{
   const pathname=decodeURIComponent(new URL(request.url).pathname),file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
   if(!file.startsWith(path.resolve(root)+path.sep))return new Response('Forbidden',{status:403});
   try{return new Response(await fs.readFile(file),{headers:{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'}});}catch{return new Response('Not found',{status:404});}
  }}
 }));
 const origin=(await mf.ready).origin;if(process.env.COOP_QA_DEBUG)console.log('QA worker ready',origin);
 const batch=async rows=>{const r=await fetch(origin+'/__qa/sql',{method:'POST',body:JSON.stringify(rows)});if(!r.ok)throw Error(await r.text());return r.json();};
 const db={prepare(sql){return {sql,args:[],bind(...args){return {...this,args};}};},batch,exec:sql=>batch(sql.split(';').filter(s=>s.trim()).map(sql=>({sql})))};
 await db.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT); CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,coin INTEGER); CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT,power_type TEXT,base_power INTEGER,image_url TEXT); CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER); CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT PRIMARY KEY,payload_json TEXT,revision INTEGER); CREATE TABLE user_mercenary_cards_v1(user_id INTEGER,mercenary_code TEXT,total_copies INTEGER,duplicate_count INTEGER); CREATE TABLE user_mercenary_growth_v1(user_id INTEGER,mercenary_code TEXT,level INTEGER,experience INTEGER,revision INTEGER); CREATE TABLE user_mercenary_loadout_v1(user_id INTEGER,mercenary_code TEXT,revision INTEGER);`);
 if(process.env.COOP_QA_DEBUG)console.log('QA schema ready');
 const document=structuredClone(MERCENARY_CMS_SEED.document);
 for(const m of fixture.mercenaries){Object.assign(document.mercenaries.find(c=>c.code===m.code),{name:m.name,rank:m.rank,position:m.position,role:m.role,basicTarget:m.basicTarget,skillTarget:m.skillTarget});document.assignments.find(a=>a.code===m.code).skillIds=m.skills.map(s=>s.id);for(const skill of m.skills)Object.assign(document.skills.find(s=>s.id===skill.id),skill);}
 const statements=[db.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').bind('cooperative_battleground_settings_v1',JSON.stringify({mode:'TEST',testUserIds:[2,3],revision:0,rewardLocked:true})),db.prepare('INSERT INTO app_meta VALUES(?,?,NULL)').bind('mercenary_runtime_policy_v1',JSON.stringify({...MERCENARY_RUNTIME_DRAFT,combat:fixture.mercenaries[0].combat})),db.prepare('INSERT INTO mercenary_cms_documents_v1 VALUES(?,?,?)').bind('config',JSON.stringify(document),fixture.cmsRevision)];
 for(const card of fixture.cardsByLevel[13])statements.push(db.prepare('INSERT INTO cards_effective_v1210 VALUES(?,?,?,?,?,?)').bind(card.id,card.title,card.rarity,card.power_type,card.base_power,card.image));
 for(let id=1;id<=4;id++){
  statements.push(db.prepare('INSERT INTO users VALUES(?,?,?)').bind(id,'분대 '+id,12345678));
  for(const card of fixture.cardsByLevel[13])statements.push(db.prepare('INSERT INTO user_cards VALUES(?,?,1,13)').bind(id,card.id));
  for(const merc of fixture.mercenaries)statements.push(db.prepare('INSERT INTO user_mercenary_cards_v1 VALUES(?,?,1,0)').bind(id,merc.code));
 }
 for(let i=0;i<statements.length;i+=80)await db.batch(statements.slice(i,i+80));
 if(process.env.COOP_QA_DEBUG)console.log('QA inventory ready');
 const request=async(id,kind,body)=>{
  const response=await fetch(origin+'/api/coop/'+kind,{method:body?'POST':'GET',headers:{authorization:id?'Bearer local-qa-'+id:'',origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,...await response.json()};
 };
 return {mf,db,origin,temp,request,dispose:()=>mf.dispose()};
}
