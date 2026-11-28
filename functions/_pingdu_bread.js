import { CNINE_WATCH_STREAMERS, SOOP_WATCH_PREFIX } from './_soop_watch.js';
import { validSoopId } from './_soop_watch_contract.js';
import { ensureRuntimeFoundation } from './_runtime_foundation.js';
import { jointHash } from './_joint_transactions.js';
import { mercenaryRandomInt } from './_mercenary_draw_accounting.js';
import { CNINE_WINTER_BOX, WINTER_BOX_CONTENTS } from '../shared/cnine-winter-box-v1.mjs';
import { breadOdds, RATE_TOTAL, STARTER_REWARDS } from '../shared/pingdu-bread-odds.mjs';

const DAYS = 'pingdu_bread_days_v1';
const OPENS = 'pingdu_bread_opens_v1';
const POLICY = 'pingdu_bread_pool_v1';
const SCHEMA = 'pingdu_bread_catalog_schema_v2';
const SNAPSHOT = 'pingdu_bread_pool_snapshot:';
const PLAYER = 'events/pingdu-bread/';
const ADMIN = 'admin/pingdu-bread/';
const itemArt = new Map([...WINTER_BOX_CONTENTS,CNINE_WINTER_BOX].map(item => [item.code, item.image]));

function fail(message, status = 409) {
  throw Object.assign(new Error(message), { breadError: true, status });
}
const iso = value => value ? new Date(value).toISOString() : null;
const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
function activityDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > kstDay() || value < '2000-01-01') {
    fail('오늘 또는 지난 날짜를 선택하세요.', 400);
  }
  const time = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) fail('날짜를 확인하세요.', 400);
  return value;
}
function whole(value, max, title) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(title + ' 입력값을 확인하세요.', 400);
  return value;
}
function requestKey(value) {
  if (typeof value !== 'string' || !/^[\w-]{16,80}$/.test(value)) fail('요청 번호를 확인하세요.', 400);
  return value;
}
async function transaction(env, operation) {
  const db = env.DB;
  if (db?.dialect !== 'postgres' || !db.client || !db.enqueue) fail('이벤트 저장소에 연결할 수 없습니다.', 503);
  return db.enqueue(async () => {
    const q = async (text, values = []) => (await db.client.query({ text, values })).rows;
    await q('BEGIN');
    try {
      await q("SET LOCAL lock_timeout = '5s'");
      const result = await operation(q);
      await q('COMMIT');
      return result;
    } catch (error) {
      await q('ROLLBACK').catch(() => {});
      throw error;
    }
  });
}
export async function prepareBread(env) {
  await ensureRuntimeFoundation(env, SCHEMA, [SCHEMA], () => transaction(env, async q => {
    await q('SELECT pg_advisory_xact_lock(hashtext($1))', [SCHEMA]);
    await q(`CREATE TABLE IF NOT EXISTS ${DAYS} (
      user_id BIGINT NOT NULL, day DATE NOT NULL, identity_hash TEXT NOT NULL, revision TEXT NOT NULL,
      checked_at TIMESTAMPTZ NOT NULL, posts BIGINT, seconds BIGINT, board_status TEXT NOT NULL, watch_status TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 0, remaining INTEGER NOT NULL DEFAULT 0,
      settled_at TIMESTAMPTZ, settled_by BIGINT, pool TEXT, PRIMARY KEY(user_id,day),
      CHECK (remaining >= 0 AND remaining <= granted))`);
    await q(`CREATE INDEX IF NOT EXISTS pingdu_bread_days_by_date ON ${DAYS}(day,user_id)`);
    await q(`CREATE TABLE IF NOT EXISTS ${OPENS} (
      user_id BIGINT NOT NULL, request_id TEXT NOT NULL, day DATE NOT NULL, reward TEXT NOT NULL,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,request_id))`);
    await q(`CREATE INDEX IF NOT EXISTS pingdu_bread_opens_by_user ON ${OPENS}(user_id,opened_at DESC)`);
    await q("INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP),($3,'1',CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING",
      [POLICY, JSON.stringify({ revision: null, items: [] }), SCHEMA]);
    const current = await pool(q, true);
    if (!current.revision && !current.items.length) {
      const available = await catalog(q, STARTER_REWARDS.map(item => item.code));
      const starter = STARTER_REWARDS.filter(item => available.some(row => row.code === item.code && row.active));
      if (starter.length) {
        const config = {revision:crypto.randomUUID(), items:resolveItems(starter,available)};
        await q('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1', [POLICY,JSON.stringify(config)]);
      }
    }
  }));
}
function visibleDay(row) {
  if (!row) return null;
  return { day: row.day_key, revision: row.revision, checkedAt: iso(row.checked_at),
    posts: row.posts == null ? null : Number(row.posts), seconds: row.seconds == null ? null : Number(row.seconds),
    boardStatus: row.board_status, watchStatus: row.watch_status, granted: Number(row.granted),
    settledAt: iso(row.settled_at) };
}
async function dayRow(q, userId, day, lock = false) {
  const [row] = await q(`SELECT *,day::text AS day_key FROM ${DAYS} WHERE user_id=$1 AND day=$2${lock ? ' FOR UPDATE' : ''}`, [userId, day]);
  return row;
}
async function identity(q, userId) {
  const [row] = await q(`SELECT u.id,u.nickname,v.provider_user_id,m.value
    FROM users u LEFT JOIN user_second_verifications v ON v.user_id=u.id AND v.provider='PLAYDK'
    LEFT JOIN app_meta m ON m.key=$2||u.id::text WHERE u.id=$1 AND u.status='ACTIVE'`, [userId, SOOP_WATCH_PREFIX]);
  if (!row) fail('활동 중인 계정을 찾을 수 없습니다.', 404);
  let consent;
  try { consent = JSON.parse(row.value || 'null'); } catch { /* No usable record. */ }
  const linked = consent?.version === 1 && consent.userId === Number(row.id) && consent.providerUuid === row.provider_user_id && validSoopId(consent.soopUserId);
  return { uuid: row.provider_user_id || null, soopId: linked ? consent.soopUserId : null, nickname: row.nickname };
}
const signature = (who, boards) => jointHash([who.uuid, who.soopId, [...boards].sort(), CNINE_WATCH_STREAMERS.map(member => member.id)]);
async function pool(q, lock = false) {
  const [row] = await q('SELECT value FROM app_meta WHERE key=$1' + (lock ? ' FOR UPDATE' : ''), [POLICY]);
  return JSON.parse(row.value);
}
async function catalog(q, codes = null, lock = false) {
  const rows = await q(`SELECT code,name,image_url,category,rarity,is_active FROM inventory_items
    ${codes ? 'WHERE code=ANY($1::text[])' : ''} ORDER BY sort_order NULLS LAST,name,code${lock ? ' FOR SHARE' : ''}`, codes ? [codes] : []);
  return rows.map(row => {
    const path = String(row.image_url || itemArt.get(row.code) || 'assets/ui/tactical-20261030/inventory.webp');
    return {code:row.code, name:row.name || row.code, image:/^https?:\/\//i.test(path) ? path : '/' + path.replace(/^\/+/, ''),
      category:row.category || 'OTHER', rarity:row.rarity || '', active:Number(row.is_active) === 1};
  });
}
function resolveItems(input, options) {
  let rates;
  try { rates = breadOdds(input); } catch (error) { fail(error.message,400); }
  const byCode = new Map(options.map(item => [item.code,item]));
  return rates.map(row => {
    const item = byCode.get(row.code);
    if (!item || (!item.active && row.units > 0)) fail((item?.name || row.code) + ' 아이템의 지급 가능 상태를 확인하세요.', 400);
    return {...row, name:item.name, image:item.image};
  });
}
async function availableItems(q, items) {
  const codes = [...new Set(items.filter(item => (item.units ?? item.chance) > 0).map(item => item.code))];
  const rows = await q('SELECT code FROM inventory_items WHERE code=ANY($1::text[]) AND is_active=1 FOR SHARE', [codes]);
  if (rows.length !== codes.length) fail('선택한 아이템 중 현재 지급할 수 없는 항목이 있습니다.');
}
async function batchItems(q, saved) {
  // Early receipts contained the entire pool. New grants point to an immutable shared copy.
  const source = saved.startsWith('[') ? saved : (await q('SELECT value FROM app_meta WHERE key=$1', [SNAPSHOT+saved]))[0]?.value;
  if (!source) fail('지급 당시의 보상 설정을 확인할 수 없습니다.',503);
  return JSON.parse(source).map(item => ({...item, units:item.units ?? item.chance * 10000}));
}
async function savePool(env, actorId, body) {
  if (!Array.isArray(body.items) || !body.items.length) fail('보상을 한 종류 이상 추가하세요.',400);
  return transaction(env, async q => {
    const before = await pool(q, true);
    if (before.revision !== body.revision) fail('설정이 바뀌었습니다. 새로고침 후 다시 저장하세요.');
    const codes = [...new Set(body.items.map(row => row?.code))];
    const items = resolveItems(body.items, await catalog(q, codes, true));
    const next = { revision: crypto.randomUUID(), items };
    await q('UPDATE app_meta SET value=$2,updated_at=CURRENT_TIMESTAMP WHERE key=$1', [POLICY, JSON.stringify(next)]);
    await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PINGDU_BREAD_POOL','EVENT',$2,$3,$4)",
      [actorId, POLICY, JSON.stringify(before), JSON.stringify(next)]);
    return next;
  });
}
async function watchSeconds(client, soopId, streamers, day) {
  const next = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const result = await client.getWatchRanking({ userSoopIds: [soopId], streamerIds: streamers, dateGte: day, dateLt: next, pagination: { page: 1, size: 1 } });
  return result.ranking.data[0].watchSeconds;
}
async function postCount(client, uuid, boards, day) {
  const value = await client.getDailyPostCount({ userUuid: uuid, boardSlugs: boards, questDate: day });
  if (value.userUuid !== uuid || value.questDate !== day || value.timezone !== 'Asia/Seoul' ||
      JSON.stringify([...value.boardSlugs].sort()) !== JSON.stringify([...boards].sort())) throw Error('Invalid PLAY DK scope');
  return value.count;
}
async function observe(available, read) {
  if (!available) return { status: 'UNLINKED', value: null };
  try { return { status: 'OK', value: await read() }; }
  catch { return { status: 'UNAVAILABLE', value: null }; }
}
async function reviewDay(env, userId, day, services) {
  const { boardSlugs } = await services.playdkDailyQuestSettings(env);
  const start = Date.now();
  const { who, previous } = await transaction(env, async q => ({
    who: await identity(q, userId), previous: await dayRow(q, userId, day)
  }));
  const fingerprint = await signature(who, boardSlugs);
  if (previous?.settled_at || (previous?.identity_hash === fingerprint && start - Date.parse(previous.checked_at) < 20000)) return visibleDay(previous);
  const [board, watch] = await Promise.all([
    observe(who.uuid, () => postCount(services.playdkIdentityClient(env), who.uuid, boardSlugs, day)),
    observe(who.soopId, () => watchSeconds(services.playdkIdentityClient(env), who.soopId, CNINE_WATCH_STREAMERS.map(member => member.id), day))
  ]);
  return transaction(env, async q => {
    await q('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (await signature(await identity(q, userId), boardSlugs) !== fingerprint) fail('조회 중 계정 연결이 바뀌었습니다. 다시 조회하세요.');
    await q(`INSERT INTO ${DAYS}(user_id,day,identity_hash,revision,checked_at,posts,seconds,board_status,watch_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,day) DO UPDATE SET
      identity_hash=excluded.identity_hash,revision=excluded.revision,checked_at=excluded.checked_at,posts=excluded.posts,
      seconds=excluded.seconds,board_status=excluded.board_status,watch_status=excluded.watch_status
      WHERE ${DAYS}.settled_at IS NULL AND ${DAYS}.checked_at <= excluded.checked_at`,
      [userId,day,fingerprint,crypto.randomUUID(),new Date(start).toISOString(),board.value,watch.value,board.status,watch.status]);
    return visibleDay(await dayRow(q, userId, day));
  });
}
async function memberTime(env, id, day, memberId, services) {
  const member = CNINE_WATCH_STREAMERS.find(member => member.id === memberId);
  if (!member) fail('씨나인 멤버를 선택하세요.', 400);
  const who = await transaction(env, q => identity(q, id));
  const result = await observe(who.soopId, () => watchSeconds(services.playdkIdentityClient(env), who.soopId, [member.id], day));
  return { member: member.name, seconds: result.value, status: result.status };
}
async function settle(env, actorId, userId, day, body, services) {
  const quantity = whole(body.quantity, 10000, '붕어빵 지급 수량');
  const { boardSlugs } = await services.playdkDailyQuestSettings(env);
  return transaction(env, async q => {
    const config = await pool(q, true);
    await q('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const row = await dayRow(q, userId, day, true);
    if (!row || row.revision !== body.revision) fail('최신 활동 기록을 조회한 다음 정산하세요.');
    if (row.settled_at) {
      if (Number(row.granted) !== quantity) fail('이 날짜는 이미 다른 수량으로 지급했습니다.');
      return visibleDay(row);
    }
    if (row.identity_hash !== await signature(await identity(q, userId), boardSlugs)) fail('계정 연결 정보가 바뀌었습니다. 활동을 다시 조회하세요.');
    if (!(Number(row.posts) > 0 || Number(row.seconds) > 0)) fail('확인된 게시글이나 시청 기록이 있어야 지급할 수 있습니다.');
    if (!config.items.length) fail('개봉 아이템과 확률을 먼저 저장하세요.');
    if (config.revision !== body.poolRevision) fail('개봉 아이템 설정이 바뀌었습니다. 최신 설정을 확인하세요.');
    await availableItems(q, config.items);
    await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',
      [SNAPSHOT + config.revision, JSON.stringify(config.items)]);
    await q(`UPDATE ${DAYS} SET granted=$3,remaining=$3,settled_by=$4,settled_at=CURRENT_TIMESTAMP,pool=$5 WHERE user_id=$1 AND day=$2`,
      [userId, day, quantity, actorId, config.revision]);
    const result = visibleDay(await dayRow(q, userId, day));
    await q("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES($1,'PINGDU_BREAD_SETTLE','USER',$2,NULL,$3)",
      [actorId, String(userId), JSON.stringify(result)]);
    return result;
  });
}
async function balance(q, userId) {
  const [row] = await q(`SELECT COALESCE(SUM(remaining),0) AS amount FROM ${DAYS} WHERE user_id=$1 AND remaining>0`, [userId]);
  return Number(row.amount);
}
function receipt(row) {
  return { requestId: row.request_id, reward: JSON.parse(row.reward), openedAt: iso(row.opened_at) };
}
async function openBread(env, userId, id) {
  return transaction(env, async q => {
    await q('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    const [prior] = await q(`SELECT * FROM ${OPENS} WHERE user_id=$1 AND request_id=$2`, [userId, id]);
    if (prior) return { ...receipt(prior), balance: await balance(q, userId) };
    const [batch] = await q(`SELECT day::text AS day,pool FROM ${DAYS} WHERE user_id=$1 AND remaining>0 ORDER BY day LIMIT 1 FOR UPDATE`, [userId]);
    if (!batch) fail('봉투에 남은 붕어빵이 없습니다.');
    const items = await batchItems(q, batch.pool);
    await availableItems(q, items);
    let sample = mercenaryRandomInt(RATE_TOTAL);
    const reward = items.find(item => (sample -= item.units) < 0);
    if (!reward) fail('지급 당시의 확률 합계를 확인하세요.',503);
    const [stock] = await q(`INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity,created_at,updated_at)
      VALUES($1,$2,$3,$3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,item_code) DO UPDATE SET
      quantity=cnine_user_inventory.quantity+excluded.quantity,unseen_quantity=cnine_user_inventory.unseen_quantity+excluded.unseen_quantity,
      updated_at=CURRENT_TIMESTAMP WHERE cnine_user_inventory.quantity<=9007199254740991-excluded.quantity
      AND cnine_user_inventory.unseen_quantity<=9007199254740991-excluded.unseen_quantity RETURNING quantity`, [userId,reward.code,reward.quantity]);
    if (!stock) fail('아이템 보유 한도를 확인하세요.');
    await q("INSERT INTO inventory_logs(user_id,item_code,change_amount,balance_after,reason,reference_type,reference_id) VALUES($1,$2,$3,$4,'핑두의 붕어빵 트럭','PINGDU_BREAD',$5)",
      [userId, reward.code, reward.quantity, stock.quantity, id]);
    await q(`UPDATE ${DAYS} SET remaining=remaining-1 WHERE user_id=$1 AND day=$2`, [userId, batch.day]);
    const [row] = await q(`INSERT INTO ${OPENS}(user_id,request_id,day,reward) VALUES($1,$2,$3,$4) RETURNING *`, [userId,id,batch.day,JSON.stringify(reward)]);
    return { ...receipt(row), balance: await balance(q, userId) };
  });
}
async function playerState(env, actor, day, services) {
  const { boardSlugs } = await services.playdkDailyQuestSettings(env);
  return transaction(env, async q => {
    const [next] = await q(`SELECT pool FROM ${DAYS} WHERE user_id=$1 AND remaining>0 ORDER BY day LIMIT 1`, [actor.id]);
    const history = await q(`SELECT * FROM ${OPENS} WHERE user_id=$1 ORDER BY opened_at DESC LIMIT 20`, [actor.id]);
    const grants = await q(`SELECT day::text AS day,granted FROM ${DAYS} WHERE user_id=$1 AND settled_at IS NOT NULL ORDER BY day DESC LIMIT 20`, [actor.id]);
    return { userId: Number(actor.id), nickname: actor.nickname, owner: actor.role === 'OWNER', today: kstDay(), boardSlugs,
      day: visibleDay(await dayRow(q, actor.id, day)), balance: await balance(q, actor.id), history: history.map(receipt),
      grants: grants.map(row => ({day:row.day, quantity:Number(row.granted)})), members: CNINE_WATCH_STREAMERS.map(({id,name}) => ({id,name})),
      items: next ? await batchItems(q, next.pool) : (await pool(q)).items };
  });
}
async function accountList(env, day, url) {
  const search = (url.searchParams.get('search') || '').trim().slice(0, 80);
  const page = whole(Number(url.searchParams.get('page') || 1), 100000, '페이지');
  return transaction(env, async q => {
    const rows = await q(`SELECT u.id,u.nickname,d.*,d.day::text AS day_key FROM users u
      LEFT JOIN ${DAYS} d ON d.user_id=u.id AND d.day=$1 WHERE u.status='ACTIVE'
      AND (u.id::text=$2 OR strpos(lower(u.nickname),lower($2))>0)
      AND ($2<>'' OR d.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM user_second_verifications v WHERE v.user_id=u.id AND v.provider='PLAYDK'))
      ORDER BY (d.user_id IS NOT NULL AND d.settled_at IS NULL) DESC, u.id LIMIT 21 OFFSET $3`, [day, search, (page-1)*20]);
    return { rows: rows.slice(0,20).map(row => ({ userId:Number(row.id), nickname:row.nickname, activity:row.day_key ? visibleDay(row) : null })),
      more: rows.length > 20 };
  });
}
export async function handlePingduBread({ path, request, env, deps }) {
  const admin = path.startsWith(ADMIN);
  if (!admin && !path.startsWith(PLAYER)) return null;
  try {
    if (path === PLAYER+'rewards' && request.method === 'GET') {
      await prepareBread(env);
      const config = await transaction(env, q => pool(q));
      return deps.json({items:config.items.filter(item => (item.units ?? item.chance) > 0)
        .map(({name,image,quantity,units,chance}) => ({name,image,quantity,units:units ?? chance * 10000}))});
    }
    const actor = admin ? await deps.requirePermission(request, env, 'USER_MANAGE') : await deps.authenticate(request, env);
    if (!actor || admin && actor.role !== 'OWNER') fail(admin ? '이벤트 운영자 권한이 필요합니다.' : '게임 로그인 후 이용할 수 있습니다.', admin ? 403 : 401);
    const url = new URL(request.url), action = path.slice((admin ? ADMIN : PLAYER).length);
    const writing = request.method === 'POST';
    if (writing && (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && request.headers.get('origin') !== url.origin))) fail('같은 사이트에서 다시 요청하세요.', 403);
    const routes = admin ? (writing ? ['review','member','settle','pool'] : ['accounts','catalog']) : (writing ? ['review','member','open'] : ['state']);
    if ((!writing && request.method !== 'GET') || !routes.includes(action)) fail('지원하지 않는 요청입니다.', 405);
    const body = writing ? await deps.readBody(request) : {};
    const day = activityDay(body.day ?? url.searchParams.get('day') ?? kstDay());
    const userId = admin && ['review','member','settle'].includes(action) ? whole(body.userId, Number.MAX_SAFE_INTEGER, '계정') : Number(actor.id);
    await prepareBread(env);
    let result;
    switch (action) {
      case 'accounts': result = await accountList(env, day, url); break;
      case 'catalog':
        result = await transaction(env, async q => ({catalog:await catalog(q), config:await pool(q),
          members:CNINE_WATCH_STREAMERS.map(({id,name}) => ({id,name}))}));
        break;
      case 'state': result = await playerState(env, actor, day, deps); break;
      case 'review': result = await reviewDay(env, userId, day, deps); break;
      case 'member': result = await memberTime(env, userId, day, body.memberId, deps); break;
      case 'pool': result = await savePool(env, actor.id, body); break;
      case 'settle': result = await settle(env, actor.id, userId, day, body, deps); break;
      case 'open': result = await deps.withUserMutationLock(env, userId, path, () => openBread(env, userId, requestKey(body.requestId))); break;
    }
    return deps.json(result);
  } catch (error) {
    if (error.breadError) return deps.json({ error: error.message }, error.status);
    console.warn('PINGDU_BREAD_REQUEST_FAILED', { path, code: error.code || 'INTERNAL' });
    return deps.json({ error: '처리 결과를 확인하지 못했습니다. 잠시 뒤 다시 확인하세요.' }, 503);
  }
}
