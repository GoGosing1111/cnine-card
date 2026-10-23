// Public honor projections only. These readers never initialize schemas, award or mutate records.
import {mercenaryCodexDocument} from './_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {JINMU_CODE,jinmuAccountAllowed} from '../shared/mercenary-jinmu-v1.mjs';
import {JOKRO_CODE,jokroAccountAllowed} from '../shared/mercenary-jokro-v1.mjs';
import {readJinmuPackOwners} from './_mercenary_jinmu_access.js';
import {readJokroPackOwners} from './_mercenary_jokro_access.js';

export const BLUE_EMPIRE_GOAL=20,LOYAL_SERVICE_POST_GOAL=20;
export const BLUE_EMPIRE_SQL=`WITH qualified AS (
 SELECT s.season_key,MIN(datetime(s.completed_at)) completed_at
 FROM pvp_season_settlements s JOIN pvp_season_settlement_ranks r ON r.settlement_id=s.id
 WHERE r.user_id=? AND s.status='COMPLETED' AND TRIM(COALESCE(s.completed_at,''))<>''
 AND r.tier_id='challenger' AND r.final_rank BETWEEN 1 AND 20 GROUP BY s.season_key
), numbered AS (SELECT *,ROW_NUMBER() OVER (ORDER BY completed_at,season_key) ordinal FROM qualified)
 SELECT COUNT(*) progress,MIN(CASE WHEN ordinal=20 THEN completed_at END) acquired_at FROM numbered`;
export const LOYAL_SERVICE_POST_SQL=`WITH paid AS (
 SELECT q.week_key,MIN(datetime(c.credited_at)) acquired_at
 FROM quest_weekly_claims_v1 q
 JOIN user_messages m ON m.id=q.message_id AND m.user_id=q.user_id AND m.campaign_key=('weekly-quest:' || q.week_key || ':POST')
 JOIN user_message_rewards r ON r.message_id=m.id AND r.user_id=q.user_id AND r.reward_type=q.reward_type AND r.reward_amount=q.reward_amount
 JOIN user_message_reward_claim_receipts_v1222 c ON c.reward_id=r.id AND c.message_id=m.id AND c.user_id=q.user_id
 AND c.reward_type=UPPER(r.reward_type) AND c.reward_amount=r.reward_amount
 WHERE q.user_id=? AND q.quest_id='POST' AND q.status='COMPLETED'
 AND TRIM(COALESCE(r.claimed_at,''))<>'' AND TRIM(COALESCE(c.credited_at,''))<>''
 GROUP BY q.week_key
), numbered AS (SELECT *,ROW_NUMBER() OVER (ORDER BY acquired_at,week_key) ordinal FROM paid)
 SELECT COUNT(*) progress,MIN(CASE WHEN ordinal=20 THEN acquired_at END) acquired_at FROM numbered`;
const honor=(row,goal)=>({count:Number(row?.progress||0)>=goal?1:0,progress:Number(row?.progress||0),goal,acquiredAt:row?.acquired_at||null});
export async function readBlueEmpireHonors(env,userId){return honor(await env.DB.prepare(BLUE_EMPIRE_SQL).bind(userId).first(),BLUE_EMPIRE_GOAL);}
export async function readLoyalServicePostHonors(env,userId){
 const installed=await env.DB.prepare("SELECT value FROM app_meta WHERE key='quest_hub_foundation_20260924_v1'").first();
 if(!installed)return honor(null,LOYAL_SERVICE_POST_GOAL);
 return honor(await env.DB.prepare(LOYAL_SERVICE_POST_SQL).bind(userId).first(),LOYAL_SERVICE_POST_GOAL);
}

// Use the public codex projection as the single catalog source, including locked
// and direct-grant cards. Shop settings and remaining stock do not change it.
// Limited identities are published in code; CMS only edits the ordinary roster.
let codexSssLimitedCodes;
export function readCodexSssLimitedCodes(){
 if(!codexSssLimitedCodes){
  const cards=mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:0}).cards;
  codexSssLimitedCodes=Object.freeze([...new Set(cards.filter(card=>card.rank==='SSS'&&card.edition==='LIMITED').map(card=>card.code))].sort());
 }
 return [...codexSssLimitedCodes];
}
export async function readLimitedEditionHonors(env,userId){
 const codes=readCodexSssLimitedCodes(),owned=await env.DB.prepare('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND total_copies>0').bind(userId).all();
 const holdings=new Set(owned.results.map(r=>r.mercenary_code).filter(code=>codes.includes(code)));
 // Keep recalled or unproven exclusive holdings out, as in the account collection.
 if(holdings.has(JINMU_CODE)&&!jinmuAccountAllowed(userId,JINMU_CODE)&&!(await readJinmuPackOwners(env,[userId])).has(Number(userId)))holdings.delete(JINMU_CODE);
 if(holdings.has(JOKRO_CODE)&&!jokroAccountAllowed(userId,JOKRO_CODE)&&!(await readJokroPackOwners(env,[userId])).has(Number(userId)))holdings.delete(JOKRO_CODE);
 const total=codes.length,goal=Math.ceil(total*4/5),progress=holdings.size;
 return {count:total>0&&progress>=goal?1:0,acquiredAt:null,progress,goal,total};
}
export async function readNewTrophyMilestones(env,userId,{codes}={}){
 // Reward calculations request only configured nonzero benefits; public cards omit this filter.
 const selected=new Set(codes===undefined?['BLUE_EMPIRE_20','LIMITED_EDITION_80','LOYAL_SERVICE_POST_20']:codes);
 const [blueEmpire,limitedEdition,loyalServicePost]=await Promise.all([
  selected.has('BLUE_EMPIRE_20')?readBlueEmpireHonors(env,userId):honor(null,BLUE_EMPIRE_GOAL),
  selected.has('LIMITED_EDITION_80')?readLimitedEditionHonors(env,userId):{count:0,acquiredAt:null,progress:0,goal:0,total:0},
  selected.has('LOYAL_SERVICE_POST_20')?readLoyalServicePostHonors(env,userId):honor(null,LOYAL_SERVICE_POST_GOAL)
 ]);
 return {blueEmpire,limitedEdition,loyalServicePost};
}
