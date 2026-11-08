import {createPostgresD1Compat} from './_postgres_d1_compat.js';

// The live CMS season owns the floor definitions. Only its player progression
// rolls over. The original season/floor receipt keys predate the first Monday.
const FIRST_MONDAY = Date.parse('2026-11-09T00:00:00+09:00');
const WEEK = 7 * 86400000;
const MARKER = 'tower_weekly_reset_v1';
const activeSeason = "(SELECT id FROM tower_seasons WHERE status='ACTIVE' ORDER BY id DESC LIMIT 1)";
const markerValue = "COALESCE((SELECT value FROM app_meta WHERE key='tower_weekly_reset_v1'),'')";
export const towerWeekMatches = markerValue + '=?';

export function towerWeek(at = Date.now()) {
  if (at < FIRST_MONDAY) return {weekKey:'', startsAt:null, resetsAt:new Date(FIRST_MONDAY).toISOString()};
  const start = FIRST_MONDAY + Math.floor((at - FIRST_MONDAY) / WEEK) * WEEK;
  return {
    weekKey:new Date(start + 9 * 3600000).toISOString().slice(0, 10),
    startsAt:new Date(start).toISOString(),
    resetsAt:new Date(start + WEEK).toISOString()
  };
}

// A start or settlement for any account may share the season lock. A weekly
// reset takes it exclusively before inspecting the marker inside its batch.
export function towerSeasonLock(db, exclusive = false) {
  if (db.dialect !== 'postgres') return [];
  const mode = exclusive ? 'UPDATE' : 'SHARE';
  return [db.prepare(`SELECT id FROM tower_seasons WHERE id=${activeSeason} FOR ${mode}`)];
}

const checked = new WeakMap();
export async function ensureTowerWeek(env, at = Date.now()) {
  const week = {...towerWeek(at), serverNow:at}, db = env.DB;
  if (!week.weekKey) return week;
  const previous = checked.get(db);
  if (previous?.weekKey === week.weekKey) {
    await previous.ready;
    return week;
  }
  const ready = applyTowerWeek(db, week);
  checked.set(db, {weekKey:week.weekKey, ready});
  try { await ready; }
  catch (error) {
    if (checked.get(db)?.ready === ready) checked.delete(db);
    throw error;
  }
  return week;
}

async function applyTowerWeek(db, {weekKey, startsAt}) {
  const marker = await db.prepare('SELECT value FROM app_meta WHERE key=?').bind(MARKER).first();
  if (marker?.value >= weekKey) return;
  const due = markerValue + '<?';
  // The pointer range is indexed. Completed fights which still owe secondary
  // drops keep their pointer and resume against their original receipt.
  const pointers = "key>='tower_abyss_active:' AND key<'tower_abyss_active;'";
  await db.batch([
    ...towerSeasonLock(db, true),
    db.prepare(`UPDATE tower_user_progress SET current_floor=1,highest_floor=0,highest_reached_at=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE season_id=${activeSeason} AND (current_floor<>1 OR highest_floor<>0 OR highest_reached_at IS NOT NULL) AND ${due}`).bind(weekKey),
    db.prepare(`UPDATE joint_operations_v1 SET status='CANCELLED',completed_at=? WHERE request_id IN
      (SELECT value FROM app_meta WHERE ${pointers}) AND kind='TOWER_ABYSS' AND status='PENDING' AND created_at<? AND ${due}`).bind(startsAt, startsAt, weekKey),
    db.prepare(`DELETE FROM app_meta WHERE ${pointers} AND EXISTS
      (SELECT 1 FROM joint_operations_v1 j WHERE j.request_id=app_meta.value AND j.kind='TOWER_ABYSS' AND j.status='CANCELLED') AND ${due}`).bind(weekKey),
    db.prepare(`INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP WHERE app_meta.value<excluded.value`).bind(MARKER, weekKey)
  ]);
}

export function towerFloorRewardRef(plan) {
  const scope = plan.weekKey ? plan.seasonId + ':' + plan.weekKey : String(plan.seasonId);
  return scope + ':' + plan.response.floorNo;
}

// Use the existing minute trigger. Retry the first five minutes and every hour
// after that, including a recovery after an extended Worker outage.
export function towerWeeklyTickDue(at) {
  if (!Number.isFinite(at) || at < FIRST_MONDAY) return false;
  const minute = Math.floor((at - FIRST_MONDAY) / 60000);
  return minute % (WEEK / 60000) < 5 || minute % 60 === 0;
}

export async function runTowerWeeklySchedule(env, at = Date.now(), open = createPostgresD1Compat) {
  if (!towerWeeklyTickDue(at)) return;
  const runtime = await open(env.HYPERDRIVE?.connectionString);
  try { return await ensureTowerWeek({DB:runtime.db}, at); }
  finally { await runtime.close(); }
}
