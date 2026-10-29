import {createHuntSession} from '../preview/sustained-hunt-v2/session.mjs';

import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';

import {mercenaryCodexDocument} from '../functions/_mercenary_codex.js';
import {MERCENARY_CMS_SEED} from '../functions/_mercenary_cms_seed.js';
import {limitedDeploymentSnapshot} from '../shared/mercenary-limited-deployment-v1.mjs';
import {createPvpBattleV2} from '../functions/_battle_v2_preview.js';
import fixture from './fixtures/mercenary-valter-roster-20261008.json' with {type:'json'};
const root=process.cwd(),out=process.env.QA_OUT||path.join(root,'docs/qa/heukmu-live-20261029'),reproduce=process.env.QA_REPRODUCE==='1',publicBase=process.env.QA_PUBLIC_BASE||'';fs.mkdirSync(out,{recursive:true});
const ids=['CN-02D9DC1E8A8A4209','CN-0505936A0CBB4E59','CN-25F931CE393D474E','CN-23EB4B19986D4818','CN-519C181C18DF4B8E'];
const art=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(p=>{const m=JSON.parse(fs.readFileSync(path.join(root,'assets/ui/project-v/characters',p)));return m.characters.map(c=>({...c,grade:m.rarity}));});
const deck=ids.map((id,i)=>{const c=art.find(c=>c.cardId===id);return {...c,id,cardId:id,name:c.member,title:c.title,image:'/'+c.sourceArt,sourceArt:'/'+c.sourceArt,originalCardArt:'/'+c.sourceArt,rarity:c.grade,power:2e7,power_type:['ATTACK','DEFENSE','SPEED','HP','ATTACK'][i],hp:100,maxHp:100};});
const payload=(code,field)=>{const mercenary={...limitedDeploymentSnapshot(code),combat:fixture.combat};if(field==='HUNT')return createHuntSession({snapshot:{cards:deck,mercenary,accountNickname:'흑무 검수'},seed:7919,limitMs:15000}).payload;return {battleV2:createPvpBattleV2({attackerCards:deck,defenderCards:deck,attackerMercenary:mercenary,defenderMercenary:mercenary,seed:77})};};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.avif':'image/avif','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp3':'audio/mpeg','.mp4':'video/mp4','.ogg':'audio/ogg'};
const missing=[],publicFiles=new Map();const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname==='/__qa/data'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({deck,data:payload('V-968',url.searchParams.get('field')||'PVP')}));}
 if(url.pathname==='/__qa/client.js'){res.writeHead(200,{'content-type':'text/javascript'});return res.end(fs.readFileSync('C:/Users/User/Downloads/upload/cnine-card/output/revan-live-20261027/release-checkout/docs/qa/heukmu-live-20261029/qa-client.js'));}
 if(url.pathname==='/api/mercenary-codex'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(mercenaryCodexDocument({payload_json:JSON.stringify(MERCENARY_CMS_SEED.document),revision:1})));}
 if(url.pathname.startsWith('/api/')){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({maintenance:{active:false},enabled:false,visible:false,cards:[],packs:[],items:[],operations:[],pollSeconds:60}));}
 if(publicBase){const key=url.pathname+url.search;if(!publicFiles.has(key))publicFiles.set(key,(async()=>{const r=await fetch(publicBase+key);return {status:r.status,type:r.headers.get('content-type'),body:Buffer.from(await r.arrayBuffer())};})());const r=await publicFiles.get(key);res.writeHead(r.status,{'content-type':r.type||'application/octet-stream'});return res.end(url.pathname==='/'?r.body.toString().replace('</body>','<script src="/__qa/client.js"></script></body>'):r.body);}
 let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(file!==root&&!file.startsWith(root+path.sep))return res.writeHead(403).end();if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
 if(!fs.existsSync(file)){try{const rel=path.relative(root,file).replaceAll('\\','/');const bytes=execFileSync('git',['show','HEAD:'+rel],{cwd:root,windowsHide:true,maxBuffer:64e6,stdio:['ignore','pipe','ignore']});res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});return res.end(bytes);}catch{}}
 if(!fs.existsSync(file)){if(url.pathname!=='/favicon.ico')missing.push(url.pathname);return res.writeHead(404).end();}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});if(url.pathname==='/')return res.end(fs.readFileSync(file,'utf8').replace('</body>','<script src="/__qa/client.js"></script></body>'));fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(500);res.end(e.message);}});

await new Promise(r=>server.listen(0,'127.0.0.1',r));console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port+'/?qa=heukmu',isolatedApis:true,publicBase}));
