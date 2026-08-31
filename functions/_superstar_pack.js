const SETTINGS_KEY = "superstar_pack_settings_v1";
export const SUPERSTAR_PACK_ID = "superstar";
export const SUPERSTAR_PACK_EARLY_ACCESS_NICKNAMES = Object.freeze(["조은", "강구열", "진짜디임", "오리꿍", "요닝"]);
export const SUPERSTAR_PACK_DEFAULTS = Object.freeze({
  visible: true,
  drawEnabled: false,
  price: 300_000_000,
  successRate: 10,
  drawCount: 1,
  imageUrl: "assets/ui/packs/superstar-card-pack-v1.png",
});

const superstarPackEarlyAccessNicknames = new Set(SUPERSTAR_PACK_EARLY_ACCESS_NICKNAMES);

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const cleanBoolean = (value, fallback) => {
  if (value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true") return true;
  if (value === false || value === 0 || value === "0" || String(value).toLowerCase() === "false") return false;
  return fallback;
};

export function cleanSuperstarPackSettings(raw = {}) {
  return {
    visible: cleanBoolean(raw.visible, SUPERSTAR_PACK_DEFAULTS.visible),
    drawEnabled: cleanBoolean(raw.drawEnabled ?? raw.enabled, SUPERSTAR_PACK_DEFAULTS.drawEnabled),
    price: Math.round(clamp(raw.price, 1, 2_000_000_000, SUPERSTAR_PACK_DEFAULTS.price)),
    successRate: Math.round(clamp(raw.successRate, 0, 100, SUPERSTAR_PACK_DEFAULTS.successRate) * 100) / 100,
    drawCount: 1,
    imageUrl: String(raw.imageUrl || SUPERSTAR_PACK_DEFAULTS.imageUrl).trim().slice(0, 500),
  };
}

let settingsCache = null;
export async function superstarPackSettings(env, fresh = false) {
  const now = Date.now();
  if (!fresh && settingsCache?.expiresAt > now) return settingsCache.promise;
  const promise = env.DB.prepare("SELECT value FROM app_meta WHERE key=?")
    .bind(SETTINGS_KEY)
    .first()
    .then((row) => {
      try {
        return cleanSuperstarPackSettings(JSON.parse(row?.value || "{}"));
      } catch {
        return cleanSuperstarPackSettings();
      }
    })
    .catch((error) => {
      if (settingsCache?.promise === promise) settingsCache = null;
      throw error;
    });
  settingsCache = { promise, expiresAt: now + 5_000 };
  return promise;
}

export function superstarPackCatalogRow(settings = SUPERSTAR_PACK_DEFAULTS) {
  const clean = cleanSuperstarPackSettings(settings);
  return {
    id: SUPERSTAR_PACK_ID,
    name: "슈퍼스타팩",
    subtitle: "SUPERSTAR CHAMPIONSHIP PACK",
    description: "1회 1장 판정 · SUPERSTAR 10% · 꽝 90%",
    theme: "superstar",
    price: clean.price,
    originalPrice: clean.price,
    allowed_rarities: JSON.stringify(["SUPERSTAR"]),
    allowed: ["SUPERSTAR"],
    guarantee_10: null,
    guarantee_20: null,
    pickup_member_id: null,
    pickup_multiplier: 1,
    is_active: 1,
    sort_order: 999,
    range: `SUPERSTAR ${clean.successRate}% · 꽝 ${Math.max(0, 100 - clean.successRate)}%`,
    drawMode: "SUPERSTAR_CHANCE",
    drawEnabled: clean.drawEnabled,
    ownerDrawEnabled: true,
    maxDrawCount: 1,
    successRate: clean.successRate,
    missRate: Math.max(0, 100 - clean.successRate),
    imageUrl: clean.imageUrl,
    revealMode: "SWIPE",
  };
}

export function resolveSuperstarPackRoll({ successRate = 10, hitRoll = 0, cardRoll = 0, cards = [] } = {}) {
  const rate = clamp(successRate, 0, 100, 10);
  const normalizedHit = clamp(hitRoll, 0, 0.999999999999, 0);
  const hit = normalizedHit * 100 < rate;
  if (!hit) return { outcome: "MISS", hit: false, card: null };
  if (!Array.isArray(cards) || !cards.length) throw new Error("SUPERSTAR 당첨 카드가 등록되지 않았습니다.");
  const normalizedCard = clamp(cardRoll, 0, 0.999999999999, 0);
  return { outcome: "WIN", hit: true, card: cards[Math.floor(normalizedCard * cards.length)] };
}

export function canOpenSuperstarPack(settings = SUPERSTAR_PACK_DEFAULTS, user = null) {
  const nickname = String(user?.nickname || "").normalize("NFC").trim();
  return cleanBoolean(settings?.drawEnabled, false)
    || String(user?.role || "").trim().toUpperCase() === "OWNER"
    || superstarPackEarlyAccessNicknames.has(nickname);
}

const secureUnit = () => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 0x1_0000_0000;
};

