import test from 'node:test';
import assert from 'node:assert/strict';
import {forgeFixture} from './helpers/forge-db.mjs';
import {readForgePreparationInventory} from '../functions/_equipment_forge_preparation.js';
import {polishDisplay,polishDetailsHtml} from '../shared/equipment-polish-display-v1.mjs';

for(const postgres of [false,true])test(`${postgres?'PostgreSQL':'SQLite'}: identical gear keeps polish on the exact owned instance, including direct focus and pagination`,async t=>{
 const f=await forgeFixture(t,{postgres}),id=f.instanceId;
 await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(72,7,1,'copy'),(81,8,1,'foreign')").run();
 const polish={schemaVersion:1,userId:7,instanceId:id,attempts:3,rolls:29,levels:[1,0,2,0,0],values:[6,0,18,0,0]};
 await f.setting('equipment_polish_instance_v1:7:'+id,polish);
 await f.setting('equipment_polish_instance_v1:8:72',{...polish,userId:8,instanceId:'72',values:[60,0,180,0,0]});
 const read=options=>readForgePreparationInventory(f.DB,7,{includeEnhancement:true,...options});
 const list=await read({}),grown=list.items.find(i=>i.instanceId===id),plain=list.items.find(i=>i.instanceId==='72');
 assert.deepEqual(grown.polish,polish);assert.equal(plain.polish.attempts,0);assert(list.items.every(i=>i.instanceId!=='81'));
 assert.deepEqual((await read({focusId:id})).items[0].polish,polish);assert.deepEqual((await read({focusId:'81'})).items,[]);
 const page=await read({limit:1}),next=await read({limit:1,beforeId:page.nextCursor});assert.equal(next.items[0].instanceId,id);assert.deepEqual(next.items[0].polish,polish);
 assert.match(polishDisplay(grown).text,/성공 3회.*시도 29회.*공격력 \+6%.*치명타 피해 \+18%p/);
 assert.equal(polishDisplay(plain).label,'미연마');
 const detail=polishDetailsHtml(grown,{mercenary:true});assert.match(detail,/PvE · PvP/);assert.match(detail,/data-icon="critical-damage"/);assert.doesNotMatch(detail,/PVE 전용/);
 await f.setting('equipment_polish_instance_v1:7:'+id,{...polish,userId:8});await assert.rejects(read({focusId:id}),{code:'POLISH_STATE_UNAVAILABLE'});
});
test('zero successes after misses is distinct from untouched gear and missing state',()=>{
 const item={polish:{attempts:0,rolls:12,levels:[0,0,0,0,0],values:[0,0,0,0,0]}};
 assert.equal(polishDisplay(item).label,'연마 성공 0회');assert.match(polishDisplay(item).text,/총 시도 12회/);
 assert.equal(polishDisplay({}).label,'연마 정보 없음');
});
