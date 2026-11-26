import {COW_AREA} from '../shared/legion-cow-room.mjs';
import {drawBlueprintDrop,activeBlueprintDrop} from './_blueprint_drop.js';
import {cowTicketCount,requireCowTicket,spendCowTicket,cowTicketOutcome} from './_legion_cow_tickets.js';
import {HIDEOUT_KEY,hideoutBenefits} from '../shared/personal-hideout-v1.mjs';
import {HIDEOUT_PARTY_ENERGY_KEY,hideoutPartyEnergy} from '../shared/personal-hideout-energy-v1.mjs';
import {hideoutEnabled} from './_personal_hideout.js';
import {contentProgressionStatements as seasonAwardStatements} from './_content_progression.js';
import {readJointBody,jointError} from './_joint_request.js';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {canAccessLegionHunt,readLegionHuntPolicy,LEGION_HUNT_SETTINGS_KEY} from './_legion_hunt_settings.js';
import {EXTREME_PULSE_KEY} from '../shared/extreme-burning-v1.mjs';
import {interruptedLegionRun,legionHuntEntries,restoreExtremeLegionEnergy} from './_legion_hunt.js';
import {readSupportBenefits} from './_supporter_benefits.js';
import {loadCoopOwnedCards} from './_cooperative_live.js';
import {PLAYABLE_MERCENARIES} from './_comeback_loans.js';
import {selectedMercenaryBattleSnapshots,mercenaryFormationOptions} from './_mercenary_account.js';
import {validateCoopSelection,COOP_DUAL_RULES} from '../shared/cooperative-battleground-v1.mjs';
import {loadPetBattleSnapshot} from './_pet_account.js';
import {seasonBonus,seasonEnabled} from './_season_s1.js';
import {buildCitadelBattle} from './_legion_citadel_battle.js';
import {clanHideout,requireClanHideout,clanEntryGuards} from './_clan_hideout_access.js';
import {inheritedCitadelDrops} from '../shared/challenger-pve-rewards-v1.mjs';
import {DOCKYARD,FIRST_TIER,tierById,citadelTierMenu} from './_legion_citadel_tiers.js';
import {citadelAdmin,readCitadelPolicy,CITADEL_POLICY_KEY} from './_legion_citadel_policy.js';
import {citadelLoot,citadelGrantStatements,personalFarm,farmView,collectCitadelPile} from './_legion_citadel_loot.js';
import {earnedLegionCoins} from '../shared/legion-hunt-coins-v1.mjs';
import {LEGION_PARTY_BASE_RECHARGE_MS,legionRechargeAt,legionRechargeMs,legionRecoveryNotice,LEGION_RECOVERY_EVENT} from '../shared/legion-hunt-energy-v1.mjs';

