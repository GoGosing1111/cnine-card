import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mercenaryFixture} from '../tests/helpers/mercenary-db.mjs';
import {ensureForgeTransactionSchema} from '../functions/_equipment_forge_transactions.js';
import {mercenaryCardAcquisitionStatements} from '../functions/_mercenary_draw_accounting.js';
import {saveMercenaryLoadout} from '../functions/_mercenary_account.js';
import {saveMercenaryEquipment} from '../functions/_mercenary_equipment.js';
import {handleMercenaryAccount} from '../functions/_mercenary_account_routes.js';
import {REGION_EQUIPMENT} from '../shared/legion-regions-v1.mjs';

// Isolated in-memory account only. Never connects to production.
const root=fileURLToPath(new URL('..',import.meta.url)),port=Number(process.env.MERCENARY_EQUIPMENT_QA_PORT||8911),origin=`http://127.0.0.1:${port}`;
const f=await mercenaryFixture();await ensureForgeTransactionSchema(f.env);
for(const [i,item] of REGION_EQUIPMENT.entries()){
  const pve=Math.floor(item.totalPower*.9);
  await f.p('INSERT INTO character_equipment_items(id,code,name,slot,rarity,image_url,total_power,pve_power,pvp_power) VALUES(?,?,?,?,?,?,?,?,?)',100+i,item.code,item.name,item.slot,item.rarity,item.image,item.totalPower,pve,item.totalPower-pve).run();
  await f.p("INSERT INTO user_equipment_instances(id,user_id,equipment_id,source_type,request_id) VALUES(?,7,?,'ISOLATED_QA',?)",1000+i,100+i,crypto.randomUUID()).run();
}
await f.p('INSERT INTO equipment_forge_states_v1 VALUES(1000,7,5,1)').run();
for(const code of ['V-004','V-001'])await f.env.DB.batch(mercenaryCardAcquisitionStatements(f.env.DB,{userId:7,mercenaryCode:code,acquisitionId:crypto.randomUUID()}));
for(const mode of ['PVE','PVP'])await saveMercenaryLoadout(f.env,f.user,{requestId:crypto.randomUUID(),mode,mercenaryCode:mode==='PVE'?'V-004':'V-001',revision:0});
for(const [i,slot] of ['WEAPON','TOP','BOTTOM','SHOES','ACCESSORY'].entries())await saveMercenaryEquipment(f.env,f.user,{requestId:crypto.randomUUID(),mode:'PVE',slot,instanceId:String(1000+i),revision:i});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')){
      const body=[];for await(const chunk of req)body.push(chunk);
      const request=new Request(url,{method:req.method,headers:{...req.headers,origin},...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(body)}:{})});
      const response=await handleMercenaryAccount({path:url.pathname.slice(5),env:f.env,deps:f.deps,request});
      if(!response){res.writeHead(404);res.end();return;}
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403);res.end();return;}
    if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(await fs.readFile(file));
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log('ISOLATED EQUIPMENT REVIEW '+origin+'/mercenary-codex/equipment/'));
process.on('SIGINT',()=>server.close(async()=>{await f.close();process.exit(0);}));
