import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { __postgresCompatTest } from '../functions/_postgres_d1_compat.js';
import { NEW_HYPERDRIVE_PACK as pack, newHyperdriveBudgetQuote } from '../shared/new-hyperdrive-pack-v1.mjs';
import { sampleHyperdriveBinomial, sampleHyperdriveBulk } from '../functions/_new_hyperdrive_bulk.js';
import { isProductionFile } from '../scripts/prepare-production-assets.mjs';

let fixtureId = 0;

async function fixture(t, dialect) {
  const postgres = dialect === 'postgres';
  const database = postgres ? new PGlite() : new DatabaseSync(':memory:');
  t.after(() => database.close());
  const db = postgres ? new __postgresCompatTest.PostgresD1Database({
    async query(sql, values) {
      const result = await database.query(typeof sql === 'string' ? sql : sql.text, values ?? sql.values ?? []);
      return {...result, rowCount: result.affectedRows ?? result.rows.length};
    }
  }) : {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          const statement = database.prepare(sql);
          if (sql === 'SELECT coin FROM users WHERE id=?') statement.setReadBigInts(true);
          return statement.get(...values);
        },
        async all() { return {results: database.prepare(sql).all(...values)}; },
        async run() { return {meta: {changes: database.prepare(sql).run(...values).changes}}; }
      };
    },
    async batch(statements) {
      database.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
  const exec = async sql => database.exec(sql);
  const now = postgres ? 'sqlite_now()' : 'CURRENT_TIMESTAMP';
  if (postgres) {
    const compat = readFileSync(new URL('../scripts/postgres-runtime-compat.sql', import.meta.url), 'utf8');
    await exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$");
    await exec(compat.match(/CREATE OR REPLACE FUNCTION sqlite_json_each[\s\S]*?\$\$;/)[0]);
  }
  await exec(`
    CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT ${now});
    INSERT INTO app_meta(key,value) VALUES('safe_runtime_upgrade_v1985_prime_draw_live','1');
    CREATE TABLE users(id INTEGER PRIMARY KEY,coin BIGINT NOT NULL,card_shards BIGINT NOT NULL DEFAULT 0);
    INSERT INTO users VALUES(7,9007199254740993,0),(8,0,0);
    CREATE TABLE inventory_items(code TEXT PRIMARY KEY,name TEXT NOT NULL,subtitle TEXT,description TEXT,category TEXT,rarity TEXT,image_url TEXT,sort_order INTEGER,is_active INTEGER DEFAULT 1,updated_at TEXT DEFAULT ${now});
    CREATE TABLE cnine_user_inventory(user_id INTEGER,item_code TEXT,quantity BIGINT NOT NULL,unseen_quantity BIGINT NOT NULL,created_at TEXT DEFAULT ${now},updated_at TEXT DEFAULT ${now},PRIMARY KEY(user_id,item_code));
    CREATE TABLE character_equipment_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,rarity TEXT,image_url TEXT,description TEXT,slot TEXT,total_power INTEGER,pve_power INTEGER,pvp_power INTEGER,sort_order INTEGER,is_active INTEGER,is_public INTEGER);
    CREATE TABLE character_garage_items(id INTEGER PRIMARY KEY,code TEXT,name TEXT,rarity TEXT,image_url TEXT,description TEXT,total_power INTEGER,pve_power INTEGER,pvp_power INTEGER,sort_order INTEGER,is_active INTEGER,is_public INTEGER);
    INSERT INTO character_garage_items VALUES
      (1,'BASE_CAR','기본 차량','RARE','','',100,100,100,1,1,1),
      (2,'PRIME_EXTRA','추가 차량','MYTHIC','','',200,200,200,2,1,1),
      (3,'CMS_CAR','신규 차량','LEGENDARY','','',150,150,150,3,1,1);
    CREATE TABLE avatar_catalog_v1(code TEXT PRIMARY KEY,name TEXT,lobby_image TEXT,description TEXT,role_label TEXT,accent TEXT,sort_order INTEGER,is_active INTEGER,is_public INTEGER);
    CREATE TABLE avatar_user_ownership_v1(user_id INTEGER,avatar_code TEXT,source_type TEXT,source_ref TEXT,acquired_at TEXT,expires_at TEXT,PRIMARY KEY(user_id,avatar_code));
    CREATE TABLE user_garage_vehicles(user_id INTEGER,garage_id INTEGER,source_type TEXT,source_id TEXT,PRIMARY KEY(user_id,garage_id));
    CREATE TABLE coin_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT);
    CREATE TABLE shard_logs(user_id INTEGER,change_amount BIGINT,balance_after BIGINT,reason TEXT);
    CREATE TABLE inventory_logs(user_id INTEGER,item_code TEXT,change_amount BIGINT,balance_after BIGINT,reason TEXT,reference_type TEXT,reference_id TEXT);
  `);
  const api = await import('../functions/_prime_draw.js?hyperdrive-test=' + fixtureId++);
  const env = {DB: db};
  await api.ensurePrimeDrawFoundation(env);
  await exec(`
    INSERT INTO prime_vehicle_draw_pool_v1985(garage_id,entry_code,source_weight,source_probability,boost_multiplier,draw_weight,duplicate_shards,pool_version)
    VALUES(1,'BASE_CAR',100,100,1,80,7,'PRIME_VEHICLE_V1985_1');
    INSERT INTO prime_draw_extra_pool_v1987(product_kind,reward_type,reward_ref,draw_weight,pool_version)
    VALUES('vehicle','VEHICLE','PRIME_EXTRA',20,'PRIME_VEHICLE_V1985_1');
  `);
  const call = (path, body, {id = 7, role = 'OWNER'} = {}) => api.handlePrimeDraw({
    path: path.split('?')[0], env,
    request: new Request('https://test.invalid/api/' + path, body === undefined ? {} : {
      method: 'POST', headers: {'content-type': 'application/json', origin: 'https://test.invalid'}, body: JSON.stringify(body)
    }),
    deps: {
      authenticate: async () => id ? {id, role} : null, readBody: request => request.json(),
      json: (data, status = 200) => ({data, status}), withUserMutationLock: (_env, _id, _path, action) => action()
    }
  });
  const query = async sql => (await db.prepare(sql).all()).results;
  return {call, exec, query};
}

