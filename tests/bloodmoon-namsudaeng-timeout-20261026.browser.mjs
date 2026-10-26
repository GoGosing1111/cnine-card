// Actual main loader/buttons and authored skill playback, with isolated API/SQLite.
// The fixture narrows a server-generated battle to the three affected skills.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {namsudaengDeploymentSnapshot,NAMSUDAENG_EVENT,NAMSUDAENG_SKILLS} from '../shared/mercenary-bloodmoon-namsudaeng-v1.mjs';
import {createPveBattleV2,createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import {apocalypseFixture} from './helpers/apocalypse-fixture.mjs';
import {reserveApocalypseBattle,registerApocalypseChallenge,apocalypseChallengeAction} from '../functions/_apocalypse_challenge.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};

const root=process.cwd(),out=process.env.QA_OUT,publicBase=process.env.QA_PUBLIC_BASE||'',baseline=process.env.QA_BASELINE==='1';
assert(out&&!path.resolve(out).startsWith(root+path.sep));fs.mkdirSync(out,{recursive:true});
if(publicBase)assert.equal(new URL(publicBase).hostname,'cnine-card.pages.dev');
const oldWrapper=baseline?execFileSync('git',['show','fc9d81758:js/battle-v3-live.js'],{encoding:'utf8'}):null;
const ids=['CN-02D9DC1E8A8A4209','CN-F500880B2ED34350','CN-519C181C18DF4B8E','CN-BE9EB8304A744ECF','CN-48BBCAC81D0E44FA'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const user={id:2,serverUserId:2,nickname:'남수댕 연출 검수',role:'USER',coin:100,pigCoin:0,masterStars:0,owned:ids,quantities:Object.fromEntries(ids.map(id=>[id,1])),breakthroughs:{},testCoinGrantedV13:true};
const energy={energy:100,maxEnergy:100,costPerBattle:1,unlimited:true};
const payload=mode=>{
 const mercenary={...namsudaengDeploymentSnapshot(),combat:fixture.combat};
 const battleV2=mode==='PVP'?createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:mercenary,seed:77}):createPveBattleV2({cards:deck,mercenary,monster:{id:76,name:'검수 보스',battle_power:1.6e10},seed:77});
 const skills=battleV2.result.timeline.filter(e=>e.type===NAMSUDAENG_EVENT).slice(0,3);
 assert.deepEqual(skills.map(e=>e.skillId),NAMSUDAENG_SKILLS.map(s=>s.id));
 // Retain normal opening actions: the authored effect warms asynchronously.
 // Removing every opening action makes ordinary battles exercise only the
 // intentional immediate-damage fallback, rather than the affected animation.
 const firstSkill=battleV2.result.timeline.findIndex(e=>e.type===NAMSUDAENG_EVENT);
 battleV2.result.timeline=[...battleV2.result.timeline.slice(0,firstSkill),...skills,battleV2.result.timeline.findLast(e=>e.type==='RESULT')];
 return {battleV2,result:'WIN',user,energy,reward:0,coinReward:0,scoreAfter:1000,scoreChange:0,attackerPower:1e8,defenderPower:1e8};
};
const f=await apocalypseFixture(),missing=[],publicFiles=new Map(),reports=[];let latestAttempt;
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/qa-api/')){
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}'),route=url.pathname.slice(8);
  if(route==='battle/fight'){
   latestAttempt=body.requestId;const data=payload('APOCALYPSE');
   await reserveApocalypseBattle(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:76});
   const challenge=await registerApocalypseChallenge(f.env,{userId:2,requestId:body.requestId,runToken:body.apocalypseRunToken,monsterId:76,won:true,battleV2:data.battleV2,plan:{reward:0,card:null,items:[],magic:null,unified:null,bonuses:{coin:0,masterStars:0,mysticEnergy:0}},log:{ids,playerPower:1e8,monsterPower:1.6e10}});
   return json(res,{...data,result:'PENDING',apocalypseChallenge:challenge,difficulty:{isApocalypse:true,difficulty:'APOCALYPSE'},energyKind:'APOCALYPSE'});
  }
  return json(res,{...await apocalypseChallengeAction(f.env,user,route.split('/').at(-1),body),serverNow:Date.now(),user});
 }
 if(url.pathname.startsWith('/api/'))return json(res,{maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60});
 if(oldWrapper&&url.pathname==='/js/battle-v3-live.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(oldWrapper);}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key,{signal:AbortSignal.timeout(30000)});assert(r.ok,key+': '+r.status);return {type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(200,{'content-type':r.type||'application/octet-stream'});return res.end(r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){json(res,{error:e.message,code:e.code},e.status||500);}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']});
