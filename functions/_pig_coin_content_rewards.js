import {pigCoinRewardStatements,readLootShopPolicy} from './_loot_shop.js';

export async function territoryPigCoinPreview(env,reward){
 const {policy}=await readLootShopPolicy(env),rule=policy.sources.find(s=>s.code==='TERRITORY');
 if(!policy.rewardsEnabled||!rule.enabled||!['A','B'].includes(reward.side))return 0;
 return (reward.pig_winner_side===reward.side?rule.victoryAmount:0)+(Number(reward.attacks)>=Number(reward.required_attacks)?rule.participationAmount:0);
}

export async function territoryPigCoinStatements(env,{userId,roundId,version}){
 // Retired legacy rounds predate this reward contract.
 if(version!=='V3')return [];
 return pigCoinRewardStatements(env,{userId,source:'TERRITORY',referenceId:`V3:${roundId}`,
  guardSql:"EXISTS(SELECT 1 FROM territory_war_v3_rewards r JOIN territory_war_v3_rounds w ON w.id=r.round_id WHERE r.round_id=? AND r.user_id=? AND r.claimed_at IS NULL AND w.settled_at IS NOT NULL AND r.side IN ('A','B'))",guardBindings:[roundId,userId],
  rewardSql:rule=>({sql:`COALESCE((SELECT
   CASE WHEN w.winner_side=r.side THEN ? ELSE 0 END +
   CASE WHEN r.attacks>=r.required_attacks THEN ? ELSE 0 END
   FROM territory_war_v3_rewards r JOIN territory_war_v3_rounds w ON w.id=r.round_id
   WHERE r.round_id=? AND r.user_id=?),0)`,bindings:[rule.victoryAmount,rule.participationAmount,roundId,userId]})});
}

export async function clanPigCoinStatements(env,{userId,seasonId}){
 return pigCoinRewardStatements(env,{userId,source:'CLAN',referenceId:String(seasonId),
  guardSql:"EXISTS(SELECT 1 FROM clan_reward_receipts WHERE season_id=? AND user_id=? AND status='PENDING')",guardBindings:[seasonId,userId],
  rewardSql:rule=>({sql:`COALESCE((SELECT CASE WHEN r.reward_tier='WINNER' THEN ? ELSE 0 END +
   CASE WHEN (SELECT COALESCE(SUM(MAX(
    COALESCE((SELECT p.completed_attacks FROM clan_participation_progress p WHERE p.war_id=w.id AND p.user_id=r.user_id),0),
    (SELECT COUNT(*) FROM clan_war_battles b WHERE b.war_id=w.id AND b.attacker_user_id=r.user_id AND b.attacker_clan_id=r.clan_id AND b.status='COMPLETED')
   )),0) FROM clan_wars w WHERE w.season_id=r.season_id AND w.round_no<1000 AND (w.clan_a_id=r.clan_id OR w.clan_b_id=r.clan_id))>=? THEN ? ELSE 0 END
   FROM clan_reward_receipts r WHERE r.season_id=? AND r.user_id=?),0)`,bindings:[rule.victoryAmount,rule.minAttacks,rule.participationAmount,seasonId,userId]})});
}
