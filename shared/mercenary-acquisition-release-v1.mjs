import {HEUKMU_CODE} from './mercenary-heukmu-v1.mjs';
import {KAMISHIRO_CODE} from './mercenary-kamishiro-v1.mjs';
import {CARDGU_CODE} from './mercenary-cardgu-v1.mjs';
import {REVAN_CODE} from './mercenary-revan-v1.mjs';
import {AWAKENED_OMEGA_CODE} from './mercenary-awakened-omega-v1.mjs';
import {RAZAK_CODE} from './mercenary-razak-v1.mjs';
import {EUNSEOL_CODE} from './mercenary-eunseol-v1.mjs';
import {GENERAL_JOK_CODE} from './mercenary-general-jok-v1.mjs';
import {PRIME_CODE} from './mercenary-prime-requiem-v1.mjs';
import {ZERO_CODE} from './mercenary-zero-v1.mjs';
import {LEONEL_CODE} from './mercenary-leonel-v1.mjs';
import {JOKRO_CODE} from './mercenary-jokro-v1.mjs';
import {SHIRANUI_CODE} from './mercenary-shiranui-v1.mjs';
// CMS weight zero is the single acquisition OFF setting. Missing weights keep
// their existing registration defaults; ownership and combat are independent.
import {isLimitedMercenary} from './mercenary-limited-catalog-v1.mjs';
import {KAIRON_CODE} from './mercenary-kairon-v1.mjs';
export const mercenaryAcquisitionEnabled=(code,rules)=>code!==HEUKMU_CODE&&code!==KAMISHIRO_CODE&&code!==CARDGU_CODE&&code!==AWAKENED_OMEGA_CODE&&code!==RAZAK_CODE&&code!==REVAN_CODE&&code!==EUNSEOL_CODE&&code!==GENERAL_JOK_CODE&&code!==PRIME_CODE&&code!==ZERO_CODE&&code!==LEONEL_CODE&&code!==JOKRO_CODE&&code!==SHIRANUI_CODE&&code!==KAIRON_CODE&&!isLimitedMercenary(code)&&rules?.cardWeights?.[code]!==0;
export function assertMercenaryAcquisitionEnabled(code,rules){
 if(!mercenaryAcquisitionEnabled(code,rules))throw Object.assign(Error('현재 획득이 중지된 용병입니다.'),{code:'MERCENARY_ACQUISITION_DISABLED',status:409,terminal:true});
}
