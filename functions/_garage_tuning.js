import { ensureRuntimeFoundation } from './_runtime_foundation.js';

const ROUTE = 'character/garage/tuning';
const MIGRATION = 'safe_runtime_upgrade_garage_tuning_v2';
const SCHEMA = `CREATE TABLE IF NOT EXISTS user_garage_tuning_loadout (
  user_id INTEGER NOT NULL,
  garage_id INTEGER NOT NULL,
  slot TEXT NOT NULL CHECK(slot IN ('engine','frame','tire')),
  stage INTEGER NOT NULL CHECK(stage BETWEEN 1 AND 5),
  PRIMARY KEY(user_id,garage_id,slot),
  FOREIGN KEY(user_id,garage_id) REFERENCES user_garage_vehicles(user_id,garage_id) ON DELETE CASCADE
)`;

const STAGES = ['NORMAL', 'MAGIC', 'RARE', 'EPIC', 'LEGENDARY'];
const PARTS = {
  engine: [
    ['스틸 인라인 엔진', '아군 1명의 일반 스킬 쿨다운 1턴 단축'],
    ['에메랄드 터보 엔진', '아군 2명의 일반 스킬 쿨다운 1턴 단축'],
    ['코발트 트윈터보 엔진', '생존 아군 전원의 일반 스킬 쿨다운 1턴 단축'],
    ['바이올렛 V8 엔진', '생존 아군 전원 1턴 단축 · 최장 쿨다운 아군 1명은 2턴 단축'],
    ['앰버 V12 엔진', '생존 아군 전원의 일반 스킬 쿨다운 2턴 단축']
  ],
  frame: [
    ['스틸 래더 프레임', '폐차장·1인 군단토벌 재도전 하루 1회', '레이드 복귀 체력 10% · PvP 첫 치명타 흡수 10%'],
    ['에메랄드 스페이스 프레임', '폐차장·1인 군단토벌 재도전 하루 2회', '레이드 복귀 체력 20% · PvP 첫 치명타 흡수 15%'],
    ['코발트 알로이 프레임', '재도전 하루 2회 · 체력 25% 추가 회복', '레이드 복귀 체력 30% · PvP 첫 치명타 흡수 20%'],
    ['바이올렛 모노코크 프레임', '재도전 하루 3회 · 체력 25% 추가 회복', '레이드 복귀 체력 40% · PvP 첫 치명타 흡수 25%'],
    ['앰버 카본 프레임', '재도전 하루 3회 · 체력 전부 회복', '레이드 복귀 체력 50% · PvP 첫 치명타 흡수 30%']
  ],
  tire: [
    ['스틸 로드 타이어', '체력 15% 이하 아군이 단일 공격 회피'],
    ['에메랄드 스포츠 타이어', '체력 25% 이하 아군이 단일 공격 회피'],
    ['코발트 세미슬릭 타이어', 'PvE 단일 스킬도 회피'],
    ['바이올렛 레이스 타이어', '보호할 용병 지정 가능'],
    ['앰버 에어로 타이어', '지정 용병의 체력이 40% 이하일 때 발동']
  ]
};

const catalog = Object.entries(PARTS).flatMap(([slot, parts]) => parts.map(([name, effect, extraEffect], index) => {
  const stage = index + 1;
  return { slot, stage, name, effect, extraEffect, code: `GARAGE_TUNING_${slot.toUpperCase()}_${stage}`,
    image: `assets/ui/garage/tuning-v2/${slot}-${stage}.webp` };
}));

const activeVehicle = `SELECT l.user_id,l.garage_id FROM user_garage_loadout l
  JOIN user_garage_vehicles u ON u.user_id=l.user_id AND u.garage_id=l.garage_id
  JOIN character_garage_items g ON g.id=l.garage_id AND g.is_active=1
  WHERE l.user_id=? AND l.garage_id=?`;

