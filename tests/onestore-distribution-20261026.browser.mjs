import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const project=process.env.ONESTORE_BUILD_DIR,output=process.env.ONESTORE_QA_DIR;
if(!project||!output)throw Error('Set ONESTORE_BUILD_DIR and ONESTORE_QA_DIR');await mkdir(output,{recursive:true});
const {configuration}=JSON.parse(await readFile(join(project,'onestore-build-inputs.json'),'utf8'));
const user={id:4242,serverUserId:4242,nickname:'Store QA',role:'USER',coin:1234567890,cardShards:1234,masterStars:100,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const checks=[],errors=[],writes=[],requests=[],missingResources=new Set();const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disk-cache-size=1','--media-cache-size=1']});
try{
 for(const [name,width,height] of [['mobile',390,844],['desktop',1366,900]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile',serviceWorkers:'block',userAgent:'Mozilla/5.0 Chrome/130.0.0.0 ReverseCallStore/onestore/'+configuration.appVersion});
  await page.routeWebSocket('**/*',socket=>socket.close());
  page.on('pageerror',e=>errors.push(name+': '+e.message));
  await page.addInitScript(user=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','onestore-local-qa');},user);
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!=='https://cnine-card.pages.dev')return route.abort();
   if(url.pathname.startsWith('/api/')){
    requests.push(url.pathname);if(!['GET','HEAD'].includes(request.method()))writes.push({path:url.pathname,body:request.postData()});
    const key=url.pathname.slice(5);
    return route.fulfill({json:{
     'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},
     'loot-shop/balance':{pigCoins:0},
     messages:{messages:[{id:1,message_type:'SUPPORT_BANK_ACCOUNT',title:'후원 계좌 안내',body:'은행 계좌 비공개 검수 값',is_read:0,cleanupEligible:1},{id:2,message_type:'SYSTEM',title:'49,800원 패키지 구매 처리',body:'후원 상품 기록',is_read:0,cleanupEligible:1},{id:3,message_type:'SYSTEM',title:'일반 공지 확인',body:'모험을 시작하세요.',is_read:0,cleanupEligible:1}],unread:3,cleanupCount:3},
     'chief/status':{chief:null},'shell/summary':{inventory:{},messages:{unread:3}},'me/menu-favorites':{userId:4242,routes:[]},'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
    }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],presets:{},settings:{}}});
   }
   try{
    const pathname=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    let file=resolve(project,'app/src/main/assets/onestore','.'+pathname);
    try{await stat(file);}catch{file=resolve(root,'.'+pathname);}
    if(!file.startsWith(root)&&!file.startsWith(resolve(project)))throw Error('Outside source');
    if((await stat(file)).isDirectory())file=join(file,'index.html');
    return route.fulfill({body:await readFile(file),contentType:{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream'});
   }catch{missingResources.add(url.pathname);return route.fulfill({status:404,body:''});}
  });
  await page.goto('https://cnine-card.pages.dev/?source=android&distribution=onestore',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='home');
  await page.evaluate(()=>SoopketmonV21ExactShell.openAll());
  await page.waitForFunction(()=>document.querySelector('soop-adventure-lobby')?.shadowRoot.querySelector('#menu-dialog')?.open);
  const text=await page.evaluate(()=>document.querySelector('soop-adventure-lobby').shadowRoot.textContent);
  check(!/후원|시즌패스|서버 안내|승부예측|포로수용소/.test(text),name+' menu omits all removed features');
  await page.screenshot({path:join(output,name+'-menu.png')});
  await page.evaluate(()=>document.querySelector('soop-adventure-lobby').shadowRoot.querySelector('#menu-dialog').close());
  for(const id of ['prediction','prisoncamp','seasonPass']){
   await page.evaluate(id=>SoopketmonV21ExactShell.navigate(id),id);
   check(await page.evaluate(()=>SoopketmonV21ExactShell.currentRoute)==='home',name+' direct navigation blocked: '+id);
  }
  await page.evaluate(()=>SoopketmonV21ExactShell.navigate('messages'));
  await page.waitForFunction(()=>document.querySelector('#messageList')?.textContent.includes('일반 공지 확인'));
  check(await page.locator('#messageList .user-message').count()===1,name+' excluded history absent; ordinary message retained');
  check(await page.locator('#deleteCompletedMessages').count()===0,name+' bulk cleanup cannot delete hidden live records');
  check(await page.locator('#messageCleanupHint').count()===0,name+' no removed cleanup hint remains');
  check(await page.evaluate(async()=>(await (await fetch('/api/shell/summary')).json()).messages.unread)===1,name+' unread count excludes hidden records');
  const messageText=await page.locator('#messageList').innerText();check(!/후원|계좌|패키지/.test(messageText),name+' message copy filtered');
  await page.waitForTimeout(400); // Capture the final route, after its entry transition.
  await page.screenshot({path:join(output,name+'-messages.png')});
  for(const url of ['/api/server-support/apply','/api/server-support/package/apply','/api/coin-prediction/join','/api/prison-camp/release'])check(await page.evaluate(async url=>(await fetch(url,{method:'POST',body:'{}'})).status,url)===403,name+' request blocked before network: '+url);
  await page.evaluate(()=>SoopketmonV21ExactShell.navigate('inventory'));
  await page.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='inventory');check(true,name+' ordinary inventory navigation works');
  const back=await readFile(join(root,'packaging/android-direct/web/game-back.js'),'utf8');check(await page.evaluate(back)==='handled',name+' Android Back preserved');
  await page.close();
 }
 check(!requests.some(p=>/server-support|coin-prediction|prison-camp|prison-death-game/.test(p)),'no removed-feature request reaches network');
 check(!writes.some(r=>/messages|server-support/.test(r.path)),'no message deletion, mark-read, or support mutation');
 check(errors.length===0,'no page errors: '+errors.join(' | '));
 await writeFile(join(output,'browser-report.json'),JSON.stringify({checks,errors,missingResources:[...missingResources],interceptedWrites:writes,realServerWrites:0,androidDevice:'NOT_TESTED',method:'Exact APK web resources in Chromium with isolated mock APIs'},null,2)+'\n');
 console.log(JSON.stringify({passed:checks.length,errors,realServerWrites:0}));
}finally{await browser.close();}
