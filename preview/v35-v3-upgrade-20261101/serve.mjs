import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),repo=path.resolve(dir,'../..'),live=path.join(repo,'output/revan-live-20261027/release-checkout');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.atlas':'text/plain','.spine':'application/octet-stream','.webm':'video/webm','.md':'text/plain; charset=utf-8'};
const served=new Map();
mime['.mp4']='video/mp4';
const run=promisify(execFile);
const fixture=JSON.parse(await fs.readFile(path.join(live,'tests/fixtures/v3-completion-payload-20260928.json'),'utf8'));
const cases={sword:[['V-996','발테르'],['V-979','족로']],mixed:[['V-996','발테르']],cardgu:[['V-970','카드구'],['V-001','일반 용병']],enemy:[['V-996','발테르']]};
http.createServer(async(req,res)=>{try{if(req.method!=='GET')return res.writeHead(405).end();const url=new URL(req.url,'http://127.0.0.1:18766');let p=decodeURIComponent(url.pathname);
if(p==='/fixture.json'){const data=structuredClone(fixture),kind=url.searchParams.get('case')||'sword';data.battleV2.result={timeline:[],winner:null};data.battleV2.teams.A.supports=[];data.battleV2.teams.B.supports=[];data.v3RenderContext={accountBattleUnitPve:false};data.battleV2.teams.A.mercenaries=(cases[kind]||cases.sword).map(([code,name],i)=>({id:'QA:A:'+code,cardId:code,code,name,title:name,hp:100000,maxHp:100000,shield:0,maxShield:0,role:'WARRIOR',slot:i}));data.battleV2.teams.B.mercenaries=[];res.writeHead(200,{'content-type':mime['.json']});return res.end(JSON.stringify(data));}
if(p==='/served.json'){res.writeHead(200,{'content-type':mime['.json']});return res.end(JSON.stringify([...served.values()]));}
if(p==='/')p='/preview/v35-v3-upgrade-20261101/index.html';
const root=p.startsWith('/preview/v35-')||p.startsWith('/preview/spine-professional-verification-')?repo:live;
let file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep)||!mime[path.extname(file)])return res.writeHead(404).end();
try{await fs.access(file);}catch{file=path.resolve(repo,'.'+p);if(!file.startsWith(repo+path.sep))return res.writeHead(404).end();try{await fs.access(file);}catch{
 const {stdout}=await run('git',['show','origin/main:'+p.slice(1)],{cwd:repo,windowsHide:true,encoding:'buffer',maxBuffer:64e6});served.set(p,{url:p,path:'git:origin/main:'+p.slice(1),sha256:createHash('sha256').update(stdout).digest('hex')});res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-store'});return res.end(stdout);
}}
const info=await fs.stat(file);if(info.isDirectory())return res.writeHead(404).end();served.set(p,{url:p,path:file});
const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
if(range){const start=Number(range[1]),end=Math.min(info.size-1,range[2]?Number(range[2]):info.size-1);if(start>end||start>=info.size)return res.writeHead(416,{'content-range':'bytes */'+info.size}).end();res.writeHead(206,{'content-type':mime[path.extname(file)],'content-range':`bytes ${start}-${end}/${info.size}`,'content-length':end-start+1,'accept-ranges':'bytes'});createReadStream(file,{start,end}).pipe(res);}else{res.writeHead(200,{'content-type':mime[path.extname(file)],'content-length':info.size,'accept-ranges':'bytes','cache-control':'no-store'});createReadStream(file).pipe(res);}
}catch{res.writeHead(404).end();}}).listen(18766,'127.0.0.1',()=>console.log('http://127.0.0.1:18766/ — local fixture, current V3 resources'));
