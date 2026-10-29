// Loopback UI regression with synthetic accounts; never calls production APIs.
// Optional production static files are read through the local server only.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blackwingLiveFixture } from './helpers/blackwing-live-fixture.mjs';


import {room,debt,hearts,sever,damage,ward,action,scale,solveViews,members,play} from './helpers/blackwing-scale-scenario.mjs';
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


function scenarios(){
 const r=room(123),states={};scale(r);states.debt=structuredClone(r);debt(r);states.damage=structuredClone(r);damage(r);
 scale(r);states.hearts=structuredClone(r);hearts(r);damage(r);scale(r);states.sever=structuredClone(r);sever(r,'WING');damage(r);
 scale(r);states.sanctuary=structuredClone(r);for(const w of [0,1,0])ward(r,w);damage(r);scale(r);states.final=structuredClone(r);return states;
}
const snapshots=scenarios();snapshots.clear=play(123,'WING');
async function seed(roomId,key){
 const r=structuredClone(snapshots[key]),shift=Date.now()-r.clock;
 function move(o){for(const[k,v]of Object.entries(o)){if(v&&typeof v==='object')move(v);else if(Number.isFinite(v)&&['clock','createdAt','startedAt','endsAt','finishedAt','at','deadline','opensAt','closesAt','firstAt','breathAt','pressureAt','healReadyAt','pausedAt','firstLockAt'].includes(k))o[k]=v+shift;}}
 move(r);r.id=roomId;r.challenge.id=roomId+':'+key;r.releaseMode='TEST';r.lobbyEndsAt=Date.now()+900000;r.settingsRevision=1;r.endsAt=Date.now()+300000;r.challenge.deadline=Date.now()+90000;r.challenge.pressureAt=Date.now()+60000;
 if(r.challenge.debt){r.challenge.debt.opensAt=Date.now()+45000;r.challenge.debt.closesAt=Date.now()+60000;}if(r.challenge.breathAt)r.challenge.breathAt=Date.now()+60000;
 await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=?,status=? WHERE room_id=?',JSON.stringify(r),r.status,roomId);
}
const cases=[['debt','1','CHARGE',null],['damage','1','STRIKE',null],['hearts','7','ARM',0],['sever','7','VOTE','WING'],['sanctuary','3','WARD',1],['final','1','CHARGE',null],['clear','3',null,null]];
try{
 for(const[width,height]of JSON.parse(process.env.BLACKWING_PHASE_SIZES||'[[1440,1000],[390,844]]'))for(const[key,actor,actionName,target]of cases.filter(c=>!process.env.BLACKWING_PHASE_CASES||process.env.BLACKWING_PHASE_CASES.split(',').includes(c[0]))){
  const roomId=await lich.party();for(const[id]of members)await lich.command('ready',{roomId,ready:true},Number(id));await lich.command('start',{roomId});await seed(roomId,key==='clear'?'damage':key);
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  await context.addInitScript(({user,actor})=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify({...user,id:Number(actor),serverUserId:Number(actor)}));localStorage.setItem('cnine_card_api_token','local-qa-'+actor);localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');for(const id of [1,2,3,6,7,8])localStorage.setItem('cnine_soop_watch_notice:20261026-v1:'+id,'shown');},{user,actor});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',d=>d.accept());page.setDefaultTimeout(30000);
  try{
   await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));await page.locator('[data-pve-mode="raid"]').click();await page.locator('#blackwingRaidTab').click();await page.waitForFunction(()=>globalThis.BlackwingRaidDiagnostics?.().battle.ready,{},{timeout:90000});
   if(key==='clear'){
    await seed(roomId,'clear');await page.locator('.bw-result').waitFor();assert.equal(await page.locator('.bw-arena').isVisible(),false);const buttons=await page.locator('.bw-result>button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};}));assert.ok(buttons.every(b=>b.height>=44));assert.ok(buttons[1].top-buttons[0].bottom>=12);await page.locator('.bw-result [data-log-open]').click();await page.locator('[data-log-close]').click();await page.screenshot({path:path.join(out,key+'-'+width+'.png'),fullPage:true});reports.push({key,width,resultReachable:true,errors});continue;
   }
   if(key==='sanctuary'){
    const saved=JSON.parse((await lich.one('SELECT state_json FROM raid_blackwing_rooms_v1 WHERE room_id=?',roomId)).state_json);saved.challenge.breathAt=Date.now()+3500;saved.revision++;await lich.run('UPDATE raid_blackwing_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(saved),roomId);
   }
   const selector='[data-action="'+actionName+'"]'+(target!==null?'[data-target="'+target+'"]':'');const button=page.locator(selector);await page.waitForFunction(selector=>{const b=document.querySelector(selector);return b&&!b.disabled;},selector);
   await page.screenshot({path:path.join(out,key+'-'+width+'.png'),fullPage:true});
   const geometry=await page.evaluate(()=>{const field=document.querySelector('.bw-field').getBoundingClientRect(),dock=document.querySelector('.battle-v3-dock').getBoundingClientRect();return [...document.querySelectorAll('.bw-field-objects [data-action]')].map(b=>{const r=b.getBoundingClientRect();return {action:b.dataset.action,x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,fieldBottom:field.bottom,dockTop:dock.top};});});
   for(const b of geometry){assert.ok(b.width>=44&&b.height>=44);assert.ok(b.x>=0&&b.right<=width);assert.ok(b.bottom<=b.dockTop,'object above roster: '+JSON.stringify(b));}
   if(key==='sever'){const a=geometry.find(b=>b.action==='VOTE'),b=geometry.filter(b=>b.action==='VOTE')[1];assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'wing and blade hit areas must not overlap');}
   const before=await page.evaluate(()=>BlackwingRaidDiagnostics().state.revision);await button.click();await page.waitForFunction(({actionName,before})=>{const d=BlackwingRaidDiagnostics();return d.state.revision>before&&d.logEntries.some(e=>e.action===actionName&&e.outcome==='SUCCESS');},{actionName,before});
   assert.deepEqual(errors,[]);reports.push({key,width,actor,actionName,geometry,errors});console.log(key+' '+width+' '+actionName+' accepted');
  }catch(e){await page.screenshot({path:path.join(out,'failure-'+key+'-'+width+'.png'),fullPage:true});fs.writeFileSync(path.join(out,'failure-'+key+'-'+width+'.json'),JSON.stringify({error:e.stack,errors,diagnostics:await page.evaluate(()=>globalThis.BlackwingRaidDiagnostics?.()),body:await page.locator('body').innerText()},null,2));throw e;}
  finally{await context.close();for(const[id]of members)await lich.command('leave',{roomId},Number(id));}
 }
 fs.writeFileSync(path.join(out,process.env.BLACKWING_PHASE_REPORT||'browser-phases.json'),JSON.stringify({reports},null,2));
}finally{await browser.close();server.close();await lich.close();}
