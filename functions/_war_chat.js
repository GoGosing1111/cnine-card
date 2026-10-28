import {WAR_CHAT_KEY,WAR_CHAT_KINDS,chatSettings,chatRoom,validChatRoom} from '../shared/war-chat-v1.mjs';
import {readJointBody,assertJointOrigin,jointError} from './_joint_request.js';
import {readClanResumption} from './_clan_resumption.js';
const fail=(code,message,status=400)=>{throw jointError('CHAT_'+code,message,status);};
const reply=(v,status=200)=>Response.json(v,{status,headers:{'cache-control':'no-store'}});
const stub=(env,id)=>env.COOP_ROOMS.getByName(id);
export async function readChatSettings(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(WAR_CHAT_KEY).first();return {row,settings:chatSettings(row?JSON.parse(row.value):{})};}

// Membership comes from the current authoritative roster, never from the browser.
// These are indexed reads only: no war lifecycle, account locks or combat work.
export async function chatMembers(env,kind,{userId=null,room=null}={}){
 let sql,args=[],round;
 if(kind==='clan'){
  const resumed=await readClanResumption(env);if(!resumed)return [];
  sql=`SELECT m.user_id,u.nickname,m.season_id AS round_id,m.clan_id AS side FROM clan_members m JOIN clan_seasons r ON r.id=m.season_id JOIN users u ON u.id=m.user_id WHERE r.id=? AND r.phase='ACTIVE' AND datetime(r.ends_at)>datetime('now')`;
  args.push(resumed.seasonId);
 }else if(kind==='territory'){
  sql=`SELECT m.user_id,u.nickname,m.round_id,m.side FROM territory_war_v3_users m JOIN territory_war_v3_rounds r ON r.id=m.round_id JOIN users u ON u.id=m.user_id WHERE r.id=(SELECT MAX(id) FROM territory_war_v3_rounds) AND r.status IN ('PREPARING','ACTIVE') AND m.status='ACTIVE' AND m.side IN ('A','B') AND datetime(r.ends_at)>datetime('now')`;
 }else if(kind==='faction'){
  sql=`SELECT m.user_id,u.nickname,m.round_id,m.organization_id AS side FROM organization_members_v1 m JOIN organization_rounds_v1 r ON r.id=m.round_id JOIN users u ON u.id=m.user_id WHERE r.scope='LIVE' AND r.phase='ASSIGNED'`;
 }else fail('KIND','채팅방 종류를 확인하세요.');
 sql+=` AND u.status='ACTIVE' AND (u.banned_until IS NULL OR u.banned_until<=datetime('now'))`;
 if(userId!==null){sql+=' AND m.user_id=?';args.push(userId);}
 if(room){[, ,round]=room.split(':');const side=room.split(':').at(-1);sql+=kind==='clan'?' AND m.season_id=? AND m.clan_id=?':kind==='territory'?' AND m.round_id=? AND m.side=?':' AND m.round_id=? AND m.organization_id=?';args.push(round,side);}
 return ((await env.DB.prepare(sql).bind(...args).all()).results||[]).map(r=>({userId:Number(r.user_id),nickname:String(r.nickname).slice(0,60),room:chatRoom(kind,r.round_id,r.side)}));
}
export async function chatGate(env,room,sessionHashes){
 const kind=room.split(':')[1],{settings}=await readChatSettings(env);
 if(!settings[kind])return {enabled:false,members:[],sessions:[]};
 const members=await chatMembers(env,kind,{room});
 const hashes=[...new Set(sessionHashes)].filter(x=>/^[a-f0-9]{64}$/.test(x)).slice(0,256);
 const sessions=hashes.length?(await env.DB.prepare(`SELECT token_hash,user_id FROM sessions WHERE token_hash IN (${hashes.map(()=>'?').join(',')}) AND expires_at>datetime('now')`).bind(...hashes).all()).results:[];
 return {enabled:true,members,sessions};
}
async function saveSettings(env,user,body){
 if(!Object.hasOwn(WAR_CHAT_KINDS,body.kind)||typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.revision)||body.revision<0)fail('INPUT','채팅방, ON/OFF와 설정 버전을 확인하세요.');
 const {row,settings}=await readChatSettings(env);
 if(settings.revision!==body.revision)fail('CONFLICT','다른 화면에서 설정이 변경되었습니다. 새로 불러온 후 다시 설정하세요.',409);
 const before=row?.value||JSON.stringify(settings),next={...settings,[body.kind]:body.enabled,revision:settings.revision+1,changeId:crypto.randomUUID(),updatedBy:Number(user.id),updatedAt:new Date().toISOString()},after=JSON.stringify(next);
 // The unique changeId makes the audit conditional on this exact CAS winning.
 // D1-compatible batch is one PostgreSQL transaction, including the audit row.
 const results=await env.DB.batch([
  env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(WAR_CHAT_KEY,before),
  env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(after,WAR_CHAT_KEY,before),
  env.DB.prepare("INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) SELECT ?,'WAR_CHAT_SETTINGS','WAR_CHAT',?,?,? FROM app_meta WHERE key=? AND value=?").bind(user.id,body.kind,before,after,WAR_CHAT_KEY,after)
 ]);
 if(Number(results[1].meta?.changes)!==1)fail('CONFLICT','다른 화면에서 설정이 변경되었습니다. 새로 불러온 후 다시 설정하세요.',409);
 return chatSettings(next);
}
export async function handleWarChat({path,request,env,deps}){
 if(!['war-chat/ticket','admin/war-chat'].includes(path))return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)fail('LOGIN','로그인이 필요합니다.',401);
  if(user.status!=='ACTIVE')fail('ACCOUNT','계정 상태를 확인하세요.',403);
  if(path==='admin/war-chat'){
   if(user.role!=='OWNER')fail('OWNER','채팅창 설정은 OWNER만 변경할 수 있습니다.',403);
   if(request.method==='GET')return reply({ok:true,settings:(await readChatSettings(env)).settings});
   if(request.method!=='POST')fail('METHOD','지원하지 않는 요청입니다.',405);
   const body=await readJointBody(request,{maxBytes:1024,fields:['kind','enabled','revision']});
   return reply({ok:true,settings:await saveSettings(env,user,body)});
  }
  if(request.method!=='POST')fail('METHOD','지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{maxBytes:512,fields:['kind']});
  if(!Object.hasOwn(WAR_CHAT_KINDS,body.kind))fail('KIND','채팅방 종류를 확인하세요.');
  if(!(await readChatSettings(env)).settings[body.kind])fail('OFF','현재 이 채팅방은 OFF입니다.',403);
  if(!env.COOP_ROOMS)fail('UNAVAILABLE','채팅 연결을 준비하고 있습니다.',503);
  const member=(await chatMembers(env,body.kind,{userId:Number(user.id)}))[0];
  if(!member)fail('MEMBERSHIP','현재 회차에 배정된 같은 편만 이용할 수 있습니다.',403);
  const bearer=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const sessionHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(bearer)))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const result=await stub(env,member.room).chatTicket({...member,sessionHash});
  return reply(result,result.ok?200:result.status||503);
 }catch(e){return reply({ok:false,code:e.code||'CHAT_UNAVAILABLE',error:e.code?e.message:'채팅 연결이 지연되고 있습니다. 잠시 후 다시 시도하세요.'},e.status||503);}
}
export async function warChatStream(request,env){
 try{
  assertJointOrigin(request);const url=new URL(request.url),room=url.searchParams.get('room'),ticket=url.searchParams.get('ticket');
  if(request.method!=='GET'||request.headers.get('upgrade')?.toLowerCase()!=='websocket'||!validChatRoom(room)||!/^[-a-f0-9]{36}$/.test(ticket||''))fail('STREAM','연결 정보를 확인하세요.');
  if(!env.COOP_ROOMS)fail('UNAVAILABLE','채팅 연결을 준비하고 있습니다.',503);
  return await stub(env,room).fetch(request);
 }catch(e){return reply({ok:false,code:e.code||'CHAT_UNAVAILABLE'},e.status||503);}
}
