import {readRuntimeData,cacheRuntimeData} from './_runtime_data_cache.js';
const KEY='safe_runtime_jokgak_city_v1';
export function citySchema(pg=false){
  const n=pg?'BIGINT':'INTEGER';
  return [
    `CREATE TABLE IF NOT EXISTS jokgak_city_players_v1(user_id ${n} PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1,epoch ${n} NOT NULL,location TEXT NOT NULL DEFAULT 'HOME',health INTEGER NOT NULL DEFAULT 100 CHECK(health BETWEEN 0 AND 100),health_at ${n} NOT NULL,wanted INTEGER NOT NULL DEFAULT 0 CHECK(wanted BETWEEN 0 AND 5),jailed_until ${n} NOT NULL DEFAULT 0,next_action_at ${n} NOT NULL DEFAULT 0,next_move_at ${n} NOT NULL DEFAULT 0,protected_until ${n} NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,last_token TEXT,updated_at ${n} NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_jokgak_city_location ON jokgak_city_players_v1(location,active,user_id)',
    `CREATE TABLE IF NOT EXISTS jokgak_city_actions_v1(request_id TEXT PRIMARY KEY,user_id ${n} NOT NULL,target_id ${n},action TEXT NOT NULL,fingerprint TEXT NOT NULL,result_json TEXT NOT NULL,created_at ${n} NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_jokgak_city_actions_user ON jokgak_city_actions_v1(user_id,created_at DESC)',
    `CREATE TABLE IF NOT EXISTS jokgak_city_notifications_v1(id TEXT PRIMARY KEY,user_id ${n} NOT NULL,request_id TEXT NOT NULL,read_at ${n} NOT NULL DEFAULT 0,created_at ${n} NOT NULL,summary_json TEXT NOT NULL)`,
    'CREATE INDEX IF NOT EXISTS idx_jokgak_city_unread ON jokgak_city_notifications_v1(user_id,read_at,created_at,id)',
    'CREATE TABLE IF NOT EXISTS jokgak_city_guards_v1(token TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))'
  ];
}
export async function ensureCitySchema(env){
  if(readRuntimeData(env,KEY))return;
  if(!(await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first())){
    const schema=citySchema(env.DB.dialect==='postgres');
    if(env.DB.dialect==='postgres')await env.DB.execSchema(schema);else await env.DB.batch(schema.map(sql=>env.DB.prepare(sql)));
    await env.DB.prepare('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING').bind(KEY,'1').run();
  }
  cacheRuntimeData(env,KEY,true,1800000);
}
