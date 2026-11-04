// Actual inline client + raid API, isolated local accounts. No production writes.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {tickLichRoom} from '../functions/_raid_lich_king.js';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';

const playwright=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const assetRoot=process.env.LICH_QA_ASSET_ROOT||path.resolve(root,'../../..');
const out=process.env.LICH_QA_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'lich-mobile-'));
fs.mkdirSync(out,{recursive:true});
const baseline=process.env.LICH_MOBILE_BASELINE==='1';
const baselineCommit=process.env.LICH_QA_BASELINE_COMMIT||'';
assert.ok(!baselineCommit||/^[a-f0-9]{40}$/.test(baselineCommit));
const publicBase=process.env.LICH_QA_PUBLIC_BASE||'';
const h=await lichLiveFixture(),calls=[],reports=[],errors=[],knownMountWarnings=[],missing=new Set();
const mediaCache=new Map(),publicCache=new Map();
for(const id of [1,2,3]){
  const deck=accountDeck(id),second={...deck.mercenary,code:'V-005',id:'V-005',name:'검수 용병'};
  h.setDeck(id,{...deck,mercenaries:[deck.mercenary,second]});
}
const roomId=await h.party();
for(const id of [1,2,3])assert.equal((await h.command('ready',{roomId,ready:true},id)).status,200);
assert.equal((await h.command('start',{roomId})).status,200);
const read=async()=>JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
const write=room=>h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
const userFor=id=>({id,serverUserId:id,nickname:'모바일 검수 '+id,role:id===1?'OWNER':'USER',coin:123456789,cardShards:12000,masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true});
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(v,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(v));};
  try{
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      const body=Buffer.concat(chunks).toString();
      if(key.startsWith('raid/lich/')||key.startsWith('admin/raid/lich/')){
        if(key==='raid/lich/action')calls.push(JSON.parse(body));
        const response=await h.handle(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}));return json(await response.json(),response.status);
      }
      const user=userFor(Number(req.headers.authorization?.split('-').at(-1))||1);
      return json({'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:REVIEW_DECK},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'loot-shop/balance':{pigCoins:0},'live-operations':{serverNow:new Date().toISOString(),items:[]},'raid/status':{current:null,settings:{enabled:true},participants:[]},'raid/core/feature':{visible:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    if(baselineCommit&&['/index.html','/','/js/lich-king-raid-entry-v1.js','/raid/lich-king/inline.mjs','/raid/lich-king/inline.css','/raid/lich-king/','/preview/lich-king-raid-v1/battle.bundle.js','/preview/lich-king-raid-v1/mechanics.css'].includes(url.pathname)){
      const relative=url.pathname==='/'?'index.html':url.pathname.slice(1)+(url.pathname.endsWith('/')?'index.html':'');
      const bytes=execFileSync('git',['show',baselineCommit+':'+relative],{cwd:root,maxBuffer:32*1024*1024,windowsHide:true});
      res.writeHead(200,{'content-type':mime[path.extname(relative)],'cache-control':'no-store'});return res.end(bytes);
    }
    if(publicBase&&(/\.(?:html|js|mjs|css|json)$/.test(url.pathname)||url.pathname.endsWith('/'))){
      const key=url.pathname+url.search;
      if(!publicCache.has(key))publicCache.set(key,(async()=>{
        const r=await fetch(publicBase+key,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,key);
        return {type:r.headers.get('content-type'),bytes:Buffer.from(await r.arrayBuffer())};
      })());
      const asset=await publicCache.get(key);res.writeHead(200,{'content-type':asset.type,'cache-control':'no-store'});return res.end(asset.bytes);
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)&&/\.(png|webp|jpg|jpeg|svg|woff2?|ttf|mp3|ogg)$/.test(file)){
      const relative=path.relative(root,file).split(path.sep).join('/');file=path.join(assetRoot,relative);
      if(!fs.existsSync(file)){
        if(!mediaCache.has(relative)){
          try{mediaCache.set(relative,execFileSync('git',['-c','gc.auto=0','-c','maintenance.auto=false','show','HEAD:'+relative],{cwd:root,maxBuffer:32*1024*1024,stdio:['ignore','pipe','ignore']}));}catch{mediaCache.set(relative,null);}
        }
        const bytes=mediaCache.get(relative);if(bytes){res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});return res.end(bytes);}
      }
    }
    if(!fs.existsSync(file)){missing.add(url.pathname);res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(error){json({error:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browserName=process.env.LICH_QA_BROWSER||'chromium';
const browser=await playwright[browserName].launch(browserName==='chromium'?{channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}:{headless:true});
let page;
async function mount(id,viewport){
  const context=await browser.newContext({viewport,isMobile:viewport.width<900,hasTouch:true,serviceWorkers:'block'});
  await context.addInitScript(({user,roomId})=>{
    localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','local-qa-'+user.id);sessionStorage.setItem('lichLiveRoom',roomId);
    localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
  },{user:userFor(id),roomId});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  let mounting=true;
  page=await context.newPage();page.on('pageerror',e=>{
    // Reproduced once per mount on the unchanged deployed WebKit baseline.
    // Keep it in evidence; any warning after mount still fails this test.
    if(browserName==='webkit'&&mounting&&e.message==='ResizeObserver loop completed with undelivered notifications.')knownMountWarnings.push({id,message:e.message});
    else errors.push(e.message);
  });page.on('dialog',d=>d.accept());
  await page.addLocatorHandler(page.locator('.soop-consent-dialog[open]'),()=>page.locator('[data-soop-close]').first().click());
  await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
  await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').click();
  await page.waitForFunction(()=>globalThis.LichRaidLive?.diagnostics().mounted,{},{timeout:45000});
  mounting=false;
  return context;
}
async function round(index=0,change=()=>{}){
  const room=await read(),now=Date.now();
  room.status='ACTIVE';room.round=index-1;room.step='TRANSITION';room.challenge.deadline=now;room.clock=now;room.endsAt=now+300000;
  room.boss.hp=room.boss.maxHp;room.doom=0;room.failure=null;room.finishedAt=null;
  for(const f of room.fighters||[]){f.hp=f.maxHp;f.alive=true;}
  tickLichRoom(room,now);change(room,now);room.revision++;
  await write(room);await page.evaluate(()=>LichRaidLive.sync());
  await page.waitForFunction(index=>LichRaidLive.diagnostics().state.round===index+1,index);
  return room;
}
async function layout(label){
  // Allow ResizeObserver + the canonical renderer's frame to settle.
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const result=await page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const visible=e=>e&&e.getBoundingClientRect().height>0&&getComputedStyle(e).display!=='none';
    const rail=document.querySelector('[data-hud-side="A"]'),console=document.querySelector('.lk-console'),header=document.querySelector('.lk-encounter-header');
    const shell=document.querySelector('.has-tactical-hud'),common=shell.querySelector('.battle-v3-header');
    const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;
    const rr=rect(rail),cr=rect(console),hr=header?rect(header):rect(document.querySelector('.lk-order'));
    return {width:innerWidth,height:innerHeight,commonHeaderVisible:visible(common),rail:rr,console:cr,header:hr,railConsoleOverlap:overlap(rr,cr),headerConsoleOverlap:overlap(hr,cr),portraits:rail.querySelectorAll('[data-hud-actor]').length,canvasCount:shell.querySelectorAll('canvas').length,pageOverflow:document.documentElement.scrollWidth>innerWidth,consoleOverflow:console.scrollWidth>console.clientWidth+1,scrollable:console.scrollHeight>console.clientHeight+1};
  });
  await page.screenshot({path:path.join(out,label+'.png'),fullPage:true});
  reports.push({label,...result});
  if(baseline)return result;
  assert.equal(result.commonHeaderVisible,false,'only encounter header is visible');
  assert.equal(result.railConsoleOverlap,false,'roster cannot cover mechanics');
  assert.equal(result.headerConsoleOverlap,false,'header cannot cover mechanics');
  assert.equal(result.pageOverflow,false);assert.equal(result.consoleOverflow,false);
  assert.equal(result.portraits,7);assert.equal(result.canvasCount,1);
  assert.ok(result.console.bottom<=result.height&&result.console.y>=result.header.bottom-1);
  for(const button of await page.locator('.lich-mechanic-screen button').all()){
    if(!await button.isVisible())continue;
    await button.scrollIntoViewIfNeeded();
    const hit=await button.evaluate(b=>{
      const r=b.getBoundingClientRect(),points=[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]];
      return {width:r.width,height:r.height,reachable:points.every(([x,y])=>b.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)))};
    });
    assert.ok(hit.width>=44&&hit.height>=44,JSON.stringify(hit));assert.equal(hit.reachable,true,'button tap area is unobscured');
  }
  await page.locator('.lk-console').evaluate(e=>e.scrollTop=0);
  return result;
}
async function tap(action,target){
  const button=page.locator(`[data-action="${action}"]${target?`[data-target="${target}"]`:''}`);
  await button.scrollIntoViewIfNeeded();await button.tap();
}
async function swipeConsole(){
  if(browserName!=='chromium')return;
  const console=page.locator('.lk-console'),box=await console.boundingBox();
  const client=await page.context().newCDPSession(page),x=box.x+box.width-14,y=box.y+box.height-25;
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let step=1;step<=6;step++){
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*22}]});
    await page.waitForTimeout(16);
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
  assert.ok(await console.evaluate(e=>e.scrollTop)>0,'finger swipe reaches further mechanics');
  await console.evaluate(e=>e.scrollTop=0);
}
async function checkState(predicate){
  const until=Date.now()+4000;let room;
  do{room=await read();if(predicate(room))return room;await page.waitForTimeout(50);}while(Date.now()<until);
  assert.ok(predicate(room),'raid API reflects the mobile input');
}
try{
  const widths=baseline?[[360,780]]:browserName==='webkit'||publicBase?[[390,844]]:[[320,568],[360,780],[390,844],[430,932],[844,390],[1440,900]];
  const context=await mount(2,{width:widths[0][0],height:widths[0][1]});
  for(const [width,height]of widths){
    await page.setViewportSize({width,height});
    const room=await round(0);
    await layout('warden-'+width+'x'+height);
    if(baseline)break;
    const seal=room.challenge.seals.find(s=>s.ownerId==='2'),sequence=seal.reverse?[...seal.sequence].reverse():seal.sequence;
    const before=calls.length;for(const rune of sequence)await tap('SEAL',rune);
    await checkState(r=>r.challenge.seals.find(s=>s.ownerId==='2').index===3);
    assert.equal(calls.length-before,1,'three taps submit one batch');assert.deepEqual(calls.at(-1).targets,sequence);
    await round(0,(r,now)=>{r.challenge.castAt=now-100;r.challenge.castDeadline=now+5500;});
    await tap('INTERRUPT');await checkState(r=>r.challenge.interrupted);
  }
  if(!baseline){
    await page.setViewportSize({width:390,height:844});
    const room=await round(6,r=>{
      r.challenge.seals[0].reverse=true;
      for(const m of r.members)m.name='긴 닉네임의 담당자 표시 검수 '+m.id;
    });
    await layout('warden-finale-long-names-390');
    const sequence=[...room.challenge.seals[0].sequence].reverse();
    for(const rune of sequence)await tap('SEAL',rune);
    await checkState(r=>r.challenge.seals[0].index===3);
    assert.deepEqual(calls.at(-1).targets,sequence,'reverse input remains authoritative');
  }
  await context.close();
  if(!baseline){
    for(const id of [1,3]){
      const ctx=await mount(id,{width:320,height:568});
      await round(2);await layout((id===1?'assault-prison':'rescue-wait')+'-320');
      if(id===1){
        const room=await round(2,(r,now)=>{r.challenge.sealed=true;r.challenge.breathResolved=true;r.challenge.breathAt=now-100;});
        await tap('SHATTER',room.challenge.chains[0].rune);await checkState(r=>r.challenge.chains[0].broken);
        await round(0,(r,now)=>{r.step='EXPOSED';r.challenge.deadline=now+11000;});await layout('assault-exposed-320');
        const before=await read();await tap('STRIKE');const after=await checkState(r=>r.challenge.lastStrikes['1']>0);
        assert.ok(after.boss.hp<=before.boss.hp);
      }else{
        const room=await round(2,(r,now)=>{r.challenge.sealed=true;r.challenge.prison=false;r.challenge.prisonBroken=true;r.challenge.breathResolved=true;r.challenge.plagueAt=now-2100;r.challenge.curseAt=now-100;r.challenge.curseDeadline=now+9000;});
        await layout('rescue-active-320');
        await swipeConsole();
        await tap('TRANSFER',room.challenge.plagueRune);await checkState(r=>!r.challenge.plague);
        const rescue=(await read()).challenge.rescues[0];await tap('RESCUE',rescue.rune);await checkState(r=>r.challenge.rescues[0].castingAt>0||r.challenge.rescues[0].done);
        await tap('CLEANSE',room.challenge.curseRune);await checkState(r=>r.challenge.curseDone);
        const heal=(await read()).resources.heal;await tap('HEAL');await checkState(r=>r.resources.heal===heal-1);
      }
      await ctx.close();
    }
    assert.deepEqual(errors,[]);
    assert.ok(knownMountWarnings.length<=3,'at most the pre-existing one-time WebKit warning per mount');
  }
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({browserName,baseline,publicBase,reports,actions:calls.map(c=>({action:c.action,targets:c.targets})),errors,knownMountWarnings,missing:[...missing]},null,2));
  console.log(JSON.stringify({out,reports:reports.length,actions:calls.length,errors,knownMountWarnings,missing:[...missing]}));
}catch(error){
  await page?.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:error.stack,reports,calls,errors,missing:[...missing]},null,2));throw error;
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await h.close();}
