import {jointGuard,jointGuardEnd,ensureJointAtomicSchema} from './_joint_atomic.js';
import {prepareApocalypseRewards} from './_apocalypse_rewards.js';

const PREFIX='apocalypse_battle_v2:',WINDOW_MS=6000,GRACE_MS=1000,LEASE_MS=20000,RETENTION_MS=20*60*1000;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status,code:'APOCALYPSE_CHALLENGE'});};
const integer=(value,max)=>value==null||value===''?null:Math.max(0,Math.min(max,Math.floor(Number(value)||0)));
export function normalizeApocalypseBonus(raw={}){
  raw=raw&&typeof raw==='object'?raw:{};
  return {coinPercent:integer(raw.coinPercent,1000),masterStars:integer(raw.masterStars,1000000),mysticEnergy:integer(raw.mysticEnergy,10000)};
}
export function validateApocalypseRequestId(requestId){
  if(!/^[A-Za-z0-9:_.-]{8,120}$/.test(String(requestId||'')))fail('전투 요청 번호를 확인하세요.',400);
  return String(requestId);
}
const keyFor=(userId,requestId)=>PREFIX+userId+':'+validateApocalypseRequestId(requestId);
const terminal=s=>['CLAIMED','FAILED'].includes(s.status);
const snapshot=state=>({version:2,requestId:state.requestId,monsterId:state.monsterId,windowMs:WINDOW_MS,
  status:state.status,safeZone:state.status==='OPEN'?state.safeZone:undefined,openedAt:state.openedAt||null,expiresAt:state.expiresAt,
  finishAfter:state.finishAfter||null,success:state.success===true,reason:state.reason||null,
  ...(terminal(state)?{settlement:state.settlement,replayed:true}:{})});
