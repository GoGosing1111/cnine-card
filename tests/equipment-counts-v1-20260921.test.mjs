import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import pg from 'pg';

import {createPostgresD1Compat} from '../functions/_postgres_d1_compat.js';
import {equipmentCountsReady,EQUIPMENT_COUNTS_READY_KEY} from '../functions/_equipment_counts_v1.js';
import {equipmentQuantities} from '../functions/_equipment_inventory.js';

// PIPE-0920: 장비 수량 집계 표. 트리거 SQL 은 scripts/ops/equipment-counts-v1-20260921.sql 의 1절이다.
const opsSql=readFileSync(new URL('../scripts/ops/equipment-counts-v1-20260921.sql',import.meta.url),'utf8');
const section1=opsSql.slice(opsSql.indexOf('CREATE TABLE IF NOT EXISTS user_equipment_counts_v1'),opsSql.indexOf('-- ============================== 2. 경계 id'));

test('marker gate: only postgres, cached per scope, off by default',async()=>{
  let reads=0;
  const mk=(dialect,value)=>({DB:{dialect,prepare(){return{bind(){return{async first(){reads++;return value===null?null:{value}}}}}}},RUNTIME_DB_CACHE_SCOPE:'scope-'+Math.random()});
  assert.equal(await equipmentCountsReady(mk('sqlite','1')),false);
  assert.equal(reads,0);
  const on=mk('postgres','1');
  assert.equal(await equipmentCountsReady(on),true);
  assert.equal(await equipmentCountsReady(on),true);
  assert.equal(reads,1,'두 번째 호출은 캐시');
  assert.equal(await equipmentCountsReady(mk('postgres',null)),false);
  assert.equal(await equipmentCountsReady(mk('postgres','0')),false);
});

const url=process.env.CNINE_TEST_PG_URL;

test('real PostgreSQL: triggers keep counts equal to GROUP BY through bulk insert, delete and re-key',{skip:!url},async()=>{
  const admin=new pg.Client({connectionString:url});await admin.connect();
  try{
    await admin.query(`DROP TABLE IF EXISTS user_equipment_instances,user_equipment_counts_v1,app_meta,users,character_equipment_items CASCADE;
      CREATE TABLE users(id BIGINT PRIMARY KEY);
      CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
      CREATE TABLE character_equipment_items(id BIGINT PRIMARY KEY,is_active INT,is_public INT);
      CREATE TABLE user_equipment_instances(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL,equipment_id BIGINT NOT NULL,acquired_at TEXT DEFAULT 'now');`);
    await admin.query('CREATE ROLE cnine_migrator_test_tmp').catch(e=>{ if(!/already exists/.test(e.message)) throw e; });
    const ddl=section1.replace(/TO cnine_migrator;/,'TO cnine_migrator_test_tmp;');
    await admin.query(ddl);
    await admin.query(`INSERT INTO users VALUES(1),(2);INSERT INTO character_equipment_items VALUES(10,1,1),(11,1,1),(12,1,1);`);
    const same=async()=>{
      const real=(await admin.query('SELECT user_id,equipment_id,COUNT(*)::bigint qty FROM user_equipment_instances GROUP BY 1,2 ORDER BY 1,2')).rows.map(r=>`${r.user_id}:${r.equipment_id}=${r.qty}`);
      const counted=(await admin.query('SELECT user_id,equipment_id,quantity FROM user_equipment_counts_v1 WHERE quantity>0 ORDER BY 1,2')).rows.map(r=>`${r.user_id}:${r.equipment_id}=${r.quantity}`);
      assert.deepEqual(counted,real);
    };
    // 프라임 일괄 개봉처럼 한 문장으로 500행
    await admin.query(`INSERT INTO user_equipment_instances(user_id,equipment_id) SELECT 1,10 FROM generate_series(1,500)`);
    await admin.query(`INSERT INTO user_equipment_instances(user_id,equipment_id) VALUES(1,11),(1,11),(2,10)`);
    await same();
    // 연금술처럼 id 지정 삭제
    const ids=(await admin.query('SELECT id FROM user_equipment_instances WHERE user_id=1 AND equipment_id=10 ORDER BY id LIMIT 5')).rows.map(r=>r.id);
    await admin.query('DELETE FROM user_equipment_instances WHERE id = ANY($1::bigint[])',[ids]);
    await same();
    // 키 변경(계정 이전 같은 드문 경우)
    await admin.query('UPDATE user_equipment_instances SET user_id=2 WHERE user_id=1 AND equipment_id=11');
    await same();
    // 전량 삭제 → 0 으로 남되 GROUP BY 와 같다(quantity>0 필터)
    await admin.query('DELETE FROM user_equipment_instances WHERE user_id=2');
    await same();

    // 코드 경로: 마커 OFF 면 예전 쿼리, ON 이면 집계 표. 두 결과가 같아야 한다.
    const {db,close}=await createPostgresD1Compat(url);
    try{
      const env={DB:db,RUNTIME_DB_CACHE_SCOPE:'counts-test-'+Date.now()};
      const before=await equipmentQuantities(env,1,0);
      await admin.query(`INSERT INTO app_meta(key,value) VALUES('${EQUIPMENT_COUNTS_READY_KEY}','1')`);
      const env2={DB:db,RUNTIME_DB_CACHE_SCOPE:'counts-test2-'+Date.now()};
      const after=await equipmentQuantities(env2,1,0);
      assert.deepEqual(after.quantities,[{equipmentId:10,quantity:495},{equipmentId:11,quantity:0},{equipmentId:12,quantity:0}]);
      assert.equal(after.nextEquipmentId,null);
      assert.deepEqual(before.quantities.slice(0,3),after.quantities.slice(0,3));
    }finally{await close();}
  }finally{
    await admin.query('DROP TABLE IF EXISTS user_equipment_instances,user_equipment_counts_v1,app_meta,users,character_equipment_items CASCADE').catch(()=>{});
    await admin.end();
  }
});
