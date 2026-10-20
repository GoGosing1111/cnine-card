import {DUO_RANDOM_MODE,duoRandomInt,shuffleDuo,isOpenDuo} from '../shared/ranked-duo-random-v4.mjs';
import {duoError,duoEnergy,DUO_LIMITS} from '../shared/ranked-duo-v1.mjs';
import {resolveDuoTier,DUO_CHALLENGER} from '../shared/ranked-duo-season-v2.mjs';
import {loadDuoProfiles} from './_ranked_duo_profiles.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {rankedDuoPoolCandidates,rankedDuoPoolContains,hasRankedDuoMercenary,trackDuoProfileVersions} from './_ranked_duo_pool.js';

export const DUO_RANDOM_SCHEMA_KEY='ranked_duo_random_schema_v4';
export const DUO_RANDOM_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS ranked_duo_players_v4(season_id TEXT NOT NULL,user_id BIGINT NOT NULL,draw_key BIGINT NOT NULL,score BIGINT NOT NULL,wins BIGINT NOT NULL DEFAULT 0,losses BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(season_id,user_id))`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_random_pool_v4 ON ranked_duo_players_v4(season_id,draw_key,user_id)`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_personal_rank_v4 ON ranked_duo_players_v4(season_id,score DESC,user_id DESC) WHERE wins+losses>0`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_tickets_v4(token TEXT PRIMARY KEY,season_id TEXT NOT NULL,user_id BIGINT NOT NULL,partner_id BIGINT NOT NULL,opponent_a BIGINT NOT NULL,opponent_b BIGINT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,UNIQUE(season_id,user_id),CHECK(user_id<>partner_id AND user_id<>opponent_a AND user_id<>opponent_b AND partner_id<>opponent_a AND partner_id<>opponent_b AND opponent_a<>opponent_b))`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_match_members_v4(match_id TEXT NOT NULL,season_id TEXT NOT NULL,user_id BIGINT NOT NULL,side TEXT NOT NULL CHECK(side IN('A','B')),created_at TEXT NOT NULL,PRIMARY KEY(match_id,user_id))`,
 `CREATE INDEX IF NOT EXISTS ranked_duo_member_history_v4 ON ranked_duo_match_members_v4(season_id,user_id,created_at DESC,match_id DESC)`,
 `CREATE TABLE IF NOT EXISTS ranked_duo_final_v4(season_id TEXT NOT NULL,user_id BIGINT NOT NULL,nickname TEXT NOT NULL,final_rank BIGINT NOT NULL,score BIGINT NOT NULL,wins BIGINT NOT NULL,losses BIGINT NOT NULL,completed_at TEXT NOT NULL,PRIMARY KEY(season_id,user_id),UNIQUE(season_id,final_rank))`
];
const p=env=>(sql,...args)=>env.DB.prepare(sql).bind(...args),iso=now=>new Date(now).toISOString();
const lock=(env,sql,...args)=>env.DB.dialect==='postgres'?[p(env)(sql,...args)]:[];
const guard=(env,predicate,args,body)=>{const id=crypto.randomUUID();return [jointGuard(env.DB,id,predicate,args),...body,jointGuardEnd(env.DB,id)];};
const stamp=now=>iso(now).replace('T',' ').slice(0,19);
const eligible=`u.status='ACTIVE' AND u.role<>'OWNER' AND (u.banned_until IS NULL OR SUBSTR(REPLACE(u.banned_until,'T',' '),1,19)<=?)`;

export async function prepareDuoRandom(env){
 if(await p(env)('SELECT value FROM app_meta WHERE key=?',DUO_RANDOM_SCHEMA_KEY).first())return;
 if(env.DB.execSchema)await env.DB.execSchema(DUO_RANDOM_SCHEMA);else for(const sql of DUO_RANDOM_SCHEMA)await env.DB.prepare(sql).run();
 await p(env)('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',DUO_RANDOM_SCHEMA_KEY,'20261020-initiator-only').run();
}
export function randomDuoJoinWrites(env,s,userId){
 return [p(env)('INSERT INTO ranked_duo_players_v4(season_id,user_id,draw_key,score) VALUES(?,?,?,?) ON CONFLICT(season_id,user_id) DO NOTHING',s.id,userId,duoRandomInt(4294967296),s.config.score.initial)];
}
export async function randomDuoStandings(env,s,limit=100,now=Date.now()){
 if(s.status==='CLOSED')return (await p(env)('SELECT * FROM ranked_duo_final_v4 WHERE season_id=? ORDER BY final_rank LIMIT ?',s.id,limit).all()).results;
 if(!['ACTIVE','SETTLING'].includes(s.status))return [];
 return (await p(env)(`SELECT r.*,u.nickname FROM ranked_duo_players_v4 r JOIN users u ON u.id=r.user_id WHERE r.season_id=? AND r.wins+r.losses>0 AND ${eligible} ORDER BY r.score DESC,r.user_id DESC LIMIT ?`,s.id,stamp(now),limit).all()).results;
}
export const publicDuoPlayer=(row,config,rank=0)=>row?{userId:Number(row.user_id),nickname:row.nickname,score:Number(row.score),wins:Number(row.wins),losses:Number(row.losses),rank:rank||null,tier:resolveDuoTier(Number(row.score),config,rank)}:null;
export async function randomDuoPlayer(env,s,userId,leaders){
 const row=await p(env)('SELECT r.*,u.nickname FROM ranked_duo_players_v4 r JOIN users u ON u.id=r.user_id WHERE r.season_id=? AND r.user_id=?',s.id,userId).first();
 return publicDuoPlayer(row,s.config,leaders.findIndex(r=>Number(r.user_id)===Number(userId))+1);
}
export const randomTicketIds=t=>[Number(t.user_id),Number(t.partner_id),Number(t.opponent_a),Number(t.opponent_b)];
async function publicTicket(env,s,t){
 const ids=randomTicketIds(t),rows=(await p(env)('SELECT id,nickname FROM users WHERE id IN(?,?,?,?)',...ids).all()).results;
 const members=ids.map(id=>({userId:id,nickname:rows.find(r=>Number(r.id)===id)?.nickname||'참가자'}));
 return {token:t.token,expiresAt:t.expires_at,matchmaking:DUO_RANDOM_MODE,scoreScope:'INITIATOR',team:{members:members.slice(0,2)},opponent:{members:members.slice(2)}};
}
export async function matchRandomDuo(env,user,s,mine,deps,now){
 const q=p(env);
 if(!mine)throw duoError('NOT_JOINED','먼저 듀오 시즌에 참가하세요.');
 const pending=await q("SELECT id FROM ranked_duo_matches_v1 WHERE user_id=? AND status='PENDING'",user.id).first();
 if(pending)return {pendingMatchId:pending.id};
 if(duoEnergy(mine,s.config,now).current<s.config.energy.cost)throw duoError('ENERGY','듀오 행동력이 부족합니다.');
 const old=await q('SELECT * FROM ranked_duo_tickets_v4 WHERE season_id=? AND user_id=? AND used_at IS NULL AND expires_at>?',s.id,user.id,iso(now)).first();
 if(old){
  if(!isOpenDuo(s.config)||await rankedDuoPoolContains(env,randomTicketIds(old),now))return publicTicket(env,s,old);
  await q('UPDATE ranked_duo_tickets_v4 SET used_at=? WHERE token=? AND used_at IS NULL',iso(now),old.token).run();
 }
 let profiles;
 if(isOpenDuo(s.config)){
  const ids=await rankedDuoPoolCandidates(env,Number(user.id),now);
  if(ids.length<3)throw duoError('NO_OPPONENT','랭크전 공격·방어 덱과 PVP 용병을 편성한 서로 다른 이용자 4명이 필요합니다.');
  profiles=[];
  const selected=[Number(user.id),...ids];
  for(let offset=0;offset<selected.length;offset+=DUO_LIMITS.refreshBatch){
   const batch=selected.slice(offset,offset+DUO_LIMITS.refreshBatch);
   await trackDuoProfileVersions(env,batch);
   profiles.push(...await loadDuoProfiles(env,batch,s.config,deps,{now}));
   if(!profiles[0].attackReady)throw duoError('DECK','내 랭크전 공격 덱을 확인하세요.');
   if(!hasRankedDuoMercenary(profiles[0]))throw duoError('MERCENARY','PVP 용병을 편성한 뒤 랭크 듀오를 시작하세요.');
   const ready=profiles.slice(1).filter(hasRankedDuoMercenary);
   if(ready.some(r=>r.attackReady&&ready.filter(o=>o.userId!==r.userId&&o.defenseReady).length>=2))break;
  }
 }else{
 // Two index range reads, each with a hard 12-row budget. Never sort the
 // entire population randomly or rebuild all inventories on a match request.
 const pivot=duoRandomInt(4294967296),half=DUO_LIMITS.candidates/2;
 const ranges=await Promise.all([
  q('SELECT user_id,draw_key FROM ranked_duo_players_v4 WHERE season_id=? AND draw_key>=? AND user_id<>? ORDER BY draw_key,user_id LIMIT ?',s.id,pivot,user.id,half).all(),
  q('SELECT user_id,draw_key FROM ranked_duo_players_v4 WHERE season_id=? AND draw_key<? AND user_id<>? ORDER BY draw_key DESC,user_id DESC LIMIT ?',s.id,pivot,user.id,half).all()
 ]);
 const sampled=shuffleDuo(ranges.flatMap(r=>r.results)).slice(0,DUO_LIMITS.refreshBatch-1),ids=sampled.map(r=>Number(r.user_id));
 if(ids.length<3)throw duoError('NO_OPPONENT','서로 다른 참가자 4명이 필요합니다. 참가자가 모이면 다시 시도하세요.');
 const available=(await q(`SELECT u.id FROM users u WHERE u.id IN(${ids.map(()=>'?').join(',')}) AND ${eligible}`,...ids,stamp(now)).all()).results.map(r=>Number(r.id));
 if(available.length<3)throw duoError('NO_OPPONENT','매칭 가능한 참가자가 부족합니다. 잠시 후 다시 시도하세요.');
 profiles=await loadDuoProfiles(env,[Number(user.id),...available],s.config,deps,{now});
 }
 const own=profiles[0];
 if(!own.attackReady)throw duoError('DECK','내 랭크전 공격 덱을 확인하세요.');
 const candidates=shuffleDuo(profiles.slice(1).filter(r=>!isOpenDuo(s.config)||hasRankedDuoMercenary(r))),partner=candidates.find(r=>r.attackReady&&candidates.filter(other=>other.userId!==r.userId&&other.defenseReady).length>=2);
 const opponents=partner?shuffleDuo(candidates.filter(r=>r.userId!==partner.userId&&r.defenseReady)).slice(0,2):[];
 if(!partner||opponents.length!==2)throw duoError('NO_OPPONENT','유효한 공격·방어 덱을 가진 참가자를 찾지 못했습니다. 다시 시도하세요.');
 const token=crypto.randomUUID(),expiresAt=iso(now+90000),at=deps.now?.()??Date.now();
 if(at>=Date.parse(s.config.endsAt))throw duoError('NOT_ACTIVE','듀오 대전 기간이 종료되었습니다.');
 const field=key=>env.DB.dialect==='postgres'?`config_json::jsonb->>'${key}'`:`json_extract(config_json,'$.${key}')`;
 await env.DB.batch([
  ...lock(env,'SELECT id FROM ranked_duo_seasons_v1 WHERE id=? FOR SHARE',s.id),
  ...lock(env,'SELECT user_id FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=? FOR UPDATE',s.id,user.id),
  ...guard(env,`EXISTS(SELECT 1 FROM ranked_duo_seasons_v1 WHERE id=? AND status='ACTIVE' AND CAST(${field('revision')} AS BIGINT)=?) AND EXISTS(SELECT 1 FROM ranked_duo_entries_v1 WHERE season_id=? AND user_id=?)`,[s.id,s.config.revision,s.id,user.id],[
   q('INSERT INTO ranked_duo_tickets_v4(token,season_id,user_id,partner_id,opponent_a,opponent_b,expires_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(season_id,user_id) DO UPDATE SET token=excluded.token,partner_id=excluded.partner_id,opponent_a=excluded.opponent_a,opponent_b=excluded.opponent_b,expires_at=excluded.expires_at,used_at=NULL WHERE ranked_duo_tickets_v4.used_at IS NOT NULL OR ranked_duo_tickets_v4.expires_at<=?',token,s.id,user.id,partner.userId,...opponents.map(r=>r.userId),expiresAt,iso(now))
  ])
 ]);
 const accepted=await q('SELECT * FROM ranked_duo_tickets_v4 WHERE season_id=? AND user_id=?',s.id,user.id).first();
 return publicTicket(env,s,accepted);
}
export function randomDuoMemberWrites(env,s,matchId,ids,now){
 return ids.map((id,index)=>p(env)('INSERT INTO ranked_duo_match_members_v4(match_id,season_id,user_id,side,created_at) VALUES(?,?,?,?,?)',matchId,s.id,id,index<2?'A':'B',iso(now)));
}
export async function randomDuoHistory(env,s,user){
 const rows=(await p(env)(`SELECT m.id,m.user_id,m.status,m.winner,m.created_at,m.attacker_score_after,h.side FROM ranked_duo_match_members_v4 h JOIN ranked_duo_matches_v1 m ON m.id=h.match_id WHERE h.season_id=? AND h.user_id=? ORDER BY h.created_at DESC,h.match_id DESC LIMIT ?`,s.id,user.id,DUO_LIMITS.history).all()).results;
 return {matchmaking:DUO_RANDOM_MODE,history:rows.map(r=>({...r,scoreApplied:Number(r.user_id)===Number(user.id)}))};
}
export function randomDuoFinalWrites(env,s,now){
 return [p(env)(`INSERT INTO ranked_duo_final_v4(season_id,user_id,nickname,final_rank,score,wins,losses,completed_at)
  SELECT r.season_id,r.user_id,u.nickname,ROW_NUMBER() OVER (ORDER BY r.score DESC,r.user_id DESC),r.score,r.wins,r.losses,?
  FROM ranked_duo_players_v4 r JOIN users u ON u.id=r.user_id WHERE r.season_id=? AND r.wins+r.losses>0 AND ${eligible}
  ORDER BY r.score DESC,r.user_id DESC${isOpenDuo(s.config)?'':' LIMIT ?'}`,iso(now),s.id,stamp(now),...(isOpenDuo(s.config)?[]:[DUO_LIMITS.participants])),
  p(env)(`INSERT INTO ranked_duo_trophies_v2(season_id,user_id,team_id,final_rank,acquired_at) SELECT season_id,user_id,'random-player:' || CAST(user_id AS TEXT),final_rank,completed_at FROM ranked_duo_final_v4 WHERE season_id=? AND final_rank BETWEEN 1 AND ? ON CONFLICT(season_id,user_id) DO NOTHING`,s.id,DUO_CHALLENGER.rankLimit)
 ];
}
