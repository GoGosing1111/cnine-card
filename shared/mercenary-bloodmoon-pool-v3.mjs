import {BLOODMOON_MERCENARIES,BLOODMOON_SERVER_LIMIT} from './mercenary-bloodmoon-catalog-v1.mjs?v=20261025-opening-v1';
import {LEONEL_ART} from './mercenary-leonel-v1.mjs';
import {GENERAL_JOK_ART} from './mercenary-general-jok-v1.mjs';
import {PRIME_ART} from './mercenary-prime-requiem-v1.mjs';
import {PRIME_MATERIAL,PRIME_MATERIAL_STOCK_CODE} from './mercenary-prime-material-v1.mjs';

// User-authorized pack-only limits, 2026-10-25. Direct gifts stay outside these serials.
export const BLOODMOON_SSS_STOCK_LIMITS=Object.freeze({'V-978':5,'V-974':3,'V-975':3});
export const BLOODMOON_SSS_CARDS=Object.freeze([LEONEL_ART,GENERAL_JOK_ART,PRIME_ART].map(card=>Object.freeze({
 ...card,group:'SSS_LIMITED',stockPolicy:'PACK_ONLY',serverLimit:BLOODMOON_SSS_STOCK_LIMITS[card.code],
 thumbnailArt:'assets/ui/packs/blood-pack-20261023/'+card.code.toLowerCase()+'-320.webp',
 displayArt:'assets/ui/packs/blood-pack-20261023/'+card.code.toLowerCase()+'-640.webp',
 ...(card.code===PRIME_MATERIAL_STOCK_CODE?{name:PRIME_MATERIAL.name,rewardType:'ITEM',itemCode:PRIME_MATERIAL.code,sourceArt:PRIME_MATERIAL.image,thumbnailArt:PRIME_MATERIAL.image,displayArt:PRIME_MATERIAL.image}: {})
})));
export const BLOODMOON_PACK_CARDS=Object.freeze([...BLOODMOON_MERCENARIES,...BLOODMOON_SSS_CARDS]);
export const bloodmoonStockLimit=code=>BLOODMOON_SSS_CARDS.some(c=>c.code===code)?BLOODMOON_SSS_STOCK_LIMITS[code]:BLOODMOON_MERCENARIES.find(c=>c.code===code)?.serverLimit??BLOODMOON_SERVER_LIMIT;
// Stock limits are authoritative per character, never copied or reset by the pack.
export function isBloodmoonStockLimit(code,limit){
 return BLOODMOON_PACK_CARDS.some(card=>card.code===code)&&limit===bloodmoonStockLimit(code);
}
