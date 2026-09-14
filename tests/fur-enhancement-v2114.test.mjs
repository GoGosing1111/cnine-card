import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {breakthroughPityRule} from '../functions/_breakthrough_pity.js';
import {extendFurHighBreakthrough,furExtendedReady,furExtendedStepAvailable,FUR_EXTENDED_STEPS,FUR_MAX_ENHANCEMENT} from '../functions/_fur_enhancement_v2114.js';

const api=fs.readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const start=api.indexOf("if(path==='card/breakthrough'&&request.method==='POST')");
const end=api.indexOf("\n    if(path==='raid/status')",start);
assert.ok(start>0&&end>start);
const route=api.slice(start,end);
const base={enabled:true,steps:[
  {cost:200,duplicateCards:1,rate:35,pityThreshold:3,uniqueBoostPercent:30,retirementShardRefund:6000},
  {cost:400,duplicateCards:1,rate:25,pityThreshold:4,uniqueBoostPercent:60,retirementShardRefund:8000},
  {cost:800,duplicateCards:1,rate:15,pityThreshold:6,uniqueBoostPercent:100,retirementShardRefund:10000}
]};
// Growth values below are fixtures only, never operating defaults.
const readyConfig=()=>extendFurHighBreakthrough(base,{extendedEnabled:true,steps:[...base.steps,
  {...FUR_EXTENDED_STEPS[0],powerBonusPercent:3200,uniqueBoostPercent:150,retirementShardRefund:12000},
  {...FUR_EXTENDED_STEPS[1],powerBonusPercent:4000,uniqueBoostPercent:200,retirementShardRefund:15000}]});
const schema=`
CREATE TABLE users(id INTEGER PRIMARY KEY,card_shards BIGINT DEFAULT 0);
CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER,breakthrough_fail_count INTEGER,PRIMARY KEY(user_id,card_id));
CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,rarity TEXT,title TEXT);
CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity BIGINT,unseen_quantity BIGINT DEFAULT 0,updated_at TEXT,PRIMARY KEY(user_id,item_code));
CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
CREATE TABLE card_material_logs_v1802(id INTEGER PRIMARY KEY,user_id INTEGER,card_id TEXT,grade TEXT,level INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT);
INSERT INTO users VALUES(1,0);
`;
async function fixture(dialect='sqlite',{level=13,failCount=0,quantity=100,stars=2000000,grade='FUR',config=readyConfig(),random=.99}={}){
  let DB,close,ddl;
  if(dialect==='postgres'){
    const pg=new PGlite();
    await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;");
    await pg.exec(schema.replace('id INTEGER PRIMARY KEY,user_id','id SERIAL PRIMARY KEY,user_id'));
    const client={async query(input){const result=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?[]:input.values||[]);return {...result,rowCount:result.affectedRows??result.rows.length};}};
    DB=new __postgresCompatTest.PostgresD1Database(client);close=()=>pg.close();ddl=sql=>pg.exec(sql);
  }else{
    const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
    class Statement{
      constructor(sql,args=[]){this.sql=sql;this.args=args;}
      bind(...args){return new Statement(this.sql,args);}
      first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
      all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}
      run(){return {meta:{changes:Number(sqlite.prepare(this.sql).run(...this.args).changes)}};}
    }
    DB={prepare:sql=>new Statement(sql),batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(s=>s.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
    close=()=>sqlite.close();ddl=sql=>sqlite.exec(sql);
  }
  const run=(sql,...args)=>DB.prepare(sql).bind(...args).run();
  await run('INSERT INTO cards_effective_v1210 VALUES(?,?,?)','CARD',grade,'검수 카드');
  await run('INSERT INTO user_cards VALUES(?,?,?,?,?)',1,'CARD',quantity,level,failCount);
  await run('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?)',1,'MASTER_STAR',stars,stars);
  const context={FUR_MAX_ENHANCEMENT,HIGH_BREAKTHROUGH_GRADES:['MA','LIMITED','FUR','ZENITH','SUPERSTAR'],ALL_LEVEL_MASTER_STAR_GRADES:['ZENITH','SUPERSTAR'],ORDER:{SR:4,MA:8,FUR:11,ZENITH:12,SUPERSTAR:13},BREAKTHROUGH_MIN_ORDER:4,
    authenticate:async()=>({id:1}),readBody:async()=>({cardId:'CARD'}),json:(body,status=200)=>({body,status}),
    highBreakthroughConfigFor:async()=>config,furExtendedStepAvailable,breakthroughPity:async()=>({}),breakthroughPityRule,
    profile:async(_env,user)=>user,breakthroughCinematicFor:async()=>null,console,
    Math:Object.assign(Object.create(Math),{random:()=>random})
  };
  vm.createContext(context);
  vm.runInContext(api.match(/^function highBreakthroughStepPity[^\n]+/m)[0],context);
  const execute=vm.runInContext('(async function(path,request,env){'+route+'})',context);
  const call=()=>execute('card/breakthrough',{method:'POST'},{DB});
  const snapshot=async()=>({
    card:await DB.prepare('SELECT quantity,breakthrough_level,breakthrough_fail_count FROM user_cards').first(),
    stars:Number((await DB.prepare('SELECT quantity FROM cnine_user_inventory').first()).quantity),
    logCount:Number((await DB.prepare('SELECT COUNT(*) count FROM inventory_logs').first()).count),
    cardLogCount:Number((await DB.prepare('SELECT COUNT(*) count FROM card_material_logs_v1802').first()).count)
  });
  return {DB,run,call,snapshot,close,ddl};
}

