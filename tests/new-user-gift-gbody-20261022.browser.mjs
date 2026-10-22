import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=path.resolve(process.env.GIFT_QA_OUT||'../new-user-gift-gbody-qa');
await fs.mkdir(out,{recursive:true});
const rewards=JSON.parse(await fs.readFile(path.join(root,'docs/qa/new-user-gift-20261020/catalog.json'),'utf8'));
rewards.version=4;rewards.equipment.push({id:38,code:'BATTLE_SUIT_03',name:'G-BODY',slot:'BATTLE_SUIT',subtype:'BATTLE_SUIT'});
const status={user:{id:1,nickname:'격리된 기프트 검수'},available:true,canOpen:true,canIssue:true,quantity:1,rewards,receipt:null,
 eligibility:{eligible:true,message:'가입 14일 이내 · 첫 인증 확인',joinedAt:'2026-10-20T00:00:00Z',deadline:'2026-11-03T00:00:00Z'}};
const html=mode=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>신규유저 박스 격리 검수</title><link rel="stylesheet" href="/css/new-user-gift-v2075.css"><style>body{margin:0;background:#080f17;color:white;font-family:Arial,"Malgun Gothic",sans-serif}.modal.show{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}dialog{box-sizing:border-box;width:min(660px,calc(100vw - 20px));max-height:calc(100dvh - 20px);border:0;padding:10px;background:#080f17;color:white;overflow:auto}#newGiftBlock{margin-top:10px}</style><div id="modal"></div>${mode==='cms'?'<dialog id="userDialog"><input id="selectedUserId" type="hidden" value="1"><div id="userDetail"></div></dialog>':''}<script src="/js/new-user-gift-v2075.js"></script>${mode==='cms'?'<script src="/admin/new-user-gift-v2075.js"></script><script>document.getElementById("userDialog").showModal()</script>':`<script>window.giftActions=[];NewUserGiftV2075.open({apiRequest:async(path,options={})=>{window.giftActions.push({path,method:options.method||'GET'});return fetch('/api/'+path,options).then(r=>r.json())},clearApiCache:()=>{},loadUser:()=>({coin:3000}),saveUser:()=>{},apiUserToLocal:u=>u,renderShell:screen=>document.body.dataset.returned=screen})</script>`}</html>`;
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/__gift'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html(url.searchParams.get('mode')));return;}
  if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.pathname.endsWith('/open')?{ok:true,replayed:false,coinAfter:300000003000,rewards}:url.pathname==='/api/me'?{user:{coin:300000003000}}:status));return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep))throw Error('Invalid path');
  res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.jpeg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
 }catch(error){res.writeHead(404);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),reports=[];
try{
 for(const width of [1280,390])for(const mode of ['player','cms']){
  const page=await browser.newPage({viewport:{width,height:width===390?844:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await page.goto(base+'/__gift?mode='+mode);const panel=page.locator(mode==='player'?'.modal-panel':'#newGiftBlock');
  await panel.locator('.new-gift-rewards').waitFor();const text=await panel.innerText();
  for(const content of ['3,000억','슈퍼스타 전체 7종','이예준 FUR 3종','그 외 FUR 11종','제니스 전체 19종','마법카드 전체 14종','G바디'])assert.ok(text.includes(content),content);
  assert.equal(await panel.locator('.new-gift-rewards>div').count(),7);
  assert.match(text,/이예준 FUR 3종\s*각 1장 · \+15/);assert.match(text,/마법카드 전체 14종\s*각 1장 · \+9/);
  if(mode==='player')assert.equal(await panel.locator('.new-gift-hero strong').innerText(),'3,000억 코인');
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,missing:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)}));
  assert.ok(dimensions.scroll<=width,JSON.stringify(dimensions));assert.deepEqual(dimensions.missing,[]);
  await page.screenshot({path:path.join(out,`${mode}-${width}.png`)});
  await panel.getByText('장비·마법카드 목록 확인',{exact:true}).click();assert.match(await panel.locator('.new-gift-list').last().innerText(),/G-BODY/);await panel.getByText('장비·마법카드 목록 확인',{exact:true}).click();
  await panel.getByText('카드 목록 확인',{exact:true}).click();
  for(const name of ['철구','아이젠 족스케','치타구'])assert.match(await panel.locator('.new-gift-list').first().innerText(),new RegExp(name+' \\+15'));
  await panel.getByText('카드 목록 확인',{exact:true}).click();
  if(mode==='player'){
   await panel.getByRole('button',{name:'박스 개봉 · 보상 전체 받기'}).click();
   await panel.getByRole('heading',{name:'보상 전체 지급 완료'}).waitFor();
   await page.screenshot({path:path.join(out,`opened-${width}.png`)});
   await panel.getByRole('button',{name:'인벤토리로 돌아가기'}).click();
   assert.equal(await page.getAttribute('body','data-returned'),'inventory');
   const calls=await page.evaluate(()=>window.giftActions);assert.equal(calls.filter(c=>c.path==='new-user-gift/open').length,1);
  }
  assert.deepEqual(errors,[]);reports.push({mode,width,dimensions,errors});await page.close();
 }
 await fs.writeFile(path.join(out,'browser.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
