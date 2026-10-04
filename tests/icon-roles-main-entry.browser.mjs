import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const origin='http://127.0.0.1:8977',out=process.env.ICON_QA_OUT;assert.ok(out);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--enable-unsafe-swiftshader']}),reports=[];
try{for(const [width,mode] of [[1440,'PVP'],[390,'PVE']]){
 const page=await browser.newPage({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/?screen=home');await page.waitForFunction(()=>window.loadUser?.()?.serverUserId===7&&window.SoopketmonV21RuntimeRouter);
 const code=mode==='PVP'?'icon-hi-heeya':'icon-oh-joeun',payload=await (await fetch(origin+'/preview/icon-roles-v1/'+code+'-'+mode.toLowerCase()+'.json')).json();
 const profile=await (await fetch(origin+'/api/me')).json();payload.user=profile.user;payload.result=payload.battleV2.result.winner==='A'?'WIN':'LOSE';payload.coinReward=0;payload.magicCrystalReward=0;payload.playerPower=900000;payload.monsterPower=780000;
 await page.evaluate(async({mode,data})=>{
  await window.ensureFeatureResources('battleV2');const modal=document.querySelector('#modal'),live=window.prepareBattleV2LiveLoading({modal,mode,playerName:'ICON 검수',opponentName:'검수 상대'});
  const play=mode==='PVE'?window.playPveBattleV2Live:window.playPvpBattleV2Live;
  window.__iconEntryPromise=play({...live,modal,data,monster:data.monster}).then(()=>{window.__iconEntryDone=true;if(mode==='PVP'){live.msg.innerHTML=window.ProjectVBattleV3Live.resultHtml({mode:'PVP',data,win:data.result==='WIN',result:data.battleV2.result});live.msg.querySelector('button').onclick=()=>{modal.__battleV2Renderer.destroy();window.SoopketmonV21RuntimeRouter.navigate('pvp');};}});
 },{mode,data:payload});
 await page.waitForFunction(()=>window.ProjectVPixiBattle?.diagnostics()?.iconRoles?.metrics?.skills>1,null,{timeout:90000});await page.screenshot({path:path.join(out,width+'-main-battle.png')});
 await page.waitForFunction(()=>window.__iconEntryDone===true,null,{timeout:120000});await page.screenshot({path:path.join(out,width+'-main-result.png')});
 const diagnostics=await page.evaluate(()=>window.ProjectVPixiBattle.diagnostics().iconRoles);assert.equal(diagnostics.metrics.appliedRows,diagnostics.metrics.serverRows);
 const confirm=page.locator('.v3-report-confirm');await confirm.click();await page.waitForFunction(()=>!document.querySelector('#modal.show canvas'));assert.deepEqual(errors,[]);
 reports.push({width,mode,mainLoader:true,actualLiveWrapper:true,result:true,return:true,diagnostics,errors});console.log(JSON.stringify(reports.at(-1)));await page.close();
}fs.writeFileSync(path.join(out,'main-entry-report.json'),JSON.stringify(reports,null,2));}finally{await browser.close();}
