// Exercise the real public loader and prison renderer with isolated API fixtures.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.PRISON_QA_DIR||path.join(root,'docs/qa/prison-secret-police-20261011');fs.mkdirSync(out,{recursive:true});
const types={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const title={id:1,code:'SECRET_POLICE',name:'비밀경찰',badgeText:'비밀경찰',stylePreset:'SECRET_POLICE',fontPreset:'SERIF',image:'/assets/ui/titles/secret-police-v1.webp'};
const user={id:102,serverUserId:102,nickname:'검수 비밀경찰',role:'USER',coin:100000000000,cardShards:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const size=viewport.width,start=Date.now(),until=new Date(start+7200000).toISOString();let equipped=true;
 const messages=[{id:1,userId:101,nickname:'검수 수감자',senderWasIncarcerated:true,body:'수감 중에도 착용한 칭호가 표시됩니다.'},{id:2,userId:102,nickname:'검수 비밀경찰',senderWasIncarcerated:false,body:'방문객 비밀경찰입니다.'},{id:3,userId:103,nickname:'긴 이름의 일반 방문객 <script>',senderWasIncarcerated:false,body:'비밀경찰 칭호를 보유만 한 방문객입니다.'},{id:4,userId:104,nickname:'일반 수감자',senderWasIncarcerated:true,body:'칭호 표시는 실제 착용 기준입니다.'}];
 const personTitle=id=>equipped&&[101,102].includes(id)?title:id===104?{...title,code:'OTHER_TITLE'}:null;
 const room=()=>({prison:{incarcerated:false},inmates:[{userId:101,nickname:'검수 수감자',reason:'화면 검수',jailedUntil:until,title:personTitle(101),releasePrice:0},{userId:104,nickname:'일반 수감자',reason:'표시 없음 확인',jailedUntil:until,title:personTitle(104),releasePrice:0}],viewer:{...user,title:personTitle(102)},access:{canSetReleasePrice:false},messages:messages.map(m=>({...m,createdAt:new Date(start).toISOString(),title:personTitle(m.userId)})),chatEnabled:true,serverNow:new Date().toISOString()});
 const page=await browser.newPage({viewport,serviceWorkers:'block',reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.addInitScript(u=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','isolated-prison-title-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/api/**',async route=>{
   const request=route.request(),key=new URL(request.url()).pathname.slice(5);let data;
   if(key==='prison/status')data=room();
   else if(key==='prison/chat'&&request.method()==='POST'){const message={id:messages.length+1,userId:102,nickname:user.nickname,body:request.postDataJSON().body,senderWasIncarcerated:false};messages.push(message);data={ok:true,message:{...message,title:personTitle(102),createdAt:new Date().toISOString()}};}
   else data={'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user,prison:{incarcerated:false}},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{enabled:false},'user/runtime-command':{},'live-operations':{items:[]},'loot-shop/balance':{pigCoins:0}}[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   await route.fulfill({json:data});
  });
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.locator('main.page').waitFor();await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('prison'));await page.locator('#prisonViewerTitle .title-code-secret_police').waitFor();await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#prisonChatLog .title-code-secret_police').count(),2);assert.equal(await page.locator('#prisonInmateList .title-code-secret_police').count(),1);assert.equal(await page.locator('#prisonSceneTitle .title-code-secret_police').count(),1);
  assert.equal(await page.locator('#prisonChatLog .is-visitor').count(),2);assert.equal(await page.locator('#prisonChatLog .is-inmate').count(),2);
  const emblem=await page.locator('#prisonViewerTitle .title-code-secret_police').evaluate(el=>getComputedStyle(el,'::before').backgroundImage);assert.match(emblem,/secret-police-v1.webp/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.locator('.prison-chat').evaluate(n=>n.scrollWidth<=n.clientWidth+1));
  await page.locator('.prison-chat').screenshot({path:path.join(out,`${size}-chat.png`)});await page.locator('.prison-cell-stage').screenshot({path:path.join(out,`${size}-inmate.png`)});await page.locator('.prison-roster').screenshot({path:path.join(out,`${size}-roster.png`)});
  await page.locator('[data-prison-inmate="104"]').click();assert.equal(await page.locator('#prisonSceneTitle .title-code-secret_police').count(),0);await page.locator('[data-prison-inmate="101"]').click();assert.equal(await page.locator('#prisonSceneTitle .title-code-secret_police').count(),1);
  await page.locator('#prisonChatInput').fill('새 메시지 착용 표시');await page.locator('#prisonChatForm button').click();await page.locator('.prison-chat-message').filter({hasText:'새 메시지 착용 표시'}).locator('.title-code-secret_police').waitFor();
  equipped=false;await page.evaluate(()=>loadPrisonRoom());await page.waitForFunction(()=>document.querySelectorAll('#prisonView .title-code-secret_police').length===0,{},{timeout:12000});
  assert.equal(await page.locator('#prisonChatLog .is-visitor').count(),3);checks.push(`${size}: current title on viewer, inmate and chat; PP emblem; no false title; selection and POST update; removal after refresh; no overflow`);
 }catch(e){await page.screenshot({path:path.join(out,`${size}-failure.png`),fullPage:true});throw e;}finally{await page.close();}
}assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors,sound:'OFF',accounts:'isolated fixtures'},null,2));console.log(JSON.stringify({checks:checks.length,errors,out}));}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