const foundationByDatabase = new WeakMap();
function superstarPackSchemaStatements(env) {
  const postgres = env.DB?.dialect === "postgres";
  const userIdType = postgres ? "BIGINT" : "INTEGER";
  const amountType = postgres ? "BIGINT" : "INTEGER";
  // PostgreSQL D1 호환 계층은 CURRENT_TIMESTAMP를 UTC 문자열 함수로 변환한다.
  // 영수증 시간도 TEXT로 통일해 D1과 PostgreSQL에서 같은 비교/복구 규칙을 쓴다.
  const nowDefault = postgres
    ? "to_char(timezone('UTC',CURRENT_TIMESTAMP),'YYYY-MM-DD HH24:MI:SS')"
    : "CURRENT_TIMESTAMP";
  return [
    `CREATE TABLE IF NOT EXISTS superstar_pack_receipts_v1(
      request_id TEXT PRIMARY KEY,user_id ${userIdType} NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
      outcome TEXT,card_id TEXT,cost ${amountType} NOT NULL DEFAULT 0,response_json TEXT,error_message TEXT,
      created_at TEXT NOT NULL DEFAULT ${nowDefault},updated_at TEXT NOT NULL DEFAULT ${nowDefault}
    )`,
    `CREATE TABLE IF NOT EXISTS superstar_pack_debits_v1(
      request_id TEXT PRIMARY KEY,user_id ${userIdType} NOT NULL,cost ${amountType} NOT NULL,
      created_at TEXT NOT NULL DEFAULT ${nowDefault}
    )`,
    "CREATE INDEX IF NOT EXISTS idx_superstar_pack_receipts_user ON superstar_pack_receipts_v1(user_id,created_at DESC)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_superstar_pack_one_pending_per_user ON superstar_pack_receipts_v1(user_id) WHERE status='PENDING'",
    "CREATE INDEX IF NOT EXISTS idx_superstar_pack_debits_user ON superstar_pack_debits_v1(user_id,created_at DESC)",
  ];
}

async function ensureSuperstarPackFoundation(env) {
  if (foundationByDatabase.has(env.DB)) return foundationByDatabase.get(env.DB);
  const schema = superstarPackSchemaStatements(env);
  // PostgreSQL 호환 계층은 일반 prepare()/batch()의 DDL을 의도적으로 건너뛴다.
  // 사용자 입력이 없는 고정 DDL만 execSchema()로 전달해 신규 배포에서도 relation을 만든다.
  const operation = env.DB?.dialect === "postgres" && typeof env.DB.execSchema === "function"
    ? env.DB.execSchema(schema)
    : env.DB.batch(schema.map((sql) => env.DB.prepare(sql)));
  const promise = operation.catch((error) => {
    foundationByDatabase.delete(env.DB);
    throw error;
  });
  foundationByDatabase.set(env.DB, promise);
  return promise;
}

const cardRow = (row) => ({
  id: String(row.id),
  title: String(row.title || "SUPERSTAR"),
  name: String(row.name || ""),
  grade: "SUPERSTAR",
  image: String(row.image || ""),
  focusX: Number(row.focusX ?? 50),
  focusY: Number(row.focusY ?? 50),
  powerType: String(row.powerType || "FIXED"),
  basePower: Number(row.basePower || 7000),
});

async function completedReceipt(env, requestId, userId) {
  const row = await env.DB.prepare("SELECT status,response_json,error_message FROM superstar_pack_receipts_v1 WHERE request_id=? AND user_id=?")
    .bind(requestId, userId)
    .first();
  if (row?.status === "COMPLETED" && row.response_json) {
    try { return { response: JSON.parse(row.response_json) }; } catch { /* fall through */ }
  }
  return { row };
}

