import {BLOODMOON_MERCENARIES,BLOODMOON_SERVER_LIMIT} from './mercenary-bloodmoon-catalog-v1.mjs';
import {LEONEL_ART} from './mercenary-leonel-v1.mjs';
import {GENERAL_JOK_ART} from './mercenary-general-jok-v1.mjs';
import {PRIME_ART} from './mercenary-prime-requiem-v1.mjs';

// User-selected Blood Pack roster. These SSS public stock limits are unspecified.
// Existing direct gifts are preserved; opening preparation never creates stock.
export const BLOODMOON_SSS_CARDS=Object.freeze([LEONEL_ART,GENERAL_JOK_ART,PRIME_ART].map(card=>Object.freeze({
 ...card,group:'SSS_LIMITED',stockPolicy:'PACK_ONLY',serverLimit:null,
 thumbnailArt:'assets/ui/packs/blood-pack-20261023/'+card.code.toLowerCase()+'-320.webp',
 displayArt:'assets/ui/packs/blood-pack-20261023/'+card.code.toLowerCase()+'-640.webp'
})));
export const BLOODMOON_PACK_CARDS=Object.freeze([...BLOODMOON_MERCENARIES,...BLOODMOON_SSS_CARDS]);
export const bloodmoonStockLimit=code=>BLOODMOON_SSS_CARDS.some(c=>c.code===code)?null:BLOODMOON_MERCENARIES.find(c=>c.code===code)?.serverLimit??BLOODMOON_SERVER_LIMIT;
// Stock limits are authoritative per character, never copied or reset by the pack.
export function isBloodmoonStockLimit(code,limit){
 return BLOODMOON_PACK_CARDS.some(card=>card.code===code)&&limit===bloodmoonStockLimit(code);
}
