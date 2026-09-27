import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const workspace = new URL('../', import.meta.url);
const read = file => process.env.PRISON_BASELINE_REV
  ? execFileSync('git', ['show', `${process.env.PRISON_BASELINE_REV}:${file}`], {cwd:workspace, encoding:'utf8', maxBuffer:5e6})
  : fs.readFileSync(new URL(file, workspace), 'utf8');
const appSource = read('js/app.js');
const segment = (from, to) => appSource.slice(appSource.indexOf(from), appSource.indexOf(to, appSource.indexOf(from)));
const browser = await chromium.launch({channel:'chrome', headless:true});
after(() => browser.close());

async function setup(t, viewport) {
  const page = await browser.newPage({viewport, hasTouch:viewport.width<500, serviceWorkers:'block'});
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(() => {if(errors.length)t.diagnostic(JSON.stringify({errors}));});
  await page.addInitScript(() => {localStorage.setItem('cnine_battle_sound','OFF');});
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://prison.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({contentType:'text/html; charset=utf-8', body:`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/clan-prison-camp-v2083.css"><link rel="stylesheet" href="/css/prison-death-game-20260924.css"><style>body{margin:0;background:#080c17}.modal{display:none}</style><body><div id="app"></div></body></html>`});
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/css/')) {
      const file = new URL('.'+url.pathname, workspace);
      return fs.existsSync(file) ? route.fulfill({path:fileURLToPath(file)}) : route.abort();
    }
    return route.abort();
  });
  await page.goto('http://prison.test/');
  await page.addScriptTag({content:`
    const app=document.getElementById('app'), PRISON_DEFAULT_HIT_COOLDOWN_SECONDS=60;
    const qaUser={id:101,serverUserId:101,nickname:'검수 수감자',role:'OWNER'};
    const loadUser=()=>qaUser,saveUser=()=>{},mergeApiUserSummary=x=>x;
    let runtimeCommandContext='',runtimeStops=0;
    function stopRuntimeCommandPoll(){runtimeStops++;}
    function renderLogin(){throw Error('unexpected login');}
    function prisonView(){return '<section id="prisonView"><input id="prisonChatInput"></section>';}
    function bindPrisonView(){}
    function renderShell(){stopPrisonWatch();applyPrisonStatus({incarcerated:false});app.innerHTML=ClanPrisonCamp.view(qaUser);ClanPrisonCamp.bind(qaUser);}
    function prisonLogout(){}
    ${segment('const prisonUiState=', 'function prisonChatEnabled')}
    ${segment('function stopPrisonWatch()', 'function syncPrisonDom')}
    ${segment('function renderLockedPrison(', 'window.PrisonV1=')}
    window.PrisonV1={apply:applyPrisonStatus,renderLocked:renderLockedPrison};
    const API_GET_CACHE=new Map(),API_INFLIGHT=new Map(),API_CACHE_TTL={},API_GET_MICROCACHE_TTL=1000;
    let API_TOKEN='local-fixture-only',PLAYER_STATE_MUTATION_EPOCH=0;
    const apiCacheKey=x=>x,playerClientId=()=> 'prison-local-test',d1BookmarkHeader=()=>({}),rememberD1Bookmark=()=>{};
    const ACCOUNT_RANK_QUIET_MUTATIONS=/^draw$/,BATTLE_ACTION_LOCK_RETRY_PATHS=new Set();
    function clearApiCache(path){API_GET_CACHE.delete(path);}
    const now=Date.now(),stamp=t=>new Date(t).toISOString();
    window.qaPrison={incarcerated:true,facility:'CLAN_CAMP',jailedAt:stamp(now-3600000),jailedUntil:stamp(now+3600000),reason:'검수 수감'};
    window.qaPlayers=[{userId:101,nickname:'검수 수감자',status:'ALIVE',bites:0,lastSeq:0,lastBiteAt:0},{userId:102,nickname:'다른 수감자',status:'ALIVE',bites:0,lastSeq:0,lastBiteAt:0}];
    window.qaRequests=[];window.qaAssignment=null;
    const qaInmates=()=>Array.from({length:12},(_,i)=>({userId:101+i,nickname:i?'수감자 '+i:'검수 수감자',clanName:'검수 클랜',sourceType:'ADMIN',eventId:'local-event',seasonId:0,jailedAt:stamp(now-3600000),jailedUntil:stamp(now+3600000),reason:'검수 수감'}));
    function qaGame(){return {serverNow:Date.now(),round:{id:'local-round',status:'RUNNING',endsAt:Date.now()+60000,phase:{type:'READING',endsAt:Date.now()+60000}},players:qaPlayers,me:{...qaPlayers[0],nextBiteAt:0},eligibleInmates:[],canOperate:false,rules:{targetBites:24,maxPlayers:4,warningMs:650}};}
    async function fetchWithTimeout(url,options={}){
      const path=url.slice(5);qaRequests.push(path);
      let data,status=200;
      if(path==='prison-camp/status') data={serverNow:stamp(Date.now()),prison:qaPrison,inmates:qaInmates(),messages:[],viewerId:101,canRelease:true,chatEnabled:true,deathGame:qaAssignment};
      else if(path==='prison-death-game/status') data=qaGame();
      else if(path==='prison-death-game/bite'){qaPlayers[0].bites++;qaPlayers[0].lastSeq++;qaPlayers[0].lastBiteAt=Date.now();data=qaGame();}
      else if(path==='prison/status') data={prison:qaPrison,serverNow:stamp(Date.now())};
      else {status=423;data={code:'USER_INCARCERATED',error:'수감 중',prison:qaPrison};}
      return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
    }
    ${segment('async function apiRequest(', 'const RUNTIME_COMMAND_TAB_KEY=')}
    async function qaFlush(){for(let i=0;i<10;i++){await Promise.allSettled([...API_INFLIGHT.values()]);await new Promise(r=>setTimeout(r,0));if(!API_INFLIGHT.size)return;}}
  `});
  await page.addScriptTag({content:read('js/prison-death-game-20260924.js')});
  await page.addScriptTag({content:read('js/clan-prison-camp-v2083.js')});
  await page.evaluate(() => renderLockedPrison(qaPrison));
  await page.waitForFunction(() => document.querySelector('#campInmates .camp-inmate'));
  return {page, errors};
}

