export const SUPPORT_PLAN=Object.freeze({version:1,priceWon:29800,durationDays:30,minimumAccountDays:3,extraLegionEntries:3,magnetSuccessPercent:100});
export const SUPPORT_NOTICE='후원금은 숲켓몬의 서버 운영비와 서비스 유지·보수, 새로운 콘텐츠 및 기능 개발에 사용됩니다.';
export const SUPPORT_DURATION_MS=SUPPORT_PLAN.durationDays*86400000;
export const supportKey=userId=>'server_support_v1:'+Number(userId);
// Verified operating account. A matching nickname alone never grants access.
export const canManageSupport=user=>Number(user?.id)===1&&user?.role==='OWNER';
export function supportAccountEligible(account,now=Date.now()){
  if(account?.status!=='ACTIVE'||!account.verified_at)return false;
  const raw=String(account.created_at||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(raw))return false;
  const created=Date.parse(raw.replace(' ','T')+(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)?'':'Z'));
  return Number.isFinite(created)&&now-created>=SUPPORT_PLAN.minimumAccountDays*86400000;
}
export function emptySupport(){return {version:1,revision:0,startsAt:0,endsAt:0,magnetPetCode:null,revokedAt:null};}
export function supportBenefits(record,now=Date.now()){
  const active=record.revokedAt===null&&record.startsAt<=now&&record.endsAt>now;
  return {...record,active,extraLegionEntries:active?SUPPORT_PLAN.extraLegionEntries:0,magnetPetCode:active?record.magnetPetCode:null};
}
