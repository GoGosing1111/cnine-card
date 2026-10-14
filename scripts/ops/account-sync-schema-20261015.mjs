// Additive PostgreSQL migration. All source rows and economic values are untouched.
export const ACCOUNT_SYNC_TABLES=Object.freeze({
 users:['id','wallet'],user_cards:['user_id','collection'],cnine_user_inventory:['user_id','inventory'],user_inventory:['user_id','inventory'],
 user_mercenary_cards_v1:['user_id','collection'],user_mercenary_growth_v1:['user_id','loadout'],user_mercenary_loadout_v1:['user_id','loadout'],
 pve_decks:['user_id','loadout'],pvp_decks:['user_id','loadout'],pvp_active_presets:['user_id','loadout'],pvp_deck_presets:['user_id','loadout'],magic_card_loadouts:['user_id','loadout'],user_magic_cards:['user_id','collection'],
 user_equipment_instances:['user_id','inventory'],user_equipment_loadout:['user_id','loadout'],user_skill_chip_loadout_v2046:['user_id','loadout'],
 avatar_user_loadout_v1:['user_id','loadout'],avatar_user_ownership_v1:['user_id','collection'],equipment_forge_states_v1:['user_id','inventory'],user_title_loadout:['user_id','loadout'],user_garage_loadout:['user_id','loadout'],
 account_rank_progress_v1:['user_id','wallet'],pvp_profiles:['user_id','pvp'],user_pvp_energy:['user_id','pvp'],user_battle_energy:['user_id','wallet'],user_apocalypse_energy:['user_id','wallet'],
 user_messages:['user_id','messages'],user_runtime_commands:['user_id','messages'],app_meta:['key','meta']
});
export const ACCOUNT_SYNC_SCHEMA_SQL=String.raw`
CREATE TABLE IF NOT EXISTS account_sync_versions_v1(
 user_id bigint PRIMARY KEY,revision bigint NOT NULL DEFAULT 0,domains jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION cnine_account_sync_stamp_v1() RETURNS trigger LANGUAGE plpgsql AS $sync$
DECLARE source_sql text; uid bigint; item record; scope text;
BEGIN
 IF TG_OP='INSERT' THEN source_sql:='SELECT to_jsonb(n)-ARRAY[''updated_at'',''last_login_at''] AS j FROM new_rows n';
 ELSIF TG_OP='DELETE' THEN source_sql:='SELECT to_jsonb(o)-ARRAY[''updated_at'',''last_login_at''] AS j FROM old_rows o';
 ELSE source_sql:='(SELECT to_jsonb(n)-ARRAY[''updated_at'',''last_login_at''] AS j FROM new_rows n EXCEPT SELECT to_jsonb(o)-ARRAY[''updated_at'',''last_login_at''] FROM old_rows o) UNION (SELECT to_jsonb(o)-ARRAY[''updated_at'',''last_login_at''] FROM old_rows o EXCEPT SELECT to_jsonb(n)-ARRAY[''updated_at'',''last_login_at''] FROM new_rows n)';
 END IF;
 FOR item IN EXECUTE 'SELECT DISTINCT j->>$1 AS identity FROM ('||source_sql||') changes ORDER BY 1' USING TG_ARGV[0] LOOP
  scope:=TG_ARGV[1];
  IF scope='meta' THEN
   IF item.identity ~ '^(mercenary_pvp_loadout_v1|pet_loadout_v1|pet_potentials_v1):[1-9][0-9]*$' THEN scope:='loadout';
   ELSIF item.identity ~ '^pet_collection_v1:[1-9][0-9]*$' THEN scope:='collection';
   ELSE CONTINUE; END IF;
   uid:=split_part(item.identity,':',2)::bigint;
  ELSE uid:=item.identity::bigint; END IF;
  IF uid IS NULL OR uid<1 THEN CONTINUE; END IF;
  INSERT INTO account_sync_versions_v1(user_id,revision,domains) VALUES(uid,1,jsonb_build_object(scope,'1'))
  ON CONFLICT(user_id) DO UPDATE SET revision=account_sync_versions_v1.revision+1,
   domains=account_sync_versions_v1.domains||jsonb_build_object(scope,(account_sync_versions_v1.revision+1)::text),updated_at=clock_timestamp();
 END LOOP;
 RETURN NULL;
END $sync$;
`;
export function accountSyncTriggersSql(tables=Object.keys(ACCOUNT_SYNC_TABLES)){
 return tables.map(table=>{
  const entry=ACCOUNT_SYNC_TABLES[table];if(!entry)throw Error('Unknown sync table');
  return ['INSERT','UPDATE','DELETE'].map(event=>{
   const name='cnine_sync_'+event.toLowerCase()+'_v1';
   const refs=event==='INSERT'?'NEW TABLE AS new_rows':event==='DELETE'?'OLD TABLE AS old_rows':'OLD TABLE AS old_rows NEW TABLE AS new_rows';
   return 'DROP TRIGGER IF EXISTS '+name+' ON '+table+'; CREATE TRIGGER '+name+' AFTER '+event+' ON '+table+' REFERENCING '+refs+' FOR EACH STATEMENT EXECUTE FUNCTION cnine_account_sync_stamp_v1(\''+entry[0]+'\',\''+entry[1]+'\');';
  }).join('\n');
 }).join('\n');
}
