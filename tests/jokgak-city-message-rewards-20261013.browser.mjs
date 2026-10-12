import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cityFixture} from './helpers/jokgak-city-fixture.mjs';
import {prepareCityRewardMessage,claimCityMessageReward} from '../functions/_jokgak_city_message_reward.js';
import {claimMessageRewardBatch} from '../functions/_message_reward_batch.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const root=fileURLToPath(new URL('..',import.meta.url)),out=process.env.CITY_QA_DIR;assert(out);fs.mkdirSync(out,{recursive:true});
const api=fs.readFileSync(path.join(root,'functions/api/[[path]].js'),'utf8'),entry=vm.createContext({ensureVerifiedRewardMessageV1276:async()=>{},claimCityMessageReward});
vm.runInContext(api.slice(api.indexOf('const VERIFIED_MESSAGE_REWARD_TYPES='),api.indexOf('let verifiedRewardMessageV1276ReadyPromise='))+'\n'+api.slice(api.indexOf('async function claimMessageRewardDirectV1222('),api.indexOf('async function canSafelyRecoverFailedMessageRewardV1222('))+'\nthis.claim=claimMessageRewardDirectV1222;this.spec=verifiedMessageRewardSpec;',entry);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname,file=path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[];
try{for(const width of [1440,390]){
 const cleanup=[],f=await cityFixture({after:fn=>cleanup.push(fn)}),user={id:1,serverUserId:1,nickname:'족각도시 보상 검수',role:'USER',coin:123456,cardShards:0,masterStars:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
 const profile=async()=>({...user,coin:Number((await f.p('SELECT coin FROM users WHERE id=1').first()).coin)});
 const deliver=async(campaign,coin,items)=>{const plan=await prepareCityRewardMessage(f.env,{userId:1,campaign,title:'[족각도시] 회차 보상 도착',body:'2026-10-13 06:00 ~ 12:00 (KST) 회차가 종료되었습니다.\n참여 보상 · 일반 공격 20회\n현금 TOP 5 보상 · 1위 / 100,000원',coin,items});await f.env.DB.batch(plan.statements);};
 await deliver('jokgak-city:round:82957:1',700000000000,[{code:'CITY_TEST_ITEM',quantity:7}]);
 const context=await browser.newContext({viewport:{width,height:width<600?844:1000},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'}),page=await context.newPage(),errors=[],alerts=[];
 try{
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-city-message-qa');localStorage.setItem('cnine_bgm_enabled','0');localStorage.setItem('cnine_battle_sound','OFF');HTMLMediaElement.prototype.play=function(){return Promise.resolve();};},user);
  await page.route('**/api/**',async route=>{
   const request=route.request(),endpoint=new URL(request.url()).pathname.slice(5);let data;
   try{
    if(endpoint==='messages'&&request.method()==='GET'){
     const rows=(await f.p('SELECT m.*,r.reward_type,r.reward_amount,r.claimed_at FROM user_messages m JOIN user_message_rewards r ON r.message_id=m.id WHERE m.user_id=1 AND m.hidden_at IS NULL ORDER BY m.id DESC').all()).results;
     data={messages:rows.map(m=>({...m,created_at:'2026-10-13T03:00:00Z',reward_supported:true,reward_label:'족각도시 보상',reward_icon:'🏙️'})),unread:rows.length,serverNow:Date.now()};
    }else if(endpoint==='messages/claim'){
     const {messageId}=request.postDataJSON(),reward=await f.p('SELECT * FROM user_message_rewards WHERE message_id=? AND user_id=1',messageId).first(),result=await entry.claim(f.env,{id:1},reward,messageId);
     data={ok:true,rewardType:'JOKGAK_CITY_REWARD',rewardAmount:1,rewardLabel:'족각도시 보상',messageDeleted:true,balanceAfter:result.balanceAfter,coinAfter:result.balanceAfter,user:await profile()};
    }else if(endpoint==='messages/claim-batch'){
     const {messageIds}=request.postDataJSON(),results=await claimMessageRewardBatch(f.env,{id:1},messageIds,{specFor:entry.spec,canRecover:async()=>false,claim:entry.claim});data={ok:true,results,user:await profile(),coinAfter:(await profile()).coin};
    }else data={
     'service/status':{maintenance:{active:false}},me:{user:await profile()},'me/summary':{user:await profile(),prison:{incarcerated:false}},
     cards:{cards:[]},packs:{packs:[]},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:1},avatarFeature:{visible:true},alchemyFeature:{visible:false}},
     'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
    }[endpoint]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    await route.fulfill({json:data});
   }catch(error){errors.push(error.message);await route.fulfill({status:500,json:{error:error.message}});}
  });
  await page.goto(base+'/?screen=messages',{waitUntil:'domcontentloaded'});await page.locator('[data-claim-message]').waitFor({timeout:20000});
  assert.match(await page.locator('.user-message').textContent(),/700,000,000,000/);assert.equal((await profile()).coin,123456);
  await page.locator('.message-center').screenshot({path:path.join(out,width+'-inbox.png')});
  const btn=await page.locator('[data-claim-message]').boundingBox();assert.ok(btn.width>=80&&btn.x>=0&&btn.x+btn.width<=width);
  await page.locator('[data-claim-message]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-claim-message]').length===0);
  assert.equal((await profile()).coin,700000123456);assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').first()).quantity),7);
  await deliver('jokgak-city:action:bulk-one',50,[]);await deliver('jokgak-city:action:bulk-two',0,[{code:'CITY_TEST_ITEM',quantity:2}]);
  await page.goto(base+'/?screen=messages',{waitUntil:'domcontentloaded'});await page.locator('#claimAllMessages').filter({hasText:'2건'}).waitFor();await page.locator('#claimAllMessages').click();await page.waitForFunction(()=>document.querySelectorAll('[data-claim-message]').length===0);
  assert.equal((await profile()).coin,700000123506);assert.equal(Number((await f.p('SELECT quantity FROM cnine_user_inventory WHERE user_id=1').first()).quantity),9);
  assert.deepEqual(errors,[]);assert.match(alerts[0],/보상 1건.*수령/);assert.match(alerts[0],/현재 보유 코인:/);assert.match(alerts[1],/보상 2건/);checks.push({width,singleClaim:true,bulkClaim:true,noImmediateGrant:true,claimButtonFits:true,alerts,errors});
 }catch(error){await page.screenshot({path:path.join(out,width+'-failure.png'),fullPage:true});throw error;}finally{await context.close();for(const fn of cleanup)await fn();}
}
 fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify({checks},null,2)+'\n');console.log(JSON.stringify({checks,out}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
