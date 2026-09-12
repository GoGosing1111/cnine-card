// Offline fixtures through the real Core UI, V3 renderer and touch handlers.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createCoreRaidChallenge,evaluateCoreRaidQte,validCoreRaidSubmission,coreRaidAttemptOutcome,applyCoreRaidBalanceGate} from '../functions/_raid_core_protocol.js';
import {coreMechanicEvents,MECHANICS} from '../shared/core-raid-mechanics-v2086.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://127.0.0.1:8896',out=path.resolve(process.argv[3]||'../qa-v2086-live-flow');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[],accountRequests=[],results=[];const check=(name,value=true)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
let current;
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))accountRequests.push(r.url());});
 await page.exposeFunction('verifyFixture',body=>{
  assert.equal(validCoreRaidSubmission(current.challenge,body.results),true,'actual UI trace is valid on server');
  const verified=evaluateCoreRaidQte(current.challenge,body.results);
  let outcome=coreRaidAttemptOutcome({serverWinner:current.winner||'A',qte:verified,contribution:{coreProgress:24}});
  if(current.overload)outcome=applyCoreRaidBalanceGate({room:{coreTarget:360,coreScores:{BREAK:248,BLOCK:134,STABILIZE:240}},operation:'BREAK',outcome});
  results.push({name:current.name,verified,results:body.results,outcome});
  return {ok:true,personalResult:outcome.success?'SUCCESS':'FAILED',verified,outcome};
 });
 await page.goto(base+'/preview/core-protocol-raid-v1/',{waitUntil:'networkidle'});
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const styles=[...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
 for(const href of styles)await page.addStyleTag({url:new URL(href,base+'/').href});
 await page.evaluate(()=>{window.qaOriginalBridge=CNineCoreRaidBridge;window.qaQte=ProjectVRaidQteV1924;window.qaCalls=[];window.qaResolved=0;});
 const launch=async(name,pair,extra={})=>{
  const challenge=createCoreRaidChallenge({roomId:'OFFLINE',attemptId:name,userId:1});
  challenge.mechanics=pair.map((kind,seed)=>({kind,seed,windowMs:MECHANICS[kind]?.windowMs||10000}));
  challenge.sequenceWindowMs=10000;challenge.mashWindowMs=10000;
  current={name,challenge,...extra};
  await page.evaluate(async({challenge,events,fault})=>{
   document.getElementById('modal').__battleV2Renderer?.destroy();
   document.getElementById('modal').className='modal';document.getElementById('modal').innerHTML='';
   const fixture=qaOriginalBridge.createMechanicFixture();fixture.challenge=challenge;fixture.battleV2.result.timeline=events;window.qaResolved=0;window.qaCalls=[];
   ProjectVRaidQteV1924=fault==='missing'?{...qaQte,run:undefined}:fault==='throw'?{...qaQte,run:async()=>{throw new Error('QA interrupted loader');}}:qaQte;
   CNineCoreRaidBridge={...qaOriginalBridge,apiRequest:async(p,o={})=>{
    if(p==='raid/core/battle'){const body=JSON.parse(o.body);qaCalls.push({path:p,body});if(body.clientMechanicVersion!==2086)throw Error('missing version');return structuredClone(fixture);}
    if(p==='raid/core/resolve'){qaCalls.push({path:p});qaResolved++;const r=await verifyFixture(JSON.parse(o.body));return {...r,current:(await qaOriginalBridge.apiRequest('raid/core/status')).current};}
    return qaOriginalBridge.apiRequest(p,o);
   }};
   await CoreProtocolRaidV1924.activate('core');
  },{challenge,events:coreMechanicEvents(challenge),fault:extra.fault});
  await page.locator('[data-core-action=battle]').click();
 };
 const completeKind=async kind=>{
  if(['CENTER','CIRCUIT','SHELTER'].includes(kind))await page.waitForSelector(`.cqm-overlay[data-mechanic=${kind}][data-state=running]`,{timeout:60000});
  else await page.waitForSelector(`.raid-qte-overlay[data-raid-qte=${kind}]`,{timeout:60000});
  const selector=['CENTER','CIRCUIT','SHELTER'].includes(kind)?`.cqm-overlay[data-mechanic=${kind}]`:`.raid-qte-overlay[data-raid-qte=${kind}]`;
  const art=await page.locator('[data-v3-roster-card] img').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')||''));
  check(kind+' preserves card source art under full production CSS',art.length>=5&&!art.some(p=>/battleSprite|\/characters\//i.test(p)));
  if(kind==='CENTER')for(let i=0;i<3;i++){
   await page.waitForFunction(()=>{const p=parseFloat(document.querySelector('[data-cursor]')?.style.left);return !document.querySelector('[data-action]')?.disabled&&p>=40&&p<=51;});
   if(i===0)await page.screenshot({path:path.join(out,current.name+'-center.png')});
   await page.locator('[data-action]').tap();
  }
  else if(kind==='CIRCUIT')for(let source=0;source<3;source++){
   const target=await page.locator('[data-target]').evaluateAll((nodes,source)=>nodes.findIndex(n=>n.textContent.startsWith(['Ⅰ','Ⅱ','Ⅲ'][source])),source);
   await page.locator(`[data-source="${source}"]`).tap();await page.locator(`[data-target="${target}"]`).tap();
  }
  else if(kind==='SHELTER')for(let wave=1;wave<=3;wave++){
   await page.waitForFunction(wave=>document.querySelector('[data-wave-label]')?.textContent===`WAVE 0${wave} / 03`,wave);
   await page.locator('.cqm-cell.is-safe').first().tap();
   if(wave===1)await page.screenshot({path:path.join(out,current.name+'-shelter.png')});
  }
  else if(kind==='SEQUENCE')for(const key of current.challenge.sequence)await page.locator(`[data-qte-dir=${key}]`).tap();
  else for(let i=0;i<current.challenge.mashTarget;i++){await page.locator('[data-qte-mash]').tap();await page.waitForTimeout(35);}
  await page.waitForSelector(selector,{state:'detached',timeout:18000});
 };
 for(const [name,pair,extra] of [['screen-pair',['CENTER','CIRCUIT'],{}],['shelter-direction',['SHELTER','SEQUENCE'],{}],['mash-overload',['MASH','CENTER'],{overload:true}],['engine-defeat',['CIRCUIT','SEQUENCE'],{winner:'B'}]]){
  await launch(name,pair,extra);for(const kind of pair)await completeKind(kind);
  await page.waitForSelector('.core-v3-mechanic-result',{timeout:15000});
  const body=await page.locator('.core-v3-mechanic-result').innerText();
  check(name+' sends exactly one complete pair to resolve',await page.evaluate(()=>qaResolved)===1&&results.at(-1).verified.mechanics.length===2);
  check(name+' UI and server verdict agree',results.at(-1).verified.allSuccess);
  if(extra.overload)check('overload result explains spread, tolerance and recommended core',/코어 공명 과부하/.test(body)&&body.includes('138 / 허용 123')&&body.includes('차단')&&(await page.locator('[data-v3-verdict]').innerText()).includes('과부하'));
  if(extra.winner==='B')check('real combat defeat explains why successful QTEs did not win',body.includes('전투 패배')&&body.includes('덱 전투력'));
  await page.screenshot({path:path.join(out,name+'-result.png')});await page.locator('.core-v3-return').tap();
 }
 for(const fault of ['cancel-screen','cancel-direction','missing','throw']){
  const pair=fault==='cancel-direction'?['SEQUENCE','CENTER']:['CENTER','MASH'];
  await launch(fault,pair,{fault});
  if(fault.startsWith('cancel')){await page.waitForSelector(fault==='cancel-direction'?'.raid-qte-overlay':'.cqm-overlay',{timeout:60000});await page.evaluate(()=>ProjectVRaidQteV1924.cancel());}
  await page.waitForFunction(()=>!document.getElementById('modal').children.length,{timeout:30000});
  check(fault+' does not submit a defeat or call resolve',await page.evaluate(()=>qaResolved)===0);
 }
 check('offline validation makes no account API calls',accountRequests.length===0);check('no uncaught browser errors',errors.length===0);
 await writeFile(path.join(out,'report.json'),JSON.stringify({base,checks,errors,results,productionStylesheets:styles.length,limits:'Chrome touch emulation; real account data was not changed.'},null,2));
 console.log(checks.length+' integrated browser checks passed');
}finally{await browser.close();}