const config = (f, user) => f.call(pack.apiPath + '/config', undefined, user);
const receipt = (f, id, user) => f.call(pack.apiPath + '/receipt?requestId=' + id, undefined, user);
const checkout = (f, settings, requestId, count = 1, user) => f.call(pack.apiPath + '/open', {
  requestId, count, expectedRevision: settings.revision, expectedUnitPrice: settings.shopPrice
}, user);
const checkoutBudget = (f, settings, requestId, budget, user) => f.call(pack.apiPath + '/open', {
  requestId, count: newHyperdriveBudgetQuote(settings.shopPrice, budget).count, budget,
  expectedRevision: settings.revision, expectedUnitPrice: settings.shopPrice
}, user);
const save = (f, settings, weights, user) => f.call('admin/prime-draw/pool', {
  kind: pack.kind, settings, entries: Object.entries(weights).map(([key, drawWeight]) => ({poolKey: 'VEHICLE:' + key, drawWeight}))
}, user);
const wallet = async f => (await f.query('SELECT CAST(coin AS TEXT) AS coin FROM users WHERE id=7'))[0].coin;
const prices = rows => rows.map(row => [row.code, row.drawWeight]);
const coinsBefore = '9007199254740993';

test('deployable pack assets include the shop art and client modules', () => {
  const assetRoot = pack.assetRoot.slice(1);
  for (const file of ['pack-320.webp', 'pack-768.webp', 'hangar-wide.webp', 'hangar-narrow.webp']) {
    assert.ok(isProductionFile(assetRoot + '/' + file));
  }
  for (const file of ['css/new-hyperdrive-pack-v1.css', 'js/new-hyperdrive-pack-v1.mjs', 'shared/new-hyperdrive-pack-v1.mjs']) {
    assert.ok(isProductionFile(file));
  }
  assert.ok(!isProductionFile(assetRoot + '/manifest.json'));
});

