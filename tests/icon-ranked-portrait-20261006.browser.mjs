import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {ICON_LIVE_CARDS} from '../shared/icon-fusion-policy-v1.mjs';

// Exercise the real app and its complete stylesheet cascade with local API data.
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.ICON_PORTRAIT_QA_DIR;
if(out)fs.mkdirSync(out,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const icons=ICON_LIVE_CARDS.map(c=>({...c,id:c.cardId,title:c.name,rarity:'ICON',image:c.sourceArt,image_url:c.sourceArt,power:180000,baseBattlePower:180000,powerType:'DEFENSE'}));
const fur=JSON.parse(fs.readFileSync(new URL('../assets/ui/project-v/characters/fur/manifest-v1.json',import.meta.url))).characters[1];
const cards=[...icons,{id:fur.cardId,title:fur.title,name:fur.member,rarity:'FUR',image:fur.sourceArt,image_url:fur.sourceArt,power:195200,baseBattlePower:195200,powerType:'ATTACK'}];
const deck=[fur.cardId,icons[5].id,icons[0].id,'',''];
const user={id:4242,serverUserId:4242,nickname:'ICON 이미지 검수',role:'USER',coin:100000,masterStars:0,cardShards:0,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:{[fur.cardId]:15},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\/+/,'' )||'index.html');
 if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,results=[];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{for(const width of [390,1440]){
 const errors=[],page=await browser.newPage({viewport:{width,height:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
 page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-ranked-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
 await page.route('**/api/**',route=>{
  const key=new URL(route.request().url()).pathname.slice(5);
  const data={
   'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards},packs:{packs:[]},messages:{messages:[],unread:0},
   'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},
   'pvp/config':{settings:{enabled:true,status:'진행 중',seasonName:'ICON 이미지 검수',tiers:[]},deck,energy:{enabled:true,energy:10,maxEnergy:10,costPerBattle:1},profile:{season_score:1000,tier:{id:'bronze',name:'브론즈',min:0}},deckRules:{deckSize:5,gradeLimits:{ICON:2,FUR:2}},battleSettings:{},battleEngine:{active:true,version:'V3',mode:'V3'},serverNow:new Date().toISOString()}
  }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
  return route.fulfill({status:200,json:data});
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof renderShell==='function'&&window.IconFusion);
 await page.evaluate(()=>{pvpState.tab='deck';renderShell('pvp');});
 await page.locator('#pvpDeckSlots .icon-live-card').first().waitFor();
 const portraits=[];
 // Start with the reported cropped portrait; also cover the six regular photos.
 for(const source of [icons[5],...icons.filter(c=>c!==icons[5])]){
  await page.evaluate(id=>{pvpState.deck[1]=id;renderPvpDeckSlots();},source.id);
  const card=page.locator('#pvpDeckSlots .icon-live-card').first();
  await card.scrollIntoViewIfNeeded();
  await card.evaluate(async card=>{await Promise.all([...card.querySelectorAll('img')].map(img=>img.decode()));});
  const geometry=await card.evaluate(card=>{
   const portrait=card.querySelector('.icon-live-portrait'),art=card.querySelector('.icon-live-art'),img=art.matches('img')?art:art.querySelector('img'),frame=card.querySelector('.icon-live-frame');
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};},ir=img.getBoundingClientRect(),ar=art.getBoundingClientRect();
   const coverage=Math.max(0,Math.min(ir.right,ar.right)-Math.max(ir.left,ar.left))*Math.max(0,Math.min(ir.bottom,ar.bottom)-Math.max(ir.top,ar.top))/(ar.width*ar.height);
   return {id:card.dataset.id,portrait:rect(portrait),art:rect(art),image:rect(img),frame:rect(frame),coverage,natural:[img.naturalWidth,img.naturalHeight],objectFit:getComputedStyle(img).objectFit};
  });
  assert.equal(geometry.id,source.id);
  assert.ok(geometry.natural.every(n=>n>0),source.name+' photo loads');
  assert.ok(geometry.coverage>.999,source.name+' photo covers the portrait window');
  for(const dimension of ['x','y','width','height'])assert.ok(Math.abs(geometry.frame[dimension]-geometry.portrait[dimension])<1,source.name+' frame aligns with portrait: '+dimension);
  assert.ok(geometry.art.x>=geometry.portrait.x&&geometry.art.y>=geometry.portrait.y);
  assert.ok(geometry.art.x+geometry.art.width<=geometry.portrait.x+geometry.portrait.width+1);
  assert.ok(geometry.art.y+geometry.art.height<=geometry.portrait.y+geometry.portrait.height+1);
  if(source.sourceCrop)assert.ok(Math.abs(geometry.image.width/geometry.image.height-source.sourceWidth/source.sourceHeight)<.001,'cropped source keeps original aspect ratio');
  else assert.equal(geometry.objectFit,'cover');
  portraits.push(geometry);
  if(out&&source.sourceCrop)await page.screenshot({path:path.join(out,`ranked-${width}.png`)});
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 assert.deepEqual(errors,[]);results.push({width,portraits,errors});await page.close();
 console.log(`ICON ranked portraits: ${width}px, all 7 photos and frames passed`);
}}finally{
 if(out)fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
