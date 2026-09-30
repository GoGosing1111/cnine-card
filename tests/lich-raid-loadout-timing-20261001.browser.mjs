// Loopback-only three-account regression. Real catalog art/V3 assets; no production API calls.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lichLiveFixture} from './helpers/lich-live-fixture.mjs';
import {coreLifecycleFixture} from './helpers/core-raid-lifecycle-fixture.mjs';
import {handleRaidCoreProtocol} from '../functions/_raid_core_protocol.js';
import {accountDeck} from './helpers/lich-raid-loadout-fixture.mjs';
import {REVIEW_DECK} from '../preview/lich-king-raid-v1/fixture.mjs';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=fs.mkdtempSync(path.join(os.tmpdir(),'lich-party-'));
const lich=await lichLiveFixture(),core=await coreLifecycleFixture();
for(const id of [1,2,3])lich.setDeck(id,accountDeck(id));
const roomId=await lich.party(),calls=[];
let actionDelay=0;
const user=id=>({id,serverUserId:id,nickname:['','검수 공대장','검수 봉인대','검수 구출대'][id],role:id===1?'OWNER':'USER',
  coin:123456789,cardShards:12000,masterStars:2000,owned:REVIEW_DECK.map(c=>c.id),quantities:Object.fromEntries(REVIEW_DECK.map(c=>[c.id,1])),
  breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml',
  '.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://'+req.headers.host);
  const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try{
    if(url.pathname.startsWith('/api/')){
      const key=url.pathname.slice(5),chunks=[];for await(const chunk of req)chunks.push(chunk);
      const id=Number(req.headers.authorization?.match(/local-qa-(\d+)/)?.[1]||1);
      calls.push({key,id,method:req.method,time:Date.now()});
      if(key.startsWith('raid/lich/')||key.startsWith('raid/core/')){
        if(key==='raid/lich/action'&&actionDelay)await new Promise(resolve=>setTimeout(resolve,actionDelay));
        const body=Buffer.concat(chunks).toString(),request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});
        if(key.startsWith('raid/lich/')){const response=await lich.handle(request);return json(await response.json(),response.status);}
        const response=await handleRaidCoreProtocol({path:key,request,env:core.env,deps:core.deps});return json(response.body,response.status);
      }
      const u=user(id);
      return json({'service/status':{maintenance:{active:false}},'me/summary':{user:u,prison:{incarcerated:false}},me:{user:u},cards:{cards:REVIEW_DECK},
        packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},
        'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},
        'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
        'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]},
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(error){json({error:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
const clients=[],reports=[];
const readRoom=async()=>JSON.parse((await lich.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json);
try{
  for(const [id,width,height]of [[1,1440,1000],[2,1440,1000],[3,390,844]]){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
    await context.addInitScript(u=>{
      localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','local-qa-'+u.id);
      localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');
    },user(id));
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    clients.push({id,width,height,page,context,errors});
    await page.goto(origin+'/');await page.waitForFunction(()=>typeof renderShell==='function');await page.evaluate(()=>renderShell('battle'));
    await page.locator('[data-pve-mode="raid"]').click();await page.locator('#lichRaidTab').waitFor({state:'visible'});await page.locator('#lichRaidTab').click();
    await page.locator('#lich-assembly').waitFor({state:'visible'});
    assert.equal(await page.locator('#pveRaidHubView #pveLichRaidView').count(),1,'waiting room stays in the existing hub');
    await page.evaluate(()=>document.fonts.ready);await page.locator('#pveLichRaidView').scrollIntoViewIfNeeded();
    if(id!==2)await page.screenshot({path:path.join(out,`lobby-${width}.png`),fullPage:true});
    await page.locator('#lich-readyButton').click();
    await page.waitForFunction(()=>LichRaidLive.diagnostics().state.me.ready);
    await page.waitForFunction(()=>LichBattle?.diagnostics().atlases.length===3);
  }
  const [host,warden,rescue]=clients.map(c=>c.page);
  await host.evaluate(()=>LichRaidLive.sync());await host.locator('#lich-startButton').click();
  await Promise.all(clients.map(({page})=>page.waitForFunction(()=>LichRaidLive?.diagnostics().mounted,{},{timeout:60000})));
  for(const {page,id,width,height}of clients){
    const visible=await page.evaluate(()=>{
      const d=LichRaidLive.diagnostics(),r=document.getElementById('pveLichRaidView').getBoundingClientRect();
      return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},canvas:document.querySelectorAll('#lich-battleMount canvas').length,
        formation:d.battle.engine.formation,suit:d.battle.engine.accountBattleUnit,
        ids:[...document.querySelectorAll('#lich-battleMount [data-v3-roster-card]')].map(c=>c.dataset.v3RosterKeys),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.deepEqual(visible.rect,{x:0,y:0,width,height});assert.equal(visible.canvas,1);assert.equal(visible.overflow,false);
    assert.deepEqual(visible.ids.map((keys,i)=>keys.includes(accountDeck(id).ids[i])),[true,true,true,true,true]);
    assert.equal(visible.formation.mercenaries.length,1);assert.equal(visible.formation.mercenaries[0].code,'V-004');
    assert.equal(visible.suit.enabled,true);assert.equal(visible.suit.active,true);
    reports.push({id,width,fullScreen:true,ownDeck:true,mercenary:true,battleSuit:true});
  }
  await rescue.waitForFunction(()=>LichRaidLive.diagnostics().state.step==='MECHANIC');
  await rescue.waitForFunction(()=>{const b=document.querySelector('[data-action="TRANSFER"]');return b&&!b.disabled;});
  const identity=await rescue.locator('[data-action="TRANSFER"]').first().elementHandle();
  await rescue.waitForTimeout(750);assert.equal(await identity.evaluate(b=>b.isConnected),true,'polling must preserve a clickable button');
  await rescue.screenshot({path:path.join(out,'mechanic-390.png'),fullPage:true});
  const rune=(await readRoom()).challenge.plagueRune;
  actionDelay=600;const callStart=calls.length;
  await rescue.locator(`[data-action="TRANSFER"][data-target="${rune}"]`).click();
  await rescue.locator('[data-input-status]').waitFor({state:'visible'});
  await rescue.waitForFunction(()=>!LichRaidLive.diagnostics().state.challenge.plague);
  assert.equal(calls.slice(callStart).filter(c=>c.id===3&&c.key==='raid/lich/status').length,0,'successful input applies its response without waiting for GET');
  await rescue.locator('[data-input-status]').waitFor({state:'hidden'});actionDelay=0;
  await warden.waitForFunction(()=>{const b=document.querySelector('[data-action="INTERRUPT"]');return b&&!b.disabled;});
  await warden.locator('[data-action="INTERRUPT"]').click();await warden.waitForFunction(()=>LichRaidLive.diagnostics().state.challenge.interrupted);
  await warden.screenshot({path:path.join(out,'interrupt-1440.png'),fullPage:true});
  await host.waitForFunction(()=>LichRaidLive.diagnostics().state.step==='EXPOSED');
  await host.screenshot({path:path.join(out,'attack-1440.png'),fullPage:true});
  const before=(await readRoom()).boss.hp;await host.locator('[data-action="STRIKE"]').click();
  await host.waitForFunction(hp=>LichRaidLive.diagnostics().state.bossHp<hp,before);
  await Promise.all(clients.map(({page})=>page.evaluate(()=>LichRaidLive.sync())));
  assert.equal(new Set(await Promise.all(clients.map(({page})=>page.evaluate(()=>LichRaidLive.diagnostics().state.bossHp)))).size,1,'shared boss HP');
  // Reach the complex overlay through the same server transition, without a multi-minute balance run.
  const room=await readRoom(),now=Date.now();room.round=3;room.step='TRANSITION';room.clock=now;room.challenge.deadline=now+500;room.endsAt=now+120000;
  await lich.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
  await rescue.waitForFunction(()=>LichRaidLive.diagnostics().state.challenge.kind==='CONVERGENCE');
  await rescue.locator('[data-action="RESCUE"]').first().waitFor({state:'visible'});
  const hitBoxes=await rescue.locator('.lk-console [data-action]').evaluateAll(buttons=>buttons.map(b=>{
    const r=b.getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,height:r.height};
  }));
  assert.ok(hitBoxes.every(r=>r.x>=0&&r.right<=390&&r.width>=44&&r.height>=44),'mobile controls fit the viewport and remain tappable');
  await rescue.screenshot({path:path.join(out,'complex-390.png'),fullPage:true});
  await warden.screenshot({path:path.join(out,'complex-1440.png'),fullPage:true});
  const ghost=(await readRoom()).challenge.ghostRune;
  await rescue.locator(`[data-action="RESCUE"][data-target="${ghost}"]`).click();
  await rescue.waitForFunction(()=>LichRaidLive.diagnostics().state.challenge.rescueAt>0);
  await rescue.waitForFunction(()=>{const b=document.querySelector('[data-action="RESCUE"]');return b&&!b.disabled;});
  assert.ok((await lich.call('status?roomId='+roomId,{user:3})).body.state.souls>0);
  await host.locator('#lich-leaveButton').click();await host.locator('#lich-browse').waitFor({state:'visible'});
  assert.equal(await host.locator('#pveRaidHubView #pveLichRaidView').count(),1,'leaving restores the existing UI');
  assert.equal(await host.evaluate(()=>document.body.style.overflow),'');
  for(const c of clients)assert.deepEqual(c.errors,[]);
  console.log(JSON.stringify({out,reports,mechanics:{stableButtons:true,instantPending:true,noSecondGet:true,transfer:true,interrupt:true,rescue:true},errors:[]},null,2));
}catch(error){
  console.error(JSON.stringify(await Promise.all(clients.map(async({page,id,errors})=>({id,errors,state:await page.evaluate(()=>{
    const d=LichRaidLive?.diagnostics();return {status:d?.state?.status,step:d?.state?.step,serverNow:d?.state?.serverNow,challenge:d?.state?.challenge};
  }).catch(()=>null)}))),null,2));
  for(const {page,id}of clients)await page.screenshot({path:path.join(out,`failure-${id}.png`),fullPage:true}).catch(()=>{});
  console.error('Lich browser artifacts:',out);throw error;
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));await lich.close();await core.db.close();
}
