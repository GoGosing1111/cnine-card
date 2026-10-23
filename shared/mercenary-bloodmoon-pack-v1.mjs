import {BLOODMOON_CODES,BLOODMOON_SERVER_LIMIT} from './mercenary-bloodmoon-catalog-v1.mjs';
export const BLOODMOON_PACK_KEY='mercenary_bloodmoon_ss_pack_v1';
export const BLOODMOON_PACK=Object.freeze({id:'mercenary-bloodmoon-ss-limited',name:'블러드문 SS 리미티드 팩',featurePath:'mercenaries/v3/bloodmoon-pack/feature',openPath:'mercenaries/v3/bloodmoon-pack/open'});
// Codex publication does not enable a purchase, issue or free opening path.
export const BLOODMOON_PACK_RELEASE_ENABLED=false;
export const bloodmoonPackDraft=()=>({version:1,mode:'OFF',prices:{single:null,ten:null},cardRatesPpm:Object.fromEntries(BLOODMOON_CODES.map(code=>[code,null])),stockLimits:Object.fromEntries(BLOODMOON_CODES.map(code=>[code,BLOODMOON_SERVER_LIMIT])),missRatePpm:null});
