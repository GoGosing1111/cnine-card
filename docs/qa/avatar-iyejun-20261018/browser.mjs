import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const base='preview/avatar-iyejun-suit-20261018-v1/assets/';
const avatar={code:'IYEJUN',serial:'A-36',name:'이예준',callSign:'IYEJUN',role:'차콜 수트',description:'차콜 쓰리피스 수트와 스트라이프 타이의 이예준 아바타입니다.',accent:'#c9ad80',version:1,active:true,public:true,owned:false,equipped:false,saleEnabled:false,acquisitionType:'UNSET',coinPrice:null,lobbyImage:base+'avatar-iyejun-lobby-v1-1024.webp',lobbyMobileImage:base+'avatar-iyejun-lobby-v1-640.webp',equipmentImage:base+'avatar-iyejun-equipment-v1-640.webp',effects:[{type:'DROP_RATE_PERCENT',value:45},{type:'COIN_GAIN_PERCENT',value:150},{type:'RAID_EXTRA_ENTRY',value:15},{type:'BATTLE_POWER_PERCENT',value:4.5}]};
const data={avatars:[avatar],settings:{mode:'ON',shopEnabled:true},feature:{visible:true},coin:0};
const shell=(css,scripts,body)=>`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#090d14;color:#fff;font-family:Arial,sans-serif}*{box-sizing:border-box}</style>${css.map(p=>`<link rel="stylesheet" href="/${p}">`).join('')}<body>${body}${scripts.map(p=>`<script src="/${p}"></script>`).join('')}`;
const pages={
 '/qa-avatar':shell(['css/avatar-shop-v1.css'],['js/avatar-shop-v1.js'],'<main id="root"></main>')+`<script>SoopketmonAvatarShopV1.create(document.getElementById('root'),{assetBase:'/',data:${JSON.stringify(data)}})</script>`,
 '/qa-loadout':shell(['css/character-loadout-v2.css'],['js/character-loadout-v2.js'],'<main id="root"></main>')+`<script>SoopketmonCharacterLoadoutV2.create(document.getElementById('root'),{assetBase:'/',profile:{nickname:'이예준'},data:{loadout:{},instances:[],titles:[],vehicles:[],bonuses:{},equippedAvatar:${JSON.stringify(avatar)}},request:async()=>{throw Error('fixture only')}})</script>`,
 '/qa-admin':shell(['admin/style.css','admin/avatar-admin-v1.css'],['admin/avatar-admin-v1.js'],'<nav id="nav"></nav><main><h1 id="pageTitle"></h1></main>')
};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/admin/avatars'){res.setHeader('content-type','application/json');res.end(JSON.stringify({...data,effectTypes:avatar.effects.map(e=>e.type)}));return}
 if(pages[url.pathname]){res.setHeader('content-type','text/html');res.end(pages[url.pathname]);return}
 const target=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!target.startsWith(root))throw Error('path');
 res.setHeader('content-type',({'.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');res.end(await readFile(target));
 }catch{res.statusCode=404;res.end('missing')}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true,channel:'chrome'}),report=[];
try{
 for(const [name,viewport] of [['pc',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/qa-avatar');
  await page.locator('.avs1-effect-options .is-coin strong').waitFor();assert.equal(await page.locator('.avs1-effect-options .is-coin strong').innerText(),'+150%');
  assert.ok((await page.locator('body').innerText()).includes('+4.5%'));
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  await page.screenshot({path:fileURLToPath(new URL(name+'-catalog.png',import.meta.url)),fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
  await page.goto(origin+'/qa-loadout');await page.locator('.clv2-quartermaster.is-equipped-avatar').waitFor();
  await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));
  await page.screenshot({path:fileURLToPath(new URL(name+'-equipment.png',import.meta.url)),fullPage:true});
  const bounds=await page.locator('.clv2-quartermaster.is-equipped-avatar').boundingBox();assert.ok(bounds.width>100&&bounds.height>300);
  assert.deepEqual(errors,[]);report.push({viewport,overflow,errors,equipmentBounds:bounds});await page.close();
 }
 const admin=await browser.newPage();await admin.goto(origin+'/qa-admin');await admin.locator('[data-view="avatars"]').click();
 const card=admin.locator('[data-avatar-code="IYEJUN"]');await card.waitFor();
 const options=await card.locator('[data-effect-row]').evaluateAll(rows=>rows.map(r=>{const i=r.querySelector('[data-effect-value]');return {type:r.querySelector('select').value,value:i.value,max:i.max,step:i.step,valid:i.checkValidity()}}));
 assert.equal(options[1].value,'150');assert.equal(options[1].max,'150');assert.equal(options[3].value,'4.5');assert.equal(options[3].valid,true);
 report.push({adminOptions:options});await admin.close();
 await writeFile(new URL('browser.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();server.close()}
