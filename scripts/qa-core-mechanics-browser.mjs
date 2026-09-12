// Usage: PLAYWRIGHT_MODULE=<module URL> node scripts/qa-core-mechanics-browser.mjs [base URL] [output directory]
// Browser emulation only. This never signs in or calls account mutation endpoints.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {evaluateCoreRaidQte} from '../functions/_raid_core_protocol.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://127.0.0.1:8896';
const out=path.resolve(process.argv[3]||'../qa-core-mechanics');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const checks=[],errors=[],apiRequests=[];
const check=(name,value=true)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
const track=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push({url:r.url(),method:r.method()});});};
const shot=(page,name,fullPage=false)=>page.screenshot({path:path.join(out,name+'.png'),fullPage});
const center=async locator=>{const r=await locator.boundingBox();assert.ok(r);return {x:r.x+r.width/2,y:r.y+r.height/2};};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();track(page);
 await page.route('**/__qte_test__/',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/core-protocol-raid-v1924.css?v=2074-clan-only"><link rel="stylesheet" href="/css/raid-qte-mobile-v2085.css?v=2085"><style>body{margin:0}#stage{position:fixed;inset:0}</style><div id="stage"></div><script src="/js/project-v-raid-qte-v1924.js?v=2085-mobile-input"></script>`}));
 await page.goto(base+'/__qte_test__/');
 const cdp=await context.newCDPSession(page);
 const touches=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({id:p.id??i+1,x:p.x,y:p.y,radiusX:3,radiusY:3,force:1}))});
 const startQte=async(sequence=['UP','RIGHT','DOWN','LEFT','UP','RIGHT'],extra={})=>{
  await page.evaluate(({sequence,extra})=>{window.qteResult=null;window.qtePromise=ProjectVRaidQteV1924.run({type:'RAID_QTE_SEQUENCE',sequence,windowMs:15000,...extra},{stage:document.getElementById('stage')}).then(r=>window.qteResult=r);},{sequence,extra});
  await page.waitForSelector('.raid-qte-overlay');
 };
 const progress=()=>page.locator('.raid-qte-sequence .is-complete').count();
 const result=async()=>{await page.waitForFunction(()=>window.qteResult);return page.evaluate(()=>window.qteResult);};
 await startQte();
 let p=await center(page.locator('[data-qte-dir=UP]'));
 await touches('touchStart',[p]);check('direction button commits before finger lifts',await progress()===1);
 await touches('touchEnd',[]);check('compatibility click does not double count',await progress()===1);
 p=await center(page.locator('[data-qte-swipe]'));
 await touches('touchStart',[p]);await touches('touchMove',[{...p,x:p.x+10}]);check('10 px finger jitter is ignored',await progress()===1);
 await touches('touchMove',[{...p,x:p.x+24}]);check('24 px swipe commits before finger lifts',await progress()===2);
 await touches('touchMove',[{...p,x:p.x+50}]);await touches('touchEnd',[]);check('one continuous swipe produces one input',await progress()===2);
 await touches('touchStart',[{...p,id:1}]);
 await touches('touchStart',[{...p,id:1},{x:p.x+45,y:p.y-30,id:2}]);
 await touches('touchMove',[{x:p.x,y:p.y+24,id:1},{x:p.x+45,y:p.y-30,id:2}]);
 check('second finger does not replace the primary swipe origin',await progress()===3);
 await touches('touchEnd',[]);
 await touches('touchStart',[p]);await touches('touchMove',[{x:p.x-24,y:p.y+24}]);check('ambiguous diagonal does not submit a wrong direction',await progress()===3);
 await touches('touchCancel',[]);
 await touches('touchStart',[p]);await touches('touchMove',[{x:p.x-24,y:p.y}]);await touches('touchEnd',[]);check('pointer cancellation allows a fresh gesture',await progress()===4);
 await page.locator('[data-qte-dir=UP]').tap();await page.locator('[data-qte-dir=RIGHT]').tap();
 const trace=await result();check('mobile sequence succeeds with exactly six inputs',trace.success&&trace.inputs.length===6&&trace.mistakes===0);
 const verdict=evaluateCoreRaidQte({sequence:['UP','RIGHT','DOWN','LEFT','UP','RIGHT'],sequenceWindowMs:15000},{sequence:trace});
 check('server trace replay agrees with mobile result',verdict.sequence.success&&verdict.sequence.mistakes===0);
 await writeFile(path.join(out,'mobile-sequence-trace.json'),JSON.stringify({trace,verdict},null,2));
 await startQte(['UP','UP']);
 await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowUp');check('keyboard auto-repeat is ignored',await progress()===1);
 await page.keyboard.up('ArrowUp');await page.keyboard.press('ArrowUp');check('separate keyboard presses still work',(await result()).success);
 await startQte(['UP'],{windowMs:2000});
 await page.evaluate(()=>{window.savedNow=performance.now.bind(performance);Object.defineProperty(performance,'now',{configurable:true,value:()=>window.savedNow()+5000});document.querySelector('[data-qte-dir=UP]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:999,isPrimary:true}));});
 const late=await result();await page.evaluate(()=>{delete performance.now;delete window.savedNow;});
 check('deadline guard rejects input before the next animation frame',!late.success&&late.inputs.length===0);
 await startQte([],{type:'RAID_QTE_MASH',target:3,windowMs:5000});
 for(let i=0;i<3;i++){await page.locator('[data-qte-mash]').tap();await page.waitForTimeout(45);}
 const mash=await result();check('mash retains distinct press tracing',mash.success&&mash.presses.length===3);
 for(const size of [{width:360,height:740},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);await startQte(Array(12).fill('UP'));
  const bounds=await page.locator('[data-qte-dir]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};}));
  check(`12-direction layout keeps 44 px targets within ${size.width} × ${size.height}`,bounds.every(r=>r.w>=44&&r.h>=44&&r.x>=0&&r.y>=0&&r.right<=size.width&&r.bottom<=size.height));
  await shot(page,`direction-${size.width}x${size.height}`);await page.evaluate(()=>ProjectVRaidQteV1924.cancel());await result();
  check(`cancel removes old overlay at ${size.width}`,await page.locator('.raid-qte-overlay').count()===0);
 }
 await page.close();

 const lab=await context.newPage();track(lab);await lab.setViewportSize({width:390,height:844});
 await lab.goto(base+'/preview/core-raid-mechanics-v1/',{waitUntil:'networkidle'});
 await shot(lab,'landing-mobile',true);
 const launch=async kind=>{await lab.evaluate(kind=>void CoreMechanicsPreview.launch(kind),kind);await lab.waitForSelector(kind==='SEQUENCE'?'.raid-qte-overlay':`.cqm-overlay[data-mechanic=${kind}]`,{timeout:60000});};
 const begin=async()=>{await lab.locator('[data-action]').tap();await lab.waitForSelector('.cqm-overlay[data-state=running]');};
 const final=async()=>{await lab.waitForSelector('.cqm-recap',{timeout:20000});return lab.evaluate(()=>CoreMechanicsPreview.getLastResult());};
 const close=()=>lab.locator('#closeMechanic').tap();
 await launch('CENTER');check('canonical V3 canvas is mounted',await lab.locator('canvas').count()===1);
 const cardArt=await lab.locator('[data-v3-roster-art]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));
 check('five original card portraits stay separate from battle sprites',cardArt.length===5&&cardArt.every(src=>!/-sd-|battle-sprite|fallback/i.test(src)));
 check('canonical ZENITH and SUPERSTAR frame layers are preserved',await lab.locator('.zenith-card-frame').count()===3&&await lab.locator('.superstar-card-frame').count()===1);
 check('close control is above the V3 modal',await lab.locator('#closeMechanic').evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+10,r.y+10)===n;}));
 await begin();await shot(lab,'center-mobile-running');
 for(let i=0;i<3;i++){
  await lab.waitForFunction(()=>{const button=document.querySelector('[data-action]'),p=parseFloat(document.querySelector('[data-cursor]')?.style.left);return button&&!button.disabled&&p>=47&&p<=51;});
  await lab.locator('[data-action]').tap();
 }
 const sync=await final();check('central timing succeeds through actual touch',sync.success&&sync.score>=2);await close();
 await launch('CENTER');await begin();
 for(let i=0;i<3;i++){await lab.waitForFunction(()=>{const b=document.querySelector('[data-action]'),p=parseFloat(document.querySelector('[data-cursor]')?.style.left);return b&&!b.disabled&&p<12;});await lab.locator('[data-action]').tap();}
 check('off-center stops produce a failure',!(await final()).success);await close();
 await launch('CIRCUIT');await begin();await shot(lab,'circuit-mobile-running');
 const targetFor=async source=>lab.locator('[data-target]').evaluateAll((nodes,source)=>nodes.findIndex(n=>n.textContent.trim().startsWith(['Ⅰ','Ⅱ','Ⅲ'][source])),source);
 const target0=await targetFor(0);await lab.locator('[data-source="0"]').tap();await lab.locator(`[data-target="${(target0+1)%3}"]`).tap();
 check('wrong circuit symbols are rejected',await lab.locator('.cqm-source.is-connected').count()===0);
 await lab.locator('[data-source="0"]').tap();await lab.locator(`[data-target="${target0}"]`).tap();check('two-tap circuit fallback connects',await lab.locator('.cqm-source.is-connected').count()===1);
 const labCdp=await context.newCDPSession(lab);
 for(const source of [1,2]){
  const from=await center(lab.locator(`[data-source="${source}"]`)),to=await center(lab.locator(`[data-target="${await targetFor(source)}"]`));
  await labCdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...from}]});
  for(let step=1;step<=5;step++)await labCdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:from.x+(to.x-from.x)*step/5,y:from.y+(to.y-from.y)*step/5}]});
  await labCdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 check('captured touch drags complete all three circuits',(await final()).success);await close();
 for(const expected of [true,false]){
  await launch('SHELTER');await begin();
  for(let wave=1;wave<=3;wave++){
   await lab.waitForFunction(wave=>document.querySelector('[data-wave-label]')?.textContent===`WAVE 0${wave} / 03`,wave);
   await lab.locator(expected?'.cqm-cell.is-safe':'.cqm-cell.is-danger').first().tap();
   if(wave===1&&expected)await shot(lab,'shelter-mobile-running');
  }
  check(expected?'three safe shelter selections succeed':'three unsafe shelter selections fail',(await final()).success===expected);await close();
 }
 await lab.evaluate(()=>{void CoreMechanicsPreview.launch('CENTER');CoreMechanicsPreview.close();void CoreMechanicsPreview.launch('CIRCUIT');CoreMechanicsPreview.close();void CoreMechanicsPreview.launch('SHELTER');});
 await lab.waitForSelector('.cqm-overlay[data-mechanic=SHELTER]',{timeout:60000});
 check('rapid close/relaunch leaves only the latest overlay',await lab.locator('.cqm-overlay').count()===1);await close();
 for(const size of [{width:1440,height:1000},{width:360,height:740},{width:844,height:390}]){
  await lab.setViewportSize(size);if(size.width===1440)await shot(lab,'landing-desktop',true);
  for(const kind of ['CENTER','CIRCUIT','SHELTER']){
   await launch(kind);await begin();
   const layout=await lab.locator('.cqm-instrument, .cqm-action, .cqm-hud').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
   check(`${kind} controls fit ${size.width} × ${size.height}`,layout.every(r=>r.x>=0&&r.y>=0&&r.right<=size.width+.5&&r.bottom<=size.height+.5));
   if(size.height<500)check(`${kind} timer stays clear of close control`,await lab.locator('[data-time]').evaluate(n=>n.getBoundingClientRect().right<document.getElementById('closeMechanic').getBoundingClientRect().left));
   await shot(lab,`${kind.toLowerCase()}-${size.width}x${size.height}`);await close();
  }
 }
 check('preview made no account API requests',apiRequests.length===0);check('no JavaScript runtime errors',errors.length===0);
 await writeFile(path.join(out,'browser-report.json'),JSON.stringify({base,checks,errors,apiRequests,cardArt,verifiedAt:new Date().toISOString(),limits:'Chrome emulated touch and viewports; not physical iOS/Android device verification'},null,2));
 console.log(`${checks.length} browser checks passed`);
}finally{await browser.close();}
