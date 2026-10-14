// Notifications contain versions only. Existing authenticated APIs own all data.
export const ACCOUNT_SYNC_VERSION='20261015-v1';
export const ACCOUNT_SYNC_DOMAINS=Object.freeze(['wallet','collection','inventory','loadout','pvp','messages']);
export const ACCOUNT_SYNC_POLL_MS=5000;
export const ACCOUNT_SYNC_LEASE_MS=60000;
export function syncRevision(value){const text=String(value??'0');return /^(0|[1-9][0-9]{0,18})$/.test(text)?text:'0';}
export function normalizeAccountSync(value={}){
 const domains=typeof value.domains==='string'?JSON.parse(value.domains):value.domains||{};
 return {revision:syncRevision(value.revision),domains:Object.fromEntries(ACCOUNT_SYNC_DOMAINS.map(k=>[k,syncRevision(domains[k])]))};
}
export function changedAccountDomains(before,after){
 const next=normalizeAccountSync(after);if(!before)return [...ACCOUNT_SYNC_DOMAINS];
 const old=normalizeAccountSync(before);if(BigInt(next.revision)<=BigInt(old.revision))return [];
 return ACCOUNT_SYNC_DOMAINS.filter(k=>BigInt(next.domains[k])>BigInt(old.domains[k]));
}
export function accountSyncBackoff(attempt,random=Math.random){return Math.round(Math.min(30000,750*2**Math.min(6,Math.max(0,attempt)))*(0.8+random()*0.4));}
