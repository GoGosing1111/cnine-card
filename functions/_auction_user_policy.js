import {AUCTION_USER_POLICY_KEY,AUCTION_USER_DRAFT,AUCTION_ASSET_TYPES} from '../shared/auction-user-policy-v1.mjs';
import {saveJointPolicyDraft} from './_joint_transactions.js';
import {jointError} from './_joint_request.js';
export const AUCTION_LIVE_DEFAULT=Object.freeze({...AUCTION_USER_DRAFT,revision:0,operatorEnabled:false,blockedAssets:[]});
export function validateAuctionPolicy(value){
 if(!value||typeof value.enabled!=='boolean'||typeof value.operatorEnabled!=='boolean'||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.blockedAssets)||value.blockedAssets.length>5000)throw jointError('AUCTION_POLICY','경매 설정과 수정 버전을 확인하세요.');
 const keys=new Set(),blockedAssets=value.blockedAssets.map(x=>{
  if(!AUCTION_ASSET_TYPES[x?.kind]||typeof x.ref!=='string'||!x.ref||x.ref.length>100||/[\u0000-\u001f]/.test(x.ref))throw jointError('AUCTION_POLICY','금지 품목 코드를 확인하세요.');
  const key=x.kind+':'+x.ref;if(keys.has(key))throw jointError('AUCTION_POLICY','중복된 금지 품목입니다.');keys.add(key);return {kind:x.kind,ref:x.ref};
 }).sort((a,b)=>(a.kind+':'+a.ref).localeCompare(b.kind+':'+b.ref));
 return {...AUCTION_LIVE_DEFAULT,revision:value.revision,enabled:value.enabled,operatorEnabled:value.operatorEnabled,blockedAssets};
}
export async function readAuctionPolicy(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(AUCTION_USER_POLICY_KEY).first();
 return {raw:row?.value??null,policy:row?{...AUCTION_LIVE_DEFAULT,...JSON.parse(row.value)}:structuredClone(AUCTION_LIVE_DEFAULT)};
}
export const auctionAssetBlocked=(policy,asset)=>policy.blockedAssets?.some(x=>x.kind===asset.kind&&x.ref===String(asset.policyRef??asset.ref))===true;
export async function saveAuctionPolicy(env,user,body){
 if(user.role!=='OWNER')throw jointError('AUCTION_PERMISSION','운영자만 경매 설정을 저장할 수 있습니다.',403);
 const current=await readAuctionPolicy(env),next=validateAuctionPolicy(body);
 if(next.revision!==Number(current.policy.revision))throw jointError('AUCTION_CONFLICT','다른 창에서 설정을 변경했습니다. 최신 설정을 불러오세요.',409);
 next.revision++;return saveJointPolicyDraft(env,user,AUCTION_USER_POLICY_KEY,current.raw,next);
}
