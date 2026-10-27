import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {startClassicQa} from './serve-classic-colosseum-qa.mjs';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output=process.env.CLASSIC_QA_OUTPUT||'C:/Users/User/Downloads/upload/cnine-card/output/classic-colosseum-20261027';
await fs.mkdir(output,{recursive:true});
const qa=await startClassicQa(0),browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],results=[],pages=[];
const shot=async(page,name)=>{await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});results.push(name);console.log(name);};
async function entrant(user,mobile=false){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,deviceScaleFactor:1});
 await context.addInitScript(()=>{localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('cnine_lobby_bgm_enabled','OFF');HTMLMediaElement.prototype.play=function(){this.muted=true;return Promise.resolve();};});
 const page=await context.newPage();pages.push(page);page.on('pageerror',error=>errors.push({user,message:error.message}));
 await page.goto(qa.origin+'/__login?user='+user,{waitUntil:'domcontentloaded'});
 await page.locator('.classic-colosseum .classic-hero').waitFor({timeout:60000});
 return page;
}
const action=(page,name)=>page.locator('.classic-colosseum [data-classic="'+name+'"]');
const tab=(page,name)=>page.locator('.classic-colosseum [data-tab="'+name+'"]');
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2);
try{
 const owner=await entrant(1);assert(await noOverflow(owner));await shot(owner,'01-native-pc-lobby');
 await tab(owner,'admin').click();await action(owner,'toggle').click();await owner.getByText('운영 ON',{exact:true}).waitFor();
 for(const [nickname,side]of [['별의수호자',0],['붉은달',1]]){
  await owner.locator('[data-user-search] input').fill(nickname);await owner.locator('[data-user-search] button').click();await owner.locator(`[data-classic="choose-user"][data-side="${side}"]`).click();
 }
 await action(owner,'invite').click();await owner.getByText('두 참가자에게 초대를 보냈습니다.').waitFor();await shot(owner,'02-native-pc-operator');
 const a=await entrant(2),b=await entrant(3,true);
 for(const [page,label]of [[a,'pc'],[b,'mobile']]){
  await page.locator('.classic-dialog[open] [data-classic="accept"]').waitFor({timeout:55000});assert(await noOverflow(page));await shot(page,'03-invitation-'+label);await page.locator('.classic-dialog [data-classic="accept"]').click();
 }
 for(const [page,label]of [[a,'pc'],[b,'mobile']]){
  await action(page,'refresh').click();await tab(page,'rental').click();await page.locator('.classic-catalog [data-classic="select"]').first().waitFor();
  assert.equal(await page.locator('.classic-colosseum [data-category="equipment"]').count(),0);
  for(const id of qa.f.loadout.cardIds)await page.locator(`[data-classic="select"][data-id="${id}"]`).click();
  await page.locator('[data-category="magic"]').click();for(const id of [1,2])await page.locator(`[data-classic="select"][data-id="${id}"]`).click();
  await action(page,'save').click();await page.getByText('전용 +10 대여 편성을 저장했습니다.').waitFor();assert(await noOverflow(page));await shot(page,'04-rental-'+label);
 }
 await action(a,'ready').click();await a.waitForFunction(()=>document.querySelector('.classic-colosseum [data-classic="ready"]')?.disabled);await tab(b,'room').click();await action(b,'refresh').click();await action(b,'ready').click();
 for(const [page,label]of [[a,'pc'],[b,'mobile']]){
  await page.locator('#modal.show canvas').waitFor({timeout:90000});await page.waitForTimeout(1800);await shot(page,'05-battle-'+label);
  const diagnostics=await page.evaluate(()=>window.ProjectVPixiBattle?.diagnostics?.());await fs.writeFile(path.join(output,'battle-'+label+'-diagnostics.json'),JSON.stringify(diagnostics,null,2));
  await page.locator('.classic-battle-result [data-classic="close"]').waitFor({timeout:150000});await shot(page,'06-result-'+label);await page.locator('.classic-battle-result [data-classic="close"]').click();
 }
 await tab(b,'news').click();await b.locator('.classic-paper h2').waitFor();assert(await noOverflow(b));await shot(b,'07-mobile-news');
 // Saved results survive leaving/re-entering; a pending losing result opens a popup.
 const room=qa.f.room(qa.f.user(2).roomId),loser=room.article.loserId;
 const key='classic_colosseum_user_v1:'+loser,state=qa.f.user(loser);state.results=[{matchId:room.id,loss:true,article:room.article}];qa.f.db.prepare('UPDATE app_meta SET value=? WHERE key=?').run(JSON.stringify(state),key);
 const lossPage=loser===2?a:b;await lossPage.reload({waitUntil:'domcontentloaded'});await lossPage.locator('.classic-dialog[open] .classic-paper').waitFor({timeout:55000});await shot(lossPage,'08-defeat-popup');await lossPage.locator('.classic-dialog [data-classic="close"]').click();
 await tab(owner,'admin').click();await action(owner,'toggle').click();await owner.getByText('운영 OFF',{exact:true}).waitFor();await shot(owner,'09-operator-off');
 assert.equal((await qa.f.notices(loser)).results.length,0);assert.equal(qa.f.get('classic_colosseum_news_v1').length,1);
 const relevantErrors=errors.filter(e=>/classic|Battle|Pixi|cannot read/i.test(e.message));assert.deepEqual(relevantErrors,[]);
 await fs.writeFile(path.join(output,'browser-report.json'),JSON.stringify({ok:true,results,errors,matchId:room.id,winnerId:room.winnerId,loserId:loser,news:1,equipment:false},null,2));console.log(JSON.stringify({ok:true,output,results,errors}));
}catch(error){for(const [i,page]of pages.entries())await page.screenshot({path:path.join(output,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,errors},null,2));throw error;}
finally{await browser.close();await qa.close();}
