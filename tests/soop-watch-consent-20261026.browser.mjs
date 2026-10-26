import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root=process.cwd(),out=process.env.QA_OUT,publicBase=process.env.QA_PUBLIC_BASE||'';
assert(out&&!path.resolve(out).startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const blank={maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],profiles:[],messages:[],pollSeconds:60};
const missing=[],publicFiles=new Map(),reports=[];
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){assert.equal(req.method,'GET');res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(blank));}
  if(publicBase){
    const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key,{signal:AbortSignal.timeout(30000)});assert(r.ok,key);return {type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());
    const r=await publicFiles.get(key);res.writeHead(200,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);
  }
  let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}catch(e){res.writeHead(500);res.end(e.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
try{
  for(const width of publicBase?[390]:[1440,390,360]){
    const context=await browser.newContext({viewport:{width,height:width<600?844:1000},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'});
    const errors=[],alerts=[],page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{alerts.push(d.message());await d.dismiss();});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin===origin)return route.continue();
      if(url.href==='https://www.playdk.kr/my/settings/integrations/reversecall')return route.fulfill({contentType:'text/html',body:'<title>PLAY DK consent link fixture</title>'});
      return route.abort();
    });
    await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');HTMLMediaElement.prototype.play=function(){return Promise.resolve();};});
    await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForSelector('#login');
    assert.equal(await page.locator('.soop-consent-dialog').count(),0,'Logged-out visitor sees no popup');
    await page.evaluate(()=>{
      window.qaRequests=[];window.qaProvision=true;window.qaStatusMode='ok';
      API_MODE=true;API_TOKEN='isolated-qa-session';
      localStorage.setItem(STORAGE_KEY,JSON.stringify({serverUserId:70001,nickname:'시청시간 검수',role:'USER',coin:0,cardShards:0,owned:[],quantities:{},breakthroughs:{},testCoinGrantedV13:true}));
      apiRequest=async(route,options={})=>{
        qaRequests.push({route,method:options.method||'GET'});
        if(route==='secondary-verification/status'){
          if(qaStatusMode==='error')throw Error('연결 확인에 실패했습니다. 다시 시도해 주세요.');
          if(qaStatusMode==='pending')await new Promise(resolve=>window.qaStatusResolve=resolve);
          return {verification:{provider:qaStatusMode==='wago'?'WAGO':'PLAYDK'},playdk:{enabled:true,startUrl:qaStatusMode==='bad-url'?'https://playdk.kr.attacker.invalid/api/v2/g/skm':'https://www.playdk.kr/api/v2/g/skm'}};
        }
        if(route==='secondary-verification/playdk'){
          if(qaStatusMode==='expired')throw Error('PLAY DK 인증 시간이 만료되었거나 이미 사용한 요청입니다. 인증 버튼을 다시 눌러주세요.');
          return {ok:true,newlyVerified:false,status:'ALREADY_VERIFIED',verification:{provider:'PLAYDK'},soopWatch:{identityAvailable:qaProvision}};
        }
        return {enabled:false,visible:false,maintenance:{active:false},messages:[],cards:[],items:[],operations:[],profiles:[],pollSeconds:60};
      };
      renderShell('home');
    });
    const modal=page.locator('.soop-consent-dialog[open]');await modal.waitFor();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.soop-consent-dialog')).backgroundColor==='rgb(23, 19, 34)');
    const bounds=await modal.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.height<= (width<600?844:1000));
    assert.equal(await modal.evaluate(el=>el.scrollWidth>el.clientWidth),false);
    assert.match(await modal.textContent(),/동의 이전의 시청기록/);assert.match(await modal.textContent(),/동의하지 않아도 게임/);
    assert.equal(await modal.locator('input[type=checkbox]').count(),0,'No local or preselected consent');
    assert.equal(await page.evaluate(()=>qaRequests.filter(r=>r.route.startsWith('secondary-verification')).length),0,'Showing notice performs no provider request');
    await page.screenshot({path:path.join(out,'popup-'+width+'.png')});
    const popupEvent=page.waitForEvent('popup');await modal.getByRole('link',{name:/PLAY DK에서 동의 설정/}).click();const provider=await popupEvent;
    await provider.waitForLoadState('domcontentloaded');assert.equal(provider.url(),'https://www.playdk.kr/my/settings/integrations/reversecall');
    assert.equal(await provider.evaluate(()=>window.opener),null);await provider.close();
    assert.equal(await modal.locator('[data-soop-status]').isVisible(),false,'Opening consent settings is not confirmation');
    await modal.getByRole('button',{name:'나중에',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.SoopWatchConsent.open({automatic:true})),false,'Notice acknowledgement suppresses repeats');
    await page.evaluate(()=>renderShell('messages'));await page.locator('#openSoopWatchConsent').click();await modal.waitFor();
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'openSoopWatchConsent');
    await page.locator('#openSoopWatchConsent').click();
    for(const [mode,message] of [['error','실패'],['bad-url','주소'],['wago','운영팀']]){
      await page.evaluate(mode=>window.qaStatusMode=mode,mode);await modal.locator('[data-soop-reconnect]').click();
      await page.waitForFunction(message=>document.querySelector('[data-soop-status]').textContent.includes(message),message);
      assert.equal(await modal.locator('[data-soop-reconnect]').isEnabled(),true);
    }
    await page.keyboard.press('Escape');
    for(const provision of [true,false]){
      await page.evaluate(async provision=>{qaStatusMode='ok';qaProvision=provision;pendingPlaydkVerificationToken='isolated-one-use-token';await completePendingPlaydkVerification();},provision);
      await modal.waitFor();await page.waitForFunction(()=>document.querySelector('[data-soop-status]')&&!document.querySelector('[data-soop-status]').hidden);
      assert.match(await modal.locator('[data-soop-status]').textContent(),provision?/정보 제공을 확인했습니다/:/정보 제공을 확인하지 못했습니다/);
      await page.keyboard.press('Escape');
    }
    const exchanges=await page.evaluate(()=>qaRequests.filter(r=>r.route==='secondary-verification/playdk').length);
    assert.equal(await page.evaluate(()=>completePendingPlaydkVerification()),false);assert.equal(exchanges,2);
    await page.evaluate(async()=>{qaStatusMode='expired';pendingPlaydkVerificationToken='expired-qa-token';await completePendingPlaydkVerification();});
    assert.equal(await page.locator('.soop-consent-dialog[open]').count(),0);assert(alerts.some(x=>x.includes('만료')));
    await page.evaluate(()=>{qaStatusMode='pending';openSoopWatchConsent();});await modal.waitFor();await modal.locator('[data-soop-reconnect]').click();
    await page.waitForFunction(()=>typeof qaStatusResolve==='function');
    await page.evaluate(()=>{const user=loadUser();user.serverUserId=70002;saveUser(user);qaStatusResolve();});
    assert.equal(await page.locator('.soop-consent-dialog[open]').count(),0,'Account change closes pending popup');
    assert(page.url().startsWith(origin),'Stale account response never navigates');
    // Account scope is separate, including with unavailable browser storage.
    await page.evaluate(async()=>{
      const {createSoopWatchConsent}=await import('/js/soop-watch-consent-v1.mjs?v=20261026-v1');
      window.qaController=createSoopWatchConsent({getUser:loadUser,getSession:()=>API_TOKEN,storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}},request:async()=>({playdk:{enabled:true,startUrl:'https://www.playdk.kr/api/v2/g/skm'}}),navigate:url=>window.qaNavigation=url});
      qaController.open({automatic:true});
    });
    await modal.waitFor();await modal.locator('[data-soop-reconnect]').click();
    await page.waitForFunction(()=>window.qaNavigation==='https://www.playdk.kr/api/v2/g/skm');
    await page.evaluate(()=>qaController.dispose());
    reports.push({width,checks:17,errors,alerts:alerts.length,requests:await page.evaluate(()=>qaRequests)});
    assert.deepEqual(errors,[],'No main-page JavaScript errors');await context.close();
  }
  assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({publicBase,reports,missing,operationalWrites:0},null,2));
  console.log(JSON.stringify({viewports:reports.map(r=>r.width),checks:reports.reduce((n,r)=>n+r.checks,0),operationalWrites:0}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
