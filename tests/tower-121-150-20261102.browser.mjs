import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {jointFixture} from './helpers/joint-db.mjs';
import {operatingTowerFixture} from './helpers/tower-live-route.mjs';
import {fixture,plan,reviewSnapshot,REVIEW} from './helpers/tower-expansion-20261102.mjs';
import {DUAL_REVIEW_CARDS} from '../functions/_companion_preparation.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.TOWER_COOP_QA_OUT||path.join(root,'docs/qa/tower-121-150-20261102/browser'));fs.mkdirSync(out,{recursive:true});
const profiles=new Map(),missing=[],cache=new Map();
async function profile(key){
 if(!profiles.has(key))profiles.set(key,(async()=>{
  const f=await jointFixture();f.setPower(1000000);const base=f.deps.raidDeckPower,party=reviewSnapshot();
  f.deps.raidDeckPower=async(...args)=>{const d=await base(...args);return {...d,cards:d.cards.map((c,i)=>({...c,image:DUAL_REVIEW_CARDS[i].image})),mercenaries:party.mercenaries};};
  const tower=await operatingTowerFixture(f,{floorNo:121,maxFloor:120,monsterPower:1800000000,rewardCoin:4000000000000});
  for(const m of fixture.monsters.filter(m=>[64,67,68,69,17,18].includes(Number(m.id))))await f.p('INSERT INTO battle_monsters(id,name,image_url,battle_power,is_boss) VALUES(?,?,?,?,?)',Number(m.id),m.name,m.image_url,Number(m.battle_power),Number(m.is_boss)).run();
  for(const r of plan.floors)await f.p('INSERT INTO tower_floor_ranges(id,season_id,start_floor,end_floor,reward_coin,monster_id,is_active,power_override,is_boss) VALUES(?,1,?,?,?,?,1,?,?)',5000+r.floor,r.floor,r.floor,r.coin,r.monsterId,r.power,r.boss).run();
  return {f,tower,cards:(await f.deps.raidDeckPower(f.env,7,null,'TOWER')).cards};
 })());return profiles.get(key);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local'),match=/^\/qa-api\/([^/]+)\/(.+)$/.exec(url.pathname);
 if(match){
  const {f,tower,cards}=await profile(match[1]);f.setClock(Date.now());res.setHeader('content-type','application/json');
  if(match[2]==='fixture')return res.end(JSON.stringify({cards}));
  if(match[2]==='audit')return res.end(JSON.stringify({coin:await f.coin(),progress:await f.p('SELECT current_floor,highest_floor FROM tower_user_progress WHERE user_id=7').first(),grants:Number((await f.p('SELECT COUNT(*) AS n FROM coin_logs WHERE user_id=7').first()).n)}));
  if(match[2]==='set-floor'){await tower.setFloor(Number(url.searchParams.get('floor')));return res.end('{}');}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
  const response=await tower.handle(match[2],new Request('https://game.example/api/'+match[2],{method:req.method,headers:{authorization:'Bearer local-account-7',origin:'https://game.example','content-type':'application/json'},...(body?{body}:{})}));
  res.statusCode=response.status;return res.end(await response.text());
 }
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root+path.sep))return res.writeHead(403).end();
 let data;if(fs.existsSync(target))data=fs.readFileSync(target);else{
  if(!cache.has(target)){try{cache.set(target,execFileSync('git',['show','HEAD:'+path.relative(root,target).replaceAll('\\','/')],{cwd:root,windowsHide:true,maxBuffer:40e6,stdio:['ignore','pipe','ignore']}));}catch{missing.push(url.pathname);return res.writeHead(404).end();}}
  data=cache.get(target);
 }
 if(url.pathname.endsWith('/docs/qa/tower-clock-auto-next-20261022/index.html'))data=Buffer.from(data.toString().replace('무한의탑 120층','무한의탑 121~150층').replace('도전 버튼 계정 연결 검수','121~150층 확장 검수'));
 res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
}catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(45000);
  const key='tower-'+width;
  await page.goto(origin+'/docs/qa/tower-clock-auto-next-20261022/index.html?pve=tower&profile='+key);
  await page.locator('[data-abyss-action="fight"]').waitFor();
  await page.locator('[data-abyss-action="guide"]').click();assert.match(await page.locator('[data-abyss-guide]').innerText(),/150층까지/);
  await page.locator('[data-abyss-guide] [data-abyss-action="guide"]').click();
  await page.screenshot({path:path.join(out,width+'-121-entry.png'),fullPage:true});
  for(const floor of [121,150]){
   if(floor===150){await page.request.get(origin+'/qa-api/'+key+'/set-floor?floor=150');await page.locator('#pveTowerView [data-abyss-action="refresh"]').click();await page.waitForFunction(()=>document.querySelector('.abyss-seal span')?.textContent==='150');}
   assert.match(await page.locator('.abyss-reward').innerText(),new RegExp(plan.floors.find(r=>r.floor===floor).coin.toLocaleString('ko-KR')));
   await page.locator('[data-abyss-action="fight"]').click();await page.locator('[data-continuous-pause]:enabled').waitFor();
   await page.locator('[data-continuous-pause]').click();
   assert.equal(await page.locator('#modal canvas').count(),1);
   await page.screenshot({path:path.join(out,width+'-'+floor+'-battle.png')});
   await page.locator('[data-continuous-pause]').click();
   await page.locator('.is-abyss-result .abyss-earned').waitFor({state:'visible',timeout:180000});
   const reward=await page.locator('.abyss-earned strong').innerText();assert.equal(reward,plan.floors.find(r=>r.floor===floor).coin.toLocaleString('ko-KR'));
   await page.screenshot({path:path.join(out,width+'-'+floor+'-result.png'),fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
   await page.locator('.is-abyss-result [data-abyss-action="return"]').click();
   await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));
   reports.push({width,floor,reward,canvas:1,overflow});console.log(JSON.stringify({width,floor,stage:'complete-and-return'}));
  }
  await page.locator('#pveTowerView [data-tab="challenge"]').click();assert.match(await page.locator('.abyss-focus').innerText(),/모든 문을 돌파/);
  const audit=await(await page.request.get(origin+'/qa-api/'+key+'/audit')).json();assert.equal(audit.progress.current_floor,151);assert.equal(audit.grants,2);assert.deepEqual(errors,[]);
  reports.push({width,audit,errors});await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({status:'HEADLESS_LOCAL_ONLY',reports,missing},null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));for(const value of profiles.values())(await value).f.close();}
