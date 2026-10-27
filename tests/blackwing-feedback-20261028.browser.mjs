// Loopback UI regression with synthetic accounts; never calls production APIs.
// Optional production static files are read through the local server only.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blackwingLiveFixture } from './helpers/blackwing-live-fixture.mjs';


import {room,debt,hearts,sever,damage,ward,action,oaths} from './helpers/blackwing-feedback-scenario.mjs';
import {blackwingView} from '../functions/_raid_blackwing.js';
import { REVIEW_DECK } from '../preview/lich-king-raid-v1/fixture.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const out=process.env.BLACKWING_QA_DIR;if(!out)throw Error('BLACKWING_QA_DIR is required outside the release tree');fs.mkdirSync(out,{recursive:true});
const staticOrigin=process.env.BLACKWING_STATIC_ORIGIN;
if(staticOrigin)assert.equal(new URL(staticOrigin).origin,'https://cnine-card.pages.dev');
const lich = await blackwingLiveFixture();
await lich.configure(process.env.BLACKWING_UI_ONLY==='1'?{enrageSeconds:300,mechanicTimePercent:100}:{enrageSeconds:600,mechanicTimePercent:200});
for(const [i,id] of [1,2,3,6,7,8].entries())lich.setDeck(id,{cards:[...REVIEW_DECK.slice(i%5),...REVIEW_DECK.slice(0,i%5)]});
const user = {id:1,serverUserId:1,nickname:'로컬 정벌 검수',role:'OWNER',coin:123456789,pigCoin:0,cardShards:12000,
  masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),
  breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const calls = [];
