import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mercenaryCodexDocument} from '../../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../../functions/_mercenary_cms_seed.js';

export async function startCodexUiServer(){
 const root=path.resolve(fileURLToPath(new URL('../..',import.meta.url)));
 const catalog=process.env.CODEX_UI_PUBLIC_CATALOG?JSON.parse(fs.readFileSync(process.env.CODEX_UI_PUBLIC_CATALOG,'utf8')):mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1});
 const cards=catalog.cards.filter(c=>['V-001','V-013','V-021','V-960'].includes(c.code)).map(c=>({...c,canDeploy:true,level:7,duplicates:1}));
 const loadout={mercenaryCode:'V-001',mercenaryCodes:['V-001','V-013'],revision:1};
 const fixture={catalog,account:{available:true,accountId:7,cards,loadout,loadouts:{PVE:{...loadout},PVP:{...loadout}}},accountMode:'normal',publicError:false,writes:[],errors:[],assetFallbacks:[]};
 const receipts=new Map(),assets=new Map();
 const json=(res,value,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
 const server=http.createServer(async(req,res)=>{try{
  const key=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(key==='/api/mercenary-codex')return fixture.publicError?json(res,{error:'검수용 도감 조회 실패'},503):json(res,catalog);
  if(key==='/api/mercenaries/v3/state'){
   if(fixture.accountMode==='error')return json(res,{error:'검수용 계정 연결 실패'},503);
   if(fixture.accountMode==='empty')return json(res,{...fixture.account,cards:[],loadouts:{PVE:{mercenaryCode:null,mercenaryCodes:[],revision:1},PVP:{mercenaryCode:null,mercenaryCodes:[],revision:1}}});
   return json(res,fixture.account);
  }
  if(key==='/api/mercenaries/v3/loadout'&&req.method==='POST'){
   let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);fixture.writes.push(body);
   if(receipts.has(body.requestId))return json(res,{replayed:true});
   if(!['PVE','PVP'].includes(body.mode)||body.revision!==fixture.account.loadouts[body.mode].revision)return json(res,{error:'Fixture revision conflict',code:'MERCENARY_LOADOUT_CONFLICT'},409);
   const codes=body.mercenaryCodes||[body.mercenaryCode].filter(Boolean);
   if(codes.length>2||new Set(codes).size!==codes.length||codes.some(code=>!cards.some(c=>c.code===code)))return json(res,{error:'Invalid fixture selection'},400);
   fixture.account.loadouts[body.mode]={mercenaryCode:codes[0]||null,mercenaryCodes:codes,revision:body.revision+1};
   receipts.set(body.requestId,true);return json(res,{ok:true});
  }
  if(key.startsWith('/api/sync/'))return json(res,{error:'Isolated UI fixture; no live sync'},403);
  if(!['GET','HEAD'].includes(req.method))return json(res,{error:'Unsupported fixture write'},405);
  if(key.startsWith('/api/'))return json(res,{visible:false,enabled:false,items:[]});
  let file=path.resolve(root,'.'+key);if(!file.startsWith(root+path.sep))return json(res,{error:'Outside fixture root'},403);
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  let bytes;
  if(fs.existsSync(file))bytes=fs.readFileSync(file);
  else if(key.startsWith('/assets/')){
   const relative=path.relative(root,file).split(path.sep).join('/');
   if(!assets.has(relative)){
    try{assets.set(relative,execFileSync('git',['cat-file','blob','HEAD:'+relative],{cwd:root,maxBuffer:25e6,stdio:['ignore','pipe','ignore']}));fixture.assetFallbacks.push(relative);}catch{assets.set(relative,null);}
   }
   bytes=assets.get(relative);
  }
  if(!bytes){fixture.errors.push({path:key,status:404});res.writeHead(404);return res.end('Missing fixture file');}
  const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'content-type':mime,'cache-control':'no-store'});res.end(bytes);
 }catch(error){fixture.errors.push({path:req.url,error:error.message});json(res,{error:error.message},500);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {...fixture,fixture,origin:'http://127.0.0.1:'+server.address().port,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
