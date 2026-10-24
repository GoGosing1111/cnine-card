import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {clanRestorationFixture} from '../../../tests/helpers/clan-restoration-fixture.mjs';
import {organizationFactionFixture} from '../../../tests/helpers/organization-faction-fixture.mjs';
import {handleOrganization} from '../../../functions/_organization.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const fallback='C:/Users/User/Downloads/cnine-z-body-sword-20260918/site';
const out='C:/Users/User/Downloads/upload/cnine-card/output/clan-restore-lock-20261025';
const port=43825,origin='http://127.0.0.1:'+port,clan=clanRestorationFixture();
const faction=await organizationFactionFixture(null,{live:true});faction.advance(Date.parse('2026-10-25T12:00:00+09:00')-faction.clock());
await faction.pg.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
const scripts=['organization-preparation-v1.js','clan-v1.js'];
const styles=['style.css','clan-v1.css','clan-war-reform-v1.css','clan-command-v1.css','clan-champions-v2071.css','organization-preparation-v1.css','command-ui-v1.css'];
const shell=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(f=>'<link rel="stylesheet" href="/css/'+f+'">').join('')}<body><main id="review"></main>${scripts.map(f=>'<script src="/js/'+f+'"></script>').join('')}<script>localStorage.setItem('cnine_card_api_token','isolated-fixture');document.querySelector('#review').innerHTML=ClanV1.view();ClanV1.state.tab=new URL(location.href).searchParams.get('tab')||'war';ClanV1.bind({apiRequest:async(path,opts={})=>{const r=await fetch('/api/'+path,opts);const d=await r.json();if(!r.ok)throw Error(d.error);return d},clearApiCache(){},renderShell(){}});</script></body></html>`;
const cms=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/organization-admin-v1.css"><link rel="stylesheet" href="/css/organization-command-20261021.css"><link rel="stylesheet" href="/css/organization-rankings-v1.css"><body><main id="review" class="orgcms"></main><script type="module">import {mountOrganizationCms} from '/admin/organization-admin-v1.mjs';mountOrganizationCms(document.querySelector('#review'),{request:async(path,opts={})=>{const r=await fetch('/api/'+path,{...opts,headers:{'x-qa-user':'1',...opts.headers}});const d=await r.json();if(!r.ok)throw Error(d.error);return d}});</script></body></html>`;
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.avif':'image/avif'};
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!=='127.0.0.1:'+port){res.writeHead(403);res.end();return;}
  const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/review/'||url.pathname==='/review/cms'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(url.pathname.endsWith('cms')?cms:shell);return;}
  if(url.pathname.startsWith('/api/')){
   if(req.method!=='GET'){res.writeHead(405);res.end('{}');return;}
   const route=url.pathname.slice(5),user=Number(req.headers['x-qa-user']||2);let result;
   if(route.startsWith('clan/')||route.startsWith('admin/clan-war/'))result=await clan.call(route,{user});
   else if(route.includes('organization/faction'))result=await faction.call(route+'?roundId='+faction.roundId,{user});
   else{
    const request=new Request(origin+'/api/'+route+'?roundId='+faction.roundId,{headers:{'x-qa-user':String(user),'x-user':String(user)}});
    const r=await handleOrganization({path:route,request,env:faction.env,deps:{...faction.deps,onError:console.error}});result={status:r.status,data:await r.json()};
   }
   res.writeHead(result.status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(result.data));return;
  }
  let relative=decodeURIComponent(url.pathname).replace(/^\//,'');if(relative.endsWith('/'))relative+='index.html';
  if(!/^(assets|css|js|shared|organization|admin)\//.test(relative)||relative.split('/').includes('..')){res.writeHead(404);res.end();return;}
  let file=path.join(root,relative);if(!fs.existsSync(file))file=path.join(fallback,relative);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');fs.createReadStream(file).pipe(res);
 }catch(e){console.error(e.message);res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
});
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'fixture-overview.json'),JSON.stringify((await clan.call('clan/overview')).data,null,2));
server.listen(port,'127.0.0.1',()=>console.log(origin));
