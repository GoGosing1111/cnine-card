// Real lobby, chief console and locked prison screen with isolated API fixtures.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CHIEF_PRISON_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'chief-prison-qa-'));
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
  if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  try{const data=fs.readFileSync(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const size=viewport.width+'x'+viewport.height,page=await browser.newPage({viewport,serviceWorkers:'block'}),writes=[];
  let locked=false,command=null,ack=false,isChief=true;
  const user={id:7,serverUserId:7,nickname:'검수 집권자',role:'USER',coin:123456,cardShards:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
  const chief={active:true,status:'ACTIVE',isChief:true,userId:7,reignStyle:'GENERAL',nickname:'검수 집권자',ordinal:10,startsAt:new Date(Date.now()-86400000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),remainingMs:86400000,inaugurationVersion:1};
  const jailedUntil=new Date(Date.now()+3600000).toISOString().slice(0,19).replace('T',' ');
  const prison=()=>locked?{incarcerated:true,facility:'PRISON',reason:'검수 수감 사유',jailedAt:new Date().toISOString(),jailedUntil,jailedByNickname:'검수 집권자',remainingSeconds:3600}:{incarcerated:false};
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','chief-prison-local-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),key=url.pathname.slice(5),method=route.request().method();let data;
    if(method==='POST'&&key==='chief/prison'){const body=route.request().postDataJSON();writes.push(body);data={ok:true,user:{id:8,nickname:'대상 유저'},durationMinutes:body.durationMinutes,reason:body.reason};}
    else if(key==='user/runtime-command'){if(method==='POST')ack=true;data={command:ack?null:command,prison:prison()};}
    else if(key==='chief/prison/users')data={users:[{id:8,nickname:'대상 유저'}]};
    else if(key==='prison/status')data={prison:prison(),inmates:[{userId:7,nickname:user.nickname,reason:'검수 수감 사유',jailedUntil}],messages:[],viewer:user,access:{},serverNow:new Date().toISOString()};
    else data={
      'service/status':{maintenance:{active:false}},'me/summary':{user,prison:prison()},me:{user,prison:prison()},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
      'chief/status':{chief:{...chief,isChief}},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},'burning-event/status':{enabled:false},'magic/status':{visible:false},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
    }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
    await route.fulfill({json:data});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('soop-adventure-lobby').waitFor();
  if(await page.locator('#chiefElectionPopup').count())await page.locator('#chiefPopupClose').click();
  await page.locator('soop-adventure-lobby').locator('#chief-shortcut').click();
  await page.locator('[data-v21-chief-system]').click();
  try{await page.locator('[data-chief-prison]').click({timeout:10000});}catch(error){await page.screenshot({path:path.join(out,'entry-failure.png')});console.log(await page.evaluate(()=>({chief:document.getElementById('chiefMainRoot')?.outerHTML,context:typeof runtimeCommandContext==='undefined'?null:runtimeCommandContext,body:document.body.innerText.slice(-4500)})));console.log(errors);throw error;}
  const form=page.locator('.chief-prison-dialog');await form.locator('.chief-prison-status').filter({hasText:'닉네임을 검색'}).waitFor();
  await form.locator('#chiefPrisonQuery').fill('대상');await form.locator('[data-chief-prison-search] button').click();await form.locator('[data-target="8"]').click();
  await form.locator('#chiefPrisonReason').fill('검수 수감 사유');
  check(await form.evaluate(el=>el.open&&el.matches(':modal')&&el.scrollWidth<=el.clientWidth+1),size+' chief form is accessible and fits viewport');
  await page.screenshot({path:path.join(out,'chief-form-'+size+'.png')});
  await form.locator('.chief-prison-submit').click();await form.locator('.chief-prison-status').filter({hasText:'60분 동안 감옥에 수감했습니다'}).waitFor();
  check(writes.length===1&&writes[0].userId===8&&writes[0].durationMinutes===60&&writes[0].reason==='검수 수감 사유'&&writes[0].requestId.length===36,size+' explicit selected target and receipt submitted once');
  await form.locator('[data-chief-prison-close]').click();
  locked=true;command={id:100,type:'PRISON_LOCK',payload:{source:'CHIEF',message:'최고사령부에서 당신을 체포하였습니다',reason:'검수 수감 사유',durationMinutes:60,jailedUntil}};
  await page.evaluate(()=>pollRuntimeCommand());
  await page.locator('[data-cnine-prison-lock="1"]').waitFor();const notice=page.locator('#chiefArrestNotice');await notice.waitFor();
  check(await notice.locator('h2').textContent()==='최고사령부에서 당신을 체포하였습니다',size+' online arrest shows exact notice after moving to prison');
  check(await notice.evaluate(el=>el.matches(':modal')&&el.scrollWidth<=el.clientWidth+1),size+' arrest popup fits viewport');
  await page.screenshot({path:path.join(out,'arrest-'+size+'.png')});
  await notice.locator('button').click();await page.evaluate(()=>pollRuntimeCommand());check(await notice.count()===0,size+' acknowledged command does not reopen popup');
  ack=false;command={...command,id:101};await page.reload({waitUntil:'domcontentloaded'});await notice.waitFor();
  check(await page.locator('[data-cnine-prison-lock="1"]').count()===1,size+' locked login also opens pending arrest notice');await notice.locator('button').click();
  isChief=false;locked=false;ack=true;await page.reload({waitUntil:'domcontentloaded'});await page.locator('soop-adventure-lobby').waitFor();
  await page.locator('soop-adventure-lobby').locator('#chief-shortcut').click();await page.locator('[data-v21-chief-system]').click();
  check(await page.locator('[data-chief-prison]').count()===0,size+' non-chief has no arrest action');await page.close();
 }
 check(errors.length===0,'no application JavaScript errors: '+errors.join(' | '));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
