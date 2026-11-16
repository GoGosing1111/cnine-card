// Installed explicitly by an audited transaction, never by a game-page read.
// Deferred role triggers observe the final roster, including season replacement
// and executive refreshes that delete and reinsert an unchanged set of elders.
export const CLAN_ELDER_TITLE_POLICY='clan-elder-commander-20261116-v1';
export const CLAN_ELDER_TITLE_SQL=String.raw`
CREATE TABLE IF NOT EXISTS clan_elder_title_events_v1(
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id BIGINT NOT NULL,title_id BIGINT NOT NULL,action TEXT NOT NULL CHECK(action IN('GRANT','REVOKE')),
 source_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS clan_elder_title_events_user_v1 ON clan_elder_title_events_v1(user_id,id);

CREATE OR REPLACE VIEW clan_elder_title_eligible_v1 AS
 SELECT m.user_id,r.id AS round_id,m.organization_id AS clan_id
 FROM organization_rounds_v1 r
 JOIN app_meta a ON a.key='clan_resumption_v1' AND a.value::jsonb->>'roundId'=r.id
 JOIN organization_faction_state_v1 f ON f.round_id=r.id
 CROSS JOIN LATERAL jsonb_each(COALESCE(f.state_json::jsonb->'elders','{}'::jsonb)) e
 CROSS JOIN LATERAL jsonb_array_elements_text(e.value) p(uid)
 JOIN organization_members_v1 m ON m.round_id=r.id AND m.organization_id=e.key::integer AND m.user_id=p.uid::bigint
 JOIN clan_members c ON c.season_id=(a.value::jsonb->>'seasonId')::bigint AND c.clan_id=m.organization_id AND c.user_id=m.user_id
 JOIN clan_executives x ON x.season_id=c.season_id AND x.clan_id=c.clan_id AND x.user_id=c.user_id
 WHERE r.scope='LIVE' AND r.phase='ASSIGNED' AND a.value::jsonb->>'enabled'='true';

CREATE OR REPLACE FUNCTION cnine_sync_clan_elder_title_v1(target_user BIGINT DEFAULT NULL)
 RETURNS JSONB LANGUAGE plpgsql AS $fn$
DECLARE title BIGINT; granted INTEGER; revoked INTEGER;
BEGIN
 SELECT id INTO title FROM character_titles WHERE code='SPECIAL_OPS_COMMANDER' FOR KEY SHARE;
 IF title IS NULL THEN RETURN jsonb_build_object('granted',0,'revoked',0); END IF;
 -- Lock ownership before loadouts, matching the equip guard. A concurrent equip
 -- either commits before this removal or fails after the ownership is removed.
 PERFORM 1 FROM user_character_titles WHERE title_id=title AND (target_user IS NULL OR user_id=target_user) ORDER BY user_id FOR UPDATE;
 DELETE FROM user_title_loadout l WHERE l.title_id=title AND (target_user IS NULL OR l.user_id=target_user)
  AND NOT EXISTS(SELECT 1 FROM clan_elder_title_eligible_v1 e WHERE e.user_id=l.user_id);
 WITH removed AS (
  DELETE FROM user_character_titles u WHERE u.title_id=title AND (target_user IS NULL OR u.user_id=target_user)
   AND NOT EXISTS(SELECT 1 FROM clan_elder_title_eligible_v1 e WHERE e.user_id=u.user_id)
   RETURNING u.user_id,u.title_id,COALESCE(u.source_id,'') source_id
 ) INSERT INTO clan_elder_title_events_v1(user_id,title_id,action,source_id)
   SELECT user_id,title_id,'REVOKE',source_id FROM removed;
 GET DIAGNOSTICS revoked=ROW_COUNT;
 WITH added AS (
  INSERT INTO user_character_titles(user_id,title_id,source_type,source_id)
   SELECT e.user_id,title,'CLAN_ELDER',e.round_id||':'||e.clan_id FROM clan_elder_title_eligible_v1 e
   WHERE target_user IS NULL OR e.user_id=target_user
   ON CONFLICT(user_id,title_id) DO NOTHING RETURNING user_id,title_id,source_id
 ) INSERT INTO clan_elder_title_events_v1(user_id,title_id,action,source_id)
   SELECT user_id,title_id,'GRANT',source_id FROM added;
 GET DIAGNOSTICS granted=ROW_COUNT;
 UPDATE user_character_titles u SET source_type='CLAN_ELDER',source_id=e.round_id||':'||e.clan_id,expires_at=NULL
  FROM clan_elder_title_eligible_v1 e WHERE u.user_id=e.user_id AND u.title_id=title
  AND (target_user IS NULL OR u.user_id=target_user)
  AND (u.source_type IS DISTINCT FROM 'CLAN_ELDER' OR u.source_id IS DISTINCT FROM e.round_id||':'||e.clan_id OR u.expires_at IS NOT NULL);
 RETURN jsonb_build_object('granted',granted,'revoked',revoked);
END $fn$;

CREATE OR REPLACE FUNCTION cnine_clan_elder_title_role_changed_v1()
 RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_TABLE_NAME IN('organization_members_v1','clan_members','clan_executives') THEN
  IF TG_OP<>'INSERT' THEN PERFORM cnine_sync_clan_elder_title_v1(OLD.user_id); END IF;
  IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
   PERFORM cnine_sync_clan_elder_title_v1(NEW.user_id);
  END IF;
 ELSE
  PERFORM cnine_sync_clan_elder_title_v1(NULL);
 END IF;
 RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION cnine_clan_elder_title_ownership_v1()
 RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP<>'INSERT' AND EXISTS(SELECT 1 FROM character_titles WHERE id=OLD.title_id AND code='SPECIAL_OPS_COMMANDER') THEN
  PERFORM cnine_sync_clan_elder_title_v1(OLD.user_id);
 END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND (NEW.user_id,NEW.title_id) IS DISTINCT FROM (OLD.user_id,OLD.title_id)) THEN
  IF EXISTS(SELECT 1 FROM character_titles WHERE id=NEW.title_id AND code='SPECIAL_OPS_COMMANDER') THEN
   PERFORM cnine_sync_clan_elder_title_v1(NEW.user_id);
  END IF;
 END IF;
 RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION cnine_clan_elder_title_equip_guard_v1()
 RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
 IF EXISTS(SELECT 1 FROM character_titles WHERE id=NEW.title_id AND code='SPECIAL_OPS_COMMANDER') THEN
  PERFORM 1 FROM user_character_titles WHERE user_id=NEW.user_id AND title_id=NEW.title_id FOR KEY SHARE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM clan_elder_title_eligible_v1 WHERE user_id=NEW.user_id) THEN
   RAISE EXCEPTION '특공사령관은 현재 클랜 원로만 장착할 수 있습니다.' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $fn$;

CREATE CONSTRAINT TRIGGER clan_elder_title_membership_v1 AFTER INSERT OR DELETE OR UPDATE OF round_id,user_id,organization_id
 ON organization_members_v1 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_regular_member_v1 AFTER INSERT OR DELETE OR UPDATE OF season_id,clan_id,user_id
 ON clan_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_executive_v1 AFTER INSERT OR DELETE OR UPDATE OF season_id,clan_id,user_id
 ON clan_executives DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_faction_rows_v1 AFTER INSERT OR DELETE
 ON organization_faction_state_v1 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_faction_roles_v1 AFTER UPDATE OF state_json
 ON organization_faction_state_v1 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 WHEN(OLD.state_json IS DISTINCT FROM NEW.state_json AND (OLD.state_json::jsonb->'elders') IS DISTINCT FROM (NEW.state_json::jsonb->'elders'))
 EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_round_v1 AFTER INSERT OR DELETE OR UPDATE OF scope,phase
 ON organization_rounds_v1 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_release_insert_v1 AFTER INSERT ON app_meta DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN(NEW.key='clan_resumption_v1') EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_release_delete_v1 AFTER DELETE ON app_meta DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN(OLD.key='clan_resumption_v1') EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_release_update_v1 AFTER UPDATE OF key,value ON app_meta DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW WHEN((OLD.key='clan_resumption_v1' OR NEW.key='clan_resumption_v1') AND (OLD.key,OLD.value) IS DISTINCT FROM (NEW.key,NEW.value))
 EXECUTE FUNCTION cnine_clan_elder_title_role_changed_v1();
CREATE CONSTRAINT TRIGGER clan_elder_title_ownership_v1 AFTER INSERT OR DELETE OR UPDATE OF user_id,title_id
 ON user_character_titles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cnine_clan_elder_title_ownership_v1();
CREATE TRIGGER clan_elder_title_equip_v1 BEFORE INSERT OR UPDATE OF user_id,title_id
 ON user_title_loadout FOR EACH ROW EXECUTE FUNCTION cnine_clan_elder_title_equip_guard_v1();

-- New audit objects must be usable by the existing game and operations roles.
-- Their privileges on all existing account/roster tables remain unchanged.
REVOKE ALL ON FUNCTION cnine_sync_clan_elder_title_v1(bigint),cnine_clan_elder_title_role_changed_v1(),cnine_clan_elder_title_ownership_v1(),cnine_clan_elder_title_equip_guard_v1() FROM PUBLIC;
DO $permissions$
DECLARE recipient TEXT;
BEGIN
 FOR recipient IN SELECT rolname FROM pg_roles WHERE rolname='cnine_migrator' LOOP
  EXECUTE format('GRANT SELECT ON clan_elder_title_eligible_v1 TO %I',recipient);
  EXECUTE format('GRANT SELECT,INSERT ON clan_elder_title_events_v1 TO %I',recipient);
  EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE clan_elder_title_events_v1_id_seq TO %I',recipient);
  EXECUTE format('GRANT EXECUTE ON FUNCTION cnine_sync_clan_elder_title_v1(bigint),cnine_clan_elder_title_role_changed_v1(),cnine_clan_elder_title_ownership_v1(),cnine_clan_elder_title_equip_guard_v1() TO %I',recipient);
 END LOOP;
END $permissions$;
`;
