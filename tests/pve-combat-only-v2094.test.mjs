import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {jointFixture} from './helpers/joint-db.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {buildTowerV3Battle,TOWER_V3_DRAFT} from '../functions/_tower_v3.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const request=(path,body)=>new Request('https://game.example/api/'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-7',origin:'https://game.example','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
for(const postgres of [false,true]){
 test(`${postgres?'PostgreSQL':'SQLite'}: actual tower route uses continuous server combat, CMS reward and one-floor progress`,async t=>{
   const f=await jointFixture(t,{postgres}),tower=await operatingTowerFixture(f,{floorNo:69,rewardCoin:25000000});
   const before=await f.coin(),res=await tower.handle('tower/fight',request('tower/fight',{floorNo:69,requestId:'tower-live-69'}));
   assert.equal(res.status,200);const data=await res.json();assert.equal(data.result,'WIN');assert.equal(data.success,true);
   assert.equal(data.continuousEncounter.total,28);assert.equal(data.continuousEncounter.initialIds.length,3);assert.equal(data.combatLimitMs,180000);
   assert.equal(data.nextFloor,70);assert.equal(data.unlockStep,1);assert.equal(data.reward,25000000);assert.equal(await f.coin(),before+25000000);
   assert.equal(data.continuousEncounter.instances.at(-1).name,'아이젠 소스케');assert.equal(data.battleV2.result.winner,'A');
   assert.ok(data.battleV2.result.timeline.some(e=>e.type==='ENEMY_SPAWN'));
   const replay=await tower.handle('tower/fight',request('tower/fight',{floorNo:69,requestId:'tower-live-69'}));assert.equal(replay.status,409);assert.equal(await f.coin(),before+25000000);
   const last=await(await tower.handle('tower/fight',request('tower/fight',{floorNo:70,requestId:'tower-live-70'}))).json();assert.equal(last.completed,true);assert.equal(last.nextFloor,71);
   const status=await(await tower.handle('tower/status',request('tower/status'))).json();assert.equal(status.completed,true);assert.equal(status.progress.highestFloor,70);assert.equal(status.floor,null);
   assert.equal((await tower.handle('tower/fight',request('tower/fight',{floorNo:1,requestId:'forbidden-repeat'}))).status,409);
 });
 test(`${postgres?'PostgreSQL':'SQLite'}: actual tower defeat does not advance or grant a clear reward`,async t=>{
   const f=await jointFixture(t,{postgres});f.setPower(1000);const tower=await operatingTowerFixture(f,{floorNo:10,monsterPower:50000000});
   const before=await f.coin(),data=await(await tower.handle('tower/fight',request('tower/fight',{floorNo:10,requestId:'tower-defeat'}))).json();
   assert.equal(data.result,'LOSE');assert.equal(data.success,false);assert.equal(data.nextFloor,10);assert.equal(data.reward,0);assert.equal(await f.coin(),before);
 });
}

test('live upper floors use their approved Omega, Minato and Ichigo sprites',async t=>{
 const f=await jointFixture(t),snapshot={cards:(await f.deps.raidDeckPower(f.env,7,null,'TOWER')).cards.map(c=>({...c,power:100000000}))};
 for(const [tier,id,file] of [[59,64,'tower-064-commander-krieg'],[60,67,'hunt-067-yellow-flash'],[69,68,'hunt-068-omega-09'],[70,69,'hunt-069-masked-soul-swordsman']]){
  const battle=buildTowerV3Battle({snapshot,tier,seed:1,config:{...TOWER_V3_DRAFT,maxTier:70,powerGrowth:1.001},operatingFloor:{id,name:'CMS 수호자',image:'cms-original.jpg',power:1000000}});
  assert.ok(battle.continuousEncounter.instances.at(-1).battleSprite.includes(file));
  assert.equal(battle.continuousEncounter.instances.at(-1).sourceArt,'cms-original.jpg');
  assert.equal(battle.continuousEncounter.instances[0].name,tier<=60?'커맨더 크리그':'오메가-09');
 }
});
test('entry screens remain native while both battle actions use the common continuous overlay',()=>{
 const tower=read('js/tower-v1038.js'),scrap=read('js/workshop-v1881.js'),battle=read('js/pve-continuous-battle-live.mjs');
 assert.match(tower,/box\.innerHTML=`[\s\S]*tower-hero/);assert.match(scrap,/root\.innerHTML = scrapyardHeader\(\) \+ scrapyardPanel\(\)/);
 assert.doesNotMatch(tower+scrap,/location\.(?:href|assign|replace).*pve-v3/);assert.match(scrap,/api\('scrapyard\/v3\/run'/);
 assert.match(read('js/scrapyard-battle-v1698.js'),/playContinuousBattle/);assert.match(read('js/battle-v3-live.js'),/options\.data\?\.continuousEncounter/);
 assert.match(battle,/continuousPlayback:true/);assert.doesNotMatch(battle,/<iframe|new .*Application|towerPayload|enemySteps/);
 assert.match(battle,/onCombatEvent/);assert.match(battle,/remainingCombatMs/);assert.match(battle,/guardianProgress/);
});
