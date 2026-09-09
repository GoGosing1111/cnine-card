import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {handleUniqueAdvancement,loadUniqueAdvancementsForCards,ensureUniqueAdvancementPassCatalog,UNIQUE_ADVANCEMENT_CLASS_DEFINITIONS as CLASSES,UNIQUE_ADVANCEMENT_PASS_CODE as PASS,__uniqueAdvancementTest as internals} from '../functions/_unique_advancement.js';
import {cardUniqueDeckState,cardUniqueSettings} from '../functions/_magic.js';
import {buildFighter} from '../functions/_battle_v2_preview.js';

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

test('CMS ATTACK to DEFENSE change synchronizes status, battle loading and completed retries without charging again',async t=>{
  const f=fixture(t),first=await f.post();
  assert.equal(first.payload.uniqueAdvancement.classCode,'SHATTER');
  const snapshot=()=>({
    advancement:f.sqlite.prepare(`SELECT * FROM ${internals.ADVANCEMENT_TABLE}`).all(),
    receipt:f.sqlite.prepare(`SELECT * FROM ${internals.RECEIPT_TABLE}`).all(),
    cards:f.sqlite.prepare('SELECT * FROM user_cards ORDER BY card_id').all(),
    inventory:f.sqlite.prepare('SELECT * FROM cnine_user_inventory ORDER BY item_code').all(),
    logs:f.sqlite.prepare('SELECT * FROM inventory_logs').all()
  }),before=snapshot();
  f.sqlite.exec("UPDATE card_unique_effects SET attack_percent=10,defense_percent=35,speed_percent=0,hp_percent=10 WHERE card_id='CARD-1'");
  const status=await f.status(),current=status.payload.uniqueAdvancement;
  assert.equal(current.classCode,'RIPOSTE');assert.equal(current.dominantType,'DEFENSE');
  assert.equal(status.payload.recommendedType,'DEFENSE');assert.equal(status.payload.recommendedClass.name,'반격자');
  assert.equal(current.activatedAt,first.payload.uniqueAdvancement.activatedAt);
  assert.equal(current.configVersion,first.payload.uniqueAdvancement.configVersion);
  assert.equal(current.modifiers.counterChancePoints,11);assert.equal(current.modifiers.counterMultiplierPoints,13);
  assert.equal(current.modifiers.penetrationPoints,0);assert.equal(current.modifiers.openingGaugePoints,0);
  assert.deepEqual((await loadUniqueAdvancementsForCards(f.env,1,['CARD-1'])).get('CARD-1'),current);
  for(const mode of ['ON','OFF']){
    f.env.UNIQUE_ADVANCEMENT_MODE=mode;
    const replay=await f.post();assert.equal(replay.payload.replayed,true);
    assert.deepEqual(replay.payload.uniqueAdvancement,current);assert.equal(replay.payload.recommendedType,'DEFENSE');
    assert.deepEqual(replay.payload.masterStars,first.payload.masterStars);
    assert.deepEqual(replay.payload.advancementPass,first.payload.advancementPass);
  }
  assert.deepEqual(snapshot(),before,'only effective class changes; ownership, enhancement, costs and audit receipts stay untouched');
});

test('completed class follows all four active dominant stats and the same tie priority as new advancement',async t=>{
  const f=fixture(t);await f.post();
  for(const [stats,expected] of [
    [[10,35,0,10],'RIPOSTE'],[[10,10,35,10],'AFTERIMAGE'],[[10,10,0,35],'IMMORTAL'],
    [[35,10,0,10],'SHATTER'],[[35,35,35,35],'SHATTER'],[[10,35,35,35],'RIPOSTE'],[[10,10,35,35],'AFTERIMAGE']
  ]){
    f.sqlite.prepare("UPDATE card_unique_effects SET attack_percent=?,defense_percent=?,speed_percent=?,hp_percent=? WHERE card_id='CARD-1'").run(...stats);
    const status=await f.status(),loaded=(await loadUniqueAdvancementsForCards(f.env,1,['CARD-1'])).get('CARD-1');
    assert.equal(status.payload.uniqueAdvancement.classCode,expected);
    assert.equal(loaded.classCode,expected);assert.equal(loaded.dominantType,CLASSES[expected].dominantType);
    assert.deepEqual(loaded,status.payload.uniqueAdvancement);
  }
  assert.equal(f.balance('MASTER_STAR'),6000);assert.equal(f.count('inventory_logs'),2);
});