const server = http.createServer(async (req,res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const json = (data,status=200) => {res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if (url.pathname.startsWith('/api/')) {
      const key = url.pathname.slice(5), chunks=[]; for await(const chunk of req) chunks.push(chunk);
      calls.push(key);
      if (key.startsWith('raid/blackwing/') || key.startsWith('admin/raid/blackwing/')) {
        const body = Buffer.concat(chunks).toString();
        const request = new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        const response=await lich.handle(request);return json(await response.json(),response.status);
      }
      return json({
        'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},
        packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},
        'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
        'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
        'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]},
        'admin/dashboard':{role:'OWNER',admin:user,stats:{}},'admin/raid':{settings:{},bosses:[],current:null},
        'admin/raid/madara/settings':{settings:{mode:'OFF',testUserIds:[],weeklyRewardLimit:5},testUsers:[]},
        'admin/raid/lich/settings':{settings:{mode:'OFF',testUserIds:[],weeklyRewardLimit:7},testUsers:[]},
        'admin/mercenaries/opening':{mode:'OFF',rankCounts:{},ready:false},
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    if(staticOrigin){
      const response=await fetch(new URL(url.pathname+url.search,staticOrigin));
      res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/octet-stream','cache-control':'no-store'});
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)) {res.writeHead(403);return res.end();}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
    fs.createReadStream(file).pipe(res);
  } catch(error) {json({error:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});

const reports=[];
async function apiAction(roomId,id,action,target){
 const v=(await lich.call('state?roomId='+roomId,{user:Number(id)})).body.state;
 const result=await lich.command('action',{roomId,action,token:v.challenge.tokens[action],...(target!==undefined?{target:String(target)}:{})},Number(id));
 assert.equal(result.status,200,JSON.stringify(result));return result;
}
async function seedPhase4(roomId){
 const r=room();debt(r);damage(r);hearts(r);damage(r);sever(r,'WING');damage(r);
 const shift=Date.now()-r.clock;
 function move(o){for(const[k,v]of Object.entries(o)){if(v&&typeof v==='object')move(v);else if(Number.isFinite(v)&&['clock','createdAt','startedAt','endsAt','finishedAt','at','deadline','opensAt','closesAt','firstAt','breathAt','pressureAt','healReadyAt'].includes(k))o[k]=v+shift;}}
 move(r);r.id=roomId;r.challenge.id=roomId+':3';r.releaseMode='TEST';r.lobbyEndsAt=Date.now()+900000;r.settingsRevision=1;
 // Allow asset loading first, then install the real 3.5s input boundary below.
 r.challenge.pressureAt=Date.now()+60000;r.challenge.breathAt=Date.now()+65000;r.challenge.deadline=Date.now()+90000;
 await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=?,status=? WHERE room_id=?',JSON.stringify(r),'ACTIVE',roomId);
 return r;
}
try{
 for(const[width,height]of [[1440,1000],[390,844]]){
  const roomId=await lich.party();for(const[id]of [['1'],['2'],['3'],['6'],['7'],['8']])await lich.command('ready',{roomId,ready:true},Number(id));await lich.command('start',{roomId});
  await seedPhase4(roomId);
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',acceptDownloads:true});
  await context.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify({...user,id:3,serverUserId:3,nickname:'참가자 3',role:'USER'}));localStorage.setItem('cnine_card_api_token','local-qa-3');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000);
  try{
   await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));await page.locator('[data-pve-mode="raid"]').click();await page.locator('#blackwingRaidTab').click();
   await page.waitForFunction(()=>globalThis.BlackwingRaidDiagnostics?.().battle.ready,{},{timeout:90000});
   await apiAction(roomId,'1','CHARGE');
   for(const role of ['BREAKER','SEALER'])for(let n=0;n<2;n++){
    const v=(await lich.call('state?roomId='+roomId,{user:3})).body.state,o=v.challenge.oaths[role];await apiAction(roomId,o.order[o.progress],'RUNE',o.runes[o.progress]);
   }
   const saved=JSON.parse((await lich.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);
   saved.challenge.breathAt=Date.now()+5500;saved.challenge.pressureAt=Date.now()+1200;saved.revision++;await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(saved),roomId);
   await page.waitForFunction(()=>BlackwingRaidDiagnostics().state.challenge.oaths.SEALER.progress===2);
   const wardButton=page.locator('[data-action="WARD"][data-target="0"]');await wardButton.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-action="WARD"][data-target="0"]').disabled);
   const identity=await wardButton.elementHandle();await page.waitForTimeout(250);assert.equal(await identity.evaluate(el=>el===document.querySelector('[data-action="WARD"][data-target="0"]')),true,'clock/poll keeps the same button node');
   await wardButton.click();await page.waitForFunction(()=>BlackwingRaidDiagnostics().state.challenge.wardLocked===0||BlackwingRaidDiagnostics().state.challenge.breaths===1);
   const geometry=await page.evaluate(()=>{const a=document.querySelector('.bw-command').getBoundingClientRect(),b=document.querySelector('.bw-battle-mount').getBoundingClientRect(),c=document.querySelector('.bw-combat');return {command:{x:a.x,y:a.y,width:a.width,height:a.height},battle:{x:b.x,y:b.y,width:b.width,height:b.height},overflow:c.scrollWidth>c.clientWidth,canvases:c.querySelectorAll('canvas').length};});
   assert.equal(geometry.overflow,false);assert.equal(geometry.canvases,1);if(width>1000){assert.ok(geometry.command.x>=geometry.battle.x+geometry.battle.width-1);assert.ok(geometry.command.y<200);}
   await page.screenshot({path:path.join(out,'guard-'+width+'.png'),fullPage:true});
   await page.locator('.bw-top [data-log-open]').click();await page.locator('[data-log-list]').filter({hasText:'문양'}).waitFor();await page.locator('[data-log-filter]').selectOption('ISSUES');await page.locator('[data-log-list]').filter({hasText:'공유 문양판'}).waitFor();
   assert.match(await page.locator('[data-log-list]').innerText(),/참가자 1/);await page.screenshot({path:path.join(out,'log-'+width+'.png'),fullPage:true});
   const downloadEvent=page.waitForEvent('download');await page.locator('[data-log-download]').click();const download=await downloadEvent;await download.saveAs(path.join(out,'combat-'+width+'.txt'));assert.match(fs.readFileSync(path.join(out,'combat-'+width+'.txt'),'utf8'),/흑익 절단.*2.5초/);
   await page.keyboard.press('Escape');assert.equal(await page.locator('.bw-log-panel').isVisible(),false);assert.equal(await page.locator('.bw-combat').isVisible(),true);
   await page.waitForFunction(()=>BlackwingRaidDiagnostics().state.challenge.breaths===1);assert.equal(await page.locator('[data-action="WARD"][data-target="1"]').isDisabled(),true,'guard 2 owns the second breath');
   // Reconnect to the same persisted room and recover the cross-player record.
   await page.reload();await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));await page.locator('[data-pve-mode="raid"]').click();await page.locator('#blackwingRaidTab').click();await page.waitForFunction(()=>globalThis.BlackwingRaidDiagnostics?.().logEntries.some(e=>e.action==='WARD'));
   await page.locator('.bw-top [data-log-open]').click();await page.locator('[data-log-list]').filter({hasText:'성역 전개'}).waitFor();
   assert.deepEqual(errors,[]);const roleChecks=[];
   for(const[actor,role]of [['1','BREAKER'],['7','SEALER']]){
    await seedPhase4(roomId);
    const roleContext=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await roleContext.addInitScript(({user,actor})=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify({...user,id:Number(actor),serverUserId:Number(actor),nickname:'참가자 '+actor}));localStorage.setItem('cnine_card_api_token','local-qa-'+actor);localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},{user,actor});
    await roleContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const rolePage=await roleContext.newPage();rolePage.on('pageerror',e=>errors.push(e.stack));
    try{
     await rolePage.goto(origin+'/');await rolePage.waitForFunction(()=>typeof renderShell==='function');await rolePage.evaluate(()=>renderShell('battle'));await rolePage.locator('[data-pve-mode="raid"]').click();await rolePage.locator('#blackwingRaidTab').click();await rolePage.waitForFunction(()=>globalThis.BlackwingRaidDiagnostics?.().battle.ready,{},{timeout:90000});
     let view=(await lich.call('state?roomId='+roomId,{user:Number(actor)})).body.state,o=view.challenge.oaths[role];
     if(o.order[0]!==actor){await apiAction(roomId,o.order[0],'RUNE',o.runes[0]);view=(await lich.call('state?roomId='+roomId,{user:Number(actor)})).body.state;o=view.challenge.oaths[role];}
     const target=o.runes[o.progress],progress=o.progress;await rolePage.locator('[data-action="RUNE"][data-target="'+target+'"]:not([disabled])').waitFor();await rolePage.screenshot({path:path.join(out,role.toLowerCase()+'-'+width+'.png'),fullPage:true});
     await rolePage.locator('[data-action="RUNE"][data-target="'+target+'"]').click();await rolePage.waitForFunction(({role,progress})=>BlackwingRaidDiagnostics().state.challenge.oaths[role].progress>progress,{role,progress});roleChecks.push({role,ownRuneClick:true});
    }catch(e){await rolePage.screenshot({path:path.join(out,'failure-'+role+'-'+width+'.png'),fullPage:true});throw e;}finally{await roleContext.close();}
   }
   assert.deepEqual(errors,[]);reports.push({width,height,geometry,stableButton:true,wardSingleClick:true,sharedBoard:true,roleChecks,logFilter:true,download:true,reconnect:true,errors});
  }catch(e){await page.screenshot({path:path.join(out,'failure-'+width+'.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure-'+width+'.json'),JSON.stringify({error:e.stack,errors,diagnostics:await page.evaluate(()=>globalThis.BlackwingRaidDiagnostics?.()),body:await page.locator('body').innerText()},null,2));throw e;}
  finally{await context.close();await lich.command('leave',{roomId},3);for(const[id]of [['1'],['2'],['6'],['7'],['8']])await lich.command('leave',{roomId},Number(id));}
 }
 fs.writeFileSync(path.join(out,'browser-feedback.json'),JSON.stringify({at:new Date().toISOString(),reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();server.close();await lich.close();}