async function read(env,userId,requestId){
  const key=keyFor(userId,requestId),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row)fail('저장된 아포칼립스 전투를 찾지 못했습니다.',404);
  const state=JSON.parse(row.value);if(state.userId!==Number(userId))fail('본인의 전투만 확인할 수 있습니다.',403);
  return {key,raw:row.value,state};
}
export async function reserveApocalypseBattle(env,{userId,requestId,monsterId,runToken},now=Date.now()){
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(String(runToken||'')))fail('새로고침 후 아포칼립스 전투를 시작하세요.',400);
  const state={version:2,userId:Number(userId),requestId,monsterId:Number(monsterId),runToken,status:'PREPARING',createdAt:now,leaseUntil:now+60000,expiresAt:now+RETENTION_MS};
  const inserted=await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(keyFor(userId,requestId),JSON.stringify(state)).run();
  if(!Number(inserted.meta?.changes))fail('이미 시작한 전투입니다. 같은 전투에 행동력을 다시 사용하지 않습니다.');
}
export async function registerApocalypseChallenge(env,{userId,requestId,runToken,monsterId,won,battleV2,plan,log},now=Date.now()){
  const {key,raw,state}=await read(env,userId,requestId);
  if(state.runToken!==runToken||state.monsterId!==Number(monsterId)||state.status!=='PREPARING')fail('중단된 전투입니다. 클리어와 보상을 받을 수 없습니다.');
  const playbackMinMs=Math.min(30000,Math.max(1000,(battleV2?.result?.timeline?.length||1)*80));
  const storedBattle=battleV2?{...battleV2,result:{...battleV2.result,timeline:[]}}:null;
  const next={...state,status:'READY',won:won===true,battleV2:storedBattle,playbackMinMs,plan,log,safeZone:crypto.getRandomValues(new Uint32Array(1))[0]%3,leaseUntil:now+60000};
  const changed=await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),key,raw).run();
  if(!Number(changed.meta?.changes))fail('전투 준비가 중단되었습니다.');
  return snapshot(next);
}
export function apocalypseWipeBattle(battle){
  if(!battle)return null;
  const copy=structuredClone(battle),team=copy.teams?.A||{},opponent=copy.teams?.B||{};
  const fighters=Array.isArray(team)?team:team.fighters||team.cards||[];
  const enemies=Array.isArray(opponent)?opponent:opponent.fighters||opponent.cards||[];
  const a=fighters.length?[...fighters,...(team.mercenaries||[])]:copy.result?.final?.A||[],b=enemies.length?[...enemies,...(opponent.mercenaries||[])]:copy.result?.final?.B||[];
  const fallen=a.map(c=>({...c,hp:0,alive:false}));
  copy.result={...copy.result,actions:0,damageBreakdown:{cards:0,support:0,battleSuit:0,ultimate:0,total:0},winner:'B',reason:'APOCALYPSE_MECHANIC_FAILED',final:{A:fallen,B:b.map(c=>({...c,hp:Number(c.maxHp||c.hp||1),alive:true}))},
    timeline:a.map(c=>({type:'KO',targetId:c.id||c.cardId,targetSide:'A',label:'충격파 · 전멸'})),
    supports:{A:(copy.result?.supports?.A||team.supports||[]).map(c=>({...c,hp:0,alive:false,actions:0,damageDealt:0})),B:copy.result?.supports?.B||[]}};
  return copy;
}
function defeat(state,reason){return {result:'LOSE',reward:0,battleSuitDamage:0,totalBattleDamage:0,effectiveBattleDamage:0,damageBreakdown:{cards:0,support:0,battleSuit:0,ultimate:0,total:0},cardReward:null,equipmentReward:null,blackMiracleReward:null,magicReward:null,unifiedDrop:null,cowPortal:null,apocalypseBonus:{rewards:{coin:0,masterStars:0,mysticEnergy:0}},apocalypseFailure:reason,battleV2:apocalypseWipeBattle(state.battleV2)};}
async function commitTerminal(env,user,{key,raw,state},next,statements=[]){
  await ensureJointAtomicSchema(env);
  const token=crypto.randomUUID(),serialized=JSON.stringify({...next,token}),writes=[
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(serialized,key,raw),
    jointGuard(env.DB,token,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,serialized]),...statements];
  if(state.log)writes.push(env.DB.prepare('INSERT INTO battle_logs(user_id,monster_id,deck_cards,player_power,monster_power,result,reward_coin) VALUES(?,?,?,?,?,?,?)').bind(user.id,state.monsterId,JSON.stringify(state.log.ids),state.log.playerPower,state.log.monsterPower,next.settlement.result,next.settlement.reward));
  writes.push(jointGuardEnd(env.DB,token));
  try{await env.DB.batch(writes)}catch(error){const latest=(await read(env,user.id,state.requestId)).state;if(terminal(latest))return snapshot(latest);throw error;}
  return {...snapshot({...next,token}),replayed:false};
}
export async function apocalypseChallengeAction(env,user,action,body,now=Date.now(),prepareRewards=prepareApocalypseRewards){
  if(!['open','answer','pulse','claim','abandon','status'].includes(action))fail('지원하지 않는 공략 요청입니다.',404);
  for(let attempt=0;attempt<5;attempt++){
    const row=await read(env,user.id,body.requestId),{key,raw,state}=row;
    if(terminal(state))return snapshot(state);
    // Shared pending IDs are visible to other tabs. Only the original page's
    // in-memory nonce may actively cancel a live attempt; status expires stale runs.
    if(action==='abandon'&&body.runToken!==state.runToken)fail('전투를 시작한 화면에서만 중단할 수 있습니다.');
    const expired=now>state.expiresAt||now>state.leaseUntil;
    const missed=state.status==='OPEN'&&now>state.openedAt+WINDOW_MS+GRACE_MS;
    if(action==='abandon'||expired||missed){
      const reason=action==='abandon'?'ABANDONED':missed?'MECHANIC_FAILED':'DISCONNECTED';
      return commitTerminal(env,user,row,{...state,status:'FAILED',success:false,reason,settlement:defeat(state,reason),completedAt:now});
    }
    if(action==='status')return snapshot(state);
    if(body.runToken!==state.runToken)fail('전투 화면이 바뀌었습니다. 이전 전투는 클리어할 수 없습니다.');
    const next={...state,leaseUntil:now+LEASE_MS};
    if(action==='pulse'){
      // Lease only. Never accept browser supplied results or rewards.
    }else if(action==='open'){
      if(state.status!=='READY')return snapshot(state);
      next.status='OPEN';next.openedAt=now;
      next.finishAfter=now+WINDOW_MS+state.playbackMinMs;
    }else if(action==='answer'){
      if(state.status==='ANSWERED')return snapshot(state);
      if(state.status!=='OPEN')fail('공략을 먼저 시작하세요.');
      if(!Number.isInteger(body.zone)||body.zone< -1||body.zone>2)fail('이동할 구역을 확인하세요.',400);
      next.success=body.zone===state.safeZone&&now<=state.openedAt+WINDOW_MS+GRACE_MS;
      if(!next.success)return commitTerminal(env,user,row,{...next,status:'FAILED',reason:'MECHANIC_FAILED',settlement:defeat(state,'MECHANIC_FAILED'),completedAt:now});
      next.status='ANSWERED';
    }else if(action==='claim'){
      if(state.status!=='ANSWERED'||state.success!==true)fail('회피 기믹을 먼저 성공해야 합니다.');
      if(now<state.finishAfter||body.played!==true)fail('전투가 끝난 뒤 결과를 확인하세요.');
      const grant=await prepareRewards(env,user,state,now);
      return commitTerminal(env,user,row,{...next,status:'CLAIMED',completedAt:now,settlement:grant.patch},grant.statements);
    }
    const changed=await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(JSON.stringify(next),key,raw).run();
    if(Number(changed.meta?.changes))return snapshot(next);
  }
  fail('공략 결과를 저장 중입니다. 같은 전투에서 다시 확인하세요.');
}
