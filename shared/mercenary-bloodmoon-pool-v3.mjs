import {BLOODMOON_MERCENARIES,BLOODMOON_SERVER_LIMIT} from './mercenary-bloodmoon-catalog-v1.mjs?v=20261026-stock-schedule-v1';
import {LEONEL_ART} from './mercenary-leonel-v1.mjs';
import {GENERAL_JOK_ART} from './mercenary-general-jok-v1.mjs';
import {EUNSEOL_ART} from './mercenary-eunseol-v1.mjs';
import {RAZAK_ART} from './mercenary-razak-v1.mjs?v=20261026-stock-schedule-v1';
import {PRIME_ART} from './mercenary-prime-requiem-v1.mjs';
import {PRIME_MATERIAL,PRIME_MATERIAL_STOCK_CODE} from './mercenary-prime-material-v1.mjs';
import {STOCK_SCHEDULE_MAX_LIMIT} from './mercenary-stock-schedule-v1.mjs';

// User-authorized pack-only limits, 2026-10-25. Direct gifts stay outside these serials.
export const BLOODMOON_SSS_STOCK_LIMITS=Object.freeze({'V-978':9,'V-974':3,'V-975':3,'V-973':4});
export const BLOODMOON_SSS_CARDS=Object.freeze([LEONEL_ART,GENERAL_JOK_ART,PRIME_ART,EUNSEOL_ART].map(card=>Object.freeze({
 ...card,group:'SSS_LIMITED',stockPolicy:'PACK_ONLY',serverLimit:BLOODMOON_SSS_STOCK_LIMITS[card.code],
 thumbnailArt:'assets/ui/packs/blood-pack-20261023/'+card.code.toLowerCase()+'-320.webp',
 displayArt:'assets/ui/packs/blood-pack-20261023/'+card.code.toLowerCase()+'-640.webp',
 ...(card.code===EUNSEOL_ART.code?{thumbnailArt:card.sourceArt,displayArt:card.sourceArt}:{}),
 ...(card.code===PRIME_MATERIAL_STOCK_CODE?{name:PRIME_MATERIAL.name,rewardType:'ITEM',itemCode:PRIME_MATERIAL.code,sourceArt:PRIME_MATERIAL.image,thumbnailArt:PRIME_MATERIAL.image,displayArt:PRIME_MATERIAL.image}: {})
})));
export const BLOODMOON_LIMITED_CARDS=Object.freeze([...BLOODMOON_MERCENARIES,...BLOODMOON_SSS_CARDS]);
// A dedicated conditional interval, independent of the ordinary SSS weighted pool.
// Unlimited awards never create a stock row or a limited serial.
export const BLOODMOON_UNLIMITED_CARDS=Object.freeze([Object.freeze({...RAZAK_ART,group:'STANDARD_SSS',stockPolicy:'UNLIMITED'})]);
export const BLOODMOON_PACK_CARDS=Object.freeze([...BLOODMOON_LIMITED_CARDS,...BLOODMOON_UNLIMITED_CARDS]);
export const isBloodmoonLimited=code=>BLOODMOON_LIMITED_CARDS.some(c=>c.code===code);
export function bloodmoonUnlimitedDraw(code){
 const card=BLOODMOON_UNLIMITED_CARDS.find(c=>c.code===code);
 return card?{outcomeId:'CARD_SSS',mercenaryCode:card.code,name:card.name,rank:'SSS',edition:'STANDARD',quantity:1,sourceArt:card.sourceArt}:null;
}
export const bloodmoonStockLimit=code=>BLOODMOON_UNLIMITED_CARDS.some(c=>c.code===code)?null:BLOODMOON_SSS_CARDS.some(c=>c.code===code)?BLOODMOON_SSS_STOCK_LIMITS[code]:BLOODMOON_MERCENARIES.find(c=>c.code===code)?.serverLimit??BLOODMOON_SERVER_LIMIT;
// Stock limits are authoritative per character, never copied or reset by the pack.
export function isBloodmoonStockLimit(code,limit){
 return isBloodmoonLimited(code)&&Number.isSafeInteger(limit)&&limit>=1&&limit<=STOCK_SCHEDULE_MAX_LIMIT;
}
