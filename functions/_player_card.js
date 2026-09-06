// A public, read-only projection. Viewing a card never settles a season or grants a bonus.
export const PLAYER_CARD_VERSION = 2052;
import { TROPHY_CATALOG } from '../js/player-card-model-v2052.js';
export { TROPHY_CATALOG };

const QUALIFIED = "tier_id='challenger' AND final_rank BETWEEN 1 AND 10";
// Include EVERY completed season before marking streaks. An absent player breaks the chain.
const OFFICIAL = `WITH official AS (
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

const CLAN_HONORS = `FROM clan_season_settlements x
  JOIN clan_seasons s ON s.id=x.season_id
  JOIN clan_members m ON m.season_id=x.season_id AND m.clan_id=x.champion_clan_id AND m.user_id=?
  JOIN clan_organizations o ON o.id=x.champion_clan_id
  WHERE x.status='COMPLETED' AND x.completed_at IS NOT NULL AND x.reward_status<>'DISABLED_TEST'
    AND s.phase='COMPLETE' AND datetime(m.joined_at)<=datetime(x.completed_at)`;
const n = value => Math.max(0, Number(value) || 0);

export async function handlePlayerCard({ path, request, env, deps, now = Date.now() }) {
  if (path !== 'player-card') return null;
  const { authenticate, json, pvpSettings, resolvePvpTier, pvpSeasonKey } = deps;
  if (request.method !== 'GET') return json({ error: '명함은 조회만 가능합니다.' }, 405);
  if (!await authenticate(request, env)) return json({ error: '로그인이 필요합니다.' }, 401);
  const params = new URL(request.url).searchParams;
  const rawId = params.get('userId'), nickname = params.get('nickname')?.trim();
  if (rawId !== null ? !/^[1-9]\d{0,14}$/.test(rawId) || !Number.isSafeInteger(Number(rawId)) : !nickname || nickname.length > 80) {
    return json({ error: '확인할 유저를 지정해 주세요.' }, 400);
  }
  const user = await env.DB.prepare(`SELECT id,nickname,role FROM users WHERE ${rawId !== null ? 'id' : 'nickname'}=? AND status='ACTIVE'
    AND (banned_until IS NULL OR banned_until<=datetime('now'))`).bind(rawId !== null ? Number(rawId) : nickname).first();
  if (!user) return json({ error: '공개 명함을 찾을 수 없습니다.' }, 404);
  try {
    const id = Number(user.id), settings = await pvpSettings(env);
    const result = await Promise.all([
      env.DB.prepare(`WITH ranked AS (SELECT p.user_id,p.season_score,p.wins,p.losses,
        ROW_NUMBER() OVER (ORDER BY p.season_score DESC,p.wins DESC,u.nickname,u.id) position
        FROM pvp_profiles p JOIN users u ON u.id=p.user_id WHERE u.status='ACTIVE'
        AND UPPER(TRIM(COALESCE(u.role,'USER')))<>'OWNER' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now')))
        SELECT * FROM ranked WHERE user_id=?`).bind(id).first(),
      env.DB.prepare('SELECT status FROM pvp_season_settlements WHERE season_key=?').bind(pvpSeasonKey(settings)).first(),
      env.DB.prepare(RANKED_HONORS_SQL).bind(id).first(),
      env.DB.prepare(`${OFFICIAL} SELECT id,season_name,completed_at,tier_id,tier_name,final_rank,season_score,wins,losses
        FROM official WHERE final_rank IS NOT NULL ORDER BY ordinal DESC LIMIT 12`).bind(id).all(),
      env.DB.prepare(`SELECT COUNT(*) wins,MIN(x.completed_at) first_at ${CLAN_HONORS}`).bind(id).first(),
      env.DB.prepare(`SELECT s.id,s.season_no,o.name,x.completed_at ${CLAN_HONORS} ORDER BY s.season_no DESC,s.id DESC LIMIT 12`).bind(id).all(),
      env.DB.prepare(`SELECT o.id,o.name,o.mark_key,m.member_role,s.season_no FROM clan_members m
        JOIN clan_seasons s ON s.id=m.season_id JOIN clan_organizations o ON o.id=m.clan_id
        WHERE m.user_id=? AND s.id=(SELECT id FROM clan_seasons ORDER BY season_no DESC,id DESC LIMIT 1) AND o.is_active=1`).bind(id).first(),
      env.DB.prepare(`SELECT a.name,a.lobby_image FROM avatar_user_loadout_v1 l
        JOIN avatar_user_ownership_v1 o ON o.user_id=l.user_id AND o.avatar_code=l.avatar_code AND (o.expires_at IS NULL OR o.expires_at>CURRENT_TIMESTAMP)
        JOIN avatar_catalog_v1 a ON a.code=l.avatar_code AND a.is_active=1 AND a.is_public=1 WHERE l.user_id=?`).bind(id).first(),
      env.DB.prepare(`SELECT t.name,t.badge_text,t.style_preset FROM user_title_loadout l
        JOIN user_character_titles u ON u.user_id=l.user_id AND u.title_id=l.title_id AND (u.expires_at IS NULL OR u.expires_at>CURRENT_TIMESTAMP)
        JOIN character_titles t ON t.id=l.title_id AND t.is_active=1 AND t.is_public=1 WHERE l.user_id=?`).bind(id).first()
    ]);
    const [rank, settlement, stats = {}, history, clanStats = {}, clanHistory, clan, avatar, title] = result;
    const endAt = settings.endsAt && Date.parse(settings.endsAt);
    const startAt = settings.startsAt && Date.parse(settings.startsAt);
    const openSeason = !settlement && (!endAt || endAt > now) && (!startAt || startAt <= now);
    const tier = rank && openSeason ? resolvePvpTier(n(rank.season_score), settings, n(rank.position)) : null;
    const earned = {
      CLAN_CHAMPION: { count: n(clanStats.wins), acquiredAt: clanStats.first_at || null, progress: n(clanStats.wins), goal: 1 },
      CHALLENGER_STREAK_3: { count: n(stats.longest_streak) >= 3 ? 1 : 0, acquiredAt: stats.streak_at || null, progress: n(stats.current_streak), goal: 3 },
      RANKED_CHAMPION: { count: n(stats.champion_count), acquiredAt: stats.champion_at || null, progress: n(stats.champion_count), goal: 1 }
    };
    return json({ version: PLAYER_CARD_VERSION, serverNow: new Date(now).toISOString(),
      player: { id, nickname: user.nickname, title: title ? { name: title.name, badgeText: title.badge_text, stylePreset: title.style_preset } : null,
        avatar: avatar ? { name: avatar.name, image: avatar.lobby_image } : null,
        clan: clan ? { id: n(clan.id), name: clan.name, markKey: clan.mark_key, role: clan.member_role === 'MASTER' ? '클랜장' : '클랜원', season: n(clan.season_no) } : null },
      ranked: { season: settings.seasonName, state: !openSeason ? 'SETTLING' : rank ? 'RANKED' : 'UNRANKED',
        rank: tier ? n(rank.position) : null, score: tier ? n(rank.season_score) : null,
        wins: tier ? n(rank.wins) : 0, losses: tier ? n(rank.losses) : 0,
        tier: tier ? { id: tier.id, name: tier.name, color: tier.color } : null,
        bestRank: stats.best_rank ? n(stats.best_rank) : null, completedSeasons: n(stats.seasons), longestStreak: n(stats.longest_streak), currentStreak: n(stats.current_streak),
        history: (history.results || []).map(r => ({ season: r.season_name, settledAt: r.completed_at, rank: n(r.final_rank), tier: r.tier_name, tierId: r.tier_id, score: n(r.season_score) })) },
      clanHistory: (clanHistory.results || []).map(r => ({ season: n(r.season_no), clan: r.name, settledAt: r.completed_at })),
      trophies: TROPHY_CATALOG.map(t => ({ ...t, ...earned[t.code], owned: earned[t.code].count > 0, effect: { enabled: false, description: '효과 추후 공개 · 현재 미적용' } })),
      frame: { code: 'OBSIDIAN', name: '옵시디언', level: 0, enhancement: { enabled: false } },
      effects: { enabled: false, modifiers: [] }, historyLimit: 12
    });
  } catch (error) {
    // Do not turn unavailable historical data into a false "no trophies" result.
    console.error(JSON.stringify({ event: 'player_card_read_failed', message: String(error?.message || error).slice(0, 240) }));
    return json({ error: '명함 기록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.' }, 503);
  }
}
