// Read-only honors must not import the season scheduler or battle settlement.
export const DUO_AUTO_SCHEMA_KEY='ranked_duo_auto_schema_v2';
export async function readDuoHonors(env,userId){
  if(!await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(DUO_AUTO_SCHEMA_KEY).first())return {count:0,acquiredAt:null};
  const row=await env.DB.prepare('SELECT COUNT(*) AS n,MIN(acquired_at) AS first_at FROM ranked_duo_trophies_v2 WHERE user_id=?').bind(userId).first();
  return {count:Number(row.n),acquiredAt:row.first_at||null};
}
