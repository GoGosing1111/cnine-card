import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {startCodexUiServer} from './helpers/mercenary-codex-ui-server.mjs';

// Real main-page scripts and lobby; all account/API traffic stays in this fixture.
const fakeKey='CN-TEST-HIDE-ONLY';
const user={id:4242,serverUserId:4242,nickname:'검수 플레이어',key:fakeKey,role:'USER',coin:58933111002459,cardShards:6144857,masterStars:10000000000,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const out=process.env.ACCOUNT_PANEL_QA_OUT;
if(out)fs.mkdirSync(out,{recursive:true});
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const report={checks:[],pageErrors:[],browserWarnings:[],writes:[],screens:[]};
const check=(value,label)=>{assert.ok(value,label);report.checks.push(label);};

test('coin and Master Star abbreviations follow the lobby Korean units',()=>{
 const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const start=source.indexOf('function formatAccountBalance('),end=source.indexOf('function showAccountPanel()',start);
 const format=runInNewContext(source.slice(start,end)+';formatAccountBalance');
 for(const [value,expected]of [[0,'0'],[9999,'9,999'],[10000,'1만'],[375000,'37.5만'],[100000000,'1억'],[5000000000,'50억'],[10000000000,'100억'],[1200000000000,'1.2조'],[58933111002459,'58.9조'],[-5000000000,'−50억']])assert.equal(format(value),expected,String(value));
 const variant=fs.readFileSync(new URL('../onestore/js/app.js',import.meta.url),'utf8');
 const panel=s=>s.slice(s.indexOf('let accountPanelCleanup='),s.indexOf('// ===== V1.4 D1 API bridge')).replaceAll('\r\n','\n');
 assert.equal(panel(source),panel(variant),'Main/store account panel parity');
});

test('account dialog hides credentials and preserves lobby, clipboard and logout flows', {timeout:180000},async()=>{
 const server=await startCodexUiServer();
 const publicBase=process.env.ACCOUNT_PANEL_PUBLIC_ORIGIN;
 const base=publicBase||server.origin;
 const browser=process.env.ACCOUNT_PANEL_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']});
 let page;
 const capture=async name=>{if(out){await page.screenshot({path:path.join(out,name+'.png')});report.screens.push(name);}};
 try{
  const profiles=publicBase?[[390,844,'public']]:process.env.ACCOUNT_PANEL_ENGINE==='webkit'?[[390,844,'webkit']]:[[1440,1000,'desktop'],[390,844,'mobile'],[320,740,'small'],[1440,560,'short']];
  for(const [width,height,label]of profiles){
   console.log('Account panel QA: '+label);
   const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block',reducedMotion:'reduce'});
   page=await context.newPage();page.on('pageerror',error=>{
    // This WebKit layout warning is also recorded before this change in
    // docs/qa/ios-safari-memory-20261031/browser.json. Retain it in evidence.
    if(process.env.ACCOUNT_PANEL_ENGINE==='webkit'&&error.message==='ResizeObserver loop completed with undelivered notifications.')report.browserWarnings.push(label+': '+error.message);
    else report.pageErrors.push(label+': '+error.message);
   });
   await page.addInitScript(user=>{
    localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','isolated-account-panel');
    localStorage.setItem('cnine_soop_watch_notice:20261026-v1:'+user.id,'shown');
    window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied.push(text);}}});
   },user);
   await page.route('**/api/**',async route=>{
    const req=route.request(),key=new URL(req.url()).pathname.replace(/^\/(?:onestore\/)?api\//,'');
    if(!['GET','HEAD'].includes(req.method()))report.writes.push({label,key,method:req.method()});
    const data={
     'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
     'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},
     'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},
     'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]},'auth/logout':{ok:true}
    }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    await route.fulfill({json:data});
   });
   // Block third-party services and any unmocked remote account traffic.
   await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
   await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
   const opener=page.locator('soop-adventure-lobby #account-shortcut');await opener.waitFor({timeout:30000});
   await page.evaluate(()=>document.fonts.ready);
   if(label==='desktop')await capture('lobby-reference');
   const open=async()=>{await opener.click();await page.getByRole('dialog',{name:'내 계정',exact:true}).waitFor();};
   const hidden=async name=>{
    check(await page.locator('#accountKey').inputValue()==='',name+' empty hidden input');
    check(await page.locator('#accountKey').getAttribute('type')==='password',name+' masked type');
    check(!await page.locator('.account-panel').evaluate((e,key)=>e.outerHTML.includes(key)||e.innerText.includes(key),fakeKey),name+' no key in markup or text');
    check(await page.locator('#toggleAccountKey').getAttribute('aria-pressed')==='false',name+' hidden toggle state');
   };
   await open();await hidden(label+' opening');
   check((await page.locator('.account-stat-coin dd').innerText())==='58.9조',label+' compact coin amount');
   check((await page.locator('[data-label="마스터의 별"]').innerText())==='100억',label+' Master Stars use compact units');
   check(!(await page.locator('.account-stats').innerText()).includes('카드 조각'),label+' Master Stars replace shards');
   for(const [name,exact]of [['보유 코인','58,933,111,002,459'],['마스터의 별','10,000,000,000']]){
    const amount=page.locator('[data-label="'+name+'"]');await amount.click();check(await amount.innerText()===exact,label+' tap for exact '+name);await amount.click();check(await amount.getAttribute('aria-pressed')==='false',label+' return to compact '+name);
   }
   const dimensions=await page.locator('.account-panel').evaluate(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,overflow:e.scrollWidth-e.clientWidth,panel:getComputedStyle(e).borderImageSource};});
   check(dimensions.left>=0&&dimensions.right<=width+1&&dimensions.top>=0&&dimensions.bottom<=height+1&&dimensions.overflow<=1,label+' panel fits viewport');
   check(dimensions.width<=620&&dimensions.panel.includes('tactical-20261030/panel-flat.webp'),label+' compact current lobby frame');
   await capture('account-'+label);
   await page.locator('#copyAccountKey').click();await page.getByText('개인키를 복사했습니다. 안전한 곳에 보관하세요.',{exact:true}).waitFor();
   check(await page.evaluate(key=>window.__copied.at(-1)===key,fakeKey),label+' copy exact key while hidden');await hidden(label+' after copy');
   await page.locator('#toggleAccountKey').click();check(await page.locator('#accountKey').inputValue()===fakeKey,label+' explicit reveal');
   await page.locator('#toggleAccountKey').click();await hidden(label+' manual hide');
   await page.locator('#toggleAccountKey').click();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await hidden(label+' window blur');
   await page.locator('#toggleAccountKey').click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});await hidden(label+' background tab');
   await page.locator('#toggleAccountKey').click();await page.keyboard.press('Escape');
   check(await page.locator('#accountKey').count()===0,label+' close removes secret field');
   check(await opener.evaluate(e=>e.getRootNode().activeElement===e),label+' restores nickname focus');
   await open();await hidden(label+' reopen');
   await page.locator('#closeAccount2').click();
   if(label==='desktop'){
    await open();await page.locator('#closeAccount').focus();await page.keyboard.press('Shift+Tab');check(await page.locator('#closeAccount2').evaluate(e=>e===document.activeElement),'keyboard focus stays in dialog');
    await page.keyboard.press('Tab');check(await page.locator('#closeAccount').evaluate(e=>e===document.activeElement),'keyboard focus loops forward');
    await page.evaluate(()=>{window.__originalTimeout=window.setTimeout;window.setTimeout=(f,ms,...args)=>window.__originalTimeout(f,ms===30000?60:ms,...args);});
    await page.locator('#toggleAccountKey').click();await page.waitForFunction(()=>document.getElementById('accountKey').value==='');await hidden('reveal timeout');
    await page.evaluate(()=>{window.setTimeout=window.__originalTimeout;navigator.clipboard.writeText=async()=>{throw Error('Fixture clipboard denied');};document.execCommand=command=>{window.__fallback={command,value:document.querySelector('.account-panel textarea')?.value,visibleValue:document.getElementById('accountKey').value};return true;};});
    await page.locator('#copyAccountKey').click();check(await page.evaluate(key=>window.__fallback.value===key&&window.__fallback.visibleValue===''&&window.__fallback.command==='copy',fakeKey),'legacy copy selects hidden field only');
    check(await page.locator('.account-panel textarea').count()===0,'legacy copy clears temporary field');
    await page.evaluate(()=>document.execCommand=()=>false);await page.locator('#copyAccountKey').click();await page.getByText('복사하지 못했습니다. 보기 버튼을 눌러 직접 복사해 주세요.',{exact:true}).waitFor();await hidden('copy failure');
    await page.locator('#closeAccount').click();
    await page.evaluate(()=>{const user=loadUser();user.key='';saveUser(user);});await open();
    check(await page.locator('#toggleAccountKey').isDisabled()&&await page.locator('#copyAccountKey').isDisabled(),'missing key disables reveal and copy');
    check((await page.locator('#accountKeyHelp').innerText()).includes('저장된 개인키가 없습니다'),'missing key explanation');await capture('account-no-key');
    await page.locator('#closeAccount').click();await page.evaluate(key=>{const user=loadUser();user.key=key;saveUser(user);},fakeKey);await open();
    await page.locator('#toggleAccountKey').click();await page.evaluate(()=>{document.getElementById('modal').className='modal';});
    await page.waitForFunction(()=>document.getElementById('accountKey').value==='');check(true,'external modal close erases key');
    await open();await page.locator('#toggleAccountKey').click();await page.evaluate(()=>{document.getElementById('modal').innerHTML='<div>다른 창</div>';});
    await page.waitForFunction(()=>accountPanelCleanup===null);check(true,'replaced dialog disposes listeners');
    await page.evaluate(()=>document.getElementById('modal').className='modal');
   }
   if(label==='small'){
    await page.evaluate(()=>{const user=loadUser();user.nickname='아주아주긴닉네임으로모바일줄바꿈검수';saveUser(user);});await open();
    check(await page.locator('.account-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'long nickname stays within mobile panel');await capture('account-long-name');await page.locator('#closeAccount2').click();
   }
   if(label==='mobile'){
    await open();page.once('dialog',dialog=>dialog.dismiss());await page.locator('#logoutPlayer').click();await hidden('cancel logout');
    check(await page.locator('.account-panel').isVisible(),'cancel logout stays in account');
    page.once('dialog',dialog=>dialog.accept());await page.locator('#logoutPlayer').click();await page.waitForFunction(()=>!localStorage.getItem('cnine_card_api_token'));
    check(await page.locator('#accountKey').count()===0,'logout removes secret field');
    check(report.writes.some(r=>r.key==='auth/logout'),'logout retains API request');
   }
   await context.close();
  }
  check(report.writes.every(r=>['auth/logout','sync/ticket'].includes(r.key)),'only fixture sync ticket and explicit logout send POST requests');
  assert.deepEqual(report.pageErrors,[]);
  if(out)fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 }catch(error){if(page&&!page.isClosed())await capture('failure').catch(()=>{});if(out)fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({...report,error:error.stack},null,2));throw error;}
 finally{await browser.close();await server.close();}
});
