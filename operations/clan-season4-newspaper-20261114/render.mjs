import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const out=path.resolve('output/newspapers/clan-season-4-20261114'),qa=path.resolve('operations/clan-season4-newspaper-20261114/qa');
fs.mkdirSync(qa,{recursive:true});
const files=['01-front','02-champions','03-regular-season','04-players','05-club-reviews','06-legacy'];
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[],results=[];
try{
  const context=await browser.newContext({viewport:{width:1200,height:2180},deviceScaleFactor:1.5});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(pathToFileURL(path.join(out,'index.html')).href+'?proof=1',{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready);
  let text=[];
  for(let i=1;i<=6;i++){
    await p.evaluate(i=>window.showNewsPage(i),i);
    await p.evaluate(async()=>{for(const im of document.querySelectorAll('.paper:not([hidden]) img')){if(im.loading==='lazy')im.loading='eager';await im.decode()}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    const layout=await p.evaluate(()=>{const paper=document.querySelector('.paper:not([hidden])'),content=paper.querySelector('.paper-content'),footer=paper.querySelector('.folio');const r=paper.getBoundingClientRect(),c=content.getBoundingClientRect(),f=footer.getBoundingClientRect();return {page:paper.dataset.page,width:r.width,height:r.height,contentBottom:c.bottom,footerTop:f.top,footerBottom:f.bottom,paperBottom:r.bottom,contentScroll:content.scrollHeight,contentClient:content.clientHeight,bodyOverflow:document.documentElement.scrollWidth>innerWidth,images:[...paper.querySelectorAll('img')].filter(im=>!im.complete||im.naturalWidth===0).length,text:paper.innerText}});
    text.push(layout.text);delete layout.text;results.push({type:'desktop',...layout});
    await p.evaluate(async()=>{scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))});
    await p.screenshot({path:path.join(out,'pages',files[i-1]+'.png'),animations:'disabled'});
  }
  fs.writeFileSync(path.join(out,'기사전문.txt'),text.join('\n\n==============================\n\n').split('\n').map(line=>line.trimEnd()).join('\n')+'\n');
  await context.close();
  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const m=await mobile.newPage();m.on('pageerror',e=>errors.push(e.message));
  await m.goto(pathToFileURL(path.join(out,'index.html')).href,{waitUntil:'load'});await m.evaluate(()=>document.fonts.ready);
  for(let i=1;i<=6;i++){
    await m.selectOption('#page-select',String(i));
    await m.evaluate(async()=>{for(const im of document.querySelectorAll('.paper:not([hidden]) img')){im.loading='eager';await im.decode()}});
    results.push({type:'mobile',...await m.evaluate(()=>({page:document.querySelector('.paper:not([hidden])').dataset.page,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,select:document.querySelector('#page-select').value,download:document.querySelector('#download').getAttribute('href')}))});
    await m.screenshot({path:path.join(qa,`mobile-${i}.png`),fullPage:true});
  }
  await m.click('#prev');assert.equal(await m.locator('#page-select').inputValue(),'5');
  await m.click('#next');assert.equal(await m.locator('#page-select').inputValue(),'6');
  await m.locator('.reader-brand').click();assert.equal(await m.locator('#page-select').inputValue(),'1');
  await m.locator('body').click({position:{x:5,y:200}});await m.keyboard.press('ArrowRight');assert.equal(await m.locator('#page-select').inputValue(),'2');
  await m.reload();assert.equal(await m.locator('#page-select').inputValue(),'2');
  await mobile.close();
  fs.writeFileSync(path.join(qa,'layout.json'),JSON.stringify({results,errors,interactionChecks:['previous','next','brand home','keyboard next','hash reload']},null,2)+'\n');
  console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close()}
