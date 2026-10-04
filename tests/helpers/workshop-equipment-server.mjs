import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {equipmentFixture} from './workshop-equipment-fixture.mjs';
import {handleWorkshop,__workshopReadTest} from '../../functions/_workshop.js';
import {executeEquipmentCraft} from '../../functions/_workshop_equipment_craft.js';
import {readJointBody} from '../../functions/_joint_request.js';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
let f;
async function reset(mode="default"){if(f)await f.close();f=await equipmentFixture();
  for(const key of ['safe_runtime_upgrade_v1678_synthesis_rate_scrapyard_rewards','safe_runtime_upgrade_v1933_workshop_material_craft_no_schema_change','safe_runtime_upgrade_v2004_battle_suit_workshop','safe_runtime_upgrade_v2066_battle_suit_core_catalog','safe_runtime_upgrade_v2124_battle_suit_core_5_6'])await f.p('INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,'1').run();
  await f.p("UPDATE character_equipment_items SET name=CASE id WHEN 101 THEN '금룡 돌격소총' WHEN 102 THEN '인피니티 AK' ELSE name END").run();
  const key='WORKSHOP_EQUIPMENT_CRAFT_V1:QA_EQUIPMENT',row=await f.p('SELECT value FROM app_meta WHERE key=?',key).first(),policy=JSON.parse(row.value);policy.inputName='금룡 돌격소총';await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy),key).run();
  if(mode==='emperor'||mode==='consume'){
    await f.p("UPDATE character_equipment_items SET name='엠퍼러 슈트',image_url='assets/items/emperor-suit-v1.png' WHERE id=102").run();
    await f.p("UPDATE workshop_recipes_v1668 SET name='엠퍼러 슈트 제작'").run();
    if(mode==='consume'){policy.failureInputPolicy='CONSUME';await f.p('UPDATE app_meta SET value=? WHERE key=?',JSON.stringify(policy),key).run();}
  }
  await f.p("UPDATE inventory_items SET name='미스틱 에너지',image_url='assets/items/starlight-armor-core-v1749.png' WHERE code='QA_MATERIAL'").run();
  await f.p("UPDATE workshop_recipes_v1668 SET description='승급을 위한 정밀 제작. +10 장비의 힘을 새로운 무기에 담습니다.'").run();
}
await reset();
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:8803');
 if(url.pathname==='/qa/reset'&&req.method==='POST'){await reset(url.searchParams.get('mode'));res.end('ok');return;}
 if(url.pathname==='/qa/workshop'){
  res.setHeader('content-type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/workshop-v1676.css"><link rel="stylesheet" href="/css/workshop-v1881.css"><link rel="stylesheet" href="/css/workshop-workbench-v1.css"><link rel="stylesheet" href="/css/equipment-craft-reveal-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#08111c;color:#eaf4ff;font-family:Arial,sans-serif}#view{max-width:1380px;margin:auto;padding:20px}.modal{display:none}.modal.show{display:flex;position:fixed;inset:0;z-index:999;background:#000b;align-items:center;justify-content:center;overflow:auto}button{cursor:pointer;font-family:inherit}button:disabled{cursor:not-allowed}@media(max-width:600px){#view{padding:10px}}</style><main id="view"></main><div id="modal" class="modal"></div><script>localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');window.loadUser=()=>({id:7,coin:12000000000000});window.apiRequest=async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{'content-type':'application/json',authorization:'Bearer local-account-7'}});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d};</script><script src="/js/workshop-recipes-v1.js"></script><script src="/js/equipment-craft-reveal-v1.js"></script><script src="/js/workshop-v1881.js"></script><script>document.getElementById('view').innerHTML=workshopView(loadUser(),{workshopSection:'ITEM_SYNTHESIS'});bindWorkshopView();</script></html>`);return;
 }
 if(url.pathname==='/qa/cms'){
  res.setHeader('content-type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/workshop-admin-v1668.css"><style>body{display:block;padding:20px}#cms{max-width:1340px;margin:auto}#nav{display:block}.view[hidden]{display:none!important}input,select{min-width:0;max-width:100%}</style><h1 id="pageTitle">격리 CMS 검수</h1><nav id="nav"><button data-view="equipment">장비</button></nav><main id="cms"></main><script>localStorage.setItem('cnine_admin_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');</script><script src="/admin/workshop-admin-v1668.js"></script></html>`);return;
 }
 if(url.pathname.startsWith('/api/')){
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(chunks)})});
  const action=url.pathname.slice(5);let response;
  if(action==='workshop/equipment-craft'){
   const body=await readJointBody(request,{fields:['recipeId','instanceId','attempts','requestId']});
   const result=await f.deps.withUserMutationLock(f.env,7,action,()=>executeEquipmentCraft(f.env,f.user,body,{randomInt:()=>9999}));
   response=Response.json({...result,state:await __workshopReadTest.userWorkshopState(f.env,f.user)});
  }else response=await handleWorkshop({path:action,request,env:f.env,deps:{...f.deps,readBody:r=>r.json()}});
  res.writeHead(response?.status||404,Object.fromEntries(response?.headers||[]));res.end(response?await response.text():'{}');return;
 }
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.resolve(root)+path.sep))throw Error('invalid path');
 if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');const data=await fs.readFile(file);res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);
}catch(error){res.writeHead(error.status||500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
server.listen(8803,'127.0.0.1',()=>console.log('Local isolated equipment crafting: http://127.0.0.1:8803/qa/workshop'));
process.on('SIGINT',()=>server.close(async()=>{await f.close();process.exit();}));
