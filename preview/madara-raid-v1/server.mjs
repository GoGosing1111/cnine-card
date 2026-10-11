import http from 'node:http';
import path from 'node:path';
import {readFile,stat,realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {MADARA_RELEASE,MADARA_LINES,createMadaraRoom,addMadaraMember,readyMadaraMember,startMadaraRoom,actMadaraRoom,leaveMadaraRoom,kickMadaraMember,tickMadaraRoom,madaraView,madaraBattlePayload} from '../../functions/_raid_madara.js';
import {madaraReviewDeck,MADARA_REVIEW_BOSS} from './fixture.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
export function createMadaraPreviewServer({clock=Date.now}={}) {
  // Review identities and ticket ledgers live only in this local process. No production DB.
  const rooms=new Map(),accounts=new Map();
  const fail=(code,message,status=409)=>{throw Object.assign(new Error(message),{code,status});};
  const wallet=a=>({id:a.id,name:a.name,tickets:a.tickets,cost:1,initial:3,temporary:true,roomId:a.roomId});
  const listing=a=>[...rooms.values()].filter(r=>r.mode==='PARTY'&&r.members.some(m=>!m.left)).map(r=>({
    id:r.id,hostName:r.members.find(m=>m.id===r.hostId)?.name||'공대장',status:r.status,createdAt:r.createdAt,
    members:r.members.filter(m=>!m.left).length,maxMembers:6,roles:Object.fromEntries(['WARDEN','ASSAULT','RESCUE'].map(role=>[role,r.members.filter(m=>!m.left&&m.role===role).length])),
    canJoin:r.status==='LOBBY'&&r.members.length<6&&!r.banned.includes(a.id)&&!a.roomId,
    blocked:r.banned.includes(a.id)?'강퇴된 공대':r.status!=='LOBBY'?'출정 마감':r.members.length>=6?'인원 마감':a.roomId?'참가 중인 공대가 있습니다.':null
  })).sort((a,b)=>(a.status!=='LOBBY')-(b.status!=='LOBBY')||b.createdAt-a.createdAt);
  const draft=(account,body,code)=>{
    const room=createMadaraRoom({id:code,hostId:account.id,monster:MADARA_REVIEW_BOSS,mode:body.mode||'PARTY',now:clock(),seed:randomBytes(4).readUInt32BE()});
    addMadaraMember(room,{id:account.id,name:body.name,role:body.role||'WARDEN',deck:madaraReviewDeck(body.strength)});
    if(room.mode==='COMMAND')for(const role of ['WARDEN','ASSAULT','RESCUE'].filter(r=>r!==room.members[0].role))addMadaraMember(room,{id:randomUUID(),name:role==='WARDEN'?'봉인 담당':role==='ASSAULT'?'정벌 담당':'구출 담당',role,deck:madaraReviewDeck(body.strength)});
    return room;
  };
  const send=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'same-origin'});res.end(JSON.stringify(data));};
  const bodyOf=async req=>{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw Object.assign(new Error('요청이 너무 큽니다.'),{status:413});}try{return JSON.parse(raw||'{}');}catch{throw Object.assign(new Error('JSON 요청을 확인하세요.'),{status:400});}};
  const prune=()=>{const now=clock();for(const [id,room]of rooms){if(now-room.createdAt>=1800000){rooms.delete(id);for(const a of accounts.values())if(a.roomId===id){a.roomId=null;a.notice='ROOM_EXPIRED';}}else tickMadaraRoom(room,now);}};
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
        let token=String(req.headers.authorization||'').replace(/^Bearer /,''),account=accounts.get(token);
        if(req.method==='POST'&&url.pathname==='/__madara/session'){
          if(token&&!account)fail('SESSION_EXPIRED','로컬 검수 세션이 만료되었습니다.',401);
          if(!account){
            if(accounts.size>=480)fail('SESSION_LIMIT','로컬 검수 세션 한도입니다.',429);
            token=randomBytes(32).toString('hex');account={id:randomUUID(),name:'공대장',tickets:3,roomId:null,receipts:new Map(),notice:null};accounts.set(token,account);
          }
          return send(res,200,{token,account:wallet(account),rooms:listing(account),release:MADARA_RELEASE});
        }
        if(!account)fail('SESSION_EXPIRED','로컬 검수 세션이 만료되었습니다.',401);
        if(req.method==='GET'&&url.pathname==='/__madara/lobby')return send(res,200,{account:wallet(account),rooms:listing(account),serverNow:clock()});
        if(req.method==='GET'&&url.pathname==='/__madara/showcase'){
          const room=draft(account,{mode:'COMMAND',name:'연출 검수'},'SHOWCASE');room.phase=url.searchParams.get('form')==='spirit'?4:0;
          return send(res,200,{payload:madaraBattlePayload(room,account.id),cues:MADARA_LINES,reviewOnly:true});
        }
        if(req.method==='POST'&&url.pathname==='/__madara/create'){
          if(!/^[a-zA-Z0-9_-]{12,100}$/.test(String(body.requestId||'')))fail('REQUEST_ID','생성 요청 식별자가 필요합니다.',400);
          const signature=JSON.stringify([body.mode||'PARTY',body.name||'',body.role||'WARDEN',body.strength||'NORMAL']);
          const receipt=account.receipts.get(body.requestId);
          if(receipt){
            if(receipt.signature!==signature)fail('REQUEST_CONFLICT','같은 생성 요청의 내용이 달라졌습니다.');
            const existing=rooms.get(receipt.roomId);
            if(!existing||account.roomId!==existing.id)fail('RECEIPT_CLOSED','이미 처리된 생성 요청입니다. 새로 공대를 준비하세요.');
            return send(res,200,{state:madaraView(existing,account.id),account:wallet(account),receipt:{...receipt,replayed:true}});
          }
          if(account.roomId)fail('ALREADY_JOINED','이미 참가 중인 공대가 있습니다.');
          if(account.tickets<1)fail('NO_TICKET','검수용 입장권이 부족합니다.');
          if(rooms.size>=80)fail('ROOM_LIMIT','로컬 공대 한도입니다.',429);
          if(account.receipts.size>=256)fail('RECEIPT_LIMIT','이 세션의 생성 요청 한도입니다.',429);
          let code;do{code=randomBytes(5).toString('hex').toUpperCase();}while(rooms.has(code));
          const room=draft(account,body,code); // Validate the full room before spending anything.
          const entry={requestId:body.requestId,roomId:code,cost:1,balance:account.tickets-1,at:clock(),signature};
          // Synchronous commit: no await between validation, debit, room insert and receipt.
          rooms.set(code,room);account.tickets--;account.roomId=code;account.name=room.members[0].name;account.notice=null;account.receipts.set(body.requestId,entry);
          return send(res,200,{state:madaraView(room,account.id),account:wallet(account),receipt:entry});
        }
        if(req.method==='POST'&&url.pathname==='/__madara/join'){
          const room=rooms.get(String(body.code||'').trim().toUpperCase());
          if(!room||room.mode!=='PARTY')fail('ROOM_MISSING','참가할 공대를 찾지 못했습니다.',404);
          if(account.roomId&&account.roomId!==room.id)fail('ALREADY_JOINED','이미 참가 중인 공대가 있습니다.');
          if(account.roomId!==room.id)addMadaraMember(room,{id:account.id,name:body.name,role:body.role,deck:madaraReviewDeck()},clock());
          account.roomId=room.id;account.name=room.members.find(m=>m.id===account.id).name;account.notice=null;
          return send(res,200,{state:madaraView(room,account.id),account:wallet(account)});
        }
        const room=rooms.get(account.roomId);
        if(!room)fail(account.notice==='KICKED'?'KICKED':'ROOM_MISSING',account.notice==='KICKED'?'공대장에 의해 강퇴되었습니다. 다른 공대에 참가할 수 있습니다.':'참가 중인 공대가 없거나 만료되었습니다.',account.notice==='KICKED'?403:404);
        const now=clock();tickMadaraRoom(room,now);
        if(req.method==='POST'){
          if(url.pathname==='/__madara/ready')readyMadaraMember(room,account.id,body.ready!==false);
          else if(url.pathname==='/__madara/start')startMadaraRoom(room,account.id,now);
          else if(url.pathname==='/__madara/action')actMadaraRoom(room,account.id,body,now);
          else if(url.pathname==='/__madara/kick'){
            kickMadaraMember(room,account.id,body.targetId,now);
            for(const a of accounts.values())if(a.id===body.targetId&&a.roomId===room.id){a.roomId=null;a.notice='KICKED';}
          }
          else if(url.pathname==='/__madara/leave'){
            leaveMadaraRoom(room,account.id,now);account.roomId=null;account.notice=null;
            if(room.mode==='COMMAND'||!room.members.some(m=>!m.left))rooms.delete(room.id);
            return send(res,200,{ok:true,account:wallet(account)});
          }
          else return send(res,404,{error:'지원하지 않는 요청입니다.'});
        }else if(url.pathname!=='/__madara/state')return send(res,404,{error:'지원하지 않는 요청입니다.'});
        const actorId=url.searchParams.get('actor')||account.id;
        const since=Math.max(0,Number(url.searchParams.get('since'))||0);
        return send(res,200,{state:madaraView(room,account.id,{actorId,since}),account:wallet(account),...(url.searchParams.has('payload')?{payload:madaraBattlePayload(room,account.id,actorId)}:{})});
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
