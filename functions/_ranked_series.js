import {mercenaryModeAllowed,MERCENARY_PVE_ONLY_REASON} from '../shared/mercenary-eunseol-v1.mjs';
import {rankedOwnedMercenaries,rankedSelectedMercenaries} from './_mercenary_account.js';
import {rankedSeriesCodes,rankedPublicMercenary,rankedPublicRoster,RANKED_SERIES_VERSION} from '../shared/ranked-series-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {SHIRANUI_CODE} from '../shared/mercenary-shiranui-v1.mjs';
import {SHIRANUI_MIN_RANK_TICKS} from './_account_rank.js';
const rosterKey=id=>`ranked_series_roster_v1:${Number(id)}`;
const ticketKey=id=>`ranked_series_ticket_v1:${Number(id)}`;
const fail=(message='서로 다른 용병 3종을 편성하고 저장하세요.',status=409)=>Object.assign(Error(message),{status,code:'PVP_SERIES_ROSTER'});
export async function readRankedRosters(env,ids){
  ids=[...new Set(ids.map(Number))];if(!ids.length)return new Map();
  const [owned,saved]=await Promise.all([rankedOwnedMercenaries(env,ids),env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${ids.map(()=>'?').join(',')})`).bind(...ids.map(rosterKey)).all()]);
  const values=new Map(saved.results.map(row=>[row.key,row.value]));
  return new Map(ids.map(id=>{
    const raw=values.get(rosterKey(id))??null,cards=owned.get(id).map(rankedPublicMercenary);let codes=[],revision=0;
    if(raw){const value=JSON.parse(raw);revision=value.revision;try{codes=rankedSeriesCodes(value.codes);}catch{codes=[];}}
    const ready=codes.length===3&&codes.every(code=>cards.some(c=>c.code===code));
    return [id,{version:RANKED_SERIES_VERSION,raw,revision,codes,cards,ready,ownedCount:cards.length}];
  }));
}
export const rankedRosterPublic=({raw,...roster})=>roster;
export async function rankedRosterState(env,id){return rankedRosterPublic((await readRankedRosters(env,[id])).get(Number(id)));}
export function rankedOwnershipGuard(env,selections){
  const token=crypto.randomUUID(),pairs=[...selections].sort(([a],[b])=>a-b),locks=[],values=[];
  const predicate=pairs.map(([id,raw])=>{
    const codes=rankedSeriesCodes(raw);if(codes.some(code=>!mercenaryModeAllowed(code,'PVP')))throw fail(MERCENARY_PVE_ONLY_REASON);values.push(id,...codes);
    if(env.DB.dialect==='postgres')locks.push(env.DB.prepare('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (?,?,?) ORDER BY mercenary_code FOR SHARE').bind(id,...codes));
    let predicate='(SELECT COUNT(*) FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (?,?,?) AND total_copies>0)=3';
    if(codes.includes(SHIRANUI_CODE)){values.push(id,SHIRANUI_MIN_RANK_TICKS);predicate+=' AND EXISTS(SELECT 1 FROM account_rank_progress_v1 WHERE user_id=? AND total_ticks>=?)';if(env.DB.dialect==='postgres')locks.push(env.DB.prepare('SELECT user_id FROM account_rank_progress_v1 WHERE user_id=? FOR SHARE').bind(id));}
    return '('+predicate+')';
  }).join(' AND ');
  return [...locks,jointGuard(env.DB,token,predicate,values),jointGuardEnd(env.DB,token)];
}
export async function saveRankedRoster(env,user,body){
  const codes=rankedSeriesCodes(body.codes),current=(await readRankedRosters(env,[user.id])).get(Number(user.id));
  if(!codes.every(code=>current.cards.some(c=>c.code===code)))throw fail('보유한 서로 다른 용병 3종만 출전할 수 있습니다.',400);
  if(body.revision!==current.revision)throw fail('다른 창에서 출전 순서를 변경했습니다. 다시 불러오세요.');
  const key=rosterKey(user.id),guard=crypto.randomUUID(),next=JSON.stringify({revision:current.revision+1,codes});
  try{await env.DB.batch([
    ...(env.DB.dialect==='postgres'?[env.DB.prepare('SELECT key FROM app_meta WHERE key=? FOR UPDATE').bind(key)]:[]),
    jointGuard(env.DB,guard,`NOT EXISTS(SELECT 1 FROM pvp_ranked_match_tickets_v1671 WHERE attacker_id=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP) AND ${current.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)'}`,[user.id,key,...(current.raw===null?[]:[current.raw])]),
    ...rankedOwnershipGuard(env,new Map([[Number(user.id),codes]])),
    current.raw===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(key,next):env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(next,key,current.raw),jointGuardEnd(env.DB,guard)
  ]);}catch(error){if(/joint_atomic_guards|CHECK constraint failed: verified|unique constraint|duplicate key/i.test(String(error.message)))throw fail('매칭 중에는 순서를 바꿀 수 없습니다. 진행 중인 경기 또는 만료 후 다시 저장하세요.');throw error;}
  return {...rankedRosterPublic(current),codes,revision:current.revision+1,ready:true};
}
// The payload is bounded to one per attacker and committed atomically with its ticket.
export async function saveRankedSeriesTicket(env,{insert,ticket,attacker,defender,rosters}){
  const a=rosters.get(Number(attacker)),b=rosters.get(Number(defender));if(!a?.ready||!b?.ready)throw fail();
  const payload={version:RANKED_SERIES_VERSION,token:ticket.token,attacker:Number(attacker),defender:Number(defender),A:a.codes,B:b.codes},guard=crypto.randomUUID();
  const rows=await env.DB.batch([
    ...(env.DB.dialect==='postgres'?[env.DB.prepare('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR SHARE').bind(rosterKey(attacker),rosterKey(defender))]:[]),
    jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[rosterKey(attacker),a.raw,rosterKey(defender),b.raw]),
    ...rankedOwnershipGuard(env,new Map([[Number(attacker),a.codes],[Number(defender),b.codes]])),insert,
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP FROM pvp_ranked_match_tickets_v1671 WHERE token=? AND attacker_id=? ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(ticketKey(attacker),JSON.stringify(payload),ticket.token,attacker),jointGuardEnd(env.DB,guard)
  ]);
  return rows.some(row=>Number(row?.meta?.changes)>0)&&await readRankedSeriesTicket(env,ticket.token,attacker,defender);
}
export async function readRankedSeriesTicket(env,token,attacker,defender){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ticketKey(attacker)).first();if(!row)return null;
  const value=JSON.parse(row.value);if(value.token!==token||value.attacker!==Number(attacker)||value.defender!==Number(defender)||value.version!==RANKED_SERIES_VERSION)return null;
  rankedSeriesCodes(value.A);rankedSeriesCodes(value.B);return value;
}
export async function rankedTicketPreview(env,payload){
  const snapshots=await rankedSelectedMercenaries(env,new Map([[payload.attacker,payload.A],[payload.defender,payload.B]]));
  return {version:RANKED_SERIES_VERSION,attacker:snapshots.get(payload.attacker).map(rankedPublicMercenary),opponent:rankedPublicRoster(snapshots.get(payload.defender)),opponentOrderHidden:true};
}
