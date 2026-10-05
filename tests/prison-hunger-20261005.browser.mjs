// Real public loader and prison screen; API responses are local fixtures, no live account writes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.PRISON_QA_ORIGIN||'http://127.0.0.1:8997',out=process.env.PRISON_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'prison-hunger-qa-'));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const user={id:101,serverUserId:101,nickname:'검수 수감자',role:'USER',coin:100000000000,cardShards:0,owned:[],quantities:{},breakthroughs:{},history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:740}]){
  const size=`${viewport.width}x${viewport.height}`,start=Date.now(),until=new Date(start+7200000).toISOString();
  let locked=true,dead=false,ack=false,version=0,deadline=start+1200000,mealRequests=[],failMeal=false,hitRequests=[],nextHitAtMs=0,empty=false;
  const h=()=>({caseId:'browser-sentence-101',mealVersion:version,deadlineAt:deadline,lastFedAt:version?deadline-1800000:0,lastSender:version?'검수 방문객':null,starved:dead,diedAt:dead?start-1000:0,deathPending:dead&&!ack});
  const prison=()=>locked?{incarcerated:true,facility:'PRISON',jailedAt:new Date(start-600000).toISOString(),jailedUntil:until,reason:'검수용 일반 감옥',remainingSeconds:7200}:{incarcerated:false};
  const viewer=()=>({...user,id:locked?101:102,serverUserId:locked?101:102,nickname:locked?'검수 수감자':'검수 방문객'});
  const room=()=>({prison:prison(),inmates:empty?[]:[{userId:101,nickname:'하이희야♡',reason:'검수용 일반 감옥',jailedUntil:until,caseId:h().caseId,hunger:h(),releasePrice:100000000000,collectedCoin:15000000000,remainingCoin:85000000000,progressPercent:15,hitCount:3+hitRequests.length,nextHitAtMs,hitCooldownRemainingSeconds:Math.max(0,Math.ceil((nextHitAtMs-Date.now())/1000))},{userId:103,nickname:'아주 긴 수감자 이름 <script>',reason:'가독성 확인',jailedUntil:until,hunger:{...h(),caseId:'browser-sentence-103'}}],recentHits:hitRequests.length?[{inmateUserId:101,hitterNickname:'검수 방문객'}]:[],hunger:locked?h():null,hungerRules:{intervalMs:1800000,mealCoin:10000000000},canSendMeal:!locked,viewer:viewer(),access:{canSetReleasePrice:false},messages:Array.from({length:12},(_,i)=>({userId:102,nickname:'검수 방문객',body:i%2?'사식과 형기 확인했습니다.':'사식을 전달하러 왔습니다.',createdAt:new Date(start+i).toISOString()})),serverNow:new Date().toISOString()});
  const page=await browser.newPage({viewport,serviceWorkers:'block'});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(u=>{localStorage.setItem('cnine_card_user_v10',JSON.stringify(u));localStorage.setItem('cnine_card_api_token','local-prison-qa');localStorage.setItem('cnine_battle_sound','OFF');localStorage.setItem('soop-lobby-bgm-muted-v1','1');},user);
  await page.route('**/api/**',async route=>{
   const request=route.request(),key=new URL(request.url()).pathname.slice(5);
   let data;
   if(key==='prison/status')data=room();
   else if(key==='prison/hunger/ack'){ack=true;data={ok:true,state:room()};}
   else if(key==='prison/hit'){hitRequests.push(request.postDataJSON());nextHitAtMs=Date.now()+60000;data={ok:true,state:room()};}
   else if(key==='prison/meal'){
    const body=request.postDataJSON();mealRequests.push(body);
    if(failMeal){failMeal=false;await route.fulfill({status:503,json:{error:'전달 결과 확인 실패 · 다시 눌러 확인하세요.'}});return;}
    version++;deadline=Date.now()+1800000;dead=false;ack=false;data={ok:true,state:room()};
   }else data={
    'service/status':{maintenance:{active:false}},'me/summary':{user:viewer(),prison:prison()},me:{user:viewer(),prison:prison()},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},
    'chief/status':{chief:{active:false}},'shell/summary':{inventory:{},messages:{unread:0}},'burning-event/status':{enabled:false},'user/runtime-command':{},'live-operations':{items:[]},'loot-shop/balance':{pigCoins:0}
   }[key]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}};
   await route.fulfill({json:data});
  });
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#prisonView').waitFor();await page.locator('[data-prison-meal-clock]').waitFor();await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.prison-cell-stage')).backgroundImage.includes('general-guarded-prison'));
  check(await page.locator('[data-prison-meal]').isDisabled(),size+' inmate cannot buy own meal');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),size+' no horizontal overflow');
  await page.waitForFunction(()=>document.querySelector('#prisonCharacter')?.naturalWidth>0);
  check(await page.locator('#prisonCharacter').getAttribute('src').then(s=>s.includes('prisoner-guarded-hall-20261006.png')),size+' new grounded prisoner art loaded');
  const stage=await page.locator('.prison-cell-stage').boundingBox(),ration=await page.locator('#prisonHungerPanel').boundingBox();
  check(stage.y+stage.height<=ration.y,size+' scene and food panel do not overlap');
  const chatBounds=await page.locator('.prison-chat').boundingBox(),hitBounds=await page.locator('#prisonHitPanel').boundingBox();
  check(viewport.width>800?Math.abs(chatBounds.y-stage.y)<2&&chatBounds.x>=stage.x+stage.width:chatBounds.y+chatBounds.height<=stage.y,size+' chat is at top on desktop and first on mobile');
  check(hitBounds.y>=ration.y+ration.height&&hitBounds.y-ration.y-ration.height<=16,size+' hit action immediately follows food');
  check(await page.locator('#prisonCommunityPanel [data-prison-hit]').count()===0,size+' funding panel no longer owns hit action');
  check(await page.locator('[data-prison-hit]').isDisabled(),size+' self hit remains blocked');
  await page.locator('[data-prison-inmate="103"]').click();
  check(await page.locator('#prisonHitPanel h2').textContent().then(t=>t.includes('아주 긴 수감자 이름 <script>'))&&await page.locator('#prisonHungerPanel h2').textContent().then(t=>t.includes('아주 긴 수감자 이름 <script>')),size+' selection updates food and action together with safe text');
  check(await page.locator('[data-prison-hit]').isEnabled(),size+' another inmate remains selectable');
  await page.locator('[data-prison-inmate="101"]').click();
  await page.evaluate(()=>{for(let el=document.getElementById('prisonView');el;el=el.parentElement)el.scrollTop=0;scrollTo(0,0);});
  await page.locator('.prison-cell-stage').screenshot({path:path.join(out,`scene-${size}.png`)});
  await page.evaluate(()=>{for(let el=document.getElementById('prisonView');el;el=el.parentElement)el.scrollTop=0;scrollTo(0,0);});
  await page.screenshot({path:path.join(out,`inmate-${size}.png`),fullPage:true});
  const chat=page.locator('#prisonChatInput');await chat.fill('작성 중인 채팅');
  await page.evaluate(()=>loadPrisonRoom());check(await chat.inputValue()==='작성 중인 채팅',size+' poll keeps chat draft');
  dead=true;deadline=start-1000;await page.evaluate(()=>loadPrisonRoom());
  await page.locator('.prison-starvation-overlay').waitFor();
  check(await page.locator('#prisonStarvationTitle').textContent()==='사망하였습니다',size+' eyes-game death presentation reused');
  check(!await page.locator('.prison-starvation-overlay').textContent().then(t=>t.includes('5분')),size+' hunger does not add five-minute gameplay lock');
  check(await page.locator('#prisonView').evaluate(el=>el.inert),size+' death modal traps background interaction');
  await page.screenshot({path:path.join(out,`starvation-${size}.png`)});
  await page.locator('[data-starvation-ack]').click();await page.locator('.prison-starvation-overlay').waitFor({state:'detached'});
  check(await chat.inputValue()==='작성 중인 채팅',size+' acknowledging death retains chat and prison');
  check(await page.locator('[data-prison-meal-clock]').textContent()==='사망',size+' acknowledgement does not reset hunger');
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-prison-meal-clock]').waitFor();
  check(await page.locator('.prison-starvation-overlay').count()===0,size+' acknowledged event stays dismissed after reload');
  locked=false;dead=false;deadline=Date.now()+600000;
  // A visitor is a fresh authenticated session, not a changed identity with the inmate's cached API responses.
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('main.page').waitFor();
  await page.evaluate(()=>window.SoopketmonV21ExactShell.navigate('prison'));
  await page.waitForFunction(()=>document.querySelector('[data-prison-meal]')&&!document.querySelector('[data-prison-meal]').disabled);
  await page.locator('[data-prison-meal]').scrollIntoViewIfNeeded();failMeal=true;
  await page.locator('[data-prison-meal]').click();await page.locator('#prisonMealNotice').filter({hasText:'전달 결과 확인 실패'}).waitFor();
  await page.locator('[data-prison-meal]').click();await page.locator('#prisonMealNotice').filter({hasText:'사식을 전달했습니다'}).waitFor();
  check(mealRequests.length===2&&mealRequests[0].requestId===mealRequests[1].requestId,size+' uncertain response retries identical receipt');
  check(await page.locator('[data-prison-meal-clock]').textContent().then(t=>t==='30:00'||t==='29:59'),size+' successful delivery starts 30 minutes');
  check(await page.locator('[data-prison-meal]>span').textContent()==='사식 1회 보내기',size+' completed button exits pending state');
  await page.locator('#prisonHungerPanel').screenshot({path:path.join(out,`meal-${size}.png`)});
  await page.locator('[data-prison-hit]').click();
  await page.waitForFunction(()=>document.querySelector('#prisonCharacter').classList.contains('is-hit'));
  check(hitRequests.length===1&&hitRequests[0].inmateUserId===101,size+' relocated hit targets selected inmate');
  check(!await page.locator('.prison-cell-stage').evaluate(el=>el.classList.contains('is-hit')),size+' hit animates prisoner instead of guards/background');
  check(await page.locator('[data-prison-hit]').isDisabled(),size+' server cooldown disables relocated button');
  const fund=page.locator('#prisonFundAmount');await fund.fill('10000');
  await page.evaluate(()=>loadPrisonRoom());check(await fund.inputValue()==='10000',size+' poll preserves funding draft');
  await page.evaluate(()=>{for(let el=document.getElementById('prisonView');el;el=el.parentElement)el.scrollTop=0;scrollTo(0,0);});await page.screenshot({path:path.join(out,`visitor-${size}.png`),fullPage:true});
  if(viewport.width<=480){const send=await page.locator('#prisonChatForm button').boundingBox();check(send.y+send.height<viewport.height-60,size+' mobile chat send stays above bottom navigation on entry');}
  await page.locator('#prisonHitPanel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`actions-${size}.png`)});
  empty=true;await page.evaluate(()=>loadPrisonRoom());
  await page.waitForFunction(()=>document.querySelector('#prisonInmateCount')?.textContent==='0',{},{timeout:12000});
  check(await page.locator('#prisonCharacter').isHidden()&&await page.locator('#prisonHitPanel').isHidden(),size+' empty prison hides character and hit action');
  await page.close();
 }
 check(errors.length===0,'no JavaScript errors: '+errors.join(' | '));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,out,errors}));
}finally{await browser.close();}