function ensureGarageTuning(env) {
  return ensureRuntimeFoundation(env, MIGRATION, [MIGRATION], async () => {
    if (env.DB.dialect === 'postgres') await env.DB.execSchema([SCHEMA]);
    await env.DB.batch([
      ...(env.DB.dialect === 'postgres' ? [] : [env.DB.prepare(SCHEMA)]),
      ...catalog.map((part, index) => env.DB.prepare(`INSERT INTO inventory_items
        (code,name,subtitle,description,category,rarity,image_url,sort_order,is_active)
        VALUES(?,?,?,?,?,?,?,?,1)
        ON CONFLICT(code) DO UPDATE SET image_url=excluded.image_url WHERE inventory_items.image_url=?`).bind(
        part.code, part.name, `이동수단 튜닝 · ${part.stage}단계`, '차고지에서 장착하는 튜닝 부품입니다.',
        'MATERIAL', STAGES[part.stage - 1], part.image, 601 + index, part.image.replace('/tuning-v2/', '/tuning-v1/')
      )),
      env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,'1',CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO NOTHING`).bind(MIGRATION)
    ]);
  });
}

async function readTuning(env, userId, vehicleId) {
  const { results } = await env.DB.prepare(`WITH parts(slot,stage,code) AS (VALUES ${catalog.map(() => '(?,?,?)').join(',')})
    SELECT p.code,COALESCE(stock.quantity,0) AS quantity,i.is_active,t.stage AS equipped_stage
    FROM (${activeVehicle}) vehicle CROSS JOIN parts p
    LEFT JOIN inventory_items i ON i.code=p.code
    LEFT JOIN cnine_user_inventory stock ON stock.user_id=vehicle.user_id AND stock.item_code=p.code
    LEFT JOIN user_garage_tuning_loadout t ON t.user_id=vehicle.user_id AND t.garage_id=vehicle.garage_id
      AND t.slot=p.slot AND t.stage=CAST(p.stage AS INTEGER)`).bind(
    ...catalog.flatMap(part => [part.slot, part.stage, part.code]), userId, vehicleId
  ).all();
  if (!results?.length) return null;

  const byCode = new Map(results.map(row => [row.code, row]));
  const equipped = {};
  const parts = catalog.map(part => {
    const row = byCode.get(part.code);
    const available = Number(row?.is_active) === 1;
    const owned = available && Number(row?.quantity) > 0;
    if (owned && Number(row?.equipped_stage) === part.stage) equipped[part.slot] = part.stage;
    return { ...part, available, owned };
  });
  return { vehicleId, equipped, parts };
}

export async function handleGarageTuning({ path, request, env, deps }) {
  if (path !== ROUTE) return null;
  const { authenticate, readBody, json } = deps;
  const user = await authenticate(request, env);
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
  const write = request.method === 'POST';
  if (!write && request.method !== 'GET') return json({ error: '지원하지 않는 튜닝 요청입니다.' }, 405);

  const body = write ? await readBody(request) : null;
  const vehicleId = write ? body?.vehicleId : Number(new URL(request.url).searchParams.get('vehicleId'));
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1) return json({ error: '이동수단을 확인해 주세요.' }, 400);

  const part = write && catalog.find(part => part.slot === body?.slot && part.stage === body.stage);
  if (write && (!part || !['equip', 'unequip'].includes(body.action))) return json({ error: '부품 종류와 단계를 확인해 주세요.' }, 400);
  await ensureGarageTuning(env);

  if (write && body.action === 'equip') {
    const result = await env.DB.prepare(`INSERT INTO user_garage_tuning_loadout(user_id,garage_id,slot,stage)
      SELECT vehicle.user_id,vehicle.garage_id,?,? FROM (${activeVehicle}) vehicle
      WHERE EXISTS(SELECT 1 FROM cnine_user_inventory u JOIN inventory_items i ON i.code=u.item_code AND i.is_active=1
        WHERE u.user_id=vehicle.user_id AND u.item_code=? AND u.quantity>0)
      ON CONFLICT(user_id,garage_id,slot) DO UPDATE SET stage=excluded.stage`).bind(
      part.slot, part.stage, user.id, vehicleId, part.code
    ).run();
    if (!Number(result?.meta?.changes)) return json({ error: '현재 이동수단에 보유 중인 부품만 장착할 수 있습니다.' }, 409);
  } else if (write) {
    // Compare the stage so an older tab cannot remove a replacement part.
    await env.DB.prepare(`DELETE FROM user_garage_tuning_loadout WHERE user_id=? AND garage_id=? AND slot=? AND stage=?
      AND EXISTS(${activeVehicle})`).bind(user.id, vehicleId, part.slot, part.stage, user.id, vehicleId).run();
  }

  const tuning = await readTuning(env, user.id, vehicleId);
  if (!tuning) return json({ error: '현재 장착 중인 이동수단을 확인해 주세요.' }, 409);
  return json({ tuning });
}
