import {limitedFixture} from './limited-pack-fixture.mjs';
import {BLUE_GEAR_PACK_KEY,BLUE_GEAR_STOCK_PREFIX} from '../../shared/mercenary-blue-gear-pack-v1.mjs';
import {createBlueGearPackService,readBlueGearPackState} from '../../functions/_mercenary_blue_gear_pack.js';
export const bluegearBulkDocument={revision:4,openingAt:'2026-11-19T15:00:00.000Z',settings:{prices:{single:2250000000,ten:22500000000},missRatePpm:800000,normalRankRatesPpm:{C:104500,B:30000,A:30000,S:30000,SS:4700,SSS:800},cardRatesPpm:{'V-701':70.3125,'V-702':70.3125,'V-703':70.3125,'V-704':70.3125,'V-705':70.3125,'V-976':1,'V-967':1,'V-059':400},normalSssRatePpm:999246.4375,stockLimits:{'V-701':25,'V-702':25,'V-703':25,'V-704':25,'V-705':25,'V-976':3,'V-967':3}}};
export async function bluegearBulkFixture(t,options={}){
 const f=await limitedFixture(t);await f.configure({enabled:false});await f.setting(BLUE_GEAR_PACK_KEY,bluegearBulkDocument);
 for(const [code,n]of Object.entries(bluegearBulkDocument.settings.stockLimits))await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',BLUE_GEAR_STOCK_PREFIX+code,n).run();
 await f.pg.exec('UPDATE users SET coin=3000000000000000 WHERE id IN (1,2)');
 return {...f,service:createBlueGearPackService(options),state:()=>readBlueGearPackState(f.env,{userId:1})};
}
