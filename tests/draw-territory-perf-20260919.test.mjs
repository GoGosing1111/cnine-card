// PERF-0919: 카드·장비·이동수단 뽑기와 영토전 병목 개선의 회귀 방지.
//   운영 DB 는 PostgreSQL(Hyperdrive) 이고 호환 계층이 문장마다 순차 왕복하므로
//   "문장 수"와 "재화 차감 가드"를 계약으로 고정한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {PGlite} from '@electric-sql/pglite';
import {__postgresCompatTest} from '../functions/_postgres_d1_compat.js';
import {supplyBoxDebitStatements} from '../functions/_equipment.js';
import {vehicleTicketDebitStatements} from '../functions/_vehicle_draw.js';

const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');

function recordingDatabase(responder=()=>null){
  const log=[];
  const client={async query(input){const text=typeof input==='string'?input:input.text;log.push(text);return responder(text)||{rows:[],rowCount:1}}};
  return {db:new __postgresCompatTest.PostgresD1Database(client),log};
}

test('postgres batch: read-only or single statements skip BEGIN/COMMIT, writes stay atomic',async()=>{
  const {db,log}=recordingDatabase();
  await db.batch([db.prepare('SELECT 1'),db.prepare('SELECT 2')]);
  assert.deepEqual(log,['SELECT 1','SELECT 2']);
  log.length=0;await db.batch([db.prepare('UPDATE users SET coin=1 WHERE id=?').bind(1)]);
  assert.deepEqual(log,['UPDATE users SET coin=1 WHERE id=$1']);
  log.length=0;await db.batch([db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(1),db.prepare('SELECT 2')]);
  assert.equal(log[0],'BEGIN');assert.equal(log.at(-1),'COMMIT');
  log.length=0;await db.batch([db.prepare('SELECT 1'),db.prepare('UPDATE users SET coin=1')]);
  assert.equal(log[0],'BEGIN');assert.equal(log.at(-1),'COMMIT');
  assert.equal(__postgresCompatTest.isReadOnlyStatement({source:'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x'}),false);
  assert.equal(__postgresCompatTest.isReadOnlyStatement({source:'SELECT nextval(1)'}),false);
});

test('postgres catalog lookups are reused across per-request connections and cleared by execSchema',async()=>{
  __postgresCompatTest.clearPostgresCatalogCache();
  const responder=text=>/pg_catalog\.pg_attribute a\s+WHERE/.test(text)?{rows:[{name:'user_id'},{name:'card_id'},{name:'quantity'}],rowCount:3}:null;
  const upsert='INSERT INTO perf_cards(user_id,card_id,quantity) VALUES(?,?,?) ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=quantity+excluded.quantity';
  const first=recordingDatabase(responder);await first.db.prepare(upsert).bind(1,'a',1).run();
  assert.equal(first.log.filter(text=>text.includes('pg_catalog')).length,1);
  const second=recordingDatabase(responder);await second.db.prepare(upsert).bind(1,'a',1).run();
  assert.equal(second.log.filter(text=>text.includes('pg_catalog')).length,0);
  assert.match(second.log[0],/"perf_cards"\."quantity"\+excluded\.quantity/);
  await second.db.execSchema(['CREATE TABLE perf_noop(id int)']);
  const third=recordingDatabase(responder);await third.db.prepare(upsert).bind(1,'a',1).run();
  assert.equal(third.log.filter(text=>text.includes('pg_catalog')).length,1);
});

