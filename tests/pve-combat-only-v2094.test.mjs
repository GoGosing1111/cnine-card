import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {jointFixture} from './helpers/joint-db.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {buildTowerV3Battle,TOWER_V3_DRAFT} from '../functions/_tower_v3.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const request=(path,body)=>new Request('https://game.example/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-7',origin:'https://game.example','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
async function battle(tower,f,body){
 const response=await tower.handle('tower/start',request('tower/start',{...body,protocol:'TOWER_ABYSS_20261022'}));
 if(!response.ok)return response;
 const pending=await response.json();f.setClock(pending.settlement.notBefore);
 return tower.handle('tower/finish',request('tower/finish',{requestId:body.requestId}));
}
for(const postgres of [false,true]){
 test(`${postgres?'PostgreSQL':'SQLite'}: actual tower route uses continuous server combat, CMS reward and one-floor progress`,async t=>{
   const f=await jointFixture(t,{postgres}),tower=await operatingTowerFixture(f,{floorNo:69,rewardCoin:25000000});
   const before=await f.coin(),res=await battle(tower,f,{floorNo:69,requestId:'tower-live-69'});
   assert.equal(res.status,200);const data=await res.json();assert.equal(data.result,'WIN');assert.equal(data.success,true);
   assert.equal(data.continuousEncounter.total,28);assert.equal(data.continuousEncounter.initialIds.length,3);assert.equal(data.combatLimitMs,180000);
   assert.equal(data.nextFloor,70);assert.equal(data.unlockStep,1);assert.equal(data.reward,25000000);assert.equal(await f.coin(),before+25000000);
   assert.equal(data.continuousEncounter.instances.at(-1).name,'식월의 예언자');assert.equal(data.battleV2.result.winner,'A');
   assert.ok(data.battleV2.result.timeline.some(e=>e.type==='ENEMY_SPAWN'));
   const replay=await tower.handle('tower/fight',request('tower/fight',{floorNo:69,requestId:'tower-live-69'}));assert.equal(replay.status,409);assert.equal(await f.coin(),before+25000000);
   const last=await(await battle(tower,f,{floorNo:70,requestId:'tower-live-70'})).json();assert.equal(last.completed,true);assert.equal(last.nextFloor,71);
   const status=await(await tower.handle('tower/status',request('tower/status'))).json();assert.equal(status.completed,true);assert.equal(status.progress.highestFloor,70);assert.equal(status.floor,null);
   assert.equal((await tower.handle('tower/fight',request('tower/fight',{floorNo:1,requestId:'forbidden-repeat'}))).status,409);
 });
 test(`${postgres?'PostgreSQL':'SQLite'}: actual tower defeat does not advance or grant a clear reward`,async t=>{
   const f=await jointFixture(t,{postgres});f.setPower(1000);const tower=await operatingTowerFixture(f,{floorNo:10,monsterPower:50000000});
   const before=await f.coin(),data=await(await battle(tower,f,{floorNo:10,requestId:'tower-defeat-01'})).json();
   assert.equal(data.result,'LOSE');assert.equal(data.success,false);assert.equal(data.nextFloor,10);assert.equal(data.reward,0);assert.equal(await f.coin(),before);
 });
}

test('live upper floors use dedicated Tower replacement sprites without changing CMS identity',async t=>{
 const f=await jointFixture(t),snapshot={cards:(await f.deps.raidDeckPower(f.env,7,null,'TOWER')).cards.map(c=>({...c,power:100000000}))};
 for(const [tier,id,file] of [[59,64,'abyss-iron-rider'],[60,67,'void-herald'],[69,68,'obsidian-destroyer'],[70,69,'abyss-sovereign']]){
  const battle=buildTowerV3Battle({snapshot,tier,seed:1,config:{...TOWER_V3_DRAFT,maxTier:70,powerGrowth:1.001},operatingFloor:{id,name:'CMS 수호자',image:'cms-original.jpg',power:1000000}});
  assert.ok(battle.continuousEncounter.instances.at(-1).battleSprite.includes(file));
  assert.equal(battle.continuousEncounter.instances.at(-1).sourceArt,battle.continuousEncounter.instances.at(-1).battleSprite);
  assert.equal(battle.continuousEncounter.instances.at(-1).cardId,'MONSTER:'+id);
  assert.equal(battle.continuousEncounter.instances[0].name,tier<=60?'심연의 철기병':'흑요석 파괴수');
 }
});
test('entry screens remain native while both battle actions use the common continuous overlay',()=>{
 const tower=read('js/tower-v1038.js'),scrap=read('js/workshop-v1881.js'),battle=read('js/pve-continuous-battle-live.mjs');
 assert.match(tower,/ui\(\)\.render\(box,/);assert.match(scrap,/root\.innerHTML = scrapyardHeader\(\) \+ scrapyardPanel\(\)/);
 assert.doesNotMatch(tower+scrap,/location\.(?:href|assign|replace).*pve-v3/);assert.match(scrap,/api\('scrapyard\/v3\/run'/);
 assert.match(read('js/scrapyard-battle-v1698.js'),/playContinuousBattle/);assert.match(read('js/battle-v3-live.js'),/options\.data\?\.continuousEncounter/);
 assert.match(battle,/continuousPlayback:true/);assert.doesNotMatch(battle,/<iframe|new .*Application|towerPayload|enemySteps/);
 assert.match(battle,/onCombatEvent/);assert.match(battle,/remainingCombatMs/);assert.match(battle,/guardianProgress/);
});
