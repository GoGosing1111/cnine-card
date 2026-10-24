// Local SQLite and actual workshop UI. Never connects to production services.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {equipmentFixture} from './workshop-equipment-fixture.mjs';
import {saveMercenaryCraft} from '../../functions/_mercenary_craft.js';
import {handleWorkshop} from '../../functions/_workshop.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),run=promisify(execFile);
export async function craftRevealServer(){
  let f;const receipts=[],writes=[];
  async function reset({code='WORKSHOP_JOKRO',success=true}={}){
    if(f)await f.close();f=await equipmentFixture();receipts.length=0;writes.length=0;
    await f.p('ALTER TABLE inventory_items ADD COLUMN updated_at TEXT').run();
    await f.p("INSERT INTO inventory_items(code,name,category,is_active,image_url) VALUES('MERCENARY_SSS_CARD_SHARD','SSS 용병 카드 조각','MATERIAL',1,'assets/items/mercenary-sss-card-shard-v1.png')").run();
    await f.p("INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,'MERCENARY_SSS_CARD_SHARD',100,100)").run();
    await f.p("UPDATE cnine_user_inventory SET quantity=100000000 WHERE item_code='MASTER_STAR'").run();
    await saveMercenaryCraft(f.env,f.user,{code,category:'MERCENARY_CRAFT',outputType:'MERCENARY',outputRef:code==='WORKSHOP_JOKRO'?'V-979':'V-988',outputQuantity:1,paymentMode:'BOTH',craftRevision:0,coinCost:1e12,masterStarCost:code==='WORKSHOP_JOKRO'?1e7:1e6,successRate:success?100:0,materials:[{itemCode:'MERCENARY_SSS_CARD_SHARD',quantity:code==='WORKSHOP_JOKRO'?15:5}],isActive:true,isPublic:true});
  }
  await reset();
  const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><link rel="stylesheet" href="/css/workshop-workbench-v1.css"><link rel="stylesheet" href="/css/command-ui-v1.css"><link rel="stylesheet" href="/css/mercenary-craft-reveal-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}.modal{display:none}.modal.show{display:flex;position:fixed;inset:0;z-index:999;background:#000b;align-items:center;justify-content:center;overflow:auto}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><div id="modal" class="modal"></div><script>localStorage.setItem('cnine_card_api_token','local-fixture');localStorage.setItem('cnine_battle_sound','OFF');window.loadUser=()=>({id:7});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/mercenary-craft-reveal-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'MERCENARY_CRAFT'});bindWorkshopView();</script></html>`;
  const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
  const server=http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/qa/workshop'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);}
    if(url.pathname.startsWith('/api/')){
      const chunks=[];for await(const c of req)chunks.push(c);
      const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
      if(req.method==='POST')writes.push(url.pathname);
      const response=await handleWorkshop({path:url.pathname.slice(5),request,env:f.env,deps:{...f.deps,readBody:r=>r.json()}});
      const text=response?await response.text():'{}';if(req.method==='POST')receipts.push(JSON.parse(text));
      res.writeHead(response?.status||404,{'content-type':'application/json'});return res.end(text);
    }
    let relative=decodeURIComponent(url.pathname).replace(/^\//,'');if(!relative||relative.endsWith('/'))relative+='index.html';
    const file=path.resolve(root,relative);if(!file.startsWith(path.resolve(root)+path.sep))throw Error('Invalid path');
    let data;try{data=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;data=(await run('git',['show','HEAD:'+relative],{cwd:root,encoding:'buffer',maxBuffer:25e6,windowsHide:true})).stdout;}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
  }catch(error){res.writeHead(404,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message.slice(0,200)}));}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {base:`http://127.0.0.1:${server.address().port}`,reset,receipts,writes,balance:()=>f.coin(),close:async()=>{await new Promise(resolve=>server.close(resolve));await f.close();}};
}
