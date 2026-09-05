// Only synthetic tables/data. PostgreSQL callers must use an outer transaction and pg_temp search_path.
export function clanParticipationFixtureSchema(postgres=false) {
  const create=postgres?'CREATE TEMP TABLE':'CREATE TABLE',int=postgres?'BIGINT':'INTEGER',now=postgres?'sqlite_now()':'CURRENT_TIMESTAMP';
  return [
    `${create} app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT ${now})`,
    `${create} users(id ${int} PRIMARY KEY,coin ${int} NOT NULL DEFAULT 0,card_shards ${int} NOT NULL DEFAULT 0)`,
    `${create} clan_wars(id ${int} PRIMARY KEY,season_id ${int},round_no ${int},status TEXT,clan_a_id ${int},clan_b_id ${int},score_a ${int} DEFAULT 0,score_b ${int} DEFAULT 0,battle_count ${int} DEFAULT 0,starts_at TEXT,ends_at TEXT,updated_at TEXT DEFAULT ${now})`,
    `${create} clan_members(season_id ${int},user_id ${int},clan_id ${int},battle_wins ${int} DEFAULT 0,battle_losses ${int} DEFAULT 0,contribution_score ${int} DEFAULT 0,updated_at TEXT DEFAULT ${now},PRIMARY KEY(season_id,user_id))`,
    `${create} clan_war_battles(id ${int} PRIMARY KEY,request_id TEXT UNIQUE,season_id ${int},war_id ${int},attacker_user_id ${int},attacker_clan_id ${int},defender_user_id ${int},defender_clan_id ${int},status TEXT,winner_clan_id ${int},result_json TEXT,error_message TEXT,updated_at TEXT DEFAULT ${now})`
  ];
}