export async function handleSuperstarPackDraw({ request, env, deps }) {
  const { authenticate, json, readBody } = deps;
  const user = await authenticate(request, env);
  if (!user) return json({ error: "로그인이 필요합니다." }, 401);

  const requestOrigin = String(request.headers.get("origin") || "");
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if ((requestOrigin && requestOrigin !== new URL(request.url).origin) || fetchSite === "cross-site") {
    return json({ error: "외부 사이트에서는 뽑기를 실행할 수 없습니다.", code: "DRAW_EXTERNAL_REQUEST_BLOCKED" }, 403);
  }
  const browserId = String(request.headers.get("x-cnine-draw-client") || "").trim();
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(browserId)) {
    return json({ error: "정상 게임 화면에서 다시 시도해주세요.", code: "DRAW_CLIENT_REQUIRED" }, 403);
  }

  const body = await readBody(request);
  if (body.count !== undefined && Number(body.count) !== 1) {
    return json({ error: "슈퍼스타팩은 한 번에 1장만 판정할 수 있습니다.", code: "SUPERSTAR_SINGLE_DRAW_ONLY" }, 400);
  }
  const requestId = String(body.requestId || crypto.randomUUID()).trim().slice(0, 100);
  if (!requestId) return json({ error: "슈퍼스타팩 개봉 요청번호가 필요합니다." }, 400);

  const settings = await superstarPackSettings(env, true);
  if (!canOpenSuperstarPack(settings, user)) {
    return json({
      error: "슈퍼스타팩은 현재 지정된 사전 개봉 계정만 이용할 수 있으며 일반 유저 개봉은 OFF 상태입니다.",
      code: "SUPERSTAR_PACK_OFF",
      drawEnabled: false,
    }, 423);
  }

  await ensureSuperstarPackFoundation(env);
  const staleBefore = new Date(Date.now() - 3 * 60_000).toISOString().replace("T", " ").slice(0, 19);
  await env.DB.prepare("UPDATE superstar_pack_receipts_v1 SET status='FAILED',error_message='만료된 개봉 요청입니다.',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='PENDING' AND updated_at<?")
    .bind(user.id, staleBefore)
    .run();
  const prior = await completedReceipt(env, requestId, user.id);
  if (prior.response) return json(prior.response);
  if (prior.row) {
    return json({
      error: prior.row.status === "PENDING" ? "같은 슈퍼스타팩 요청을 처리 중입니다." : String(prior.row.error_message || "이 요청은 이미 실패했습니다."),
      code: prior.row.status === "PENDING" ? "SUPERSTAR_DRAW_PENDING" : "SUPERSTAR_DRAW_FAILED",
      requestId,
    }, 409);
  }

  const claimed = await env.DB.prepare("INSERT OR IGNORE INTO superstar_pack_receipts_v1(request_id,user_id,status) VALUES(?,?,'PENDING')")
    .bind(requestId, user.id)
    .run();
  if (!Number(claimed.meta?.changes || 0)) {
    const duplicate = await completedReceipt(env, requestId, user.id);
    if (duplicate.response) return json(duplicate.response);
    return json({ error: "같은 슈퍼스타팩 요청을 처리 중입니다.", code: "SUPERSTAR_DRAW_PENDING", requestId }, 409);
  }

  let committed = false;
  try {
    const [fresh, candidateRows] = await Promise.all([
      env.DB.prepare("SELECT id,coin,card_shards FROM users WHERE id=? AND status='ACTIVE'").bind(user.id).first(),
      env.DB.prepare(`SELECT c.id,c.title,m.name,c.image_url AS image,c.focus_x AS focusX,c.focus_y AS focusY,
          c.power_type AS powerType,c.base_power AS basePower
        FROM cards_effective_v1210 c JOIN members m ON m.id=c.member_id
        WHERE UPPER(c.rarity)='SUPERSTAR' AND c.is_active=1
          AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' AND m.is_active=1
        ORDER BY c.id`).all(),
    ]);
    if (!fresh) throw new Error("유저 정보를 확인하지 못했습니다.");
    if (Number(fresh.coin || 0) < settings.price) {
      await env.DB.prepare("UPDATE superstar_pack_receipts_v1 SET status='FAILED',cost=?,error_message='코인이 부족합니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=?")
        .bind(settings.price, requestId, user.id)
        .run();
      return json({ error: "코인이 부족합니다." }, 400);
    }
    const candidates = (candidateRows.results || []).map(cardRow);
    if (!candidates.length) throw new Error("개봉 가능한 SUPERSTAR 카드가 등록되지 않았습니다.");

    const roll = resolveSuperstarPackRoll({
      successRate: settings.successRate,
      hitRoll: secureUnit(),
      cardRoll: secureUnit(),
      cards: candidates,
    });
    const owned = roll.hit
      ? await env.DB.prepare("SELECT quantity FROM user_cards WHERE user_id=? AND card_id=?").bind(user.id, roll.card.id).first()
      : null;
    const quantityBefore = Math.max(0, Number(owned?.quantity || 0));
    const duplicate = roll.hit && quantityBefore > 0;
    const shardGained = duplicate ? 600 : 0;
    const coinAfter = Number(fresh.coin || 0) - settings.price;
    const shardsAfter = Number(fresh.card_shards || 0) + shardGained;
    const response = {
      requestId,
      packId: SUPERSTAR_PACK_ID,
      count: 1,
      cost: settings.price,
      successRate: settings.successRate,
      outcome: roll.outcome,
      hit: roll.hit,
      card: roll.card,
      duplicate,
      shardGained,
      quantityBefore,
      quantityAfter: roll.hit ? quantityBefore + 1 : quantityBefore,
      coin: coinAfter,
      cardShards: shardsAfter,
      drawProtocol: { version: 1, status: "COMPLETED", revealMode: "SWIPE" },
    };

    const guarded = "EXISTS(SELECT 1 FROM superstar_pack_debits_v1 d WHERE d.request_id=? AND d.user_id=?)";
    const statements = [
      env.DB.prepare(`INSERT OR IGNORE INTO superstar_pack_debits_v1(request_id,user_id,cost)
        SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND status='ACTIVE' AND coin>=?)`)
        .bind(requestId, user.id, settings.price, user.id, settings.price),
      env.DB.prepare(`UPDATE users SET coin=coin-?,card_shards=card_shards+? WHERE id=? AND ${guarded}`)
        .bind(settings.price, shardGained, user.id, requestId, user.id),
    ];
    if (roll.hit) {
      statements.push(
        env.DB.prepare(`INSERT INTO user_cards(user_id,card_id,quantity)
          SELECT ?,?,1 WHERE ${guarded}
          ON CONFLICT(user_id,card_id) DO UPDATE SET quantity=user_cards.quantity+1,last_obtained_at=CURRENT_TIMESTAMP`)
          .bind(user.id, roll.card.id, requestId, user.id),
        env.DB.prepare(`INSERT INTO draw_logs(draw_group_id,user_id,pack_id,card_id,rarity,coin_used,is_new)
          SELECT ?,?,?,?,?,?,? WHERE ${guarded}`)
          .bind(requestId, user.id, SUPERSTAR_PACK_ID, roll.card.id, "SUPERSTAR", settings.price, duplicate ? 0 : 1, requestId, user.id),
      );
    }
    statements.push(
      env.DB.prepare(`INSERT INTO coin_logs(user_id,change_amount,balance_after,reason)
        SELECT ?,-?,coin,'SUPERSTAR_PACK_DRAW' FROM users WHERE id=? AND ${guarded}`)
        .bind(user.id, settings.price, user.id, requestId, user.id),
    );
    if (shardGained > 0) {
      statements.push(
        env.DB.prepare(`INSERT INTO shard_logs(user_id,change_amount,balance_after,reason,card_id)
          SELECT ?,?,card_shards,'SUPERSTAR_DUPLICATE',? FROM users WHERE id=? AND ${guarded}`)
          .bind(user.id, shardGained, roll.card.id, user.id, requestId, user.id),
      );
    }
    statements.push(
      env.DB.prepare(`UPDATE superstar_pack_receipts_v1 SET status='COMPLETED',outcome=?,card_id=?,cost=?,response_json=?,error_message=NULL,updated_at=CURRENT_TIMESTAMP
        WHERE request_id=? AND user_id=? AND ${guarded}`)
        .bind(roll.outcome, roll.card?.id || null, settings.price, JSON.stringify(response), requestId, user.id, requestId, user.id),
    );
    const batchResults = await env.DB.batch(statements);
    if (!Number(batchResults?.[0]?.meta?.changes || 0)) {
      await env.DB.prepare("UPDATE superstar_pack_receipts_v1 SET status='FAILED',cost=?,error_message='코인이 부족합니다.',updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'")
        .bind(settings.price, requestId, user.id)
        .run();
      return json({ error: "코인이 부족합니다." }, 400);
    }
    committed = true;
    const actual = await env.DB.prepare("SELECT coin,card_shards FROM users WHERE id=?").bind(user.id).first().catch(() => null);
    if (actual) {
      response.coin = Number(actual.coin ?? response.coin);
      response.cardShards = Number(actual.card_shards ?? response.cardShards);
      await env.DB.prepare("UPDATE superstar_pack_receipts_v1 SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='COMPLETED'")
        .bind(JSON.stringify(response), requestId, user.id)
        .run()
        .catch(() => {});
    }
    return json(response);
  } catch (error) {
    if (!committed) {
      const completed = await completedReceipt(env, requestId, user.id).catch(() => ({}));
      if (completed?.response) return json(completed.response);
      await env.DB.prepare("UPDATE superstar_pack_receipts_v1 SET status='FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE request_id=? AND user_id=? AND status='PENDING'")
        .bind(String(error?.message || "슈퍼스타팩 개봉에 실패했습니다.").slice(0, 300), requestId, user.id)
        .run()
        .catch(() => {});
    }
    return json({ error: String(error?.message || "슈퍼스타팩 개봉에 실패했습니다."), requestId }, 409);
  }
}

export const __superstarPackTest = {
  cleanSuperstarPackSettings,
  superstarPackCatalogRow,
  resolveSuperstarPackRoll,
  canOpenSuperstarPack,
  superstarPackSchemaStatements,
};
