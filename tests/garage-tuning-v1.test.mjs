import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { garageOwnershipRemoval, handleGarageTuning } from '../functions/_garage_tuning.js';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { JointSQLiteDB } from './helpers/joint-db.mjs';

const schema = `
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT,subtitle TEXT,description TEXT,
    category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER);
  CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity INTEGER,PRIMARY KEY(user_id,item_code));
  CREATE TABLE character_garage_items(id INTEGER PRIMARY KEY,is_active INTEGER);
  CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER,PRIMARY KEY(user_id,garage_id));
  CREATE TABLE user_garage_loadout(user_id INTEGER PRIMARY KEY,garage_id INTEGER);
  INSERT INTO character_garage_items VALUES(37,1),(38,1);
  INSERT INTO user_garage_vehicles VALUES(7,37),(7,38),(8,37);
  INSERT INTO user_garage_loadout VALUES(7,37),(8,37);
  INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_garage_tuning_v1','1');
  INSERT INTO inventory_items(code,name,is_active) VALUES('VEHICLE_PART_ENGINE','제작 재료',1);
  INSERT INTO inventory_items(code,name,image_url,is_active) VALUES
    ('GARAGE_TUNING_ENGINE_1','스틸 인라인 엔진','assets/ui/garage/tuning-v1/engine-1.webp',1),
    ('GARAGE_TUNING_FRAME_1','별도 CMS 등록명','/custom-frame.webp',1);
  INSERT INTO cnine_user_inventory VALUES(7,'VEHICLE_PART_ENGINE',45);`;

async function fixture(t, postgres) {
  let DB;
  if (postgres) {
    const pg = new PGlite();
    t.after(() => pg.close());
    await pg.exec(`CREATE FUNCTION sqlite_now() RETURNS TEXT LANGUAGE SQL STABLE AS $$
      SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS') $$;`);
    await pg.exec(schema.replaceAll('INTEGER', 'BIGINT'));
    await pg.exec(`CREATE ROLE garage_runtime;
      GRANT USAGE,CREATE ON SCHEMA public TO garage_runtime;
      GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO garage_runtime;
      SET ROLE garage_runtime;`);
    const acl = await pg.query("SELECT has_table_privilege(current_user,'user_garage_vehicles','REFERENCES') AS can_reference");
    assert.equal(acl.rows[0].can_reference, false);
    DB = new __postgresCompatTest.PostgresD1Database({
      async query(input) {
        const result = typeof input === 'string' ? await pg.query(input) : await pg.query(input.text, input.values || []);
        return { ...result, rowCount: result.affectedRows ?? result.rows.length };
      }
    });
  } else {
    DB = new JointSQLiteDB();
    t.after(() => DB.sql.close());
    DB.sql.exec(schema);
  }

  const path = 'character/garage/tuning';
  async function call({ vehicleId = 37, userId = 7, body } = {}) {
    const request = new Request(`https://test.invalid/api/${path}?vehicleId=${vehicleId}`, body ? {
      method: 'POST', body: JSON.stringify({ vehicleId, ...body })
    } : {});
    const response = await handleGarageTuning({ path, request, env: { DB }, deps: {
      authenticate: async () => userId ? { id: userId } : null,
      readBody: request => request.json(), json: (body, status = 200) => Response.json(body, { status })
    } });
    return { status: response.status, ...await response.json() };
  }
  return { call, sql: (query, ...values) => DB.prepare(query).bind(...values),
    removeVehicle: async (userId, vehicleId) => DB.batch(await garageOwnershipRemoval({ DB }, userId, vehicleId)) };
}

for (const postgres of [false, true]) {
  test(`garage tuning persists three independent slots and enforces ownership (${postgres ? 'PostgreSQL' : 'SQLite'})`, async t => {
    const { call, sql, removeVehicle } = await fixture(t, postgres);
    const equip = (slot, stage, options = {}) => call({ ...options, body: { action: 'equip', slot, stage } });
    assert.equal((await call({ userId: null })).status, 401);
    assert.equal((await call({ vehicleId: 38 })).status, 409);
    const initial = (await call()).tuning;
    assert.deepEqual(initial.equipped, {});
    assert.equal(initial.parts.length, 15);
    assert.equal(new Set(initial.parts.map(part => part.image)).size, 15);
    assert.ok(initial.parts.every(part => !part.owned && part.available));
    assert.equal((await sql("SELECT image_url FROM inventory_items WHERE code='GARAGE_TUNING_ENGINE_1'").first()).image_url,
      'assets/ui/garage/tuning-v2/engine-1.webp');
    assert.equal((await sql("SELECT image_url FROM inventory_items WHERE code='GARAGE_TUNING_FRAME_1'").first()).image_url, '/custom-frame.webp');
    await Promise.all(initial.parts.map(part => access(new URL(`../${part.image}`, import.meta.url))));
    assert.equal((await equip('engine', 6)).status, 400);
    assert.equal((await equip('engine', 2)).status, 409);

    for (const code of ['ENGINE_2', 'ENGINE_5', 'FRAME_4', 'TIRE_3']) {
      await sql('INSERT INTO cnine_user_inventory VALUES(7,?,1)', `GARAGE_TUNING_${code}`).run();
    }
    assert.equal((await equip('engine', 2, { userId: 8 })).status, 409);
    assert.equal((await equip('engine', 2, { vehicleId: 38 })).status, 409);
    const mutations = await Promise.all([equip('engine', 2), equip('frame', 4), equip('tire', 3)]);
    assert.ok(mutations.every(result => result.status === 200));
    assert.deepEqual((await call()).tuning.equipped, { engine: 2, frame: 4, tire: 3 });
    assert.equal((await equip('engine', 5)).tuning.equipped.engine, 5);
    assert.equal((await equip('engine', 5)).tuning.equipped.engine, 5);
    const remove = stage => call({ body: { action: 'unequip', slot: 'engine', stage } });
    assert.equal((await remove(2)).tuning.equipped.engine, 5);
    assert.deepEqual((await remove(5)).tuning.equipped, { frame: 4, tire: 3 });

    await sql('UPDATE user_garage_loadout SET garage_id=38 WHERE user_id=7').run();
    assert.deepEqual((await call({ vehicleId: 38 })).tuning.equipped, {});
    await sql('UPDATE user_garage_loadout SET garage_id=37 WHERE user_id=7').run();
    assert.deepEqual((await call()).tuning.equipped, { frame: 4, tire: 3 });
    await sql("UPDATE inventory_items SET is_active=0 WHERE code='GARAGE_TUNING_TIRE_3'").run();
    assert.deepEqual((await call()).tuning.equipped, { frame: 4 });
    assert.deepEqual((await call({ userId: 8 })).tuning.equipped, {});
    assert.equal(Number((await sql('SELECT SUM(quantity) AS total FROM cnine_user_inventory').first()).total), 49);
    await removeVehicle(7, 37);
    assert.equal((await call()).status, 409);
    assert.equal(Number((await sql('SELECT COUNT(*) AS total FROM user_garage_tuning_loadout').first()).total), 0);
    await sql('INSERT INTO user_garage_vehicles VALUES(7,37)').run();
    assert.deepEqual((await call()).tuning.equipped, {});
  });
}
