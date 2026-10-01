import {readJointBody,assertJointOrigin,jointError} from './_joint_request.js';
import {readMercenaryDocument,readMercenaryRuntime,battleConfig,mercenaryAccountState,mercenarySnapshotPower} from './_mercenary_account.js';
import {COOP_DIFFICULTIES,COOP_RULES,validCoopRoom,validCoopClient,validateCoopSelection} from '../shared/cooperative-battleground-v1.mjs';
const KEY='cooperative_battleground_settings_v1';
const fail=(code,message,status=409)=>{throw jointError('COOP_'+code,message,status);};
const defaults=()=>({mode:'TEST',testUserIds:[],revision:0,rewardLocked:true});
export async function coopSettings(env){
 const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first();
 const config=row?JSON.parse(row.value):defaults();
 if(!['TEST','ON','OFF'].includes(config.mode)||!Array.isArray(config.testUserIds))fail('CONFIG','격전지 설정을 확인하지 못했습니다.',503);
 return config;
}
export const coopAccess=(user,cfg)=>Boolean(user)&&(cfg.mode==='ON'||cfg.mode==='TEST'&&(user.role==='OWNER'||cfg.testUserIds.includes(Number(user.id))));
const roomStub=(env,id)=>env.COOP_ROOMS.getByName(id);
const playerStub=(env,user)=>env.COOP_PLAYERS.getByName(String(user.id));
const response=(deps,result)=>deps.json(result,result.ok===false?(result.status||400):200,{'cache-control':'no-store'});

