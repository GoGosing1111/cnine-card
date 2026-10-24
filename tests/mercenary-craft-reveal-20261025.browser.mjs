import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {craftRevealServer} from './helpers/mercenary-craft-reveal-server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.QA_OUT||path.join(root,'docs/qa/mercenary-craft-reveal-20261025');fs.mkdirSync(out,{recursive:true});
const server=await craftRevealServer(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),checks=[],errors=[];
const check=(value,name)=>{assert.ok(value,name);checks.push(name);};
try{
 for(const [width,height]of [[1440,1000],[754,892],[390,844],[320,640],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},hasTouch:width<600,serviceWorkers:'block'}),label=String(width);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  for(const success of [false,true]){
   await server.reset({success});await page.goto(server.base+'/qa/workshop');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('#wsMaterialCraft:enabled').waitFor();
   await page.locator('#wsMaterialCraft').click();await page.locator('.mc-reveal').waitFor();
   if(width===1440&&!success)await page.screenshot({path:path.join(out,'desktop-charging.png')});
   await page.locator('.mc-reveal[data-phase=sealed]').waitFor();
   check(server.writes.length===1,label+' single committed attempt');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' no horizontal overflow');
   check(await page.locator('.mc-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1),label+' sealed dialog fits without scrollbars');
   check(await page.locator('.mc-charge-label').evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.mc-track').getBoundingClientRect().top),label+' instruction stays above the gold rail');
   check(await page.locator('.mc-heading').evaluate(e=>e.getBoundingClientRect().width>=240),label+' title uses its reserved column');
   check(await page.locator('.mc-handle').evaluate(e=>{const s=getComputedStyle(e);return s.backgroundImage==='none'&&s.borderImageSource==='none'&&e.textContent.trim()===''&&e.querySelector('image')?.getAttribute('href').endsWith('/action.webp');}),label+' original blue gem handle without arrow, words or extra button art');
   check(await page.locator('.mc-track').evaluate(e=>getComputedStyle(e).backgroundImage.includes('action-track-v6.webp')),label+' gold rail uses empty sockets and one moving gem');
   check(await page.locator('[data-track-label]').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);return range.getBoundingClientRect().left>=document.querySelector('.mc-gem').getBoundingClientRect().right+8;}),label+' gem and rail wording stay separate');
   check(await page.locator('.mc-gem').evaluate(e=>{const g=e.getBoundingClientRect(),t=document.querySelector('.mc-track').getBoundingClientRect(),center=(g.x+g.width/2-t.x)/t.width;return center>=.19&&center<=.21&&g.y>=t.y&&g.bottom<=t.bottom;}),label+' gemstone starts in the left channel');
   check(await page.locator('.mc-handle').evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=92&&r.height>=80;}),label+' large handle target');
   check(await page.locator('.mc-track').evaluate(e=>e.getBoundingClientRect().height>=88&&getComputedStyle(e).touchAction==='none'),label+' entire tall rail captures touch');
   const rail=await page.locator('.mc-track').boundingBox();
   await page.mouse.click(rail.x+rail.width-15,rail.y+rail.height/2);
   check(await page.locator('.mc-reveal').getAttribute('data-phase')==='sealed'&&await page.locator('.mc-handle').getAttribute('aria-valuenow')==='0',label+' tapping rail never opens');
   if(!success){
    await page.screenshot({path:path.join(out,label+'-sealed.png')});
    const h=await page.locator('.mc-handle').boundingBox(),t=await page.locator('.mc-track').boundingBox();
    const startX=t.x+t.width/2,startY=t.y+10;
    await page.mouse.move(startX,startY);await page.mouse.down();await page.mouse.move(startX+20,startY,{steps:5});await page.mouse.up();
    check(await page.locator('.mc-handle').getAttribute('aria-valuenow')==='0',label+' incomplete drag resets');
    await page.mouse.move(startX,startY);await page.mouse.down();await page.mouse.move(startX-80,startY,{steps:5});await page.mouse.up();
    check(await page.locator('.mc-reveal').getAttribute('data-phase')==='sealed'&&await page.locator('.mc-handle').getAttribute('aria-valuenow')==='0',label+' backward drag never opens');
    await page.locator('.mc-handle').press('Enter');await page.locator('.mc-reveal[data-phase=opening]').waitFor();
    if(width===1440){await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'desktop-opening.png')});}
   }else if(width<600){
    const t=await page.locator('.mc-track').boundingBox(),cdp=await page.context().newCDPSession(page),x=t.x+t.width*(width===390?.85:.5),y=t.y+10,distance=Math.min(130,t.x+t.width-x-1);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+distance*i/12,y:y+4*i/12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   }else{
    const t=await page.locator('.mc-track').boundingBox(),x=t.x+t.width/2,y=t.y+10;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(Math.min(x+130,t.x+t.width-1),y,{steps:12});await page.mouse.up();
   }
   await page.locator(`.mc-reveal[data-phase=result][data-outcome=${success?'success':'failure'}]`).waitFor();await page.waitForTimeout(950);
   check(!((await page.locator('.mc-reveal').getAttribute('class')).includes('mc-dragging')),label+' gesture capture and dragging state cleared');
   check(await page.locator('.mc-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.scrollHeight<=e.clientHeight+1),label+' result dialog fits without scrollbars');
   check((await page.locator('.mc-result').innerText()).includes('족로'),label+' correct target name');
   check(!(await page.locator('.mc-result').innerText()).includes('카이론'),label+' no hardcoded Kairon label');
   if(success){
    check(await page.locator('.mc-art img').evaluate(i=>i.complete&&i.naturalWidth>0),label+' original Jokro art loaded');
    check(await page.locator('.mc-art img').evaluate(i=>{const a=i.getBoundingClientRect(),h=document.querySelector('.mc-heading').getBoundingClientRect(),c=document.querySelector('.mc-controls').getBoundingClientRect();const separate=r=>a.bottom<=r.top||a.top>=r.bottom||a.right<=r.left||a.left>=r.right;return separate(h)&&separate(c);}),label+' artwork never overlaps heading or result controls');
   }
   else check((await page.locator('.mc-result').innerText()).includes('소모되었습니다'),label+' failed receipt consumption shown');
   check(await page.locator('.mc-done').evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.top>=0&&r.bottom<=innerHeight;}),label+' result action visible and touch sized');
   await page.screenshot({path:path.join(out,label+(success?'-success':'-failure')+'.png')});
   const balance=await server.balance();await page.locator('.mc-done').click();await page.locator('.mc-reveal').waitFor({state:'detached'});
   check(server.writes.length===1&&await server.balance()===balance,label+' reveal and close never charge again');
   check(await page.evaluate(()=>!document.getElementById('view').inert&&document.body.style.overflow!=='hidden'),label+' inert and scroll restored');
  }
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
 await server.reset({code:'WORKSHOP_KAIRON',success:true});await page.goto(server.base+'/qa/workshop');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.locator('#wsMaterialCraft:enabled').click();await page.locator('.mc-reveal[data-phase=sealed]').waitFor();await page.locator('.mc-skip').click();
 check((await page.locator('.mc-result').innerText()).includes('카이론 1장'), 'Kairon receipt supported');check(await page.locator('.mc-reveal').getAttribute('data-motion')==='reduced','reduced motion respected');
 await page.keyboard.press('Tab');check(await page.locator('.mc-sound').evaluate(n=>n===document.activeElement),'focus stays in modal');await page.keyboard.press('Tab');check(await page.locator('.mc-done').evaluate(n=>n===document.activeElement),'Tab wraps');
 await page.keyboard.press('Escape');await page.locator('.mc-reveal').waitFor({state:'detached'});
 const receipt=server.receipts[0];
 await page.evaluate(data=>{window.MercenaryCraftReveal.play({data:{...data,output:{...data.output,name:'원화 오류 검수',image:'/qa/missing.png'}}});},receipt);await page.locator('.mc-skip').click();await page.locator('.mc-art-unavailable').waitFor();check((await page.locator('.mc-result').innerText()).includes('원화 오류 검수'),'missing art keeps readable result');await page.locator('.mc-done').click();
 await page.evaluate(data=>{window.MercenaryCraftReveal.play({data,isActive:()=>document.getElementById('workshopRootV1881')});},receipt);await page.evaluate(()=>document.getElementById('view').replaceChildren());await page.locator('.mc-reveal').waitFor({state:'detached'});check(await page.evaluate(()=>!document.body.style.overflow&&!document.getElementById('view').inert),'route exit cleans presentation');
 check(server.writes.length===1,'reduced motion, skip, missing art and cleanup cause zero extra writes');
 // Broken optional animation falls back to the authoritative receipt, without retry.
 await server.reset({success:true});await page.goto(server.base+'/qa/workshop');await page.locator('[data-ws-section=MERCENARY_CRAFT]').click();await page.evaluate(()=>{window.MercenaryCraftReveal={play:()=>{throw Error('QA visual failure')},cancel:()=>{}}});await page.locator('#wsMaterialCraft:enabled').click();await page.locator('#modal.show').waitFor();check((await page.locator('#modal').innerText()).includes('족로 1장'),'fallback is correct for Jokro');check(server.writes.length===1,'presentation failure never retries transaction');await page.locator('#modal button').click();
 await page.close();check(errors.length===0,'no page errors: '+errors.join('; '));
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,productionWrites:0},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,out}));
}finally{await browser.close();await server.close();}
