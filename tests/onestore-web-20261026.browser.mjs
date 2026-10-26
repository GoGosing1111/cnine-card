import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {htmlForStore,storeHeaders} from '../functions/_onestore_web.js';
import {canonicalDocument} from '../shared/onestore-web-v1.mjs';
import {user,mockApi} from './helpers/onestore-web-fixtures.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const output=process.env.ONESTORE_QA_DIR;
if(!output)throw Error('Set ONESTORE_QA_DIR');await mkdir(output,{recursive:true});
const sdk=await readFile(join(output,'onestore-h5-sdk.min.js'));
const checks=[],errors=[],writes=[],requests=[],missing=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const gameOrigin='https://cnine-card.pages.dev',hostOrigin='https://qa.onestore.net';
const hostHtml=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><script>
window.calls=[];window.rejectInit=location.search.includes('fail');
window.addEventListener('message',event=>{
 if(event.origin!=='${gameOrigin}'||event.source!==document.querySelector('iframe')?.contentWindow)return;
 const data=event.data;if(data?.ch!=='onestore-h5')return;
 const send=msg=>event.source.postMessage({ch:'onestore-h5',v:1,...msg},event.origin);
 if(data.type==='hello'){send({type:'handshake'});return;}
 const msg=data.msg;if(!msg)return;calls.push(msg);
 if(msg.requestId)send({msg:{requestId:msg.requestId,success:!(rejectInit&&msg.action==='core.getConfig'),data:msg.action==='core.getConfig'?{playerId:'isolated-qa',locale:'ko-KR',safeArea:{top:2,bottom:3,left:0,right:0},ringerSilent:false,supportedActions:['core.ready','core.loadingProgress','core.openDeeplink','core.backConsumed','analytics.report'],reason:'invalid_params'}:{}}});
});
window.hostEvent=(event,data={})=>document.querySelector('iframe').contentWindow.postMessage({ch:'onestore-h5',v:1,msg:{event,data}},'${gameOrigin}');
</script><iframe onload="this.contentWindow.postMessage({ch:'onestore-h5',v:1,type:'handshake'},'${gameOrigin}')" src="${gameOrigin}/onestore/" allow="autoplay; fullscreen"></iframe>`;
const browser=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--mute-audio','--disk-cache-size=1','--media-cache-size=1']});
try{
 for(const [name,width,height]of [['mobile',390,844],['desktop',1366,900]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile',serviceWorkers:'block'});
  page.on('pageerror',e=>errors.push(name+': '+e.message));
  await page.addInitScript(user=>{if(location.origin==='https://cnine-card.pages.dev'){localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','onestore-local-qa');localStorage.setItem('cnine_support_pet_pending_v1:4242',JSON.stringify({petCode:'PET-HEUKGU',expectedRevision:1,requestId:'qa_pending_support_123456'}));}},user);
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===hostOrigin)return route.fulfill({contentType:'text/html',body:hostHtml});
   if(url.href.startsWith('https://h5sdk.onestore.net/'))return route.fulfill({contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:sdk});
   if(url.origin!==gameOrigin)return route.abort();
   if(url.pathname.startsWith('/api/')){
    requests.push(url.pathname);if(!['GET','HEAD'].includes(request.method()))writes.push({path:url.pathname,body:request.postData()});
    return mockApi(route,url);
   }
   try{
    const doc=url.pathname.startsWith('/onestore')?canonicalDocument(url.pathname):null;
    const pathname=doc?(doc==='/'?'/onestore/index.html':doc):url.pathname;
    let file=resolve(root,'.'+decodeURIComponent(pathname));
    if(!file.startsWith(root))throw Error('outside source');
    if((await stat(file)).isDirectory())file=join(file,'index.html');
    let bytes=await readFile(file);
    const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream';
    const headers=doc?Object.fromEntries(storeHeaders({'content-type':type})):{};
    if(doc)bytes=Buffer.from(htmlForStore(bytes.toString(),doc));
    return route.fulfill({body:bytes,contentType:type,headers});
   }catch{if(/\.(?:m?js|css)$/.test(url.pathname))missing.push(url.pathname);return route.fulfill({status:404,body:''});}
  });
  await page.goto(hostOrigin,{waitUntil:'load',timeout:45000});
  const game=page.frame({url:/cnine-card/});
  await game.waitForFunction(()=>window.CNineStoreWeb?.state.status==='ready',{},{timeout:45000});
  await game.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='home');
  // Initial account refresh replaces the lobby once; open the settled UI.
  await page.waitForTimeout(300);
  const calls=await page.evaluate(()=>calls);
  check(calls.some(x=>x.action==='core.getConfig')&&calls.some(x=>x.action==='core.ready'),name+' official SDK init and ready via parent host');
  check(calls.findIndex(x=>x.action==='core.getConfig')<calls.findIndex(x=>x.action==='core.ready'),name+' ordered SDK boot');
  check(calls.filter(x=>x.action==='core.loadingProgress').at(-1)?.params?.progress===100,name+' real loading completes');
  check(await game.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--onestore-safe-bottom').trim())==='3px',name+' safe area applied');
  await game.evaluate(()=>SoopketmonV21ExactShell.openAll());
  await game.waitForFunction(()=>document.querySelector('soop-adventure-lobby')?.shadowRoot.querySelector('#menu-dialog')?.open);
  const menu=await game.evaluate(()=>document.querySelector('soop-adventure-lobby').shadowRoot.textContent);
  check(!/후원|시즌패스|서버 안내|승부예측|포로수용소/.test(menu),name+' menu excludes removed features');
  await page.screenshot({path:join(output,name+'-menu.png')});
  await page.evaluate(()=>hostEvent('lifecycle.backPressed',{seq:1}));
  await game.waitForFunction(()=>!document.querySelector('soop-adventure-lobby').shadowRoot.querySelector('#menu-dialog').open);
  await page.waitForFunction(()=>calls.some(c=>c.action==='core.backConsumed'));
  check((await page.evaluate(()=>calls.filter(c=>c.action==='core.backConsumed').at(-1))).params.consumed===true,name+' synchronous SDK back closes dialog');
  for(const id of ['prediction','prisoncamp','seasonPass']){
   await game.evaluate(id=>SoopketmonV21ExactShell.navigate(id),id);
   check(await game.evaluate(()=>SoopketmonV21ExactShell.currentRoute)==='home',name+' blocked SPA route '+id);
  }
  await game.evaluate(()=>SoopketmonV21ExactShell.navigate('messages'));
  await game.waitForFunction(()=>document.querySelector('#messageList')?.textContent.includes('일반 공지 확인'));
  check(await game.locator('#messageList .user-message').count()===1,name+' hidden records filtered; normal notice retained');
  check(await game.locator('#deleteCompletedMessages').count()===0,name+' bulk cleanup cannot delete hidden records');
  check(await game.evaluate(async()=>(await(await fetch('/api/shell/summary')).json()).messages.unread)===1,name+' unread count consistent');
  await page.screenshot({path:join(output,name+'-messages.png')});
  for(const url of ['/api/server-support/apply','/api/server-support/package/apply','/api/coin-prediction/join','/api/prison-camp/release'])check(await game.evaluate(async url=>(await fetch(url,{method:'POST',body:'{}'})).status,url)===403,name+' blocked before network '+url);
  await page.evaluate(()=>hostEvent('lifecycle.pause',{reason:'background'}));
  await game.waitForFunction(()=>document.body.inert);
  check(await game.evaluate(()=>CNineStoreWeb.state.paused),name+' pause disables input');
  await page.evaluate(()=>hostEvent('lifecycle.resume',{ringerSilent:true}));
  await game.waitForFunction(()=>!document.body.inert);
  check(await game.evaluate(()=>CNineStoreWeb.state.silent),name+' resume respects ringer mode');
  await game.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',source:window.parent,data:{ch:'onestore-h5',msg:{event:'lifecycle.pause',data:{}}}})));
  check(await game.evaluate(()=>!document.body.inert),name+' SDK drops wrong-origin messages');
  await game.evaluate(()=>SoopketmonV21ExactShell.navigate('inventory'));
  await game.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='inventory');
  check(true,name+' normal inventory remains usable');
  // Programmatic navigation must retain the edition, not load the normal website.
  await game.evaluate(()=>location.assign('/pet-codex/'));
  await game.waitForURL('**/onestore/pet-codex/');
  await game.waitForFunction(()=>['ready','error'].includes(window.CNineStoreWeb?.state.status));
  check(await game.evaluate(()=>CNineStoreWeb.state.status)==='ready',name+' standalone SDK ready: '+JSON.stringify(await game.evaluate(()=>({status:CNineStoreWeb.state.status,reason:CNineStoreWeb.state.reason}))));
  await game.waitForFunction(()=>document.querySelector('soop-adventure-lobby'));
  check(await game.evaluate(()=>CNineStorePolicy.restricted()),name+' standalone page retains permanent policy');
  check(!/시즌패스|후원/.test(await game.locator('#pet-codex').innerText()),name+' old donation claim draft stays hidden');
  check(await game.evaluate(()=>Boolean(localStorage.getItem('cnine_support_pet_pending_v1:4242'))),name+' shared website claim draft preserved');
  await game.evaluate(()=>document.querySelector('soop-adventure-lobby').openMenu());
  check(!/후원|시즌패스|승부예측|포로수용소/.test(await game.evaluate(()=>document.querySelector('soop-adventure-lobby').shadowRoot.textContent)),name+' standalone menu restrictions');
  await page.screenshot({path:join(output,name+'-standalone.png')});
  await game.evaluate(()=>location.assign('/admin/?supportPackage=1'));
  check(game.url().includes('/onestore/pet-codex/'),name+' unregistered document cannot escape edition');
  if(name==='desktop'){
   await page.goto(gameOrigin+'/onestore/',{waitUntil:'load'});
   await page.waitForFunction(()=>window.CNineStoreWeb?.state.status==='browser');
   await page.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='home');
   check(await page.evaluate(()=>CNineStorePolicy.restricted()),'normal browser fallback still applies permanent restrictions');
   await page.goto(hostOrigin+'?fail=1',{waitUntil:'load'});
   const failed=page.frame({url:/cnine-card/});
   await failed.waitForFunction(()=>window.CNineStoreWeb?.state.status==='error');
   check(await failed.locator('#onestore-boot-error').isVisible(),'failed SDK initialization displays recoverable error');
   check(!(await page.evaluate(()=>calls.some(c=>c.action==='core.ready'))),'failed SDK does not falsely report game ready');
   await page.evaluate(()=>{rejectInit=false;});
   await failed.locator('#onestore-boot-error button').click();
   await failed.waitForFunction(()=>window.CNineStoreWeb?.state.status==='ready');
   check(true,'retry establishes a fresh official SDK session');
   await page.evaluate(()=>hostEvent('lifecycle.destroy'));
   await failed.waitForFunction(()=>CNineStoreWeb.state.paused);
   check(await failed.evaluate(()=>Boolean(sessionStorage.getItem('reversecall:onestore:isolated-qa'))),'exit saves only a synchronous player-scoped UI checkpoint');
  }
  await page.close();
 }
 check(!requests.some(p=>/server-support|coin-prediction|prison-camp|prison-death-game/.test(p)),'no excluded-feature network request');
 check(!writes.some(r=>/messages|server-support/.test(r.path)),'no deletion or support mutation');
 check(missing.length===0,'no missing scripts or styles: '+[...new Set(missing)].join(','));
 check(errors.length===0,'no browser errors: '+errors.join(' | '));
 console.log(JSON.stringify({passed:checks.length,errors,realServerWrites:0}));
}finally{
 const diagnostics=[];for(const context of browser.contexts())for(const page of context.pages())for(const frame of page.frames()){try{diagnostics.push(await frame.evaluate(()=>({url:location.href,status:window.CNineStoreWeb?.state.status,reason:window.CNineStoreWeb?.state.reason,body:document.body?.innerText.slice(0,1500),scripts:[...document.scripts].map(s=>s.src),calls:window.calls})));}catch{}}
 await writeFile(join(output,'diagnostics.json'),JSON.stringify(diagnostics,null,2));
 await writeFile(join(output,'browser-report.json'),JSON.stringify({checks,errors,writes,missing,realServerWrites:0,method:'Official v1.1.0 SDK in isolated parent iframe; mock account APIs; desktop/mobile Chromium',onestoreRealApp:'NOT_TESTED'},null,2)+'\n');
 await browser.close();
}
