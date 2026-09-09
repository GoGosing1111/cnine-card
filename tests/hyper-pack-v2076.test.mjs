import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {HYPER_PACK_PRICE,HYPER_PACK_RELEASE_ENABLED,HYPER_PACK_IMAGE,HYPER_PACK_MATERIALS,hyperPackCost,hyperPackCatalogRow,arrangeHyperPackCatalog,cleanHyperPackDraft,hyperPackDraftStatus,handleHyperPack} from '../functions/_hyper_pack.js';
import {buildHyperPreview} from '../js/hyper-pack-preview-model-v2076.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const admin={id:9,role:'OWNER'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const request=(path,method='GET',body,headers={})=>new Request('https://cnine-card.pages.dev/api/'+path,{method,headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const valid={rates:{MISS:50,MASTER_STAR:30,MYSTIC_ENERGY:19,MERCENARY:1},quantities:{MASTER_STAR:12,MYSTIC_ENERGY:3}};
function deps(overrides={}){return {json,authenticate:async()=>admin,requirePermission:async()=>admin,readBody:r=>r.json(),writeAdminLog:async()=>{},...overrides};}

test('500 million per open, max 10; no 32-bit truncation, discount or implicit extra opens',()=>{
  assert.equal(HYPER_PACK_PRICE,500000000);assert.equal(hyperPackCost(10),5000000000);
  for(const count of [0,-1,11,100,1.5,NaN,Infinity,'10',null])assert.throws(()=>hyperPackCost(count));
  const pack=hyperPackCatalogRow();assert.equal(pack.price,500000000);assert.equal(pack.maxDrawCount,10);assert.equal(pack.burningDiscountPercent,0);
  assert.equal(pack.guarantee10,null);assert.deepEqual(pack.allowed,[]);assert.equal(pack.drawEnabled,false);assert.equal(pack.ownerDrawEnabled,false);
  assert.equal(HYPER_PACK_RELEASE_ENABLED,false);
});
test('Premium sale removed; others shift one slot, Hyper last, caller data and unknown packs preserved',()=>{
  const original=['basic','advanced','premium','pickup','superstar','hyper'].map(id=>({id})),snapshot=structuredClone(original);
  assert.deepEqual(arrangeHyperPackCatalog(original).map(p=>p.id),['advanced','pickup','superstar','hyper']);assert.deepEqual(original,snapshot);
  assert.deepEqual(arrangeHyperPackCatalog([{id:'special'},{id:'ultimate'},{id:'advanced'}]).map(p=>p.id),['advanced','ultimate','special','hyper']);
});
test('draft rates/quantities default unset and never authorize mercenary acquisition',()=>{
  const empty=cleanHyperPackDraft();assert(Object.values(empty.rates).every(v=>v===null));assert(Object.values(empty.quantities).every(v=>v===null));
  assert.equal(hyperPackDraftStatus(empty).complete,false);assert.equal(hyperPackDraftStatus(cleanHyperPackDraft(valid)).complete,true);
  assert.equal(hyperPackDraftStatus(valid).drawEnabled,false);assert(hyperPackDraftStatus(valid).blockers.includes('MERCENARY_APPROVAL_PENDING'));
  assert.equal(HYPER_PACK_MATERIALS.MYSTIC_ENERGY,'STARLIGHT_ARMOR_CORE');
  for(const bad of [{...valid,enabled:true},{...valid,ownerDrawEnabled:true},{rates:{MISS:101}},{rates:{MISS:99,MASTER_STAR:2}},{rates:{MISS:'5'}},{rates:{MISS:.00001}},{quantities:{MASTER_STAR:0}},{quantities:{MASTER_STAR:1.1}}])assert.throws(()=>cleanHyperPackDraft(bad));
});
test('config and locked open never access DB or grant to OWNER, including repeated requests',async()=>{
  const env={DB:{prepare(){throw new Error('must not access DB');}}};
  for(const count of [1,10,10]){const result=await handleHyperPack({path:'hyper-pack/open',request:request('hyper-pack/open','POST',{count}),env,deps:deps()});assert.equal(result.status,409);assert.equal((await result.json()).code,'HYPER_PACK_NOT_RELEASED');}
  for(const count of [0,11,'10',1.5])assert.equal((await handleHyperPack({path:'hyper-pack/open',request:request('hyper-pack/open','POST',{count}),env,deps:deps()})).status,400);
  assert.equal((await handleHyperPack({path:'hyper-pack/open',request:request('hyper-pack/open','POST',{count:1}),env,deps:deps({authenticate:async()=>null})})).status,401);
  assert.equal((await handleHyperPack({path:'hyper-pack/config',request:request('hyper-pack/config'),env,deps:deps()})).status,200);
});
test('CMS PostgreSQL roundtrip, permission, stale revision and cross-site protection; no live money/card writes',async()=>{
  const pg=new PGlite();await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$; CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);`);
  const sqls=[],logs=[];
  const client={async query(input){const text=typeof input==='string'?input:input.text,values=typeof input==='string'?[]:input.values||[];sqls.push(text);const r=await pg.query(text,values);return {...r,rowCount:r.affectedRows??r.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const call=(method,body,options={})=>handleHyperPack({path:'admin/hyper-pack',request:request('admin/hyper-pack',method,body,options.headers),env,deps:deps({writeAdminLog:async(...args)=>logs.push(args),...options.deps})});
  try{
    assert.equal((await call('GET',undefined,{deps:{requirePermission:async()=>null}})).status,403);
    const initial=await (await call('GET')).json();assert.equal(initial.revision,null);
    let result=await call('PATCH',{...valid,revision:null});assert.equal(result.status,200);const saved=await result.json();assert(saved.revision);assert.equal(saved.status.drawEnabled,false);
    assert.equal((await call('PATCH',{...valid,revision:null})).status,409);
    assert.equal((await call('PATCH',{...valid,revision:saved.revision,enabled:true})).status,400);
    assert.equal((await call('PATCH',{...valid,revision:saved.revision},{headers:{origin:'https://evil.invalid'}})).status,403);
    result=await call('PATCH',{...valid,quantities:{MASTER_STAR:30,MYSTIC_ENERGY:5},revision:saved.revision});assert.equal(result.status,200);
    const reread=await (await call('GET')).json();assert.equal(reread.settings.quantities.MASTER_STAR,30);assert.equal(logs.length,2);
    assert(sqls.every(sql=>!/(users|inventory|user_cards|coin_logs)/i.test(sql)));
  }finally{await pg.close();}
});
test('preview is deterministic, explicitly simulated, no fabricated grant count or probabilities',()=>{
  assert.equal(buildHyperPreview(10).length,10);assert.equal(new Set(buildHyperPreview(10).map(r=>r.kind)).size,4);
  for(const kind of ['MISS','MASTER_STAR','MYSTIC_ENERGY','MERCENARY'])assert(buildHyperPreview(10,kind).every(r=>r.kind===kind&&r.preview&&!r.granted&&r.quantity===null));
  assert.throws(()=>buildHyperPreview(11));assert.throws(()=>buildHyperPreview(10,'UNKNOWN'));
});
test('original artwork preserved; lightweight shared Pixi/GSAP preview, live does not load renderer',()=>{
  const image=readFileSync(new URL('../'+HYPER_PACK_IMAGE,import.meta.url));assert.equal(createHash('sha256').update(image).digest('hex'),'b23ba9f88b98a17f400a96cb7bcf19c82933c4d66275d6f96c3c6d1bab74a80c');
  const runtime=read('js/hyper-pack-fx-v2076.src.js'),preview=read('preview/hyper-pack-v1/preview.js'),index=read('index.html');
  assert.match(runtime,/new Application/);assert.match(runtime,/gsap\.timeline/);assert.match(runtime,/resolveSegment\?\.\(\)/);assert.match(runtime,/observer\?\.disconnect/);
  assert.doesNotMatch(runtime+preview,/\/api\/.*(?:draw|open)|user_cards|fetch\(/);assert.doesNotMatch(index,/<script[^>]+hyper-pack-fx/);
  assert(statSync(new URL('../js/hyper-pack-fx-v2076.bundle.js',import.meta.url)).size<20000);
});
test('retired/hyper API guards precede receipt claiming and Premium Cube remains untouched',()=>{
  const api=read('functions/api/[[path]].js'),app=read('js/app.js');
  const start=api.indexOf("if(path==='draw'&&request.method==='POST')"),section=api.slice(start,start+19000);
  assert(section.indexOf('PREMIUM_PACK_RETIRED')>section.indexOf("if(prior?.status==='APPLIED'"));
  assert(section.indexOf('PREMIUM_PACK_RETIRED')<section.indexOf('let receiptAlreadyClaimed=false'));
  assert(section.indexOf('HYPER_PACK_NOT_RELEASED')<section.indexOf('ensureDrawReceiptV2'));
  assert.match(app,/function hyperPackHero/);assert.match(app,/50억 코인/);assert.match(app,/weekly-premium-cube-status/);
  assert.match(read('admin/index.html'),/hyper-pack-v2076\.js/);assert.match(read('admin/hyper-pack-v2076.js'),/초안 저장 · 개봉 잠금 유지/);
});
