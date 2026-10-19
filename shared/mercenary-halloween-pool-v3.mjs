import {HALLOWEEN_MERCENARIES,HALLOWEEN_SERVER_LIMIT} from './mercenary-halloween-catalog-v1.mjs';
import {LIMITED_MERCENARIES} from './mercenary-limited-catalog-v1.mjs';
import {JINMU_ART,JINMU_CODE} from './mercenary-jinmu-v1.mjs';

// Pack membership is separate from the seven approved seasonal illustrations
// and from the old limited pack. No stock is reset or duplicated here.
export const HALLOWEEN_SSS_CARDS=Object.freeze([
 Object.freeze({...LIMITED_MERCENARIES.find(c=>c.code==='V-999'),group:'SSS_LIMITED',stockPolicy:'EXISTING_SHARED',serverLimit:null,thumbnailArt:'assets/ui/packs/limited-v1/v-999-640.webp',displayArt:'assets/ui/packs/limited-v1/v-999-640.webp'}),
 Object.freeze({...JINMU_ART,group:'SSS_LIMITED',stockPolicy:'PACK_ONLY',serverLimit:3,exclusiveGrant:false,excludedFromLimitedCount:false,thumbnailArt:JINMU_ART.sourceArt,displayArt:JINMU_ART.sourceArt}),
 Object.freeze({...LIMITED_MERCENARIES.find(c=>c.code==='V-996'),group:'SSS_LIMITED',stockPolicy:'EXISTING_SHARED',serverLimit:null,thumbnailArt:'assets/ui/packs/limited-v1/v-996-640.webp',displayArt:'assets/ui/packs/limited-v1/v-996-640.webp'})
]);
export const HALLOWEEN_PACK_CARDS=Object.freeze([...HALLOWEEN_MERCENARIES,...HALLOWEEN_SSS_CARDS]);
export const halloweenStockLimit=code=>['V-999','V-996'].includes(code)?null:code===JINMU_CODE?3:HALLOWEEN_MERCENARIES.find(c=>c.code===code)?.serverLimit??HALLOWEEN_SERVER_LIMIT;