test('missing, inactive or zero unique stats preserve completed advancement rather than remove it',async t=>{
  const f=fixture(t),first=await f.post(),original=first.payload.uniqueAdvancement;
  for(const update of [
    "UPDATE card_unique_effects SET defense_percent=35,is_active=0 WHERE card_id='CARD-1'",
    "UPDATE card_unique_effects SET is_active=1,attack_percent=0,defense_percent=0,speed_percent=0,hp_percent=0 WHERE card_id='CARD-1'",
    "DELETE FROM card_unique_effects WHERE card_id='CARD-1'"
  ]){
    f.sqlite.exec(update);
    assert.deepEqual((await f.status()).payload.uniqueAdvancement,original);
    assert.deepEqual((await loadUniqueAdvancementsForCards(f.env,1,['CARD-1'])).get('CARD-1'),original);
  }
  f.sqlite.exec("INSERT INTO card_unique_effects(card_id,defense_percent) VALUES('CARD-1',35)");
  assert.equal((await f.status()).payload.uniqueAdvancement.classCode,'RIPOSTE');
  assert.equal(f.balance('MASTER_STAR'),6000);
});

test('automatic class sync neither grants advancement nor leaks another user or card state',async t=>{
  const f=fixture(t,{passes:2});
  f.sqlite.exec("UPDATE card_unique_effects SET defense_percent=35 WHERE card_id='CARD-1'");
  const unadvanced=await f.status();assert.equal(unadvanced.payload.uniqueAdvancement,null);
  assert.equal(unadvanced.payload.recommendedType,'DEFENSE');
  assert.equal((await loadUniqueAdvancementsForCards(f.env,1,['CARD-1'])).size,0);
  await f.post();await f.post({cardId:'CARD-2',requestId:'test:sync:second-card'});
  const loaded=await loadUniqueAdvancementsForCards(f.env,1,['CARD-1','CARD-2','CARD-1']);
  assert.equal(loaded.size,2);assert.equal(loaded.get('CARD-1').classCode,'RIPOSTE');assert.equal(loaded.get('CARD-2').classCode,'SHATTER');
  assert.equal((await loadUniqueAdvancementsForCards(f.env,2,['CARD-1','CARD-2'])).size,0);
  assert.equal((await loadUniqueAdvancementsForCards(f.env,1,[])).size,0);
});

for(const mode of ['PVE','PVP'])test(`${mode}: real deck-to-fighter pipeline applies DEFENSE/RIPOSTE after CMS change, not stale or forged ATTACK`,async t=>{
  const f=fixture(t),first=await f.post();
  f.sqlite.exec(`
    ALTER TABLE card_unique_effects ADD COLUMN scope_pve INTEGER DEFAULT 1;
    ALTER TABLE card_unique_effects ADD COLUMN scope_pvp INTEGER DEFAULT 1;
    ALTER TABLE card_unique_effects ADD COLUMN effect_name TEXT DEFAULT '';
    ALTER TABLE card_unique_effects ADD COLUMN effect_description TEXT DEFAULT '';
    ALTER TABLE card_unique_effects ADD COLUMN effect_type TEXT DEFAULT 'NONE';
    ALTER TABLE card_unique_effects ADD COLUMN trigger_type TEXT DEFAULT 'PASSIVE';
    ALTER TABLE card_unique_effects ADD COLUMN effect_value REAL DEFAULT 0;
    ALTER TABLE card_unique_effects ADD COLUMN trigger_chance REAL DEFAULT 100;
    ALTER TABLE card_unique_effects ADD COLUMN max_activations INTEGER DEFAULT 1;
    INSERT INTO app_meta(key,value) VALUES('card_unique_effect_settings_v1','{"enabled":true}');
    UPDATE card_unique_effects SET attack_percent=10,defense_percent=35,speed_percent=0,hp_percent=10 WHERE card_id='CARD-1';
  `);
  await cardUniqueSettings(f.env,{fresh:true});
  const input={id:'CARD-1',title:'하이희야',grade:'ZENITH',breakthroughLevel:13,power:100000,
    uniqueAdvancement:first.payload.uniqueAdvancement,uniqueAbility:{attackPercent:500,dominantType:'ATTACK'}};
  const state=await cardUniqueDeckState(f.env,{id:1,role:'USER'},[input],mode),card=state.cards[0];
  assert.equal(card.uniqueAbility.dominantType,'DEFENSE');assert.equal(card.uniqueAdvancement.classCode,'RIPOSTE');
  const fighter=buildFighter(card,0,'A',card.uniqueAbility,mode);
  assert.equal(fighter.type,'DEFENSE');assert.equal(fighter.uniqueAdvancement.classCode,'RIPOSTE');
  assert.equal(fighter.uniqueAdvancement.modifiers.counterChancePoints,11);
  assert.equal(fighter.uniqueAdvancement.modifiers.counterMultiplierPoints,13);
  assert.equal(fighter.uniqueAdvancement.modifiers.penetrationPoints,0);
  assert.equal(fighter.uniqueAdvancement.modifiers.criticalChancePoints,0);
  assert.equal(fighter.gauge,0);assert.ok(fighter.shield>0);assert.equal(fighter.breakthroughLevel,13);
});
