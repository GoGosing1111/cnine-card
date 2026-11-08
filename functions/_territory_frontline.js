const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const VICTORY_BONUSES = Object.freeze({accountXpPercent:20, coinPercent:50, dropPercent:0});
const prefix = 'territory_victory_personal_v1:';
export const victoryBuffKey = userId => prefix + userId;

export function activeVictoryBuff(record, at = Date.now()) {
  if (!record || !Number.isSafeInteger(record.start) || at < record.start || at >= record.start + WEEK_MS) return null;
  return {roundId:record.roundId, expiresAt:new Date(record.start + WEEK_MS).toISOString(), ...VICTORY_BONUSES};
}

export async function readVictoryBuff(db,userId) {
  const row=await db.prepare('SELECT value FROM app_meta WHERE key=?').bind(victoryBuffKey(userId)).first();
  return row ? activeVictoryBuff(JSON.parse(row.value)) : null;
}

export async function territoryVictoryCoin(db,userId,base) {
  if(!base)return 0;
  const buff=await readVictoryBuff(db,userId);
  return base+(buff?Math.floor(base*buff.coinPercent/100):0);
}

export function victoryBuffStatement(db, roundId, winner, at, settledAt) {
  return db.prepare(`INSERT INTO app_meta(key,value,updated_at)
    SELECT ?||CAST(w.user_id AS TEXT),?,? FROM territory_war_v3_users w
    JOIN territory_war_v3_rounds r ON r.id=w.round_id
    WHERE r.id=? AND r.winner_side=? AND r.status='FINISHED' AND r.settled_at=?
      AND w.side=r.winner_side AND w.status='ACTIVE'
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
      WHERE app_meta.updated_at<excluded.updated_at`)
    .bind(prefix,JSON.stringify({roundId:Number(roundId),start:at}),new Date(at).toISOString(),roundId,winner,settledAt);
}

export const HEAT_WINDOW_SECONDS = 120;
export const HEAT_THRESHOLD = 4;
export async function frontActivity(db,round,at=Date.now()){
  const result={windowSeconds:HEAT_WINDOW_SECONDS,minimum:HEAT_THRESHOLD,nodes:[]};
  if(round.status!=='ACTIVE')return result;
  const cutoff=new Date(at-HEAT_WINDOW_SECONDS*1000).toISOString().slice(0,19).replace('T',' ');
  const end=new Date(at).toISOString().slice(0,19).replace('T',' ');
  const data=await db.prepare(`SELECT f.node_index AS sector,COUNT(*) AS attacks
    FROM territory_war_v3_actions a JOIN territory_war_v3_fronts f ON f.id=a.front_id AND f.round_id=a.round_id
    WHERE a.round_id=? AND a.status='COMPLETED' AND a.updated_at BETWEEN ? AND ?
    GROUP BY f.node_index HAVING COUNT(*)>=? ORDER BY COUNT(*) DESC,f.node_index`).bind(round.id,cutoff,end,HEAT_THRESHOLD).all();
  result.nodes=(data.results||[]).map(r=>({nodeIndex:Number(r.sector),attacks:Number(r.attacks)}));
  return result;
}
