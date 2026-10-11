// Fresh, muted local browser contexts only. No operating accounts or services.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createMadaraPreviewServer} from '../preview/madara-raid-v1/server.mjs';
import {visibleDecisionChoice,decisionReady} from './helpers/madara-review-solver.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=path.resolve(process.env.MADARA_QA_DIR||'preview/madara-raid-v1/qa');await mkdir(out,{recursive:true});
let now=Date.now();
const server=createMadaraPreviewServer({clock:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,url=base+'/preview/madara-raid-v1/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--mute-audio']});
const errors=[],failed=[],screens=[];let token='',memberIds=[],request=0;
const capture=async(page,name)=>{const file=path.join(out,name+'.png');await page.screenshot({path:file,fullPage:true});screens.push(file);};
async function makePage(viewport){
  const context=await browser.newContext({viewport,reducedMotion:'reduce'});await context.addInitScript(()=>localStorage.setItem('cnine_battle_sound','OFF'));
  await context.route('**/*',route=>route.request().url().startsWith(base)||route.request().url().startsWith('data:')?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))failed.push({status:r.status(),url:r.url()});});return page;
}
const ready=page=>page.waitForFunction(()=>{const d=window.MadaraPreview?.diagnostics();return d?.state&&d.ready&&!d.busy&&!d.mounting;},{},{timeout:60000});
async function api(actor,body=null){
  const route=body?'action':'state';const response=await fetch(`${base}/__madara/${route}?actor=${actor}`,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{origin:base,'content-type':'application/json'}:{})},body:body?JSON.stringify({requestId:`browser-${++request}-${Date.now()}`,actorId:actor,...body}):undefined});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error),{code:result.code});return result.state;
}
const runes=['화','월','뇌','풍'],after=r=>runes[(runes.indexOf(r)+1)%4];
function choice(s,t){
  if(t.decision)return visibleDecisionChoice(t);
  const name=id=>s.members.find(m=>m.id===id)?.name;
  const partner=Object.keys({...s.challenge.signals,...s.challenge.orders,...s.challenge.bindings}).find(id=>name(id)===t.partnerName);
  if(t.kind==='SIGNAL')return after(t.clue.match(/([화월뇌풍])의 다음/)[1]);
  if(t.kind==='DISPEL')return s.challenge.signals[partner];
  if(t.kind==='SOUL')return after(s.challenge.signals[partner]);
  if(t.kind==='SCOUT'||t.kind==='BIND'){const pair=t.clue.match(/: ([화월뇌풍]) → ([화월뇌풍])/);return pair[t.index+1];}
  if(t.kind==='SUPPRESS')return s.challenge.orders[partner][0];
  if(t.kind==='CLONE')return s.challenge.orders[partner][t.index];
  if(t.kind==='MARK')return t.clue.match(/각인: ([화월뇌풍])/)[1];
  if(t.kind==='BREAK')return runes.find(r=>r!==s.challenge.preserve&&!t.selected.includes(r));
  if(t.kind==='REINFORCE')return s.challenge.preserve;
  if(t.kind==='CORE')return s.challenge.bindings[partner].at(-1);
  if(t.kind==='PROTECT')return s.members.find(m=>t.clue.includes(m.name+'을 보호'))?.id;
  throw new Error('Unknown task '+t.kind);
}
async function driveUntil(condition){
  for(let round=0;round<450;round++){
    let s=await api(memberIds[0]);if(condition(s))return s;if(s.status!=='ACTIVE')throw new Error(JSON.stringify(s.failure));
    if(s.challenge.gaze&&!s.challenge.gaze.guarded){const g=s.challenge.gaze;await api(g.ownerId,{action:'GUARD',token:`${s.challenge.id}:gaze:${g.index}`});}
    for(const id of memberIds){
      s=await api(id);if(condition(s))return s;
      if(s.me.role==='RESCUE'&&s.resources.heal&&s.members.some(m=>m.hp>0&&m.hp<m.maxHp*.55))s=await api(id,{action:'HEAL',token:s.challenge.id});
      for(const t of s.tasks.filter(t=>decisionReady(t,now)))s=await api(id,{action:'TASK',taskId:t.id,token:t.token,target:choice(s,t)});
      if(s.step==='DAMAGE'&&s.attackRemaining>0&&now>=s.nextStrikeAt&&!(s.challenge.gaze?.ownerId===id&&now>=s.challenge.gaze.activeAt))await api(id,{action:'STRIKE',token:s.challenge.id});
    }
    now+=500;
  }
  throw new Error('Local solver exceeded steps');
}
try{
  const desktop=await makePage({width:1440,height:1050});await desktop.goto(url);await desktop.locator('.mr-boss').waitFor();await desktop.evaluate(()=>document.fonts.ready);
  await capture(desktop,'desktop-staging');
  await desktop.locator('#playMode').selectOption('COMMAND');await desktop.locator('#createButton').click();await desktop.locator('#confirmEntry').click();await desktop.locator('#assembly').waitFor();await desktop.locator('#readyButton').click();await desktop.locator('#startButton:not([disabled])').waitFor({timeout:60000});await desktop.locator('#startButton').click();await ready(desktop);
  token=await desktop.evaluate(()=>sessionStorage.getItem('madara_review_token'));let d=await desktop.evaluate(()=>window.MadaraPreview.diagnostics());memberIds=d.state.members.map(m=>m.id);
  assert.equal(d.canvasCount,1);assert.equal(d.telegraphLayers,1);assert.equal(d.state.release.runtimeEnabled,false);
  now+=700;await api(memberIds[0]);await desktop.waitForFunction(n=>window.MadaraPreview.diagnostics().state.serverNow===n,now);
  await capture(desktop,'desktop-illusion');
  const first=d.state.tasks.find(t=>!t.done),target=choice(d.state,first),button=desktop.locator(`[data-task-id="${first.id}"] button[data-target="${target}"]`);
  await button.evaluate(el=>window.__madaraHeldButton=el);await desktop.waitForTimeout(1100);
  assert.equal(await button.evaluate(el=>el===window.__madaraHeldButton),true,'polling must preserve the pressed input node');
  await button.click();await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.tasks[0].index===1);assert.equal((await desktop.evaluate(()=>window.MadaraPreview.diagnostics())).state.strain,0);
  await desktop.locator('#actorSelect').selectOption(memberIds[1]);await ready(desktop);
  d=await desktop.evaluate(()=>window.MadaraPreview.diagnostics());assert.equal(d.state.me.role,'ASSAULT');assert.equal(d.canvasCount,1);
  await capture(desktop,'desktop-assault');
  const assault=d.state.tasks[0];await desktop.locator(`[data-task-id="${assault.id}"] button[data-target="${choice(d.state,assault)}"]`).click();await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.tasks[0].index===1);
  await driveUntil(s=>s.phase===2);await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.phase===2);await ready(desktop);await capture(desktop,'desktop-clone-priority');
  await driveUntil(s=>s.phase===3);await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.phase===3);await ready(desktop);await capture(desktop,'desktop-fire');
  await driveUntil(s=>s.phase===4);await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.phase===4);await desktop.locator('#actorSelect').selectOption(memberIds[2]);await ready(desktop);
  now+=700;await api(memberIds[2]);await desktop.waitForFunction(n=>window.MadaraPreview.diagnostics().state.serverNow===n,now);
  d=await desktop.evaluate(()=>window.MadaraPreview.diagnostics());await capture(desktop,'desktop-rescue-triage');
  let rescue=d.state.tasks[0];await desktop.locator('[data-task-id="'+rescue.id+'"] button[data-target="'+choice(d.state,rescue)+'"]').click();await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.tasks[0].index===1);
  d=await desktop.evaluate(()=>window.MadaraPreview.diagnostics());rescue=d.state.tasks[0];assert.equal(rescue.decision.type,'INTERCEPT');assert.ok(now<rescue.decision.readyAt);
  await desktop.locator('[data-task-id="'+rescue.id+'"] button:not([hidden])').click();await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.strain===1);await capture(desktop,'desktop-early-protection-feedback');
  const narrow=await makePage({width:390,height:844});await narrow.addInitScript(({token,actor})=>{localStorage.setItem('madara_review_identity',token);sessionStorage.setItem('madara_review_actor',actor);},{token,actor:memberIds[2]});await narrow.goto(url);await ready(narrow);await narrow.locator('#jumpTasks').click();await capture(narrow,'mobile-protection-telegraph');
  assert.ok(await narrow.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const feedbackTask=(await api(memberIds[2])).tasks[0];now=feedbackTask.decision.readyAt+200;await api(memberIds[2]);await narrow.waitForFunction(n=>window.MadaraPreview.diagnostics().state.serverNow===n,now);await capture(narrow,'mobile-protection-response');
  await narrow.locator('[data-task-id="'+feedbackTask.id+'"] button:not([hidden])').focus();await narrow.keyboard.press('Enter');await narrow.waitForFunction(()=>window.MadaraPreview.diagnostics().state.tasks[0].done);await narrow.context().close();
  await driveUntil(s=>s.phase===5);await desktop.waitForFunction(()=>window.MadaraPreview.diagnostics().state.phase===5);await ready(desktop);await capture(desktop,'desktop-final');
  const mobile=await makePage({width:390,height:844});await mobile.goto(url);await mobile.evaluate(()=>document.fonts.ready);await capture(mobile,'mobile-staging');await mobile.addInitScript(({token,actor})=>{localStorage.setItem('madara_review_identity',token);sessionStorage.setItem('madara_review_token',token);sessionStorage.setItem('madara_review_actor',actor);},{token,actor:memberIds[0]});await mobile.reload();await ready(mobile);await capture(mobile,'mobile-final');
  const dimensions=await mobile.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:document.querySelectorAll('canvas').length,buttons:[...document.querySelectorAll('.mr-choice-row button')].filter(b=>!b.closest('[hidden]')).map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))}));
  assert.ok(dimensions.scroll<=dimensions.width+1,JSON.stringify(dimensions));assert.equal(dimensions.canvas,1);assert.ok(dimensions.buttons.every(b=>b.width>=44&&b.height>=44));
  await mobile.locator('#jumpTasks').click();await mobile.waitForFunction(()=>document.querySelector('.mr-operations').getBoundingClientRect().top<170);await mobile.screenshot({path:path.join(out,'mobile-controls.png')});screens.push(path.join(out,'mobile-controls.png'));
  const header=await mobile.locator('.mr-combat-head').boundingBox();assert.ok(header.y>=0&&header.y<5,'The phase clock stays visible while operating tasks');
  await mobile.locator('#jumpSecondTask').click();await mobile.waitForFunction(()=>{const task=document.querySelectorAll('.mr-task')[1],rect=task.getBoundingClientRect(),nav=document.querySelector('.mr-mobile-nav').getBoundingClientRect();return rect.top>=nav.bottom-1&&[...task.querySelectorAll('button')].filter(b=>!b.hidden).every(b=>b.getBoundingClientRect().bottom<=innerHeight);});await mobile.screenshot({path:path.join(out,'mobile-second-task.png')});screens.push(path.join(out,'mobile-second-task.png'));await mobile.locator('#jumpTasks').click();
  await mobile.locator('#guardButton').click();await mobile.waitForFunction(()=>window.MadaraPreview.diagnostics().state.challenge.gaze.guarded);
  await mobile.locator('#guideButton').click();await mobile.locator('#guideDialog').waitFor();await capture(mobile,'mobile-guide');await mobile.locator('#closeGuide').click();
  const clear=await driveUntil(s=>s.status==='CLEAR');assert.equal(clear.statistics.mistakes,1);await desktop.locator('#resultDialog[open]').waitFor({timeout:12000});await capture(desktop,'desktop-clear');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  const result={scope:'LOCAL_REVIEW_ONLY',muted:true,productionTouched:false,passed:true,viewportDesktop:[1440,1050],viewportMobile:[390,844],dimensions,errors,failed,completedTasks:clear.statistics.tasks,decisions:clear.statistics.decisions,deliberateMistakes:1,screens:screens.map(s=>path.basename(s)),notes:['Server clock is controlled by this local test; no measured live clear rate.','Local HTTP solver uses role-visible hints; it never reads authority answers.','Private decisions, real UI target selection, early protection failure, recovery, timed response and final overlap verified. Existing authored VFX and the server telegraph share the V3 renderer.']};
  await writeFile(path.join(out,'browser-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
