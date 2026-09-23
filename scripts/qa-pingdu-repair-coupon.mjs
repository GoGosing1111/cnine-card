// Local-only UI harness: real inventory markup, CMS and forge API; isolated SQLite.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {forgeFixture} from '../tests/helpers/forge-db.mjs';
import {FORGE_RUNTIME_KEY} from '../shared/equipment-forge-policy-v1.mjs';
import {ensureForgeRepairCatalog,FORGE_REPAIR_ITEM} from '../functions/_forge_repair_catalog.js';
import {ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM} from '../functions/_forge_protection_catalog.js';
import * as liveForge from '../functions/_equipment_forge_transactions.js';
import * as liveRoutes from '../functions/_equipment_forge_routes.js';
import {handleEquipmentForgePublic} from '../functions/_equipment_forge_public.js';
import release from '../docs/releases/equipment-forge-approved-20260922.json' with {type:'json'};
import {jointHash} from '../functions/_joint_transactions.js';
import {EQUIPMENT_FORGE_RELEASE_KEY} from '../shared/equipment-forge-release-v1.mjs';
import {equipmentPreviewRows,equipmentEnhancementRows,equipmentQuantities} from '../functions/_equipment_inventory.js';
const inventoryQa=process.env.FORGE_INVENTORY_QA==='1';
const readiness=process.env.FORGE_READINESS_QA==='1';let loseNextResponse=false;
let quoteFailures=0,lockFailures=0,quoteDelay=0;
const requestStats={quote:0,enhance:0,restore:0,receipt:0,quoteInFlight:0,quoteMaxInFlight:0};
const runtime=readiness?{...liveForge,...liveRoutes}:await import('../tests/helpers/forge-held-runtime.mjs');
const {forgeQuote,executeForge,handleForgeRuntimeReady}=runtime;
const root=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.env.REPAIR_QA_PORT||8963),host=`127.0.0.1:${port}`,origin=`http://${host}`;
const f=await forgeFixture(null);await ensureForgeRepairCatalog(f.env);await ensureForgeProtectionCatalog(f.env);
const qaPolicy=readiness?structuredClone(release.policy):{...f.policy,restoration:{enabled:true,coinCost:0,itemCode:FORGE_REPAIR_ITEM.code,itemQuantity:1,levelMode:'PREVIOUS',expiresHours:0}};
if(readiness){
 const document={...release,approvedBy:7,approvalReference:'ISOLATED LOCAL QA ONLY - not a production account',policy:qaPolicy};
 await f.setting(EQUIPMENT_FORGE_RELEASE_KEY,{document,sha256:await jointHash(document)});
 await f.setting('equipment_forge_public_settings_v1',{schemaVersion:1,revision:1,publicVisible:true,executionMode:'ON',notice:'로컬 격리 검수'});
 await f.p('UPDATE users SET coin=9000000000000 WHERE id=7').run();await f.p("UPDATE cnine_user_inventory SET quantity=5000000 WHERE user_id=7 AND item_code='MASTER_STAR'").run();await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity) VALUES(7,?,10)',FORGE_PROTECTION_ITEM.code).run();f.deps.forgeRandomInt=()=>999999;
}
await f.setting(FORGE_RUNTIME_KEY,qaPolicy);
await f.p('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(7,?,2,1)',FORGE_REPAIR_ITEM.code).run();
await f.p("UPDATE character_equipment_items SET image_url='assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png' WHERE id=1").run();
await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) VALUES(?,7,8,1)',f.instanceId).run();
const quote=await forgeQuote(f.env,f.user,{requestId:crypto.randomUUID(),kind:'ENHANCE',instanceId:f.instanceId});
await executeForge(f.env,f.user,{requestId:crypto.randomUUID(),quoteId:quote.quoteId},'ENHANCE',{randomInt:()=>999999});
if(readiness)for(const [index,slot,n] of [[2,'WEAPON',8],[3,'TOP',6],[4,'BOTTOM',9],[5,'SHOES',10],[6,'ACCESSORY',7]]){
 await f.p('INSERT INTO character_equipment_items(id,code,name,slot,subtype,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,?,?,?,?,?,?,?)',index,`QA_${slot}`,`검수 +${n} ${slot}`,slot,'TEST','MYTHIC','assets/ui/project-v/account-battle-suits/weapons/infinity-m200-v1.png',10000,9000,1000).run();
 await f.p("INSERT INTO user_equipment_instances(user_id,equipment_id,source_type,request_id) VALUES(7,?,'TEST',?)",index,`forge-ready-${index}`).run();
 await f.p('INSERT INTO equipment_forge_states_v1(instance_id,user_id,level,revision) SELECT id,7,?,1 FROM user_equipment_instances WHERE request_id=?',n,`forge-ready-${index}`).run();
}
const api=fs.readFileSync(path.join(root,'functions/api/[[path]].js'),'utf8');
if(inventoryQa){
 f.DB.sql.exec('ALTER TABLE character_equipment_items ADD COLUMN sort_order INTEGER DEFAULT 0');
 for(const [id,name,slot,total,image]of [[31,'소버린 SKS','WEAPON',115000,'assets/ui/project-v/account-battle-suits/weapons/sovereign-sks-v1.png'],[32,'미스틱 슈트','TOP',50000,'assets/items/sovereign-top-v1.webp'],[33,'미스틱 레깅스','BOTTOM',50000,'assets/items/sovereign-bottom-v1.webp'],[34,'미스틱 슈즈','SHOES',50000,'assets/items/sovereign-shoes-v1.webp']]){
  await f.p("INSERT INTO character_equipment_items(id,code,name,slot,subtype,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,?,'TEST','MYTHIC',?,?,?,?)",id,'SORT_QA_'+id,name,slot,total?image:'',total,total*.9,total*.1).run();
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(?,7,?,?)",id*10,id,'sort-qa-'+id).run();
 }
 await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(311,7,31,'sort-qa-stronger')").run();
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(311,7,9,1)').run();
 await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(312,7,31,'sort-qa-same-level')").run();
 await f.p('INSERT INTO equipment_forge_states_v1 VALUES(312,7,9,1)').run();
 await f.p("INSERT INTO user_equipment_loadout VALUES(7,'WEAPON',310) ON CONFLICT(user_id,slot) DO UPDATE SET instance_id=310").run();
 for(let id=400;id<485;id++)await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,request_id) VALUES(?,7,1,?)",id,'sort-qa-recent-'+id).run();
}
// Reproduce the reported +10 shortage without touching any live account.
if(readiness&&process.env.FORGE_SHORTAGE_QA==='1'){
 await f.p("UPDATE cnine_user_inventory SET quantity=184958 WHERE user_id=7 AND item_code='MASTER_STAR'").run();
 await f.p('UPDATE cnine_user_inventory SET quantity=1 WHERE user_id=7 AND item_code=?',FORGE_PROTECTION_ITEM.code).run();
}
async function qaLoadout(){
 const rows=await equipmentEnhancementRows(f.env,7,(await equipmentPreviewRows(f.env,7)).results);
 const loadout=Object.fromEntries((await f.p('SELECT slot,instance_id FROM user_equipment_loadout WHERE user_id=7').all()).results.map(r=>[r.slot,Number(r.instance_id)]));
 return {instances:rows.map(r=>({instanceId:Number(r.instance_id),quantity:r.quantity,quantityFixed:r.quantityFixed,quantityOffset:r.quantityOffset,enhancement:r.enhancement,item:{id:Number(r.id),name:r.name,slot:r.slot,rarity:r.rarity,image:r.image_url,totalPower:Number(r.total_power),pvePower:Number(r.pve_power),pvpPower:Number(r.pvp_power)}})),loadout,titles:[],vehicles:[],equipmentTypeCount:new Set(rows.map(r=>r.id)).size,equipmentQuantitiesPending:true};
}
const inventoryBody=api.slice(api.indexOf("    if(path==='inventory'){"),api.indexOf("    if(path==='inventory/seen'"));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const inventory=new AsyncFunction('deps',`const {env,request,authenticate,json,ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM,ensureForgeRepairCatalog,FORGE_REPAIR_ITEM}=deps;const path='inventory',ensureSkillChipFoundation=async()=>{},ensureBattleSuitCoreCatalog=async()=>{},ensureUniqueAdvancementPassCatalog=async()=>{},ensureMysticEnergyCatalog=async()=>{},blackMiracleSettings=async()=>({enabled:false}),UNIQUE_ADVANCEMENT_PASS_CODE='UNIQUE_ADVANCEMENT_PASS';${inventoryBody}`);
const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8'),inventoryJs=app.slice(app.indexOf('const RETIREMENT_REROLL_META='),app.indexOf('let landSuperstarBusy=false;'));
const login=`<script>localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_admin_token','local-account-7');localStorage.setItem('cnine_battle_sound','OFF');</script>`;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const send=(res,status,body,type='application/json')=>{res.writeHead(status,{'content-type':type+'; charset=utf-8','cache-control':'no-store'});res.end(typeof body==='string'?body:JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!==host)return send(res,403,{});
  const url=new URL(req.url,origin);
  if(inventoryQa&&url.pathname==='/__qa/loadout')return send(res,200,`<!doctype html><html lang="ko"><meta charset="utf-8"><base href="/"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/character-loadout-v2.css"><link rel="stylesheet" href="/css/equipment-forge-entry-v1.css"><style>*{box-sizing:border-box}body{margin:0;background:#02050a}</style><div id="loadout" class="character-loadout-v2-root"></div><script src="/js/character-loadout-v2.js"></script><script>window.SoopketmonCharacterLoadoutV2.create(document.querySelector('#loadout'),{profile:{nickname:'격리 검수 계정'},forgePublicEntry:true,request:async(p,o={})=>{const r=await fetch('/api/'+p,{...o,headers:{authorization:'Bearer local-account-7'}});if(!r.ok)throw Error('QA API failed');return r.json();}});</script></html>`,'text/html');
  if(readiness&&url.pathname==='/__qa/controls'){
    if(req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const params=new URLSearchParams(body);f.deps.forgeRandomInt=()=>Number(params.get('roll')||0);loseNextResponse=params.get('lost')==='on';quoteFailures=Math.min(9,Number(params.get('quoteFailures')||0));lockFailures=Math.min(9,Number(params.get('lockFailures')||0));quoteDelay=Math.min(18000,Number(params.get('quoteDelay')||0));Object.keys(requestStats).forEach(k=>requestStats[k]=0);res.writeHead(303,{location:'/equipment-forge/'});return res.end();}
    return send(res,200,'<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><h1>로컬 전용 강화 검수</h1><form method="POST"><p><label>다음 결과 <select name="roll"><option value="999999">파괴 / 보호</option><option value="0">성공</option><option value="500000">유지</option></select></label></p><p><label><input type="checkbox" name="lost">커밋 후 응답 손실 1회</label></p><p><label>견적 실패 횟수 <input name="quoteFailures" type="number" value="0"></label></p><p><label>강화 잠금 횟수 <input name="lockFailures" type="number" value="0"></label></p><p><label>견적 지연 ms <input name="quoteDelay" type="number" value="0"></label></p><button>검수 화면 열기</button></form><a href="/__qa/state">격리 DB 결과</a></html>','text/html');
  }
  if(url.pathname==='/__qa/inventory')return send(res,200,`<!doctype html><html lang="ko"><head><base href="/"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/css/inventory-v2125.css"></head><body style="background:#080e1c;color:#fff;margin:0;padding:16px"><main id="app"></main>${login}<script>const loadUser=()=>({id:7}),summaryBar=()=>'',clearApiCache=()=>{},escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function apiRequest(p,o={}){const r=await fetch('/api/'+p,{...o,headers:{authorization:'Bearer local-account-7'}});if(!r.ok)throw Error('QA API failed');return r.json();}${inventoryJs}\ndocument.querySelector('#app').innerHTML=inventoryView();loadInventory();</script></body></html>`,'text/html');
  if(url.pathname==='/__qa/cms')return send(res,200,`<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/admin/admin.css"><link rel="stylesheet" href="/admin/equipment-forge-admin-v1.css"><body style="background:#0c1423;color:#fff"><header><h1 id="pageTitle">장비 강화</h1><b id="roleBadge">OWNER</b></header><nav id="nav"></nav><main id="cms"></main>${login}<script>location.hash='equipment-forge';</script><script type="module" src="/admin/equipment-forge-admin-v1.js"></script></body></html>`,'text/html');
  if(url.pathname==='/__qa/state')return send(res,200,{coins:await f.coin(),coupons:await f.qty(FORGE_REPAIR_ITEM.code),...(readiness?{protection:await f.qty(FORGE_PROTECTION_ITEM.code),stars:await f.qty('MASTER_STAR')}:{}),requestStats,records:(await f.p('SELECT record_id,level,restored_instance_id FROM equipment_forge_destroyed_v1').all()).results});
  if(url.pathname.startsWith('/api/')){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>24000)return send(res,413,{});}
    const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),key=url.pathname.slice(5);
    if(inventoryQa&&key==='character/loadout')return send(res,200,await qaLoadout());
    if(inventoryQa&&key==='character/equipment/quantities')return send(res,200,await equipmentQuantities(f.env,7,Number(url.searchParams.get('after')||0)));
    // Isolated component adapter; actual USER equip endpoint is covered by the
    // backend regression test, while this lets the real UI exercise instance IDs.
    if(inventoryQa&&key==='character/equipment/equip'){
     const instanceId=Number(JSON.parse(body).instanceId),owned=await f.p('SELECT x.id,i.slot FROM user_equipment_instances x JOIN character_equipment_items i ON i.id=x.equipment_id WHERE x.id=? AND x.user_id=7',instanceId).first();
     if(!owned)return send(res,404,{error:'not owned'});
     await f.p('INSERT INTO user_equipment_loadout(user_id,slot,instance_id) VALUES(7,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET instance_id=excluded.instance_id',owned.slot,instanceId).run();return send(res,200,{ok:true,instanceId,slot:owned.slot});
    }
    if(key==='inventory/seen')return send(res,200,{ok:true});
    if(key==='inventory'){const response=await inventory({env:f.env,request,...f.deps,ensureForgeProtectionCatalog,FORGE_PROTECTION_ITEM,ensureForgeRepairCatalog,FORGE_REPAIR_ITEM});return send(res,response.status,await response.json());}
    if(!key.startsWith('character/equipment/forge/')&&!key.startsWith('admin/equipment-forge'))return send(res,200,{items:[],ok:true});
    const action=key.split('/').at(-1);if(action in requestStats)requestStats[action]++;
    if(readiness&&action==='quote'){
     requestStats.quoteMaxInFlight=Math.max(requestStats.quoteMaxInFlight,++requestStats.quoteInFlight);
     if(quoteDelay)await new Promise(resolve=>setTimeout(resolve,quoteDelay));
     if(quoteFailures>0){quoteFailures--;requestStats.quoteInFlight--;return send(res,503,{code:'JOINT_LOCK_BUSY',error:'QA: 같은 계정의 요청을 처리 중입니다.',retryable:true});}
    }
    const args={path:key,request,env:f.env,deps:{...f.deps,requirePermission:f.deps.authenticate,...(readiness?{withUserMutationLock:async(...args)=>{if(lockFailures>0){lockFailures--;throw Object.assign(Error('QA: 같은 계정의 요청을 처리 중입니다.'),{code:'JOINT_LOCK_BUSY',status:409});}return f.deps.withUserMutationLock(...args);}}:{})}},response=key==='admin/equipment-forge'?await handleEquipmentForgePublic(args):await handleForgeRuntimeReady(args);
    if(readiness&&action==='quote')requestStats.quoteInFlight--;
    if(readiness&&loseNextResponse&&/\/(enhance|restore)$/.test(key)&&response.ok){loseNextResponse=false;return send(res,503,{error:'QA: 커밋 후 응답 손실'});}
    return send(res,response.status,await response.json());
  }
  const rel=decodeURIComponent(url.pathname).replace(/^\/+/,''),target=path.resolve(root,rel);
  if(!target.startsWith(root)||rel.split(/[\\/]/).some(p=>p==='..'||p.startsWith('.'))||!['equipment-forge','admin','assets','preview','css','js','shared','style.css'].includes(rel.split('/')[0]))return send(res,404,{});
  const file=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;if(!fs.existsSync(file))return send(res,404,{});
  if(url.pathname==='/equipment-forge/')return send(res,200,fs.readFileSync(file,'utf8').replace('<head>','<head>'+login),'text/html');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}catch(error){console.error(error);send(res,500,{error:error.message});}});
server.listen(port,'127.0.0.1',()=>console.log(`Repair QA: ${origin}/__qa/cms | /__qa/inventory | /equipment-forge/`));
process.on('SIGINT',()=>server.close(()=>{f.close();process.exit(0);}));
