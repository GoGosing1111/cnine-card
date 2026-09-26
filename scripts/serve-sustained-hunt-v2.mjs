import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createHuntSession,DIFFICULTIES,PARTIES} from '../preview/sustained-hunt-v2/session.mjs';
const root=fs.realpathSync(process.cwd()),port=Number(process.env.HUNT_PREVIEW_PORT||8958),csrf=randomBytes(24).toString('hex');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const catalog=['fur/manifest-v2.json','zenith/manifest-v1.json','superstar/manifest-v1.json'].flatMap(file=>{const m=read('assets/ui/project-v/characters/'+file);return m.characters.map(c=>({...c,grade:m.rarity}));});
const equipment=read('assets/ui/project-v/account-battle-suits/manifest-v2.json'),sessions=new Map();
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.svg':'image/svg+xml'};
const respond=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
  try{
    const hosts=['127.0.0.1:'+port,'localhost:'+port];
    if(!hosts.includes(req.headers.host))return respond(res,{error:'Local review only'},403);
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    if(url.pathname.startsWith('/__hunt/')){
      if(url.pathname==='/__hunt/bootstrap'&&req.method==='GET')return respond(res,{csrf,previewOnly:true,difficulties:DIFFICULTIES,parties:PARTIES});
      if(req.method!=='POST')return respond(res,{error:'Method not allowed'},405);
      if(req.headers['x-preview-token']!==csrf||req.headers.origin&&!hosts.map(h=>'http://'+h).includes(req.headers.origin))return respond(res,{error:'Preview token required'},403);
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4000)return respond(res,{error:'Too large'},413);}
      const body=JSON.parse(raw||'{}'),action=url.pathname.slice('/__hunt/'.length);
      if(action==='start'){
        if(sessions.size>=12){const key=sessions.keys().next().value;sessions.get(key).cancel();sessions.delete(key);}
        const s=createHuntSession({catalog,equipment,difficulty:body.difficulty,party:body.party});sessions.set(s.id,s);return respond(res,{id:s.id,payload:s.payload});
      }
      const s=sessions.get(body.id);if(!s)throw Error('원정이 만료됐습니다. 다시 출전해 주세요.');
      if(action==='begin')return respond(res,s.begin());
      if(action==='reveal')return respond(res,s.reveal(body.seq));
      if(action==='claim')return respond(res,s.claim(body));
      if(action==='finish')return respond(res,s.finish(body.seq));
      if(action==='cancel'){s.cancel();sessions.delete(s.id);return respond(res,{cancelled:true});}
      return respond(res,{error:'Not found'},404);
    }
    if(!['GET','HEAD'].includes(req.method))return respond(res,{error:'Method not allowed'},405);
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/,''),parts=relative.split(/[\\/]/);
    if(!relative){res.writeHead(302,{location:'/preview/sustained-hunt-v2/'});res.end();return;}
    let file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)||parts.some(s=>s==='..'||s.startsWith('.'))||!['preview','assets','css','js'].includes(parts[0]))return respond(res,{error:'Not found'},404);
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    if(!fs.existsSync(file)||!fs.realpathSync(file).startsWith(root+path.sep)||!mime[path.extname(file)])return respond(res,{error:'Not found'},404);
    res.writeHead(200,{'content-type':mime[path.extname(file)],'cache-control':'no-cache','x-content-type-options':'nosniff'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch(e){respond(res,{error:e.message},409);}
});
server.listen(port,'127.0.0.1',()=>console.log('Hunt V2: http://127.0.0.1:'+port+'/preview/sustained-hunt-v2/'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
