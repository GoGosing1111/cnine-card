import {DUO_WEEKLY_POLICY_KEY,DUO_REWARD_BATCH,validateDuoPolicy} from '../shared/ranked-duo-weekly-v3.mjs';
import {resolveDuoTier} from '../shared/ranked-duo-season-v2.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const DUO_WEEKLY_SCHEMA_KEY='ranked_duo_weekly_schema_v3';
export const DUO_WEEKLY_SCHEMA=[
 "CREATE TABLE IF NOT EXISTS ranked_duo_settlement_v3(season_id TEXT PRIMARY KEY,last_rank BIGINT NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS ranked_duo_rewards_v3(season_id TEXT NOT NULL,user_id BIGINT NOT NULL,team_id TEXT NOT NULL,final_rank BIGINT NOT NULL,tier_id TEXT NOT NULL,tier_name TEXT NOT NULL,reward_coin BIGINT NOT NULL,reward_shards BIGINT NOT NULL,credited_at TEXT NOT NULL,PRIMARY KEY(season_id,user_id))",
 "CREATE INDEX IF NOT EXISTS ranked_duo_rewards_owner_v3 ON ranked_duo_rewards_v3(user_id,credited_at)",
 "CREATE INDEX IF NOT EXISTS ranked_duo_rewards_rank_v3 ON ranked_duo_rewards_v3(season_id,final_rank)"
];
const p=env=>(sql,...args)=>env.DB.prepare(sql).bind(...args),iso=now=>new Date(now).toISOString();
export async function readDuoPolicy(env,{snapshot=false}={}){
 const row=await p(env)('SELECT value FROM app_meta WHERE key=?',DUO_WEEKLY_POLICY_KEY).first();
 if(!row)return null;
 const policy=validateDuoPolicy(JSON.parse(row.value));return snapshot?{policy,value:row.value}:policy;
}
// Independent version gate: the existing V2 schema marker must not hide V3 DDL.
export async function prepareDuoEconomy(env){
 if(await p(env)('SELECT value FROM app_meta WHERE key=?',DUO_WEEKLY_SCHEMA_KEY).first())return;
 if(env.DB.execSchema)await env.DB.execSchema(DUO_WEEKLY_SCHEMA);else for(const sql of DUO_WEEKLY_SCHEMA)await env.DB.prepare(sql).run();
 await p(env)('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING',DUO_WEEKLY_SCHEMA_KEY,'20260925-weekly-rewards').run();
}
export function duoVictoryWrites(env,userId,amount,matchId){
 if(!amount)return [];
 const q=p(env),token=crypto.randomUUID();
 return [jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM users WHERE id=? AND coin>=0 AND coin<=?)',[userId,Number.MAX_SAFE_INTEGER-amount]),
  q('UPDATE users SET coin=coin+? WHERE id=?',amount,userId),
  q('INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT id,?,coin,? FROM users WHERE id=?',amount,'RANKED_DUO_WIN '+matchId,userId),
  jointGuardEnd(env.DB,token)];
}
export async function deliverDuoTierRewards(env,s,core,progress,now){
 const q=p(env),cursor=Number(progress.last_rank),rows=(await q('SELECT * FROM ranked_duo_final_v2 WHERE season_id=? AND final_rank>? AND final_rank<=? ORDER BY final_rank LIMIT ?',s.id,cursor,cursor+DUO_REWARD_BATCH,DUO_REWARD_BATCH).all()).results;
 if(!rows.length){
  await env.DB.batch(core.seasonWrite(env,s,[q("UPDATE ranked_duo_seasons_v1 SET status='CLOSED',revision=revision+1 WHERE id=?",s.id)]));
  return {phase:'CLOSED',seasonId:s.id,changed:true,nextCheckAt:iso(now+1000)};
 }
 const last=Number(rows.at(-1).final_rank),members=rows.flatMap(row=>{
  const tier=resolveDuoTier(Number(row.score),s.config,Number(row.final_rank)),enabled=s.config.rewards.tierEnabled;
  return [row.user_a,row.user_b].map(id=>({userId:Number(id),row,tier,coin:enabled?tier.rewardCoin||0:0,shards:enabled?tier.rewardShards||0:0}));
 }).sort((a,b)=>a.userId-b.userId);
 const ids=members.map(m=>m.userId),marks=ids.map(()=>'?').join(','),has="r.season_id=? AND r.final_rank>? AND r.final_rank<=?";
 // Locks cover at most 40 recipients, never the full population.
 const body=[
  ...(env.DB.dialect==='postgres'?[q('SELECT id FROM users WHERE id IN('+marks+') ORDER BY id FOR UPDATE',...ids)]:[]),
  ...members.map(m=>q('INSERT INTO ranked_duo_rewards_v3(season_id,user_id,team_id,final_rank,tier_id,tier_name,reward_coin,reward_shards,credited_at) VALUES(?,?,?,?,?,?,?,?,?)',s.id,m.userId,m.row.id,Number(m.row.final_rank),m.tier.id,m.tier.name,m.coin,m.shards,iso(now))),
  ...core.guard(env,'(SELECT COUNT(*) FROM users u JOIN ranked_duo_rewards_v3 r ON r.user_id=u.id WHERE '+has+' AND u.coin>=0 AND u.card_shards>=0 AND u.coin<=?-r.reward_coin AND u.card_shards<=?-r.reward_shards)=?',
   [s.id,cursor,last,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,members.length],[
    q('UPDATE users SET coin=coin+(SELECT r.reward_coin FROM ranked_duo_rewards_v3 r WHERE r.user_id=users.id AND '+has+'),card_shards=card_shards+(SELECT r.reward_shards FROM ranked_duo_rewards_v3 r WHERE r.user_id=users.id AND '+has+') WHERE id IN('+marks+')',s.id,cursor,last,s.id,cursor,last,...ids),
    q("INSERT INTO coin_logs(user_id,change_amount,balance_after,reason) SELECT u.id,r.reward_coin,u.coin,? FROM ranked_duo_rewards_v3 r JOIN users u ON u.id=r.user_id WHERE "+has+" AND r.reward_coin>0",'RANKED_DUO_TIER '+s.id,s.id,cursor,last),
    q("INSERT INTO shard_logs(user_id,change_amount,balance_after,reason) SELECT u.id,r.reward_shards,u.card_shards,? FROM ranked_duo_rewards_v3 r JOIN users u ON u.id=r.user_id WHERE "+has+" AND r.reward_shards>0",'RANKED_DUO_TIER '+s.id,s.id,cursor,last),
    q('UPDATE ranked_duo_settlement_v3 SET last_rank=? WHERE season_id=?',last,s.id),
    q('UPDATE ranked_duo_seasons_v1 SET revision=revision+1 WHERE id=?',s.id)
   ])
 ];
 await env.DB.batch(core.seasonWrite(env,s,core.guard(env,'EXISTS(SELECT 1 FROM ranked_duo_settlement_v3 WHERE season_id=? AND last_rank=?)',[s.id,cursor],body)));
 return {phase:'SETTLING',seasonId:s.id,paidThroughRank:last,nextCheckAt:iso(now+1000)};
}
