import {readJointBody,jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {canAccessLegionHunt,readLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from './_legion_hunt_settings.js';
import {legionHuntEntries} from './_legion_hunt.js';
import {readSupportBenefits} from './_supporter_benefits.js';
import {loadCoopOwnedCards} from './_cooperative_live.js';
import {PLAYABLE_MERCENARIES} from './_comeback_loans.js';
import {selectedMercenaryBattleSnapshots,mercenaryAccountState} from './_mercenary_account.js';
import {validateCoopSelection,COOP_DUAL_RULES} from '../shared/cooperative-battleground-v1.mjs';
import {loadPetBattleSnapshot} from './_pet_account.js';
import {seasonBonus} from './_season_s1.js';
import {buildCitadelBattle} from './_legion_citadel_battle.js';
import {FIRST_TIER,tierById,citadelTierMenu} from './_legion_citadel_tiers.js';
import {citadelAdmin,readCitadelPolicy,CITADEL_POLICY_KEY} from './_legion_citadel_policy.js';
import {citadelLoot,citadelGrantStatements,personalFarm,farmView} from './_legion_citadel_loot.js';

const P='legion_citadel_v1:',roomKey=id=>P+'room:'+id,userKey=id=>P+'user:'+id,replayKey=id=>P+'battle:'+id;
const tag='legion-party/',fields={create:['requestId','tier'],join:['id'],ready:['id','cardIds','mercenaryCodes'],unready:['id'],start:['id'],loaded:['id'],pickup:['id','token'],claim:['id'],leave:['id']};
const idOK=id=>typeof id==='string'&&/^[0-9a-f]{24}$/.test(id);
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const raw=async(db,key)=>(await stmt(db,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
const put=(db,k,v)=>stmt(db,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',k,v);
const del=(db,k)=>stmt(db,'DELETE FROM app_meta WHERE key=?',k);
const fail=(kind,msg,status=409)=>{throw jointError('CITADEL_'+kind,msg,status);};
const entryActions=new Set(['create','join','ready','unready','start','loaded']);
const requireOpen=policy=>{if(policy.mode!=='ON')fail('PAUSED','불타는 성채 파티의 신규 입장이 일시 중지됐습니다.',423);};
const guard=(db,k,expected)=>{const token=crypto.randomUUID();return [jointGuard(db,token,expected===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',expected===null?[k]:[k,expected]),jointGuardEnd(db,token)];};
const listKey=r=>P+'open:'+String(r.expiresAt).padStart(16,'0')+':'+r.id;
const phase=(r,at)=>r.phase==='ACTIVE'&&at>=r.startsAt+r.duration?(r.won?'VICTORY':'DEFEAT'):['LOBBY','LOADING'].includes(r.phase)&&at>=r.expiresAt?'CANCELLED':r.phase;
function view(r,user,at){
 const i=r.members.findIndex(m=>m.id===Number(user.id));if(i<0)fail('MEMBER','참가한 파티만 볼 수 있습니다.',403);
 const m=r.members[i],status=phase(r,at),end=['VICTORY','DEFEAT'].includes(status),elapsed=r.startsAt?at-r.startsAt:-1;
 const kills=(r.kills||[]).filter(k=>k[0]<=elapsed);
 return {id:r.id,status,tier:r.tier??FIRST_TIER,tierName:tierById(r.tier??FIRST_TIER).name,you:m.id,hostId:r.hostId,serverNow:at,expiresAt:r.expiresAt,startsAt:r.startsAt||null,duration:r.duration||0,
  members:r.members.map(({id,name,ready,loaded,summary})=>({id,name,ready:!!ready,loaded:!!loaded,summary:summary||null})),selection:m.selection||null,
  kills:kills.length,bosses:kills.filter(k=>k[1]===2).length,drops:[],ground:[],claimed:!!m.claimed,canClaim:false,test:!r.paying};
}
const farmKey=(id,uid)=>P+'farm:'+id+':'+uid;
const receiptKey=(id,uid)=>P+'receipt:'+id+':'+uid;
async function present(db,r,user,at){
 const state=view(r,user,at);if(!r.startsAt)return state;
 const f=JSON.parse(await raw(db,farmKey(r.id,user.id)));if(!f)fail('FARM','개인 전리품을 읽지 못했습니다.',503);
 const earned=farmView(f,Math.min(r.duration,at-r.startsAt),state.status==='ACTIVE');
 return {...state,...earned,canClaim:['VICTORY','DEFEAT'].includes(state.status)&&earned.picked>0&&!state.claimed};
}
const emptyMember=u=>({id:Number(u.id),name:String(u.nickname||'토벌대원').slice(0,64),ready:false,loaded:false});
async function current(DB,u){const ptr=await raw(DB,userKey(u));const data=ptr&&await raw(DB,roomKey(ptr));return {ptr,r:data?JSON.parse(data):null};}
async function rooms(DB,at){const prefix=P+'open:',result=await stmt(DB,'SELECT value FROM app_meta WHERE key>=? AND key<? ORDER BY key LIMIT 31',prefix+String(at+1).padStart(16,'0'),P+'open;').all();return result.results.map(r=>JSON.parse(r.value)).slice(0,30);}
async function options(env,user){
 const [merc,icons]=await Promise.all([mercenaryAccountState(env,user),stmt(env.DB,"SELECT c.id,c.title,c.image_url AS image,uc.breakthrough_level AS level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.quantity>0 AND c.rarity='ICON' AND c.is_active=1 ORDER BY c.title,c.id",user.id).all()]);
 return {mercenaries:merc.cards.filter(m=>m.canDeploy).map(m=>({id:m.code,name:m.name,rank:m.rank,level:m.level,image:m.sourceArt})),icons:icons.results.map(c=>({id:String(c.id),name:c.title,level:Number(c.level),image:c.image}))};
}
async function loadSquad(env,user,selection,deps){
 const [cards,mercenaries,equip,season,pet]=await Promise.all([loadCoopOwnedCards(env,user,deps,selection.cardIds),selectedMercenaryBattleSnapshots(env,user,selection.mercenaryCodes,'PVE',{freeRanks:true}),deps.userEquipmentBonuses(env,user.id),seasonBonus(env,user.id,'PVE'),loadPetBattleSnapshot(env,user,'PVE')]);
 if(cards.length!==2||cards.some(c=>c.rarity!=='ICON'))fail('OWNED','보유한 아이콘 2장을 선택하세요.',403);
 return {ownerId:Number(user.id),ownerName:user.nickname,pet,cards:selection.cardIds.map(id=>cards.find(c=>c.id===id)),mercenaries,seasonAttackBp:season.attackBp||0,avatarPowerPercent:equip.avatarPowerPercent||0,equipmentBonus:Math.max(0,(equip.pve||0)-(equip.battleSuitPve||0)),equipmentSetVisual:equip.pveEquipmentRuntime?.equipmentSetVisual||null};
}
async function verifySelection(env,user,b){
 const selection=validateCoopSelection(b,COOP_DUAL_RULES),[ics,ms]=await Promise.all([
  stmt(env.DB,"SELECT c.id,c.title FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.quantity>0 AND c.rarity='ICON' AND c.is_active=1 AND c.id IN (?,?)",user.id,...selection.cardIds).all(),
  stmt(env.DB,'SELECT mercenary_code FROM '+PLAYABLE_MERCENARIES+' m WHERE user_id=? AND total_copies>0 AND mercenary_code IN (?,?)',user.id,...selection.mercenaryCodes).all()]);
 if(ics.results.length!==2||ms.results.length!==2)fail('OWNED','보유 중인 서로 다른 용병 2명과 아이콘 2장을 선택하세요.',403);
 return {selection,summary:{icons:selection.cardIds.map(id=>ics.results.find(c=>String(c.id)===id).title),mercenaries:selection.mercenaryCodes}};
}
async function saveReplay(replay,id){
 const bytes=new Uint8Array(await new Response(new Blob([JSON.stringify(replay)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let str='';for(let i=0;i<bytes.length;i+=16384)str+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return JSON.stringify({id,gzip:btoa(str)});
}
async function readReplay(db,r,part='header'){
 const saved=JSON.parse(await raw(db,replayKey(r.hostId)+':'+part));if(saved?.id!==r.id)fail('REPLAY','전장 기록을 다시 불러오세요.',409);
 const bytes=Uint8Array.from(atob(saved.gzip),c=>c.charCodeAt(0));return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
}
async function eligibleUsers(env,r,policy){
 const rows=(await stmt(env.DB,"SELECT id,nickname,role,status FROM users WHERE id IN (?,?) AND status='ACTIVE'",...r.members.map(m=>m.id)).all()).results;
 const users=r.members.map(m=>rows.find(u=>Number(u.id)===m.id));if(users.some(u=>!canAccessLegionHunt(policy,u)))fail('CLOSED','두 참가자 모두 군단토벌 이용이 가능해야 합니다.',403);
 return users;
}
async function energyStatements(env,users,at,deps){
 const db=env.DB;
 const balances=await Promise.all(users.map(async u=>{const k='legion_hunt_owner_session_v1:'+u.id,[old,support]=await Promise.all([raw(db,k),(deps.supportBenefits||readSupportBenefits)(env,u.id,at)]),solo=old?JSON.parse(old):{};
  if(solo.state&&!solo.state.ended&&!solo.state.receipt&&!solo.interruption&&solo.expiresAt>at)fail('SOLO','진행 중인 개인 군단토벌을 종료한 뒤 출전하세요.');
  const e=legionHuntEntries(solo,at,u,support);if(!e.unlimited&&e.current<1)fail('ENERGY',u.nickname+'님의 군단토벌 행동력이 부족합니다.');
  return e.unlimited?[]:[...guard(db,k,old),put(db,k,JSON.stringify({...solo,energy:{version:1,current:e.current-1,maximum:e.maximum,updatedAt:e.updatedAt}}))];
 }));return balances.flat();
}
async function change({action,b,env,user,deps,policy,policyRaw,citadel}){
 const db=env.DB,uid=Number(user.id),now=deps.now||Date.now;
 const who=userKey(uid),at=now();let id=b.id,prior;
 if(action==='create'){
  if(!tierById(Object.hasOwn(b,'tier')?b.tier:FIRST_TIER))fail('TIER','성채 난이도를 선택하세요.',400);
  if(typeof b.requestId!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(b.requestId))fail('INPUT','파티 개설 요청을 다시 보내세요.',400);
  id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tag+uid+':'+b.requestId)))).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');
 }else if(!idOK(id))fail('INPUT','파티 번호를 확인하세요.',400);
 const key=roomKey(id),old=await raw(db,key),r=old&&JSON.parse(old);
 const admission=entryActions.has(action);
 if(admission&&!(action==='loaded'&&r&&['ACTIVE','VICTORY','DEFEAT'].includes(phase(r,at))))requireOpen(citadel.policy);
 const out=[],check=[],pointer=['join','create','leave'].includes(action)?await current(db,uid):null;
 if(action==='create'||action==='join'){
  prior=pointer.r;
  if(prior&&prior.id!==id&&prior.members.some(m=>m.id===uid)&&phase(prior,at)!=='CANCELLED')fail('OTHER','현재 파티의 전리품을 정산하고 나간 뒤 참가하세요.');
  if(pointer.ptr!==id){check.push(...guard(db,who,pointer.ptr));out.push(put(db,who,id));}
  if(prior&&phase(prior,at)==='CANCELLED'&&prior.id!==id)out.push(del(db,listKey(prior)));
 }
 let room=r;
 if(action==='create'){
  if(r){if(r.hostId!==uid||phase(r,at)!=='LOBBY'||pointer.ptr!==id||(r.tier??FIRST_TIER)!==(b.tier??FIRST_TIER))fail('OLD','이미 사용한 개설 요청입니다. 파티를 새로 만드세요.');return present(db,r,user,at);}
  room={id,hostId:uid,tier:b.tier??FIRST_TIER,phase:'LOBBY',expiresAt:at+900000,paying:policy.mode==='ON',members:[emptyMember(user)]};
 }else{
  if(!r){if(action==='claim'){const receipt=await raw(db,receiptKey(id,uid));if(receipt)return {...JSON.parse(receipt),serverNow:at};}fail('MISSING','파티가 종료되었거나 존재하지 않습니다.',404);}
  const status=phase(r,at),idx=r.members.findIndex(m=>m.id===uid),me=r.members[idx];
  if(action==='join'){
   if(status!=='LOBBY')fail('CLOSED','모집이 종료됐습니다.');
   if(!me){if(r.members.length!==1)fail('FULL','두 명이 모두 입장했습니다.');r.members.push(emptyMember(user));}
   else if(pointer.ptr===id)return present(db,r,user,at);
  }else{
   if(!me)fail('MEMBER','참가한 파티만 이용할 수 있습니다.',403);
   if(action==='ready'||action==='unready'){
    if(status!=='LOBBY')fail('LOCKED','출전 후 편성을 변경할 수 없습니다.');
    if(action==='ready'){const v=await verifySelection(env,user,b);me.selection=v.selection;me.summary=v.summary;}
    me.ready=action==='ready';
   }else if(action==='start'){
    if(uid!==r.hostId)fail('HOST','방장만 출전할 수 있습니다.',403);
    if(['LOADING','ACTIVE','VICTORY','DEFEAT'].includes(status))return present(db,r,user,at);
    if(status!=='LOBBY'||r.members.length!==2||!r.members.every(m=>m.ready&&m.selection))fail('READY','두 참가자 모두 편성을 마치고 준비해야 합니다.');
    const us=await eligibleUsers(env,r,policy);
    const tier=r.tier??FIRST_TIER,drops=citadel.policy.tierDrops[tier]??citadel.policy.drops;
    const [squads,loot]=await Promise.all([Promise.all(us.map((u,i)=>(deps.citadelSquad||loadSquad)(env,u,r.members[i].selection,deps))),(deps.citadelLoot||citadelLoot)(env,us,drops)]);
    const built=buildCitadelBattle(squads,crypto.getRandomValues(new Uint32Array(1))[0],tier);
    const replayParts=[['header',built.replay],...built.chunks.map((v,i)=>[i,v])];
    for(const [part,v] of replayParts)out.push(put(db,replayKey(r.hostId)+':'+part,await saveReplay(v,id)));
    out.push(del(db,listKey(r)));
    for(let i=0;i<2;i++)out.push(put(db,farmKey(r.id,us[i].id),JSON.stringify(personalFarm(loot[i],built.kills,squads[i].pet?.magnet===true))));
    Object.assign(r,{phase:'LOADING',expiresAt:now()+120000,won:built.won,kills:built.kills,duration:built.duration,parts:built.chunks.length});
   }else if(action==='loaded'){
    if(['ACTIVE','VICTORY','DEFEAT'].includes(status))return present(db,r,user,at);
    if(status!=='LOADING')fail('LOADING','전장 준비 시간이 종료됐습니다. 행동력은 차감되지 않습니다.');
    if(me.loaded)return present(db,r,user,at);me.loaded=true;
    if(r.members.every(m=>m.loaded)){
     const us=await eligibleUsers(env,r,policy);
     if(r.paying&&policy.mode!=='ON')fail('PAUSED','군단토벌 운영이 일시 중지됐습니다.',423);
     if(r.paying)out.push(...await energyStatements(env,us,now(),deps));r.phase='ACTIVE';r.startsAt=now()+1200;
    }
   }else if(action==='pickup'){
    if(typeof b.token!=='string'||b.token.length!==18)fail('TOKEN','내 전리품을 선택하세요.',400);
    const k=farmKey(id,uid),saved=await raw(db,k),farm=saved&&JSON.parse(saved);
    if(!farm||!farm.events.some(d=>d[4]===b.token))fail('TOKEN','내 전리품만 획득할 수 있습니다.',403);
    if(farm.picked.includes(b.token))return present(db,r,user,at);
    if(status!=='ACTIVE'||!farmView(farm,at-r.startsAt,true).ground.some(d=>d.token===b.token))fail('EXPIRED','아직 떨어지지 않았거나 사라진 전리품입니다.');
    farm.picked.push(b.token);const result=await stmt(db,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',JSON.stringify(farm),k,saved).run();
    if(Number(result.meta?.changes)!==1)fail('CONFLICT','개인 가방을 갱신 중입니다.');
    return present(db,r,user,at);
   }else if(action==='claim'){
    if(!['VICTORY','DEFEAT'].includes(status))fail('EARLY','전투가 끝난 뒤 개인 전리품을 수령하세요.');
    if(me.claimed)return present(db,r,user,at);
    if(r.paying&&policy.mode!=='ON')fail('PAUSED','보상 지급이 재개된 후 수령하세요. 전리품은 보관됩니다.',423);
    const snapshot=await present(db,r,user,at);
    out.push(...await citadelGrantStatements(env,user,id,snapshot.drops,r.paying));me.claimed=true;
    out.push(put(db,receiptKey(id,uid),JSON.stringify({...snapshot,claimed:true,canClaim:false,ground:[]})));
   }else if(action==='leave'){
    if(pointer.ptr!==id){if(me.left)return null;fail('OTHER','현재 참가한 파티를 다시 확인하세요.');}
    if(status==='ACTIVE')fail('ACTIVE','전투가 진행 중입니다. 화면을 닫았다가 다시 입장할 수 있습니다.');
    if(['VICTORY','DEFEAT'].includes(status)&&!me.claimed&&(await present(db,r,user,at)).drops.length)fail('CLAIM','내 전리품을 먼저 수령하세요.');
    check.push(...guard(db,who,id));out.push(del(db,who));
    if(status==='LOBBY'&&uid!==r.hostId)r.members.splice(idx,1);
    else if(['LOADING','LOBBY','CANCELLED'].includes(status)){r.phase='CANCELLED';me.left=true;}
    else me.left=true;
   }
  }
 }
 const st=phase(room,now());
 if(st==='LOBBY'&&room.members.length===1)out.push(put(db,listKey(room),JSON.stringify({id,host:room.members[0].name,tier:room.tier??FIRST_TIER,expiresAt:room.expiresAt})));
 else out.push(del(db,listKey(room)));
 // Keep one compressed replay per host. No replay reads on lobby polls.
 const finished=room.members.every(m=>m.left);
 if(finished)for(const m of room.members)out.push(del(db,farmKey(id,m.id)));
 out.push(finished?del(db,key):put(db,key,JSON.stringify(room)));
 const statements=[...guard(db,key,old),...guard(db,LEGION_HUNT_SETTINGS_KEY,policyRaw),...check,...out];
 if(admission)statements.unshift(...guard(db,CITADEL_POLICY_KEY,citadel.raw));
 // Lock rows before checking the room version on PostgreSQL; no simulation in the transaction.
 if(db.dialect==='postgres'){
  if(admission)statements.unshift(stmt(db,'SELECT key FROM app_meta WHERE key=? FOR SHARE',CITADEL_POLICY_KEY));
  if(old!==null)statements.unshift(stmt(db,'SELECT key FROM app_meta WHERE key=? FOR UPDATE',key));
  const ids=action==='loaded'?room.members.map(m=>m.id).sort((a,b)=>a-b):[uid];
  statements.unshift(stmt(db,'SELECT id FROM users WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id FOR UPDATE',...ids));
 }
 try{await db.batch(statements);}catch(error){
  if(admission&&(await raw(db,CITADEL_POLICY_KEY))!==citadel.raw){requireOpen((await readCitadelPolicy(env)).policy);fail('SETTINGS_CHANGED','성채 설정이 변경됐습니다. 다시 시도하세요.');}
  if(await raw(db,key)!==old||pointer&&await raw(db,who)!==pointer.ptr)fail('CONFLICT','파티 상태가 변경됐습니다. 다시 시도하세요.');
  throw error;
 }
 return action==='leave'?null:present(db,room,user,now());
}
export async function handleLegionCitadel({path,request,env,deps}){
 const admin=path==='admin/legion-hunt/citadel';
 if(!admin&&!path.startsWith(tag))return null;
 const reply=(body,status=200)=>deps.json(body,status,{'cache-control':'private, no-store'});
 try{
  const action=path.slice(tag.length);
  if(!admin&&action==='status'&&request.method==='GET'){
   const [global,citadel]=await Promise.all([readLegionHuntPolicy(env),readCitadelPolicy(env)]);
   return reply({ok:true,open:global.policy.mode==='ON'&&citadel.policy.mode==='ON'});
  }
  const user=await deps.authenticate(request,env);if(!user)fail('LOGIN','로그인이 필요합니다.',401);
  if(admin)return reply(await citadelAdmin({request,env,user,deps}));
  const [{policy,raw:policyRaw},citadel]=await Promise.all([readLegionHuntPolicy(env),readCitadelPolicy(env)]);
  if(!canAccessLegionHunt(policy,user))fail('ACCESS','현재 군단토벌을 이용할 수 없습니다.',403);
  const open=citadel.policy.mode==='ON',at=(deps.now||Date.now)(),DB=env.DB;
  if(request.method==='GET'){
   if(action==='lobby'){const [here,list]=await Promise.all([current(DB,user.id),open?rooms(DB,at):[]]);return reply({ok:true,open,tiers:open?citadelTierMenu:[],state:here.r&&here.r.members.some(m=>m.id===Number(user.id))&&phase(here.r,at)!=='CANCELLED'?await present(DB,here.r,user,at):null,rooms:list,test:policy.mode!=='ON'});}
   if(action==='options'){requireOpen(citadel.policy);return reply({ok:true,...await (deps.citadelOptions||options)(env,user)});}
   if(!['state','battle','chunk'].includes(action))fail('PATH','존재하지 않는 메뉴입니다.',404);
   const id=new URL(request.url).searchParams.get('id');if(!idOK(id))fail('INPUT','파티 번호를 확인하세요.',400);
   const v=await raw(DB,roomKey(id));if(!v)fail('MISSING','종료된 파티입니다.',404);
   const r=JSON.parse(v),state=await present(DB,r,user,at);
   if(action!=='state'&&!['LOADING','ACTIVE'].includes(state.status))fail('EARLY','현재 재생할 전투가 없습니다.');
   if(action==='state')return reply({ok:true,open,state});
   if(state.status==='LOADING')requireOpen(citadel.policy);
   const part=Number(new URL(request.url).searchParams.get('part')||0);
   if(!Number.isInteger(part)||part<0||part>=r.parts)fail('PART','전투 구간을 확인하세요.',400);
   if(action==='chunk')return reply({ok:true,chunk:await readReplay(DB,r,part)});
   const [replay,chunk]=await Promise.all([readReplay(DB,r),readReplay(DB,r,part)]);return reply({ok:true,state,replay,chunk,part});
  }
  if(request.method!=='POST'||!Object.hasOwn(fields,action))fail('METHOD','지원하지 않는 요청입니다.',405);
  if(entryActions.has(action)&&action!=='loaded')requireOpen(citadel.policy);
  const b=await readJointBody(request,{fields:fields[action],maxBytes:2048});
  return await deps.withUserMutationLock(env,user.id,path,async()=>{
   for(let i=0;;i++)try{return reply({ok:true,open,state:await change({action,b,env,user,deps,policy,policyRaw,citadel})});}catch(e){if(e.code!=='CITADEL_CONFLICT'||i>=2)throw e;}
  });
 }catch(err){const known=/^(CITADEL|MERCENARY|COOP_SELECTION|JOINT)_?/.test(err.code||'');if(!known)console.error('[legion citadel]',err.name,err.code||'storage');return reply({ok:false,code:known?err.code:'CITADEL_RETRY',error:known?err.message:'파티 정보를 저장하거나 읽지 못했습니다. 같은 화면에서 다시 시도하세요.'},known?(err.status||400):503);}
}

