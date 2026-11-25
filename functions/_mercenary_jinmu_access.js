import {JINMU_CODE,JINMU_OWNER_ID} from '../shared/mercenary-jinmu-v1.mjs';
import {readLimitedShardCraftOwners} from './_mercenary_craft_access.js';
import {readIssuedMercenaryOwners} from './_mercenary_pack_issuance.js';
import {readAuctionMercenaryOwners} from './_auction_user_access.js';

// The original exclusive grant stays valid. Other accounts require a real,
// completed Halloween pack or SSS cube issuance; a stray holding or recalled grant is not
// an entitlement. This is read-only and never grants or restores a card.
export async function readJinmuPackOwners(env,userIds){
 const ids=[...new Set(userIds.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0&&id!==JINMU_OWNER_ID);
 if(!ids.length)return new Set();
 const owners=await readIssuedMercenaryOwners(env,JINMU_CODE,ids);
 for(const id of await readLimitedShardCraftOwners(env,JINMU_CODE,ids.filter(id=>!owners.has(id))))owners.add(id);
 for(const id of await readAuctionMercenaryOwners(env,JINMU_CODE,ids.filter(id=>!owners.has(id))))owners.add(id);
 return owners;
}
