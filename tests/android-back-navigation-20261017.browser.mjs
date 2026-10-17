// Exercise the APK's exact Back script against the real game shell. All traffic
// is served from this checkout or mocked APIs; no real account is used.
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const output=process.env.ANDROID_BACK_QA_DIR;if(!output)throw Error('Set ANDROID_BACK_QA_DIR');await mkdir(output,{recursive:true});
const script=await readFile(join(root,'packaging/android-direct/web/game-back.js'),'utf8');
const user={id:4242,serverUserId:4242,nickname:'Android Back QA',role:'USER',coin:1234567890,cardShards:1234,masterStars:100,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disk-cache-size=1','--media-cache-size=1']});
const checks=[],errors=[],writes=[];const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','android-back-local-qa');},user);
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!=='https://cnine-card.pages.dev')return route.abort();
  if(url.pathname.startsWith('/api/')){
   if(!['GET','HEAD'].includes(request.method()))writes.push(url.pathname);
   const key=url.pathname.slice(5);
   return route.fulfill({json:{
    'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
    'chief/status':{chief:null},'shell/summary':{inventory:{},messages:{unread:0}},'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}},
   }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],presets:{},settings:{}}});
  }
  try{
   let file=resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+'/')&&!file.startsWith(root+'\\'))throw Error('Outside checkout');
   if((await stat(file)).isDirectory())file=join(file,'index.html');
   const type={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[extname(file)]||'application/octet-stream';
   return route.fulfill({body:await readFile(file),contentType:type});
  }catch{return route.fulfill({status:404,body:''});}
 });
 const back=()=>page.evaluate(script);
 const go=async route=>{await page.evaluate(id=>SoopketmonV21ExactShell.navigate(id),route);await page.waitForFunction(id=>document.querySelector('#app main.page')?.dataset.route===id,route);};
 await page.goto('https://cnine-card.pages.dev/?source=android&distribution=dk',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='home');
 const historyBefore=await page.evaluate(()=>history.length);
 await go('inventory');check(await page.evaluate(()=>history.length)===historyBefore,'real inventory has no browser history entry (original failure)');
 check(await back()==='handled','inventory Back consumed in game');await page.waitForFunction(()=>SoopketmonV21ExactShell.currentRoute==='home');
 check(await back()==='home','lobby is reported distinctly to native double-back handling');
 await go('pvp');check(await back()==='handled','PVP Back consumed in game');await page.waitForFunction(()=>SoopketmonV21ExactShell.currentRoute==='home');
 await go('inventory');await page.evaluate(()=>SoopketmonV21ExactShell.openAll());
 await page.waitForFunction(()=>document.querySelector('soop-adventure-lobby')?.shadowRoot.querySelector('#menu-dialog')?.open);
 check(await back()==='handled','shared shadow-DOM menu closes first');
 check(await page.evaluate(()=>!document.querySelector('soop-adventure-lobby').shadowRoot.querySelector('#menu-dialog').open&&SoopketmonV21ExactShell.currentRoute==='inventory'),'menu close preserves underlying inventory');
 await page.evaluate(()=>{const modal=document.getElementById('modal');modal.className='modal show';modal.innerHTML='<div class="modal-panel"><button id="closeDetail" aria-label="닫기">×</button></div>';window.qaCloseCount=0;modal.querySelector('button').onclick=()=>{qaCloseCount++;modal.className='modal';modal.innerHTML='';};});
 check(await back()==='handled'&&await page.evaluate(()=>qaCloseCount===1&&SoopketmonV21ExactShell.currentRoute==='inventory'),'detail Back invokes existing close handler exactly once');
 await page.evaluate(()=>{const m=document.getElementById('modal');m.className='modal show';m.innerHTML='<div class="modal-panel"><button aria-label="닫기" disabled>×</button><b>처리 중</b></div>';});
 check(await back()==='handled'&&await page.evaluate(()=>document.getElementById('modal').classList.contains('show')),'busy modal cannot fall through to launcher exit');
 await page.evaluate(()=>{const m=document.getElementById('modal');m.className='modal';m.innerHTML='';});
 await go('pvp');await page.evaluate(()=>{document.querySelector('.v21-route-body').insertAdjacentHTML('beforeend','<div id="pvpDeckSlots"></div>');pvpState.saving=true;});
 check(await back()==='handled'&&await page.evaluate(()=>SoopketmonV21ExactShell.currentRoute==='pvp'),'real PVP save-in-progress guard preserved');
 await page.evaluate(()=>{pvpState.saving=false;document.getElementById('pvpDeckSlots').remove();});await go('inventory');
 await back();await page.waitForFunction(()=>SoopketmonV21ExactShell.currentRoute==='home');
 await page.screenshot({path:join(output,'back-to-game-lobby-mobile.png')});
 check(!errors.length,'no browser JavaScript errors: '+errors.join(' | '));
 const report={type:'REAL_GAME_SHELL_WITH_APK_BACK_SCRIPT_NOT_ANDROID_DEVICE',passed:checks.length,checks,errors,interceptedWrites:writes,androidDevice:'NOT_CONNECTED'};
 await writeFile(join(output,'back-navigation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();}
