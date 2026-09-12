export const JOINT_ATOMIC_SCHEMA=[`CREATE TABLE IF NOT EXISTS joint_atomic_guards_v1(token TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1))`];
export async function ensureJointAtomicSchema(env){
  if(typeof env.DB.execSchema==='function')await env.DB.execSchema(JOINT_ATOMIC_SCHEMA.map(s=>s.replaceAll('INTEGER','BIGINT')));
  else for(const sql of JOINT_ATOMIC_SCHEMA)await env.DB.prepare(sql).run();
}
export const jointGuard=(DB,token,predicate,values=[])=>DB.prepare(`INSERT INTO joint_atomic_guards_v1(token,verified) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(token,...values);
export const jointGuardEnd=(DB,token)=>DB.prepare('DELETE FROM joint_atomic_guards_v1 WHERE token=?').bind(token);
