import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {buildBlackMiraclePowerPool,cleanBlackMiracleSettings,blackMiraclePowerCatalog,openBlackMiraclePack,saveBlackMiracleSettings} from '../functions/_black_miracle_pack.js';

test('new mythic items never enter any mode or influence selected item rates',()=>{
  const row=(id,power)=>({id,code:'EQ_'+id,name:'item '+id,rarity:'MYTHIC',is_active:1,is_public:1,total_power:power});
  const initial=[row(1,100),row(2,1000)];
  for(const mode of ['AUTO','HYBRID','MANUAL']){
    const config={mode,overrides:{1:{enabled:true},2:{enabled:true},4:{rate:0.1}}};
    const before=buildBlackMiraclePowerPool(initial,config);
    const after=buildBlackMiraclePowerPool([...initial,row(3,999999),row(4,500000)],config);
    assert.deepEqual(after,before,'unselected entries cannot change existing probabilities');
    assert.equal(cleanBlackMiracleSettings({powerRewards:{equipment:config}}).powerRewards.equipment.mode,'MANUAL');
    assert.deepEqual(buildBlackMiraclePowerPool(initial,{mode}),[]);
  }
});

function database(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,unseen_quantity INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,item_code));
    CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,slot TEXT,rarity TEXT,image_url TEXT,total_power INTEGER,pve_power INTEGER,pvp_power INTEGER,is_active INTEGER,is_public INTEGER,sort_order INTEGER);
    CREATE TABLE character_garage_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,rarity TEXT,image_url TEXT,total_power INTEGER,pve_power INTEGER,pvp_power INTEGER,is_active INTEGER,is_public INTEGER,sort_order INTEGER);
    CREATE TABLE user_equipment_instances(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,equipment_id INTEGER,source_type TEXT,source_id TEXT,request_id TEXT,acquired_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER,source_type TEXT,source_id TEXT,acquired_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,garage_id));
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT);
    CREATE TABLE black_miracle_pack_open_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER,status TEXT,response_json TEXT,error_message TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE black_miracle_pack_drop_receipts(user_id INTEGER,source_type TEXT,reference_id TEXT,status TEXT,quantity INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,source_type,reference_id));
    INSERT INTO character_equipment_items VALUES(1,'APPROVED','승인 장비','BOTTOM','MYTHIC','',100,100,100,1,1,1),(2,'EMPEROR_BOTTOM','신규 장비','BOTTOM','MYTHIC','',100000,100000,100000,1,1,2);
    INSERT INTO character_garage_items VALUES(1,'APPROVED_CAR','승인 차량','MYTHIC','',100,100,100,1,1,1),(2,'NEW_CAR','신규 차량','MYTHIC','',100000,100000,100000,1,1,2);
    INSERT INTO cnine_user_inventory VALUES(1,'BLACK_MIRACLE_PACK',10,10,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  `);
  class Statement{
    constructor(sql,values=[]){this.sql=sql;this.values=values}
    bind(...values){return new Statement(this.sql,values)}
    first(){return db.prepare(this.sql).get(...this.values)||null}
    all(){return{results:db.prepare(this.sql).all(...this.values)}}
    run(){const result=db.prepare(this.sql).run(...this.values);return{meta:{changes:Number(result.changes)}}}
  }
  const env={DB:{prepare(sql){return new Statement(sql)},async batch(statements){db.exec('BEGIN');try{const results=statements.map(statement=>statement.run());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}}};
  return{db,env};
}

test('actual opening enforces explicit selection in power and legacy modes, for equipment and vehicles',async()=>{
  const {db,env}=database(),random=Math.random;Math.random=()=>0;
  try{
    for(const power of [true,false])for(const kind of ['equipment','vehicle'])for(const selected of [true,false]){
      db.exec('DELETE FROM user_garage_vehicles; DELETE FROM user_equipment_instances;');
      const settings=await saveBlackMiracleSettings(env,{enabled:true,rewards:{MYTHIC_EQUIPMENT:{rate:kind==='equipment'?100:0},MYTHIC_VEHICLE:{rate:kind==='vehicle'?100:0},MASTER_STAR:{rate:power?1:0},COIN:{rate:0}},powerRewards:{enabled:power,equipment:{enabled:kind==='equipment',mode:'AUTO',overrides:selected?{1:{enabled:true}}:{}},vehicle:{enabled:kind==='vehicle',mode:'AUTO',overrides:selected?{1:{enabled:true}}:{}}}});
      const catalog=await blackMiraclePowerCatalog(env,settings,{fresh:true});
      const rows=catalog[kind];
      assert.equal(rows.length,2,'CMS lists the new candidate so an operator may add it');
      assert.equal(rows.find(row=>row.id===2).enabled,false,'new candidates are unchecked');
      assert.equal(rows.find(row=>row.id===2).selected,false);
      const result=await openBlackMiraclePack(env,{userId:1,requestId:`${power}-${kind}-${selected}`});
      if(selected){
        assert.equal(result.reward.type,kind==='equipment'?'MYTHIC_EQUIPMENT':'MYTHIC_VEHICLE');
        assert.equal(result.reward.item.id,1);
      }else assert.equal(result.reward.type,'MASTER_STAR');
      assert.equal(db.prepare('SELECT COUNT(*) count FROM user_equipment_instances WHERE equipment_id=2').get().count,0);
      assert.equal(db.prepare('SELECT COUNT(*) count FROM user_garage_vehicles WHERE garage_id=2').get().count,0);
    }
  }finally{Math.random=random;db.close()}
});

test('CMS preserves an explicit check even when its rate is automatic, and cache entry points reach the change',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const admin=read('admin/black-miracle-pack-admin-v1485.js');
  assert.match(admin,/const checked=item\.enabled===true/);
  assert.match(admin,/신규 신화 장비·이동수단은 자동으로 추가되지 않습니다/);
  assert.doesNotMatch(admin,/<option value="(?:AUTO|HYBRID)">/);
  assert.match(admin,/if\(rateInput\.value!==''\)override\.rate=Number\(rateInput\.value\);overrides\[id\]=override/);
  assert.match(read('admin/index.html'),/admin-v1276\.js\?v=2050-verified-coin-50eok-manual-black-miracle-20260909/);
  assert.match(read('admin/admin-v1276.js'),/black-miracle-pack-admin-v1485\.js\?v=1926-manual-pool-20260909/);
});
