const DROP_SCOPE = Symbol('avatarDropRequestScope');

function chanceValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 0;
}

export function applyAvatarDropRate(chance, increasePercent = 0) {
  const base = chanceValue(chance);
  const percent = Math.floor(chanceValue(increasePercent));
  return { base, percent, total: Math.min(100, base * (1 + percent / 100)) };
}

// Each API request owns its promises. Sweeps and parallel reward paths share
// one lookup without keeping ownership, expiry or operator changes globally.
export function withAvatarDropScope(env) {
  return { ...env, [DROP_SCOPE]: { settings: null, users: new Map() } };
}

async function readMode(env, scope) {
  const read = async () => {
    const row = await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind('avatar_settings_v1').first();
    try {
      const value = JSON.parse(row?.value || '{}');
      return String(value.mode || 'OFF').toUpperCase();
    } catch { return 'OFF'; }
  };
  if (!scope) return read();
  if (!scope.settings) scope.settings = read();
  return scope.settings;
}

export async function avatarDropIncreasePercent(env, userId) {
  const uid = Number(userId);
  if (!Number.isSafeInteger(uid) || uid <= 0) return 0;
  const scope = env[DROP_SCOPE];
  const read = async () => {
    const mode = await readMode(env, scope);
    if (mode !== 'ON' && mode !== 'TEST') return 0;
    const row = await env.DB.prepare(`SELECT a.effect_type,a.effect_value,e.effect_value option_value
      FROM avatar_user_loadout_v1 l
      JOIN avatar_user_ownership_v1 o ON o.user_id=l.user_id AND o.avatar_code=l.avatar_code
        AND (o.expires_at IS NULL OR o.expires_at>CURRENT_TIMESTAMP)
      JOIN avatar_catalog_v1 a ON a.code=l.avatar_code
      JOIN users u ON u.id=l.user_id
      LEFT JOIN avatar_effect_options_v1 e ON e.avatar_code=a.code AND e.effect_type='DROP_RATE_PERCENT'
      WHERE l.user_id=? AND a.is_active=1 AND a.is_public=1
        AND (?='ON' OR UPPER(COALESCE(u.role,''))='OWNER')
      ORDER BY e.option_order LIMIT 1`).bind(uid, mode).first();
    const value = row?.option_value ?? (row?.effect_type === 'DROP_RATE_PERCENT' ? row.effect_value : 0);
    return Math.floor(chanceValue(value));
  };
  if (!scope) return read();
  if (!scope.users.has(uid)) scope.users.set(uid, read());
  return scope.users.get(uid);
}

export async function resolveAvatarDropRate(env, userId, chance) {
  const base = chanceValue(chance);
  if (base === 0 || base === 100) return applyAvatarDropRate(base);
  return applyAvatarDropRate(base, await avatarDropIncreasePercent(env, userId));
}
