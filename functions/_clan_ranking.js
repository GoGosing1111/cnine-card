// One ordering contract for the live board, CMS and final season settlement.
// Only completed wars count: unfinished/cancelled rounds cannot break a tie.
export const CLAN_RANKED_TEAMS_SQL = `
SELECT ranked.*,combat_points-combat_points_against AS combat_point_difference
FROM (
  SELECT t.*,o.name,o.mark_key,o.primary_color,o.accent_color,o.slogan,u.nickname master_nickname,
    (SELECT COUNT(*) FROM clan_members m WHERE m.season_id=t.season_id AND m.clan_id=t.clan_id) member_count,
    COALESCE((SELECT SUM(CASE WHEN w.clan_a_id=t.clan_id THEN w.score_a ELSE w.score_b END)
      FROM clan_wars w WHERE w.season_id=t.season_id AND w.status='COMPLETED'
      AND (w.clan_a_id=t.clan_id OR w.clan_b_id=t.clan_id)),0) combat_points,
    COALESCE((SELECT SUM(CASE WHEN w.clan_a_id=t.clan_id THEN w.score_b ELSE w.score_a END)
      FROM clan_wars w WHERE w.season_id=t.season_id AND w.status='COMPLETED'
      AND (w.clan_a_id=t.clan_id OR w.clan_b_id=t.clan_id)),0) combat_points_against
  FROM clan_season_teams t JOIN clan_organizations o ON o.id=t.clan_id
  LEFT JOIN users u ON u.id=t.master_user_id WHERE t.season_id=?
) ranked
ORDER BY score DESC,combat_points DESC,combat_point_difference DESC,
  wins DESC,losses ASC,draft_position ASC,clan_id ASC`;

export function clanCombatStats(row) {
  return {combatPoints:Number(row?.combat_points||0),combatPointsAgainst:Number(row?.combat_points_against||0),combatPointDifference:Number(row?.combat_point_difference||0)};
}
