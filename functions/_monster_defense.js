import {assertJointOrigin,readJointBody,jointError} from './_joint_request.js';
import {DEFENSE_KEY,DEFENSE_DIFFICULTIES,defaultDefenseSettings,validateDefenseSettings,defenseAccess,validDefenseRoom} from '../shared/monster-defense-v1.mjs';
import {readDefenseRoster,loadDefenseSelection} from './_monster_defense_roster.js';
const fail=(message,status=400)=>{throw jointError('DEFENSE_REQUEST',message,status);};
const stub=(env,id)=>env.COOP_ROOMS.getByName('defense:'+id);
const pointer=(env,user)=>env.COOP_PLAYERS.getByName('defense:'+user.id);
export async function readDefenseSettings(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(DEFENSE_KEY).first();return validateDefenseSettings(row?JSON.parse(row.value):defaultDefenseSettings());}
export async function monsterDefenseLive(request,env){
 try{
  if(request.method!=='GET'||request.headers.has('origin'))assertJointOrigin(request);
  else if(request.headers.get('sec-fetch-site')==='cross-site')fail('같은 게임 화면에서 다시 연결하세요.',403);
  const url=new URL(request.url),id=url.searchParams.get('room'),action=url.pathname.split('/').at(-1);
  if(!validDefenseRoom(id)||!['state','command'].includes(action))fail('잘못된 디펜스 연결입니다.');
  if(request.method==='POST'&&!request.headers.get('content-type')?.startsWith('application/json'))fail('JSON 명령을 보내세요.',415);
  return await stub(env,id).fetch(request);
 }catch(e){return Response.json({ok:false,error:e.message},{status:e.status||503,headers:{'cache-control':'no-store'}});}
}
export async function handleMonsterDefense({path,request,env,deps}){
 if(!path.startsWith('defense/')&&!path.startsWith('admin/defense/'))return null;
 const reply=(body,status=200)=>deps.json(body,status,{'cache-control':'private, no-store'});
 try{
  const user=await deps.authenticate(request,env);if(!user)fail('로그인 후 디펜스에 입장하세요.',401);
  const settings=await readDefenseSettings(env),action=path.split('/').at(-1);
  if(path.startsWith('admin/')){
   if(user.role!=='OWNER')fail('OWNER만 디펜스 TEST 설정을 관리할 수 있습니다.',403);
   if(action==='test-users'&&request.method==='GET'){
    const q=new URL(request.url).searchParams.get('q')?.trim();if(!q||q.length>80)fail('정확한 닉네임 또는 계정번호를 입력하세요.');
    const rows=await env.DB.prepare('SELECT id,nickname FROM users WHERE nickname=? OR id=? ORDER BY id LIMIT 20').bind(q,/^[1-9]\d{0,12}$/.test(q)?Number(q):0).all();return reply({users:rows.results});
   }
   if(action!=='settings')fail('없는 설정 경로입니다.',404);
   if(request.method==='GET')return reply({settings,difficulties:DEFENSE_DIFFICULTIES});
   if(request.method!=='POST')fail('지원하지 않는 요청입니다.',405);
   const body=await readJointBody(request,{maxBytes:16384,fields:['settings','requestId']});
   const next=validateDefenseSettings(body.settings);if(!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId||''))fail('저장 요청 ID를 확인하세요.');
   if(next.testUserIds.length){const found=await env.DB.prepare('SELECT id FROM users WHERE id IN ('+next.testUserIds.map(()=>'?').join(',')+')').bind(...next.testUserIds).all();if(found.results.length!==next.testUserIds.length)fail('존재하지 않는 테스트 계정입니다.');}
   return await deps.withUserMutationLock(env,user.id,'defense/settings',async()=>{
    const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(DEFENSE_KEY).first(),old=row?JSON.parse(row.value):defaultDefenseSettings();
    const fingerprint=JSON.stringify(next);
    if(old.lastRequest?.id===body.requestId){if(old.lastRequest.fingerprint!==fingerprint||old.lastRequest.userId!==Number(user.id))fail('다른 요청에 사용한 저장 ID입니다.',409);return reply({ok:true,settings:validateDefenseSettings(old),replayed:true});}
    if(old.revision!==next.revision)fail('설정이 변경됐습니다. 다시 불러와 주세요.',409);
    const updatedAt=new Date().toISOString(),saved={...next,revision:next.revision+1,updatedBy:Number(user.id),updatedAt,lastRequest:{id:body.requestId,userId:Number(user.id),fingerprint},audit:[{requestId:body.requestId,actorId:Number(user.id),revision:next.revision+1,createdAt:updatedAt},...(Array.isArray(old.audit)?old.audit:[])].slice(0,50)};
    const sql=row?'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?':'INSERT INTO app_meta(value,key,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING';
    const result=await env.DB.prepare(sql).bind(...[JSON.stringify(saved),DEFENSE_KEY,...(row?[row.value]:[])]).run();if(Number(result.meta?.changes)!==1)fail('설정 저장이 충돌했습니다.',409);
    return reply({ok:true,settings:validateDefenseSettings(saved)});
   });
  }
  if(action==='feature'&&request.method==='GET')return reply({mode:settings.mode,accessible:defenseAccess(user,settings),owner:user.role==='OWNER',user:{id:Number(user.id),nickname:user.nickname},difficulties:settings.difficulties,growth:settings.growth,rewardsEnabled:false});
  if(!defenseAccess(user,settings))fail(settings.mode==='OFF'?'디펜스 테스트가 중지돼 있습니다.':'OWNER와 지정된 테스트 계정만 입장할 수 있습니다.',403);
  if(action==='options'&&request.method==='GET')return reply({ok:true,...await readDefenseRoster(env,user,deps),you:Number(user.id)});
  if(!env.COOP_ROOMS||!env.COOP_PLAYERS)fail('디펜스 서버를 준비 중입니다.',503);
  if(request.method!=='POST')fail('지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{maxBytes:4096,fields:['roomId','capacity','difficulty','loadout','practice','requestId','ready','loadoutRevision']});
  return await deps.withUserMutationLock(env,user.id,'defense/entry',async()=>{
   const route=pointer(env,user),active=await route.getRoom();
   if(action==='session'){
    const id=body.roomId||active;if(!validDefenseRoom(id))fail('이어갈 디펜스 방이 없습니다.',404);
    const result=await stub(env,id).defenseRpc('ticket',{user});return reply(result,result.ok?200:result.status);
   }
   if(action==='leave'){
    if(!active)return reply({ok:true});const result=await stub(env,active).defenseLeave(user);if(result.ok)await route.setRoom(null);return reply(result,result.ok?200:result.status);
   }
   if(['select','ready'].includes(action)){
    if(!validDefenseRoom(body.roomId)||body.roomId!==active)fail('현재 대기방에서 편성을 변경하세요.',409);
    if(!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId||'')||!Number.isSafeInteger(body.loadoutRevision)||body.loadoutRevision<0)fail('편성 요청 정보를 다시 확인하세요.');
    if(action==='ready'&&typeof body.ready!=='boolean')fail('준비 상태를 확인하세요.');
    const selection=action==='ready'&&body.ready===false?{}:await loadDefenseSelection(env,user,body.loadout,deps);
    const result=await stub(env,active).defenseRpc(action,{user,...selection,ready:body.ready,requestId:body.requestId,loadoutRevision:body.loadoutRevision});
    return reply(result,result.ok?200:result.status);
   }
   if(!['create','join'].includes(action))fail('없는 디펜스 경로입니다.',404);
   if(!/^[a-zA-Z0-9-]{16,100}$/.test(body.requestId||''))fail('입장 요청 ID를 확인하세요.');
   if(active){const state=await stub(env,active).defenseRpc('inspect',{user});if(state.ok&&!state.terminal){if(action==='join'&&body.roomId!==active)fail('진행 중인 방으로 먼저 돌아가 주세요.',409);const result=await stub(env,active).defenseRpc('ticket',{user});return reply(result,result.ok?200:result.status);}await route.setRoom(null);}
   const selection=await loadDefenseSelection(env,user,body.loadout,deps);
   let id=String(body.roomId||'').trim().toUpperCase(),input={user,...selection};
   if(action==='create'){
    const combat=settings.difficulties.find(d=>d.id===body.difficulty&&d.enabled);if(!combat)fail('이 난이도는 테스트를 사용할 수 없습니다.');
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.id+':'+body.requestId)));
    id=Array.from(hash.slice(0,6),n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
    input={...input,id,capacity:body.capacity,difficulty:combat.id,combat,growth:settings.growth,practice:body.practice===true,accountRoster:true,requestId:body.requestId,seed:crypto.getRandomValues(new Uint32Array(1))[0],settingsRevision:settings.revision};
   }
   if(!validDefenseRoom(id))fail('초대 코드 12자리를 확인하세요.');
   const result=await stub(env,id).defenseRpc(action,input);if(result.ok)await route.setRoom(id);return reply(result,result.ok?200:result.status);
  });
 }catch(e){return reply({ok:false,error:e.code?e.message:'디펜스 요청을 확인하지 못했습니다.',code:e.code||'DEFENSE_UNAVAILABLE'},e.status||400);}
}
