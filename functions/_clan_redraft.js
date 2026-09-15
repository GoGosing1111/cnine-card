// A season-scoped operation record. Ordinary seasons retain their existing rules.
export const clanRedraftKey=seasonId=>`clan_redraft_v20260916:${Number(seasonId)}`;
export async function readClanRedraft(env,seasonId){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(clanRedraftKey(seasonId)).first();
  if(!row)return null;
  const plan=JSON.parse(row.value),quotas=Object.values(plan.quotas||{});
  if(plan.version!==1||Number(plan.seasonId)!==Number(seasonId)||!Number.isFinite(Date.parse(plan.startsAt))||!Number.isSafeInteger(plan.participantCount)||quotas.length<2||quotas.length>8||quotas.some(n=>!Number.isSafeInteger(n)||n<1||n>22)||Math.max(...quotas)-Math.min(...quotas)>1||quotas.reduce((a,b)=>a+b,0)!==plan.participantCount)throw new Error('재드래프트 정원 설정을 확인해야 합니다.');
  return plan;
}
export function applyClanRedraftQuotas(teams,plan){
  if(!plan)return teams;
  if(teams.length!==Object.keys(plan.quotas).length||teams.some(team=>!Object.hasOwn(plan.quotas,String(team.clan_id))))throw new Error('재드래프트 클랜 목록이 일치하지 않습니다.');
  return teams.map(team=>({...team,draft_quota:plan.quotas[String(team.clan_id)]}));
}
export const clanDraftCapacity=team=>Number(team?.draft_quota??22);
export function assertClanRedraftComplete(teams,plan){
  if(!plan)return;
  const limited=applyClanRedraftQuotas(teams,plan);
  if(limited.some(team=>Number(team.member_count)!==clanDraftCapacity(team)))throw new Error('모든 클랜의 균등 정원을 채운 뒤 시즌을 시작할 수 있습니다.');
}