// Browser WebSockets carry a one-use, 60s ticket, never the player's login token.
// This path needs no database connection. Ticket creation uses normal auth below.
export async function cooperativeStream(request,env){
 try{
  assertJointOrigin(request);
  const url=new URL(request.url),id=url.searchParams.get('room'),ticket=url.searchParams.get('ticket');
  if(!validCoopRoom(id)||!/^[-a-f0-9]{36}$/.test(ticket||''))fail('STREAM','접속 정보를 확인하세요.',400);
  if(!env.COOP_ROOMS)fail('UNAVAILABLE','격전지 연결을 준비 중입니다.',503);
  return await roomStub(env,id).fetch(request);
 }catch(e){return Response.json({ok:false,code:e.code||'COOP_UNAVAILABLE',error:e.code?e.message:'격전지 연결이 지연되고 있습니다.'},{status:e.status||503});}
}
export async function loadCoopOwnedCards(env,user,deps,ids=null){
 const condition=ids?' AND c.id IN ('+ids.map(()=>'?').join(',')+')':'';
 const [rows,cfg]=await Promise.all([
  env.DB.prepare('SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,uc.breakthrough_level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND COALESCE(uc.quantity,0)>0'+condition+' ORDER BY c.id').bind(user.id,...(ids||[])).all(),
  deps.battleSettings(env)]);
 const cards=rows.results.map(c=>({...c,id:String(c.id),grade:c.rarity,breakthroughLevel:Number(c.breakthrough_level||0),power:deps.cardBattlePower(c,c.breakthrough_level,cfg)}));
 const effects=new Map((await deps.cardUniqueDeckState(env,user,cards,'PVE')).cards.map(c=>[c.id,c]));
 // buildFighter applies unique stats once, exactly as the normal PVE path.
 return cards.map(c=>({...c,uniqueAbility:effects.get(c.id)?.uniqueAbility||null,uniqueAdvancement:effects.get(c.id)?.uniqueAdvancement||null}));
}
export async function loadCoopSelection(env,user,body,deps){
 const selected=validateCoopSelection(body);
 const [cards,owned,document,runtime,bonus,battleSettings]=await Promise.all([
  loadCoopOwnedCards(env,user,deps,selected.cardIds),
  env.DB.prepare('SELECT mercenary_code FROM user_mercenary_cards_v1 WHERE user_id=? AND mercenary_code=?').bind(user.id,selected.mercenaryCode).first(),
  readMercenaryDocument(env),readMercenaryRuntime(env),deps.userEquipmentBonuses(env,user.id),deps.battleSettings(env)]);
 if(cards.length!==2||!owned)fail('OWNERSHIP','보유한 카드 2장과 용병 1명만 출전할 수 있습니다.',403);
 if(cards.filter(c=>c.grade==='SUPERSTAR').length>1)fail('SUPERSTAR_LIMIT','한 사람은 슈퍼스타를 1장까지 선택할 수 있습니다.',400);
 const mercenary={...battleConfig(document.document,selected.mercenaryCode,1),combat:runtime.combat,cmsRevision:document.revision,policyVersion:runtime.version};
 const equipmentBonus=Math.max(0,Number(bonus.pve||0)-Number(bonus.battleSuitPve||0));
 return {ownerId:Number(user.id),ownerName:user.nickname,cards:selected.cardIds.map(id=>cards.find(c=>c.id===id)),mercenary,
  equipmentBonus,singleHealerBonus:battleSettings.engine?.singleHealerBonus||{},
  power:cards.reduce((sum,c)=>sum+c.power,0)+equipmentBonus+mercenarySnapshotPower(mercenary)};
}
export async function handleCooperative({path,request,env,deps}){
 if(!path.startsWith('coop/'))return null;
 try{
  const user=await deps.authenticate(request,env);if(!user)fail('LOGIN','로그인 후 입장하세요.',401);
  const config=await coopSettings(env),kind=path.slice(5),url=new URL(request.url);
  if(kind==='feature'&&request.method==='GET')return deps.json({ok:true,mode:config.mode,visible:user.role==='OWNER'||coopAccess(user,config),accessible:coopAccess(user,config),owner:user.role==='OWNER',rewardLocked:true,rules:COOP_RULES,difficulties:COOP_DIFFICULTIES},200,{'cache-control':'no-store'});
  if(kind==='settings'){
   if(user.role!=='OWNER')fail('OWNER','OWNER만 설정할 수 있습니다.',403);
   if(request.method==='GET')return deps.json({ok:true,settings:config});
   if(request.method!=='POST')fail('METHOD','지원하지 않는 요청입니다.',405);
   const {settings:s}=await readJointBody(request);
   if(!s||!['OFF','TEST','ON'].includes(s.mode)||s.revision!==config.revision||!Array.isArray(s.testUserIds)||s.testUserIds.length>100||new Set(s.testUserIds).size!==s.testUserIds.length||s.testUserIds.some(n=>!Number.isSafeInteger(n)||n<1))fail('SETTINGS','공개 상태, 테스트 계정 ID와 설정 버전을 확인하세요.',400);
   if(s.testUserIds.length){const found=await env.DB.prepare('SELECT id FROM users WHERE id IN ('+s.testUserIds.map(()=>'?').join(',')+')').bind(...s.testUserIds).all();if(found.results.length!==s.testUserIds.length)fail('TEST_USERS','존재하지 않는 계정 ID입니다.',400);}
   return await deps.withUserMutationLock(env,user.id,path,async()=>{
    const fresh=await coopSettings(env);if(fresh.revision!==s.revision)fail('CONFIG_CONFLICT','설정이 변경됐습니다. 다시 불러오세요.');
    const next={mode:s.mode,testUserIds:s.testUserIds,revision:s.revision+1,rewardLocked:true,updatedBy:Number(user.id),updatedAt:new Date().toISOString()};
    const current=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first(),raw=JSON.stringify(next);
    const saved=current?await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,KEY,current.value).run():await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(KEY,raw).run();
    if(Number(saved.meta?.changes)!==1)fail('CONFIG_CONFLICT','설정 저장이 충돌했습니다.');
    return deps.json({ok:true,settings:next});
   });
  }
  if(!coopAccess(user,config))fail('CLOSED',config.mode==='OFF'?'격전지는 현재 운영 중지 상태입니다.':'격전지 테스트 참여자로 등록된 계정만 입장할 수 있습니다.',403);
  if(!env.COOP_ROOMS||!env.COOP_PLAYERS)fail('UNAVAILABLE','격전지 서버를 준비 중입니다.',503);
  if(kind==='options'&&request.method==='GET'){
   const [cards,mercenaries]=await Promise.all([loadCoopOwnedCards(env,user,deps),mercenaryAccountState(env,user)]);
   return deps.json({ok:true,cards,mercenaries:mercenaries.cards.filter(c=>c.canDeploy),you:Number(user.id),nickname:user.nickname,rewardLocked:true});
  }
  if(kind==='current'&&request.method==='GET'){
   const id=await playerStub(env,user).getRoom();if(!id)return deps.json({ok:true,state:null});
   const result=await roomStub(env,id).state(user,Number(url.searchParams.get('revision')||-1));
   return result.code==='COOP_MISSING'||result.code==='COOP_MEMBER'?deps.json({ok:true,state:null}):response(deps,result);
  }
  if(request.method!=='POST')fail('METHOD','지원하지 않는 요청입니다.',405);
  const body=await readJointBody(request,{fields:['roomId','clientId','requestId','difficulty','cardIds','mercenaryCode','revision']});
  if(!validCoopClient(body.clientId)||typeof body.requestId!=='string'||!/^[-a-zA-Z0-9_]{8,100}$/.test(body.requestId))fail('INPUT','접속과 요청 정보를 확인하세요.',400);
  if(kind!=='create'&&!validCoopRoom(body.roomId))fail('ROOM','10자리 대기방 코드를 입력하세요.',400);
  return await deps.withUserMutationLock(env,user.id,path,async()=>{
   if(kind==='create'||kind==='join'){
    const digest=kind==='create'?await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.id+':'+body.requestId)):null;
    const target=kind==='create'?Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,10).toUpperCase():body.roomId;
    const pointer=playerStub(env,user),prior=await pointer.getRoom();
    if(prior){const previous=await roomStub(env,prior).state(user,0);
     if(previous.ok&&['LOBBY','LOADING','ACTIVE'].includes(previous.state.status)&&!previous.state.myResult&&prior!==target)fail('ALREADY_JOINED','현재 대기방에서 먼저 나와주세요.');}
    if(kind==='create'){
     const id=target;
     const result=await roomStub(env,id).create({id,user:{id:Number(user.id),nickname:user.nickname},clientId:body.clientId,difficulty:body.difficulty,seed:crypto.getRandomValues(new Uint32Array(1))[0],requestId:body.requestId});
     if(result.ok)await pointer.setRoom(id);return response(deps,result);
    }
    const result=await roomStub(env,body.roomId).command({id:Number(user.id),nickname:user.nickname},kind,body);
    if(result.ok)await pointer.setRoom(body.roomId);return response(deps,result);
   }
   if(kind==='ticket')return response(deps,await roomStub(env,body.roomId).issueTicket({id:Number(user.id)},body.clientId));
   if(!['select','ready','unready','leave','abandon'].includes(kind))fail('COMMAND','지원하지 않는 명령입니다.',400);
   const input={...body,...(['select','ready'].includes(kind)?{loadout:await loadCoopSelection(env,user,body,deps)}:{})};
   // A page exit records defeat but retains the result for the next screen.
   // Only the explicit return/leave button clears the player's room pointer.
   const result=await roomStub(env,body.roomId).command({id:Number(user.id),nickname:user.nickname},kind==='abandon'?'leave':kind,input);
   if(kind==='leave'&&result.ok){const pointer=playerStub(env,user);if(await pointer.getRoom()===body.roomId)await pointer.setRoom(null);}
   return response(deps,result);
  });
 }catch(e){return deps.json({ok:false,code:e.code||'COOP_UNAVAILABLE',error:e.code?e.message:'격전지 요청을 처리하지 못했습니다. 잠시 후 다시 확인하세요.'},e.status||503,{'cache-control':'no-store'});}
}