class SqliteD1{
  constructor(){this.db=new DatabaseSync(':memory:');this.dialect='sqlite'}
  prepare(sql){const owner=this;return {values:[],bind(...values){this.values=values;return this},
    async first(){return owner.db.prepare(sql).get(...this.values)||null},async all(){return {results:owner.db.prepare(sql).all(...this.values)}},
    async run(){const result=owner.db.prepare(sql).run(...this.values);return {meta:{changes:Number(result.changes)},results:[]}}}}
  async batch(statements){this.db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.db.exec('COMMIT');return out}catch(error){this.db.exec('ROLLBACK');throw error}}
}
async function ticketFixture(t,dialect){
  const pg=dialect==='postgres'?new PGlite():null;
  const db=pg?new __postgresCompatTest.PostgresD1Database({async query(input,values){const r=await pg.query(typeof input==='string'?input:input.text,typeof input==='string'?values||[]:input.values||[]);return {...r,rowCount:r.affectedRows??r.rows.length}}}):new SqliteD1();
  const exec=sql=>pg?pg.exec(sql):db.db.exec(sql);t.after(()=>pg?pg.close():db.db.close());
  if(pg)await exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$");
  await exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,coin BIGINT NOT NULL DEFAULT 0);INSERT INTO users VALUES(7,0);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER NOT NULL DEFAULT 0,unseen_quantity INTEGER NOT NULL DEFAULT 0,updated_at TEXT,PRIMARY KEY(user_id,item_code));
    INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'EQUIPMENT_SUPPLY_BOX',3,3),(7,'VEHICLE_DRAW_TICKET',3,0);
    CREATE TABLE inventory_use_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,item_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING');
    CREATE TABLE vehicle_draw_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,duplicate INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'PENDING');`);
  return {db,exec,pg:Boolean(pg)};
}
// 다른 요청이 먼저 재고를 가져간 상황(차감 0행)을 트리거로 재현한다.
async function suppressDebit(f,code){
  if(f.pg)await f.exec(`CREATE FUNCTION perf_suppress_debit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.item_code='${code}' THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER perf_suppress_debit BEFORE UPDATE ON cnine_user_inventory FOR EACH ROW EXECUTE FUNCTION perf_suppress_debit();`);
  else await f.exec(`CREATE TRIGGER perf_suppress_debit BEFORE UPDATE ON cnine_user_inventory WHEN NEW.item_code='${code}' BEGIN SELECT RAISE(IGNORE); END;`);
}
for(const dialect of ['sqlite','postgres']){
  test(`${dialect}: supply box open aborts every reward when the box debit changes zero rows`,async t=>{
    const f=await ticketFixture(t,dialect),db=f.db,env={DB:db};
    const open=requestId=>db.batch([
      db.prepare("INSERT INTO inventory_use_receipts(request_id,user_id,item_code,status) VALUES(?,7,'EQUIPMENT_SUPPLY_BOX','PENDING')").bind(requestId),
      ...supplyBoxDebitStatements(env,{count:1,userId:7,requestId}),
      db.prepare("UPDATE users SET coin=coin+1000 WHERE id=7 AND EXISTS(SELECT 1 FROM inventory_use_receipts WHERE request_id=? AND status='PENDING')").bind(requestId),
      db.prepare("UPDATE inventory_use_receipts SET status='COMPLETED' WHERE request_id=?").bind(requestId)]);
    await open('ok-1');
    assert.equal(Number((await db.prepare('SELECT coin FROM users WHERE id=7').first()).coin),1000);
    await suppressDebit(f,'EQUIPMENT_SUPPLY_BOX');
    await assert.rejects(()=>open('lost-race'),/not.null|null value/i);
    assert.equal(Number((await db.prepare('SELECT coin FROM users WHERE id=7').first()).coin),1000);
    assert.equal(await db.prepare("SELECT status FROM inventory_use_receipts WHERE request_id='lost-race'").first(),null);
  });
  test(`${dialect}: vehicle draw aborts every reward when the ticket debit changes zero rows`,async t=>{
    const f=await ticketFixture(t,dialect),db=f.db,env={DB:db};
    const open=requestId=>db.batch([
      db.prepare("INSERT INTO vehicle_draw_receipts(request_id,user_id,status) VALUES(?,7,'PENDING')").bind(requestId),
      ...vehicleTicketDebitStatements(env,{count:2,userId:7,requestId}),
      db.prepare("UPDATE users SET coin=coin+5 WHERE id=7 AND EXISTS(SELECT 1 FROM vehicle_draw_receipts WHERE request_id=? AND status='PENDING')").bind(requestId),
      db.prepare("UPDATE vehicle_draw_receipts SET status='COMPLETED' WHERE request_id=?").bind(requestId)]);
    await open('v-ok');
    assert.equal(Number((await db.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=7 AND item_code='VEHICLE_DRAW_TICKET'").first()).quantity),1);
    await assert.rejects(()=>open('v-short'),/not.null|null value/i);
    await suppressDebit(f,'VEHICLE_DRAW_TICKET');
    await assert.rejects(()=>open('v-lost'),/not.null|null value/i);
    assert.equal(Number((await db.prepare('SELECT coin FROM users WHERE id=7').first()).coin),5);
  });
}

test('draw, prime and legacy draw paths keep their statement-saving and guard contracts',()=>{
  const server=read('functions/api/[[path]].js'),prime=read('functions/_prime_draw.js'),vehicle=read('functions/_vehicle_draw.js'),equipment=read('functions/_equipment.js');
  assert.match(server,/statements\.unshift\(\.\.\.drawCoinDebitStatements\(env,\{cost,userId:user\.id,requestId,receiptTable:drawReceiptTable\}\)\)/);
  assert.match(server,/if\(coinGuardRejected\)return json\(\{error:'코인이 부족합니다\.'/);
  assert.doesNotMatch(server,/criticalSettings\(env\),burningEventSettings\(env\),\s*env\.DB\.batch\(\[\s*env\.DB\.prepare\('SELECT \* FROM card_packs/);
  assert.match(server,/clanCampActiveProbeSql\(\)\} AS clan_camp_active_p0919/);
  assert.match(server,/if\(action==='acquire'&&call&&stub&&body\?\.token\)/);
  assert.match(vehicle,/export async function handleVehicleDraw\(\{path,request,env,deps\}\)\{if\(!vehicleDrawRoute\(path\)\)return null;/);
  assert.match(vehicle,/RETURNING status,response_json,COALESCE/);
  assert.match(equipment,/WHERE request_id=\? AND user_id=\? AND status='PENDING' RETURNING status,response_json`\)\.bind\(JSON\.stringify\(response\)/);
  assert.equal((prime.match(/(?<!function )loadDrawPool\(env,product\)/g)||[]).length,3);
  assert.equal((prime.match(/RETURNING status,response_json`\)/g)||[]).length,3);
  assert.equal((prime.match(/\.\.\.checkedOpenMutationStatements\(env,/g)||[]).length,2);
  assert.match(prime,/\.\.\.checkedPurchaseDebitStatements\(env,/);
});

test('territory polling shares round-level reads and hidden tabs stop polling',()=>{
  const territory=read('functions/_territory_war.js'),client=read('js/territory-war-v1811.js'),coup=read('functions/_coup.js');
  assert.match(territory,/if\(!shared&&round\?\.id\)shared=await counterSharedForRound\(env,round,Boolean\(mine\?\.side\)\);/);
  assert.match(territory,/const key=`\$\{round\.id\}:\$\{round\.current_front_id\|\|0\}`,now=Date\.now\(\);/);
  assert.match(territory,/readRuntimeData\(env,GAMST_REPAIR_WAITING_CACHE_KEY\)\|\|await ensureGamstDeckRepairV2005\(env\)/);
  assert.match(territory,/if\(await legacyTerritoryRewardsPending\(env\)\)/);
  assert.match(client,/if\(!document\.hidden\)loadFull\(true\);else stopPolling\(\)/);
  assert.match(coup,/UNION ALL SELECT 'TRIAL' due_kind,id FROM coup_trials_v2115/);
});

test('auto draw skips per-run side requests without touching manual draws',()=>{
  const app=read('js/app.js'),hud=read('js/pig-coin-hud-v1.mjs'),index=read('index.html');
  assert.match(app,/if\(!autoRun\)void acknowledgeDrawReceipt\(requestId\);/);
  assert.match(app,/if\(!ACCOUNT_RANK_QUIET_MUTATIONS\.test\(cleanPath\)\)window\.dispatchEvent\(new Event\('cnine:account-mutation'\)\);/);
  assert.match(app,/saveUser\(next,\{source:'draw'\}\);/);
  assert.match(hud,/if\(event\?\.detail\?\.source!=='draw'\)lastRead=0;/);
  assert.match(index,/js\/pig-coin-hud-v1\.mjs\?v=2-draw-quiet/);
  assert.match(index,/drawPerf=20260919/);
});
