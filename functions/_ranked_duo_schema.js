import {ensureJointAtomicSchema} from './_joint_atomic.js';
export const DUO_CURRENT_KEY='ranked_duo_current_v1';
export const DUO_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS ranked_duo_seasons_v1(id TEXT PRIMARY KEY,status TEXT NOT NULL,revision BIGINT NOT NULL DEFAULT 0,participant_count BIGINT NOT NULL DEFAULT 0 CHECK(participant_count>=0),config_json TEXT NOT NULL,recruit_until TEXT,pair_cursor BIGINT NOT NULL DEFAULT 0,pair_policy_revision BIGINT,pairing_json TEXT,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_accounts_v1(user_id BIGINT PRIMARY KEY,source_version BIGINT NOT NULL DEFAULT 1)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_policy_version_v1(id BIGINT PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 1)`,
 `INSERT INTO ranked_duo_policy_version_v1(id,revision) VALUES(1,1) ON CONFLICT(id) DO NOTHING`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_profiles_v1(user_id BIGINT PRIMARY KEY,source_version BIGINT NOT NULL,policy_revision BIGINT NOT NULL,config_hash TEXT NOT NULL,power BIGINT NOT NULL,payload_json TEXT NOT NULL,expires_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_profile_leases_v1(user_id BIGINT PRIMARY KEY,token TEXT NOT NULL,expires_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_entries_v1(season_id TEXT NOT NULL,user_id BIGINT NOT NULL,team_id TEXT,seed_power BIGINT NOT NULL DEFAULT 0,seed_json TEXT,energy BIGINT NOT NULL DEFAULT 0 CHECK(energy>=0),energy_day TEXT,joined_at TEXT NOT NULL,PRIMARY KEY(season_id,user_id))`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_entries_pending_v1 ON ranked_duo_entries_v1(season_id,team_id,user_id)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_teams_v1(id TEXT PRIMARY KEY,season_id TEXT NOT NULL,user_a BIGINT NOT NULL,user_b BIGINT NOT NULL,seed_power BIGINT NOT NULL,score BIGINT NOT NULL,wins BIGINT NOT NULL DEFAULT 0,losses BIGINT NOT NULL DEFAULT 0,created_at TEXT NOT NULL,CHECK(user_a<>user_b))`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_rank_v1 ON ranked_duo_teams_v1(season_id,score,id)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_tickets_v1(token TEXT PRIMARY KEY,season_id TEXT NOT NULL,user_id BIGINT NOT NULL,team_id TEXT NOT NULL,opponent_id TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,UNIQUE(season_id,user_id))`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_ticket_user_v1 ON ranked_duo_tickets_v1(season_id,user_id,expires_at)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_matches_v1(id TEXT PRIMARY KEY,request_id TEXT NOT NULL,user_id BIGINT NOT NULL,season_id TEXT NOT NULL,attacker_id TEXT NOT NULL,defender_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('PENDING','COMPLETED','CANCELLED')),input_json TEXT NOT NULL,response_json TEXT,energy_cost BIGINT NOT NULL,lease_until TEXT NOT NULL,lease_token TEXT NOT NULL,winner TEXT,attacker_score_after BIGINT,defender_score_after BIGINT,created_at TEXT NOT NULL,completed_at TEXT,UNIQUE(user_id,request_id))`,
 `CREATE UNIQUE INDEX IF NOT EXISTS ranked_duo_one_pending_v1 ON ranked_duo_matches_v1(user_id) WHERE status='PENDING'`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_attack_history_v1 ON ranked_duo_matches_v1(season_id,attacker_id,created_at,id)`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_defense_history_v1 ON ranked_duo_matches_v1(season_id,defender_id,created_at,id)`
];
// Only participants have a version row. Nonparticipants incur an indexed miss;
// inventory mutations do not enqueue jobs or rewrite a shared global counter.
export const DUO_ACCOUNT_SOURCES=['user_cards','pvp_decks','pvp_deck_presets','pvp_active_presets','pvp_magic_presets','magic_card_loadouts','user_magic_cards','user_equipment_instances','user_equipment_loadout','equipment_forge_states_v1','user_garage_loadout','user_garage_vehicles','user_title_loadout','user_character_titles','user_mercenary_loadout_v1','user_mercenary_cards_v1','user_mercenary_growth_v1','card_unique_advancements_v1937'];
export const DUO_POLICY_SOURCES=['cards','card_unique_effects','magic_cards','character_equipment_items','character_garage_items','character_titles','mercenary_cms_documents_v1'];
export async function prepareDuoSchema(env){
 await ensureJointAtomicSchema(env);
 const DB=env.DB;
 if(DB.execSchema)await DB.execSchema(DUO_SCHEMA);else for(const sql of DUO_SCHEMA)await DB.prepare(sql).run();
 const rows=DB.dialect==='postgres'?(await DB.prepare("SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public'").all()).results:(await DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).results;
 const tables=new Set(rows.map(r=>r.name)),ddl=[];
 if(DB.dialect==='postgres'){
  ddl.push(`CREATE OR REPLACE FUNCTION ranked_duo_touch_account_v1() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP='DELETE' THEN UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=OLD.user_id; ELSE UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=NEW.user_id; IF TG_OP='UPDATE' AND OLD.user_id<>NEW.user_id THEN UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=OLD.user_id; END IF; END IF; RETURN NULL; END $$`);
  ddl.push(`CREATE OR REPLACE FUNCTION ranked_duo_touch_policy_v1() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE ranked_duo_policy_version_v1 SET revision=revision+1 WHERE id=1; RETURN NULL; END $$`);
  ddl.push(`CREATE OR REPLACE FUNCTION ranked_duo_touch_catalog_v1() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM ranked_duo_changed_v1) THEN UPDATE ranked_duo_policy_version_v1 SET revision=revision+1 WHERE id=1; END IF; RETURN NULL; END $$`);
 }
 for(const [kind,sources]of [['account',DUO_ACCOUNT_SOURCES],['policy',DUO_POLICY_SOURCES]])for(const table of sources){
  if(!tables.has(table))continue;
  if(DB.dialect==='postgres'){
   ddl.push(`DROP TRIGGER IF EXISTS ranked_duo_touch_v1 ON ${table}`);
   if(kind==='policy')for(const event of ['INSERT','UPDATE','DELETE']){
    const name=`ranked_duo_catalog_${event.toLowerCase()}_v1`;
    ddl.push(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
    ddl.push(`CREATE TRIGGER ${name} AFTER ${event} ON ${table} REFERENCING ${event==='DELETE'?'OLD':'NEW'} TABLE AS ranked_duo_changed_v1 FOR EACH STATEMENT EXECUTE FUNCTION ranked_duo_touch_catalog_v1()`);
   }else ddl.push(`CREATE TRIGGER ranked_duo_touch_v1 AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ranked_duo_touch_account_v1()`);
  }else for(const event of ['INSERT','UPDATE','DELETE']){
   const row=event==='DELETE'?'OLD':'NEW',body=kind==='account'?`UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=${row}.user_id;${event==='UPDATE'?' UPDATE ranked_duo_accounts_v1 SET source_version=source_version+1 WHERE user_id=OLD.user_id AND OLD.user_id<>NEW.user_id;':''}`:`UPDATE ranked_duo_policy_version_v1 SET revision=revision+1 WHERE id=1;`;
   ddl.push(`CREATE TRIGGER IF NOT EXISTS ranked_duo_${table}_${event}_v1 AFTER ${event} ON ${table} BEGIN ${body} END`);
  }
 }
 // Configuration writes are infrequent. Exclude operational leases/counters.
 const keys="'battle_settings_v1','fur_master_star_breakthrough_v1802','zenith_master_star_breakthrough_v1802','card_unique_effect_settings_v1','card_unique_advancement_settings_v1937_release','magic_card_settings_v1','mercenary_runtime_policy_v1','v3_joint_release_20260913-joint1','equipment_forge_release_20260922_v1','equipment_forge_runtime_v1'";
 if(tables.has('app_meta'))for(const event of ['INSERT','UPDATE','DELETE']){
  const row=event==='DELETE'?'OLD':'NEW',name=`ranked_duo_config_${event.toLowerCase()}_v1`;
  if(DB.dialect==='postgres'){ddl.push(`DROP TRIGGER IF EXISTS ${name} ON app_meta`);ddl.push(`CREATE TRIGGER ${name} AFTER ${event} ON app_meta FOR EACH ROW WHEN (${row}.key IN (${keys})) EXECUTE FUNCTION ranked_duo_touch_policy_v1()`);}
  else ddl.push(`CREATE TRIGGER IF NOT EXISTS ${name} AFTER ${event} ON app_meta WHEN ${row}.key IN (${keys}) BEGIN UPDATE ranked_duo_policy_version_v1 SET revision=revision+1 WHERE id=1; END`);
 }
 if(DB.execSchema)await DB.execSchema(ddl);else for(const sql of ddl)await DB.prepare(sql).run();
 return {accountSources:DUO_ACCOUNT_SOURCES.filter(t=>tables.has(t)),policySources:DUO_POLICY_SOURCES.filter(t=>tables.has(t))};
}
