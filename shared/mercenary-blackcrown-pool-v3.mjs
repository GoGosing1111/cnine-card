import {BLACKCROWN_MERCENARIES,BLACKCROWN_SERVER_LIMIT} from './mercenary-blackcrown-catalog-v1.mjs';
import {BLOODMOON_SSS_CARDS,BLOODMOON_UNLIMITED_CARDS} from './mercenary-bloodmoon-pool-v3.mjs';
import {STOCK_SCHEDULE_MAX_LIMIT} from './mercenary-stock-schedule-v1.mjs';
export const BLACKCROWN_SSS_CARDS=Object.freeze(BLOODMOON_SSS_CARDS.map(c=>Object.freeze({...c,stockPolicy:'EXISTING_SHARED'})));
export const BLACKCROWN_LIMITED_CARDS=Object.freeze([...BLACKCROWN_MERCENARIES,...BLACKCROWN_SSS_CARDS]);
export const BLACKCROWN_UNLIMITED_CARDS=BLOODMOON_UNLIMITED_CARDS;
export const BLACKCROWN_PACK_CARDS=Object.freeze([...BLACKCROWN_LIMITED_CARDS,...BLACKCROWN_UNLIMITED_CARDS]);
export const isBlackcrownLimited=code=>BLACKCROWN_LIMITED_CARDS.some(c=>c.code===code);
export function blackcrownUnlimitedDraw(code){const c=BLACKCROWN_UNLIMITED_CARDS.find(c=>c.code===code);return c?{outcomeId:'CARD_SSS',mercenaryCode:c.code,name:c.name,rank:'SSS',edition:'STANDARD',quantity:1,sourceArt:c.sourceArt}:null;}
export const blackcrownStockLimit=code=>BLACKCROWN_UNLIMITED_CARDS.some(c=>c.code===code)?null:BLACKCROWN_LIMITED_CARDS.find(c=>c.code===code)?.serverLimit??BLACKCROWN_SERVER_LIMIT;
export const isBlackcrownStockLimit=(code,n)=>isBlackcrownLimited(code)&&Number.isSafeInteger(n)&&n>=1&&n<=STOCK_SCHEDULE_MAX_LIMIT;
