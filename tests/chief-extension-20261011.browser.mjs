// Real application loader and dedicated popup with local, isolated API fixtures.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.CHIEF_EXTENSION_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'chief-extension-qa-'));
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  if(req.url==='/admin-chief-fixture'){
    res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/admin/chief-admin-v1.css"><style>body{background:#0d151e;color:white;font:14px sans-serif;margin:30px}.view[hidden]{display:none}nav{position:fixed;width:190px}main,h1{margin-left:220px}</style><nav id="nav"></nav><h1 id="pageTitle"></h1><main></main><script src="/admin/chief-admin-v1.js"></script>');return;
  }
  const requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
  if(!file.startsWith(root)){res.writeHead(403);res.end();return}
  try{res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file))}catch{res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label)};
const notice={id:'diim-term-extension-20261011',appointmentId:'diim-10th',userId:4773,nickname:'진짜디임',ordinal:10,days:7,previousEndsAt:'2026-10-12T15:09:51.000Z',endsAt:'2026-10-19T15:09:51.000Z'};
try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}].filter(v=>!process.env.CHIEF_EXTENSION_QA_ADMIN_ONLY&&(!process.env.CHIEF_EXTENSION_QA_WIDTH||v.width===Number(process.env.CHIEF_EXTENSION_QA_WIDTH)))){
    const page=await browser.newPage({viewport,serviceWorkers:'block'}),size=viewport.width+'x'+viewport.height;
    let receipt=null,claims=0,lost=false,published=viewport.width!==320;
    const user={id:4242,serverUserId:4242,nickname:'검수 플레이어',role:'USER',coin:1000,cardShards:0,masterStars:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
    const chief={active:true,status:'ACTIVE',reignStyle:'GENERAL',ordinal:10,nickname:'진짜디임',startsAt:'2026-10-05T15:09:51.000Z',endsAt:notice.endsAt,remainingMs:8*86400000,userId:4773};
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(user=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(user));localStorage.setItem('cnine_card_api_token','chief-extension-local-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1')},user);
    await page.route('**/api/**',async route=>{
      const key=new URL(route.request().url()).pathname.slice(5),method=route.request().method();let data;
      if(key==='chief/extension-notice'){
        if(method==='POST'){
          claims++;const body=route.request().postDataJSON();receipt ||= body.requestId;
          if(viewport.width===390&&!lost){lost=true;await route.abort();return}
          data={show:receipt===body.requestId,notice,complete:true};
        }else data={notice:published&&!receipt?notice:null,complete:Boolean(receipt)};
      }else data={
        'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'chief/status':{chief},
        'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false},alchemyFeature:{visible:false}},'burning-event/status':{enabled:false},'magic/status':{visible:false},'pvp/config':{settings:{enabled:true}},'streamer-profiles':{enabled:false,profiles:[]}
      }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
      await route.fulfill({json:data});
    });
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('soop-adventure-lobby').waitFor();
    if(!published){
      await page.evaluate(()=>document.body.classList.add('battle-running'));published=true;
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(1700);
      check(claims===0&&await page.locator('#chiefExtensionNotice').count()===0,'connected user queues the notice without interrupting battle');
      await page.evaluate(()=>document.body.classList.remove('battle-running'));
    }
    const dialog=page.locator('#chiefExtensionNotice[open]');await dialog.waitFor({timeout:20000});
    await page.evaluate(()=>document.fonts.ready);
    check(await dialog.evaluate(el=>el.matches(':modal')),size+' accessible top-layer dialog');
    check(await dialog.locator('img').evaluate(el=>el.complete&&el.naturalWidth===1024),size+' generated art is loaded before display');
    check(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),size+' no horizontal overflow');
    check((await dialog.innerText()).includes('2026년 10월 20일'),size+' real new term rendered in KST');
    check(await dialog.evaluate(el=>el.getBoundingClientRect().top>=0&&el.getBoundingClientRect().bottom<=innerHeight+1),size+' dialog fits viewport');
    await page.screenshot({path:path.join(out,'popup-'+size+'.png')});
    if(viewport.width<680){await dialog.locator('.chief-extension-confirm').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'popup-footer-'+size+'.png')})}
    await dialog.locator('.chief-extension-confirm').click();await dialog.waitFor({state:'detached'});
    check(claims===(viewport.width===390?2:1),size+' one presentation, including same-request retry after lost response');
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('soop-adventure-lobby').waitFor();await page.waitForTimeout(1800);
    check(await page.locator('#chiefExtensionNotice').count()===0,size+' refresh does not repeat a server-acknowledged notice');
    await page.close();
  }
  if(!process.env.CHIEF_EXTENSION_QA_WIDTH){
    const page=await browser.newPage({viewport:{width:1024,height:900}});let extension=null,posted=null;
    const chief={active:true,status:'ACTIVE',userId:4773,appointmentId:'diim-10th',nickname:'진짜디임',ordinal:10,endsAt:notice.previousEndsAt,remainingMs:86400000,usage:{}};
    await page.route('**/api/**',async route=>{
      if(route.request().method()==='POST'){posted=route.request().postDataJSON();extension={...notice,announcedAt:new Date().toISOString()};chief.endsAt=notice.endsAt;await route.fulfill({json:{ok:true,receipt:extension}})}
      else await route.fulfill({json:{chief,extension,users:[],canExtend:true}});
    });
    await page.goto(base+'/admin-chief-fixture');await page.getByRole('button',{name:'족장 관리 COUNCIL'}).click();
    await page.locator('#chiefExtendDiimBtn').waitFor();
    page.on('dialog',async dialog=>{if(dialog.type()==='confirm'){check(dialog.message().includes('정확히 7일'),'CMS confirms exact seven-day addition');await dialog.accept()}else await dialog.dismiss()});
    await page.locator('#chiefExtendDiimBtn').click();await page.getByText('특별 담화 공개 · 임기 7일 연장 완료').waitFor();
    check(posted.appointmentId==='diim-10th'&&posted.endsAt===notice.previousEndsAt,'CMS submits the existing appointment and original end');
    check(await page.locator('#chiefExtendDiimBtn').count()===0,'CMS replaces the apply button with the completed receipt');
    check(await page.locator('.chief-admin-current>div').evaluate(el=>el.clientWidth>350),'CMS receipt remains readable at a 1024px viewport with sidebar');
    await page.screenshot({path:path.join(out,'cms-completed.png')});await page.close();
  }
  check(errors.length===0,'no application JavaScript errors: '+errors.join(' | '));
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));
  console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
