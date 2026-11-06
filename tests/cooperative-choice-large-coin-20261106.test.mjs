import test from 'node:test';
import assert from 'node:assert/strict';
import {coreRewardFixture} from './helpers/core-reward-fixture.mjs';
import {CORE_REWARD_DEFAULT} from '../shared/core-raid-reward-policy-v1.mjs';
import {prepareRewardRevealContext,prepareRewardRevealOffer,handleRewardReveal} from '../functions/_reward_reveal.js';
import {settleCoopRewards} from '../functions/_cooperative_rewards.js';
import {defaultCoopRewards,freezeCoopReward,COOP_SETTINGS_KEY} from '../shared/cooperative-rewards-v1.mjs';
import {MAX_COIN_SQL} from '../shared/coin-integer-v1.mjs';

const policy=()=>({...structuredClone(CORE_REWARD_DEFAULT),enabled:true,minimum:{rewardType:'COIN',quantity:7,weight:1}});
async function request(f,path,body){
 const response=await handleRewardReveal({path:path.split('?')[0],env:f.env,request:new Request('https://qa.invalid/api/'+path,{method:body?'POST':'GET',headers:{origin:'https://qa.invalid','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),deps:{authenticate:async()=>({id:1,role:'USER'}),json:(body,status=200,headers={})=>Response.json(body,{status,headers}),withUserMutationLock:async(_e,_u,_p,work)=>work()}});
 return {status:response.status,body:await response.json()};
}
async function offer(f,{content='COOP_NORMAL',type='COIN',quantity=7,ref=''}={}){
 await f.run('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','reward_reveal_policy_v1:'+content,JSON.stringify(policy()));
 const context=await prepareRewardRevealContext(f.env,content,policy(),true);
 const plan=prepareRewardRevealOffer(f.env,context,{userId:1,roomId:crypto.randomUUID(),baseReward:{coin:10},quota:{period:'energy',cost:1,maximum:3},finishedAt:Date.now()});
 await f.env.DB.batch([...context.statements,...plan.statements]);
 const key='reward_reveal_offer_v1:1:'+plan.offer.offerId,row=await f.row('SELECT value FROM app_meta WHERE key=?',key),saved=JSON.parse(row.value);
 saved.choices=Array.from({length:3},()=>({rewardType:type,rewardRef:ref,quantity}));
 await f.run('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(saved),key);
 return plan.offer;
}
const claim=(f,o,selectedIndex=2)=>request(f,'rewards/reveal/claim',{offerId:o.offerId,selectedIndex});
const exact=async f=>(await f.row('SELECT CAST(coin AS TEXT) coin FROM users WHERE id=1')).coin;
const count=async(f,table)=>Number((await f.row('SELECT COUNT(*) n FROM '+table)).n);

for(const dialect of ['sqlite','postgres']){
 test(`${dialect}: cooperative choice credits exact large balances and replays once`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());
  const contents=['COOP_NORMAL','COOP_HARD','COOP_TRANSCEND','COOP_EXTREME','LICH','MADARA','BLACKWING'];
  const balances=['9007199254740990','9007199254740991','9007199254740992','99999999999999999','100000000000000000','100000000000000001','9223372036854775800'];
  for(const [i,initial]of balances.entries()){
   await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1',initial);
   const o=await offer(f,{content:contents[i]}),before=await count(f,'coin_logs'),paid=await claim(f,o);
   assert.equal(paid.status,200,JSON.stringify(paid.body));
   const expected=(BigInt(initial)+7n).toString();assert.equal(await exact(f),expected);
   assert.equal((await f.row('SELECT CAST(balance_after AS TEXT) balance FROM coin_logs WHERE balance_after=CAST(? AS BIGINT)',expected)).balance,expected);
   assert.deepEqual(await claim(f,o,0),paid);assert.equal(await exact(f),expected);assert.equal(await count(f,'coin_logs'),before+1);
  }
 });
 test(`${dialect}: failed high-wallet claim preserves choice and retry survives lost response`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());
  await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1','100000000000000001');
  const o=await offer(f);f.fail('INSERT INTO coin_logs');
  assert.equal((await claim(f,o)).status,503);assert.equal(await exact(f),'100000000000000001');assert.equal(await count(f,'coin_logs'),0);
  const opened=await request(f,'rewards/reveal/open?offerId='+o.offerId);assert.equal(opened.body.offer.selectedIndex,2);assert.equal(opened.body.offer.result,null);
  assert.equal((await request(f,'rewards/reveal/pending')).body.offers.length,1);
  f.fail('');assert.equal((await claim(f,o,1)).status,409);
  f.loseCommit();const paid=await claim(f,o);assert.equal(paid.status,200);assert.equal(await exact(f),'100000000000000008');
  assert.deepEqual(await claim(f,o),paid);assert.equal(await count(f,'coin_logs'),1);assert.equal((await request(f,'rewards/reveal/pending')).body.offers.length,0);
 });
 test(`${dialect}: database maximum still rejects overflow without consuming saved reward`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1',MAX_COIN_SQL);
  const o=await offer(f);assert.equal((await claim(f,o)).status,503);assert.equal(await exact(f),MAX_COIN_SQL);assert.equal(await count(f,'coin_logs'),0);
  assert.equal((await request(f,'rewards/reveal/pending')).body.offers.length,1);
  await f.run('UPDATE users SET coin=coin-7 WHERE id=1');assert.equal((await claim(f,o)).status,200);assert.equal(await exact(f),MAX_COIN_SQL);assert.equal(await count(f,'coin_logs'),1);
 });
 test(`${dialect}: duplicate vehicle converts to saved minimum coins at high balance`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1','100000000000000001');
  await f.run("INSERT INTO character_garage_items VALUES(1,'검수 차량','MYTHIC','',0,1,1)");
  await f.run("INSERT INTO user_garage_vehicles VALUES(1,1,'EXISTING','before')");
  const o=await offer(f,{type:'VEHICLE',ref:'1',quantity:1}),paid=await claim(f,o);assert.equal(paid.status,200);assert.equal(paid.body.choiceReward.converted,true);assert.equal(paid.body.choiceReward.quantity,7);
  assert.equal(await exact(f),'100000000000000008');assert.equal(await count(f,'user_garage_vehicles'),1);
 });
 test(`${dialect}: shards and crystals retain their original limits`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());
  for(const [type,column]of [['CARD_SHARDS','card_shards'],['MAGIC_CRYSTAL','magic_crystals']]){
   await f.run(`UPDATE users SET ${column}=CAST(? AS BIGINT) WHERE id=1`,String(Number.MAX_SAFE_INTEGER));
   const o=await offer(f,{type,quantity:1});assert.equal((await claim(f,o)).status,503);assert.equal((await f.row(`SELECT CAST(${column} AS TEXT) amount FROM users WHERE id=1`)).amount,String(Number.MAX_SAFE_INTEGER));
  }
 });
 test(`${dialect}: cooperative base settlement and choice grant retain every coin`,async t=>{
  const f=await coreRewardFixture(dialect);t.after(()=>f.close());await f.run('UPDATE users SET coin=CAST(? AS BIGINT) WHERE id=1','100000000000000001');
  const rewards=defaultCoopRewards();rewards.enabled=true;rewards.difficulties.forEach(r=>Object.assign(r,{coin:10,masterStars:0,items:[]}));
  const config={mode:'ON',revision:1,rewards};await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)',COOP_SETTINGS_KEY,JSON.stringify(config));
  await f.run('INSERT INTO app_meta(key,value) VALUES(?,?)','reward_reveal_policy_v1:COOP_NORMAL',JSON.stringify(policy()));
  const frozen=freezeCoopReward(config,'NORMAL');delete frozen.entryEnergy;
  const room={id:'high-wallet-coop',creationRequest:'high-wallet-room',createdAt:Date.now()-60000,finishedAt:Date.now(),status:'VICTORY',difficulty:'NORMAL',rewardPolicy:{...frozen,revealPolicy:policy()},members:[1,2].map(id=>({id,result:'VICTORY'}))};
  const result=await settleCoopRewards(f.env,room);assert.equal(await exact(f),'100000000000000011');assert.deepEqual(await settleCoopRewards(f.env,room),result);
  assert.equal((await claim(f,result[1].choiceOffer)).status,200);assert.equal(await exact(f),'100000000000000018');
  assert.equal(await count(f,'coin_logs'),3);
 });
}