for (const dialect of ['sqlite', 'postgres']) {
  test(`${dialect}: inherits the saved Prime base and extra pool, starts OFF, and saves new vehicles independently`, async t => {
    const f = await fixture(t, dialect);
    assert.equal((await config(f, {id: 0})).status, 401);
    const {data: initial} = await config(f);
    const prime = await f.call('vehicle-draw/prime/config');
    assert.deepEqual(prices(initial.pool.entries), prices(prime.data.pool.entries));
    assert.equal(initial.shop.enabled, false);
    assert.equal(initial.openEnabled, false);
    assert.deepEqual(initial.counts, [1, 10]);
    assert.equal((await checkout(f, initial.settings, 'closed')).status, 423);
    const draft = {...initial.settings, shopPrice: 2000000};
    const weights = {BASE_CAR: 80, PRIME_EXTRA: 10, CMS_CAR: 10};
    assert.equal((await save(f, draft, weights, {role: 'USER'})).status, 403);
    const saved = await save(f, draft, weights);
    assert.equal(saved.status, 200);
    assert.notEqual(saved.data.settings.revision, draft.revision);
    assert.equal(saved.data.shop.unitPrice, 2000000);
    assert.deepEqual(prices(saved.data.pool.entries), Object.entries(weights));
    assert.deepEqual(prices((await f.call('vehicle-draw/prime/config')).data.pool.entries), prices(prime.data.pool.entries));
    assert.equal((await save(f, draft, weights)).status, 409);
    assert.equal(await wallet(f), coinsBefore);
  });

  test(`${dialect}: 10 draws debit once, grant ownership and duplicate rewards, and recover after sale closure`, async t => {
    const f = await fixture(t, dialect);
    t.mock.method(crypto, 'getRandomValues', values => { values.fill(0); return values; });
    const {data: initial} = await config(f);
    const weights = {BASE_CAR: 100, PRIME_EXTRA: 0};
    const on = await save(f, {...initial.settings, shopEnabled: true, openEnabled: true}, weights);
    assert.equal((await checkout(f, initial.settings, 'stale', 10)).status, 409);
    assert.equal((await checkout(f, on.data.settings, 'bad-count', 2)).status, 400);
    assert.equal((await checkout(f, on.data.settings, 'insufficient', 1, {id: 8})).data.code, 'INSUFFICIENT_COINS');
    const opened = await checkout(f, on.data.settings, 'draw-ten', 10);
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.equal(opened.data.coin, '9007199244740993');
    assert.equal(opened.data.totalPrice, 10000000);
    assert.deepEqual(opened.data.aggregated.map(row => [row.code, row.newCount, row.duplicateCount]), [['BASE_CAR', 1, 9]]);
    assert.equal(opened.data.shardsGained, 63);
    assert.equal(opened.data.masterStarsGained, 10);
    assert.equal((await f.query('SELECT source_type FROM user_garage_vehicles'))[0].source_type, 'NEW_HYPERDRIVE_OPEN');
    assert.equal((await f.query("SELECT quantity FROM cnine_user_inventory WHERE item_code='MASTER_STAR'"))[0].quantity, 10);
    await save(f, {...on.data.settings, shopEnabled: false, openEnabled: false}, weights);
    assert.deepEqual(await checkout(f, on.data.settings, 'draw-ten', 10), opened);
    assert.equal((await checkout(f, on.data.settings, 'draw-ten', 1)).data.code, 'REQUEST_MISMATCH');
    assert.deepEqual(await receipt(f, 'draw-ten'), opened);
    assert.equal((await receipt(f, 'draw-ten', {id: 8})).status, 404);
    assert.equal(await wallet(f), opened.data.coin);
    assert.equal((await f.query('SELECT COUNT(*) AS n FROM coin_logs'))[0].n, 1);
    assert.equal((await f.query('SELECT COUNT(*) AS n FROM shard_logs'))[0].n, 1);
  });

  test(`${dialect}: suppressed vehicle grant rolls back coins, ledger and receipt and the same request can retry`, async t => {
    const f = await fixture(t, dialect);
    const {data: initial} = await config(f);
    const on = await save(f, {...initial.settings, shopEnabled: true, openEnabled: true}, {BASE_CAR: 100, PRIME_EXTRA: 0});
    await f.exec(dialect === 'postgres'
      ? 'CREATE FUNCTION skip_vehicle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER skip_vehicle BEFORE INSERT ON user_garage_vehicles FOR EACH ROW EXECUTE FUNCTION skip_vehicle();'
      : 'CREATE TRIGGER skip_vehicle BEFORE INSERT ON user_garage_vehicles BEGIN SELECT RAISE(IGNORE); END;');
    assert.equal((await checkout(f, on.data.settings, 'retry-car')).status, 503);
    assert.equal(await wallet(f), coinsBefore);
    assert.equal((await receipt(f, 'retry-car')).status, 404);
    assert.deepEqual(await f.query('SELECT * FROM coin_logs'), []);
    await f.exec(dialect === 'postgres' ? 'DROP TRIGGER skip_vehicle ON user_garage_vehicles' : 'DROP TRIGGER skip_vehicle');
    assert.equal((await checkout(f, on.data.settings, 'retry-car')).status, 200);
    assert.equal((await f.query('SELECT COUNT(*) AS n FROM user_garage_vehicles'))[0].n, 1);
  });

  test(`${dialect}: 100조 and 1,000조 use one debit each, carry unused coins, and group Prime presentations`, async t => {
    const f = await fixture(t, dialect);
    await f.exec("UPDATE prime_vehicle_draw_pool_v1985 SET presentation_enabled=1,presentation_tier='CINEMATIC',effect_key='NOIRE_SOVEREIGN'");
    const {data: initial} = await config(f);
    const on = await f.call('admin/prime-draw/pool', {
      kind: pack.kind, settings: {...initial.settings, openEnabled: true, shopEnabled: true, shopPrice: 1000001},
      entries: [
        {poolKey: 'VEHICLE:BASE_CAR', drawWeight: 80, presentation: {enabled: true, tier: 'CINEMATIC', effectKey: 'NOIRE_SOVEREIGN'}},
        {poolKey: 'VEHICLE:PRIME_EXTRA', drawWeight: 20}
      ]
    });
    for (const budget of pack.budgets) {
      const before = BigInt(await wallet(f));
      const quote = newHyperdriveBudgetQuote(on.data.settings.shopPrice, budget);
      const id = 'bulk-' + budget;
      const opened = await checkoutBudget(f, on.data.settings, id, budget);
      assert.equal(opened.status, 200, JSON.stringify(opened.data));
      const result = opened.data;
      assert.equal(result.count, quote.count);
      assert.equal(result.totalPrice, quote.cost);
      assert.equal(result.unused, quote.unused);
      assert.equal(BigInt(result.coin), before - BigInt(quote.cost));
      assert.equal(result.aggregated.reduce((sum, row) => sum + row.count, 0), quote.count);
      assert.deepEqual(result.specialQueue.map(row => row.presentation.effectKey), ['NOIRE_SOVEREIGN']);
      assert.ok(JSON.stringify(result).length < 2500);
      assert.deepEqual(await checkoutBudget(f, on.data.settings, id, budget), opened);
    }
    assert.deepEqual((await f.query('SELECT count FROM new_hyperdrive_open_receipts_v1 ORDER BY count')).map(row => row.count), [99999900, 999999000]);
    assert.equal((await f.query('SELECT COUNT(*) AS n FROM coin_logs'))[0].n, 2);
    assert.equal((await f.query('SELECT COUNT(*) AS n FROM user_garage_vehicles'))[0].n, 2);
  });
}

