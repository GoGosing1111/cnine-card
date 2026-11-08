import {createPostgresD1Compat} from '../../../functions/_postgres_d1_compat.js';
import {ensureTowerWeek, towerWeeklyTickDue} from '../../../functions/_tower_weekly.js';

export async function runTowerWeeklySchedule(env, at = Date.now(), open = createPostgresD1Compat) {
  if (!towerWeeklyTickDue(at)) return;
  const runtime = await open(env.HYPERDRIVE?.connectionString);
  try { return await ensureTowerWeek({DB:runtime.db}, at); }
  finally { await runtime.close(); }
}
