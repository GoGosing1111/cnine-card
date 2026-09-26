import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {legionFixture} from '../tests/helpers/legion-hunt-fixture.mjs';
import {handleLegionHunt} from '../functions/_legion_hunt.js';
const root=fs.realpathSync(process.cwd()),port=Number(process.env.LEGION_REVIEW_PORT||8959),fixture=await legionFixture({withMercenary:true});
fixture.deps.now=Date.now;
fixture.deps.authenticate=async request=>request.headers.get('cookie')?.includes('hunt_review_role=USER')?fixture.player:fixture.owner;
fixture.deps.json=(body,status=200)=>Response.json(body,{status});
const shell={window:{},battleState:{},battleView(){},renderBattleBuilder(){},switchPveMode(){},renderPveMonsterBrowser:null,renderBattleSnapshot:null,summaryBar:()=>''};
vm.createContext(shell);vm.runInContext(fs.readFileSync('js/pve-command-v2-live.js','utf8'),shell);
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.svg':'image/svg+xml'};
const send=(res,body,status=200,headers={})=>{res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store',...headers});res.end(body);};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.headers.host!=='127.0.0.1:'+port)return send(res,'Local review only',403);
    const url=new URL(req.url,'http://'+req.headers.host);
    if(url.pathname.startsWith('/api/')){
      let body='';for await(const chunk of req){body+=chunk;if(body.length>131072)return send(res,'Too large',413);}
      const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{} )});
      const response=await handleLegionHunt({path:url.pathname.slice(5),request,env:fixture.env,deps:fixture.deps});
      if(!response)return send(res,'Unknown API',404);return send(res,await response.text(),response.status,{'content-type':'application/json'});
    }
    if(url.pathname.startsWith('/review/')){
      const role=url.searchParams.get('role')==='USER'?'USER':'OWNER',cms=url.pathname==='/review/cms';
      const banner='<div style="padding:12px;color:#b9d7c7;background:#162724;font-size:13px">로컬 검수 · 실제 운영 API 핸들러 / 테스트 DB · <a href="/review/pve?role=OWNER">OWNER PVE</a> · <a href="/review/pve?role=USER">USER PVE</a> · <a href="/review/cms?role=OWNER">OWNER CMS</a></div>';
      const content=cms?'<link rel="stylesheet" href="/admin/admin-v945.css"><link rel="stylesheet" href="/admin/legion-hunt-admin-v1.css"><div class="layout"><aside><div class="logo">SOOP <b>GM</b></div><nav id="nav"></nav></aside><main><header><h1 id="pageTitle">CMS 검수</h1><b id="roleBadge">'+role+'</b></header><div id="cms"></div></main></div><script type="module" src="/admin/legion-hunt-admin-v1.mjs"></script>':
        '<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/pve-command-v2.css"><link rel="stylesheet" href="/css/legion-hunt-entry-v1.css">'+shell.battleView({role})+'<script type="module" src="/js/legion-hunt-entry-v1.mjs"></script>';
      return send(res,'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>군단토벌 OWNER/CMS 검수</title></head><body>'+banner+content+'</body></html>',200,{'set-cookie':'hunt_review_role='+role+'; HttpOnly; SameSite=Strict; Path=/'});
    }
    if(!['GET','HEAD'].includes(req.method))return send(res,'Method not allowed',405);
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/,''),parts=relative.split(/[\\/]/);
    if(!['pve','preview','assets','css','js','admin'].includes(parts[0])||parts.some(s=>s==='..'||s.startsWith('.')))return send(res,'Not found',404);
    let file=path.resolve(root,relative);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)||!mime[path.extname(file)])return send(res,'Not found',404);
    res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch(e){send(res,JSON.stringify({error:e.message}),500,{'content-type':'application/json'});}
});
server.listen(port,'127.0.0.1',()=>console.log('OWNER/CMS review: http://127.0.0.1:'+port+'/review/cms'));
process.on('SIGINT',()=>server.close(async()=>{await fixture.close();process.exit(0);}));