for (const [name,viewport] of [['PC',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
  test(`${name}: background prison responses preserve camp draft, focus and forced game input`, async t => {
    const {page,errors}=await setup(t,viewport);
    const result=await page.evaluate(async()=>{
      const input=document.getElementById('campChatInput');input.value='작성 중인 채팅';input.focus();
      const camp=document.getElementById('clanCampView'),row=document.querySelector('.camp-inmate'),button=row.querySelector('button');
      const before=qaRequests.length;
      for(let i=0;i<4;i++)await apiRequest('burning-event/status',{}, {microcache:false}).catch(()=>{});
      const draft={sameRoot:camp===document.getElementById('clanCampView'),sameInput:input===document.getElementById('campChatInput'),value:document.getElementById('campChatInput').value,focused:document.activeElement===input};
      // Manual check uses the same refresh() path as the 1.5-second camp poll.
      for(let i=0;i<3;i++){API_GET_CACHE.clear();document.querySelector('[data-camp-refresh]').click();await qaFlush();}
      const stableRoster=row===document.querySelector('.camp-inmate')&&button===document.querySelector('.camp-inmate button');
      qaAssignment={roundId:'local-round',playerStatus:'ALIVE'};
      API_GET_CACHE.clear();document.querySelector('[data-camp-refresh]').click();await qaFlush();
      const overlay=document.querySelector('.death-game-overlay'),field=document.querySelector('[data-death-playfield]');
      if(!field)return {draft,stableRoster,gameMissing:true};
      field.focus();field.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));await qaFlush();
      for(let i=0;i<4;i++)await apiRequest('chief/status',{}, {microcache:false}).catch(()=>{});
      const game={sameOverlay:overlay===document.querySelector('.death-game-overlay'),focused:field===document.activeElement,closeDisabled:document.querySelector('[data-death-close]')?.disabled};
      const activeField=document.querySelector('[data-death-playfield]');
      activeField?.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));await qaFlush();
      return {draft,stableRoster,game,bites:qaPlayers[0].bites,extraReads:qaRequests.slice(before).filter(x=>x==='prison-camp/status').length};
    });
    t.diagnostic(JSON.stringify(result));
    assert.deepEqual(result.draft,{sameRoot:true,sameInput:true,value:'작성 중인 채팅',focused:true});
    assert.equal(result.stableRoster,true);
    assert.deepEqual(result.game,{sameOverlay:true,focused:true,closeDisabled:true});
    assert.equal(result.bites,2);assert.deepEqual(errors,[]);
    const playfield=page.locator('[data-death-playfield]');
    if(name==='mobile')await playfield.tap();else await playfield.click();
    await page.waitForFunction(()=>qaPlayers[0].bites===3);
    assert.deepEqual(errors,[]);
    if(process.env.PRISON_QA_OUTPUT){fs.mkdirSync(process.env.PRISON_QA_OUTPUT,{recursive:true});await page.screenshot({path:`${process.env.PRISON_QA_OUTPUT}/${name}-game.png`});}
  });
}

