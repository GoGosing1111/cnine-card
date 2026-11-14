import {orgAssert} from '../shared/organization-system-v1.mjs';

export const CLAN_REJOIN_DELAY_MS=7*86400000;
const effectiveAt=Date.parse('2026-11-14T00:00:00+09:00');
export const clanRejoinPrefix=round=>'organization:rejoin-after:'+(round.scope==='LIVE'?'LIVE':round.id)+':';
export const clanRejoinKey=(round,userId)=>clanRejoinPrefix(round)+Number(userId);
export function clanRejoinView(value,now){
 const availableAt=Number(value?.availableAt)||0;
 return {days:7,blocked:availableAt>now,availableAt:availableAt||null,leftAt:Number(value?.leftAt)||null};
}
export async function readClanRejoin(q,round,userId,now){
 if(!round||now<effectiveAt)return clanRejoinView(null,now);
 const [row]=await q('SELECT value FROM app_meta WHERE key=$1',[clanRejoinKey(round,userId)]);
 return clanRejoinView(row?JSON.parse(row.value):null,now);
}
export async function assertClanRejoin(q,round,userId,now){
 const restriction=await readClanRejoin(q,round,userId,now);
 const at=restriction.availableAt?new Date(restriction.availableAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'';
 orgAssert(!restriction.blocked,'REJOIN_WAIT','클랜 탈퇴 후 7일 동안 재가입할 수 없습니다. '+at+' (한국시간)에 재가입 제한이 해제됩니다.');
 return restriction;
}
export async function recordClanLeave(q,round,userId,organizationId,now){
 const value={userId:Number(userId),roundId:round.id,organizationId,leftAt:now,availableAt:now+CLAN_REJOIN_DELAY_MS};
 await q('INSERT INTO app_meta(key,value,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[clanRejoinKey(round,userId),JSON.stringify(value),new Date(now).toISOString()]);
 return value;
}
