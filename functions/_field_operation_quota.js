// V3 operations settle on entry. Legacy escort runs can be started and claimed on different KST dates.
export const DEFAULT_FIELD_DAILY_LIMIT=5;

export function kstDayRange(now=Date.now()) {
  const day=new Date(now+9*3600000);
  const start=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate())-9*3600000;
  const sqlTime=time=>new Date(time).toISOString().replace('T',' ').slice(0,19);
  return {start:sqlTime(start),end:sqlTime(start+86400000)};
}

export function fieldDailyQuota(mode,userId,cfg,at=Date.now()) {
  const yard=mode==='yard',name=yard?'폐차장':'호송작전';
  const runLimit=(yard?cfg.dailyRuns:cfg.dailyRunLimit)??DEFAULT_FIELD_DAILY_LIMIT;
  const rewardLimit=(yard?cfg.dailyRuns:cfg.dailyRewardLimit)??DEFAULT_FIELD_DAILY_LIMIT;
  const table=yard?'scrapyard_runs_v1676':'pve_escort_runs_v1830';
  const {start,end}=kstDayRange(at),range=[userId,start,end];
  const rule=(column,extra,limit,label)=>{
    const count=`(SELECT COUNT(*) FROM ${table} WHERE user_id=? AND ${column}>=? AND ${column}<?${extra})`;
    return {count,limit,sql:count+'<?',args:[...range,limit],message:`오늘의 ${name} ${label} ${limit}회를 모두 사용했습니다.`};
  };
  // Pre-renewal salvage could grant a nonempty reward array even on a partial clear.
  const rewardFilter=yard?" AND (success=1 OR (rewards_json LIKE '[%' AND rewards_json<>'[]'))":" AND status='CLAIMED'";
  return {
    runs:rule(yard?'created_at':'started_at','',runLimit,'도전'),
    rewards:rule(yard?'created_at':'claimed_at',rewardFilter,rewardLimit,'보상 수령'),
    range,resetsAt:end.replace(' ','T')+'Z'
  };
}

export async function readFieldDay(db,quota) {
  const {runs,rewards,range,resetsAt}=quota;
  const row=await db.prepare(`SELECT ${runs.count} AS starts,${rewards.count} AS claims`).bind(...range,...range).first();
  return {runLimit:runs.limit,rewardLimit:rewards.limit,startedCount:Number(row.starts),rewardCount:Number(row.claims),resetsAt};
}
