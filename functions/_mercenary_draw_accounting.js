import {DRAW_TOTAL,validateMercenaryDraw,mercenaryGradePools} from '../shared/mercenary-draw-policy-v1.mjs';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';

const catalogCodes=MERCENARY_CMS_SEED.catalog.cards.map(card=>card.code);
export const MERCENARY_ACCOUNTING_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS user_mercenary_cards_v1(user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,total_copies INTEGER NOT NULL CHECK(total_copies>=1),duplicate_count INTEGER NOT NULL CHECK(duplicate_count=total_copies-1),first_obtained_at TEXT NOT NULL,last_obtained_at TEXT NOT NULL,PRIMARY KEY(user_id,mercenary_code))`,
  `CREATE TABLE IF NOT EXISTS mercenary_card_acquisitions_v1(acquisition_id TEXT PRIMARY KEY,user_id BIGINT NOT NULL,mercenary_code TEXT NOT NULL,is_duplicate INTEGER NOT NULL CHECK(is_duplicate IN(0,1)),total_copies_after INTEGER NOT NULL,duplicate_count_after INTEGER NOT NULL CHECK(duplicate_count_after=total_copies_after-1),created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS mercenary_card_acquisitions_user_v1 ON mercenary_card_acquisitions_v1(user_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS mercenary_card_atomic_guard_v1(id TEXT PRIMARY KEY,verified INTEGER NOT NULL CHECK(verified=1))`
];
export function mercenaryRandomInt(max){
  if(!Number.isSafeInteger(max)||max<1||max>0xffffffff)throw Error('Invalid mercenary random bound');
  const data=new Uint32Array(1),limit=Math.floor(0x100000000/max)*max;
  do{crypto.getRandomValues(data);}while(data[0]>=limit);
  return data[0]%max;
}
// Preparation only. Public open/open-batch remain blocked before DB access.
// Repeated calls draw with replacement: every card keeps exactly one pool entry.
export function pickMercenaryDraw({policy,mercenaries,randomInt=mercenaryRandomInt}){
  const checked=validateMercenaryDraw(policy),pools=mercenaryGradePools(mercenaries,catalogCodes);
  for(const row of checked.outcomes)if(row.id.startsWith('CARD_')&&row.chancePpm>0&&!pools[row.id.slice(5)].length)
    throw Object.assign(Error(`${row.id.slice(5)} 등급의 용병이 없습니다.`),{code:'MERCENARY_RANK_POOL_EMPTY'});
  const sample=max=>{const n=randomInt(max);if(!Number.isSafeInteger(n)||n<0||n>=max)throw Error('Invalid mercenary random result');return n;};
  let n=sample(DRAW_TOTAL);
  const selected=checked.outcomes.find(row=>{n-=row.chancePpm;return n<0;});
  if(!selected.id.startsWith('CARD_'))return {outcomeId:selected.id,quantity:selected.quantity};
  const rank=selected.id.slice(5),pool=pools[rank];
  return {outcomeId:selected.id,rank,mercenaryCode:pool[sample(pool.length)],quantity:1};
}
// Compose these statements into the future opening transaction alongside pack
// consumption and its durable receipt. Never grant separately from that transaction.
export function mercenaryCardAcquisitionStatements(DB,{userId,mercenaryCode,acquisitionId,createdAt=new Date().toISOString()}){
  if(!Number.isSafeInteger(userId)||userId<1||!catalogCodes.includes(mercenaryCode)||
     typeof acquisitionId!=='string'||!/^[A-Za-z0-9._:-]{8,120}$/.test(acquisitionId)||
     typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt)))throw Error('Invalid mercenary acquisition');
  const stmt=(sql,...args)=>DB.prepare(sql).bind(...args),list=[],guardId=crypto.randomUUID();
  if(DB.dialect==='postgres')list.push(stmt('SELECT id FROM users WHERE id=? FOR UPDATE',userId));
  const matches='acquisition_id=? AND user_id=? AND mercenary_code=?';
  list.push(
    stmt(`INSERT INTO mercenary_card_atomic_guard_v1(id,verified) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=?) AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=? AND (user_id<>? OR mercenary_code<>?)) THEN 1 ELSE 0 END`,guardId,userId,acquisitionId,userId,mercenaryCode),
    stmt(`INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at)
      SELECT ?,?,1,0,?,? WHERE NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?)
      ON CONFLICT(user_id,mercenary_code) DO UPDATE SET total_copies=user_mercenary_cards_v1.total_copies+1,duplicate_count=user_mercenary_cards_v1.duplicate_count+1,last_obtained_at=excluded.last_obtained_at`,userId,mercenaryCode,createdAt,createdAt,acquisitionId),
    stmt(`INSERT INTO mercenary_card_acquisitions_v1(acquisition_id,user_id,mercenary_code,is_duplicate,total_copies_after,duplicate_count_after,created_at)
      SELECT ?,user_id,mercenary_code,CASE WHEN total_copies>1 THEN 1 ELSE 0 END,total_copies,duplicate_count,?
      FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=? AND NOT EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE acquisition_id=?) ON CONFLICT(acquisition_id) DO NOTHING`,acquisitionId,createdAt,userId,mercenaryCode,acquisitionId),
    stmt(`UPDATE mercenary_card_atomic_guard_v1 SET verified=CASE WHEN EXISTS(SELECT 1 FROM mercenary_card_acquisitions_v1 WHERE ${matches}) THEN 1 ELSE 0 END WHERE id=?`,acquisitionId,userId,mercenaryCode,guardId),
    stmt('DELETE FROM mercenary_card_atomic_guard_v1 WHERE id=?',guardId)
  );
  return list;
}
