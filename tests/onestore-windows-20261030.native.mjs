import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [build,output]=process.argv.slice(2);
if(!build||!output||!process.env.PLAYWRIGHT_MODULE)throw Error('Provide build, QA output and PLAYWRIGHT_MODULE');
const {_electron}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
await mkdir(output,{recursive:true});
const profile=await mkdtemp(path.join(output,'profile-'));
const {configuration}=JSON.parse(await readFile(path.join(build,'onestore-windows-build-inputs.json'),'utf8'));
const user={id:4242,serverUserId:4242,nickname:'Store QA',role:'USER',coin:1234567890,cardShards:1234,masterStars:100,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
const hash=value=>createHash('sha256').update(value).digest('hex');
const raw='unrestricted server index must never run';
const manifest={schema:1,origin:'https://cnine-card.pages.dev',releaseId:hash('onestore native fixture'),minimumClientVersion:'0.1.0',files:[{path:'/index.html',sha256:hash(raw),bytes:Buffer.byteLength(raw),essential:true},{path:'/js/coin-prediction-v1.js',sha256:hash(raw),bytes:Buffer.byteLength(raw),essential:true}]};
// Dynamic modules must exercise the same verified resource path as the real
// public manifest, rather than a loopback HTTP response behind an HTTPS module.
async function addPublicCode(directory){for(const item of await readdir(path.join(root,directory),{withFileTypes:true})){const file=directory+'/'+item.name;if(item.isDirectory())await addPublicCode(file);else if(/\.(?:m?js|css)$/.test(file)&&!manifest.files.some(row=>row.path==='/'+file)){const bytes=await readFile(path.join(root,file));manifest.files.push({path:'/'+file,sha256:hash(bytes),bytes:bytes.length,essential:false});}}}
await addPublicCode('js');await addPublicCode('css');
const requests=[],errors=[],checks=[],writes=[],missingResources=new Set();
const check=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label);};
const fixtures={
 'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},'loot-shop/balance':{pigCoins:0},
 messages:{messages:[{id:1,message_type:'SUPPORT_BANK_ACCOUNT',title:'후원 계좌 안내',body:'은행 계좌 비공개 검수 값',is_read:0,cleanupEligible:1},{id:2,message_type:'SYSTEM',title:'49,800원 패키지 구매 처리',body:'후원 상품 기록',is_read:0,cleanupEligible:1},{id:3,message_type:'SYSTEM',title:'일반 공지 확인',body:'모험을 시작하세요.',is_read:0,cleanupEligible:1}],unread:3,cleanupCount:3},
 'chief/status':{chief:null},'shell/summary':{inventory:{},messages:{unread:3}},'me/menu-favorites':{userId:4242,routes:[]},'live-operations':{items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:true,enabled:true,cards:[],loadouts:[]},'pvp/config':{settings:{enabled:true}}
};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');requests.push(url.pathname);
  if(req.headers.origin==='https://cnine-card.pages.dev'){
   res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Credentials','true');
   res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']||'authorization,content-type');res.setHeader('Access-Control-Allow-Methods','GET,HEAD,POST,OPTIONS');
  }
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(url.pathname==='/client/windows/manifest.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(manifest));}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const part of req)chunks.push(part);const body=Buffer.concat(chunks).toString();
   if(!['GET','HEAD'].includes(req.method))writes.push({path:url.pathname,body});
   const value=url.pathname==='/api/qa-echo'?{method:req.method,authorization:req.headers.authorization,origin:req.headers.origin,body}:fixtures[url.pathname.slice(5)]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],presets:{},settings:{}};
   res.setHeader('content-type','application/json');return res.end(JSON.stringify(value));
  }
  const relative=decodeURIComponent(url.pathname);let file=path.resolve(root,'.'+relative);
  if(!file.startsWith(root+path.sep))throw Error('Outside fixture source');
  if((await stat(file)).isDirectory())file=path.join(file,'index.html');
  res.setHeader('content-type',{'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{missingResources.add(new URL(req.url,'http://127.0.0.1').pathname);res.statusCode=404;res.end('');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const app=await _electron.launch({executablePath:path.join(build,'node_modules/electron/dist/electron.exe'),args:[build,'--mute-audio'],env:{...process.env,SOOPKETMON_QA:'1',SOOPKETMON_QA_ROOT:profile,SOOPKETMON_QA_SERVER:`http://127.0.0.1:${server.address().port}`},timeout:30000});
let launcher,game;
try{
 await app.context().addInitScript(user=>{try{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','onestore-local-qa');}catch{}},user);
 app.on('window',page=>page.on('pageerror',e=>errors.push(e.message)));
 launcher=await app.firstWindow();launcher.setDefaultTimeout(30000);
 await app.evaluate(({session},partition)=>session.fromPartition(partition).webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>{const url=new URL(details.url);callback({cancel:!['http:','https:'].includes(url.protocol)||!['cnine-card.pages.dev','127.0.0.1'].includes(url.hostname)});}),configuration.sessionPartition);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
 await launcher.waitForFunction(()=>['available','error'].includes(document.querySelector('#statusTitle')?.textContent)||document.querySelector('#playLabel')?.textContent==='다운로드');
 await launcher.evaluate(()=>soopLauncher.command('install'));
 await launcher.waitForFunction(()=>document.querySelector('#playLabel')?.textContent==='게임 시작');
 check((await launcher.locator('body').innerText()).includes('ONE STORE'),'launcher displays ONE store channel');
 check(await launcher.locator('[data-command="website"]').count()===0,'launcher has no unrestricted website button');
 await launcher.screenshot({path:path.join(output,'launcher-ready.png')});
 const opened=app.waitForEvent('window');await launcher.evaluate(()=>soopLauncher.command('play'));game=await opened;game.setDefaultTimeout(30000);
 game.on('response',response=>{if(response.status()>=400)console.log('HTTP '+response.status()+' '+response.url());});
 game.on('requestfailed',request=>console.log('FAILED '+request.url()+' '+request.failure()?.errorText));
 await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.webContents.setBackgroundThrottling(false);});
 await game.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='home');
 check(game.url().endsWith(configuration.startUrl),'game opens permanent store start URL');
 check(await game.evaluate(()=>navigator.userAgent.includes('ReverseCallStore/onestore/1.0.0')&&/^[\x20-\x7e]+$/.test(navigator.userAgent)),'native User-Agent identifies store with ASCII text');
 check(await game.evaluate(()=>typeof require==='undefined'&&typeof process==='undefined'),'game keeps Node isolation');
 for(const [width,height] of [[1440,960],[1120,760]]){
  await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev')).setSize(width,height),{width,height});
  await game.evaluate(()=>SoopketmonV21ExactShell.openAll());
  await game.waitForFunction(()=>document.querySelector('soop-adventure-lobby')?.shadowRoot.querySelector('#menu-dialog')?.open);
  check(!/후원|시즌패스|서버 안내|승부예측|포로수용소/.test(await game.evaluate(()=>document.querySelector('soop-adventure-lobby').shadowRoot.textContent)),width+' menu omits excluded features');
  await game.screenshot({path:path.join(output,`game-menu-${width}.png`)});
  await game.evaluate(()=>document.querySelector('soop-adventure-lobby').shadowRoot.querySelector('#menu-dialog').close());
 }
 for(const route of ['prediction','prisoncamp','seasonPass']){
  await game.evaluate(route=>SoopketmonV21ExactShell.navigate(route),route);
  check(await game.evaluate(()=>SoopketmonV21ExactShell.currentRoute)==='home','direct navigation blocked: '+route);
 }
 await game.evaluate(()=>SoopketmonV21ExactShell.navigate('messages'));
 console.log('Message route '+JSON.stringify(await game.evaluate(()=>({route:SoopketmonV21ExactShell.currentRoute,text:document.querySelector('#app')?.innerText.slice(0,1800)}))));
 await game.waitForFunction(()=>document.querySelector('#messageList')?.textContent.includes('일반 공지 확인'));
 check(await game.locator('#messageList .user-message').count()===1,'ordinary message remains and excluded records stay hidden');
 check(await game.locator('#deleteCompletedMessages').count()===0,'hidden live messages cannot be bulk-deleted');
 check(await game.evaluate(async()=>(await (await fetch('/api/shell/summary')).json()).messages.unread)===1,'unread count excludes hidden messages');
 await game.waitForTimeout(300);await game.screenshot({path:path.join(output,'game-messages.png')});
 for(const endpoint of ['/api/coin-prediction/join','/api/prison-camp/release','/api/prison-death-game/start','/api/server-support/apply','/api/supporter-season-pass/claim','/admin/']){
  const status=await app.evaluate(async({BrowserWindow},endpoint)=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://cnine-card.pages.dev'));return (await win.webContents.session.fetch('https://cnine-card.pages.dev'+endpoint,{method:'POST',body:'{}',bypassCustomProtocolHandlers:false})).status;},endpoint);
  check(status===403,'native protocol blocks without page JavaScript: '+endpoint);
 }
 const echo=await game.evaluate(async()=>await(await fetch('/api/qa-echo',{method:'POST',headers:{authorization:'fixture-only-token','content-type':'application/json'},body:'{"value":42}'})).json());
 check(echo.method==='POST'&&echo.authorization==='fixture-only-token'&&echo.origin==='https://cnine-card.pages.dev'&&echo.body==='{"value":42}','normal API method, auth, origin and body preserved');
 await game.evaluate(()=>SoopketmonV21ExactShell.navigate('inventory'));
 await game.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='inventory');check(true,'ordinary inventory opens');
 await game.goto('https://cnine-card.pages.dev/index?source=windows-client');
 await game.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='home');
 check(!requests.includes('/index'),'canonical index stays in bundled store content');
 check(await game.evaluate(()=>navigator.userAgent.includes('ReverseCallStore/onestore/')),'store identity survives reload without query parameter');
 const count=app.windows().length;await game.evaluate(()=>window.open('/admin/','forbidden-store-popup'));await game.waitForTimeout(200);check(app.windows().length===count,'forbidden popup is rejected');
 await game.close();await launcher.waitForFunction(()=>document.querySelector('#playLabel')?.textContent==='게임 시작');
 const reopened=app.waitForEvent('window');await launcher.evaluate(()=>soopLauncher.command('play'));game=await reopened;
 await game.waitForFunction(()=>document.querySelector('#app main.page')?.dataset.route==='home');check(true,'game closes and reopens from launcher');
 check(!requests.some(p=>/coin-prediction|prison-camp|prison-death-game|server-support|supporter-season-pass|^\/admin/.test(p)),'no excluded request reached fixture network');
 check(!writes.some(r=>/messages|server-support/.test(r.path)),'no live message cleanup or support mutation');
 check(errors.length===0,'no page errors: '+errors.join(' | '));
 const report={passed:checks.length,checks,profile,configuration,errors,missingResources:[...missingResources],interceptedWrites:writes,realServerWrites:0,method:'Actual staged Electron client with isolated local API and public-file fixtures; all windows hidden'};
 await writeFile(path.join(output,'native-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,errors,missingResources:missingResources.size,realServerWrites:0}));
}catch(error){
 await launcher?.screenshot({path:path.join(output,'launcher-failure.png'),timeout:2000}).catch(()=>{});await game?.screenshot({path:path.join(output,'game-failure.png'),timeout:2000}).catch(()=>{});
 await writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack),checks,errors,requests,missingResources:[...missingResources],writes},null,2));throw error;
}finally{await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
