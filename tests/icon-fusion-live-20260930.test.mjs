import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {iconLiveCardHtml} from '../js/icon-fusion-v1.mjs';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {runIconFusion,iconFusionReceipt,iconFusionOverview,handleIconFusion} from '../functions/_icon_fusion.js';
import {ICON_FUSION_POLICY as POLICY,ICON_LIVE_CARDS,formatIconAmount,validateIconVideoUrl} from '../shared/icon-fusion-policy-v1.mjs';

test('approved recipe, exact Korean units and same-site video paths',()=>{
 assert.equal(POLICY.coinCost,100000000000);assert.equal(POLICY.masterStarCost,5000000);assert.equal(POLICY.successRate,10);assert.equal(POLICY.pityAttempts,0);assert.equal(ICON_LIVE_CARDS.length,7);
 for(const [n,s] of [[5000000,'500만'],[100000000000,'1천억'],[89000000000000,'89조'],[0,'0'],[100010000,'1억 1만']])assert.equal(formatIconAmount(n),s);
 for(const path of ['https://evil.test/a.mp4','//evil/a.mp4','assets/../secret.mp4','assets/a.svg','assets/a.mp4?x=1'])assert.throws(()=>validateIconVideoUrl(path));
 assert.equal(validateIconVideoUrl('assets/videos/icon.mp4'),'/assets/videos/icon.mp4');
});
for(const postgres of [false,true]){
 const mode=postgres?'PostgreSQL':'SQLite';
 test(`${mode}: 10% boundary success consumes one enhanced copy of each grade, charges atomically and replays`,async t=>{
  const f=await iconFusionFixture(t,{postgres}),body=f.body(),result=await runIconFusion(f.env,f.user,body,{randomInt:()=>99999});
  assert.equal(result.success,true);assert.equal(result.target.code,'ICON-ORIKKUNG');assert.equal(result.result.quantity,1);
  const after=await f.snapshot();assert.equal(after.coin,200000000000);assert.equal(after.stars,10000000);
  for(const id of [body.superstarId,body.furId])assert.deepEqual(after.cards.find(c=>c.card_id===id),{card_id:id,quantity:2,breakthrough_level:0});
  assert.equal((await runIconFusion(f.env,f.user,body,{randomInt(){throw Error('reroll')}})).replayed,true);assert.deepEqual(await f.snapshot(),after);
  assert.equal((await iconFusionReceipt(f.env,f.user,body.requestId)).success,true);
  await assert.rejects(()=>iconFusionReceipt(f.env,{id:8},body.requestId),{code:'JOINT_NOT_FOUND'});
  await assert.rejects(()=>runIconFusion(f.env,f.user,{...body,targetCode:'ICON-DIIM'}),{code:'JOINT_REQUEST_CONFLICT'});
  assert.equal(Number((await f.p('SELECT COUNT(*) n FROM coin_logs WHERE user_id=7').first()).n),1);
 });
 test(`${mode}: 90% failure consumes both cards and full costs without granting or compensation`,async t=>{
  const f=await iconFusionFixture(t,{postgres}),result=await runIconFusion(f.env,f.user,f.body(),{randomInt:()=>100000}),after=await f.snapshot();
  assert.equal(result.success,false);assert.equal(result.result,null);assert.equal(after.cards.length,2);assert.equal(after.coin,200000000000);assert.equal(after.stars,10000000);
  assert.ok(after.cards.every(c=>c.quantity===2&&c.breakthrough_level===0));
 });
 test(`${mode}: grant failure rolls everything back, keeps result private and retries original plan`,async t=>{
  const f=await iconFusionFixture(t,{postgres}),body=f.body(),before=await f.snapshot();f.fail('INSERT INTO user_cards');
  await assert.rejects(()=>runIconFusion(f.env,f.user,body,{randomInt:()=>0}));assert.deepEqual(await f.snapshot(),before);
  const pending=await iconFusionReceipt(f.env,f.user,body.requestId);assert.equal(pending.status,'PENDING');assert.equal(pending.success,undefined);assert.equal(pending.result,undefined);assert.equal(pending.roll,undefined);
  f.fail('');assert.equal((await runIconFusion(f.env,f.user,body,{randomInt(){throw Error('reroll')}})).success,true);
 });
 test(`${mode}: zero-row grant rolls payment back; stale material cancels its saved plan`,async t=>{
  const f=await iconFusionFixture(t,{postgres}),body=f.body(),before=await f.snapshot(),batch=f.DB.batch.bind(f.DB);
  f.DB.batch=statements=>batch(statements.map(s=>s.source?.startsWith('INSERT INTO user_cards')?f.p('SELECT 1'):s));
  await assert.rejects(()=>runIconFusion(f.env,f.user,body,{randomInt:()=>0}));assert.deepEqual(await f.snapshot(),before);
  f.DB.batch=batch;await f.p("UPDATE user_cards SET breakthrough_level=12 WHERE card_id='CN-FUR'").run();
  await assert.rejects(()=>runIconFusion(f.env,f.user,body),{code:'ICON_FUSION_STALE'});
  assert.equal((await f.p('SELECT status FROM joint_operations_v1 WHERE request_id=?',body.requestId).first()).status,'CANCELLED');assert.equal(await f.coin(),before.coin);
 });
 test(`${mode}: deck materials, wrong grade/level, balance and paused release cannot charge`,async t=>{
  const f=await iconFusionFixture(t,{postgres}),before=await f.snapshot();
  await f.p('INSERT INTO pvp_deck_presets(user_id,preset_no,card_ids) VALUES(7,1,?)',JSON.stringify(['CN-FUR'])).run();
  assert.equal((await iconFusionOverview(f.env,f.user)).materials.find(c=>c.id==='CN-FUR').eligible,false);
  await assert.rejects(()=>runIconFusion(f.env,f.user,f.body()),{code:'ICON_FUSION_DECK'});await f.p('DELETE FROM pvp_deck_presets WHERE user_id=7').run();
  await assert.rejects(()=>runIconFusion(f.env,f.user,{...f.body(),superstarId:'CN-FUR',furId:'CN-SUPER'}),{code:'ICON_FUSION_MATERIAL'});
  await f.p("UPDATE user_cards SET breakthrough_level=14 WHERE card_id='CN-FUR'").run();await assert.rejects(()=>runIconFusion(f.env,f.user,f.body()),{code:'ICON_FUSION_MATERIAL'});await f.p("UPDATE user_cards SET breakthrough_level=13 WHERE card_id='CN-FUR'").run();
  await f.p('UPDATE users SET coin=99999999999 WHERE id=7').run();await assert.rejects(()=>runIconFusion(f.env,f.user,f.body()),{code:'ICON_FUSION_BALANCE'});await f.p('UPDATE users SET coin=300000000000 WHERE id=7').run();
  await f.setting('icon_fusion_settings_v1',{revision:1,enabled:false,successVideoUrl:'',successVideoDurationMs:12000});await assert.rejects(()=>runIconFusion(f.env,f.user,f.body()),{code:'ICON_FUSION_CLOSED'});assert.deepEqual(await f.snapshot(),before);
 });
 test(`${mode}: lost commit acknowledgement and competing requests cannot charge twice`,async t=>{
  const f=await iconFusionFixture(t,{postgres}),batch=f.DB.batch.bind(f.DB);let lost=false;
  f.DB.batch=async statements=>{const result=await batch(statements);if(!lost&&statements.some(s=>s.source?.includes("SET status='COMPLETED'"))){lost=true;throw Error('LOST_ACK')}return result;};
  const results=await Promise.allSettled([f.body(),f.body()].map(body=>f.deps.withUserMutationLock(f.env,7,'icons/fusion',()=>runIconFusion(f.env,f.user,body,{randomInt:()=>0}))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(lost,true);assert.equal((await f.snapshot()).coin,200000000000);
 });
}
test('authenticated route enforces origin/body and OWNER video settings preserve policy with retries',async t=>{
 const f=await iconFusionFixture(t,{postgres:true}),deps={...f.deps,requirePermission:async()=>({id:7,role:'OWNER'})};
 const send=(path,body,method='POST',origin='https://qa.test')=>handleIconFusion({path,env:f.env,deps,request:new Request(`https://qa.test/api/${path}`,{method,headers:{origin,'content-type':'application/json',authorization:'Bearer local-account-7'},...(body?{body:JSON.stringify(body)}:{})})});
 assert.equal((await send('icons/fusion',f.body(),'POST','https://evil.test')).status,403);
 assert.equal((await send('icons/fusion',{...f.body(),success:true})).status,400);
 const body={requestId:crypto.randomUUID(),expectedRevision:1,enabled:true,successVideoUrl:'assets/videos/icon.mp4',successVideoDurationMs:20000};
 const first=await (await send('admin/icons/fusion',body,'PATCH')).json();assert.equal(first.settings.revision,2);
 assert.equal((await (await send('admin/icons/fusion',body,'PATCH')).json()).settings.revision,2);
 assert.equal((await send('admin/icons/fusion',{...body,requestId:crypto.randomUUID()},'PATCH')).status,409);
 assert.equal((await f.snapshot()).coin,300000000000);
 const source=readFileSync(new URL('../functions/api/[[path]].js',import.meta.url),'utf8'),wire=source.match(/const iconFusionResponse=[^\n]+/)[0];let locks=0;
 const context={handleIconFusion,env:f.env,requirePermission:deps.requirePermission,json:deps.json,authenticate:deps.authenticate,withJointUserMutationLock:(...args)=>{locks++;return deps.withUserMutationLock(...args);},path:'icons/fusion',request:new Request('https://qa.test/api/icons/fusion',{method:'POST',headers:{origin:'https://qa.test','content-type':'application/json',authorization:'Bearer local-account-7'},body:JSON.stringify(f.body())})};
 assert.equal((await vm.runInNewContext('(async()=>{'+wire+'return null;})()',context)).status,200);assert.equal(locks,1);
});
test('ICON launch preserves draft effects and wires scoped client/server entry',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('functions/api/[[path]].js'),/handleIconFusion\(\{path,request,env,deps:\{requirePermission,json,authenticate,withUserMutationLock:withJointUserMutationLock\}\}\)/);
 assert.match(read('index.html'),/icon-fusion-v1.bundle.js/);assert.match(read('js/app.js'),/tab==='iconfusion'\)window.IconFusion.mount/);
 assert.doesNotMatch(read('js/icon-fusion-v1.mjs'),/showModal|requestFullscreen|window.open|confirm\(/);
 assert.match(read('js/icon-fusion-v1.mjs'),/video.playsInline=true/);
});
test('all seven ICONs retain photo frames and separate SDs through the shipped PVE/PVP adapters',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8'),sandbox={console,setTimeout:()=>0};sandbox.window=sandbox;sandbox.globalThis=sandbox;
 vm.runInNewContext(read('js/project-v-tier-battle-art-adapter-v1.js'),sandbox);
 const manifests=Object.fromEntries([['FUR','fur/manifest-v2'],['PRESTIGE','prestige/manifest-v1'],['SUPERSTAR','superstar/manifest-v1'],['ICON','icon/manifest-v1']].map(([grade,file])=>[grade,JSON.parse(read('assets/ui/project-v/characters/'+file+'.json'))]));
 const adapter=sandbox.ProjectVTierBattleArt.createAdapter({manifests});sandbox.IconFusion={cardHtml:iconLiveCardHtml};
 vm.runInNewContext(read('js/battle-v3-live.js').replace('root.ProjectVBattleV3Live = Object.freeze({','root.iconTestRoster=rosterCardHtml;root.ProjectVBattleV3Live = Object.freeze({'),sandbox);
 const cards=ICON_LIVE_CARDS.map(c=>({...c,id:c.cardId,rarity:'ICON',image:c.sourceArt,power:180000})),catalog=new Map(cards.map(c=>[c.id,c]));
 for(const c of cards){const sd=adapter.resolveForV3(c);assert.equal(sd.kind,'ICON_SD');assert.match(sd.primaryUrl,/preview\/icon-battle-assets-v1\/assets\/sd\//);assert.equal(sd.sourceArtUrl,'/'+c.sourceArt);assert.ok(sd.footAnchor.y>.85&&sd.footAnchor.y<.95);
  const html=sandbox.iconTestRoster({...c,image:sd.primaryUrl,originalCardArt:c.sourceArt},0,catalog);assert.ok(html.includes(c.sourceArt));assert.match(html,/icon-streamer-frame-v1.png/);assert.doesNotMatch(html,/-sd-v1.webp/);
 }
 const pve=createPveBattleV2({cards:cards.slice(0,5),monster:{id:1,battle_power:300000},seed:10}),pvp=createPvpBattleV2({attackerCards:cards.slice(0,5),defenderCards:cards.slice(2,7),seed:10});
 for(const battleV2 of [pve,pvp]){assert.equal(battleV2.teams.A.cards.length,5);assert.ok(battleV2.result.timeline.length>0);const after=adapter.adaptBattlePayload({battleV2});assert.ok(after.battleV2.teams.A.cards.every(c=>c.projectVBattleArt.kind==='ICON_SD'));assert.ok(after.battleV2.teams.A.cards.every(c=>c.originalCardArt.includes('assets/cards/ICON/')));}
 const server=read('functions/api/[[path]].js'),client=read('js/app.js');
 const ctx={FUR_MAX_ENHANCEMENT:15,FAKER_CHAMPIONSHIP_CARD_ID:'other',FAKER_FLAT_POWER_BONUS:3000,breakthroughBonusPercent:()=>9999,clientBreakthroughBonusPercent:()=>9999};
 const serverPower=vm.runInNewContext(server.slice(server.indexOf('function cardPowerBase('),server.indexOf('function sqlUtcNow('))+';cardBattlePower',ctx);
 const clientPower=vm.runInNewContext(client.slice(client.indexOf('function battleCardPower('),client.indexOf('function pveDeckCardMini('))+';battleCardPower',ctx);
 for(const c of cards)for(const level of [0,13]){assert.equal(serverPower(c,level,{}),180000);assert.equal(clientPower(c,{breakthroughs:{[c.id]:level}},{}),180000);}
});
