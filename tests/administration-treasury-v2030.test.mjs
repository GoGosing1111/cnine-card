import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleAdministrationTreasury,activePredictionSubsidy,predictionSubsidyFinalizationStatements} from '../functions/_administration_treasury.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('retired treasury rejects reads, submissions and decisions before any authentication or DB access',async()=>{
  const forbidden=new Proxy({},{get(){throw Error('retired treasury touched runtime');}});
  for(const path of ['administration/treasury','administration/treasury/state','administration/treasury/proposals','administration/treasury/decision']){
    for(const method of ['GET','POST','PATCH','DELETE']){
      const response=await handleAdministrationTreasury({path,request:{method},env:forbidden,deps:{json:(body,status)=>({body,status}),authenticate:forbidden,readBody:forbidden}});
      assert.equal(response.status,410);assert.equal(response.body.code,'TREASURY_RETIRED');
    }
  }
});

test('all four sales paths retain purchases with no tax schema or collection hook',()=>{
  for(const file of ['functions/api/[[path]].js','functions/_prime_draw.js','functions/_avatar.js','functions/_superstar_pack.js']){
    assert.doesNotMatch(read(file),/shopTaxStatements|ensureAdministrationTreasuryFoundation|administration_tax_receipts/,file);
  }
  const backend=read('functions/_administration_treasury.js');
  assert.doesNotMatch(backend,/CREATE TABLE|SHOP_TAX|submitProposal|decideProposal/);
  for(const file of ['js/app.js','js/soopketmon-v21-exact-shell-adapter.js','js/soopketmon-v21-runtime-router.js']){
    assert.doesNotMatch(read(file),/data-tab="treasury"|treasury:\s*\{|treasury:\s*Object\.freeze|administration-treasury-v2030/);
  }
});

test('previously approved prediction support remains readable and refunds only once',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE administration_treasury_v2030(id INTEGER PRIMARY KEY,balance INTEGER,total_refunded INTEGER,version INTEGER,updated_at TEXT);
    INSERT INTO administration_treasury_v2030 VALUES(1,1000,0,0,NULL);
    CREATE TABLE administration_prediction_subsidies_v2030(proposal_id TEXT PRIMARY KEY,event_id INTEGER,amount INTEGER,status TEXT,updated_at TEXT);
    INSERT INTO administration_prediction_subsidies_v2030 VALUES('old-approval',7,300,'ACTIVE',NULL);
    CREATE TABLE administration_treasury_ledger_v2030(reference_key TEXT PRIMARY KEY,entry_type TEXT,amount INTEGER,balance_after INTEGER,source_type TEXT,source_request_id TEXT,memo TEXT);`);
  const env={DB:{prepare(sql){return {bind(...values){return {first:async()=>db.prepare(sql).get(...values),run:()=>db.prepare(sql).run(...values)}}}}}};
  try{
    assert.equal(await activePredictionSubsidy(env,7),300);
    const refund=()=>{
      db.exec('BEGIN');try{for(const statement of predictionSubsidyFinalizationStatements(env,{eventId:7,voided:true,amount:300}))statement.run();db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
    };
    refund();refund();
    assert.equal(await activePredictionSubsidy(env,7),0);
    assert.equal(db.prepare('SELECT balance FROM administration_treasury_v2030').get().balance,1300);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM administration_treasury_ledger_v2030').get().n,1);
    assert.equal(db.prepare('SELECT status FROM administration_prediction_subsidies_v2030').get().status,'REFUNDED');
  }finally{db.close();}
});
