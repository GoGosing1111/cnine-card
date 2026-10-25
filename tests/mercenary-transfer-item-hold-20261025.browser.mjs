import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {transferFixture} from './helpers/mercenary-experience-transfer-db.mjs';
import {handleMercenaryLevel} from '../functions/_mercenary_level.js';
import {readExperienceTransfer} from '../functions/_mercenary_experience_transfer.js';
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/xp-transfer-item-rollback-20261025'),publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.woff2':'font/woff2'};let fixture;const missing=[],requests=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){
  requests.push({method:req.method,path:url.pathname});if(url.pathname==='/api/sync/ticket'){res.writeHead(423,{'content-type':'application/json'});return res.end(JSON.stringify({error:'Isolated fixture has no live sync transport'}));}
  if(url.pathname.startsWith('/api/mercenaries/v3/leveling/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})});
   const r=await handleMercenaryLevel({path:url.pathname.slice(5),request,env:fixture.env,deps:fixture.deps});res.writeHead(r.status,{'content-type':'application/json'});return res.end(await r.text());
  }
  res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({revision:'0',enabled:false,visible:false,maintenance:{active:false}}));
 }
 if(publicBase){const r=await fetch(publicBase+url.pathname+url.search);res.writeHead(r.status,{'content-type':r.headers.get('content-type')||'application/octet-stream'});return res.end(Buffer.from(await r.arrayBuffer()));}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){file=path.resolve('C:/Users/User/Downloads/cnine-z-body-sword-20260918/site','.'+decodeURIComponent(url.pathname));if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio']}),reports=[];
try{for(const width of publicBase?[390]:[1440,390]){
 fixture=await transferFixture();await fixture.setState('V-049',{level:16,experience:101,breakthroughMask:7,revision:10});const page=await browser.newPage({viewport:{width,height:width<600?844:1000},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('cnine_card_api_token','local-account-7');localStorage.setItem('cnine_player_client_id_v1552','fixture-client-20261025');localStorage.setItem('cnine_battle_sound','OFF');});
 await page.goto(origin+'/mercenary-codex/leveling/transfer.html',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'경험치 이전 일시 중단'}).waitFor({timeout:10000}).catch(async e=>{console.log(await page.locator('body').innerText());console.log(JSON.stringify({errors,requests}));throw e;});
 assert.equal(await page.locator('#extract,#infuse').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'hold-'+width+'.png'),fullPage:true});reports.push({width,transferDisabled:true,mutationButtons:0,overflow:false});await page.close();await fixture.close();fixture=null;
 }assert.deepEqual([...new Set(missing)],[]);fs.writeFileSync(path.join(out,'hold-browser.json'),JSON.stringify({status:'PASSED',reports,productionWrites:0},null,2));console.log(JSON.stringify(reports));
}finally{if(fixture)await fixture.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
