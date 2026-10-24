// Weekly territory snapshots are independent of the per-battle/session rewards.
export const ORGANIZATION_COMPETITION_RELEASE = Date.parse('2026-10-24T00:00:00+09:00');
export const ORGANIZATION_WEEK_MS = 7 * 86400000;
export const defaultOrganizationCompetitionPolicy = () => ({seasonWeeks:4});
export const defaultOrganizationPigCoinReward = () => ({enabled:true,requiredTerritories:8,amount:200});

export function validateOrganizationCompetitionSettings(value) {
  const fail = message => {throw Object.assign(Error(message),{status:400,code:'ORG_FACTION_POLICY'});};
  const pigCoinReward = value.pigCoinReward === undefined ? defaultOrganizationPigCoinReward() : value.pigCoinReward;
  const competition = value.competition === undefined ? defaultOrganizationCompetitionPolicy() : value.competition;
  if (!pigCoinReward || typeof pigCoinReward.enabled !== 'boolean'
    || !Number.isSafeInteger(pigCoinReward.requiredTerritories) || pigCoinReward.requiredTerritories < 1 || pigCoinReward.requiredTerritories > 25
    || !Number.isSafeInteger(pigCoinReward.amount) || pigCoinReward.amount < 1 || pigCoinReward.amount > 100000)
    fail('피그코인 보상은 지급 여부, 점령 1~25개, 수량 1~10만 개를 설정하세요.');
  if (!competition || !Number.isSafeInteger(competition.seasonWeeks) || competition.seasonWeeks < 1 || competition.seasonWeeks > 52)
    fail('세력전 시즌 기간은 1~52주로 설정하세요.');
  return {pigCoinReward:{enabled:pigCoinReward.enabled,requiredTerritories:pigCoinReward.requiredTerritories,amount:pigCoinReward.amount},competition:{seasonWeeks:competition.seasonWeeks}};
}

export function organizationWeekStart(now) {
  const local = new Date(now + 9 * 3600000);
  return Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()) - 9 * 3600000 - ((local.getUTCDay()+6)%7) * 86400000;
}

// Competition ranks: equal points share a place (1, 1, 3). The display order of
// tied clans is stable by ID; current holdings never break a settled points tie.
export function organizationPointRanking(organizations,points,holdings={}) {
  const rows = organizations.map(o=>({organizationId:o.id,points:points[o.id]||0,territories:holdings[o.id]||0}));
  rows.sort((a,b)=>b.points-a.points||a.organizationId-b.organizationId);
  return rows.map((row,i)=>({...row,rank:rows.findIndex(other=>other.points===row.points)+1}));
}

export function organizationSessionRewardRules(base,policy,startsAt) {
  if (startsAt < ORGANIZATION_COMPETITION_RELEASE) return base;
  return {...base,pigCoinReward:{...(policy.pigCoinReward||defaultOrganizationPigCoinReward())}};
}

export function addOrganizationPigCoinRecipients(snapshot,roster) {
  const reward = snapshot.rewardRules?.pigCoinReward;
  if (snapshot.status !== 'SETTLED' || !reward?.enabled) return snapshot;
  for (const member of roster) {
    const userId = Number(member.userId),clanId=Number(member.clanId),territories=snapshot.holdings[clanId]||0;
    if (member.status !== 'ACTIVE' || territories < reward.requiredTerritories
      || !snapshot.participants.includes(userId) || Number(snapshot.participantClans?.[userId]) !== clanId) continue;
    let recipient = snapshot.recipients.find(r=>r.userId===userId);
    if (!recipient) {
      recipient={userId,clanId,territories,amount:0,masterStars:0,mysticEnergy:0};
      snapshot.recipients.push(recipient);
    }
    recipient.pigCoins=reward.amount;
  }
  return snapshot;
}