test('death, a changed sentence, return to camp and release still transition exactly once', async t=>{
  const {page,errors}=await setup(t,{width:1440,height:1000});
  const result=await page.evaluate(async()=>{
    const camp=document.getElementById('clanCampView');
    const at=Date.now();qaPrison={incarcerated:true,facility:'DEATH_GAME',jailedAt:new Date(at).toISOString(),jailedUntil:new Date(at+300000).toISOString(),reason:'사망 제한'};
    await apiRequest('chief/status',{}, {microcache:false}).catch(()=>{});
    await qaFlush();
    const death=document.querySelector('.death-game-lock'),timer=death.querySelector('[data-death-lock-timer]');
    // The game receipt uses ISO dates while prison status uses SQL UTC dates.
    qaPrison={...qaPrison,jailedAt:qaPrison.jailedAt.replace('T',' ').replace('Z',''),jailedUntil:qaPrison.jailedUntil.replace('T',' ').replace('Z',''),remainingSeconds:299};
    await apiRequest('chief/status',{}, {microcache:false}).catch(()=>{});
    const sameDeath=death===document.querySelector('.death-game-lock')&&timer===document.querySelector('[data-death-lock-timer]');
    qaPrison={...qaPrison,jailedUntil:new Date(at+600000).toISOString()};
    await apiRequest('chief/status',{}, {microcache:false}).catch(()=>{});
    await qaFlush();
    const changedSentence=death!==document.querySelector('.death-game-lock');
    qaPrison={...qaPrison,facility:'CLAN_CAMP'};
    API_GET_CACHE.clear();document.querySelector('[data-death-lock-refresh]').click();await qaFlush();
    const returned=Boolean(document.querySelector('[data-cnine-prison-lock] #clanCampView'));
    qaPrison={incarcerated:false};API_GET_CACHE.clear();document.querySelector('[data-camp-refresh]')?.click();await qaFlush();
    return {entered:!camp.isConnected&&Boolean(death),sameDeath,changedSentence,returned,released:!document.querySelector('[data-cnine-prison-lock]')&&!document.body.classList.contains('prison-locked')};
  });
  t.diagnostic(JSON.stringify(result));assert.deepEqual(result,{entered:true,sameDeath:true,changedSentence:true,returned:true,released:true});assert.deepEqual(errors,[]);
});
