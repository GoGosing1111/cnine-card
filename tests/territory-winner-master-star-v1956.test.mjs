import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {grantLatestWinnerMasterStarsV1956} from '../functions/_territory_war.js';

const source=readFileSync(new URL('../functions/_territory_war.js',import.meta.url),'utf8');

test('v1956 bonus fixes latest finished winner and strict attack threshold',()=>{
  assert.match(source,/WINNER_MASTER_STAR_BONUS_MIN_EXCLUSIVE_ATTACKS=80/);
  assert.match(source,/WINNER_MASTER_STAR_BONUS_AMOUNT=7_000/);
  assert.match(source,/WHERE status='FINISHED' AND settled_at IS NOT NULL AND winner_side IN \('A','B'\)/);
  assert.match(source,/ORDER BY settled_at DESC,id DESC LIMIT 1/);
  assert.match(source,/r\.round_id=\? AND r\.side=\? AND r\.result='WIN' AND r\.attacks>\?/);
});

test('v1956 bonus is one-shot and per-user idempotent',()=>{
  assert.match(source,/safe_runtime_reward_v1956_latest_finished_winner_gt80_master_star_7000/);
  assert.match(source,/TWV3:R\$\{roundId\}:WIN:ATTACKS_GT80:MASTER_STAR:7000/);
  assert.match(source,/referenceType='TERRITORY_WAR_BONUS'/);
  assert.match(source,/NOT EXISTS \(\s*SELECT 1 FROM inventory_logs l/);
  assert.match(source,/await env\.DB\.batch\(\[ensureInventory,grantInventory,writeLogs\]\)/);
  assert.match(source,/paidCount!==recipients\.length\|\|totalGranted!==expectedTotal/);
});

test('v1956 bonus runs before territory foundation is marked ready',()=>{
  assert.match(source,/await recoverWrongWinnerOverpaymentV1444\(env\);\s*await grantLatestWinnerMasterStarsV1956\(env\);\s*foundationReady=true/);
});

class TestStatement{
  constructor(owner,sql,values=[]){this.owner=owner;this.sql=sql;this.values=values}
  bind(...values){return new TestStatement(this.owner,this.sql,values)}
  first(){return this.owner.sqlite.prepare(this.sql).get(...this.values)||null}
  all(){return{results:this.owner.sqlite.prepare(this.sql).all(...this.values)}}
  run(){const result=this.owner.sqlite.prepare(this.sql).run(...this.values);return{meta:{changes:Number(result.changes||0),last_row_id:Number(result.lastInsertRowid||0)}}}
}
class TestDb{
  constructor(){this.sqlite=new DatabaseSync(':memory:');this.dialect='d1'}
  prepare(sql){return new TestStatement(this,sql)}
  batch(statements){
    this.sqlite.exec('BEGIN');
    try{const results=statements.map(statement=>statement.run());this.sqlite.exec('COMMIT');return results}
    catch(error){this.sqlite.exec('ROLLBACK');throw error}
  }
}

function rewardFixture(){
  const DB=new TestDb(),settledAt=new Date(Date.now()-60_000).toISOString();
  DB.sqlite.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE territory_war_v3_rounds(id INTEGER PRIMARY KEY,status TEXT,battle_name TEXT,winner_side TEXT,settled_at TEXT);
    CREATE TABLE territory_war_v3_rewards(round_id INTEGER,user_id INTEGER,side TEXT,result TEXT,attacks INTEGER,damage INTEGER,PRIMARY KEY(round_id,user_id));
    CREATE TABLE territory_war_v3_users(round_id INTEGER,user_id INTEGER,side TEXT,attacks INTEGER,PRIMARY KEY(round_id,user_id));
    CREATE TABLE territory_war_v3_actions(id INTEGER PRIMARY KEY,round_id INTEGER,user_id INTEGER,status TEXT);
    CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER DEFAULT 0,unseen_quantity INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE inventory_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT,admin_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  DB.prepare("INSERT INTO app_meta(key,value) VALUES('territory_war_settings_v3',?)").bind(JSON.stringify({teamAName:'승리파',teamBName:'패배파'})).run();
  DB.prepare("INSERT INTO territory_war_v3_rounds VALUES(1,'FINISHED','이전 회차','A',?)").bind(new Date(Date.now()-3_600_000).toISOString()).run();
  DB.prepare("INSERT INTO territory_war_v3_rounds VALUES(2,'FINISHED','방금 회차','A',?)").bind(settledAt).run();
  for(const [id,name] of [[1,'팔십회'],[2,'팔십일회'],[3,'백이십회'],[4,'패배진영'],[5,'결과불일치'],[6,'이전회차']])DB.prepare('INSERT INTO users(id,nickname) VALUES(?,?)').bind(id,name).run();
  for(const [roundId,userId,side,attacks] of [[2,1,'A',80],[2,2,'A',81],[2,3,'A',120],[2,4,'B',200],[2,5,'A',200],[1,6,'A',300]])DB.prepare('INSERT INTO territory_war_v3_users(round_id,user_id,side,attacks) VALUES(?,?,?,?)').bind(roundId,userId,side,attacks).run();
  for(const row of [[2,1,'A','WIN',80,800],[2,2,'A','WIN',81,810],[2,3,'A','WIN',120,1200],[2,4,'B','LOSE',200,2000],[2,5,'A','LOSE',200,2000],[1,6,'A','WIN',300,3000]])DB.prepare('INSERT INTO territory_war_v3_rewards(round_id,user_id,side,result,attacks,damage) VALUES(?,?,?,?,?,?)').bind(...row).run();
  DB.prepare("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,'MASTER_STAR',5,2)").run();
  return DB;
}

test('v1956 runtime migration pays only latest winner accounts above 80 and is idempotent',async()=>{
  const DB=rewardFixture(),first=await grantLatestWinnerMasterStarsV1956({DB});
  assert.equal(first.roundId,2);
  assert.equal(first.teamName,'승리파팀');
  assert.equal(first.recipientCount,2);
  assert.equal(first.totalGranted,14_000);
  assert.deepEqual(first.recipients.map(row=>[row.nickname,row.attacks]),[['백이십회',120],['팔십일회',81]]);
  const paid=DB.prepare("SELECT user_id,quantity,unseen_quantity FROM cnine_user_inventory WHERE item_code='MASTER_STAR' ORDER BY user_id").all().results.map(row=>({...row}));
  assert.deepEqual(paid,[{user_id:2,quantity:7005,unseen_quantity:7002},{user_id:3,quantity:7000,unseen_quantity:7000}]);
  const logs=DB.prepare("SELECT user_id,change_amount,balance_after FROM inventory_logs ORDER BY user_id").all().results.map(row=>({...row}));
  assert.deepEqual(logs,[{user_id:2,change_amount:7000,balance_after:7005},{user_id:3,change_amount:7000,balance_after:7000}]);
  const second=await grantLatestWinnerMasterStarsV1956({DB});
  assert.equal(second.operationKey,first.operationKey);
  assert.equal(DB.prepare('SELECT COUNT(*) count FROM inventory_logs').first().count,2);
  assert.equal(DB.prepare("SELECT quantity FROM cnine_user_inventory WHERE user_id=2 AND item_code='MASTER_STAR'").first().quantity,7005);
});
