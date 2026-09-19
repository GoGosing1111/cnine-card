import {coupSettings} from '../shared/coup-palace-v2115.mjs';

// Public, read-only summary. Do not settle rounds or load private player state
// while refreshing the lobby; the regular coup endpoints own those mutations.
export async function coupLiveOperation(env,now=Date.now()){
  const setting=await env.DB.prepare("SELECT value FROM app_meta WHERE key='coup_settings_v2115'").first();
  if(!coupSettings(JSON.parse(setting?.value||'{}')).enabled)return null;
  const round=await env.DB.prepare(`SELECT id,status,ends_at FROM coup_rounds_v2115
    WHERE status='RECRUITING' OR (status='ACTIVE' AND ends_at>?)
    ORDER BY created_at DESC LIMIT 1`).bind(now).first();
  if(!round)return null;
  const recruiting=round.status==='RECRUITING';
  return {kind:'COUP',phase:round.status,entityId:String(round.id),title:'황궁 쿠데타',
    detail:recruiting?'족장팀·반란군 참가 모집 중':'황궁 전선에서 교전 진행 중',
    deadlineAt:recruiting?null:new Date(Number(round.ends_at)).toISOString(),sortOrder:6};
}
