import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('.',import.meta.url)),browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--mute-audio','--enable-unsafe-swiftshader']});
const reports=[];
try{
 for(const [name,width,height]of [['pc',1440,950],['mobile',390,844],['enemy',1440,950]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:18804/');await page.waitForFunction(()=>advancementReview?.ready,null,{timeout:90000});
  if(name==='enemy')await page.selectOption('#direction','enemy');
  const report=await page.evaluate(async()=>{
   const a=advancementReview,s=a.stateFx,e=a.engine,checks={},hp=()=>JSON.stringify([...e.allies,...e.enemies,...e.mercenaries].map(c=>[c.id,c.hp,c.shield]));const before=hp();
   const visible=()=>s.audit().rows.flatMap(r=>r.sprites).filter(x=>x.visible),source=a.event('avenger').actor;
   await a.state('avenger');s.seek(.3);const first=JSON.stringify(s.audit().rows);await new Promise(r=>setTimeout(r,70));checks.pauseStable=JSON.stringify(s.audit().rows)===first;
   s.seek(1.1);checks.loopSeamSamePhase=JSON.stringify(s.audit().rows)===first;s.seek(.1);checks.reverseSeek=JSON.stringify(s.audit().rows)!==first;s.seek(.3);checks.repeatableSeek=JSON.stringify(s.audit().rows)===first;
   checks.avengerVisible=visible().length===1;s.setEnabled(false);checks.effectOff=visible().length===0;s.setEnabled(true);checks.effectOn=visible().length===1;
   for(const speed of [.25,.5,1,2]){s.setSpeed(speed);checks['speed_'+speed]=s.timeline.timeScale()===speed;}
   await a.state('avenger',{charged:false});checks.chargeConsumed=s.audit().active===0;
   const clearRevision=s.versions.get('avenger:'+source.id);
   checks.staleChargeIgnored=await s.apply({battleId:s.battleId,id:'avenger',actor:source,revision:clearRevision-1,charged:true})===false&&s.audit().active===0;
   checks.otherBattleIgnored=await s.apply({battleId:'other',id:'avenger',actor:source,revision:10000,charged:true})===false;
   for(const count of [3,2,1,0]){await a.state('shield-knight',{remaining:count});s.seek(.3);checks['shield_'+count]=visible().length===count;}
   let bad=false;try{await a.state('shield-knight',{remaining:4});}catch{bad=true;}checks.invalidShieldCountRejected=bad;
   await a.state('commander');s.seek(.3);const rows=s.audit().rows,expected=new Set([source,...e.allies,...e.mercenaries].filter(c=>c.team===source.team&&e.isAlive(c)).map(c=>c.id));
   checks.allSameTeamAliveMarked=visible().length===expected.size&&visible().every(c=>expected.has(c.actor));
   const other=[...e.allies,...e.enemies,...e.mercenaries].find(c=>c.id!==source.id&&c.team===source.team&&e.isAlive(c));
   if(other){await a.state('commander',{actor:other,allies:[source,...e.allies,...e.mercenaries]});s.seek(.3);checks.twoCommandersNoDoubleMarks=visible().length===expected.size;await a.state('commander',{actor:other,active:false});}
   const oldHp=source.hp;source.hp=0;s.render(.3);checks.commanderDeathRemovesAll=s.audit().active===0;source.hp=oldHp;
   await a.state('commander');await a.state('commander',{active:false});checks.explicitDeactivation=s.audit().active===0;
   // A new pending state must survive removal of a different final active row.
   await a.state('avenger');const pendingOther=a.state('commander');await a.state('avenger',{charged:false});await pendingOther;checks.independentPendingSurvives=s.audit().rows.some(r=>r.id==='commander');a.cancel();
   const late=a.state('avenger');a.cancel();await late;checks.cancelDuringLoad=s.audit().active===0&&s.audit().pending===0;
   await a.state('avenger');await e.setVisible(false);checks.hideClears=s.audit().active===0;await e.setVisible(true);
   await a.state('shield-knight');await a.state('avenger');s.seek(.2);checks.differentStatesCoexist=s.audit().active===2&&visible().length===4;
   const originalX=source.root.x,prior=visible()[0].x;source.root.x+=35;s.render(.2);checks.tracksActor=visible()[0].x!==prior;source.root.x=originalX;s.render(.2);
   e.cancelTimelines();checks.engineCancellationClears=s.audit().active===0&&!s.timeline;
   checks.preservesHealthAndShield=hp()===before;checks.singleCanvas=document.querySelectorAll('canvas').length===1;checks.noPageErrors=a.errors.length===0;
   return {checks,audit:s.audit()};
  });
  for(const value of ['avenger-charge','shield-3','shield-2','shield-1','commander']){await page.evaluate(async v=>{await advancementReview.showState(v);advancementReview.stateFx.seek(.3);advancementReview.engine.app.render();},value);await page.screenshot({path:dir+name+'-'+value+'.png'});}
  report.name=name;report.pageErrors=errors;reports.push(report);await page.close();
 }
 await fs.writeFile(dir+'verification.json',JSON.stringify({liveCombatRulesImplemented:false,physicalDeviceTest:false,reports},null,2));
 const failed=reports.flatMap(r=>Object.entries(r.checks).filter(([,v])=>!v).map(([k])=>r.name+':'+k));console.log(JSON.stringify({checks:reports.reduce((n,r)=>n+Object.keys(r.checks).length,0),failed}));if(failed.length)process.exitCode=1;
}finally{await browser.close();}
