import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.RANKED_QA_DIR;if(!out)throw Error('RANKED_QA_DIR is required outside the release tree');fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v3-completion-payload-20260928.json')));
const fur=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters/fur/manifest-v1.json'))).characters[1];
const cards=[...fixture.battleV2.teams.A.cards.slice(0,4),{cardId:fur.cardId,title:fur.title,grade:'FUR',image:fur.sourceArt,type:'ATTACK'}].map(c=>({id:c.cardId,title:c.title,rarity:c.grade,image:c.image,image_url:c.image,power:90000,baseBattlePower:90000,powerType:c.type}));
const user={id:4242,serverUserId:4242,nickname:'랭크전 개편 검수',role:'USER',coin:100000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/,'' )||'index.html');if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 let state='paused';const errors=[],dialogs=[],requests=[],page=await browser.newPage({viewport,serviceWorkers:'block'});page.setDefaultTimeout(20000);
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-ranked-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
 await page.route('**/api/**',route=>{
  const key=new URL(route.request().url()).pathname.slice(5);requests.push(key);
  const settings={enabled:state!=='paused',status:state==='paused'?'10월 2일 오전 1시 개방 예정':'진행 중',seasonName:'시즌 19',seasonDurationDays:5,automaticSeasons:state!=='paused',scheduledReopenAt:state==='paused'?'2026-10-01T16:00:00.000Z':null,startsAt:'2026-10-01 16:00:00',endsAt:'2026-10-06 16:00:00',tiers:[],rankedReformVersion:'20261002'};
  const data={
   'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},
   'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},
   'pvp/config':{settings,deck:cards.map(c=>c.id),energy:{enabled:true,unlimited:false,energy:state==='empty'?0:10,maxEnergy:10,costPerBattle:1,rechargeMinutes:5,nextRechargeAt:state==='empty'?new Date(Date.now()+300000).toISOString():null},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈',min:0}},deckRules:{deckSize:5,gradeLimits:{FUR:2,ZENITH:2,SUPERSTAR:1}},battleSettings:{},battleEngine:{active:true,version:'V3',mode:'V3'},serverNow:new Date().toISOString()},
   'pvp/match':{error:'균형 조건에 맞는 상대를 찾지 못했습니다. 잠시 후 다시 시도하세요.'},
   'pvp/fight':{result:'WIN',replayed:true,scoreAfter:1024,scoreChange:24,coinReward:250000,coinAfter:350000}
  }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return route.fulfill({status:key==='pvp/match'?409:200,json:data});
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>{pvpState.tab='match';renderShell('pvp');});
 await page.locator('.ranked-reopen-notice').waitFor();await page.waitForTimeout(900);const opening=await page.locator('.ranked-reopen-notice').innerText();assert.ok(opening.includes('1,000'));await page.screenshot({path:path.join(out,`paused-${viewport.width}.png`),fullPage:true});
 state='open';await page.evaluate(()=>loadPvpView());await page.locator('#rankedMatchStart:not([disabled])').waitFor();assert.equal((await page.locator('#pvpEnergyCount').innerText()).trim(),'10 / 10');assert.match(await page.locator('.ranked-reform-rules').innerText(),/방어전 점수 변동 없음/);
 await page.screenshot({path:path.join(out,`match-${viewport.width}.png`),fullPage:true});await page.locator('#rankedMatchStart').click();assert.ok(dialogs.some(text=>text.includes('균형 조건')));assert.equal(requests.filter(key=>key==='pvp/fight').length,0);
 state='empty';await page.evaluate(()=>loadPvpView());await page.waitForFunction(()=>document.getElementById('rankedMatchStart')?.disabled===true);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
 state='open';await page.evaluate(async()=>{await loadPvpView();await ensureFeatureResources('battleV2');await fightPvpV2Live({id:999,target:{nickname:'검수 상대'},mine:[],pvpPreviewPower:1000,matchToken:'local-ticket'});});
 await page.locator('#pvpReceiptClose').waitFor();assert.match(await page.locator('.ranked-receipt-result').innerText(),/이미 반영된 경기/);await page.screenshot({path:path.join(out,`receipt-${viewport.width}.png`)});await page.locator('#pvpReceiptClose').click();
 assert.deepEqual(errors,[]);results.push({viewport,opening,overflow,errors,dialogs});await page.close();
}}catch(error){for(const context of browser.contexts())for(const page of context.pages()){console.log(JSON.stringify(await page.evaluate(()=>({energy:pvpState.energy,matching:pvpState.matching,button:document.getElementById('rankedMatchStart')?.outerHTML,content:document.getElementById('pvpContent')?.innerText?.slice(0,900)}))));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,results}));}
