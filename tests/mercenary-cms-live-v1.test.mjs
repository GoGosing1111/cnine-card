import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
import {validateMercenaryCms} from '../shared/mercenary-cms-model-v1.mjs';
import {MERCENARY_POWER_STANDARD} from '../shared/equipment-mercenary-power-v1.mjs';
const clone=structuredClone;
async function fixture(){
  const pg=new PGlite();let fail='',calls=0;
  await pg.exec(`CREATE TABLE users(id BIGINT,coin BIGINT);INSERT INTO users VALUES(1,12345);
    CREATE TABLE decks(user_id BIGINT,card_ids TEXT,mercenary_code TEXT);INSERT INTO decks VALUES(1,'[1,2,3,4,5]',NULL);`);
  const client={async query(input){calls++;const sql=typeof input==='string'?input:input.text;if(fail&&sql.includes(fail))throw Error('injected audit failure');const r=await pg.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}};
  const env={DB:new __postgresCompatTest.PostgresD1Database(client)};
  const call=(body,options={})=>handleMercenaryCms({env,path:options.path||'admin/mercenaries',request:new Request('https://qa.test/api/admin/mercenaries',{method:options.method||(body?'PATCH':'GET'),...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),deps:{requirePermission:async()=>options.denied?null:{id:options.owner||1,role:options.role||'OWNER'},json:(body,status=200)=>({body,status})}});
  return{pg,call,env,rows:async sql=>(await pg.query(sql)).rows,failOn:s=>{fail=s;},queryCount:()=>calls,close:()=>pg.close()};
}
const payload=(document=clone(seed.document),expectedRevision=1,requestId=crypto.randomUUID())=>({document,expectedRevision,requestId});
test('canonical registration contains every mercenary, independent skill and original/SD reference',()=>{
  validateMercenaryCms(seed.document,seed.catalog);
  assert.equal(seed.catalog.cards.length,43);assert.equal(seed.document.skills.length,17);assert.equal(seed.catalog.effects.frameCount,272);
  assert.equal(seed.document.mercenaries.filter(r=>r.rank===null).length,42);
  assert.equal(seed.document.mercenaries.find(r=>r.code==='V-021').rank,'SSS');
  assert.ok(seed.document.assignments.every(r=>r.skillIds.length===0));
  for(const c of seed.catalog.cards){assert.notEqual(c.sourceArt,c.battleSprite);assert.ok(existsSync(new URL('../'+c.sourceArt,import.meta.url)));assert.ok(existsSync(new URL('../'+c.battleSprite,import.meta.url)));}
  assert.equal(seed.catalog.formation.regularCardSlots,5);assert.equal(seed.catalog.formation.mercenarySlots,1);
  assert.deepEqual(seed.catalog.release,{group:'V3_MERCENARY_EQUIPMENT',acquisitionEnabled:false,formationEnabled:false,battleEnabled:false});
});
test('unprivileged routes and methods never touch the CMS database',async()=>{
  const f=await fixture();try{
    for(const options of [{denied:true},{role:'ADMIN'},{role:'CARD_MANAGER'},{role:'SUPPORT'}])assert.equal((await f.call(null,options)).status,403);
    assert.equal((await f.call(null,{method:'DELETE'})).status,405);assert.equal(await f.call(null,{path:'mercenaries'}),null);assert.equal(f.queryCount(),0);
  }finally{await f.close();}
});
test('PostgreSQL registers once, persists complete configuration and never changes wallet or formation',async()=>{
  const f=await fixture();try{
    const first=await f.call();assert.equal(first.status,200);assert.equal(first.body.revision,1);assert.equal(first.body.audit.length,1);
    const d=first.body.document;d.mercenaries[0].rank='A';d.mercenaries[0].stats.attack=700;d.mercenaries[0].acquisition={type:'QUEST',source:'최종 검수 퀘스트',coinPrice:null,dropRate:12.5};
    d.assignments[0].skillIds=['MS-021','MS-003'];d.assignments[1].skillIds=['MS-021'];d.skills[0].balance.damageRatio=2.5;d.settings.rankGrowth[0].maxLevel=30;
    const saved=await f.call(payload(d));assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.body.revision,2);
    const read=await f.call();assert.deepEqual(read.body.document,d);assert.equal(read.body.audit.length,2);assert.equal(read.body.catalog.cards.length,43);
    assert.deepEqual(read.body.powerStandard,MERCENARY_POWER_STANDARD);assert.equal(read.body.powerStandard.basePowerByRank.SS,120000);assert.equal(read.body.document.runtimeEnabled,false);
    assert.equal((await f.rows('SELECT * FROM mercenary_cms_documents_v1')).length,2);
    assert.deepEqual(await f.rows('SELECT * FROM users'),[{id:1,coin:12345}]);assert.deepEqual(await f.rows('SELECT * FROM decks'),[{user_id:1,card_ids:'[1,2,3,4,5]',mercenary_code:null}]);
  }finally{await f.close();}
});
test('stale changes conflict, same-request retries replay and different content cannot reuse a receipt',async()=>{
  const f=await fixture();try{
    await f.call();const body=payload();body.document.mercenaries[0].name='저장된 이름';
    assert.equal((await f.call(body)).status,200);
    const retry=await f.call(body);assert.equal(retry.body.replayed,true);assert.equal(retry.body.revision,2);
    assert.equal((await f.call({...body,document:clone(seed.document)})).status,409);
    assert.equal((await f.call(body,{owner:2})).status,409);
    assert.equal((await f.call(payload())).status,409);
    assert.equal((await f.call()).body.document.mercenaries[0].name,'저장된 이름');
    assert.equal((await f.rows('SELECT * FROM mercenary_cms_audit_v1')).length,2);
  }finally{await f.close();}
});
test('audit failure rolls back configuration, and retry completes once',async()=>{
  const f=await fixture();try{
    await f.call();const body=payload();body.document.mercenaries[0].notes='atomic edit';
    // Ensure the injected fault targets SAVE, not the idempotent registration transaction.
    f.failOn("'SAVE'");await assert.rejects(f.call(body),/injected/);f.failOn('');
    assert.equal((await f.call()).body.revision,1);assert.equal((await f.call()).body.document.mercenaries[0].notes,'');
    assert.equal((await f.call(body)).body.revision,2);
  }finally{await f.close();}
});
test('concurrent saves against the same revision produce one winner and one audit',async()=>{
  const f=await fixture();try{
    await f.call();const a=payload(),b=payload();a.document.mercenaries[0].notes='first';b.document.mercenaries[0].notes='second';
    const result=await Promise.all([f.call(a),f.call(b)]);
    assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);
    assert.equal((await f.call()).body.revision,2);assert.equal((await f.rows("SELECT * FROM mercenary_cms_audit_v1 WHERE action='SAVE'")).length,1);
  }finally{await f.close();}
});
test('unknown fields, ranks, missing entries, automatic skill owners and runtime flags are rejected',async()=>{
  const f=await fixture();try{
    const mutations=[d=>d.runtimeEnabled=true,d=>d.status='APPROVED',d=>d.extra=true,d=>d.mercenaries.pop(),d=>d.mercenaries[1]=d.mercenaries[0],d=>d.mercenaries[20].rank='SS',d=>d.mercenaries[0].rank='UR',d=>d.mercenaries[0].sourceArt='/changed.png',d=>d.mercenaries[0].role='__proto__',d=>d.mercenaries[0].stats.attack=-1,d=>d.mercenaries[0].acquisition.dropRate=101,d=>d.mercenaries[0].growth.maxLevel=0,d=>d.skills[0].code='V-021',d=>d.skills[0].balance.cost=-1,d=>d.assignments[0].skillIds=['MS-999'],d=>d.assignments[0].skillIds=['MS-021','MS-021'],d=>d.settings.acquisitionEnabled=true,d=>d.settings.rankGrowth[1]=d.settings.rankGrowth[0]];
    for(const change of mutations){const d=clone(seed.document);change(d);assert.equal((await f.call(payload(d))).status,400,String(change));}
    assert.equal((await f.call('{bad')).status,400);assert.equal((await f.call(payload(seed.document,0))).status,400);
    assert.equal((await f.call('x'.repeat(512*1024+1))).status,400);assert.equal(f.queryCount(),0);
  }finally{await f.close();}
});
test('API and CMS navigation are connected without gameplay imports',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(read('functions/api/[[path]].js'),/handleMercenaryCms\(\{path,request,env,deps:\{requirePermission,json\}\}\)/);
  assert.match(read('admin/index.html'),/mercenary-admin-v1\.js\?v=20260912-power1/);
  assert.match(read('admin/mercenary-admin-v1.js'),/badge.textContent.trim\(\)!=='OWNER'/);
  for(const path of ['index.html','js/app.js','js/battle-v3-live.js'])assert.doesNotMatch(read(path),/mercenary-cms|mercenary-admin-v1/);
});
