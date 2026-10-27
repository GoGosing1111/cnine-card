import {CLASSIC_RULES,CLASSIC_KEYS,CLASSIC_GRADES,classicError as fail,classicId,classicUserId,classicRoomKey,classicResultKey,classicUserKey,classicSettings,classicPhase,classicActive,classicEligibleCard,classicLoadout,classicArticle} from '../shared/classic-colosseum-v1.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {createPvpBattleV2} from './_battle_v2_preview.js';
import {magicSettings,MAGIC_BATTLE_EFFECTS} from './_magic.js';

const p=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const iso=now=>new Date(now).toISOString();
const blankUser=()=>({roomId:null,invitation:null,results:[]});
const decode=row=>row?JSON.parse(row.value):null;
async function read(env,key){return decode(await p(env,'SELECT value FROM app_meta WHERE key=?',key).first());}
async function readMany(env,keys){
 const unique=[...new Set(keys)],rows=(await p(env,`SELECT key,value FROM app_meta WHERE key IN (${unique.map(()=>'?').join(',')})`,...unique).all()).results||[];
 return new Map(unique.map(key=>[key,decode(rows.find(r=>r.key===key))]));
}
// Existing app_meta primary keys and the existing atomic-guard table are used.
// No HTTP-time DDL, inventory grants, global match lock, or schema migration.
async function write(env,before,changes,audit=null){
 const keys=[...before.keys()].sort(),token=crypto.randomUUID(),stmts=[];
 for(const key of keys)stmts.push(p(env,"INSERT INTO app_meta(key,value) VALUES(?,'null') ON CONFLICT(key) DO NOTHING",key));
 if(env.DB.dialect==='postgres')stmts.push(p(env,`SELECT key FROM app_meta WHERE key IN (${keys.map(()=>'?').join(',')}) ORDER BY key FOR UPDATE`,...keys));
 stmts.push(jointGuard(env.DB,token,keys.map(()=> 'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)').join(' AND '),keys.flatMap(key=>[key,JSON.stringify(before.get(key)??null)])));
 for(const [key,value] of changes){
  if(!before.has(key))throw Error('CLASSIC_UNGUARDED_WRITE');
  stmts.push(p(env,'UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(value),key));
 }
 if(audit)stmts.push(p(env,'INSERT INTO admin_logs(admin_id,action_type,target_type,target_id,before_data,after_data) VALUES(?,?,?,?,?,?)',audit.userId,audit.action,'CLASSIC_COLOSSEUM',audit.id||CLASSIC_KEYS.settings,null,JSON.stringify(audit.detail||{})));
 stmts.push(jointGuardEnd(env.DB,token));
 try{await env.DB.batch(stmts);}catch(error){
  const fresh=await readMany(env,keys);
  if(keys.some(key=>JSON.stringify(fresh.get(key)??null)!==JSON.stringify(before.get(key)??null)))throw fail('CONFLICT','다른 창에서 상태가 변경됐습니다. 새로 불러온 뒤 다시 진행하세요.');
  throw error;
 }
}
function activeUser(user,now){return user&&String(user.status||'ACTIVE')==='ACTIVE'&&(!user.banned_until||Date.parse(String(user.banned_until).replace(' ','T')+(String(user.banned_until).match(/Z|[+]\d\d:\d\d$/)?'':'Z'))<=now);}
function participant(room,user){const i=room.players.findIndex(row=>row.id===Number(user.id));if(i<0)throw fail('ACCESS','초대받은 경기만 참가할 수 있습니다.',403);return i;}
function summary(room,settings,user,now){
 if(!room)return null;
 const complete=classicPhase(room,settings,now)==='COMPLETED';
 return {id:room.id,revision:room.revision,status:classicPhase(room,settings,now),createdAt:room.createdAt,expiresAt:room.expiresAt,createdBy:room.createdBy,winnerId:room.winnerId||null,article:room.article||null,players:room.players.map(row=>({id:row.id,nickname:row.nickname,accepted:row.accepted,ready:row.ready,...(row.id===Number(user.id)||complete?{loadout:row.loadout||null}:{}),hasLoadout:!!row.loadout})),canManage:user.role==='OWNER'};
}
function requireOpen(settings){if(!settings.enabled)throw fail('OFF','클래식 멸망전은 현재 운영 OFF입니다.');}
function revision(room,body){if(body.revision!==room.revision)throw fail('CONFLICT','편성이 갱신됐습니다. 새로 불러온 뒤 다시 진행하세요.');}
async function roomState(env,id,user,now,allowOwner=false){
 const key=classicRoomKey(id),values=await readMany(env,[key,CLASSIC_KEYS.settings]),room=values.get(key),settings=classicSettings(values.get(CLASSIC_KEYS.settings));
 if(!room)throw fail('NOT_FOUND','경기를 찾을 수 없습니다.',404);
 if(!allowOwner||user.role!=='OWNER')participant(room,user);
 return {key,values,room,settings};
}
export async function classicNotifications(env,userId,now=Date.now()){
 const key=classicUserKey(userId),values=await readMany(env,[CLASSIC_KEYS.settings,key]),settings=classicSettings(values.get(CLASSIC_KEYS.settings)),state=values.get(key)||blankUser();
 const invitation=state.invitation&&settings.enabled&&state.invitation.epoch===settings.epoch&&Date.parse(state.invitation.expiresAt)>now?state.invitation:null;
 return {invitation,results:(state.results||[]).slice(-10),enabled:settings.enabled};
}
export async function classicCatalog(env,deps){
 const grades=CLASSIC_GRADES.map(()=>'?').join(',');
 const [cardRows,magicRows,settings,magic]=await Promise.all([
  p(env,`SELECT c.id,c.title,c.rarity,c.power_type,c.base_power,c.image_url AS image,c.is_active,c.card_status,m.name FROM cards_effective_v1210 c LEFT JOIN members m ON m.id=c.member_id WHERE c.is_active=1 AND c.rarity IN (${grades}) AND COALESCE(c.card_status,'PUBLIC')='PUBLIC' ORDER BY c.rarity,c.id LIMIT 2001`,...CLASSIC_GRADES).all(),
  p(env,'SELECT id,code,name,image_url,effect_type,effect_value,max_activations FROM magic_cards WHERE is_active=1 AND scope_pvp=1 ORDER BY sort_order,id LIMIT 101').all(),
  deps.battleSettings(env),magicSettings(env)
 ]);
 if(cardRows.results.length>2000||magicRows.results.length>100)throw fail('CATALOG_LIMIT','대여 목록이 처리 범위를 초과했습니다.',503);
 const chance=Math.max(0,Math.min(100,Number(magic.enhancement.triggerRates[9]||0)));
 return {rules:CLASSIC_RULES,cards:cardRows.results.filter(classicEligibleCard).map(c=>({...c,id:String(c.id),enhancementLevel:10,breakthrough_level:10,power:deps.cardBattlePower(c,10,settings)})),magic:magicRows.results.filter(row=>MAGIC_BATTLE_EFFECTS.includes(row.effect_type)).map(row=>({id:Number(row.id),code:row.code,name:row.name,image:row.image_url,imageUrl:row.image_url,effectType:row.effect_type,effectValue:Math.max(0,Math.min(500,Number(row.effect_value)||0)),maxActivations:Math.max(1,Math.min(99,Number(row.max_activations)||1)),triggerChance:chance,enhancementLevel:10})),magicRule:'전용 +10 대여 · 발동률은 현재 마법카드 최상위 강화 기준',singleHealerBonus:deps.battleEngineState?.(settings,{role:'USER'})?.singleHealerBonus||{}};
}
async function rentalSnapshots(env,deps,inputs,catalog=undefined){
 catalog??=await classicCatalog(env,deps);const decks=inputs.map(input=>{const loadout=classicLoadout(input,catalog);return {loadout,cards:loadout.cardIds.map(id=>catalog.cards.find(c=>c.id===id))};});
 // Synthetic identity deliberately cannot acquire account advancement, pet,
 // trophy, avatar, vehicle, title, owned-card or personal equipment bonuses.
 const unique=await deps.cardUniqueDeckStates(env,decks.map(({cards})=>({user:{id:0,role:'USER'},cards})),'PVP',{fresh:true,batched:true});
 return decks.map(({loadout,cards},index)=>{const effects=new Map((unique[index]?.cards||[]).map(c=>[String(c.id),c.uniqueAbility||null]));return {loadout,cards:cards.map(c=>({...c,uniqueAbility:effects.get(c.id)||null,uniqueAdvancement:null})),magicCards:loadout.magicCardIds.map((id,i)=>({...catalog.magic.find(c=>c.id===id),slotNo:i+1})),singleHealerBonus:catalog.singleHealerBonus};});
}
async function status(env,user,now){
 const key=classicUserKey(user.id),values=await readMany(env,[CLASSIC_KEYS.settings,key]),settings=classicSettings(values.get(CLASSIC_KEYS.settings)),mine=values.get(key)||blankUser(),room=mine.roomId?await read(env,classicRoomKey(mine.roomId)):null;
 return {settings,rules:CLASSIC_RULES,user:{id:Number(user.id),nickname:user.nickname,canManage:user.role==='OWNER'},room:summary(room,settings,user,now),serverNow:iso(now)};
}
async function adminSettings(env,user,body,now){
 if(typeof body.enabled!=='boolean'||!Number.isSafeInteger(body.revision))throw fail('SETTINGS','운영 상태를 확인하세요.',400);
 const key=CLASSIC_KEYS.settings,before=await readMany(env,[key]),old=classicSettings(before.get(key));
 if(body.revision!==old.revision)throw fail('CONFLICT','운영 설정이 변경됐습니다. 다시 불러오세요.');
 const next={enabled:body.enabled,revision:old.revision+1,epoch:old.epoch+(old.enabled&&!body.enabled?1:0),updatedAt:iso(now)};
 await write(env,before,new Map([[key,next]]),{userId:user.id,action:'CLASSIC_SETTINGS',detail:next});return {settings:next};
}
async function invite(env,user,body,now){
 const id=classicId(body.requestId),a=classicUserId(body.userA),b=classicUserId(body.userB);if(a===b)throw fail('PAIR','서로 다른 두 참가자를 선택하세요.',400);
 const key=classicRoomKey(id),existing=await read(env,key);
 if(existing){if(existing.createdBy!==Number(user.id)||existing.players[0].id!==a||existing.players[1].id!==b)throw fail('REQUEST_CONFLICT','같은 요청 번호에 다른 초대가 있습니다.');return {room:summary(existing,classicSettings(await read(env,CLASSIC_KEYS.settings)),user,now),replayed:true};}
 const keys=[key,CLASSIC_KEYS.settings,CLASSIC_KEYS.rooms,classicUserKey(a),classicUserKey(b)],before=await readMany(env,keys),settings=classicSettings(before.get(CLASSIC_KEYS.settings));requireOpen(settings);
 if(before.get(key))throw fail('CONFLICT','동일한 초대를 처리 중입니다. 같은 요청으로 다시 확인하세요.');
 const users=(await p(env,'SELECT id,nickname,status,banned_until FROM users WHERE id IN (?,?)',a,b).all()).results;
 if(users.length!==2||users.some(u=>!activeUser(u,now)))throw fail('USER','참가 가능한 계정 두 명을 선택하세요.',400);
 const states=[a,b].map(id=>before.get(classicUserKey(id))||blankUser());
 const previousIds=[...new Set(states.map(s=>s.roomId).filter(Boolean))];
 const previous=previousIds.length?await readMany(env,previousIds.map(classicRoomKey)):new Map();
 if([...previous.values()].some(r=>classicActive(r,settings,now)))throw fail('BUSY','참가자가 이미 다른 초대 또는 경기에 참여 중입니다.');
 const room={id,revision:0,status:'INVITED',epoch:settings.epoch,createdAt:iso(now),expiresAt:iso(now+30*60000),createdBy:Number(user.id),seed:crypto.getRandomValues(new Uint32Array(1))[0],players:[a,b].map(id=>({id,nickname:users.find(u=>Number(u.id)===id).nickname,accepted:false,ready:false,loadout:null,snapshot:null})),rules:CLASSIC_RULES};
 const entries=before.get(CLASSIC_KEYS.rooms)||[],activeEntries=entries.filter(r=>r.epoch===settings.epoch&&Date.parse(r.expiresAt)>now&&['INVITED','SETUP','READY','FIGHTING'].includes(r.status)),activeIds=new Set(activeEntries.map(r=>r.id));
 if(activeEntries.length>=30)throw fail('ROOM_LIMIT','진행 중인 경기는 최대 30개입니다. 기존 경기를 마친 뒤 초대하세요.');
 const changes=new Map([[key,room],[CLASSIC_KEYS.rooms,[{id,epoch:room.epoch,expiresAt:room.expiresAt,status:room.status},...activeEntries,...entries.filter(r=>!activeIds.has(r.id))].slice(0,60)]]);
 room.players.forEach((player,i)=>changes.set(classicUserKey(player.id),{...states[i],roomId:id,invitation:{matchId:id,epoch:room.epoch,expiresAt:room.expiresAt,opponentName:room.players[1-i].nickname,operatorName:user.nickname},results:states[i].results||[]}));
 await write(env,before,changes,{userId:user.id,action:'CLASSIC_INVITE',id,detail:{userA:a,userB:b}});return {room:summary(room,settings,user,now)};
}
async function changeRoom(env,user,id,body,action,deps,now){
 const {key,values,room,settings}=await roomState(env,id,user,now,action==='cancel'),i=room.players.findIndex(row=>row.id===Number(user.id)),phase=classicPhase(room,settings,now);
 if(action==='ready'&&['READY','FIGHTING','COMPLETED'].includes(phase))return finish(env,user,id,deps,now);
 if(!classicActive(room,settings,now))throw fail('CLOSED','이미 종료되었거나 만료된 초대입니다.');
 revision(room,body);const next=structuredClone(room),changes=new Map(),extra=[];
 if(action==='accept'||action==='decline'){
  if(phase!=='INVITED')throw fail('STATE','이미 초대 응답이 끝난 경기입니다.');
  if(action==='accept'){next.players[i].accepted=true;if(next.players.every(p=>p.accepted))next.status='SETUP';}
  else next.status='DECLINED';
  extra.push(...room.players.map(p=>classicUserKey(p.id)));
 }else if(action==='loadout'){
  if(phase!=='SETUP'||!next.players[i].accepted)throw fail('STATE','두 참가자가 초대를 수락한 뒤 편성할 수 있습니다.');
  const [snapshot]=await rentalSnapshots(env,deps,[body.loadout]);next.players[i]={...next.players[i],loadout:snapshot.loadout,snapshot,ready:false};
 }else if(action==='ready'){
  if(phase!=='SETUP'||!next.players[i].snapshot)throw fail('LOADOUT','카드 5장을 대여 편성한 뒤 준비하세요.');
  next.players[i].ready=true;if(next.players.every(p=>p.ready))next.status='READY';
 }else if(action==='cancel'){
  if(user.role!=='OWNER')throw fail('ACCESS','운영자만 경기를 취소할 수 있습니다.',403);
  next.status='CANCELLED';extra.push(...room.players.map(p=>classicUserKey(p.id)));
 }else throw fail('ROUTE','지원하지 않는 요청입니다.',405);
 if(extra.length){const states=await readMany(env,extra);for(const [k,v]of states){values.set(k,v);if(action!=='accept'||k===classicUserKey(user.id))changes.set(k,{...(v||blankUser()),invitation:null});}}
 if(['DECLINED','CANCELLED'].includes(next.status)){const k=CLASSIC_KEYS.rooms,v=await read(env,k);values.set(k,v);changes.set(k,(v||[]).map(r=>r.id===id?{...r,status:next.status}:r));}
 next.revision++;changes.set(key,next);
 await write(env,values,changes,action==='cancel'?{userId:user.id,action:'CLASSIC_CANCEL',id}:null);
 return next.status==='READY'?finish(env,user,id,deps,now):{room:summary(next,settings,user,now)};
}
async function finish(env,user,id,deps,now){
 let {key,values,room,settings}=await roomState(env,id,user,now),phase=classicPhase(room,settings,now);
 if(phase==='COMPLETED')return {room:summary(room,settings,user,now)};
 if(!['READY','FIGHTING'].includes(phase))throw fail('STATE','두 참가자의 준비가 끝나야 전투가 시작됩니다.');
 if(phase==='FIGHTING'&&Date.parse(room.leaseUntil)>now)return {room:summary(room,settings,user,now),retryAfterMs:3000};
 const token=crypto.randomUUID();
 // Both entrants receive exactly the same catalog/policy snapshot. The frozen
 // input survives retries and future catalog changes after the battle begins.
 let input=room.input;
 if(!input){try{input=await rentalSnapshots(env,deps,room.players.map(p=>p.loadout));}catch(error){if(error.code==='CLASSIC_RENTAL_ONLY'){const reopened={...room,status:'SETUP',revision:room.revision+1,players:room.players.map(p=>({...p,ready:false}))};await write(env,values,new Map([[key,reopened]]));throw fail('RENTAL_CHANGED','대여 목록이 변경되었습니다. 편성을 다시 저장한 뒤 준비하세요.');}throw error;}}
 const claimed={...room,input,status:'FIGHTING',revision:room.revision+1,lease:token,leaseUntil:iso(now+30000)};
 await write(env,values,new Map([[key,claimed]]));room=claimed;
 const [a,b]=room.input,battle=createPvpBattleV2({attackerCards:a.cards,defenderCards:b.cards,attackerMagicCards:a.magicCards,defenderMagicCards:b.magicCards,attackerEquipmentBonus:0,defenderEquipmentBonus:0,singleHealerBonus:a.singleHealerBonus,seed:room.seed});
 const at=iso(deps.now?.()??Date.now()),article=classicArticle(room,battle,at),keys=[key,CLASSIC_KEYS.settings,CLASSIC_KEYS.news,CLASSIC_KEYS.rooms,classicResultKey(id),...room.players.map(p=>classicUserKey(p.id))],before=await readMany(env,keys),current=before.get(key),cfg=classicSettings(before.get(CLASSIC_KEYS.settings));
 if(current.status==='COMPLETED')return {room:summary(current,cfg,user,now)};
 if(current.status!=='FIGHTING')throw fail('CLOSED','운영자가 취소한 경기입니다.');
 if(!cfg.enabled||cfg.epoch!==room.epoch)throw fail('OFF','운영이 중지되어 대전을 취소했습니다.');
 if(current.lease!==token)throw fail('CONFLICT','다른 요청에서 경기 결과를 확정하고 있습니다.');
 const completed={...current,status:'COMPLETED',revision:current.revision+1,completedAt:at,winnerId:article.winnerId,article};delete completed.lease;delete completed.leaseUntil;
 const data={matchId:id,battleV2:battle,sceneAssetKey:'CLASSIC_COLOSSEUM',attackerName:room.players[0].nickname,defenderName:room.players[1].nickname,article,players:room.players.map(p=>({id:p.id,nickname:p.nickname})),rental:true};
 const changes=new Map([[key,completed],[classicResultKey(id),data],[CLASSIC_KEYS.news,[article,...(before.get(CLASSIC_KEYS.news)||[]).filter(n=>n.id!==id)].slice(0,100)],[CLASSIC_KEYS.rooms,(before.get(CLASSIC_KEYS.rooms)||[]).map(r=>r.id===id?{...r,status:'COMPLETED'}:r)]]);
 for(const player of room.players){const k=classicUserKey(player.id),state=before.get(k)||blankUser();changes.set(k,{...state,invitation:null,results:[...(state.results||[]).filter(r=>r.matchId!==id),{matchId:id,loss:player.id===article.loserId,article}].slice(-10)});}
 await write(env,before,changes);return {room:summary(completed,cfg,user,now)};
}
export async function handleClassicColosseum({path,request,env,deps}){
 const admin=path.startsWith('admin/classic-colosseum');if(!admin&&!path.startsWith('classic-colosseum/'))return null;
 try{
  const user=await deps.authenticate(request,env),now=deps.now?.()??Date.now();if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  if(!activeUser(user,now))throw fail('ACCOUNT','참가 가능한 계정이 아닙니다.',403);
  if(admin&&user.role!=='OWNER')throw fail('ACCESS','운영자만 설정하거나 초대할 수 있습니다.',403);
  const action=path.replace(admin?'admin/classic-colosseum':'classic-colosseum','').replace(/^\//,''),url=new URL(request.url),body=request.method==='GET'?{}:await deps.readBody(request);let data;
  if(admin&&action==='settings'&&request.method==='POST')data=await adminSettings(env,user,body,now);
  else if(admin&&action==='invite'&&request.method==='POST')data=await invite(env,user,body,now);
  else if(admin&&action==='users'&&request.method==='GET'){
   const q=(url.searchParams.get('q')||'').trim().slice(0,40);if(!q)throw fail('SEARCH','닉네임 또는 ID를 입력하세요.',400);
   const escaped=q.replace(/[\\%_]/g,c=>'\\'+c);data={users:(await p(env,"SELECT id,nickname FROM users WHERE status='ACTIVE' AND (id=? OR nickname LIKE ? ESCAPE '\\') ORDER BY id LIMIT 20",Number.isSafeInteger(Number(q))?Number(q):0,'%'+escaped+'%').all()).results};
  }else if(admin&&action==='rooms'&&request.method==='GET'){
   const v=await readMany(env,[CLASSIC_KEYS.settings,CLASSIC_KEYS.rooms]),list=v.get(CLASSIC_KEYS.rooms)||[],rooms=list.length?await readMany(env,list.map(r=>classicRoomKey(r.id))):new Map();data={settings:classicSettings(v.get(CLASSIC_KEYS.settings)),rooms:[...rooms.values()].filter(Boolean).map(r=>summary(r,classicSettings(v.get(CLASSIC_KEYS.settings)),user,now))};
  }else if(!admin&&action==='status'&&request.method==='GET')data=await status(env,user,now);
  else if(!admin&&action==='catalog'&&request.method==='GET'){const catalog=await classicCatalog(env,deps);data={rules:catalog.rules,cards:catalog.cards,magic:catalog.magic,magicRule:catalog.magicRule};}
  else if(!admin&&action==='news'&&request.method==='GET'){const page=Math.max(0,Math.min(9,Math.floor(Number(url.searchParams.get('page'))||0))),all=await read(env,CLASSIC_KEYS.news)||[];data={articles:all.slice(page*10,page*10+10),page,hasMore:all.length>(page+1)*10};}
  else if(!admin&&action==='ack'&&request.method==='POST'){
   const id=classicId(body.matchId),key=classicUserKey(user.id),before=await readMany(env,[key]),state=before.get(key)||blankUser();await write(env,before,new Map([[key,{...state,results:(state.results||[]).filter(r=>r.matchId!==id)}]]));data={ok:true};
  }else if(!admin&&action==='replay'&&request.method==='GET'){
   const id=classicId(url.searchParams.get('id'));await roomState(env,id,user,now,true);data=await read(env,classicResultKey(id));if(!data)throw fail('RESULT_PENDING','결과를 확정하고 있습니다. 잠시 후 다시 확인하세요.');
  }else if(!admin&&action==='recover'&&request.method==='POST')data=await finish(env,user,classicId(body.matchId),deps,now);
  else if(request.method==='POST'&&((!admin&&['accept','decline','loadout','ready'].includes(action))||(admin&&action==='cancel')))data=await changeRoom(env,user,classicId(body.matchId),body,action,deps,now);
  else throw fail('ROUTE','지원하지 않는 요청입니다.',405);
  return deps.json(data);
 }catch(error){const known=String(error.code||'').startsWith('CLASSIC_');if(!known)console.error('[classic-colosseum]',error?.code||'INTERNAL',error?.message);return deps.json({error:known?error.message:'클래식 멸망전 요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.',code:known?error.code:'CLASSIC_INTERNAL'},known?error.status:500);}
}
