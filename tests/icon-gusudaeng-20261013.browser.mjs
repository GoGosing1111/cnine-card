import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin=process.env.ICON_QA_ORIGIN||'http://127.0.0.1:8977',out=process.env.ICON_QA_OUT;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{for(const [width,mode] of [[1440,'PVP'],[390,'PVE']]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&/gusudaeng|icon\/manifest/.test(r.url()))failed.push({url:r.url(),status:r.status()});});
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 await page.evaluate(()=>window.SoopketmonV21RuntimeRouter.navigate('iconfusion'));
 await page.waitForFunction(()=>document.body.textContent.includes('구수댕'));
 await page.evaluate(()=>window.IconRoles.open({id:'CN-1C000009',grade:'ICON',title:'구수댕',image:'assets/cards/ICON/gusudaeng-source-20261013.webp'}));
 await page.locator('.ir-modal-profile').waitFor();assert.ok((await page.locator('.ir-modal-profile').innerText()).includes('비법 배합'));
 await page.screenshot({path:path.join(out,width+'-detail.png')});await page.locator('.ir-close').click();
 const payload=await (await fetch(origin+'/preview/icon-roles-v1/icon-gusudaeng-'+mode.toLowerCase()+'.json')).json();
 assert.ok(payload.battleV2.result.timeline.some(e=>e.type==='ICON_ECHO'));const profile=await (await fetch(origin+'/api/me')).json();payload.user=profile.user;payload.result=payload.battleV2.result.winner==='A'?'WIN':'LOSE';payload.coinReward=0;payload.magicCrystalReward=0;payload.playerPower=900000;payload.monsterPower=1400000;
 await page.evaluate(async({mode,data})=>{
  await window.ensureFeatureResources('battleV2');const modal=document.querySelector('#modal'),live=window.prepareBattleV2LiveLoading({modal,mode,playerName:'구수댕 ICON',opponentName:'연계 검수'});
  const play=mode==='PVE'?window.playPveBattleV2Live:window.playPvpBattleV2Live;
  window.__gusuEntryPromise=play({...live,modal,data,monster:data.monster}).then(()=>{window.__gusuEntryDone=true;});
 },{mode,data:payload});
 await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics()?.iconRoles?.metrics?.roles?.includes('LINK'),null,{timeout:90000});
 await page.screenshot({path:path.join(out,width+'-battle.png')});
 await page.waitForFunction(()=>window.__gusuEntryDone===true,null,{timeout:120000});
 const diagnostics=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics());assert.equal(diagnostics.iconRoles.metrics.appliedRows,diagnostics.iconRoles.metrics.serverRows);
 await page.screenshot({path:path.join(out,width+'-result.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);reports.push({width,mode,mainLoader:true,newCardDetail:true,role:'LINK',serverEchoes:payload.battleV2.result.timeline.filter(e=>e.type==='ICON_ECHO').length,diagnostics:diagnostics.iconRoles,errors,failed});
 await page.evaluate(()=>{document.querySelector('#modal')?.__battleV2Renderer?.destroy();window.ProjectVBattleV3Live?.hardReset();});
 console.log(JSON.stringify(reports.at(-1)));await page.close();
}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));}finally{await browser.close();}