test('binomial sampling preserves the configured frequency and variance over sparse and dense large batches', () => {
  let state = 0x48dc149b;
  const random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (const [trials, probability] of [[10, .01], [1000000000, .01], [1000000000, .75], [1000000000000000, .00000001], [1000000000, .99999999]]) {
    const expected = trials * probability;
    const variance = expected * (1 - probability);
    let standardized = 0;
    let square = 0;
    const samples = 2000;
    for (let i = 0; i < samples; i++) {
      const result = sampleHyperdriveBinomial(trials, probability, random);
      assert.ok(Number.isSafeInteger(result) && result >= 0 && result <= trials);
      const residual = (result - expected) / Math.sqrt(variance);
      standardized += residual;
      square += residual * residual;
    }
    assert.ok(Math.abs(standardized / samples) < .12, `mean skew at ${trials} / ${probability}`);
    assert.ok(Math.abs(square / samples - 1) < .24, `variance skew at ${trials} / ${probability}`);
  }
  const vehicle = {code:'V', rewardType:'VEHICLE', draw_weight:81};
  const first = {code:'A1', rewardType:'AVATAR', draw_weight:11};
  const second = {code:'A2', rewardType:'AVATAR', draw_weight:8};
  const count = 1000000000;
  const result = sampleHyperdriveBulk([vehicle, first, second], count, new Set(['A1']), random);
  assert.deepEqual(result.draws, [{row: second, count: 1}, {row: vehicle, count: count - 1}]);
  assert.ok(result.stars > .009 * count && result.stars < .011 * count);
});
