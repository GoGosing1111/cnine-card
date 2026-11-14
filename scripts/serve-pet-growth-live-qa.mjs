import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {petLiveFixture} from '../tests/helpers/pet-live-fixture.mjs';
import {handlePetGrowth} from '../functions/_pet_growth.js';
import {initialPetGrowth,emptyPetGrowth} from '../shared/pet-growth-live-v2.mjs';
const f=await petLiveFixture(),root=process.cwd(),cache=new Map();
const current=JSON.parse(await fs.readFile('C:/Users/User/Downloads/upload/cnine-card/operations/pet-rework-live-20261114/preflight.json','utf8')).records.find(x=>x.key==='pet_cms_preparation_v1').value;
await f.write('pet_cms_preparation_v1',current);await f.write('pet_collection_v1:2',{revision:1,pets:{'PET-HEUKGU':2,'PET-BONGSOON':1}});
await f.pg.exec("ALTER TABLE users ADD COLUMN coin BIGINT NOT NULL DEFAULT 2000000000000000; CREATE TABLE coin_logs(user_id BIGINT,change_amount BIGINT,balance_after BIGINT,reason TEXT); INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(2,'MASTER_STAR',1000000000,1000000000)");
await f.write('pet_potential_settings_v1',{version:1,revision:1,enabled:true,successPpm:100000});
const initial=initialPetGrowth('PET-HEUKGU');initial.stats={attack:'B',defense:'A',hp:'S',speed:'SS'};initial.trait={id:'GUARD',grade:'S'};
async function reset(){await f.write('pet_loadout_v1:2',{revision:1,petCode:initial.petCode,audit:[]});await f.write('pet_growth_v2:2',{...emptyPetGrowth(),pets:{[initial.id]:initial},loadouts:{PVE:initial.id,PVP:initial.id}});await f.pg.exec("UPDATE users SET coin=2000000000000000; UPDATE cnine_user_inventory SET quantity=1000000000,unseen_quantity=1000000000 WHERE item_code='MASTER_STAR'");}
await reset();
const types={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html; charset=utf-8','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json','.svg':'image/svg+xml'};
async function bytes(name,before){if(!before)try{return await fs.readFile(path.join(root,name));}catch{}const key=(before?'before:':'')+name;if(!cache.has(key))cache.set(key,execFileSync('git',['show','3fbbe62adab38a6d13cacafea630f117ecc7894d:'+name],{maxBuffer:16e6,stdio:['ignore','pipe','ignore']}));return cache.get(key);}
const deps={authenticate:async()=>({id:2,role:'USER'}),json:(body,status=200)=>Response.json(body,{status}),withUserMutationLock:async(_e,_u,_p,work)=>work()};
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:18876');let name=decodeURIComponent(url.pathname).replace(/^\//,'');if(!name)name='index.html';if(name.endsWith('/'))name+='index.html';
 if(name.includes('..')||path.isAbsolute(name)){res.writeHead(400);return res.end();}
 if(name==='__reset'){await reset();res.writeHead(200);return res.end('OK');}
 if(name.startsWith('api/')){
  const api=name.slice(4),parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts).toString();let response;
  if(api==='pets/v2/growth'){const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})});response=await handlePetGrowth({path:api,request,env:f.env,deps});}
  else if(api==='server-support/info')response=Response.json({serverNow:Date.now(),subscription:{revision:1,active:true,endsAt:Date.now()+86400000,magnetPetCode:'PET-BONGSOON'}});
  else if(api==='server-support/pet')response=Response.json({ok:true});
  else if(api.startsWith('pets/v1/')){const r=await f.call(api,{method:req.method,...(body?{body:JSON.parse(body)}:{})});response=Response.json(r.body,{status:r.status});}
  else response=Response.json({},{status:200});
  res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(await response.text());
 }
 const before=req.headers['x-pet-before']==='1'&&['pet-codex/app.mjs','pet-codex/index.html','js/pet-equipment-window-v1.mjs'].includes(name);
 const data=await bytes(name,before);res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
 }catch(error){console.error(String(error.message).slice(0,160));res.writeHead(404);res.end('Not found');}}).listen(18876,'127.0.0.1',()=>console.log('Pet live API QA http://127.0.0.1:18876/pet-codex/ (isolated local database)'));
