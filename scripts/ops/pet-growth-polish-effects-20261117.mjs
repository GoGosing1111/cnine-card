import assert from 'node:assert/strict';
import {decodePolishState} from '../../functions/_equipment_growth.js';
import {validatePolishSettings} from '../../shared/equipment-polish-v1.mjs';

export const OPERATION_KEY='ops:pet-growth-polish:effects-buff:20261117:v1';
export const PREVIOUS_INCREMENTS=Object.freeze([2,.5,3,2,.5]);
export const POLISH_INCREMENTS=Object.freeze([6,1.5,9,6,1.5]);
export const POLISH_NOTICE='연마 효과 3배 상향 · 성공 1회당 공격력·보스 피해 +6%, 치명타 확률·방어 관통 +1.5%p, 치명타 피해 +9%p. 기존 연마에도 적용됩니다. 성공률 10% · 장비당 성공 50회 / 옵션별 20단계 · 1회 10조 코인·마스터의 별 3천만·연마석 1개 (꽝 포함).';
export function buffPolishSettings(current){
 assert.deepEqual(current.options.map(o=>o.increment),PREVIOUS_INCREMENTS,'Unexpected live polish policy');
 return validatePolishSettings({...current,notice:POLISH_NOTICE,options:current.options.map((o,i)=>({...o,increment:POLISH_INCREMENTS[i]}))});
}
export function rebasePolishRecord(row){
 const [,uid,id]=row.key.split(':');
 const current=decodePolishState(row.value,id,uid),saved=JSON.parse(row.value);
 assert.deepEqual(current.values,current.levels.map((n,i)=>Math.round(n*PREVIOUS_INCREMENTS[i]*100)/100),'Unexpected historical polish values: '+row.key);
 return {...saved,values:current.levels.map((n,i)=>Math.round(n*POLISH_INCREMENTS[i]*100)/100)};
}
