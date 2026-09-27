// Loopback-only visual QA. Real handler + PostgreSQL fixture; never production data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {iconCmsFixture} from '../tests/helpers/icon-cms-fixture.mjs';
const root=fs.realpathSync(process.cwd()),port=Number(process.env.ICON_REVIEW_PORT||4337),host=`127.0.0.1:${port}`,fixture=await iconCmsFixture();
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg'};
let loseAck=false;
const send=(res,status,body,type='text/html')=>{res.writeHead(status,{'content-type':type+'; charset=utf-8','cache-control':'no-store'});res.end(body);};
http.createServer(async(req,res)=>{try{
  if(req.headers.host!==host)return send(res,403,'Loopback only');const url=new URL(req.url,'http://'+host);
  if(url.pathname==='/review/icons'){
    const role=url.searchParams.get('role')==='USER'?'USER':'OWNER';loseAck=url.searchParams.has('loseAck');
    let html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('<body class="auth-guest">','<body class="auth-active">').replace('<section id="cms" hidden>','<section id="cms">').replace('<span id="roleBadge"></span>','<span id="roleBadge">'+role+'</span>');
    html=html.replace('<head>','<head><base href="/admin/">').replace('</body>','<script type="module" src="/admin/icon-admin-v1.mjs"></script></body>');
    return send(res,200,html);
  }
  if(url.pathname==='/api/admin/icons'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>40000)return send(res,413,'Too large');}
    const response=await fixture.handle(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}));
    if(loseAck&&req.method==='PATCH'&&response.status===200){loseAck=false;return send(res,503,JSON.stringify({error:'검수: 저장 완료 후 응답 유실'}),'application/json');}
    return send(res,response.status,await response.text(),'application/json');
  }
  if(!['GET','HEAD'].includes(req.method))return send(res,405,'Method not allowed');
  const rel=decodeURIComponent(url.pathname).replace(/^\/+/,''),parts=rel.split(/[\\/]/);
  if(!['preview','admin','js','shared','css','assets','pve-v3'].includes(parts[0])||parts.some(p=>p.startsWith('.')))return send(res,404,'Not found');
  let file=path.resolve(root,rel);if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)||!mime[path.extname(file)])return send(res,404,'Not found');
  res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}catch(error){send(res,500,JSON.stringify({error:error.message}),'application/json');}}).listen(port,'127.0.0.1',()=>console.log(`ICON CMS QA: http://${host}/review/icons`));
