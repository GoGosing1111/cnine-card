import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {handleMercenaryCms} from '../functions/_mercenary_cms.js';
import {MERCENARY_CARD_OPENING_RELEASE_ENABLED} from '../functions/_mercenary_draw_cms.js';
import {DRAW_OUTCOMES,suggestedMercenaryDraw,validateMercenaryDraw,parseDrawPercent,summarizeMercenaryDraw} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_CARD_RULES,mercenaryGradePools,equalMercenaryCardChance} from '../shared/mercenary-draw-policy-v1.mjs';
import {pickMercenaryDraw,mercenaryRandomInt,mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {MERCENARY_CMS_SEED as seed} from '../functions/_mercenary_cms_seed.js';

const payload=(policy=suggestedMercenaryDraw(),expectedRevision=1,requestId=crypto.randomUUID())=>({policy,expectedRevision,requestId,reason:'확률 수량 1차 검토'});
async function fixture(mode='postgres'){
  const engine=mode==='postgres'?new PGlite():new DatabaseSync(':memory:');let calls=0,failAudit=false,failAcquisition=false;
  await engine.exec("CREATE TABLE users(id INTEGER,coin BIGINT);INSERT INTO users VALUES(1,12345);CREATE TABLE inventory(item TEXT,quantity INTEGER);INSERT INTO inventory VALUES('MERCENARY_CARD_PACK',3);CREATE TABLE mercenary_cms_documents_v1(doc_key TEXT,payload_json TEXT);INSERT INTO mercenary_cms_documents_v1 VALUES('config','{\"rank\":\"user-edited\"}');");
  const fault=sql=>{calls++;if(failAudit&&sql.startsWith('INSERT INTO mercenary_draw_audit_v1')&&!sql.includes('NULL'))throw Error('injected audit failure');if(failAcquisition&&sql.startsWith('INSERT INTO mercenary_card_acquisitions_v1'))throw Error('injected acquisition receipt failure');};
  let DB;
  if(mode==='postgres'){
    DB=new __postgresCompatTest.PostgresD1Database({async query(input){const sql=typeof input==='string'?input:input.text;fault(sql);const r=await engine.query(sql,typeof input==='string'?[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length};}});
  }else{
    const prepare=(sql,values=[])=>({sql,values,bind(...args){return prepare(sql,args);},async run(){fault(sql);return {meta:{changes:engine.prepare(sql).run(...values).changes}};},async all(){fault(sql);return {results:engine.prepare(sql).all(...values)};},async first(){fault(sql);return engine.prepare(sql).get(...values)||null;}});
    DB={dialect:'sqlite',prepare,async batch(statements){engine.exec('BEGIN');try{const out=[];for(const statement of statements){fault(statement.sql);const r=engine.prepare(statement.sql).run(...statement.values);out.push({meta:{changes:r.changes}});}engine.exec('COMMIT');return out;}catch(error){engine.exec('ROLLBACK');throw error;}}};
  }
  const env={DB},rows=async sql=>mode==='postgres'?(await engine.query(sql)).rows:JSON.parse(JSON.stringify(engine.prepare(sql).all()));
  const call=(body,options={})=>handleMercenaryCms({env,path:options.path||'admin/mercenaries/draw',request:new Request('https://qa.test/api/admin/mercenaries/draw',{method:options.method||(body?'PATCH':'GET'),...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),deps:{requirePermission:async()=>options.denied?null:{id:options.owner||1,role:options.role||'OWNER'},json:(body,status=200)=>({body,status})}});
  return {call,rows,DB,engine,failReceipt:()=>{failAcquisition=true;},fail:()=>{failAudit=true;},recover:()=>{failAudit=false;failAcquisition=false;},queryCount:()=>calls,close:()=>engine.close()};
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

test('legacy CMS edits survive fixed rule adoption; weighting, rerolls and duplicate conversion cannot be configured',()=>{
  const legacy=suggestedMercenaryDraw();delete legacy.cardRules;legacy.outcomes[0].chancePpm=90000;legacy.outcomes[8].chancePpm=598889;legacy.notes='운영자가 조정한 확률';
  const checked=validateMercenaryDraw(legacy);assert.deepEqual(checked.outcomes,legacy.outcomes);assert.equal(checked.notes,legacy.notes);assert.deepEqual(checked.cardRules,MERCENARY_CARD_RULES);
  for(const field of Object.keys(MERCENARY_CARD_RULES)){const policy=suggestedMercenaryDraw();policy.cardRules[field]='PREFER_UNOWNED';assert.throws(()=>validateMercenaryDraw(policy),/규칙/);}
  const extra=suggestedMercenaryDraw();extra.cardRules.cardWeights={'V-001':2};assert.throws(()=>validateMercenaryDraw(extra));
  const exact=equalMercenaryCardChance(1,3);assert.equal(exact.numerator,1);assert.equal(exact.denominator,3000000);assert.ok(exact.percent>0);assert.equal(equalMercenaryCardChance(100000,2).percent,5);assert.equal(equalMercenaryCardChance(1,0),null);
});

const rankedRoster=()=>seed.document.mercenaries.map((card,i)=>({...structuredClone(card),rank:card.code==='V-021'?'SSS':i<3?'C':['B','A','S','SS'][i%4]}));
test('every same-rank card gets exactly one slot, including owned copies and cards with other acquisition rates',()=>{
  const mercenaries=rankedRoster(),policy=suggestedMercenaryDraw(),codes=seed.catalog.cards.map(card=>card.code);
  for(const [i,card] of mercenaries.entries()){card.owned=i%2===0;card.duplicateCount=i*10;card.acquisition.dropRate=i?100:0;}
  const pool=mercenaryGradePools(mercenaries,codes).C,counts=Object.fromEntries(pool.map(code=>[code,0]));
  for(let repeat=0;repeat<3;repeat++)for(let index=0;index<pool.length;index++){
    const bounds=[],result=pickMercenaryDraw({policy,mercenaries,randomInt:max=>{bounds.push(max);return bounds.length===1?0:index;}});
    counts[result.mercenaryCode]++;assert.deepEqual(bounds,[1000000,pool.length]);assert.equal(result.quantity,1);
  }
  assert.deepEqual(Object.values(counts),pool.map(()=>3));
  const chosen=pickMercenaryDraw({policy,mercenaries,randomInt:()=>0}).mercenaryCode;
  assert.equal(pickMercenaryDraw({policy,mercenaries,randomInt:()=>0}).mercenaryCode,chosen,'same card can win on consecutive draws');
  const malformed=structuredClone(mercenaries);malformed[1].code=malformed[0].code;assert.throws(()=>pickMercenaryDraw({policy,mercenaries:malformed}));
  const unknown=structuredClone(mercenaries);unknown[0].code='V-999';assert.throws(()=>pickMercenaryDraw({policy,mercenaries:unknown}));
});
test('grade and resource interval boundaries retain exact saved rates; empty grades never reroll or turn into a loss',()=>{
  const policy=suggestedMercenaryDraw(),mercenaries=rankedRoster();let start=0;
  for(const row of policy.outcomes){
    for(const n of [start,start+row.chancePpm-1]){let calls=0;const result=pickMercenaryDraw({policy,mercenaries,randomInt:()=>calls++?0:n});assert.equal(result.outcomeId,row.id);assert.equal(result.quantity,row.quantity);assert.equal(calls,row.id.startsWith('CARD_')?2:1);}
    start+=row.chancePpm;
  }
  const missing=mercenaries.map(card=>({...card,rank:card.rank==='C'?'B':card.rank}));
  assert.throws(()=>pickMercenaryDraw({policy,mercenaries:missing,randomInt:()=>{throw Error('random must not start');}}),{code:'MERCENARY_RANK_POOL_EMPTY'});
});
test('server random sampling rejects modulo bias and invalid bounds',t=>{
  let calls=0;t.mock.method(crypto,'getRandomValues',buffer=>{buffer[0]=calls++?2:0xffffffff;return buffer;});
  assert.equal(mercenaryRandomInt(3),2);assert.equal(calls,2);assert.throws(()=>mercenaryRandomInt(0));
});
for(const mode of ['postgres','sqlite']){
  test(mode+': repeated wins count extra copies, preserve other cards, and request replay cannot add a duplicate',async()=>{
    const f=await fixture(mode);try{
      await f.call();const ids=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
      await f.DB.batch(ids.flatMap(acquisitionId=>mercenaryCardAcquisitionStatements(f.DB,{userId:1,mercenaryCode:'V-001',acquisitionId})));
      const record=(await f.rows('SELECT * FROM user_mercenary_cards_v1'))[0];assert.equal(Number(record.total_copies),3);assert.equal(Number(record.duplicate_count),2);
      const receipts=await f.rows('SELECT * FROM mercenary_card_acquisitions_v1 ORDER BY total_copies_after');assert.deepEqual(receipts.map(row=>Number(row.is_duplicate)),[0,1,1]);assert.deepEqual(receipts.map(row=>Number(row.duplicate_count_after)),[0,1,2]);
      await f.DB.batch(mercenaryCardAcquisitionStatements(f.DB,{userId:1,mercenaryCode:'V-001',acquisitionId:ids[0]}));
      assert.deepEqual((await f.rows('SELECT * FROM user_mercenary_cards_v1'))[0],record);
      await f.DB.batch(mercenaryCardAcquisitionStatements(f.DB,{userId:1,mercenaryCode:'V-002',acquisitionId:crypto.randomUUID()}));
      const holdings=await f.rows('SELECT * FROM user_mercenary_cards_v1 ORDER BY mercenary_code');assert.equal(Number(holdings[0].duplicate_count),2);assert.equal(Number(holdings[1].duplicate_count),0);
      await f.DB.prepare('INSERT INTO users VALUES(2,12345)').run();
      for(const [userId,mercenaryCode] of [[1,'V-002'],[2,'V-001']])await assert.rejects(f.DB.batch(mercenaryCardAcquisitionStatements(f.DB,{userId,mercenaryCode,acquisitionId:ids[0]})));
      assert.deepEqual(await f.rows('SELECT * FROM user_mercenary_cards_v1 ORDER BY mercenary_code'),holdings);
    }finally{await f.close();}
  });
  test(mode+': receipt failure and zero-row receipts roll back the whole transaction including pack consumption',async()=>{
    const f=await fixture(mode);try{
      await f.call();const body={userId:1,mercenaryCode:'V-001',acquisitionId:crypto.randomUUID()},statements=()=>[f.DB.prepare('UPDATE inventory SET quantity=quantity-1'),...mercenaryCardAcquisitionStatements(f.DB,body)];
      f.failReceipt();await assert.rejects(f.DB.batch(statements()),/receipt failure/);f.recover();assert.equal((await f.rows('SELECT quantity FROM inventory'))[0].quantity,3);assert.equal((await f.rows('SELECT * FROM user_mercenary_cards_v1')).length,0);
      if(mode==='postgres')await f.engine.exec('CREATE FUNCTION reject_mercenary_receipt() RETURNS trigger AS $$BEGIN RETURN NULL;END;$$ LANGUAGE plpgsql; CREATE TRIGGER zero_receipt BEFORE INSERT ON mercenary_card_acquisitions_v1 FOR EACH ROW EXECUTE FUNCTION reject_mercenary_receipt();');
      else f.engine.exec("CREATE TRIGGER zero_receipt BEFORE INSERT ON mercenary_card_acquisitions_v1 BEGIN SELECT RAISE(IGNORE); END");
      await assert.rejects(f.DB.batch(statements()));assert.equal((await f.rows('SELECT quantity FROM inventory'))[0].quantity,3);assert.equal((await f.rows('SELECT * FROM user_mercenary_cards_v1')).length,0);assert.equal((await f.rows('SELECT * FROM mercenary_card_atomic_guard_v1')).length,0);
    }finally{await f.close();}
  });
}
test('PostgreSQL simultaneous wins and identical retries have exact duplicate counts',async()=>{
  const f=await fixture();try{
    await f.call();const id=crypto.randomUUID(),grant=acquisitionId=>f.DB.batch(mercenaryCardAcquisitionStatements(f.DB,{userId:1,mercenaryCode:'V-001',acquisitionId}));
    await Promise.all([grant(id),grant(id),grant(crypto.randomUUID()),grant(crypto.randomUUID())]);
    const row=(await f.rows('SELECT * FROM user_mercenary_cards_v1'))[0];assert.equal(Number(row.total_copies),3);assert.equal(Number(row.duplicate_count),2);assert.equal((await f.rows('SELECT * FROM mercenary_card_acquisitions_v1')).length,3);
  }finally{await f.close();}
});
