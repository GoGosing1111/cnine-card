import {JOINT_ATOMIC_SCHEMA,jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {rankedEnergyFromRow,rankedSqlUtc} from '../shared/ranked-reform-v1.mjs';

export const RANKED_REFORM_SCHEMA=[...JOINT_ATOMIC_SCHEMA,
 `CREATE TABLE IF NOT EXISTS ranked_fight_receipts_v1(user_id INTEGER NOT NULL,request_id TEXT NOT NULL,match_token TEXT NOT NULL UNIQUE,response_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,request_id))`,
 `CREATE TABLE IF NOT EXISTS ranked_reform_profile_archive_v1(operation_key TEXT NOT NULL,user_id INTEGER NOT NULL,season_score INTEGER NOT NULL,highest_score INTEGER NOT NULL,wins INTEGER NOT NULL,losses INTEGER NOT NULL,updated_at TEXT,PRIMARY KEY(operation_key,user_id))`
];
const p=env=>(sql,...args)=>env.DB.prepare(sql).bind(...args);
const lock=(env,sql,...args)=>env.DB.dialect==='postgres'?[p(env)(sql,...args)]:[];

// Reads calculate recharge without writing a stale snapshot over a concurrent fight.
export async function readRankedEnergy(env,user,cfg,{unlimited=false,now=Date.now()}={}){
 if(unlimited)return {state:{enabled:cfg.enabled,unlimited:true,energy:cfg.maxEnergy,maxEnergy:cfg.maxEnergy,costPerBattle:cfg.costPerBattle,rechargeMinutes:cfg.rechargeMinutes,nextRechargeAt:null},row:null};
 const q=p(env);let row=await q('SELECT * FROM user_pvp_energy WHERE user_id=?',user.id).first();
 if(!row){await q('INSERT OR IGNORE INTO user_pvp_energy(user_id,energy,last_recharged_at,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)',user.id,cfg.maxEnergy,rankedSqlUtc(now)).run();row=await q('SELECT * FROM user_pvp_energy WHERE user_id=?',user.id).first();}
 return {row,state:rankedEnergyFromRow(row,cfg,now)};
}

export async function rankedFightReceipt(env,userId,requestId,matchToken){
 const row=await p(env)('SELECT match_token,response_json FROM ranked_fight_receipts_v1 WHERE user_id=? AND request_id=?',userId,requestId).first();
 if(!row)return null;
 if(row.match_token!==matchToken)throw Object.assign(Error('같은 요청 번호로 다른 경기를 진행할 수 없습니다.'),{status:409});
 const wallet=await p(env)('SELECT coin,magic_crystals FROM users WHERE id=?',userId).first();
 return {...JSON.parse(row.response_json),coinAfter:Number(wallet?.coin||0),magicCrystalsAfter:Number(wallet?.magic_crystals||0),replayed:true};
}

// Energy, ticket, attacker score, history, coins, audit and receipt commit together.
// Defense neither changes score nor tie-breaking win/loss counts.
export async function commitRankedFight(env,{user,settings,ticket,requestId,energy,beforeScore,writes,response,now=Date.now()}){
 const q=p(env),token=crypto.randomUUID(),field=name=>env.DB.dialect==='postgres'?`value::jsonb->>'${name}'`:`CAST(json_extract(value,'$.${name}') AS TEXT)`;
 const truth=env.DB.dialect==='postgres'?'true':'1';
 const predicate=`EXISTS(SELECT 1 FROM app_meta WHERE key='pvp_settings_v1' AND COALESCE(${field('enabled')},?)=? AND ${field('seasonName')}=? AND ${field('startsAt')}=? AND ${field('endsAt')}=?)
 AND CURRENT_TIMESTAMP>=? AND CURRENT_TIMESTAMP<?
 AND EXISTS(SELECT 1 FROM pvp_profiles WHERE user_id=? AND season_score=?)
 AND EXISTS(SELECT 1 FROM pvp_ranked_match_tickets_v1671 WHERE token=? AND attacker_id=? AND used_at IS NULL AND expires_at>CURRENT_TIMESTAMP)`;
 const args=[truth,truth,settings.seasonName,settings.startsAt,settings.endsAt,settings.startsAt,settings.endsAt,user.id,beforeScore,ticket.token,user.id];
 const extra=energy.row?' AND EXISTS(SELECT 1 FROM user_pvp_energy WHERE user_id=? AND energy=? AND last_recharged_at=?)':'';
 if(energy.row)args.push(user.id,Number(energy.row.energy),energy.row.last_recharged_at);
 if(!energy.state.unlimited&&energy.state.energy<energy.state.costPerBattle)throw Object.assign(Error('랭크전 행동력이 부족합니다.'),{status:409,code:'NO_PVP_ENERGY',energy:energy.state});
 const nextEnergy=energy.state.unlimited?energy.state:{...energy.state,energy:energy.state.energy-energy.state.costPerBattle,lastRechargedAt:energy.state.energy>=energy.state.maxEnergy?rankedSqlUtc(now):energy.state.lastRechargedAt};
 if(!nextEnergy.unlimited)nextEnergy.nextRechargeAt=new Date(Date.parse(nextEnergy.lastRechargedAt.replace(' ','T')+'Z')+nextEnergy.rechargeMinutes*60000).toISOString();
 const receipt={...response,energy:nextEnergy,serverNow:new Date(now).toISOString()};
 await env.DB.batch([
  ...lock(env,"SELECT key FROM app_meta WHERE key='pvp_settings_v1' FOR SHARE"),
  ...lock(env,'SELECT user_id FROM pvp_profiles WHERE user_id=? FOR UPDATE',user.id),
  ...lock(env,'SELECT user_id FROM user_pvp_energy WHERE user_id=? FOR UPDATE',user.id),
  ...lock(env,'SELECT token FROM pvp_ranked_match_tickets_v1671 WHERE token=? FOR UPDATE',ticket.token),
  jointGuard(env.DB,token,predicate+extra,args),
  q('UPDATE pvp_ranked_match_tickets_v1671 SET used_at=CURRENT_TIMESTAMP WHERE token=?',ticket.token),
  ...(energy.row?[q('UPDATE user_pvp_energy SET energy=?,last_recharged_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?',nextEnergy.energy,nextEnergy.lastRechargedAt,user.id)]:[]),
  ...writes,
  q('INSERT INTO ranked_fight_receipts_v1(user_id,request_id,match_token,response_json) VALUES(?,?,?,?)',user.id,requestId,ticket.token,JSON.stringify(receipt)),
  jointGuardEnd(env.DB,token)
 ]);
 return receipt;
}
