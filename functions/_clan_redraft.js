// A season-scoped operation record. Ordinary seasons retain their existing rules.
export const clanRedraftKey=seasonId=>`clan_redraft_v20260916:${Number(seasonId)}`;
export async function readClanRedraft(env,seasonId){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(clanRedraftKey(seasonId)).first();
  if(!row)return null;
  return parseClanRedraft(row.value,seasonId);
}
export function parseClanRedraft(value,seasonId){
  const plan=JSON.parse(value),quotas=Object.values(plan?.quotas||{});
  if(!plan||Array.isArray(plan)||!plan.quotas||Array.isArray(plan.quotas))throw new Error('재드래프트 정원 설정을 확인해야 합니다.');
  if(plan.version!==1||Number(plan.seasonId)!==Number(seasonId)||!Number.isFinite(Date.parse(plan.startsAt))||!Number.isSafeInteger(plan.participantCount)||quotas.length<2||quotas.length>8||quotas.some(n=>!Number.isSafeInteger(n)||n<1||n>22)||Math.max(...quotas)-Math.min(...quotas)>1||quotas.reduce((a,b)=>a+b,0)!==plan.participantCount)throw new Error('재드래프트 정원 설정을 확인해야 합니다.');
  // Audited, season-specific additions apply after the balanced draft is over.
  // They never enlarge the draft pool or change another clan's admission limit.
  if(plan.activeRosterOverrides!==undefined){
    const overrides=plan.activeRosterOverrides;
    if(!overrides||typeof overrides!=='object'||Array.isArray(overrides)||!Object.keys(overrides).length
      ||Object.entries(overrides).some(([id,entry])=>!Object.hasOwn(plan.quotas,id)||!entry||Array.isArray(entry)
        ||!Number.isSafeInteger(entry.maxMembers)||entry.maxMembers<=plan.quotas[id]||entry.maxMembers>22
        ||typeof entry.operationId!=='string'||!entry.operationId.startsWith('ops:')||entry.operationId.length<12||entry.operationId.length>200))throw new Error('시즌 중 추가 편입 정원 설정을 확인해야 합니다.');
  }
  return plan;
}
const afterDraft=phase=>['ACTIVE','CHAMPIONS','SETTLEMENT','COMPLETE'].includes(phase);
export function clanRedraftPublicState(plan,phase){
  if(!plan)return null;
  const quotas={...plan.quotas};
  if(afterDraft(phase))for(const [id,entry] of Object.entries(plan.activeRosterOverrides||{}))quotas[id]=entry.maxMembers;
  return {startsAt:plan.startsAt,participantCount:Object.values(quotas).reduce((a,b)=>a+b,0),quotas};
}
export function clanMemberCapacity(season,clanId,plan){
  return afterDraft(season.phase)&&plan?.activeRosterOverrides?.[String(clanId)]?.maxMembers
    ||Math.min(22,Number(season.max_members)||22);
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