try{
 for(const width of baseline||publicBase?[390]:[1440,390]){
  const context=await browser.newContext({viewport:{width,height:width<600?844:1000},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'}),page=await context.newPage(),errors=[],dialogs=[],warnings=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
  page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('[V3 LIVE]'))warnings.push(m.text());});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');});
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof renderShell==='function');
  for(const mode of baseline||publicBase?['APOCALYPSE']:['APOCALYPSE','PVE','PVP']){
   const data=payload(mode);
   await page.evaluate(async({data,deck,mode,user,energy})=>{
    API_MODE=true;API_TOKEN='local-test-only';cards=deck;window.cnineCardCatalog=()=>deck;setPveViewMode('hunt');
    localStorage.setItem(STORAGE_KEY,JSON.stringify(user));
    const apocalypse=mode==='APOCALYPSE',config={settings:{enabled:true},deck:deck.map(c=>c.id),battleEngine:{active:true,version:'V3'},energy,apocalypseEnergy:energy,profile:{season_score:1000},monsters:[{id:76,name:'검수 보스',battlePower:1.6e10,rewardCoin:0,isBoss:true,...(apocalypse?{pveTab:'APOCALYPSE',pve_difficulty:'APOCALYPSE'}:{})}],rankedSeries:{codes:['V-960','V-961','V-962'],cards:[],ready:true,ownedCount:3,revision:1}};
    window.entryRequests=[];apiRequest=async(route,options={})=>{
     entryRequests.push({route,method:options.method||'GET'});
     if(route==='battle/config'||route==='pvp/config')return structuredClone(config);
     if(route.startsWith('battle/apocalypse-challenge/')||(apocalypse&&route==='battle/fight')){const r=await fetch('/qa-api/'+route,{method:'POST',headers:{'content-type':'application/json'},body:options.body});const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error),value);return value;}
     if(route==='battle/fight'||route==='pvp/fight')return structuredClone(data);
     if(route==='pvp/match')return {opponent:{id:3,nickname:'검수 상대'},token:'local-test-token'};
     return {items:[],cards:[],operations:[],enabled:false,visible:false,user};
    };
    await ensureFeatureResources('battleV2');
    window.skillPlayback=[];window.completedEvents=[];
    if(!window.namsudaengQaInstalled){
     const api=ProjectVPixiBattle,mount=api.mountForBattle;api.mountForBattle=async(...args)=>{
      const e=await mount(...args);
      if(!e.namsudaengQaInstalled){
       const playEvents=e.playEvents.bind(e);e.playEvents=async(events,options)=>{const result=await playEvents(events,options);completedEvents.push(...events.map(event=>event.type));return result;};
       const play=e.playMercenaryEvent.bind(e);e.playMercenaryEvent=async event=>{
        if(event.type!=='MERCENARY_BLOODMOON_ARROW')return play(event);
        const started=performance.now(),applied=[],sync=e.syncTargetHp;e.syncTargetHp=function(target,value){applied.push(target.id);return sync.call(this,target,value);};
        try{return await play(event);}finally{e.syncTargetHp=sync;skillPlayback.push({skill:event.skillId,elapsedMs:performance.now()-started,last:structuredClone(e.lastMercenaryPlayback),applied,targets:event.hits.length,states:[...e.namsudaengStates.values()].map(s=>s.fx.diagnostics())});}
       };e.namsudaengQaInstalled=true;
      }return e;
     };
     window.namsudaengQaInstalled=true;
    }
    if(mode==='PVP'){pvpState.tab='match';renderShell('pvp');}else{battleState.reuseBattleSnapshot=false;renderShell('battle');}
   },{data,deck,mode,user,energy});
   if(mode==='APOCALYPSE')await page.locator('[data-monster-tab="APOCALYPSE"]').click();
   const start=page.locator(mode==='PVP'?'#rankedMatchStart':'#battleStart');await start.waitFor({state:'visible',timeout:15000});await start.click({timeout:20000});
   if(mode==='APOCALYPSE'){await page.locator('.apocalypse-dodge').waitFor({timeout:60000});await page.locator('.apocalypse-dodge .is-safe').click();}
   await page.waitForFunction(()=>!!document.querySelector('#pveResultConfirm,#pvpResultConfirm')||document.querySelector('#battlePhase')?.textContent==='연결 실패',null,{timeout:90000});
   const observed=await page.evaluate(()=>({skills:skillPlayback,events:completedEvents,failed:document.querySelector('#battlePhase')?.textContent==='연결 실패',message:document.querySelector('#modal')?.innerText,requests:entryRequests}));
   const saved=mode==='APOCALYPSE'?await apocalypseChallengeAction(f.env,user,'status',{requestId:latestAttempt}):null;
   fs.writeFileSync(path.join(out,width+'-'+mode+'-observed.json'),JSON.stringify({observed,settlement:saved?.status,errors,dialogs,warnings},null,2));
   await page.screenshot({path:path.join(out,(baseline?'baseline-':'')+width+'-'+mode+'.png')});
   assert.equal(observed.failed,baseline,observed.message);
   if(baseline){assert.match(observed.message,/혈월 연사 연출이 지연되어 다음 행동으로 이동했습니다/);assert.equal(saved.status,'FAILED');}
   else{
    assert.deepEqual(observed.skills.map(s=>s.skill),NAMSUDAENG_SKILLS.map(s=>s.id));
    for(const s of observed.skills){assert.equal(s.last.code,'V-965');assert.equal(s.last.playbackRate,2);assert.equal(s.last.damageApplications,s.targets);assert.equal(s.applied.length,s.targets);assert.equal(new Set(s.applied).size,s.targets);assert(s.states.length);assert(s.states.every(d=>d.mode==='idle'&&d.activeEffects===0));}
    assert.equal(observed.events.at(-1),'RESULT');assert.equal(observed.skills[1].elapsedMs>2000,true);assert.equal(observed.skills[2].elapsedMs>2500,true);
    if(saved){assert.equal(saved.status,'CLAIMED');assert.equal(observed.requests.filter(r=>r.route==='battle/apocalypse-challenge/claim').length,1);}
    const result=page.locator(mode==='PVP'?'#pvpResultConfirm':'#pveResultConfirm');await result.click();await start.waitFor({state:'visible',timeout:15000});assert.deepEqual(warnings,[]);
   }
   reports.push({width,mode,baseline,observed,settlement:saved?.status,returned:!baseline});console.log(JSON.stringify({width,mode,baseline,skills:observed.skills.map(s=>({id:s.skill,elapsedMs:Math.round(s.elapsedMs)})),settlement:saved?.status}));
  }
  assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);await context.close();
 }
 assert.deepEqual(missing,[]);fs.writeFileSync(path.join(out,baseline?'baseline-browser.json':'browser.json'),JSON.stringify({status:'PASSED',assetSource:publicBase||'local source',reports,productionTransactions:0},null,2));
}catch(error){fs.writeFileSync(path.join(out,'browser-failure.json'),JSON.stringify({error:error.stack,reports,missing},null,2));throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await f.close();}
