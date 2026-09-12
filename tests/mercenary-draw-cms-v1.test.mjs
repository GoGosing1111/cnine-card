import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
import {MERCENARY_CARD_OPENING_RELEASE_ENABLED} from '../functions/_mercenary_draw_cms.js';
import {DRAW_OUTCOMES,suggestedMercenaryDraw,validateMercenaryDraw,parseDrawPercent,summarizeMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';

const payload=(policy=suggestedMercenaryDraw(),expectedRevision=1,requestId=crypto.randomUUID())=>({policy,expectedRevision,requestId,reason:'확률 수량 1차 검토'});
async function fixture(mode='postgres'){
  const engine=mode==='postgres'?new PGlite():new DatabaseSync(':memory:');let calls=0,failAudit=false;
  await engine.exec("CREATE TABLE users(id INTEGER,coin BIGINT);INSERT INTO users VALUES(1,12345);CREATE TABLE inventory(item TEXT,quantity INTEGER);INSERT INTO inventory VALUES('MERCENARY_CARD_PACK',3);CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT,payload_json TEXT);INSERT INTO mercenary_cms_documents_v1 VALUES('config','{\"rank\":\"user-edited\"}');");
  const fault=sql=>{calls++;if(failAudit&&sql.startsWith('INSERT INTO mercenary_draw_audit_v1')&&!sql.includes('NULL'))throw Error('injected audit failure');};
  let DB;
  if(mode==='postgres'){
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;fault(sql);const r=await engine.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else{
    const prepare=(sql,values=[])=>({sql,values,bind(...args){return prepare(sql,args);},async run(){fault(sql);return {meta:{changes:engine.prepare(sql).run(...values).changes}};},async all(){fault(sql);return {results:engine.prepare(sql).all(...values)};},async first(){fault(sql);return engine.prepare(sql).get(...values)||null;}});
    DB={dialect:'sqlite',prepare,async batch(statements){engine.exec('BEGIN');try{const out=[];for(const statement of statements){fault(statement.sql);const r=engine.prepare(statement.sql).run(...statement.values);out.push({meta:{changes:r.changes}});}engine.exec('COMMIT');return out;}catch(error){engine.exec('ROLLBACK');throw error;}}};
  }
  const env={DB},rows=async sql=>mode==='postgres'?(await engine.query(sql)).rows:JSON.parse(JSON.stringify(engine.prepare(sql).all()));
  const call=(body,options={})=>handleMercenaryCms({env,path:options.path||'admin/mercenaries/draw',request:new Request('https://qa.test/api/admin/mercenaries/draw',{method:options.method||(body?'PATCH':'GET'),...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),deps:{requirePermission:async()=>options.denied?null:{id:options.owner||1,role:options.role||'OWNER'},json:(body,status=200)=>({body,status})}});
  return {call,rows,DB,fail:()=>{failAudit=true;},recover:()=>{failAudit=false;},queryCount:()=>calls,close:()=>engine.close()};
}
test('proposal has four reward kinds, six grades, exact 100% and no enabled opening',()=>{
  const draft=validateMercenaryDraw(suggestedMercenaryDraw());
  assert.deepEqual([...new Set(DRAW_OUTCOMES.map(row=>row.type))],['MERCENARY_CARD','MASTER_STAR','MYSTIC_ENERGY','NONE']);
  assert.deepEqual(summarizeMercenaryDraw(draft).groups,{MERCENARY_CARD:111111,MASTER_STAR:100000,MYSTIC_ENERGY:200000,NONE:588889});
  assert.equal(summarizeMercenaryDraw(draft).total,1000000);assert.equal(draft.openingEnabled,false);assert.equal(MERCENARY_CARD_OPENING_RELEASE_ENABLED,false);
  assert.equal(draft.outcomes.find(row=>row.id==='CARD_SSS').chancePpm,1);
  assert.deepEqual(draft.outcomes.filter(row=>row.id.startsWith('CARD_')).map(row=>row.chancePpm),[100000,10000,1000,100,10,1]);
  for(const [input,expected] of [['0',0],['0.0001',1],['0.02',200],['16',160000],['100',1000000],['0.00001',null],['100.0001',null],['-1',null],['1e2',null],['',null]])assert.equal(parseDrawPercent(input),expected,input);
});
test('malformed outcomes, fractional quantities, invalid totals, rank tampering and all ON flags are rejected',()=>{
  const mutations=[d=>d.openingEnabled=true,d=>d.status='LIVE',d=>d.extra=true,d=>d.outcomes.pop(),d=>d.outcomes[1]=d.outcomes[0],d=>d.outcomes[0].id='CARD_UR',d=>d.outcomes[0].rank='SSS',d=>d.outcomes[0].chancePpm=-1,d=>d.outcomes[0].chancePpm=1.5,d=>d.outcomes[0].chancePpm=null,d=>d.outcomes[0].chancePpm+=1,d=>d.outcomes[0].quantity=2,d=>d.outcomes[6].quantity=0,d=>d.outcomes[7].quantity=1.5,d=>d.outcomes[8].quantity=1,d=>d.notes='x'.repeat(2001)];
  for(const change of mutations){const draft=suggestedMercenaryDraw();change(draft);assert.throws(()=>validateMercenaryDraw(draft),undefined,String(change));}
});
test('unprivileged and malformed requests never access DB; direct and batch opening remain OFF',async()=>{
  const f=await fixture();try{
    for(const options of [{denied:true},{role:'ADMIN'},{role:'USER'}])assert.equal((await f.call(null,options)).status,403);
    assert.equal((await f.call(null,{method:'DELETE'})).status,405);
    const bad=payload();bad.policy.openingEnabled=true;assert.equal((await f.call(bad)).status,400);
    assert.equal((await f.call('x'.repeat(24*1024+1))).status,400);
    assert.equal((await f.call('{bad')).status,400);
    for(const path of ['mercenary-cards/open','mercenary-cards/open-batch']){const result=await f.call({openingEnabled:true},{path,method:'POST'});assert.equal(result.status,409);assert.equal(result.body.userOpeningEnabled,false);}
    assert.equal((await f.call(null,{path:'mercenary-cards/feature'})).body.userOpeningEnabled,false);
    assert.equal(f.queryCount(),0);
  }finally{await f.close();}
});
for(const mode of ['postgres','sqlite']){
  test(mode+': persists policy, audits before/after and preserves catalog, wallet and pack quantity',async()=>{
    const f=await fixture(mode);try{
      const first=await f.call();assert.equal(first.body.revision,1);assert.equal(first.body.audit.length,1);
      const policy=first.body.policy;policy.outcomes[0].chancePpm=90000;policy.outcomes[8].chancePpm=598889;policy.outcomes[6].quantity=2;
      const saved=await f.call(payload(policy));assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.body.revision,2);
      const read=await f.call();assert.deepEqual(read.body.policy,policy);assert.equal(read.body.userOpeningEnabled,false);
      const audit=await f.rows('SELECT * FROM mercenary_draw_audit_v1 ORDER BY revision');assert.equal(audit.length,2);assert.deepEqual(JSON.parse(audit[1].before_json),suggestedMercenaryDraw());assert.deepEqual(JSON.parse(audit[1].after_json),policy);
      assert.equal(Number((await f.rows('SELECT coin FROM users'))[0].coin),12345);assert.equal((await f.rows('SELECT quantity FROM inventory'))[0].quantity,3);
      assert.equal((await f.rows('SELECT payload_json FROM mercenary_cms_documents_v1'))[0].payload_json,'{"rank":"user-edited"}');
    }finally{await f.close();}
  });
  test(mode+': optimistic concurrency, idempotent retry and payload conflict',async()=>{
    const f=await fixture(mode);try{
      await f.call();const body=payload();assert.equal((await f.call(body)).status,200);
      assert.equal((await f.call(body)).body.replayed,true);
      assert.equal((await f.call(payload())).status,409);
      assert.equal((await f.call({...body,reason:'다른 저장 사유'})).status,409);
      assert.equal((await f.call(body,{owner:2})).status,409);
      assert.equal((await f.rows('SELECT * FROM mercenary_draw_audit_v1')).length,2);
    }finally{await f.close();}
  });
  test(mode+': audit failure rolls back the edited policy; retry stores once',async()=>{
    const f=await fixture(mode);try{
      await f.call();const body=payload();body.policy.outcomes[6].quantity=8;f.fail();await assert.rejects(f.call(body),/injected/);f.recover();
      assert.equal((await f.call()).body.revision,1);assert.equal((await f.call()).body.policy.outcomes[6].quantity,1);
      assert.equal((await f.call(body)).body.revision,2);
      await f.DB.prepare("UPDATE mercenary_draw_config_v1 SET payload_json=? WHERE id=1").bind(JSON.stringify({...body.policy,openingEnabled:true})).run();
      assert.equal((await f.call({}, {path:'mercenary-cards/open',method:'POST'})).body.userOpeningEnabled,false);
    }finally{await f.close();}
  });
}
test('two simultaneous PostgreSQL changes have one winner',async()=>{
  const f=await fixture();try{await f.call();const a=payload(),b=payload();a.policy.notes='first';b.policy.notes='second';assert.deepEqual((await Promise.all([f.call(a),f.call(b)])).map(row=>row.status).sort(),[200,409]);assert.equal((await f.rows('SELECT * FROM mercenary_draw_audit_v1')).length,2);}finally{await f.close();}
});
test('CMS assets are connected and user gameplay has no draw implementation',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(read('admin/index.html'),/mercenary-draw-admin-v1.css/);
  assert.match(read('admin/mercenary-admin-v1.js'),/createMercenaryDrawEditor/);
  for(const path of ['index.html','js/app.js','js/battle-v3-live.js'])assert.doesNotMatch(read(path),/mercenary-draw-policy|mercenary-cards\/open/);
});
