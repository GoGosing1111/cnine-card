import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applySuitCoreBox,readSuitCoreBoxState,verifySuitCoreBox,OPERATION_KEY} from '../scripts/ops/suit-core-box-20261008.mjs';
import {SUIT_CORE_BOX as product,SUIT_CORE_BOX_WEIGHTS as weights} from '../shared/suit-core-box-v1.mjs';
import asset from '../assets/ui/packs/suit-core-supply-box-20261008.json' with {type:'json'};
async function fixture(t){
  const c=new PGlite();t.after(()=>c.close());
  await c.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
    CREATE TABLE users(id BIGINT PRIMARY KEY,role TEXT,status TEXT);INSERT INTO users VALUES(1,'OWNER','ACTIVE');
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER,updated_at TEXT);
    CREATE TABLE prime_draw_extra_pool_v1987(product_kind TEXT,reward_type TEXT,reward_ref TEXT,draw_weight REAL,presentation_enabled INTEGER,presentation_tier TEXT,effect_key TEXT,pool_version TEXT,updated_at TEXT,PRIMARY KEY(product_kind,reward_type,reward_ref));
    INSERT INTO prime_draw_extra_pool_v1987 VALUES('equipment','INVENTORY_ITEM','SUIT_CORE_1',0.019988,0,'STANDARD','NONE','existing','old');
    CREATE TABLE admin_logs(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id BIGINT,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT,created_at TEXT);`);
  for(const row of weights)await c.query('INSERT INTO inventory_items(code,is_active) VALUES($1,1)',[row.code]);
  const proof=()=>({origin:'https://cnine-card.pages.dev',commit:'a'.repeat(40),suitCoreRuntimeVerified:true,assetSha256:asset.sha256,checkedAt:new Date().toISOString()});
  return {c,proof};
}
test('activation applies four exact weights atomically, verifies and preserves later CMS edits on replay',async t=>{
  const {c,proof}=await fixture(t),expectedState=await readSuitCoreBoxState(c),original=(await c.query("SELECT * FROM prime_draw_extra_pool_v1987 WHERE product_kind='equipment'")).rows;
  const result=await applySuitCoreBox(c,{proof:proof(),expectedState});assert.equal(result.replayed,false);assert.equal((await verifySuitCoreBox(c)).verified,true);
  assert.deepEqual((await c.query("SELECT * FROM prime_draw_extra_pool_v1987 WHERE product_kind='equipment'")).rows,original);
  await c.query('UPDATE app_meta SET value=$2 WHERE key=$1',[product.settingsKey,JSON.stringify({shopEnabled:false})]);
  assert.equal((await applySuitCoreBox(c,{proof:proof(),expectedState})).replayed,true);
  assert.deepEqual(JSON.parse((await c.query('SELECT value FROM app_meta WHERE key=$1',[product.settingsKey])).rows[0].value),{shopEnabled:false});
  assert.equal((await c.query('SELECT count(*) n FROM admin_logs')).rows[0].n,1);
});
test('missing core or failed audit leaves no partial product configuration or completion receipt',async t=>{
  const {c,proof}=await fixture(t);await c.query("UPDATE inventory_items SET is_active=0 WHERE code='SUIT_CORE_4'");
  const expectedState=await readSuitCoreBoxState(c);await assert.rejects(()=>applySuitCoreBox(c,{proof:proof(),expectedState}),/four core/);
  assert.deepEqual(await readSuitCoreBoxState(c),expectedState);await c.query("UPDATE inventory_items SET is_active=1 WHERE code='SUIT_CORE_4'");
  await c.exec("CREATE FUNCTION suppress_audit() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER suppress BEFORE INSERT ON admin_logs FOR EACH ROW EXECUTE FUNCTION suppress_audit()");
  await assert.rejects(()=>applySuitCoreBox(c,{proof:proof(),expectedState}));assert.deepEqual(await readSuitCoreBoxState(c),expectedState);
  assert.equal((await c.query('SELECT value FROM app_meta WHERE key=$1',[OPERATION_KEY])).rows.length,0);
  await c.exec('DROP TRIGGER suppress ON admin_logs');assert.equal((await applySuitCoreBox(c,{proof:proof(),expectedState})).replayed,false);
});
