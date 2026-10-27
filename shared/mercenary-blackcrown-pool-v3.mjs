import {BLACKCROWN_MERCENARIES,BLACKCROWN_SERVER_LIMIT} from './mercenary-blackcrown-catalog-v1.mjs';
import {BLOODMOON_UNLIMITED_CARDS} from './mercenary-bloodmoon-pool-v3.mjs';
import {STOCK_SCHEDULE_MAX_LIMIT} from './mercenary-stock-schedule-v1.mjs';
import {CARDGU_ART} from './mercenary-cardgu-v1.mjs';
import {REVAN_ART} from './mercenary-revan-v1.mjs';
export const BLACKCROWN_SSS_CARDS=Object.freeze([CARDGU_ART,REVAN_ART].map(c=>Object.freeze({
 code:c.code,name:c.name,rank:'SSS',edition:'LIMITED',group:'SSS_LIMITED',stockPolicy:'PACK_ONLY',serverLimit:5,
 sourceArt:c.sourceArt,thumbnailArt:c.thumbnailArt||c.sourceArt,displayArt:c.sourceArt
})));
export function blackcrownSssCodexCard(card){
 const pack=BLACKCROWN_SSS_CARDS.find(c=>c.code===card.code);if(!pack)return card;
 return {...card,releaseStatus:'BATTLE_RELEASED_PACK_PENDING',acquisition:'BLACKCROWN_PACK',
  acquisitionEnabled:false,packAcquisitionEnabled:true,acquisitionPackName:'블랙크라운팩',serverLimit:pack.serverLimit,stockPolicy:'PACK_ONLY',
  combatLinkDescription:card.combatLinkDescription.replace(/현재 (?:일반 )?획득 불가\./,'블랙크라운팩 전용 · 판매 상태와 잔여 수량은 상점에서 확인하세요.')};
}
export const BLACKCROWN_LIMITED_CARDS=Object.freeze([...BLACKCROWN_MERCENARIES,...BLACKCROWN_SSS_CARDS]);
export const BLACKCROWN_UNLIMITED_CARDS=BLOODMOON_UNLIMITED_CARDS;
export const BLACKCROWN_PACK_CARDS=Object.freeze([...BLACKCROWN_LIMITED_CARDS,...BLACKCROWN_UNLIMITED_CARDS]);
export const isBlackcrownLimited=code=>BLACKCROWN_LIMITED_CARDS.some(c=>c.code===code);
export function blackcrownUnlimitedDraw(code){const c=BLACKCROWN_UNLIMITED_CARDS.find(c=>c.code===code);return c?{outcomeId:'CARD_SSS',mercenaryCode:c.code,name:c.name,rank:'SSS',edition:'STANDARD',quantity:1,sourceArt:c.sourceArt}:null;}
export const blackcrownStockLimit=code=>BLACKCROWN_UNLIMITED_CARDS.some(c=>c.code===code)?null:BLACKCROWN_LIMITED_CARDS.find(c=>c.code===code)?.serverLimit??BLACKCROWN_SERVER_LIMIT;
export const isBlackcrownStockLimit=(code,n)=>isBlackcrownLimited(code)&&Number.isSafeInteger(n)&&n>=1&&n<=STOCK_SCHEDULE_MAX_LIMIT;
