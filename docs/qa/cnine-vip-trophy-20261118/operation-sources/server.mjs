import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';
import {source,read} from './common.mjs';
const {htmlForStore}=await import('../coop-pc-performance-20261108/source/functions/_onestore_web.js');
const BASE=read('service-before').head;
const reader=spawn('git',['cat-file','--batch'],{cwd:source,windowsHide:true,stdio:['pipe','pipe','ignore']}),queue=[];let buffer=Buffer.alloc(0);
reader.stdout.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);while(queue.length){const end=buffer.indexOf(10);if(end<0)return;const header=buffer.subarray(0,end).toString();if(header.endsWith(' missing')){buffer=buffer.subarray(end+1);queue.shift().resolve(null);continue;}const size=Number(header.split(' ').at(-1)),last=end+1+size;if(buffer.length<last+1)return;const data=Buffer.from(buffer.subarray(end+1,last));buffer=buffer.subarray(last+1);queue.shift().resolve(data);}});
const assets=new Map(),blob=file=>new Promise(resolve=>{queue.push({resolve});reader.stdin.write(BASE+':'+file+'\n');});
const bytes=async(file,before)=>{const key=(before?'before:':'after:')+file;if(!assets.has(key))assets.set(key,(async()=>{if(before)return blob(file);try{return await fs.readFile(path.join(source,file));}catch{return blob(file);}})());return assets.get(key);};
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
const user={id:1,serverUserId:1,nickname:'트로피검수',pigCoin:0,role:'OWNER',owned:[],quantities:{},breakthroughs:{},history:[],coin:0,cardShards:0,masterStars:0,attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true};
for(const before of [true,false]){
 const port=before?19972:19973;let progress=4;
 const profile=()=>{const p=structuredClone(read(before?'service-before':'service-after').profiles[0].profile);p.player={...p.player,id:1,nickname:user.nickname,avatar:null,title:null,clan:null};for(const t of p.trophies){if(t.code==='CNINE_VIP')Object.assign(t,{count:progress===4?1:0,officialCount:progress===4?1:0,owned:progress===4,progress,goal:4,acquiredAt:null});}return p;};
 http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1:'+port),chunks=[];for await(const p of req)chunks.push(p);
  const send=(body,type='application/json',status=200)=>{res.writeHead(status,{'content-type':type,'cache-control':'no-cache'});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
  const pathname=url.pathname.replace(/^\/onestore(?=\/)/,''),api=pathname.startsWith('/api/')?pathname.slice(5):null;
  if(pathname==='/__qa/clear'){assets.clear();progress=4;return send({ok:true});}
  if(pathname==='/__qa/user')return send({user});
  if(pathname==='/__qa/progress'){progress=Number(url.searchParams.get('n'));return send({progress});}
  if(pathname==='/__qa/host')return send('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{border:0;margin:0;width:100%;height:100%}</style><iframe src="/onestore/?screen=home" title="H5 game"></iframe>','text/html');
  if(api){
   if(api==='player-card')return send(profile());
   const lookup={me:{user},'me/summary':{user,prison:{incarcerated:false}},'service/status':{maintenance:{active:false}},cards:{cards:[]},packs:{packs:[]},messages:{messages:[],unread:0},'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false,shopEnabled:false}},'sync/ticket':{error:'isolated QA'},'chief/status':{chief:{active:false}},'character/loadout':{instances:[],loadout:{},titles:[],vehicles:[],bonuses:{},avatarFeature:{visible:false,shopEnabled:false}}};
   return send(lookup[api]||{ok:true,items:[],cards:[],enabled:false,visible:false,user,stats:{},serverNow:new Date().toISOString()},'application/json',api==='sync/ticket'?423:200);
  }
  let file=decodeURIComponent(pathname).replace(/^\//,'');if(!file||file.endsWith('/'))file+='index.html';if(file.includes('..'))return send('Not found','text/plain',404);
  let data=await bytes(file,before);if(!data)return send('Not found','text/plain',404);if(url.pathname.startsWith('/onestore/')&&file.endsWith('.html'))data=htmlForStore(data.toString(),'/'+file.replace(/index.html$/,''));return send(data,types[path.extname(file)]||'application/octet-stream');
 }catch(e){console.error(req.url,e.message);res.writeHead(500).end(e.message);}}).listen(port,'127.0.0.1',()=>console.log(JSON.stringify({port,before,isolated:true})));
}
