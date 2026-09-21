// Local-only real CMS component + server settings roundtrip; never accesses production accounts.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {JointSQLiteDB} from '../tests/helpers/joint-db.mjs';
import {readWeeklyRaidCms,saveWeeklyRaidCms} from '../functions/_raid_weekly_cms_v2141.js';
import {defaultRaidSettingsV1293} from '../functions/_raid_overhaul.js';

const db=new JointSQLiteDB(),env={DB:db},root=process.cwd();
db.sql.exec(`CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE raid_bosses(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,image_url TEXT,max_hp INTEGER,defense_rate REAL,is_active INTEGER,sort_order INTEGER,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);`);
let writes=0;
const snapshot=async()=>({weekly:await readWeeklyRaidCms(env),settings:defaultRaidSettingsV1293()});
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/admin/raid'){
      res.setHeader('Content-Type','application/json');
      if(req.method==='PATCH'){let body='';for await(const chunk of req)body+=chunk;const weekly=await saveWeeklyRaidCms(env,{id:1,role:'OWNER'},JSON.parse(body).weekly);writes++;res.end(JSON.stringify({weekly}));}
      else res.end(JSON.stringify(await snapshot()));
      return;
    }
    if(url.pathname==='/qa/'){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>주간 레이드 CMS 검수</title><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/raid-overhaul-v1293.css"><link rel="stylesheet" href="/admin/raid-weekly-cms-v2141.css"><style>body{background:#08111f;margin:0;padding:24px;color:#e7efff;font-family:Arial,sans-serif}main{max-width:1200px;margin:auto}.panel{min-width:0}#qa-result{white-space:pre-wrap} @media(max-width:520px){body{padding:8px}}</style></head><body><main><div id="view-raid"><div id="raidV1293Shell"></div></div><pre id="qa-result">검수 중</pre></main><script>
window.qaErrors=[];window.addEventListener('error',e=>qaErrors.push(e.message));
const state={raidData:${JSON.stringify(await snapshot())}};async function loadRaidAdmin(){return state.raidData}async function api(route,options){const r=await fetch('/api/'+route,options);const data=await r.json();if(!r.ok)throw Error(data.error);return data;}
</script><script src="/admin/raid-weekly-cms-v2141.js"></script><script>
async function verify(){try{
 const one=s=>document.querySelector(s);const form=one('[data-wk-boss="ICHIGO"]');form.open=true;
 one('[data-wk-day="2"]').value='ICHIGO';form.querySelector('[data-wk-field="attack"]').value='9123';
 form.querySelector('[data-wk-field="every"]').value='3';form.querySelector('[data-wk-field="hp0"]').value='333333';
 form.querySelector('[data-wk-bundle="participation"] [data-wk-field="COIN"]').value='10000000000';
 form.querySelector('[data-wk-bundle="clear"] [data-wk-field="CORE_RAID_ENTRY_TICKET"]').value='7';
 const before=state.raidData.weekly.config.revision;one('[data-wk-save]').click();
 for(let i=0;i<100&&state.raidData.weekly.config.revision===before;i++)await new Promise(resolve=>setTimeout(resolve,100));
 const saved=state.raidData.weekly.config,ichigo=saved.bosses.ICHIGO;
 const result={saved:saved.revision!==before,rotation:saved.rotation[2],attack:ichigo.bossAttackPower,every:ichigo.ultimate.everyAttacks,minion:ichigo.minions[0].maxHp,coin:ichigo.rewards.participation.find(x=>x.type==='COIN').amount,core:ichigo.rewards.clear.find(x=>x.type==='CORE_RAID_ENTRY_TICKET').amount,bossCount:document.querySelectorAll('[data-wk-boss]').length,dayCount:document.querySelectorAll('[data-wk-day]').length,overflow:document.documentElement.scrollWidth>innerWidth,errors:qaErrors};
 const over=one('[data-wk-boss="ICHIGO"] [data-wk-bundle="participation"] [data-wk-field="COIN"]');over.value='10000000001';result.rejectsOverCap=!over.checkValidity();over.value='10000000000';
 one('#qa-result').textContent=JSON.stringify(result);document.documentElement.dataset.qa='complete';
}catch(e){document.querySelector('#qa-result').textContent=JSON.stringify({error:e.message});document.documentElement.dataset.qa='complete';}}
setTimeout(verify,200);
</script></body></html>`);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(file);res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.html':'text/html'})[path.extname(file)]||'application/octet-stream');res.end(data);
  }catch(error){res.writeHead(error.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const output=await mkdtemp(path.join(tmpdir(),'cnine-raid-cms-v2141-'));
const browser=process.env.QA_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await stat(browser);
try{
  for(const [label,width,height] of [['desktop',1440,1100],['mobile',390,844]]){
    const capture=path.join(output,label+'.png');
    const debugPort=22000+Math.floor(Math.random()*20000);
    const child=spawn(browser,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--hide-scrollbars','--disable-extensions','--remote-debugging-port='+debugPort,'--user-data-dir='+path.join(output,label+'-profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
    let targets;
    for(let i=0;i<100&&!targets;i++){try{targets=await fetch(`http://127.0.0.1:${debugPort}/json`).then(r=>r.json());}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
    assert.ok(targets,'Headless browser did not start');
    const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl),pending=new Map();let id=0;
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    ws.addEventListener('message',event=>{const data=JSON.parse(event.data),job=pending.get(data.id);if(job){pending.delete(data.id);data.error?job.reject(Error(data.error.message)):job.resolve(data.result);}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
    let result;
    try{
      await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:label==='mobile'});
      await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/qa/`});
      for(let i=0;i<100&&!result;i++){
        const out=await send('Runtime.evaluate',{expression:"document.documentElement.dataset.qa==='complete'?document.querySelector('#qa-result').textContent:null",returnByValue:true});
        if(out.result?.value)result=JSON.parse(out.result.value);else await new Promise(resolve=>setTimeout(resolve,100));
      }
      const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(capture,Buffer.from(shot.data,'base64'));
    }finally{ws.close();child.kill();}
    assert.ok(result,'CMS verification did not finish');
    assert.equal(result.saved,true,JSON.stringify(result));assert.equal(result.rotation,'ICHIGO');assert.equal(result.attack,9123);assert.equal(result.every,3);assert.equal(result.minion,333333);assert.equal(result.coin,10000000000);assert.equal(result.core,7);assert.equal(result.bossCount,3);assert.equal(result.dayCount,7);assert.equal(result.overflow,false);assert.equal(result.rejectsOverCap,true);assert.deepEqual(result.errors,[]);
    console.log(JSON.stringify({label,...result,capture}));
  }
  assert.equal(writes,2);
}finally{server.close();db.sql.close();}
