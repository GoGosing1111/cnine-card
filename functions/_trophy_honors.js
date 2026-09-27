import { readDuoHonors } from './_ranked_duo_seasons.js';

const QUALIFIED = "tier_id='challenger' AND final_rank BETWEEN 1 AND 20";
// Include EVERY completed season before marking streaks. An absent player breaks the chain.
export const OFFICIAL = `WITH official AS (
  SELECT s.id,s.season_name,s.completed_at,r.tier_id,r.tier_name,r.final_rank,r.season_score,r.wins,r.losses,
    ROW_NUMBER() OVER (ORDER BY s.started_at,s.id) ordinal
  FROM pvp_season_settlements s LEFT JOIN pvp_season_settlement_ranks r ON r.settlement_id=s.id AND r.user_id=?
  WHERE s.status='COMPLETED' AND s.completed_at IS NOT NULL
)`;
export const RANKED_HONORS_SQL = `${OFFICIAL}, marked AS (
  SELECT *,SUM(CASE WHEN ${QUALIFIED} THEN 0 ELSE 1 END) OVER (ORDER BY ordinal) gap FROM official
), runs AS (
  SELECT gap,COUNT(*) span,MIN(ordinal) start_order,MAX(ordinal) end_order FROM marked WHERE ${QUALIFIED} GROUP BY gap
)
SELECT (SELECT COUNT(*) FROM official WHERE final_rank IS NOT NULL) seasons,
  (SELECT MIN(final_rank) FROM official WHERE final_rank>0) best_rank,
  (SELECT COUNT(*) FROM official WHERE final_rank=1) champion_count,
  (SELECT MIN(completed_at) FROM official WHERE final_rank=1) champion_at,
  COALESCE(MAX(span),0) longest_streak,
  COALESCE(MAX(CASE WHEN end_order=(SELECT MAX(ordinal) FROM official) THEN span ELSE 0 END),0) current_streak,
  (SELECT MIN(o.completed_at) FROM runs r JOIN official o ON o.ordinal=r.start_order+2 WHERE r.span>=3) streak_at
FROM runs`;

export const CLAN_HONORS = `FROM clan_season_settlements x
  JOIN clan_seasons s ON s.id=x.season_id
  JOIN clan_members m ON m.season_id=x.season_id AND m.clan_id=x.champion_clan_id AND m.user_id=?
  JOIN clan_organizations o ON o.id=x.champion_clan_id
  WHERE x.status='COMPLETED' AND x.completed_at IS NOT NULL AND x.reward_status<>'DISABLED_TEST'
    AND s.phase IN ('COMPLETE','CHAMPIONS') AND datetime(m.joined_at)<=datetime(x.completed_at)`;
const n = value => Math.max(0, Number(value) || 0);

export const CHAMPIONS_HONORS_SQL = `SELECT COUNT(DISTINCT r.season_id) wins,MIN(r.completed_at) first_at
        FROM clan_championship_rewards r JOIN clan_championships c ON c.season_id=r.season_id
        JOIN clan_championship_members m ON m.season_id=r.season_id AND m.user_id=r.user_id AND m.clan_id=c.winner_clan_id
        WHERE r.user_id=? AND r.reward_type='CLAN_CHAMPIONS_TROPHY' AND r.reward_amount=1 AND r.status='SENT'
          AND c.status='COMPLETED' AND c.completed_at IS NOT NULL AND c.reward_status<>'DISABLED_TEST'`;

export function trophyHonors({ stats = {}, clanStats = {}, champions = {}, duo = {} }) {
  return {
      DUO_CHALLENGER: { count: n(duo.count), acquiredAt: duo.acquiredAt, progress: n(duo.count), goal: 1 },
      CLAN_CHAMPION: { count: n(clanStats.wins), acquiredAt: clanStats.first_at || null, progress: n(clanStats.wins), goal: 1 },
      CHALLENGER_STREAK_3: { count: n(stats.longest_streak) >= 3 ? 1 : 0, acquiredAt: stats.streak_at || null, progress: n(stats.current_streak), goal: 3 },
      RANKED_CHAMPION: { count: n(stats.champion_count), acquiredAt: stats.champion_at || null, progress: n(stats.champion_count), goal: 1 },
      CLAN_CHAMPIONS_TROPHY: { count: n(champions.wins), acquiredAt: champions.first_at || null, progress: n(champions.wins), goal: 1 }
    };
}

export async function readTrophyHonors(env, userId) {
  const [stats, clanStats, champions, duo] = await Promise.all([
    env.DB.prepare(RANKED_HONORS_SQL).bind(userId).first(),
    env.DB.prepare(`SELECT COUNT(*) wins,MIN(x.completed_at) first_at ${CLAN_HONORS}`).bind(userId).first(),
    env.DB.prepare(CHAMPIONS_HONORS_SQL).bind(userId).first(),
    readDuoHonors(env, userId)
  ]);
  return trophyHonors({ stats: stats || {}, clanStats: clanStats || {}, champions: champions || {}, duo });
}
