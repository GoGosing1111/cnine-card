import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {mercenaryAccountState,mercenaryFormationOptions} from '../functions/_mercenary_account.js';
import {mercenaryFixture} from './helpers/mercenary-db.mjs';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {SAINT_CODE} from '../shared/mercenary-lightning-saint-v1.mjs';

const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const battleRoute=source.slice(source.indexOf("if(path==='battle/config'){"),source.indexOf("if(path==='battle/deck'&&request.method==='POST')"));
test('energy refresh authenticates and never reads the roster, gear or monsters; the full view retains them',async()=>{
  const reads=[],settings={enabled:true},energy={energy:3},apocalypseEnergy={energy:2},rules={deckSize:5};
  const ctx={URL,Date,console,path:'battle/config',env:{},json:(data,status=200)=>({data,status}),
    authenticate:async()=>({id:7}),burningEventSettings:async()=>({}),battleSettings:async()=>settings,
    maintenanceSettings:async()=>({}),applyBurningPveSettings:s=>s,battleEnergyState:async()=>energy,
    apocalypseEnergyState:async()=>apocalypseEnergy,deckRulesContract:()=>rules,
    cachedRuntimeSetting:async()=>{reads.push('monsters');return {results:[]};},
    pveDeckCards:async()=>{reads.push('deck');return ['1'];},userEquipmentBonuses:async()=>{reads.push('gear');return {pve:100};},
    burningPublicState:()=>({}),pveBattleEngineState:()=>({active:true})};
  const read=vm.runInNewContext('(async function(request){'+battleRoute+'})',ctx);
  const short=await read({url:'https://game.test/api/battle/config?view=energy'});
  assert.equal(short.status,200);assert.equal(short.data.energy,energy);assert.equal(short.data.apocalypseEnergy,apocalypseEnergy);
  assert.deepEqual(Object.keys(short.data).sort(),['apocalypseEnergy','deckRules','energy','serverNow']);
  assert.deepEqual(reads,[]);
  const full=await read({url:'https://game.test/api/battle/config'});
  assert.equal(full.data.settings,settings);assert.equal(full.data.energy,short.data.energy);assert.equal(full.data.deckRules,rules);
  assert.equal(full.data.characterBonus.pve,100);assert.deepEqual(full.data.deck,['1']);assert.deepEqual(reads.sort(),['deck','gear','monsters']);
  ctx.authenticate=async()=>null;
  assert.equal((await read({url:'https://game.test/api/battle/config?view=energy'})).status,401);
});

for(const postgres of [false,true]){
  test((postgres?'PostgreSQL':'SQLite')+' party picker returns identical owned, special and loan selections without reading wallet or equipment',async t=>{
    const f=await mercenaryFixture(t,{postgres});
    for(const mercenaryCode of ['V-050','V-002'])await f.DB.batch(mercenaryCardAcquisitionStatements(f.DB,{userId:7,mercenaryCode,acquisitionId:crypto.randomUUID()}));
    await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',SAINT_CODE).run();
    await f.p('INSERT INTO app_meta(key,value) VALUES(?,?)','comeback26:loan:7','2099-01-01 00:00:00').run();
    const {cards}=await mercenaryAccountState(f.env,f.user);
    const expected=cards.filter(m=>m.canDeploy).map(m=>({id:m.code,name:m.name,rank:m.rank,level:m.level,image:m.sourceArt}));
    assert.ok(expected.some(m=>m.id===SAINT_CODE));assert.ok(expected.some(m=>m.id==='V-977'));
    const queries=[],db=Object.create(f.DB);
    db.prepare=sql=>{queries.push(sql);return f.DB.prepare(sql);};
    const options=await mercenaryFormationOptions({...f.env,DB:db},f.user);
    assert.deepEqual(options,expected);
    assert.ok(!queries.some(sql=>/SELECT coin FROM users|user_equipment_instances|user_mercenary_growth_v1/i.test(sql)));
    assert.deepEqual(await mercenaryFormationOptions({...f.env,DB:db},{id:218}),[]);
  });
}
