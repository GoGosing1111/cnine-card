import {mercenaryModeAllowed,MERCENARY_PVE_ONLY_REASON} from '../shared/mercenary-eunseol-v1.mjs';
import {rankedOwnedMercenaries,rankedSelectedMercenaries} from './_mercenary_account.js';
import {rankedSeriesCodes,rankedSeriesRoster,rankedPublicMercenary,rankedPublicRoster,RANKED_SERIES_RULES} from '../shared/ranked-series-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {SHIRANUI_CODE} from '../shared/mercenary-shiranui-v1.mjs';
import {SHIRANUI_MIN_RANK_TICKS} from './_account_rank.js';
const rosterKey=(id,rules)=>`ranked_series_roster_v${rules.mercenariesPerRound}:${Number(id)}`;
const ticketKey=(id,rules)=>`ranked_series_ticket_v${rules.mercenariesPerRound}:${Number(id)}`;
const fail=(message='서로 다른 용병 3종을 편성하고 저장하세요.',status=409)=>Object.assign(Error(message),{status,code:'PVP_SERIES_ROSTER'});
export async function readRankedRosters(env,ids,rules=RANKED_SERIES_RULES){
  ids=[...new Set(ids.map(Number))];if(!ids.length)return new Map();
  const [owned,saved]=await Promise.all([rankedOwnedMercenaries(env,ids),env.DB.prepare(`SELECT key,value FROM app_meta WHERE key IN (${ids.map(()=>'?').join(',')})`).bind(...ids.map(id=>rosterKey(id,rules))).all()]);
  const values=new Map(saved.results.map(row=>[row.key,row.value]));
  return new Map(ids.map(id=>{
    const raw=values.get(rosterKey(id,rules))??null,cards=owned.get(id).map(rankedPublicMercenary);let codes=[],revision=0;
    if(raw){const value=JSON.parse(raw);revision=value.revision;try{codes=rankedSeriesCodes(value.codes,rules);}catch{codes=[];}}
    let ready=false;try{rankedSeriesRoster(codes.map(code=>cards.find(c=>c.code===code)),rules);ready=true;}catch{}
    return [id,{version:rules.version,mercenariesPerRound:rules.mercenariesPerRound,rosterSize:rules.rosterSize,raw,revision,codes,cards,ready,ownedCount:cards.length}];
  }));
}
export const rankedRosterPublic=({raw,...roster})=>roster;
export async function rankedRosterState(env,id,rules=RANKED_SERIES_RULES){return rankedRosterPublic((await readRankedRosters(env,[id],rules)).get(Number(id)));}
export function rankedOwnershipGuard(env,selections,rules=RANKED_SERIES_RULES){
  const token=crypto.randomUUID(),pairs=[...selections].sort(([a],[b])=>a-b),locks=[],values=[];
  const predicate=pairs.map(([id,raw])=>{
    const codes=rankedSeriesCodes(raw,rules),marks=codes.map(()=>'?').join(',');if(codes.some(code=>!mercenaryModeAllowed(code,'PVP')))throw fail(MERCENARY_PVE_ONLY_REASON);values.push(id,...codes);
    if(env.DB.dialect==='postgres')locks.push(env.DB.prepare(`SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (${marks}) ORDER BY mercenary_code FOR SHARE`).bind(id,...codes));
    let predicate=`(SELECT COUNT(*) FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code IN (${marks}) AND total_copies>0)=${rules.rosterSize}`;
    if(codes.includes(SHIRANUI_CODE)){values.push(id,SHIRANUI_MIN_RANK_TICKS);predicate+=' AND EXISTS(SELECT 1 FROM account_rank_progress_v1 WHERE user_id=? AND total_ticks>=?)';if(env.DB.dialect==='postgres')locks.push(env.DB.prepare('SELECT user_id FROM account_rank_progress_v1 WHERE user_id=? FOR SHARE').bind(id));}
    return '('+predicate+')';
  }).join(' AND ');
  return [...locks,jointGuard(env.DB,token,predicate,values),jointGuardEnd(env.DB,token)];
}
export async function saveRankedRoster(env,user,body,rules=RANKED_SERIES_RULES){
  const codes=rankedSeriesCodes(body.codes,rules),current=(await readRankedRosters(env,[user.id],rules)).get(Number(user.id));
  if(!codes.every(code=>current.cards.some(c=>c.code===code)))throw fail(`보유한 서로 다른 용병 ${rules.rosterSize}종만 출전할 수 있습니다.`,400);
  rankedSeriesRoster(codes.map(code=>current.cards.find(c=>c.code===code)),rules);
  if(body.revision!==current.revision)throw fail('다른 창에서 출전 순서를 변경했습니다. 다시 불러오세요.');
  const key=rosterKey(user.id,rules),guard=crypto.randomUUID(),next=JSON.stringify({revision:current.revision+1,codes});
  try{await env.DB.batch([
    ...(env.DB.dialect==='postgres'?[env.DB.prepare('SELECT key FROM app_meta WHERE key=? FOR UPDATE').bind(key)]:[]),
    jointGuard(env.DB,guard,`NOT EXISTS(SELECT 1 FROM pvp_ranked_match_tickets_v1671 WHERE attacker_id=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP) AND ${current.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)'}`,[user.id,key,...(current.raw===null?[]:[current.raw])]),
    ...rankedOwnershipGuard(env,new Map([[Number(user.id),codes]]),rules),
    current.raw===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(key,next):env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(next,key,current.raw),jointGuardEnd(env.DB,guard)
  ]);}catch(error){if(/joint_atomic_guards|CHECK constraint failed: verified|unique constraint|duplicate key/i.test(String(error.message)))throw fail('매칭 중에는 순서를 바꿀 수 없습니다. 진행 중인 경기 또는 만료 후 다시 저장하세요.');throw error;}
  return {...rankedRosterPublic(current),codes,revision:current.revision+1,ready:true};
}
// The payload is bounded to one per attacker and committed atomically with its ticket.
export async function saveRankedSeriesTicket(env,{insert,ticket,attacker,defender,rosters},rules=RANKED_SERIES_RULES){
  const a=rosters.get(Number(attacker)),b=rosters.get(Number(defender));if(!a?.ready||!b?.ready||a.version!==rules.version||b.version!==rules.version)throw fail(`서로 다른 용병 ${rules.rosterSize}종을 편성하고 저장하세요.`);
  const payload={version:rules.version,token:ticket.token,attacker:Number(attacker),defender:Number(defender),A:a.codes,B:b.codes},guard=crypto.randomUUID();
  const rows=await env.DB.batch([
    ...(env.DB.dialect==='postgres'?[env.DB.prepare('SELECT key FROM app_meta WHERE key IN (?,?) ORDER BY key FOR SHARE').bind(rosterKey(attacker,rules),rosterKey(defender,rules))]:[]),
    jointGuard(env.DB,guard,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?) AND EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[rosterKey(attacker,rules),a.raw,rosterKey(defender,rules),b.raw]),
    ...rankedOwnershipGuard(env,new Map([[Number(attacker),a.codes],[Number(defender),b.codes]]),rules),insert,
    env.DB.prepare(`INSERT INTO app_meta(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP FROM pvp_ranked_match_tickets_v1671 WHERE token=? AND attacker_id=? ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(ticketKey(attacker,rules),JSON.stringify(payload),ticket.token,attacker),jointGuardEnd(env.DB,guard)
  ]);
  return rows.some(row=>Number(row?.meta?.changes)>0)&&await readRankedSeriesTicket(env,ticket.token,attacker,defender,rules);
}
export async function readRankedSeriesTicket(env,token,attacker,defender,rules=RANKED_SERIES_RULES){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(ticketKey(attacker,rules)).first();if(!row)return null;
  const value=JSON.parse(row.value);if(value.token!==token||value.attacker!==Number(attacker)||value.defender!==Number(defender)||value.version!==rules.version)return null;
  rankedSeriesCodes(value.A,rules);rankedSeriesCodes(value.B,rules);return value;
}
export async function rankedTicketPreview(env,payload,rules=RANKED_SERIES_RULES){
  const snapshots=await rankedSelectedMercenaries(env,new Map([[payload.attacker,payload.A],[payload.defender,payload.B]]),rules);
  return {version:rules.version,mercenariesPerRound:rules.mercenariesPerRound,attacker:snapshots.get(payload.attacker).map(rankedPublicMercenary),opponent:rankedPublicRoster(snapshots.get(payload.defender)),opponentOrderHidden:true};
}