const P='legion_citadel_v1:',roomKey=id=>P+'room:'+id,userKey=id=>P+'user:'+id,replayKey=id=>P+'battle:'+id;
const entryKey=id=>P+'next-entry:'+id;
const entryPulseKey=id=>P+'entry-generation:'+id;
// Persist the ordinary six-hour deadline as the stable recharge anchor.
// Views and admission guards apply the event's actual elapsed recovery rate.
const PARTY_ENTRY_INTERVAL_MS=LEGION_PARTY_BASE_RECHARGE_MS;
const tag='legion-party/',fields={create:['requestId','tier','area'],join:['id'],ready:['id','cardIds','mercenaryCodes'],unready:['id'],start:['id'],loaded:['id'],pickup:['id','token'],claim:['id'],leave:['id']};
const idOK=id=>typeof id==='string'&&/^[0-9a-f]{24}$/.test(id);
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const raw=async(db,key)=>(await stmt(db,'SELECT value FROM app_meta WHERE key=?',key).first())?.value??null;
// The room pointer is removed on leave and solo can replace its session. The party deadline survives both.
async function readWithEntry(db,key,uid,env=null,at=Date.now()){
 const row=await stmt(db,'SELECT (SELECT value FROM app_meta WHERE key=?) AS value,(SELECT value FROM app_meta WHERE key=?) AS deadline,(SELECT value FROM app_meta WHERE key=?) AS pulses,(SELECT value FROM app_meta WHERE key=?) AS entryGeneration,(SELECT value FROM app_meta WHERE key=?) AS hideoutRaw,(SELECT value FROM app_meta WHERE key=?) AS partyRaw',key,entryKey(uid),EXTREME_PULSE_KEY,entryPulseKey(uid),HIDEOUT_KEY(uid),HIDEOUT_PARTY_ENERGY_KEY(uid)).first();
 const pulses=JSON.parse(row.pulses||'[]'),latest=pulses.at(-1);
 // Older admissions only have the deadline, measured from the synchronized start.
 const paidAt=row.deadline===null?null:entryDeadline(row.deadline,false)-PARTY_ENTRY_INTERVAL_MS-1200;
 const recovered=latest&&paidAt!==null&&(row.entryGeneration===null?latest.at>paidAt:latest.generation>Number(row.entryGeneration));
 const bonus=env&&hideoutEnabled(env)?hideoutBenefits(row.hideoutRaw?JSON.parse(row.hideoutRaw):null).partyEnergy:0;
 const party=bonus?hideoutPartyEnergy(row.partyRaw?JSON.parse(row.partyRaw):null,{at,maximum:1+bonus,deadline:row.deadline,pulses,generation:row.entryGeneration===null?(pulses.filter(p=>paidAt!==null&&p.at<=paidAt).at(-1)?.generation||0):Number(row.entryGeneration)}):null;
 return {...row,party,pulses,pulseRaw:row.pulses,storedDeadline:row.deadline,deadline:party?(party.current>0?null:String(party.nextRechargeAt)):recovered?null:row.deadline,personalDeadline:!!party};
}
const put=(db,k,v)=>stmt(db,'INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',k,v);
const del=(db,k)=>stmt(db,'DELETE FROM app_meta WHERE key=?',k);
const fail=(kind,msg,status=409)=>{throw jointError('CITADEL_'+kind,msg,status);};
function entryDeadline(stored,scheduled=true){
 if(stored===null)return null;
 const next=Number(stored);
 if(!Number.isSafeInteger(next)||next<=0||String(next)!==stored)fail('ENTRY_DATA','파티 입장 시간을 확인할 수 없습니다.',503);
 return !scheduled||next<=LEGION_RECOVERY_EVENT.startsAt?next:legionRechargeAt(next-PARTY_ENTRY_INTERVAL_MS,PARTY_ENTRY_INTERVAL_MS);
}
function requireEntry(stored,at,name){
 const next=entryDeadline(stored);
 if(next>at)fail('COOLDOWN',name+'님의 다음 파티 입장까지 '+Math.ceil((next-at)/60000)+'분 남았습니다.');
}
const entryActions=new Set(['create','join','ready','unready','start','loaded']);
const requireOpen=policy=>{if(policy.mode!=='ON')fail('PAUSED','불타는 성채 파티의 신규 입장이 일시 중지됐습니다.',423);};
function guard(db,...snapshots){
 const token=crypto.randomUUID(),values=[];
 const conditions=snapshots.map(([key,expected])=>{
  values.push(key);
  if(expected===null)return 'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)';
  values.push(expected);return 'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)';
 });
 return [jointGuard(db,token,conditions.join(' AND '),values),jointGuardEnd(db,token)];
}
const listPrefix=scope=>scope?.area===COW_AREA?P+'cow:open:':scope?.clanId?P+'clan:'+scope.roundId+':'+scope.clanId+':open:':P+'open:';
const listKey=r=>listPrefix(r)+String(r.expiresAt).padStart(16,'0')+':'+r.id;
const phase=(r,at)=>r.phase==='ACTIVE'&&at>=r.startsAt+r.duration?(r.won?'VICTORY':'DEFEAT'):['LOBBY','LOADING'].includes(r.phase)&&at>=r.expiresAt?'CANCELLED':r.phase;
function needsSeasonResult(env,r,at){
 return (seasonEnabled(env)||hideoutEnabled(env))&&r.paying===true&&!r.seasonSettled&&r.phase==='ACTIVE'&&
  Number.isSafeInteger(r.startsAt)&&r.duration>0&&at>=r.startsAt+r.duration&&
  r.members.length===2&&r.members.every(m=>m.ready&&m.loaded);
}
function view(r,user,at){
 const i=r.members.findIndex(m=>m.id===Number(user.id));if(i<0)fail('MEMBER','참가한 파티만 볼 수 있습니다.',403);
 const m=r.members[i],status=phase(r,at),elapsed=r.startsAt?Math.min(r.duration,at-r.startsAt):-1;
 let kills=0,bosses=0,units=0,killTime=0;
 for(const [time,kind] of r.kills||[]){
  if(time>elapsed)break;
  kills++;if(kind===2)bosses++;
  units+=kind===2?5:kind===1?3:1;killTime=time;
 }
 const coins=m.coins?m.coins.partyMultiplier*earnedLegionCoins(m.coins,units,killTime,m.coins.huntDurationMs):0;
 return {id:r.id,status,area:r.area||'public',tier:r.tier??FIRST_TIER,tierName:r.area===COW_AREA?'카우방':r.area===DOCKYARD.id?DOCKYARD.name:tierById(r.tier??FIRST_TIER).name,you:m.id,hostId:r.hostId,serverNow:at,expiresAt:r.expiresAt,startsAt:r.startsAt||null,nextEntryAt:m.nextEntryAt==null?null:entryDeadline(String(m.nextEntryAt)),duration:r.duration||0,
  members:r.members.map(({id,name,ready,loaded,summary})=>({id,name,ready:!!ready,loaded:!!loaded,summary:summary||null})),selection:m.selection||null,
  ...(status==='DEFEAT'&&r.resultReason?{resultReason:r.resultReason}:{}),kills,bosses,coins,drops:[],ground:[],claimed:!!m.claimed,canClaim:false,test:!r.paying};
}
const farmKey=(id,uid)=>P+'farm:'+id+':'+uid;
const receiptKey=(id,uid)=>P+'receipt:'+id+':'+uid;
async function present(env,r,user,at){
 const db=env.DB;
 const state=view(r,user,at);if(!r.startsAt)return state;
 const entry=await readWithEntry(db,farmKey(r.id,user.id),user.id,env,at);
 const f=JSON.parse(entry.value);if(!f)fail('FARM','개인 전리품을 읽지 못했습니다.',503);
 if(entry.party){state.partyEnergy=entry.party;state.nextEntryAt=entry.party.current>0?null:entry.party.nextRechargeAt;}else if(state.nextEntryAt!==null)state.nextEntryAt=entryDeadline(entry.deadline);
 const earned=farmView(f,Math.min(r.duration,at-r.startsAt),state.status==='ACTIVE');
 const member=r.members.find(m=>m.id===Number(user.id));
 if(['VICTORY','DEFEAT'].includes(state.status)){
  const ticket=member.cowTicket;
  if(ticket)earned.drops.push({type:'INVENTORY_ITEM',ref:ticket.code,name:ticket.name,image:'/'+ticket.image,quantity:1});
  if(member.blueprintDrop)earned.drops.push(member.blueprintDrop);
 }
 return {...state,...earned,canClaim:['VICTORY','DEFEAT'].includes(state.status)&&(earned.drops.length>0||state.coins>0)&&!state.claimed};
}
const emptyMember=u=>({id:Number(u.id),name:String(u.nickname||'토벌대원').slice(0,64),ready:false,loaded:false});
async function current(db,uid,env,at){
 const entry=await readWithEntry(db,userKey(uid),uid,env,at),{value:ptr,deadline}=entry;
 const data=ptr&&await raw(db,roomKey(ptr));
 return {ptr,deadline,party:entry.party,personalDeadline:entry.personalDeadline,r:data?JSON.parse(data):null};
}
async function rooms(DB,at,scope=null){const prefix=listPrefix(scope),result=await stmt(DB,'SELECT value FROM app_meta WHERE key>=? AND key<? ORDER BY key LIMIT 31',prefix+String(at+1).padStart(16,'0'),prefix.slice(0,-1)+';').all();return result.results.map(r=>JSON.parse(r.value)).slice(0,30);}
async function options(env,user){
 const [mercenaries,icons]=await Promise.all([mercenaryFormationOptions(env,user),stmt(env.DB,"SELECT c.id,c.title,c.image_url AS image,uc.breakthrough_level AS level FROM user_cards uc JOIN cards_effective_v1210 c ON c.id=uc.card_id WHERE uc.user_id=? AND uc.quantity>0 AND c.rarity='ICON' AND c.is_active=1 ORDER BY c.title,c.id",user.id).all()]);
 return {mercenaries,icons:icons.results.map(c=>({id:String(c.id),name:c.title,level:Number(c.level),image:c.image}))};
}
async function loadSquad(env,user,selection,deps){
 const [cards,mercenaries,equip,season,pet]=await Promise.all([loadCoopOwnedCards(env,user,deps,selection.cardIds),selectedMercenaryBattleSnapshots(env,user,selection.mercenaryCodes,'PVE',{freeRanks:true}),deps.userEquipmentBonuses(env,user.id),seasonBonus(env,user.id,'PVE'),loadPetBattleSnapshot(env,user,'PVE')]);
 if(cards.length!==2||cards.some(c=>c.rarity!=='ICON'))fail('OWNED','보유한 아이콘 2장을 선택하세요.',403);
 return {ownerId:Number(user.id),ownerName:user.nickname,pet,cards:selection.cardIds.map(id=>cards.find(c=>c.id===id)),mercenaries,seasonAttackBp:season.attackBp||0,avatarPowerPercent:equip.avatarPowerPercent||0,wornGearPower:equip.equipmentPve,equipmentBonus:Math.max(0,(equip.pve||0)-(equip.battleSuitPve||0)),vehicleTransit:equip.pveEquipmentRuntime?.vehicleTransit,equipmentSetVisual:equip.pveEquipmentRuntime?.equipmentSetVisual||null};
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
function requireReadyParty(members){
 if(members.length!==2||Number(members[0].id)===Number(members[1].id)||!members.every(m=>m.ready&&m.selection&&!m.left)){
  fail('READY','서로 다른 두 참가자가 편성을 마치고 준비해야 출전할 수 있습니다.');
 }
}
async function eligibleUsers(env,r,policy){
 const rows=(await stmt(env.DB,"SELECT id,nickname,role,status FROM users WHERE id IN (?,?) AND status='ACTIVE'",...r.members.map(m=>m.id)).all()).results;
 const users=r.members.map(m=>rows.find(u=>Number(u.id)===m.id));if(users.some(u=>!canAccessLegionHunt(policy,u)))fail('CLOSED','두 참가자 모두 군단토벌 이용이 가능해야 합니다.',403);
 return users;
}
async function paidEntryStatements(env,users,members,at,nextEntryAt,deps,cowHost,roomId,entryVersions){
 const db=env.DB;
 const balances=await Promise.all(users.map(async (u,index)=>{
  const k='legion_hunt_owner_session_v1:'+u.id;
  const entry=await readWithEntry(db,k,u.id,env,at),{value:old,deadline,storedDeadline,pulses,pulseRaw}=entry;
  const solo=old?JSON.parse(old):{};
  const activeSolo=solo.state&&!solo.state.ended&&!solo.state.receipt&&!solo.interruption&&solo.expiresAt>at;
  const ownerCoins=cowHost===null&&u.role==='OWNER'&&members[index].coins;
  const checks=[[k,old]],writes=[],locks=[];
  if(cowHost!==null){
   if(Number(u.id)===cowHost){await requireCowTicket(db,u.id,'party');writes.push(...spendCowTicket(db,u.id,'party',roomId));}
   return writes;
  }
  if(u.role!=='OWNER'){
   if(entry.party){if(entry.party.current<1)fail('COOLDOWN',u.nickname+'님의 파티 행동력이 부족합니다.');}
   else requireEntry(deadline,at,u.nickname);
   if(entry.party){
    const next={...entry.party,current:entry.party.current-1};
    members[index].nextEntryAt=next.current>0?null:next.nextRechargeAt;
    return [...guard(db,[k,old],[entryKey(u.id),storedDeadline],[EXTREME_PULSE_KEY,pulseRaw],[HIDEOUT_KEY(u.id),entry.hideoutRaw],[HIDEOUT_PARTY_ENERGY_KEY(u.id),entry.partyRaw]),put(db,HIDEOUT_PARTY_ENERGY_KEY(u.id),JSON.stringify(next)),put(db,entryKey(u.id),String(nextEntryAt)),put(db,entryPulseKey(u.id),String(pulses.at(-1)?.generation??0))];
   }
   members[index].nextEntryAt=nextEntryAt;
   checks.push([entryKey(u.id),storedDeadline],[EXTREME_PULSE_KEY,pulseRaw]);
   writes.push(put(db,entryKey(u.id),String(nextEntryAt)),put(db,entryPulseKey(u.id),String(pulses.at(-1)?.generation??0)));
  }
  if(activeSolo||ownerCoins){
   const support=await (deps.supportBenefits||readSupportBenefits)(env,u.id,at);
   let next=restoreExtremeLegionEnergy(solo,pulses,at,support,u);
   if(activeSolo)next=interruptedLegionRun(next,u,at,support,{keepCollected:true});
   if(ownerCoins){
    const e=legionHuntEntries(next,at,u,support);
    if(e.current<1)delete members[index].coins;
    else next={...next,energy:{version:1,current:e.current-1,maximum:e.maximum,updatedAt:e.updatedAt}};
   }
   if(next!==solo){
    if(cowHost!==null||u.role==='OWNER')checks.push([EXTREME_PULSE_KEY,pulseRaw]);
    // Reveal and pickup can update this row in another transaction. Lock it
    // before validating the snapshot and committing the two members together.
    if(old!==null&&db.dialect==='postgres')locks.push(stmt(db,'SELECT key FROM app_meta WHERE key=? FOR UPDATE',k));
    writes.push(put(db,k,JSON.stringify(next)));
   }
  }
  if(!writes.length&&cowHost===null)return [];
  for(const [key,value] of checks)entryVersions.set(key,value);
  return [...locks,...guard(db,...checks),...writes];
 }));return balances.flat();
}
async function change({action,b,env,user,deps,policy,policyRaw,citadel}){
 const db=env.DB,uid=Number(user.id),now=deps.now||Date.now;
 const who=userKey(uid),at=now();let id=b.id,prior;
 if(action==='create'){
  if(b.area!==undefined&&!['public',DOCKYARD.id,COW_AREA].includes(b.area))fail('AREA','토벌 전장을 확인하세요.',400);
  if(b.area===COW_AREA&&b.tier!=='throne')fail('TIER','카우방은 종말의 왕좌 기준으로 출전합니다.',400);
  if(b.area===DOCKYARD.id&&(b.tier??FIRST_TIER)!==FIRST_TIER)fail('TIER','클랜 원정 난이도를 확인하세요.',400);
  if(!tierById(Object.hasOwn(b,'tier')?b.tier:FIRST_TIER))fail('TIER','성채 난이도를 선택하세요.',400);
  if(typeof b.requestId!=='string'||!/^[a-zA-Z0-9_-]{12,80}$/.test(b.requestId))fail('INPUT','파티 개설 요청을 다시 보내세요.',400);
  id=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(tag+uid+':'+b.requestId)))).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');
 }else if(!idOK(id))fail('INPUT','파티 번호를 확인하세요.',400);
 const key=roomKey(id),old=await raw(db,key),r=old&&JSON.parse(old);
 const admission=entryActions.has(action);
 const area=action==='create'?(b.area??'public'):(r?.area||'public'),privateRaid=area===DOCKYARD.id,cow=area===COW_AREA;
 const entering=admission&&!(action==='loaded'&&r&&['ACTIVE','VICTORY','DEFEAT'].includes(phase(r,at)));
 let clan=null;
 const out=[],check=[],entryVersions=new Map();
 if(entering){
  if(privateRaid){
   if(policy.mode!=='ON')fail('CLOSED','군단토벌 정식 운영 중에 클랜 원정을 이용할 수 있습니다.',403);
   clan=await requireClanHideout(env,uid,DOCKYARD.stage,r);
   const ids=r&&['join','start','loaded'].includes(action)?[...new Set([uid,...r.members.map(m=>m.id)])]:[uid];
   await Promise.all(ids.filter(id=>id!==uid).map(id=>requireClanHideout(env,id,DOCKYARD.stage,clan)));
   check.push(...clanEntryGuards(db,ids,DOCKYARD.stage,clan));
  }else{requireOpen(citadel.policy);if(cow&&policy.mode!=='ON')fail('CLOSED','정식 군단토벌 운영 중에 카우방에 입장할 수 있습니다.',403);}
 }
 const pointer=['join','create','leave'].includes(action)?await current(db,uid,env,at):null;
 if(action==='create'||action==='join'){
  prior=pointer.r;
  if(prior&&prior.id!==id&&prior.members.some(m=>m.id===uid)&&phase(prior,at)!=='CANCELLED')fail('OTHER','현재 파티의 전리품을 정산하고 나간 뒤 참가하세요.');
  if(pointer.ptr!==id){check.push(...guard(db,[who,pointer.ptr]));out.push(put(db,who,id));}
  if(prior&&phase(prior,at)==='CANCELLED'&&prior.id!==id)out.push(del(db,listKey(prior)));
 }
 let room=r;
 if(action==='create'){
  if(r){if((r.area||'public')!==area||r.hostId!==uid||phase(r,at)!=='LOBBY'||pointer.ptr!==id||(r.tier??FIRST_TIER)!==(b.tier??FIRST_TIER))fail('OLD','이미 사용한 개설 요청입니다. 파티를 새로 만드세요.');return present(env,r,user,at);}
  if(cow)await requireCowTicket(db,uid,'party');
  else if(policy.mode==='ON'&&user.role!=='OWNER'){if(pointer.party){if(pointer.party.current<1)fail('COOLDOWN','파티 행동력이 부족합니다.');}else requireEntry(pointer.deadline,at,user.nickname);}
  room={id,...(cow?{area}:{}),...(clan?{area,clanId:clan.clanId,roundId:clan.roundId}:{}),hostId:uid,tier:b.tier??FIRST_TIER,phase:'LOBBY',expiresAt:at+900000,paying:policy.mode==='ON',members:[emptyMember(user)]};
 }else{
  if(!r){if(action==='claim'){const receipt=await raw(db,receiptKey(id,uid));if(receipt)return {...JSON.parse(receipt),serverNow:at};}fail('MISSING','파티가 종료되었거나 존재하지 않습니다.',404);}
  const status=phase(r,at),idx=r.members.findIndex(m=>m.id===uid),me=r.members[idx];
  if(action==='join'){
   if(status!=='LOBBY')fail('CLOSED','모집이 종료됐습니다.');
   if(!me){
    if(r.members.length!==1)fail('FULL','두 명이 모두 입장했습니다.');
    if(!cow&&r.paying&&user.role!=='OWNER'){if(pointer.party){if(pointer.party.current<1)fail('COOLDOWN','파티 행동력이 부족합니다.');}else requireEntry(pointer.deadline,at,user.nickname);}
    r.members.push(emptyMember(user));
   }
   else if(pointer.ptr===id)return present(env,r,user,at);
  }else{
   if(!me)fail('MEMBER','참가한 파티만 이용할 수 있습니다.',403);
   if(action==='ready'||action==='unready'){
    if(status!=='LOBBY')fail('LOCKED','출전 후 편성을 변경할 수 없습니다.');
    if(action==='ready'){const v=await verifySelection(env,user,b);me.selection=v.selection;me.summary=v.summary;}
    me.ready=action==='ready';
   }else if(action==='start'){
    if(uid!==r.hostId)fail('HOST','방장만 출전할 수 있습니다.',403);
    if(['ACTIVE','VICTORY','DEFEAT'].includes(status))return present(env,r,user,at);
    if(status!=='LOBBY'&&status!=='LOADING')fail('READY','모집 시간이 종료됐습니다. 파티를 다시 만드세요.');
    requireReadyParty(r.members);
    if(status==='LOADING')return present(env,r,user,at);
    const us=await eligibleUsers(env,r,policy);
    const tier=r.tier??FIRST_TIER,drops=citadel.policy.tierDrops[tier]??inheritedCitadelDrops(citadel.policy,tier);
    const [squads,loot,tickets]=await Promise.all([Promise.all(us.map((u,i)=>(deps.citadelSquad||loadSquad)(env,u,r.members[i].selection,deps))),(deps.citadelLoot||citadelLoot)(env,us,drops,tier,area),r.paying?Promise.all(us.map(u=>cowTicketOutcome(env,u.id,'LEGION_PARTY',id))):[]]);
    const built=buildCitadelBattle(squads,crypto.getRandomValues(new Uint32Array(1))[0],tier,area);
    const replayParts=[['header',built.replay],...built.chunks.map((v,i)=>[i,v])];
    for(const [part,v] of replayParts)out.push(put(db,replayKey(r.hostId)+':'+part,await saveReplay(v,id)));
    out.push(del(db,listKey(r)));
    for(let i=0;i<2;i++){
     r.members[i].coins=loot[i].coins;
     if(tickets[i])r.members[i].cowTicket=tickets[i];
     r.members[i].calamity=!!loot[i].calamity;
     out.push(put(db,farmKey(r.id,us[i].id),JSON.stringify(personalFarm(loot[i],built.kills,squads[i].pet?.magnet===true))));
    }
    Object.assign(r,{phase:'LOADING',expiresAt:now()+120000,won:built.won,resultReason:built.reason,kills:built.kills,duration:built.duration,parts:built.chunks.length});
   }else if(action==='loaded'){
    if(['ACTIVE','VICTORY','DEFEAT'].includes(status))return present(env,r,user,at);
    if(status!=='LOADING')fail('LOADING','전장 준비 시간이 종료됐습니다. 행동력은 차감되지 않습니다.');
    requireReadyParty(r.members);
    if(me.loaded)return present(env,r,user,at);me.loaded=true;
    if(r.members.every(m=>m.loaded)){
     const us=await eligibleUsers(env,r,policy);
     if(r.paying&&policy.mode!=='ON')fail('PAUSED','군단토벌 운영이 일시 중지됐습니다.',423);
     const confirmedAt=now();
     if(confirmedAt>=r.expiresAt)fail('LOADING','전장 준비 시간이 종료됐습니다. 행동력은 차감되지 않습니다.');
     r.startsAt=confirmedAt+1200;
     if(r.paying)out.push(...await paidEntryStatements(env,us,r.members,confirmedAt,r.startsAt+PARTY_ENTRY_INTERVAL_MS,deps,cow?r.hostId:null,id,entryVersions));
     if(r.paying){
      const blueprints=await Promise.all(us.map(()=>activeBlueprintDrop(env,drawBlueprintDrop('LEGION'),id)));
      for(const [i,blueprint] of blueprints.entries())if(blueprint)r.members[i].blueprintDrop=blueprint;
     }
     r.phase='ACTIVE';
    }
   }else if(action==='pickup'){
    if(typeof b.token!=='string'||b.token.length!==18)fail('TOKEN','내 전리품을 선택하세요.',400);
    const k=farmKey(id,uid),saved=await raw(db,k),farm=saved&&JSON.parse(saved);
    if(!farm||!farm.events.some(d=>d[4]===b.token))fail('TOKEN','내 전리품만 획득할 수 있습니다.',403);
    if(farm.picked.includes(b.token))return present(env,r,user,at);
    if(status!=='ACTIVE'||!collectCitadelPile(farm,b.token,at-r.startsAt))fail('EXPIRED','아직 떨어지지 않았거나 사라진 전리품입니다.');
    const result=await stmt(db,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?',JSON.stringify(farm),k,saved).run();
    if(Number(result.meta?.changes)!==1)fail('CONFLICT','개인 가방을 갱신 중입니다.');
    return present(env,r,user,at);
   }else if(action==='season'){
    if(!needsSeasonResult(env,r,at))return present(env,r,user,at);
   }else if(action==='claim'){
    if(!['VICTORY','DEFEAT'].includes(status))fail('EARLY','전투가 끝난 뒤 개인 전리품을 수령하세요.');
    if(me.claimed)return present(env,r,user,at);
    if(r.paying&&policy.mode!=='ON')fail('PAUSED','보상 지급이 재개된 후 수령하세요. 전리품은 보관됩니다.',423);
    const snapshot=await present(env,r,user,at);
    out.push(...await citadelGrantStatements(env,user,id,snapshot.drops,r.paying,snapshot.coins,me.calamity));me.claimed=true;
    out.push(put(db,receiptKey(id,uid),JSON.stringify({...snapshot,claimed:true,canClaim:false,ground:[]})));
   }else if(action==='leave'){
    if(pointer.ptr!==id){if(me.left)return null;fail('OTHER','현재 참가한 파티를 다시 확인하세요.');}
    if(status==='ACTIVE')fail('ACTIVE','전투가 진행 중입니다. 화면을 닫았다가 다시 입장할 수 있습니다.');
    if(['VICTORY','DEFEAT'].includes(status)&&!me.claimed&&(await present(env,r,user,at)).canClaim)fail('CLAIM','내 전리품을 먼저 수령하세요.');
    check.push(...guard(db,[who,id]));out.push(del(db,who));
    if(status==='LOBBY'&&uid!==r.hostId)r.members.splice(idx,1);
    else if(['LOADING','LOBBY','CANCELLED'].includes(status)){r.phase='CANCELLED';me.left=true;}
    else me.left=true;
   }
  }
 }
 const settle=needsSeasonResult(env,room,at)&&['season','claim','leave'].includes(action);
 if(settle){
  const members=room.members.map(m=>m.id).sort((a,b)=>a-b);
  const plans=await Promise.all(members.map(userId=>seasonAwardStatements(env,{userId,eventId:'CITADEL:'+room.id,source:'LEGION',
   startedAt:room.startsAt,settledAt:room.startsAt+room.duration,won:room.won})));
  for(const plan of plans)out.push(...plan);
  room.seasonSettled=true;
 }
 const st=phase(room,now());
 if(st==='LOBBY'&&room.members.length===1)out.push(put(db,listKey(room),JSON.stringify({id,host:room.members[0].name,tier:room.tier??FIRST_TIER,expiresAt:room.expiresAt})));
 else out.push(del(db,listKey(room)));
 // Keep one compressed replay per host. No replay reads on lobby polls.
 const finished=room.members.every(m=>m.left);
 if(finished)for(const m of room.members)out.push(del(db,farmKey(id,m.id)));
 out.push(finished?del(db,key):put(db,key,JSON.stringify(room)));
 const versions=[[key,old],[LEGION_HUNT_SETTINGS_KEY,policyRaw]];
 if(admission&&!privateRaid)versions.push([CITADEL_POLICY_KEY,citadel.raw]);
 const statements=[...guard(db,...versions),...check,...out];
 // Lock rows before checking the room version on PostgreSQL; no simulation in the transaction.
 if(db.dialect==='postgres'){
  if(admission&&!privateRaid)statements.unshift(stmt(db,'SELECT key FROM app_meta WHERE key=? FOR SHARE',CITADEL_POLICY_KEY));
  if(old!==null)statements.unshift(stmt(db,'SELECT key FROM app_meta WHERE key=? FOR UPDATE',key));
  const ids=action==='loaded'||settle?room.members.map(m=>m.id).sort((a,b)=>a-b):[uid];
  statements.unshift(stmt(db,'SELECT id FROM users WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id FOR UPDATE',...ids));
 }
 try{await db.batch(statements);}catch(error){
  if(entering&&privateRaid)await Promise.all(room.members.map(m=>requireClanHideout(env,m.id,DOCKYARD.stage,clan)));
  if(admission&&!privateRaid&&(await raw(db,CITADEL_POLICY_KEY))!==citadel.raw){requireOpen((await readCitadelPolicy(env)).policy);fail('SETTINGS_CHANGED','성채 설정이 변경됐습니다. 다시 시도하세요.');}
  if(await raw(db,key)!==old||pointer&&await raw(db,who)!==pointer.ptr)fail('CONFLICT','파티 상태가 변경됐습니다. 다시 시도하세요.');
  if(entryVersions.size&&(await Promise.all([...entryVersions].map(async([k,v])=>(await raw(db,k))!==v))).some(Boolean))fail('CONFLICT','출전 직전의 원정 진행 상황을 다시 확인합니다.');
  throw error;
 }
 return action==='leave'?null:present(env,room,user,now());
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
  const mutate=(action,b)=>deps.withUserMutationLock(env,user.id,path,async()=>{
   for(let i=0;;i++)try{return await change({action,b,env,user,deps,policy,policyRaw,citadel});}
   catch(e){if(e.code!=='CITADEL_CONFLICT'||i>=2)throw e;}
  });
  const resultState=r=>needsSeasonResult(env,r,at)&&r.members.some(m=>m.id===Number(user.id))?mutate('season',{id:r.id}):present(env,r,user,at);
  if(request.method==='GET'){
   if(action==='lobby'){
    const cowOpen=open&&policy.mode==='ON';
    const [here,list,hideout,cowRooms,cowTickets]=await Promise.all([current(DB,user.id,env,at),open?rooms(DB,at):[],clanHideout(env,user.id),cowOpen?rooms(DB,at,{area:COW_AREA}):[],cowOpen?cowTicketCount(DB,user.id,'party'):0]);
    const clanOpen=policy.mode==='ON'&&hideout.seasonOpen&&hideout.stage>=DOCKYARD.stage;
    const clanRooms=clanOpen?await rooms(DB,at,hideout):[];
    const state=here.r&&here.r.members.some(m=>m.id===Number(user.id))&&phase(here.r,at)!=='CANCELLED'?await resultState(here.r):null;
    const unlimited=user.role==='OWNER';
    const nextEntryAt=!unlimited&&policy.mode==='ON'?(here.party?(here.party.current>0?null:here.party.nextRechargeAt):entryDeadline(here.deadline)):null;
    return reply({ok:true,partyEnergy:here.party,open,cowOpen,cowRooms,cowTickets,clanOpen,clanHideout:hideout,clanRooms,tiers:citadelTierMenu,state,rooms:list,test:policy.mode!=='ON',unlimited,serverNow:at,partyRechargeHours:legionRechargeMs(PARTY_ENTRY_INTERVAL_MS,at)/3600000,recoveryEvent:legionRecoveryNotice(at)?LEGION_RECOVERY_EVENT:null,nextEntryAt:nextEntryAt>at?nextEntryAt:null});
   }
   if(action==='options'){
     if(new URL(request.url).searchParams.get('area')===DOCKYARD.id){if(policy.mode!=='ON')fail('CLOSED','군단토벌 일시 중지',403);await requireClanHideout(env,user.id,DOCKYARD.stage);}
     else requireOpen(citadel.policy);return reply({ok:true,...await (deps.citadelOptions||options)(env,user)});}
   if(!['state','battle','chunk'].includes(action))fail('PATH','존재하지 않는 메뉴입니다.',404);
   const id=new URL(request.url).searchParams.get('id');if(!idOK(id))fail('INPUT','파티 번호를 확인하세요.',400);
   const v=await raw(DB,roomKey(id));if(!v)fail('MISSING','종료된 파티입니다.',404);
   const r=JSON.parse(v),state=action==='state'?await resultState(r):await present(env,r,user,at);
   if(action!=='state'&&!['LOADING','ACTIVE'].includes(state.status))fail('EARLY','현재 재생할 전투가 없습니다.');
   if(action==='state')return reply({ok:true,open:r.area===DOCKYARD.id?policy.mode==='ON':open,state});
   if(state.status==='LOADING'){requireReadyParty(r.members);if(r.area===DOCKYARD.id)await requireClanHideout(env,user.id,DOCKYARD.stage,r);else requireOpen(citadel.policy);}
   const part=Number(new URL(request.url).searchParams.get('part')||0);
   if(!Number.isInteger(part)||part<0||part>=r.parts)fail('PART','전투 구간을 확인하세요.',400);
   if(action==='chunk')return reply({ok:true,chunk:await readReplay(DB,r,part)});
   const [replay,chunk]=await Promise.all([readReplay(DB,r),readReplay(DB,r,part)]);return reply({ok:true,state,replay,chunk,part});
  }
  if(request.method!=='POST'||!Object.hasOwn(fields,action))fail('METHOD','지원하지 않는 요청입니다.',405);
  const b=await readJointBody(request,{fields:fields[action],maxBytes:2048});
  return reply({ok:true,open,state:await mutate(action,b)});
 }catch(err){const known=/^(CITADEL|HUNT_COW_TICKET|CLAN|MERCENARY|COOP_SELECTION|JOINT)_?/.test(err.code||'');if(!known)console.error('[legion citadel]',err.name,err.code||'storage');return reply({ok:false,code:known?err.code:'CITADEL_RETRY',error:known?err.message:'파티 정보를 저장하거나 읽지 못했습니다. 같은 화면에서 다시 시도하세요.'},known?(err.status||400):503);}
}

