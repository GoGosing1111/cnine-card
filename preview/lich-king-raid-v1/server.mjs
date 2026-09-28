import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { createLichRoom, addLichMember, startLichRoom, actLichRoom, tickLichRoom, lichView, lichBattlePayload } from '../../functions/_raid_lich_king.js';
import { REVIEW_DECK, REVIEW_BOSS } from './fixture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.avif':'image/avif','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.webm':'video/webm'};
export function createLichPreviewServer({clock=Date.now}={}) {
  const rooms=new Map(),sessions=new Map();
  const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));};
  const readBody=async req=>{let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>8192)throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413});}try{return JSON.parse(data||'{}');}catch{throw Object.assign(new Error('잘못된 JSON 요청입니다.'),{status:400});}};
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname.startsWith('/__lich/')){
        if(req.method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'다른 출처의 요청은 허용하지 않습니다.'});
        const body=req.method==='POST'?await readBody(req):{};
        if(req.method==='GET'&&url.pathname==='/__lich/health')return send(res,200,{ok:true,scope:'LOCAL_REVIEW_ONLY',rewardLocked:true});
        if(req.method==='POST'&&['/__lich/create','/__lich/join'].includes(url.pathname)){
          if(sessions.size>=300)return send(res,429,{error:'검수 세션 수가 너무 많습니다.'});
          const id=randomUUID(),token=randomBytes(24).toString('hex');let room;
          if(url.pathname.endsWith('/create')){
            const code=randomBytes(4).toString('hex').toUpperCase();
            room=createLichRoom({id:code,hostId:id,mode:body.mode||'COMMAND',cards:REVIEW_DECK,monster:REVIEW_BOSS,now:clock(),seed:randomBytes(4).readUInt32BE()});
            addLichMember(room,{id,name:body.name,role:body.role||'ASSAULT'});rooms.set(code,room);
          }else{
            room=rooms.get(String(body.code||'').trim().toUpperCase());
            if(!room||room.mode!=='PARTY')return send(res,404,{error:'참가할 공대를 찾지 못했습니다.'});
            addLichMember(room,{id,name:body.name,role:body.role},clock());
          }
          sessions.set(token,{roomId:room.id,memberId:id});return send(res,200,{token,state:lichView(room,id),payload:lichBattlePayload(room)});
        }
        const session=sessions.get(String(req.headers.authorization||'').replace(/^Bearer /,''));
        if(!session)return send(res,401,{error:'검수 세션이 만료되었습니다.'});
        const room=rooms.get(session.roomId);if(!room)return send(res,404,{error:'공대가 만료되었습니다.'});
        tickLichRoom(room,clock());
        if(req.method==='POST'&&url.pathname==='/__lich/start')startLichRoom(room,session.memberId,clock());
        else if(req.method==='POST'&&url.pathname==='/__lich/action')actLichRoom(room,session.memberId,body,clock());
        else if(!(req.method==='GET'&&url.pathname==='/__lich/state'))return send(res,404,{error:'지원하지 않는 요청입니다.'});
        const since=Math.max(0,Number(url.searchParams.get('since'))||0);
        return send(res,200,{state:lichView(room,session.memberId,since),...(url.searchParams.has('payload')?{payload:lichBattlePayload(room)}:{})});
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
      let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if(!relative)relative='preview/lich-king-raid-v1/index.html';
      if(relative.endsWith('/'))relative+='index.html';
      if(!/^(assets|css|js|preview)\//.test(relative)||relative.split(/[\\/]/).some(x=>x.startsWith('.'))){res.writeHead(403);res.end();return;}
      let file=path.resolve(root,relative);
      if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      if((await stat(file)).isDirectory())file=path.join(file,'index.html');
      file=await realpath(file);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      const mime=MIME[path.extname(file)];if(!mime){res.writeHead(403);res.end();return;}
      const data=await readFile(file);res.writeHead(200,{'content-type':mime,'content-length':data.length,'cache-control':'no-cache','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
    }catch(error){send(res,error.status||(['ENOENT','ENOTDIR'].includes(error.code)?404:500),{error:error.message,code:error.code||'PREVIEW_ERROR'});}
  });
  const interval=setInterval(()=>{
    const now=clock();for(const [code,room]of rooms){tickLichRoom(room,now);if(now-room.createdAt>1800000){rooms.delete(code);for(const [token,session]of sessions)if(session.roomId===code)sessions.delete(token);}}
  },200);interval.unref();server.on('close',()=>clearInterval(interval));
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.LICH_PREVIEW_PORT||8798);
  createLichPreviewServer().listen(port,'127.0.0.1',()=>console.log(`Lich King review: http://127.0.0.1:${port}/preview/lich-king-raid-v1/`));
}
