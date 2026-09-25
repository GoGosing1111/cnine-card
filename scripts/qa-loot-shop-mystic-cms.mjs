// Local-only CMS/player verification against real routes and an isolated SQLite DB.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lootFixture} from '../tests/helpers/loot-shop-db.mjs';
import {handleLootShop} from '../functions/_loot_shop.js';
const root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.LOOT_QA_PORT||8967);
const host=`127.0.0.1:${port}`,origin=`http://${host}`,f=await lootFixture(null);
await f.p("INSERT INTO character_equipment_items(id,code,name,rarity,image_url) VALUES(904,'EXCLUDED','엠퍼러 슈트','MYTHIC','assets/items/pig-coin-v1.png')").run();
const mystic=f.shopPolicy.products.find(p=>p.type==='MYSTIC_EQUIPMENT');mystic.equipmentId=null;mystic.enabled=false;
if(process.env.LOOT_QA_SS==='1'){const ss=f.shopPolicy.products.find(p=>p.type==='MERCENARY_SS_PACK');Object.assign(ss,{enabled:false,price:null,accountLimit:null,mercenaryCodes:[]});}
await f.setShop(f.shopPolicy);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
let loseAcknowledgement=process.env.LOOT_QA_LOSE_ACK==='1';
const send=(res,status,body,type='text/html')=>{res.writeHead(status,{'content-type':type+'; charset=utf-8','cache-control':'no-store'});res.end(body);};
const server=http.createServer(async(req,res)=>{try{
 if(req.headers.host!==host)return send(res,403,'Forbidden');
 const url=new URL(req.url,origin);
 if(url.pathname==='/loot-shop/')return send(res,200,fs.readFileSync(path.join(root,'loot-shop/index.html'),'utf8').replace('<head>','<head><script>localStorage.setItem("cnine_card_api_token","local-account-7")</script>'));
 if(url.pathname==='/mobile')return send(res,200,'<!doctype html><html><meta charset="utf-8"><body style="margin:0;background:#080d16"><iframe title="390px 모바일 CMS" src="'+(url.searchParams.get('view')==='shop'?'/loot-shop/':'/cms#ss')+'" style="width:390px;height:850px;border:0"></iframe></body></html>');
 if(url.pathname==='/cms')return send(res,200,`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/loot-shop-admin-v1.css"><style>body{display:block;padding:16px;background:#0c111b;color:#fff}main{margin:auto}nav{display:flex;gap:20px;margin-bottom:16px}a{color:#eed295}</style><nav><a href="#mystic">미스틱 상품</a><a href="#ss">SS팩</a><a href="#save">저장 버튼</a><a href="/loot-shop/">유저 상점</a><a href="/mobile">390px 모바일</a></nav><main class="loot-admin" id="root"></main><script type="module">import {mountLootShopCms} from '/admin/loot-shop-admin-v1.mjs?v=7';localStorage.setItem('cnine_admin_token','local-account-7');await mountLootShopCms(document.querySelector('#root'));const anchors=()=>{document.querySelector('[data-product="3"]').id='mystic';document.querySelector('[data-product="5"]').id='ss';document.querySelector('footer').id='save'};anchors();new MutationObserver(anchors).observe(document.querySelector('form'),{childList:true});</script></html>`);
 if(url.pathname.startsWith('/api/')){
  let body='';for await(const chunk of req)body+=chunk;
  const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body})});
  const response=await handleLootShop({path:url.pathname.slice(5),request,env:f.env,deps:f.deps});
  if(loseAcknowledgement&&url.pathname==='/api/loot-shop/purchase'&&response?.status===200){loseAcknowledgement=false;return send(res,503,JSON.stringify({error:'격리 검수: 지급 완료 후 응답 유실',retryable:true}),'application/json');}
  return send(res,response?.status||404,response?await response.text():'{}','application/json');
 }
 const pathname=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root)||!/^\/(admin|js|shared|assets|css)\//.test(pathname)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(res,404,'Not found');
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(e){send(res,500,JSON.stringify({error:e.message}),'application/json');}});
server.listen(port,'127.0.0.1',()=>console.log(`Isolated loot CMS QA: ${origin}/cms`));
process.on('SIGINT',()=>server.close(()=>{f.close();process.exit();}));
