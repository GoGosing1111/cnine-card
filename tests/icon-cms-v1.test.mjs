import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {iconCmsFixture} from './helpers/icon-cms-fixture.mjs';
import {emptyIconCmsDocument,ICON_CMS_KEY,ICON_CMS_LOCKS} from '../shared/icon-cms-model-v1.mjs';
import {ICON_CMS_CATALOG} from '../shared/icon-cms-catalog-v1.mjs';
const body=(document=emptyIconCmsDocument(),expectedRevision=1,requestId=crypto.randomUUID())=>({document,expectedRevision,requestId});
const read=path=>fs.readFile(new URL('../'+path,import.meta.url),'utf8');

test('OWNER guard rejects unauthorized, unsupported and public routes before any database work',async()=>{
  const f=await iconCmsFixture();try{
    for(const options of [{denied:true},{role:'ADMIN'},{role:'USER'},{role:'SUPPORT'}])assert.equal((await f.call(null,options)).status,403);
    assert.equal((await f.call(null,{method:'POST'})).status,405);assert.equal(await f.call(null,{path:'icons'}),null);assert.equal(f.count(),0);
  }finally{await f.close();}
});
test('registration is idempotent; steady read costs one indexed query and successful save costs two',async()=>{
  const f=await iconCmsFixture();try{
    const initial=await f.call();assert.equal(initial.status,200);assert.equal(initial.body.catalog.length,7);assert.equal(initial.body.revision,1);assert.equal(f.count(),3);
    const before=f.count(),start=performance.now();for(let i=0;i<20;i++)assert.equal((await f.call()).status,200);
    assert.equal(f.count()-before,20);console.log('ICON CMS fixture: 20 indexed GETs in '+(performance.now()-start).toFixed(1)+'ms (local PostgreSQL, excludes production auth/network)');
    const doc=initial.body.document;doc.cards[4].notes='꽃잎 충돌 검수';doc.cards[4].draft.effects[0].value=12.5;
    const count=f.count(),saved=await f.call(body(doc));assert.equal(saved.status,200);assert.equal(f.count()-count,2);assert.equal(saved.body.revision,2);assert.deepEqual(saved.body.document,doc);
    assert.equal(saved.headers.get('cache-control'),'private, no-store');assert.deepEqual(saved.body.locks,ICON_CMS_LOCKS);
    assert.equal((await f.pg.query('SELECT key FROM app_meta')).rows.length,1);
    assert.deepEqual((await f.pg.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map(r=>r.table_name),['app_meta']);
  }finally{await f.close();}
});
test('same request retries return one receipt; reused IDs and stale revisions cannot overwrite',async()=>{
  const f=await iconCmsFixture();try{
    const request=body();request.document.cards[0].notes='저장';assert.equal((await f.call(request)).status,200);
    assert.equal((await f.call(request)).body.replayed,true);
    assert.equal((await f.call({...request,document:emptyIconCmsDocument()})).body.code,'REQUEST_ID_CONFLICT');
    assert.equal((await f.call(request,{owner:2})).status,409);assert.equal((await f.call(body())).body.code,'REVISION_CONFLICT');
    const state=(await f.call()).body;assert.equal(state.revision,2);assert.equal(state.audit.length,1);assert.equal(state.document.cards[0].notes,'저장');
  }finally{await f.close();}
});
test('concurrent different saves have one winner; concurrent identical retries save exactly once',async()=>{
  const f=await iconCmsFixture();try{
    await f.call();const a=body(),b=body();a.document.cards[0].notes='A';b.document.cards[0].notes='B';
    const pair=await Promise.all([f.call(a),f.call(b)]);assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
    const current=(await f.call()).body,next=body(current.document,2);next.document.cards[2].notes='C';
    const duplicate=await Promise.all([f.call(next),f.call(next)]);assert.deepEqual(duplicate.map(r=>r.status),[200,200]);
    const final=(await f.call()).body;assert.equal(final.revision,3);assert.equal(final.audit.length,2);
  }finally{await f.close();}
});
test('write failure preserves document and receipt together; retry succeeds',async()=>{
  const f=await iconCmsFixture();try{
    await f.call();const request=body();request.document.cards[0].notes='atomic';f.fail(true);assert.equal((await f.call(request)).status,503);f.fail(false);
    const before=(await f.call()).body;assert.equal(before.revision,1);assert.equal(before.audit.length,0);assert.equal(before.document.cards[0].notes,'');
    assert.equal((await f.call(request)).body.revision,2);
  }finally{await f.close();}
});
test('public/evolution/acquisition/battle switches, missing cards, unknown cards and oversized input are rejected before reads',async()=>{
  const f=await iconCmsFixture();try{
    const mutations=[d=>d.publicCodexEnabled=true,d=>d.battleEnabled=true,d=>d.acquisitionEnabled=true,d=>d.evolutionEnabled=true,d=>d.evolutionStatus='READY',d=>d.visibility='PUBLIC',d=>d.cards.pop(),d=>d.cards[1]=d.cards[0],d=>d.cards[0].code='ICON-FAKE',d=>d.cards[0].notes='x'.repeat(1201),d=>d.cards[0].draft.releaseEnabled=true,d=>d.cards[0].draft.effects[0].value=501,d=>d.cards[0].sourceArt='/x.png',d=>d.extra=1];
    for(const change of mutations){const doc=emptyIconCmsDocument();change(doc);assert.equal((await f.call(body(doc))).status,400,String(change));}
    assert.equal((await f.call('{bad')).status,400);assert.equal((await f.call(' '.repeat(32769))).status,400);assert.equal(f.count(),0);
  }finally{await f.close();}
});
test('malformed stored ON state fails closed rather than becoming a live policy',async()=>{
  const f=await iconCmsFixture();try{
    await f.call();const stored=JSON.parse((await f.pg.query('SELECT value FROM app_meta WHERE key=$1',[ICON_CMS_KEY])).rows[0].value);stored.document.publicCodexEnabled=true;
    await f.pg.query('UPDATE app_meta SET value=$1 WHERE key=$2',[JSON.stringify(stored),ICON_CMS_KEY]);assert.equal((await f.call()).status,503);
  }finally{await f.close();}
});
test('seven original portraits and SDs stay separate; every character has a distinct hit and skill',async()=>{
  const manifest=JSON.parse(await read('preview/icon-battle-assets-v1/manifest.json'));
  assert.equal(ICON_CMS_CATALOG.length,7);assert.equal(new Set(ICON_CMS_CATALOG.flatMap(c=>c.effects.map(e=>e.id))).size,14);
  for(const card of ICON_CMS_CATALOG){assert.notEqual(card.sourceArt,card.battleSprite);await fs.access(new URL('../'+card.battleSprite,import.meta.url));assert.equal(card.effects.length,2);for(const effect of card.effects){assert.equal(effect.frameCount,16);assert.ok(manifest.effects.find(e=>e.id===effect.id));}}
});
test('only CMS imports are wired; user entry/catalog/gameplay and legacy grades do not expose ICON',async()=>{
  const api=await read('functions/api/[[path]].js'),admin=await read('admin/index.html'),ui=await read('admin/icon-admin-v1.mjs');
  assert.match(api,/handleIconCms\(\{path,request,env,deps:\{requirePermission,json\}\}\)/);assert.match(admin,/icon-admin-v1.mjs\?v=20260927/);
  for(const path of ['index.html','js/app.js','functions/_magic.js','service-worker.js','js/battle-v3-live.js'])assert.doesNotMatch(await read(path),/icon-cms|icon-admin|icon-card-roster|icon-battle-assets/);
  assert.match(ui,/role.textContent.trim\(\)!=='OWNER'/);assert.doesNotMatch(ui,/setInterval|Promise.all/);
  assert.match(ui,/pending=\{requestId:crypto.randomUUID/);assert.match(ui,/body:JSON.stringify\(pending\)/);assert.match(ui,/closePlayback/);
});
