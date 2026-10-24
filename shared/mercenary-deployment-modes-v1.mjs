import {EUNSEOL_CODE} from './mercenary-eunseol-v1.mjs';

export const MERCENARY_DEPLOYMENT_MODE_VERSION='20261024-eunseol-pve-only';
export const PVE_ONLY_MERCENARY_CODES=Object.freeze([EUNSEOL_CODE]);
export const mercenaryModeAllowed=(code,mode)=>!PVE_ONLY_MERCENARY_CODES.includes(code)||mode==='PVE';
export const MERCENARY_PVE_ONLY_REASON='은설은 PVE 전용 용병입니다. PVP에는 편성할 수 없습니다.';
