import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const source=fs.readFileSync(new URL('../functions/_evolution.js',import.meta.url),'utf8');
const zenithStart=source.indexOf('async function zenithAttempt');
const zenithEnd=source.indexOf('export async function handleEvolution');
const zenith=source.slice(zenithStart,zenithEnd);

assert.ok(zenithStart>=0&&zenithEnd>zenithStart,'ZENITH evolution handler must exist');
assert.match(zenith,/UPDATE user_cards SET quantity=0,breakthrough_level=0/,'successful ZENITH evolution must remove the whole enhanced source card entry');
assert.doesNotMatch(zenith,/SET quantity=quantity-1/,'ZENITH evolution must not leave duplicate copies sharing the +13 level');
assert.match(zenith,/source_quantity_before,source_quantity_after/,'future evolution logs must record source quantities before and after');

const migration=fs.readFileSync(new URL('../database/migrations/0079_v1703_zenith_source_consumption.sql',import.meta.url),'utf8');
assert.match(migration,/card_evolution_source_repairs_v1703/);
assert.match(migration,/UPDATE pve_decks/);
assert.match(migration,/UPDATE pvp_decks/);
assert.match(migration,/UPDATE pvp_deck_presets/);
assert.match(migration,/UPDATE user_cards\s+SET quantity=0,breakthrough_level=0/);
assert.match(migration,/NOT EXISTS \(\s*SELECT 1 FROM draw_logs/,'repair must preserve genuinely reacquired cards');

const db=new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE card_evolution_logs(id INTEGER PRIMARY KEY,user_id INTEGER,source_card_id TEXT,evolution_type TEXT,is_success INTEGER,source_consumed INTEGER,created_at TEXT);
  CREATE TABLE user_cards(user_id INTEGER,card_id TEXT,quantity INTEGER,breakthrough_level INTEGER,last_obtained_at TEXT,PRIMARY KEY(user_id,card_id));
  CREATE TABLE draw_logs(id INTEGER PRIMARY KEY,user_id INTEGER,card_id TEXT,created_at TEXT);
  CREATE TABLE pve_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE pvp_decks(user_id INTEGER PRIMARY KEY,card_ids TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE pvp_deck_presets(user_id INTEGER,preset_no INTEGER,card_ids TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,preset_no));
  CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
  INSERT INTO card_evolution_logs VALUES(10,1,'limited-a','LIMITED_TO_ZENITH',1,1,'2026-08-14 10:00:00');
  INSERT INTO card_evolution_logs VALUES(20,2,'limited-b','LIMITED_TO_ZENITH',1,1,'2026-08-14 10:00:00');
  INSERT INTO user_cards VALUES(1,'limited-a',2,13,'2026-08-14 10:00:00');
  INSERT INTO user_cards VALUES(2,'limited-b',1,13,'2026-08-14 10:05:00');
  INSERT INTO draw_logs VALUES(1,2,'limited-b','2026-08-14 10:05:00');
  INSERT INTO pve_decks VALUES(1,'["limited-a","safe-card"]',CURRENT_TIMESTAMP);
  INSERT INTO pvp_decks VALUES(1,'["limited-a","safe-card"]',CURRENT_TIMESTAMP);
  INSERT INTO pvp_deck_presets VALUES(1,1,'["limited-a","safe-card"]',CURRENT_TIMESTAMP);
`);
db.exec(migration);
assert.deepEqual({...db.prepare("SELECT quantity,breakthrough_level FROM user_cards WHERE user_id=1 AND card_id='limited-a'").get()},{quantity:0,breakthrough_level:0});
assert.equal(db.prepare('SELECT COUNT(*) count FROM card_evolution_source_repairs_v1703').get().count,1);
assert.equal(db.prepare("SELECT card_ids FROM pve_decks WHERE user_id=1").get().card_ids,'["safe-card"]');
assert.equal(db.prepare("SELECT card_ids FROM pvp_decks WHERE user_id=1").get().card_ids,'["safe-card"]');
assert.equal(db.prepare("SELECT card_ids FROM pvp_deck_presets WHERE user_id=1 AND preset_no=1").get().card_ids,'["safe-card"]');
assert.deepEqual({...db.prepare("SELECT quantity,breakthrough_level FROM user_cards WHERE user_id=2 AND card_id='limited-b'").get()},{quantity:1,breakthrough_level:13},'a genuinely reacquired source card must be preserved');

console.log('ZENITH evolution V1703: source fully consumed, affected decks scrubbed, audit quantities recorded');
