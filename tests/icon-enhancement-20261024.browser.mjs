// Existing live card detail and OWNER CMS, with isolated SQLite account data.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {iconFusionFixture} from './helpers/icon-fusion-db.mjs';
import {ICON_ROLES,defaultIconRoles} from '../shared/icon-roles-v1.mjs';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';
import {ICON_ENHANCEMENT_KEY as KEY,defaultIconEnhancementSettings} from '../shared/icon-enhancement-v1.mjs';
import {handleIconEnhancement} from '../functions/_icon_enhancement.js';
const imported=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'),{chromium}=imported.default||imported;
const root=process.cwd(),out=process.env.ICON_ENHANCEMENT_QA_OUT;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try{for(const width of [1440,390,320]){
  const f=await iconFusionFixture(),card={...ICON_LIVE_CARDS[0],id:ICON_LIVE_CARDS[0].cardId,image:ICON_LIVE_CARDS[0].sourceArt,title:ICON_LIVE_CARDS[0].name,grade:'ICON'},cardId=card.id;
  await f.p('INSERT INTO user_cards(user_id,card_id,quantity,breakthrough_level) VALUES(7,?,1,0)',cardId).run();
  const cfg={revision:1,enabled:true,steps:Array.from({length:10},()=>({masterStarCost:100,coinCost:1000000000}))};await f.setting(KEY,cfg);
  const user={id:7,serverUserId:7,nickname:'아이콘 강화 검수',role:'OWNER',coin:1500000000000,masterStars:15000000,pigCoin:0,owned:[cardId],quantities:{[cardId]:1},breakthroughs:{[cardId]:0},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
  const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});await page.addInitScript(u=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),key=url.pathname.slice(5);if(['POST','PATCH'].includes(req.method()))writes.push({key,body:req.postDataJSON()});
    if(key.startsWith('icons/enhancement')||key==='admin/icons/enhancement'){
      const request=new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),response=await handleIconEnhancement({path:key,request,env:f.env,deps:{...f.deps,requirePermission:async()=>f.user}});return route.fulfill({status:response.status,body:await response.text(),headers:{'content-type':'application/json'}});
    }
    let data={ok:true};
    if(['me','me/summary','me/collection'].includes(key)){const state=await f.snapshot(),level=state.cards.find(c=>c.card_id===cardId).breakthrough_level;Object.assign(user,{coin:state.coin,masterStars:state.stars,breakthroughs:{[cardId]:level}});data=key==='me/collection'?{collection:user}:{user,prison:{incarcerated:false}};}
    else if(key==='admin/mercenaries/opening')data={mode:'OFF',ready:false,rankCounts:{},blockers:[],revision:0};
    else if(key==='cards')data={cards:[card]};
    else if(key==='icons/roles')data={revision:1,document:defaultIconRoles()};
    return route.fulfill({json:data});
  });
  try{
    await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.IconRoles&&typeof loadUser==='function');
    await page.evaluate(c=>IconRoles.open(c),card);await page.locator('[data-ie-attempt]:not([disabled])').waitFor();
    assert.match(await page.locator('.ie-power').innerText(),/180,000[\s\S]*216,000/);
    assert.equal(await page.locator('.ie-panel').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);
    await page.locator('.ie-panel').screenshot({path:path.join(out,`${width}-card.png`)});
    await page.locator('[data-ie-attempt]').click();await page.locator('.ie-result').waitFor();
    const submitted=writes.find(x=>x.key==='icons/enhancement/attempt');assert.ok(submitted);assert.equal(submitted.body.expectedLevel,0);
    const after=await f.snapshot();assert.equal(after.coin,1499000000000);assert.equal(after.stars,14999900);
    await page.locator('.ie-panel').screenshot({path:path.join(out,`${width}-result.png`)});
    await page.locator('.ir-close').click();await page.evaluate(c=>IconRoles.open(c),card);await page.locator('[data-ie-attempt]:not([disabled])').waitFor();assert.equal(writes.filter(x=>x.key==='icons/enhancement/attempt').length,1);
    await page.locator('.ir-close').click();
    // Exercise the actual CMS editor component in isolation from unrelated CMS data.
    await page.goto(origin+'/admin/',{waitUntil:'domcontentloaded'});
    await page.evaluate(async()=>{const root=document.createElement('main');root.id='iconEnhancementQaHost';root.style.maxWidth='1100px';root.style.margin='20px auto';document.body.replaceChildren(root);const {mountIconEnhancementSettings}=await import('/admin/icon-enhancement-admin-v1.mjs');mountIconEnhancementSettings(root);});
    await page.locator('[data-ie-save]:not([disabled])').waitFor();assert.equal(await page.locator('[data-ie-level]').count(),10);
    await page.locator('[data-ie-enabled]').uncheck();await page.locator('[data-ie-level="9"] [data-ie-coins]').fill('');await page.locator('[data-ie-save]').click();await page.locator('[data-ie-status]').filter({hasText:'저장 버전 2'}).waitFor();
    const stored=JSON.parse((await f.p('SELECT value FROM app_meta WHERE key=?',KEY).first()).value);assert.equal(stored.enabled,false);assert.equal(stored.steps[9].coinCost,null);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.screenshot({path:path.join(out,`${width}-cms.png`),fullPage:true});
    assert.deepEqual(errors,[]);
    report.push({width,cardDetail:true,purchase:true,chargedOnce:true,cmsSaved:true,nullableCosts:true,overflow:false,pageErrors:errors,attempts:writes.filter(x=>x.key==='icons/enhancement/attempt').length});
  }finally{await context.close();await f.close();}
}}finally{await browser.close();server.close();}
fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
