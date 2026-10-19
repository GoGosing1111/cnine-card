import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {operatingMercenaries} from './helpers/mercenary-operating-roster-v2144.mjs';
import {rankedPublicMercenary,rankedSeriesReceipt} from '../shared/ranked-series-v1.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=process.env.RANKED_QA_DIR;if(!out)throw Error('RANKED_QA_DIR required');fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v3-completion-payload-20260928.json'))),fur=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters/fur/manifest-v1.json'))).characters[1];
const cards=[...fixture.battleV2.teams.A.cards.slice(0,4),{cardId:fur.cardId,title:fur.title,grade:'FUR',image:fur.sourceArt,type:'ATTACK'}].map(c=>({id:c.cardId,title:c.title,rarity:c.grade,image:c.image,image_url:c.image,power:90000,baseBattlePower:90000,powerType:c.type,power_type:c.type}));
const mercenaries=operatingMercenaries.slice(0,4),publicCards=mercenaries.map(rankedPublicMercenary),codes=publicCards.slice(0,3).map(c=>c.code);
const user={pigCoin:0,id:4242,serverUserId:4242,nickname:'랭크전 검수',role:'USER',coin:100000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/,'' )||'index.html');if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},hasTouch:width===390,serviceWorkers:'block'}),errors=[],requests=[],dialogs=[];let state='insufficient',savedCodes=[],revision=0,replay=false;
 const score={A:0,B:0},outcomes=width===1440?['A','A']:['A','B','A'];
 const rounds=outcomes.map((winner,i)=>{score[winner]++;const battleV2=createPvpBattleV2({attackerCards:cards.map(c=>({...c,power:winner==='A'?8e6:10000})),defenderCards:cards.map(c=>({...c,power:winner==='B'?8e6:10000})),attackerMercenary:mercenaries[i],defenderMercenary:mercenaries[2-i],seed:81+i});assert.equal(battleV2.result.winner,winner);return {number:i+1,winner,score:{...score},attacker:publicCards[i],defender:publicCards[2-i],battleV2};});
 const series={version:'ranked-series-20261019',winsRequired:2,winner:'A',score,rounds};
 const roster=()=>({cards:state==='insufficient'?publicCards.slice(0,2):publicCards,codes:savedCodes,revision,ready:savedCodes.length===3,ownedCount:state==='insufficient'?2:4});
 page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-ranked-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
 await page.route('**/api/**',route=>{
  const key=new URL(route.request().url()).pathname.slice(5);requests.push(key);const body=route.request().postDataJSON?.()||{};
  if(key==='pvp/series-roster'){savedCodes=body.codes;revision++;}
  const energy={enabled:true,unlimited:false,energy:state==='empty'?0:10,maxEnergy:10,costPerBattle:1,rechargeMinutes:5};
  const data={
   'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},
   'pvp/config':{settings:{enabled:true,seasonName:'시즌 19',tiers:[],startsAt:'2026-01-01 00:00:00',endsAt:'2027-01-01 00:00:00'},rankedSeries:roster(),deck:cards.map(c=>c.id),energy,profile:{season_score:1000,tier:{id:'bronze',name:'브론즈',min:0}},deckRules:{deckSize:5,gradeLimits:{FUR:2,ZENITH:2,SUPERSTAR:1}},battleSettings:{},battleEngine:{active:true,version:'V3',mode:'V3'},serverNow:new Date().toISOString()},
   'pvp/series-roster':{ok:true,rankedSeries:roster()},
   'pvp/match':{token:'fixture-'+width,opponent:{id:999,nickname:'대전 상대'},series:{attacker:savedCodes.map(c=>publicCards.find(m=>m.code===c)),opponent:[...publicCards.slice(0,3)].sort((a,b)=>a.code.localeCompare(b.code)),opponentOrderHidden:true}},
   'pvp/fight':{result:'WIN',battleV2:rounds.at(-1).battleV2,rankedSeries:replay?rankedSeriesReceipt(series):series,replayed:replay,scoreAfter:1024,scoreChange:24,coinReward:250000,coinAfter:350000,opponent:'대전 상대',energy:{...energy,energy:9},serverNow:new Date().toISOString()}
  }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return route.fulfill({status:200,json:data});
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>{pvpState.tab='match';renderShell('pvp');});await page.locator('#rsSelect0').waitFor();
 assert.equal(await page.locator('#rankedMatchStart').isDisabled(),true);assert.match(await page.locator('#rsNotice').innerText(),/현재 2종/);await page.screenshot({path:path.join(out,`insufficient-${width}.png`),fullPage:true});
 state='open';await page.evaluate(()=>loadPvpView());
 for(let i=0;i<3;i++)await page.locator('#rsSelect'+i).selectOption(codes[i]);
 assert.equal(await page.locator('#rsSelect1 option[value="'+codes[0]+'"]').isDisabled(),true);assert.equal(await page.locator('#rankedMatchStart').isDisabled(),true);
 await page.locator('[data-rs-move="1:0"]').click();await page.locator('#rsSave').click();await page.locator('#rankedMatchStart:not([disabled])').waitFor();assert.deepEqual(savedCodes,[codes[1],codes[0],codes[2]]);
 await page.locator('.rs-console').evaluate(el=>el.scrollIntoView({block:'start'}));const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);await page.locator('.rs-console').screenshot({path:path.join(out,`match-${width}.png`)});if(process.argv.includes('--layout-only')){reports.push({width,overflow});await page.close();continue;}
 await page.evaluate(async()=>{await ensureFeatureResources('battleV2');window.__rankedRounds=[];const original=window.playPvpBattleV2Live;window.playPvpBattleV2Live=async options=>{__rankedRounds.push({stage:options.stage.id,result:options.data.result});return original(options);};});
 await page.locator('#rankedMatchStart').click();await page.locator('.rs-match-reveal').waitFor();assert.match(await page.locator('.rs-match-reveal').innerText(),/순서 비공개/);await page.screenshot({path:path.join(out,`opponent-${width}.png`)});await page.locator('#rsBegin').click();
 await page.locator('.rs-battle-progress').waitFor();await page.screenshot({path:path.join(out,`battle-${width}.png`)});
 await page.locator('#pvpResultConfirm').waitFor({timeout:180000});assert.equal((await page.evaluate(()=>__rankedRounds)).length,rounds.length);assert.match(await page.locator('.rs-final-score').innerText(),width===1440?/2 : 0/:/2 : 1/);assert.equal(requests.filter(k=>k==='pvp/fight').length,1);await page.screenshot({path:path.join(out,`result-${width}.png`)});await page.locator('#pvpResultConfirm').click();
 state='empty';await page.evaluate(()=>loadPvpView());assert.equal(await page.locator('#rankedMatchStart').isDisabled(),true);
 replay=true;await page.evaluate(async()=>{await fightPvpV2Live({id:999,target:{nickname:'대전 상대'},mine:[],pvpPreviewPower:0,matchToken:'receipt-fixture'});});await page.locator('#pvpReceiptClose').waitFor();assert.match(await page.locator('.ranked-receipt-result').innerText(),/세트 결과/);await page.screenshot({path:path.join(out,`receipt-${width}.png`)});
 assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);reports.push({width,rounds:rounds.length,overflow,errors,requests:requests.filter(k=>k.startsWith('pvp/'))});await page.close();
}}catch(error){for(const c of browser.contexts())for(const page of c.pages()){console.log(await page.evaluate(()=>({text:document.body.innerText.slice(-2500),rounds:window.__rankedRounds})));await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});}throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));}
