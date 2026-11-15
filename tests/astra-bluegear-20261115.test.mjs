import test from 'node:test';import assert from 'node:assert/strict';
import {ASTRA_ART,ASTRA_CODE,ASTRA_COMBAT,ASTRA_SKILLS,ASTRA_EVENT,astraDeploymentSnapshot,isAstra} from '../shared/mercenary-astra-v1.mjs';
import {RAZAK_ART,RAZAK_SKILLS} from '../shared/mercenary-razak-v1.mjs';
import {blueGearRegistration,blueGearAstraDocument,blueGearState,BLUE_GEAR_PACK_KEY,BLUE_GEAR_STOCK_PREFIX,BLUE_GEAR_DRAW_POLICY} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {createBlueGearPackService} from '../functions/_mercenary_blue_gear_pack.js';import {limitedFixture} from './helpers/limited-pack-fixture.mjs';
import {blackcrownUnlimitedDraw} from '../shared/mercenary-blackcrown-pool-v3.mjs';
import {buildFighter,createPvpBattleV2,createPveBattleV2} from '../functions/_battle_v2_preview.js';
import {buildMercenaryFighter,mercenaryBaseActionCredit,mercenarySkillCapActions} from '../functions/_mercenary_combat.js';
import {snapshot,scenarios} from '../scripts/measure-razak-balance-20261026.mjs';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {mercenaryAcquisitionEnabled} from '../shared/mercenary-acquisition-release-v1.mjs';
import {mercenarySnapshotPower,battleConfig} from '../functions/_mercenary_account.js';
const source={revision:14,settings:{prices:{single:1500000000,ten:15000000000},missRatePpm:800000,normalRankRatesPpm:{C:104500,B:30000,A:30000,S:30000,SS:4700,SSS:800},cardRatesPpm:{'V-975':1,'V-058':400}}},black={revision:11,settings:{cardRatesPpm:Object.fromEntries(Array.from({length:6},(_,i)=>['V-'+(950+i),5000]))}};
const doc=()=>blueGearRegistration(source,black),astra=(level=1,mode='PVP',gear=0)=>({...snapshot('V-058',level,mode,gear),...astraDeploymentSnapshot()});
test('Astra is standard SSS 1.25m, exclusive Blue Gear, three trusted skills; Razak remains a separate identity',()=>{
 assert.equal(ASTRA_CODE,'V-059');assert.equal(ASTRA_ART.basePower,1250000);assert.equal(ASTRA_ART.edition,'STANDARD');assert.equal(ASTRA_SKILLS.length,3);assert.equal(ASTRA_SKILLS.filter(s=>s.pveOnly).length,1);
 assert.equal(limitedDeploymentSnapshot(ASTRA_CODE).name,'아스트라');assert.equal(battleConfig({},ASTRA_CODE,1).basePower,1250000);assert.equal(mercenarySnapshotPower(astra()),1250000);assert.equal(mercenaryAcquisitionEnabled(ASTRA_CODE,{cardWeights:{[ASTRA_CODE]:1}}),false);
 assert.equal(RAZAK_ART.code,'V-058');assert.equal(RAZAK_ART.basePower,1000000);assert.equal(blackcrownUnlimitedDraw(ASTRA_CODE),null);assert.equal(blackcrownUnlimitedDraw('V-058').name,'라자크');assert.equal(isAstra({code:ASTRA_CODE}),false);
});
test('legacy pack odds move one identity only, retain the exact probability, price, schedule and stock',()=>{
 const next=doc(),legacy=structuredClone(next);legacy.settings.cardRatesPpm['V-058']=legacy.settings.cardRatesPpm[ASTRA_CODE];delete legacy.settings.cardRatesPpm[ASTRA_CODE];
 assert.deepEqual(blueGearAstraDocument(legacy),next);assert.equal(blueGearAstraDocument(next),next);assert.equal(next.settings.cardRatesPpm[ASTRA_CODE],400);assert.equal(next.settings.cardRatesPpm['V-058'],undefined);assert.equal(next.settings.normalSssRatePpm,997098);assert.equal(next.settings.stockLimits[ASTRA_CODE],undefined);
 const stocks=Object.entries(next.settings.stockLimits).map(([code,stock_limit])=>({code:BLUE_GEAR_STOCK_PREFIX+code,stock_limit,issued:0}));const state=blueGearState(legacy,stocks,[],'2026-11-20T00:00:00Z');assert.equal(state.effectiveCardPercents[ASTRA_CODE],'0.000032');assert.equal(state.previewCards.length,8);assert.equal(BLUE_GEAR_DRAW_POLICY.pool.some(c=>c.code==='V-058'),false);
});
test('canonical combat ignores forged power, keeps SSS growth/gear and permits only two PVP skills',()=>{
 for(const level of [1,11,21])for(const mode of ['PVE','PVP']){
  const m=buildMercenaryFighter({...astra(level,mode,1000000),basePower:999,rank:'C',stats:{hp:1},skills:[],controlImmune:true},'A',mode,buildFighter);
  assert.equal(m.basePower,2250000);assert.equal(m.rank,'SSS');assert.equal(m.controlImmune,false);assert.equal(m.skills.length,mode==='PVE'?3:2);assert.equal(mercenaryBaseActionCredit([m]),4);
  const razak=buildMercenaryFighter(snapshot('V-058',level,mode,1000000),'A',mode,buildFighter);
  assert.equal(mercenarySkillCapActions(m,ASTRA_SKILLS[0],false)/mercenarySkillCapActions(razak,RAZAK_SKILLS[0],false),mode==='PVP'?1.25:1);
 }
});
test('unlimited Astra award works for single, ten and budget bulk; retry never doubles debit or ownership',async t=>{
 const f=await limitedFixture(t),config=doc();config.openingAt='2000-11-19T15:00:00Z';await f.configure({enabled:false});await f.setting(BLUE_GEAR_PACK_KEY,config);await f.pg.exec('UPDATE users SET coin=3000000000000 WHERE id=1');
 for(const [code,n]of Object.entries(config.settings.stockLimits))await f.p('INSERT INTO mercenary_limited_stock_v1(code,stock_limit) VALUES(?,?)',BLUE_GEAR_STOCK_PREFIX+code,n).run();
 let stage=0;const svc=createBlueGearPackService({randomInt:n=>{assert.equal(n,10000000000);return stage++%2===0?1992000000:25020000;}}),initial=await f.coin();
 const body={requestId:crypto.randomUUID(),expectedRevision:1,count:1},one=await svc.open(f.env,f.user,body);assert.equal(one.draws[0].mercenaryCode,ASTRA_CODE);assert.equal(one.draws[0].edition,'STANDARD');assert.equal(one.draws[0].serial,undefined);
 const retry=await svc.open(f.env,f.user,body);assert.equal(retry.replayed,true);assert.equal(await f.coin(),initial-2250000000);
 const ten=await svc.open(f.env,f.user,{...body,requestId:crypto.randomUUID(),count:10});assert.ok(ten.draws.every(x=>x.mercenaryCode===ASTRA_CODE));
 const bulk=await svc.open(f.env,f.user,{...body,requestId:crypto.randomUUID(),count:10,budget:'22500000000'});assert.equal(bulk.normalDraws.find(x=>x.mercenaryCode===ASTRA_CODE).quantity,10);
 const owned=await f.p('SELECT total_copies FROM user_mercenary_cards_v1 WHERE user_id=1 AND mercenary_code=?',ASTRA_CODE).first();assert.equal(Number(owned.total_copies),21);assert.equal(await f.coin(),initial-21*2250000000);
 assert.equal(Number((await f.p('SELECT COUNT(*) AS n FROM mercenary_limited_issues_v1').first()).n),0);await assert.rejects(svc.receipt(f.env,{id:2},body.requestId));
});
test('Astra beats Razak at equal levels/equipment on swapped sides; PVE uses all three authoritative skills',()=>{
 const selected=scenarios.filter(s=>['basic-20000000-balanced','growth-11','growth-21','equipped-21'].includes(s.id));let wins=0,total=0,casts=0;
 for(const f of selected)for(let seed=1;seed<=10;seed++)for(const side of ['A','B']){const a=astra(f.level,'PVP',f.gear),r=snapshot('V-058',f.level,'PVP',f.gear),b=createPvpBattleV2({attackerCards:f.cards,defenderCards:f.cards,attackerMagicCards:f.magic,defenderMagicCards:f.magic,attackerMercenary:side==='A'?a:r,defenderMercenary:side==='A'?r:a,seed:seed*7919});wins+=b.result.winner===side;total++;casts+=b.result.timeline.filter(e=>e.type===ASTRA_EVENT).length;assert.ok(!b.result.timeline.some(e=>e.type===ASTRA_EVENT&&e.skillId==='MS-1103'));}
 assert.ok(wins/total>.6,'upper Razak '+wins+'/'+total);assert.ok(casts>0);
 const f=selected[0],b=createPveBattleV2({cards:f.cards,mercenary:astra(21,'PVE',1000000),monster:{id:1,name:'QA',battle_power:1e13},seed:71159});const seen=new Set(b.result.timeline.filter(e=>e.type===ASTRA_EVENT).map(e=>e.skillId));assert.deepEqual([...seen].sort(),ASTRA_SKILLS.map(x=>x.id));
});
