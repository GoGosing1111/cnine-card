// Permanent policy for the separate ONE store application, for all accounts.
// Never send deletion/cleanup requests or change ownership, money, or live data.
export const DISABLED_ROUTES = Object.freeze(['prediction','prisoncamp','seasonPass','serverSupport','support','supportPackage']);
export const restricted = () => true;
export const allowsRoute = route => !DISABLED_ROUTES.includes(String(route || ''));
export const routeFor = route => allowsRoute(route) ? route : 'home';
export const excludedAsset = path => /(?:^|\/)(?:coin-prediction|clan-prison-camp|prison-death-game|server-support|support-package|supporter-(?:application|season-pass|screen-guard)|season-pass)(?:[-/.]|$)/i.test(path);
export function blockedRequest(value) {
  try {
    const u = new URL(value,'https://cnine-card.pages.dev');
    if(u.origin !== 'https://cnine-card.pages.dev') return false;
    const path = decodeURIComponent(u.pathname).replace(/\/+/g,'/');
    return /^\/(?:admin(?:\/|$)|api\/(?:admin(?:\/|$)|(?:coin-prediction|prison-camp|prison-death-game|server-support|support-package|supporter-season-pass)(?:\/|$)))/i.test(path) || excludedAsset(path);
  } catch { return true; }
}
export function excludedRecord(row) {
  if(!row || typeof row !== 'object') return false;
  const type = String(row.message_type || row.type || row.kind || row.category || row.code || '');
  if(/(?:SUPPORT(?:ER)?[_ -]|SEASON_PASS|COIN_PREDICTION|PRISON_CAMP|PRISON_DEATH)/i.test(type)) return true;
  const text = [row.title,row.body,row.message,row.description,row.notice].filter(x=>typeof x==='string').join(' ');
  return /후원|시즌\s*패스|49,?800\s*원|코인\s*패키지|패키지\s*(?:구매|신청|지급)|승부\s*예측|포로\s*수용소|데스\s*게임/.test(text);
}
export function filterRecords(data) {
  if(!data || typeof data !== 'object') return data;
  const result = Array.isArray(data) ? data.filter(row=>!excludedRecord(row)).map(filterRecords) : {...data};
  if(!Array.isArray(result)) {
    for(const [key,value] of Object.entries(result)) {
      if(['messages','items','notices','notifications','announcements','history','records','events','operations'].includes(key) && Array.isArray(value)) result[key]=value.filter(row=>!excludedRecord(row)).map(filterRecords);
    }
    if(Array.isArray(result.messages)) {
      result.unread = result.messages.filter(row=>!row.is_read).length;
      result.cleanupCount = result.messages.filter(row=>Number(row.cleanupEligible)===1).length;
    }
  }
  return result;
}
