// Loopback UI regression with synthetic accounts; never calls production APIs.
// Optional production static files are read through the local server only.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blackwingLiveFixture } from './helpers/blackwing-live-fixture.mjs';


import {room,debt,hearts,sever,damage,ward,action,scale,solveViews,members} from './helpers/blackwing-scale-scenario.mjs';
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
    if(!fs.existsSync(file)){const fallback=path.resolve('C:/Users/User/Downloads/cnine-avatar-bongsoon-20260919/site','.'+decodeURIComponent(url.pathname));if(fs.existsSync(fallback))file=fallback;else{res.writeHead(404);return res.end();}}
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
 const r=room(123);scale(r);debt(r);damage(r);scale(r);hearts(r);damage(r);scale(r);sever(r,'WING');damage(r);
 const shift=Date.now()-r.clock;
 function move(o){for(const[k,v]of Object.entries(o)){if(v&&typeof v==='object')move(v);else if(Number.isFinite(v)&&['clock','createdAt','startedAt','endsAt','finishedAt','at','deadline','opensAt','closesAt','firstAt','breathAt','pressureAt','healReadyAt','pausedAt','firstLockAt'].includes(k))o[k]=v+shift;}}
 move(r);r.id=roomId;r.challenge.id=roomId+':3';r.releaseMode='TEST';r.lobbyEndsAt=Date.now()+900000;r.settingsRevision=1;
 // Synthetic room allows the renderer to load before restoring the actual 22s
 // planning window. Real API checks and the 6s commit window are unchanged.
 r.endsAt=Date.now()+300000;r.challenge.scale.deadline=Date.now()+90000;r.challenge.pressureAt=Date.now()+60000;
 await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=?,status=? WHERE room_id=?',JSON.stringify(r),'ACTIVE',roomId);
}
const enter=async page=>{
 await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
 await page.locator('[data-pve-mode="raid"]').click();await page.locator('#blackwingRaidTab').click();
 await page.locator('.bw-scale-weight').waitFor();
 await page.waitForFunction(()=>globalThis.BlackwingRaidDiagnostics?.().battle.ready,{},{timeout:90000});
};
try{
 const sizes=process.env.BLACKWING_PUBLIC_ONLY==='1'?[[390,844]]:[[1440,1000],[390,844]];
 const actors=process.env.BLACKWING_PUBLIC_ONLY==='1'||process.env.BLACKWING_GUARD_ONLY==='1'?['3']:['1','3','7'];
 for(const[width,height]of sizes)for(const actor of actors){
  const roomId=await lich.party();for(const[id]of members)await lich.command('ready',{roomId,ready:true},Number(id));await lich.command('start',{roomId});await seedPhase4(roomId);
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block',acceptDownloads:true});
  await context.addInitScript(({user,actor})=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify({...user,id:Number(actor),serverUserId:Number(actor),nickname:'참가자 '+actor}));localStorage.setItem('cnine_card_api_token','local-qa-'+actor);localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');for(const id of [1,2,3,6,7,8])localStorage.setItem('cnine_soop_watch_notice:20261026-v1:'+id,'shown');},{user,actor});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000);
  try{
   await enter(page);
   await page.waitForFunction(()=>{const images=[...document.querySelectorAll('[data-action="PLACE"] img')];return images.length===3&&images.every(img=>img.complete&&img.naturalWidth>0);});
   await page.locator('.bw-field-help summary').click();await page.waitForTimeout(1100);assert.equal(await page.locator('.bw-field-help').evaluate(el=>el.open),true,'rules stay open across clock and polling');await page.locator('.bw-field-help summary').click();
   let saved=JSON.parse((await lich.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);
   saved.challenge.scale.deadline=Date.now()+22000;saved.challenge.pressureAt=Date.now()+5000;saved.revision++;
   await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(saved),roomId);
   const vv=await Promise.all(members.map(async([id])=>(await lich.call('state?roomId='+roomId,{user:Number(id)})).body.state));
   const solution=solveViews(vv)[0],mine=vv.find(v=>v.me.id===actor);
   assert.ok(solution);assert.equal(await page.locator('[data-action="PLACE"]:not([disabled])').count(),3);
   assert.match(await page.locator('.bw-scale-weight').innerText(),new RegExp(String(mine.challenge.scale.ownWeight)));
   const oldPad=mine.challenge.scale.previous;
   const button=page.locator('[data-action="PLACE"][data-target="'+oldPad+'"]'),identity=await button.elementHandle();
   await page.waitForTimeout(250);assert.equal(await identity.evaluate(el=>el===document.querySelector('[data-action="PLACE"][data-target="'+el.dataset.target+'"]')),true);
   await button.click();await page.waitForFunction(({actor,oldPad})=>BlackwingRaidDiagnostics().state.challenge.scale.members.find(m=>m.id===actor).position===oldPad,{actor,oldPad});
   assert.equal((await lich.call('state?roomId='+roomId,{user:Number(actor)})).body.state.strain,0,'placement is editable until commitment');
   for(const[id]of members.filter(([id])=>id!==actor))await apiAction(roomId,id,'PLACE',solution[id]);
   await page.locator('[data-action="PLACE"][data-target="'+solution[actor]+'"]').click();
   await page.waitForFunction(({actor,pad})=>BlackwingRaidDiagnostics().state.challenge.scale.members.find(m=>m.id===actor).position===pad,{actor,pad:solution[actor]});
   const geometry=await page.evaluate(()=>{const a=document.querySelector('.bw-field').getBoundingClientRect(),b=document.querySelector('.bw-battle-mount').getBoundingClientRect(),c=document.querySelector('.bw-combat');const pads=[...document.querySelectorAll('[data-action="PLACE"]')].map(p=>{const r=p.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});return {field:{x:a.x,y:a.y,width:a.width,height:a.height},battle:{x:b.x,y:b.y,width:b.width,height:b.height},pads,sidebar:!!document.querySelector('.bw-command'),overflow:c.scrollWidth>c.clientWidth,canvases:c.querySelectorAll('canvas').length};});
   assert.equal(geometry.overflow,false);assert.equal(geometry.canvases,1);assert.equal(geometry.sidebar,false);assert.ok(geometry.battle.width>=width-16,'battle uses full width');for(const p of geometry.pads){assert.ok(p.x>=0&&p.right<=width);assert.ok(p.y>=geometry.battle.y&&p.bottom<=geometry.battle.y+geometry.battle.height);assert.ok(p.width>=44&&p.height>=44);}
   await page.screenshot({path:path.join(out,'scale-'+actor+'-'+width+'.png'),fullPage:true});
   const other=members.filter(([id])=>id!==actor);
   for(const[id]of other.slice(0,4))await apiAction(roomId,id,'LOCK');
   await page.locator('[data-action="LOCK"]:not([disabled])').click();
   await page.waitForFunction(actor=>BlackwingRaidDiagnostics().state.challenge.scale.members.find(m=>m.id===actor).locked,actor);
   await apiAction(roomId,other[4][0],'LOCK');
   await page.waitForFunction(()=>BlackwingRaidDiagnostics().state.challenge.scale.done);
   if(actor==='3'){
    saved=JSON.parse((await lich.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);
    saved.challenge.breathAt=Date.now()+4500;saved.revision++;await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(saved),roomId);
    await page.locator('[data-action="WARD"][data-target="0"]:not([disabled])').waitFor();await page.locator('[data-action="WARD"][data-target="0"]').click();
    await page.waitForFunction(()=>BlackwingRaidDiagnostics().state.challenge.breaths===1);
    for(const[id]of members)await apiAction(roomId,id,'PLACE',0);
    for(const[id]of members)await apiAction(roomId,id,'LOCK');
    await page.waitForFunction(()=>BlackwingRaidDiagnostics().state.strain===1);
    await page.locator('.bw-top [data-log-open]').click();await page.locator('[data-log-filter]').selectOption('ISSUES');
    await page.locator('[data-log-list]').filter({hasText:'용혈 저울 실패'}).waitFor();assert.match(await page.locator('[data-log-list]').innerText(),/참가자 1\(\d\).*목표/s);
    await page.screenshot({path:path.join(out,'log-'+width+'.png'),fullPage:true});
    const downloadEvent=page.waitForEvent('download');await page.locator('[data-log-download]').click();await (await downloadEvent).saveAs(path.join(out,'combat-'+width+'.txt'));
    await page.keyboard.press('Escape');assert.equal(await page.locator('.bw-log-panel').isVisible(),false);
    const before=(await lich.call('state?roomId='+roomId,{user:3})).body.state.challenge.scale;
    await enter(page);
    const after=await page.evaluate(()=>BlackwingRaidDiagnostics().state.challenge.scale);
    assert.equal(after.cycle,before.cycle);assert.equal(after.ownWeight,before.ownWeight);assert.deepEqual(after.goals,before.goals);
   }
   assert.deepEqual(errors,[]);reports.push({width,height,actor,role:mine.me.role,geometry,fieldImagesLoaded:true,personalClue:true,stableButtons:true,wrongChoiceEditable:true,sixPlayerCommit:true,logAndReconnect:actor==='3',errors});
  }catch(e){await page.screenshot({path:path.join(out,'failure-'+actor+'-'+width+'.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure-'+actor+'-'+width+'.json'),JSON.stringify({error:e.stack,errors,diagnostics:await page.evaluate(()=>globalThis.BlackwingRaidDiagnostics?.()),body:await page.locator('body').innerText()},null,2));throw e;}
  finally{await context.close();for(const[id]of members)await lich.command('leave',{roomId},Number(id));}
 }
 fs.writeFileSync(path.join(out,'browser-battlefield.json'),JSON.stringify({at:new Date().toISOString(),reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();server.close();await lich.close();}
