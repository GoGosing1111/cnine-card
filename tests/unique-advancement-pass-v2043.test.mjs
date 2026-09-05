import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {handleUniqueAdvancement,ensureUniqueAdvancementPassCatalog,UNIQUE_ADVANCEMENT_PASS_CODE as PASS,__uniqueAdvancementTest as internals} from '../functions/_unique_advancement.js';

class Statement{
  constructor(owner,sql,values=[]){Object.assign(this,{owner,sql,values})}
  bind(...values){return new Statement(this.owner,this.sql,values)}
  async first(){return this.owner.sqlite.prepare(this.sql).get(...this.values)||null}
  async all(){return {results:this.owner.sqlite.prepare(this.sql).all(...this.values)}}
  async run(){return this.execute()}
  execute(){
    if(/^\s*SELECT\b/i.test(this.sql))return {results:this.owner.sqlite.prepare(this.sql).all(...this.values)};
    const result=this.owner.sqlite.prepare(this.sql).run(...this.values);
    return {results:[],meta:{changes:Number(result.changes)}};
  }
}
function fixture(t,{passes=1,stars=9000,grade='ZENITH',level=13,active=1,quantity=1}={}){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  const DB={sqlite,dialect:'d1',prepare:sql=>new Statement(DB,sql),async batch(statements){
    const atomic=statements.some(s=>s.sql.includes('INSERT INTO '+internals.GUARD_TABLE));
    if(atomic&&DB.beforeAtomic){const hook=DB.beforeAtomic;DB.beforeAtomic=null;hook()}
    sqlite.exec('BEGIN');
    try{
      const results=statements.map(statement=>{
        if(atomic&&DB.rejectStatement?.(statement))return {results:[],meta:{changes:0}};
        return statement.execute();
      });
      sqlite.exec('COMMIT');return results;
    }catch(error){sqlite.exec('ROLLBACK');throw error}
  }};
  sqlite.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER,PRIMARY KEY(user_id,card_id));
    CREATE TABLE cards_effective_v1210(id TEXT PRIMARY KEY,title TEXT,rarity TEXT);
    CREATE TABLE card_unique_effects(card_id TEXT PRIMARY KEY,attack_percent REAL DEFAULT 20,defense_percent REAL DEFAULT 1,hp_percent REAL DEFAULT 1,speed_percent REAL DEFAULT 1,is_active INTEGER DEFAULT 1);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
    ${internals.schemaStatements({DB}).join(';')};
  `);
  sqlite.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run(internals.FOUNDATION_KEY,'1');
  for(const cardId of ['CARD-1','CARD-2']){
    sqlite.prepare('INSERT INTO cards_effective_v1210 VALUES(?,?,?)').run(cardId,'전직 테스트',grade);
    sqlite.prepare('INSERT INTO user_cards VALUES(1,?,?,?)').run(cardId,quantity,level);
    sqlite.prepare('INSERT INTO card_unique_effects(card_id,is_active) VALUES(?,?)').run(cardId,active);
  }
  sqlite.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,?,?,?)').run('MASTER_STAR',stars,stars);
  if(passes!==null)sqlite.prepare('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(1,?,?,?)').run(PASS,passes,passes);
  const env={DB,UNIQUE_ADVANCEMENT_MODE:'ON'};
  const deps={authenticate:async()=>({id:1,role:'USER'}),readBody:r=>r.json(),json:(payload,status=200)=>({payload,status}),uniqueAdvancementRandomUint32:0xffffffff};
  const post=async(body={})=>handleUniqueAdvancement({env,deps,path:'card/unique-advancement',request:new Request('https://example.test/api/card/unique-advancement',{method:'POST',body:JSON.stringify({cardId:'CARD-1',requestId:'test:pass:request-1',expectedPassUse:passes>0,...body})})});
  const status=()=>handleUniqueAdvancement({env,deps,path:'card/unique-advancement/status',request:new Request('https://example.test/api/card/unique-advancement/status?cardId=CARD-1')});
  const balance=code=>sqlite.prepare('SELECT quantity FROM cnine_user_inventory WHERE user_id=1 AND item_code=?').get(code)?.quantity||0;
  const count=table=>sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
  return {DB,sqlite,env,deps,post,status,balance,count};
}

test('catalog adds a named ticket without grants or overwriting CMS edits',async t=>{
  const f=fixture(t,{passes:0});
  await ensureUniqueAdvancementPassCatalog(f.env);await ensureUniqueAdvancementPassCatalog(f.env);
  const item=f.sqlite.prepare('SELECT * FROM inventory_items WHERE code=?').get(PASS);
  assert.equal(item.name,'전직 패스권');assert.equal(item.category,'ADVANCEMENT');
  assert.match(item.description,/100%/);assert.match(item.description,/3,000/);
  assert.equal(f.count('inventory_items'),1);assert.equal(f.balance(PASS),0);
  f.sqlite.prepare('UPDATE inventory_items SET is_active=0 WHERE code=?').run(PASS);
  await ensureUniqueAdvancementPassCatalog(f.env);
  assert.equal(f.sqlite.prepare('SELECT is_active FROM inventory_items WHERE code=?').get(PASS).is_active,0);
});

for(const grade of ['FUR','ZENITH','SUPERSTAR'])test(`${grade}: a pass guarantees success even for the worst roll, consumes exactly one, replays once`,async t=>{
  const f=fixture(t,{grade,passes:2,stars:10000000000});
  const status=await f.status();assert.equal(status.payload.config.successChancePercent,10);
  assert.equal(status.payload.effectiveSuccessChancePercent,100);assert.equal(status.payload.advancementPass.quantity,2);
  const result=await f.post();assert.equal(result.status,200);assert.equal(result.payload.success,true);
  assert.equal(result.payload.effectiveSuccessChancePercent,100);assert.equal(result.payload.advancementPass.spent,1);
  assert.equal(result.payload.advancementPass.quantity,1);assert.equal(f.balance(PASS),1);
  assert.equal(f.balance('MASTER_STAR'),9999997000);assert.equal(f.count('inventory_logs'),2);
  assert.equal(f.sqlite.prepare('SELECT unseen_quantity n FROM cnine_user_inventory WHERE item_code=?').get(PASS).n,1);
  const replay=await f.post();assert.equal(replay.payload.replayed,true);
  assert.deepEqual({...replay.payload,replayed:false},result.payload);
  assert.equal(f.balance(PASS),1);assert.equal(f.count(internals.ADVANCEMENT_TABLE),1);assert.equal(f.count('inventory_logs'),2);
  const already=await f.post({requestId:'test:pass:another-request'});assert.equal(already.payload.code,'ALREADY_ADVANCED');assert.equal(f.balance(PASS),1);
  f.env.UNIQUE_ADVANCEMENT_MODE='OFF';
  assert.equal((await f.post()).payload.replayed,true,'feature OFF must not hide a completed receipt');
});

for(const passes of [null,0])test(`no pass (${passes}): retains the 10% failure and 3,000-star cost`,async t=>{
  const f=fixture(t,{passes});assert.equal((await f.status()).payload.effectiveSuccessChancePercent,10);
  const result=await f.post();assert.equal(result.payload.success,false);assert.equal(result.payload.advancementPass.spent,0);
  assert.equal(f.balance('MASTER_STAR'),6000);assert.equal(f.count('inventory_logs'),1);assert.equal(f.count(internals.ADVANCEMENT_TABLE),0);
  assert.equal((await f.post()).payload.replayed,true);assert.equal(f.balance('MASTER_STAR'),6000);
});

for(const [overrides,code] of [[{stars:2999},'MASTER_STAR_SHORTAGE'],[{level:12},'BREAKTHROUGH_REQUIRED'],[{grade:'LIMITED'},'GRADE_NOT_ELIGIBLE'],[{active:0},'ACTIVE_UNIQUE_REQUIRED'],[{quantity:0},'CARD_NOT_OWNED']])test(`pass never bypasses ${code}`,async t=>{
  const f=fixture(t,overrides),stars=f.balance('MASTER_STAR');
  assert.equal((await f.post()).payload.code,code);assert.equal(f.balance(PASS),1);assert.equal(f.balance('MASTER_STAR'),stars);assert.equal(f.count('inventory_logs'),0);
});

test('feature OFF and unauthenticated requests do not consume the pass',async t=>{
  const f=fixture(t);f.env.UNIQUE_ADVANCEMENT_MODE='OFF';
  assert.equal((await f.post()).payload.code,'FEATURE_DISABLED');
  f.deps.authenticate=async()=>null;assert.equal((await f.post()).status,401);
  assert.equal(f.balance(PASS),1);assert.equal(f.count('inventory_logs'),0);
});

test('old/stale/forged confirmation cannot unexpectedly consume a pass or downgrade 100% to 10%',async t=>{
  const f=fixture(t);
  for(const expectedPassUse of [undefined,false]){
    assert.equal((await f.post({expectedPassUse})).payload.code,'ADVANCEMENT_PASS_STATE_CHANGED');
    assert.equal(f.balance('MASTER_STAR'),9000);assert.equal(f.balance(PASS),1);
  }
  assert.equal((await f.post({expectedPassUse:'true'})).payload.code,'INVALID_PASS_CONFIRMATION');
  f.sqlite.prepare('UPDATE cnine_user_inventory SET quantity=0 WHERE item_code=?').run(PASS);
  assert.equal((await f.post({expectedPassUse:true})).payload.code,'ADVANCEMENT_PASS_STATE_CHANGED');
  assert.equal(f.balance('MASTER_STAR'),9000);assert.equal(f.count('inventory_logs'),0);
});

test('two different card requests cannot consume a single pass twice',async t=>{
  const f=fixture(t);
  const results=await Promise.all([f.post(),f.post({cardId:'CARD-2',requestId:'test:pass:request-2'})]);
  assert.equal(results.filter(r=>r.payload.success===true).length,1);
  assert.equal(results.filter(r=>r.status===409).length,1);
  assert.equal(f.balance(PASS),0);assert.equal(f.balance('MASTER_STAR'),6000);
  assert.equal(f.count(internals.ADVANCEMENT_TABLE),1);assert.equal(f.count('inventory_logs'),2);
});

for(const point of ['ticket-deduction','advancement','pass-log','late-log-error'])test(`atomic rollback if ${point} fails: no missing ticket, star or class`,async t=>{
  const f=fixture(t);
  f.DB.rejectStatement=statement=>{
    if(point==='late-log-error'&&statement.sql.startsWith('INSERT INTO inventory_logs')&&statement.sql.includes("'UNIQUE_ADVANCEMENT_PASS'"))throw new Error('INJECTED_LATE_FAILURE');
    return point==='ticket-deduction'?statement.sql.startsWith('UPDATE cnine_user_inventory SET quantity=')&&statement.values.includes(PASS)
      :point==='advancement'?statement.sql.startsWith(`INSERT INTO ${internals.ADVANCEMENT_TABLE}(`)
      :point==='pass-log'?statement.sql.startsWith('INSERT INTO inventory_logs')&&statement.sql.includes("'UNIQUE_ADVANCEMENT_PASS'"):false;
  };
  assert.equal((await f.post()).payload.code,'ADVANCEMENT_STATE_CONFLICT');
  assert.equal(f.balance(PASS),1);assert.equal(f.balance('MASTER_STAR'),9000);
  assert.equal(f.count(internals.ADVANCEMENT_TABLE),0);assert.equal(f.count('inventory_logs'),0);assert.equal(f.count(internals.GUARD_TABLE),0);
  f.DB.rejectStatement=null;assert.equal((await f.post()).payload.success,true);
  assert.equal(f.balance(PASS),0);assert.equal(f.balance('MASTER_STAR'),6000);
});

test('a changed pass snapshot rejects before deductions and never falls back to a random roll',async t=>{
  const f=fixture(t);
  f.DB.beforeAtomic=()=>f.sqlite.prepare('UPDATE cnine_user_inventory SET quantity=0 WHERE item_code=?').run(PASS);
  assert.equal((await f.post()).payload.code,'ADVANCEMENT_STATE_CONFLICT');
  assert.equal(f.balance('MASTER_STAR'),9000);assert.equal(f.count('inventory_logs'),0);
  assert.equal((await f.post()).payload.code,'ADVANCEMENT_PASS_STATE_CHANGED');
});

test('inventory and CMS expose the pass without putting it in generic pack opening',()=>{
  const api=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
  const admin=readFileSync(new URL('../admin/unique-advancement-pass-v2043.js',import.meta.url),'utf8');
  const index=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
  assert.match(api,/if\(itemCode===UNIQUE_ADVANCEMENT_PASS_CODE\)await ensureUniqueAdvancementPassCatalog\(env\)/);
  assert.match(api,/if\(itemCode===UNIQUE_ADVANCEMENT_PASS_CODE\)return json\(\{error:'전직 패스권은 카드 상세/);
  assert.match(api,/'UNIQUE_ADVANCEMENT_PASS'\) THEN 0/);
  assert.match(api,/카드 상세 전직 시 자동 사용/);
  assert.match(admin,/option\.value='UNIQUE_ADVANCEMENT_PASS'/);
  assert.match(index,/unique-advancement-pass-v2043\.js\?v=2043-advancement-pass/);
});
