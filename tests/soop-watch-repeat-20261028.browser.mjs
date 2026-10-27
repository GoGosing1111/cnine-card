import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root=process.cwd(),out=process.env.QA_OUT,publicBase=process.env.QA_PUBLIC_BASE||'',baseline=process.env.QA_EXPECT_REPEAT==='1';
assert(out&&!path.resolve(out).startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const blank={maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],profiles:[],messages:[],pollSeconds:60};
const cache=new Map(),reports=[],unexpected=[];
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){assert.equal(req.method,'GET');res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(blank));}
  const relative=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
  const file=path.resolve(root,relative);assert(file.startsWith(root+path.sep));
  const key=url.pathname+url.search;
  if(!cache.has(key))cache.set(key,(async()=>{
    if(publicBase){const r=await fetch(publicBase+key,{signal:AbortSignal.timeout(30000)});assert(r.ok,key);return {type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};}
    const body=fs.existsSync(file)?fs.readFileSync(file):execFileSync('git',['show','HEAD:'+relative],{cwd:root,windowsHide:true,maxBuffer:40*1024*1024,stdio:['ignore','pipe','pipe']});
    return {type:mime[path.extname(file)]||'application/octet-stream',body};
  })());
  const r=await cache.get(key);res.writeHead(200,{'content-type':r.type});res.end(r.body);
}catch(e){unexpected.push({url:req.url,error:e.message.slice(0,250)});res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
  for(const width of baseline||publicBase?[390]:[1440,390]){
    const context=await browser.newContext({viewport:{width,height:width<600?844:1000},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
      if(url.href==='https://www.playdk.kr/api/v2/g/skm')return route.fulfill({contentType:'text/html',body:'<title>Isolated PLAY DK return fixture</title>'});
      return route.abort();
    });
    await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');HTMLMediaElement.prototype.play=function(){return Promise.resolve();};});
    async function setup(token=''){
      await page.goto(origin+'/'+(token?'?token='+encodeURIComponent(token):''),{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForSelector('#login');
      await page.evaluate(()=>{
        window.qaRequests=[];window.qaProvision=true;API_MODE=true;API_TOKEN='isolated-session';
        localStorage.setItem(STORAGE_KEY,JSON.stringify({serverUserId:70001,nickname:'시청시간 검수',role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));
        apiRequest=async(route,options={})=>{
          qaRequests.push({route,method:options.method||'GET'});
          if(route==='secondary-verification/status')return {verification:{provider:'PLAYDK'},playdk:{enabled:true,startUrl:'https://www.playdk.kr/api/v2/g/skm'}};
          if(route==='secondary-verification/playdk')return {ok:true,newlyVerified:false,status:'ALREADY_VERIFIED',soopWatch:{identityAvailable:qaProvision}};
          return {enabled:false,visible:false,maintenance:{active:false},messages:[],cards:[],items:[],operations:[],profiles:[],pollSeconds:60};
        };
      });
    }
    const modal=page.locator('.soop-consent-dialog[open]');
    async function exchange(token){await page.evaluate(async token=>{if(token)pendingPlaydkVerificationToken=token;await completePendingPlaydkVerification();await soopWatchConsentPromise;await Promise.resolve();},token);}
    await setup();assert.equal(await modal.count(),0);
    assert.equal(await page.evaluate(()=>openSoopWatchConsent({automatic:true})),true);await modal.waitFor();
    await modal.getByRole('button',{name:'나중에',exact:true}).click();
    assert.equal(await page.evaluate(()=>openSoopWatchConsent({automatic:true})),false);
    await exchange('ordinary-login-one');
    if(baseline){
      await modal.waitFor();assert.match(await modal.locator('[data-soop-status]').textContent(),/정보 제공을 확인했습니다/);await page.keyboard.press('Escape');
      await exchange('ordinary-login-two');await modal.waitFor();
      await page.screenshot({path:path.join(out,'before-repeat-mobile.png')});
      reports.push({width,repeatReproduced:true,confirmedPopupOnBothLogins:true});await context.close();continue;
    }
    assert.equal(await modal.count(),0,'Confirmed ordinary login stays silent');
    await exchange('ordinary-login-two');assert.equal(await modal.count(),0,'A fresh token does not reopen the notice');
    await page.evaluate(()=>qaProvision=false);await exchange('no-provision-after-acknowledgement');assert.equal(await modal.count(),0,'Missing optional identity does not repeat an acknowledged notice');
    await setup('login-after-reload');await exchange();assert.equal(await modal.count(),0,'Reloaded ordinary login stays silent');
    await page.evaluate(()=>renderShell('messages'));await page.locator('#openSoopWatchConsent').click();await modal.waitFor();
    await Promise.all([page.waitForURL('https://www.playdk.kr/api/v2/g/skm'),modal.locator('[data-soop-reconnect]').click()]);
    await setup('explicit-reconnect');await exchange();await modal.waitFor();
    assert.match(await modal.textContent(),/확인 완료/);assert.equal(await modal.locator('[data-soop-reconnect]').isVisible(),false,'Success never asks for another reconnect');
    const bounds=await modal.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);assert.equal(await modal.evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.screenshot({path:path.join(out,'confirmed-'+width+'.png')});
    await modal.getByRole('button',{name:'게임 계속하기',exact:true}).click();
    await exchange('after-explicit-reconnect');assert.equal(await modal.count(),0,'Explicit return is consumed once');
    await page.evaluate(()=>renderShell('home'));assert.equal(await page.evaluate(()=>openSoopWatchConsent({automatic:true})),false);
    await page.screenshot({path:path.join(out,'silent-login-'+width+'.png')});
    if(!publicBase){
      await page.evaluate(()=>openSoopWatchConsent());await modal.waitFor();
      await Promise.all([page.waitForURL('https://www.playdk.kr/api/v2/g/skm'),modal.locator('[data-soop-reconnect]').click()]);
      await setup('explicit-unavailable');await page.evaluate(()=>qaProvision=false);await exchange();await modal.waitFor();
      assert.match(await modal.locator('[data-soop-status]').textContent(),/확인하지 못했습니다/);assert.equal(await modal.locator('[data-soop-reconnect]').isVisible(),true);await page.keyboard.press('Escape');
      // A fresh browser/cleared notice should also stay silent when the fresh server result confirms provision.
      await page.evaluate(()=>localStorage.removeItem('cnine_soop_watch_notice:20261026-v1:70001'));
      await setup('first-confirmed-login');await exchange();assert.equal(await modal.count(),0);assert.equal(await page.evaluate(()=>openSoopWatchConsent({automatic:true})),false);
    }
    assert.deepEqual(errors,[]);reports.push({width,ordinaryLoginSilent:true,reloadSilent:true,manualReentry:true,explicitReconnectShownOnce:true,confirmedReconsentControlsHidden:true,errors});await context.close();
  }
  assert.deepEqual(unexpected.filter(e=>!e.url.startsWith('/favicon.ico')),[]);
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({baseline,publicBase,reports,operationalWrites:0},null,2)+'\n');console.log(JSON.stringify({baseline,publicBase,reports,operationalWrites:0}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