test('기존 FUR +11~+13 설정을 보존하고 승인된 두 단계만 추가한다',()=>{
  const config=extendFurHighBreakthrough(base,{});
  assert.deepEqual(config.steps.slice(0,3),base.steps);
  assert.equal(config.enabled,true);
  assert.equal(config.extendedEnabled,false);
  assert.deepEqual(config.steps.slice(3).map(({cost,duplicateCards,rate,pityThreshold})=>({cost,duplicateCards,rate,pityThreshold})),[
    {cost:20000,duplicateCards:5,rate:15,pityThreshold:10},{cost:30000,duplicateCards:8,rate:10,pityThreshold:20}
  ]);
  for(const step of config.steps.slice(3)){
    assert.equal(step.powerBonusPercent,null);assert.equal(step.uniqueBoostPercent,null);assert.equal(step.retirementShardRefund,null);
  }
  assert.equal(furExtendedReady(config),false);assert.equal(furExtendedStepAvailable(config,12),true);
  assert.equal(furExtendedStepAvailable({...config,extendedEnabled:true},13),false);
});

for(const dialect of ['sqlite','postgres']){
  for(const [level,cost,duplicates,threshold] of [[13,20000,5,10],[14,30000,8,20]]){
    test(dialect+': +'+level+' 실패는 별·중복 카드만 차감하고 대상 1장과 단계를 보존한다',async()=>{
      const f=await fixture(dialect,{level,quantity:duplicates+1});
      try{
        const result=await f.call();assert.equal(result.status,200);assert.equal(result.body.success,false);
        assert.equal(result.body.duplicateCardsSpent,duplicates);assert.equal(result.body.cost,cost);
        const s=await f.snapshot();assert.equal(s.card.quantity,1);assert.equal(s.card.breakthrough_level,level);assert.equal(s.card.breakthrough_fail_count,1);assert.equal(s.stars,2000000-cost);assert.equal(s.logCount,1);assert.equal(s.cardLogCount,1);
      }finally{await f.close();}
    });
    test(dialect+': +'+level+' 천장은 '+threshold+'회 실패 이후 다음 시도에 확정 성공한다',async()=>{
      const f=await fixture(dialect,{level,failCount:threshold-1});
      try{
        const failure=await f.call();assert.equal(failure.body.success,false);assert.equal(failure.body.guaranteed,false);assert.equal(failure.body.pity.nextGuaranteed,true);
        const success=await f.call();assert.equal(success.body.success,true);assert.equal(success.body.guaranteed,true);assert.equal(success.body.level,level+1);
        const s=await f.snapshot();assert.equal(s.card.breakthrough_fail_count,0);assert.equal(s.card.quantity,100-duplicates*2);assert.equal(s.stars,2000000-cost*2);
      }finally{await f.close();}
    });
    for(const material of ['stars','duplicates']){
      test(dialect+': +'+level+' '+material+' 부족 시 모든 재화와 천장 수치가 그대로다',async()=>{
        const f=await fixture(dialect,{level,...(material==='stars'?{stars:cost-1}:{quantity:duplicates})});
        try{const before=await f.snapshot();assert.equal((await f.call()).status,400);assert.deepEqual(await f.snapshot(),before);}finally{await f.close();}
      });
    }
  }
  test(dialect+': 성공확률 판정 성공과 최대 15강 중단을 검증한다',async()=>{
    const f=await fixture(dialect,{level:14,random:.01});
    try{const result=await f.call();assert.equal(result.body.success,true);assert.equal(result.body.level,15);assert.equal(result.body.guaranteed,false);const before=await f.snapshot();assert.equal((await f.call()).status,409);assert.deepEqual(await f.snapshot(),before);}finally{await f.close();}
  });
  test(dialect+': 운영 미정 및 다른 등급의 상한은 우회할 수 없다',async()=>{
    for(const options of [{level:13,config:extendFurHighBreakthrough(base,{})},{level:13,grade:'SUPERSTAR'},{level:13,grade:'ZENITH'}]){
      const f=await fixture(dialect,options);
      try{const before=await f.snapshot();assert.equal((await f.call()).status,409);assert.deepEqual(await f.snapshot(),before);}finally{await f.close();}
    }
  });
  test(dialect+': 별·카드 변경 도중 오류가 나면 거래 전체를 되돌린다',async()=>{
    const f=await fixture(dialect);
    try{
      await f.ddl(dialect==='sqlite'
        ?"CREATE TRIGGER qa_fail BEFORE UPDATE OF quantity ON cnine_user_inventory WHEN NEW.quantity>=0 BEGIN SELECT RAISE(ABORT,'QA rollback'); END;"
        :"CREATE FUNCTION qa_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.quantity>=0 THEN RAISE EXCEPTION 'QA rollback'; END IF; RETURN NEW; END$$; CREATE TRIGGER qa_fail BEFORE UPDATE ON cnine_user_inventory FOR EACH ROW EXECUTE FUNCTION qa_fail();");
      const before=await f.snapshot();await assert.rejects(f.call(),/QA rollback/);assert.deepEqual(await f.snapshot(),before);
    }finally{await f.close();}
  });
}

test('같은 카드에 동시에 도착한 두 요청은 한 번만 재료를 차감한다',async()=>{
  const f=await fixture();
  try{
    const results=await Promise.all([f.call(),f.call()]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const s=await f.snapshot();assert.equal(s.stars,1980000);assert.equal(s.card.quantity,95);assert.equal(s.card.breakthrough_fail_count,1);assert.equal(s.logCount,1);
  }finally{await f.close();}
});

test('클라이언트는 FUR 확장 비용을 서버와 동일하게 표시하고 미정 값을 0으로 만들지 않는다',()=>{
  const from=app.indexOf('const FUR_EXTENDED_COSTS='),to=app.indexOf('// V2113:',from);
  const context={FUR_HIGH_ENHANCEMENT_FALLBACK:base};vm.createContext(context);vm.runInContext(app.slice(from,to),context);
  const config=context.furClientHighConfig(base);
  assert.equal(config.steps[3].cost,20000);assert.equal(config.steps[4].cost,30000);
  assert.equal(config.steps[3].powerBonusPercent,null);assert.equal(config.steps[4].retirementShardRefund,null);
  assert.equal(context.furClientExtendedAvailable(config,13),false);
  assert.equal(context.furClientExtendedAvailable(readyConfig(),14),true);
});
