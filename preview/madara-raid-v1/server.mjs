import http from 'node:http';
import path from 'node:path';
import {readFile,stat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {MADARA_RELEASE,createMadaraRoom,addMadaraMember,readyMadaraMember,startMadaraRoom,actMadaraRoom,leaveMadaraRoom,tickMadaraRoom,madaraView,madaraBattlePayload} from '../../functions/_raid_madara.js';
import {madaraReviewDeck,MADARA_REVIEW_BOSS} from './fixture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
export function createMadaraPreviewServer({clock=Date.now}={}) {
  const rooms=new Map(),sessions=new Map();
  const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'});res.end(JSON.stringify(data));};
  const bodyOf=async req=>{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413});}try{return JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('JSON 요청을 확인하세요.'),{status:400});}};
  const prune=()=>{const now=clock();for(const [id,room]of rooms){if(now-room.createdAt>=1800000){rooms.delete(id);for(const [token,s]of sessions)if(s.roomId===id)sessions.delete(token);}else tickMadaraRoom(room,now);}};
  const server=http.createServer(async(req,res)=>{
    try{
      const port=server.address()?.port,hosts=[`127.0.0.1:${port}`,`localhost:${port}`];
      if(!hosts.includes(req.headers.host))return send(res,403,{error:'로컬 개발 서버에서만 접근할 수 있습니다.'});
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(url.pathname.startsWith('/__madara/')){
        if(req.method==='POST'&&(req.headers.origin!==`http://${req.headers.host}`||!String(req.headers['content-type']).startsWith('application/json')))return send(res,403,{error:'동일한 로컬 화면에서 JSON으로 요청하세요.'});
        if(req.method==='GET'&&url.pathname==='/__madara/health')return send(res,200,{ok:true,...MADARA_RELEASE});
        if(!['POST','GET'].includes(req.method))return send(res,405,{error:'지원하지 않는 요청입니다.'});
        const body=req.method==='POST'?await bodyOf(req):{};
        prune();
        if(req.method==='POST'&&['/__madara/create','/__madara/join'].includes(url.pathname)){
          if(sessions.size>=480)return send(res,429,{error:'로컬 검수 세션 한도입니다.'});
          const id=randomUUID(),token=randomBytes(32).toString('hex');let room;
          if(url.pathname.endsWith('/create')){
            if(rooms.size>=80)return send(res,429,{error:'로컬 공대 한도입니다.'});
            const code=randomBytes(5).toString('hex').toUpperCase();
            room=createMadaraRoom({id:code,hostId:id,monster:MADARA_REVIEW_BOSS,mode:body.mode||'COMMAND',now:clock(),seed:randomBytes(4).readUInt32BE()});
            addMadaraMember(room,{id,name:body.name,role:body.role||'WARDEN',deck:madaraReviewDeck(body.strength)});
            if(room.mode==='COMMAND')for(const role of ['WARDEN','ASSAULT','RESCUE'].filter(r=>r!==room.members[0].role))addMadaraMember(room,{id:randomUUID(),name:role==='WARDEN'?'봉인 담당':role==='ASSAULT'?'정벌 담당':'구출 담당',role,deck:madaraReviewDeck(body.strength)});
            rooms.set(code,room);
          }else{
            room=rooms.get(String(body.code||'').trim().toUpperCase());
            if(!room||room.mode!=='PARTY')return send(res,404,{error:'참가할 공대를 찾지 못했습니다.'});
            addMadaraMember(room,{id,name:body.name,role:body.role,deck:madaraReviewDeck()},clock());
          }
          sessions.set(token,{roomId:room.id,memberId:id});return send(res,200,{token,state:madaraView(room,id)});
        }
        const token=String(req.headers.authorization||'').replace(/^Bearer /,''),session=sessions.get(token);
        if(!session)return send(res,401,{error:'로컬 검수 세션이 만료되었습니다.'});
        const room=rooms.get(session.roomId);if(!room)return send(res,404,{error:'공대가 만료되었습니다.'});
        const now=clock();tickMadaraRoom(room,now);
        if(req.method==='POST'){
          if(url.pathname==='/__madara/ready')readyMadaraMember(room,session.memberId,body.ready!==false);
          else if(url.pathname==='/__madara/start')startMadaraRoom(room,session.memberId,now);
          else if(url.pathname==='/__madara/action')actMadaraRoom(room,session.memberId,body,now);
          else if(url.pathname==='/__madara/leave'){leaveMadaraRoom(room,session.memberId,now);sessions.delete(token);return send(res,200,{ok:true});}
          else return send(res,404,{error:'지원하지 않는 요청입니다.'});
        }else if(url.pathname!=='/__madara/state')return send(res,404,{error:'지원하지 않는 요청입니다.'});
        const actorId=url.searchParams.get('actor')||session.memberId;
        const since=Math.max(0,Number(url.searchParams.get('since'))||0);
        return send(res,200,{state:madaraView(room,session.memberId,{actorId,since}),...(url.searchParams.has('payload')?{payload:madaraBattlePayload(room,session.memberId,actorId)}:{})});
      }
      if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'지원하지 않는 요청입니다.'});
      let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'preview/madara-raid-v1/index.html';
      if(relative.endsWith('/'))relative+='index.html';
      if(!/^(assets|css|js|preview)\//.test(relative)||relative.includes('\\')||relative.split('/').some(x=>x.startsWith('.')))return send(res,403,{error:'접근할 수 없는 파일입니다.'});
      let file=path.resolve(root,relative);
      if(!file.startsWith(root+path.sep))return send(res,403,{error:'접근할 수 없는 파일입니다.'});
      if((await stat(file)).isDirectory())file=path.join(file,'index.html');
      file=await realpath(file);if(!file.startsWith(root+path.sep)||!MIME[path.extname(file)])return send(res,403,{error:'접근할 수 없는 파일입니다.'});
      const data=await readFile(file);res.writeHead(200,{'content-type':MIME[path.extname(file)],'content-length':data.length,'cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
    }catch(error){send(res,error.status||(['ENOENT','ENOTDIR'].includes(error.code)?404:500),{error:error.message,code:error.code||'PREVIEW_ERROR'});}
  });
  const interval=setInterval(prune,250);interval.unref();server.on('close',()=>clearInterval(interval));
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.MADARA_PREVIEW_PORT||8806);
  createMadaraPreviewServer().listen(port,'127.0.0.1',()=>console.log(`Madara local preparation: http://127.0.0.1:${port}/preview/madara-raid-v1/`));
}
