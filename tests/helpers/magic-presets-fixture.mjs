import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import nodePg from 'pg';
import { __postgresCompatTest } from '../../functions/_postgres_d1_compat.js';
import { defaultMagicSettings, handleMagic } from '../../functions/_magic.js';
import { ensurePvpMagicPresets, savePvpDeckWithMagic, readPvpMagicPresets } from '../../functions/_magic_presets.js';

export async function magicFixture(postgres = false) {
  let failAt = '', sql, pg;
  const queries = [];
  const DB = postgres ? new __postgresCompatTest.PostgresD1Database({ async query(q) {
    const text = typeof q === 'string' ? q : q.text; queries.push(text);
    if (failAt && text.includes(failAt)) throw Error('INJECTED_FAILURE');
    if (postgres === 'pipeline' && typeof q === 'string') {
      const rows = (await pg.exec(text)).map(r => ({ ...r, rowCount: r.affectedRows ?? r.rows.length }));
      return rows.length === 1 ? rows[0] : rows;
    }
    const r = await pg.query(text, typeof q === 'string' ? [] : q.values || []);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  }, ...(postgres === 'pipeline' ? { escapeLiteral: value => nodePg.Client.prototype.escapeLiteral.call(null, value) } : {}) }) : {
    prepare(source) { return { values: [], source, bind(...values) { this.values = values; return this; },
      async first() { queries.push(source); return sql.prepare(source).get(...this.values) || null; },
      async all() { queries.push(source); return { results: sql.prepare(source).all(...this.values) }; },
      async run() { queries.push(source); if (failAt && source.includes(failAt)) throw Error('INJECTED_FAILURE'); const r = sql.prepare(source).run(...this.values); return { meta: { changes: Number(r.changes) } }; }
    }; },
    async batch(list) { sql.exec('BEGIN'); try { const results = []; for (const s of list) results.push(await s.run()); sql.exec('COMMIT'); return results; } catch (e) { sql.exec('ROLLBACK'); throw e; } }
  };
  if (postgres) { pg = new PGlite(); await pg.exec("CREATE FUNCTION sqlite_now() RETURNS text LANGUAGE SQL STABLE AS $$SELECT to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')$$;"); }
  else sql = new DatabaseSync(':memory:');
  const env = { DB }, p = (query, ...args) => DB.prepare(query).bind(...args);
  const schema = [
    'CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)',
    'CREATE TABLE users(id INTEGER PRIMARY KEY,nickname TEXT,role TEXT,coin INTEGER,card_shards INTEGER,magic_crystals INTEGER)',
    'CREATE TABLE magic_cards(id INTEGER PRIMARY KEY,code TEXT,name TEXT,image_url TEXT,description TEXT,effect_type TEXT,effect_value INTEGER,trigger_type TEXT,trigger_chance INTEGER,max_activations INTEGER,scope_pve INTEGER,scope_pvp INTEGER,scope_captain INTEGER,is_active INTEGER,sort_order INTEGER,draw_weight INTEGER DEFAULT 1)',
    'CREATE TABLE user_magic_cards(user_id INTEGER,magic_card_id INTEGER,quantity INTEGER,enhancement_level INTEGER,first_obtained_at TEXT,updated_at TEXT,PRIMARY KEY(user_id,magic_card_id))',
    'CREATE TABLE magic_card_loadouts(user_id INTEGER,deck_type TEXT,slot_no INTEGER,magic_card_id INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,deck_type,slot_no))',
    'CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE magic_card_enhance_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER,magic_card_id INTEGER,status TEXT,response_json TEXT,error_message TEXT,created_at TEXT,updated_at TEXT)',
    'CREATE TABLE magic_card_draw_receipts(request_id TEXT PRIMARY KEY,user_id INTEGER,status TEXT,cost INTEGER,coin_cost INTEGER,response_json TEXT,error_message TEXT,created_at TEXT,updated_at TEXT)',
    'CREATE TABLE magic_crystal_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT,reference_type TEXT,reference_id TEXT)',
    'CREATE TABLE coin_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT)',
    'CREATE TABLE shard_logs(user_id INTEGER,change_amount INTEGER,balance_after INTEGER,reason TEXT,card_id TEXT)'
  ];
  if (postgres) await pg.exec(schema.map(s => s.replaceAll('INTEGER','BIGINT').replaceAll('CURRENT_TIMESTAMP','sqlite_now()')).join(';'));
  else await DB.batch(schema.map(s => DB.prepare(s)));
  await ensurePvpMagicPresets(env);
  await p("INSERT INTO app_meta VALUES('magic_card_settings_v1',?)", JSON.stringify({ ...defaultMagicSettings(), enabled: true, drawEnabled: true })).run();
  for (const id of [1, 2]) await p('INSERT INTO users VALUES(?,?,?,?,?,?)', id, `검수 계정 ${id}`, 'USER', 1000000, 5000, 2000).run();
  const names = ['전투의 서막', '수호의 결계', '생명의 맥동', '위기의 치유', '응징의 함정', '마력의 반격', '속행의 바람', '침묵의 봉인', '파멸의 낙인', '보호막 강탈', '시간의 균열', '불사조의 귀환', '정화의 빛', '연쇄의 메아리'];
  const effects = ['OPENING_ATTACK', 'GUARD_BARRIER', 'LIFE_AMPLIFY', 'CRISIS_HEAL', 'PUNISH_TRAP', 'ARCANE_COUNTER', 'FOLLOWUP_HASTE', 'ARCANE_SEAL', 'DOOM_MARK', 'SHIELD_SIPHON', 'TIME_DISTORTION', 'PHOENIX_REVIVE', 'PURIFY_LIGHT', 'CHAIN_ECHO'];
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i], version = i < 7 ? 1500 : 1665;
    await p('INSERT INTO magic_cards(id,code,name,image_url,description,effect_type,effect_value,trigger_type,trigger_chance,max_activations,scope_pve,scope_pvp,scope_captain,is_active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', i + 1, `QA_${i + 1}`, names[i], `assets/ui/magic-cards/${effect.toLowerCase().replaceAll('_', '-')}-768-v${version}.webp`, `${names[i]} 효과를 발동해 전투 흐름을 바꿉니다. 슬롯에 배치한 카드에 적용됩니다.`, effect, 20, 'BATTLE_START', 20, 1, 1, i === 12 ? 0 : 1, 0, 1, i).run();
    if (i !== 10 && i !== 11) await p('INSERT INTO user_magic_cards(user_id,magic_card_id,quantity,enhancement_level) VALUES(?,?,?,?)', 1, i + 1, i === 9 ? 1 : 5, i === 0 ? 0 : i === 1 ? 9 : i % 8 + 1).run();
  }
  await p("INSERT INTO magic_card_loadouts VALUES(1,'PVP',1,1,CURRENT_TIMESTAMP)").run();
  await p("INSERT INTO magic_card_loadouts VALUES(1,'PVP',3,2,CURRENT_TIMESTAMP)").run();
  await p("INSERT INTO magic_card_loadouts VALUES(1,'PVE',2,3,CURRENT_TIMESTAMP)").run();
  const cardIds = ['1', '2', '3', '4', '5'];
  await p('INSERT INTO pvp_decks(user_id,card_ids) VALUES(1,?)', JSON.stringify(cardIds)).run();
  for (let no = 1; no <= 3; no++) await p('INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids) VALUES(1,?,?)', no, JSON.stringify(cardIds)).run();
  const user = () => p('SELECT * FROM users WHERE id=1').first();
  const deps = { authenticate: user, readBody: request => request.json(), json: (body, status = 200) => Response.json(body, { status }), profile: user };
  const call = (route, body, customDeps) => handleMagic({ path: route, env, deps: customDeps || deps, request: new Request(`http://127.0.0.1/api/${route}`, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  return { env, DB, p, call, user, queries, cardIds, fail: value => { failAt = value; }, close: () => postgres ? pg.close() : sql.close(), async pvpConfig() {
    const magic = await readPvpMagicPresets(env, 1), rows = await p('SELECT preset_no,card_ids FROM pvp_deck_presets WHERE user_id=1').all();
    return { ...magic, presets: Object.fromEntries(rows.results.map(r => [r.preset_no, JSON.parse(r.card_ids)])), settings: { enabled: true, seasonName: '로컬 검수 시즌', automaticSeasons: true, tiers: [], challengerTier: { id: 'challenger', name: '챌린저', min: 3000 } }, profile: { season_score: 1000, highest_score: 1000, tier: { id: 'gold', name: '골드', color: '#dfc57d' } }, energy: { energy: 15, maxEnergy: 15, costPerBattle: 1 }, characterBonus: { pvp: 0 }, battleEngine: { active: true }, serverNow: new Date().toISOString() };
  }, saveDeck: (body) => savePvpDeckWithMagic(env, 1, Number(body.presetNo), body.cardIds, body.magicCardIds) };
}
