import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve,sep,extname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const core={item_code:'SUIT_CORE_5',item_name:'슈트 코어 5',image_url:'assets/items/suit-core-5-v2124.png',quantity:10};
const recipes=[
 {id:521,name:'배틀슈트 05 제작',category:'BATTLE_SUIT_CRAFT',payment_mode:'BOTH',output_ref:'47',output_name:'S-BODY',output_image:'assets/items/s-body-v2124.png',output_rarity:'NORMAL',output_pve:1500000,output_pvp:0,success_rate:10,coin_cost:100000000000,master_star_cost:1000000,materials:[core]},
 {id:81,name:'배틀슈트 01 제작',category:'BATTLE_SUIT_CRAFT',payment_mode:'BOTH',output_name:'E-BODY',output_image:'assets/items/e-body-v2004.png',output_rarity:'NORMAL',output_pve:200000,output_pvp:0,success_rate:50,coin_cost:500000000,master_star_cost:10000,materials:[{...core,item_code:'SUIT_CORE_1',item_name:'슈트 코어 1',image_url:'assets/items/suit-core-1-v2004.png',quantity:1}]}
];
const state={wallet:{coin:150000000000,cardShards:0,masterStars:1500000},inventory:{SUIT_CORE_5:{quantity:10},SUIT_CORE_1:{quantity:1}},recipes,synthesis:[]};
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><body style="margin:0;background:#050b12"><div id="app"></div><div id="modal"></div><script>
window.apiRequest=async(path,options={})=>{const response=await fetch('/api/'+path,{method:options.method||'GET',body:options.body,headers:options.body?{'content-type':'application/json'}:{}}),data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error),{status:response.status});return data};
window.loadUser=()=>null;window.saveUser=()=>{};
</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('app').innerHTML=window.workshopView(null);window.bindWorkshopView();</script></body></html>`;

test('S-BODY shows and submits both coin and star costs on desktop and mobile; retry preserves the request',async()=>{
 const posts=[];
 let busyNextPost=false;
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const json=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  if(url.pathname==='/api/workshop'||url.pathname==='/api/workshop/craft'){
   if(req.method==='GET')return json(200,state);
   let raw='';for await(const chunk of req)raw+=chunk;
   const body=JSON.parse(raw),recipe=recipes.find(row=>row.id===body.recipeId);
   posts.push(body);
   if(!recipe||recipe.payment_mode==='BOTH'&&body.paymentType!=='BOTH'||recipe.payment_mode==='COIN_OR_MASTER_STAR'&&!['COIN','MASTER_STAR'].includes(body.paymentType))return json(409,{error:'코인 또는 마스터의 별 결제 방식을 선택하세요.'});
   if(busyNextPost){busyNextPost=false;return json(409,{error:'같은 요청 처리 중입니다.'})}
   return json(200,{ok:true,success:false,recipeId:recipe.id,recipeName:recipe.name,output:null,state});
  }
  if(url.pathname==='/'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);
  }
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+sep)){res.writeHead(404);return res.end()}
  try{const data=readFileSync(file);res.writeHead(200,{'content-type':{'.js':'text/javascript','.css':'text/css','.png':'image/png'}[extname(file)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const scenario of [
   {width:1440,height:1000,recipe:521,payment:'BOTH',shown:['SUIT CORE','COIN','MASTER STAR']},
   {width:390,height:844,recipe:521,payment:'BOTH',shown:['SUIT CORE','COIN','MASTER STAR']},
   {width:1440,height:1000,recipe:81,payment:'BOTH',shown:['SUIT CORE','COIN','MASTER STAR']}
  ]){
   const page=await browser.newPage({viewport:{width:scenario.width,height:scenario.height},serviceWorkers:'block'}),dialogs=[],errors=[];
   page.on('dialog',async dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});await dialog.accept()});
   page.on('pageerror',error=>errors.push(error.message));
   try{
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.locator('[data-ws-section="BATTLE_SUIT_CRAFT"]').click();
    await page.locator(`[data-suit-recipe="${scenario.recipe}"]`).click();
    const labels=await page.locator('.ws81-suit-costs article small').allTextContents();
    assert.deepEqual(labels,scenario.shown);
    assert.equal(await page.locator('#wsBattleSuitCraft').isEnabled(),true);
    assert.equal(await page.locator('[data-suit-pay]').count(),0);
    const overflow=await page.locator('.ws81-suit-craft').evaluate(el=>el.scrollWidth-el.clientWidth);
    assert.ok(overflow<=1,`${scenario.width}px suit panel must not overflow`);
    if(process.env.WORKSHOP_PAYMENT_QA_DIR){mkdirSync(process.env.WORKSHOP_PAYMENT_QA_DIR,{recursive:true});await page.screenshot({path:join(process.env.WORKSHOP_PAYMENT_QA_DIR,`${scenario.width}-${scenario.recipe}-${scenario.payment}.png`),fullPage:true})}
    const before=posts.length;
    await page.locator('#wsBattleSuitCraft').click();
    try{await page.locator('.ws81-suit-result').waitFor({state:'attached',timeout:5000})}
    catch(error){console.error(JSON.stringify({scenario,posts:posts.slice(before),dialogs,errors,modal:await page.locator('#modal').getAttribute('class'),button:await page.locator('#wsBattleSuitCraft').innerText()}));throw error}
    assert.equal(posts.length,before+1);
    assert.equal(posts.at(-1).paymentType,scenario.payment);
    assert.equal(posts.at(-1).recipeId,scenario.recipe);
    assert.equal(dialogs.filter(row=>row.type==='alert').length,0);
    assert.ok(dialogs.some(row=>row.type==='confirm'&&row.message.includes('코인')&&row.message.includes('마스터의 별')));
   }finally{await page.close()}
  }
  const retryPage=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  retryPage.on('dialog',dialog=>dialog.accept());
  try{
   await retryPage.goto(origin,{waitUntil:'domcontentloaded'});
   await retryPage.locator('[data-ws-section="BATTLE_SUIT_CRAFT"]').click();
   await retryPage.locator('[data-suit-recipe="521"]').click();
   busyNextPost=true;
   const before=posts.length;
   await retryPage.locator('#wsBattleSuitCraft').click();
   try{await retryPage.locator('#wsBattleSuitCraft').filter({hasText:'이전 배틀슈트 제작 결과 확인'}).waitFor({timeout:5000})}
   catch(error){console.error(JSON.stringify({posts:posts.slice(before),button:await retryPage.locator('#wsBattleSuitCraft').allTextContents(),pending:await retryPage.evaluate(()=>sessionStorage.getItem('cnine_pending_workshop_requests_v1881')),body:(await retryPage.locator('body').innerText()).slice(-600)}));throw error}
   await retryPage.locator('#wsBattleSuitCraft').click();
   await retryPage.locator('.ws81-suit-result').waitFor({state:'attached'});
   assert.equal(posts.length,before+2);
   assert.equal(posts.at(-1).requestId,posts.at(-2).requestId);
   assert.equal(posts.at(-1).paymentType,'BOTH');
  }finally{await retryPage.close()}
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});
