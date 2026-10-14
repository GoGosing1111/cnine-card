import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {collectionFixture} from './helpers/collection-bonuses-fixture.mjs';
import {handlePetCompanionCms} from '../functions/_pet_companion_cms.js';
import {handlePetEquipment} from '../functions/_pet_equipment.js';
import {handlePetPotential} from '../functions/_pet_potential.js';
import {handleTrophyBonusCms} from '../functions/_trophy_bonus_cms.js';
import {readCollectionBonuses,readTrophyBonusSettings} from '../functions/_collection_bonuses.js';
import {readTrophyHonors} from '../functions/_trophy_honors.js';
import {trophyBonusProjection} from '../shared/trophy-bonuses-v1.mjs';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),out=process.env.COLLECTION_QA_DIR;
assert.ok(out);fs.mkdirSync(out,{recursive:true});
const f=await collectionFixture(null),errors=[],checks=[];
const deps={authenticate:async()=>f.user,requirePermission:async()=>({id:9,role:'OWNER'}),json:(data,status=200)=>Response.json(data,{status}),withUserMutationLock:async(_e,_u,_p,fn)=>fn()};
const shell=(css,body,script)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(h=>`<link rel="stylesheet" href="${h}">`).join('')}<style>body{margin:0;padding:20px;background:#080f1b;color:#e9f0fb;font-family:Arial,sans-serif}main{max-width:1400px;margin:auto}button,input,select{font:inherit}@media(max-width:600px){body{padding:10px}}</style></head><body>${body}<script type="module">${script}</script></body></html>`;
const profile=async()=>{
  const p=trophyBonusProjection((await readTrophyBonusSettings(f.env)).document,await readTrophyHonors(f.env,7));
  return {player:{id:7,nickname:'보유 효과 검수',title:null,avatar:null,clan:null},ranked:{season:'검수 시즌',state:'UNRANKED',tier:null,wins:0,losses:0,bestRank:1,completedSeasons:2,longestStreak:2,currentStreak:2,history:[]},clanHistory:[],trophies:p.trophies,trophyBonuses:p.totals,frame:{name:'옵시디언',level:0,enhancement:{enabled:false}},historyLimit:12};
};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://local'),route=url.pathname;
  if(route.startsWith('/api/')){
    let body='';for await(const chunk of req)body+=chunk;
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(body?{body}:{})});
    const args={path:route.slice(5),request,env:f.env,deps};
    const response=await handlePetCompanionCms(args)||await handlePetEquipment(args)||await handlePetPotential(args)||await handleTrophyBonusCms(args);
    if(!response){res.writeHead(404).end();return;}res.writeHead(response.status,{'content-type':'application/json'});res.end(await response.text());return;
  }
  let html;
  if(route==='/qa/pet-admin')html=shell(['/admin/companion-admin-v2.css','/css/collection-bonuses-v1.css'],'<main id="root"></main>',"import {mountCompanionCms} from '/admin/companion-admin-v2.mjs';mountCompanionCms(document.querySelector('#root'));");
  if(route==='/qa/trophy-admin')html=shell(['/css/collection-bonuses-v1.css'],'<main id="root"></main>',"import {mountTrophyBonuses} from '/admin/trophy-bonuses-v1.mjs';mountTrophyBonuses(document.querySelector('#root'));");
  if(route==='/qa/pets')html=shell(['/css/pet-equipment-v1.css','/pet-codex/style.css','/css/collection-bonuses-v1.css'],'<main id="root"></main>',"import {mountPetEquipment} from '/js/pet-equipment-window-v1.mjs';mountPetEquipment(document.querySelector('#root'),{codex:false});");
  if(route==='/qa/trophies')html=shell(['/css/player-card-v2052.css','/css/collection-bonuses-v1.css'],'<script src="/js/player-card-v2052.js"></script>',`PlayerCallingCard.open({previewData:${JSON.stringify(await profile())}});`);
  if(html){res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(html);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(route));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(e){errors.push(e.message);res.writeHead(500).end(e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [label,width]of [['desktop',1440],['mobile',390]]){
  const context=await browser.newContext({viewport:{width,height:width>600?1050:844},serviceWorkers:'block',reducedMotion:'reduce',isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(()=>{localStorage.setItem('cnine_admin_token','qa');localStorage.setItem('cnine_card_api_token','qa');});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(label+': '+e.message));
  const fit=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow '+page.url());
  const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await fit();await page.screenshot({path:path.join(out,label+'-'+name+'.png'),fullPage:true});};
  await page.goto(base+'/qa/pet-admin');await page.locator('[data-reward-bonus="dropPercent"]').waitFor();
  await page.locator('[data-reward-bonus="dropPercent"]').fill('12.5');await page.locator('[data-reward-bonus="accountXpPercent"]').fill('25');await page.locator('[data-reward-bonus="coinPercent"]').fill('35');await page.locator('[data-save]').click();await page.locator('[data-status]').filter({hasText:'저장 완료'}).waitFor();
  assert.equal((await readCollectionBonuses(f.env,7)).petBonuses.dropPercent,12.5);await page.locator('.cp-reward-bonuses').scrollIntoViewIfNeeded();await shot('pet-cms');checks.push(label+': pet CMS three fields save through real handler');
  await page.goto(base+'/qa/trophy-admin');const input=page.locator('[data-tb-code="RANKED_CHAMPION"][data-tb-key="coinPercent"]');await input.waitFor();await input.fill('18.75');await page.locator('[data-tb-save]').click();await page.locator('[data-tb-status]').filter({hasText:'저장 완료'}).waitFor();assert.equal((await readCollectionBonuses(f.env,7)).trophyBonuses.coinPercent,23.75);await shot('trophy-cms');checks.push(label+': trophy CMS save and decimal percent preserved');
  await page.goto(base+'/qa/pets');await page.locator('.pe-reward-title').waitFor();assert.match(await page.locator('[data-pet-detail]').textContent(),/드랍률 증가\+12.5%[\s\S]*계정 경험치 보너스\+25%[\s\S]*코인 보너스\+35%/);await page.locator('.pe-reward-title').scrollIntoViewIfNeeded();await shot('pet-effects');checks.push(label+': equipped pet bonuses visible and readable');
  await page.goto(base+'/qa/trophies');await page.locator('.pc-reward-summary').waitFor();assert.match(await page.locator('.pc-reward-summary').textContent(),/드랍률 \+7%[\s\S]*계정 경험치 \+15%[\s\S]*코인 \+23.75%/);await page.locator('[data-pc-page="next"]').click();await page.locator('[data-pc-trophy="3"]').click();assert.match(await page.locator('#pc-trophy-detail').textContent(),/계정 경험치 보너스 \+10%/);await page.locator('#pc-trophy-detail').scrollIntoViewIfNeeded();await shot('trophy-effects');checks.push(label+': owned trophy summary and detailed effects');
  await context.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks:checks.length,errors,out}));
}finally{await browser.close();await new Promise(r=>server.close(r));f.close();}
