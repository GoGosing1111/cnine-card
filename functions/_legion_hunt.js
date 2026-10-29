import {readCollectionBonuses} from './_collection_bonuses.js';
import {rewardDropWithBonus} from '../shared/collection-bonuses-v1.mjs';
import {createHuntSession,restoreHuntSession,DIFFICULTIES} from '../preview/sustained-hunt-v2/session.mjs';
import {loadScrapyardV3Snapshot} from './_scrapyard_v3.js';
import {legionHuntAccess,canAccessLegionHunt,legionHuntCatalog,legionHuntTestUsers,searchLegionHuntTestUsers,readLegionHuntPolicy,saveLegionHuntPolicy} from './_legion_hunt_settings.js';
import {claimLegionHuntReward,settleLegionHuntRewards} from './_legion_hunt_rewards.js';
import {readJointBody,jointError,jointResponseError} from './_joint_request.js';
import {contentEnergy,LEGION_ENERGY_MAXIMUM} from '../shared/content-energy-v1.mjs';
import {legionHuntEnergyView} from '../shared/legion-hunt-energy-v1.mjs';
import {readMiracleDropPercent,applyMiracleDropChance} from './_miracle_burning.js';
import {readRegionPolicy,saveRegionPolicy,regionAccess,regionBootstrap,regionRewardCatalog,publicRegionHuntPayload} from './_legion_regions.js';
import {regionalDifficulty,regionById} from '../shared/legion-regions-v1.mjs';
import {readSupportBenefits} from './_supporter_benefits.js';
import {SUPPORT_PLAN} from '../shared/server-support-v1.mjs';
import {LEGION_COIN_CAPS,createLegionCoins,legionCoinSummary} from '../shared/legion-hunt-coins-v1.mjs';
import {saveLegionCoinProgress} from './_legion_hunt_coins.js';
import {readMartialLaw} from './_martial_law.js';
const TTL=30*60*1000;
const ACTIONS={start:['difficulty','version','regionId'],begin:['id'],reveal:['id','seq','seqs'],claim:['id','dropId','token','x','y'],finish:['id','seq'],cancel:['id'],recover:[]};
export function legionHuntEnergy(run,at,support=null,user=null){
  const bonus=support?.active&&support.startsAt<=at&&support.endsAt>at?SUPPORT_PLAN.extraLegionEntries:0,maximum=LEGION_ENERGY_MAXIMUM+bonus;
  const day=new Date(at+9*3600000).toISOString().slice(0,10),legacy=user?.role==='OWNER'?run?.coinDaily:run?.daily;
  const used=legacy?.day===day?Number(legacy.used):0;
  if(!Number.isSafeInteger(used)||used<0||used>LEGION_ENERGY_MAXIMUM+SUPPORT_PLAN.extraLegionEntries)throw jointError('HUNT_ENTRIES_UNAVAILABLE','행동력 기록을 확인할 수 없습니다.',503);
  return legionHuntEnergyView(run?.energy,{at,maximum,initial:Math.max(0,maximum-used)});
}
export function legionHuntEntries(run,at,user,support=null){
  const energy=legionHuntEnergy(run,at,support,user),unlimited=user?.role==='OWNER';
  return {...energy,unlimited,limit:unlimited?null:energy.maximum,remaining:unlimited?null:energy.current,...(energy.maximum>LEGION_ENERGY_MAXIMUM?{supporterBonus:SUPPORT_PLAN.extraLegionEntries}:{})};
}
function requireEntry(entries){
  if(!entries.unlimited&&entries.current<=0)throw jointError('HUNT_ENERGY_EMPTY','행동력이 부족합니다. 3시간마다 1회 충전됩니다.',409);
}
function coinEntries(run,at,support,user){return legionHuntEnergy(run,at,support,user);}
function requireAccess(policy,user){
  const access=legionHuntAccess(policy);
  if(!access.ownerEnabled)throw jointError('HUNT_CLOSED','군단토벌은 현재 운영하지 않습니다.',423);
  if(!canAccessLegionHunt(policy,user))throw jointError('HUNT_TEST_ONLY','군단토벌은 지정된 테스트 참여자만 이용할 수 있습니다.',403);
  return access;
}
async function accountSnapshot(env,user,deps){
  try{return await loadScrapyardV3Snapshot(env,user,deps);}
  catch(error){
    if(error.code==='SCRAPYARD_V3_DECK'||/덱|보유하지 않은/.test(error.message||''))throw jointError('HUNT_DECK','저장된 PVE 덱 5장을 확인해 주세요. 편성을 저장한 뒤 다시 불러오세요.',409);
    throw error;
  }
}
const idValid=id=>typeof id==='string'&&/^[0-9a-f-]{36}$/.test(id);
async function loadRun(env,key){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!row)return {raw:null,run:null};
  try{return {raw:row.value,run:JSON.parse(row.value)};}catch{throw jointError('HUNT_SESSION_UNAVAILABLE','원정 기록을 읽을 수 없습니다. 다시 출전하세요.',503);}
}
async function saveRun(env,key,before,run){
  const raw=JSON.stringify(run);
  const statement=before===null?env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(key,raw):
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,key,before);
  if(Number((await statement.run()).meta?.changes)!==1)throw jointError('HUNT_SESSION_CONFLICT','다른 요청을 처리 중입니다. 같은 요청으로 다시 시도하세요.',409);
  return {raw,run};
}
async function settleRun(env,user,{key,before,policyRaw,access}){
  if(!before.run.liveRewards){
    const saved=await saveRun(env,key,before.raw,{...before.run,rewardStatus:'SETTLED'});
    return {saved,result:saved.run.state.receipt};
  }
  if(!access.liveRewards)throw jointError('HUNT_REWARD_PAUSED','보상 지급이 일시 중지됐습니다. 종료 기록은 보관되며 재개 후 정산됩니다.',423);
  let regionPolicyRaw=null;
  if(before.run.state.policy.regionId){const current=await readRegionPolicy(env);if(current.policy.mode!=='ON')throw jointError('HUNT_REWARD_PAUSED','지역 보상 지급이 일시 중지됐습니다. 원정 기록은 보관됩니다.',423);regionPolicyRaw=current.raw;}
  const result=await settleLegionHuntRewards(env,user,{key,before:before.raw,run:before.run,policyRaw,regionPolicyRaw});
  return {saved:await loadRun(env,key),result};
}
// Entering the lobby/start of a new run abandons only an unfinished expedition.
// A persisted finish intent always settles first, even after a lost reply or TTL.
async function recoverRun(env,user,{key,before,policyRaw,access,at,support}){
  const run=before.run,state=run?.state;
  if(!state)return {saved:before,recovery:null};
  if(run.rewardTiming==='FINISH'&&state.receipt&&run.rewardStatus!=='SETTLED'){
    const settled=await settleRun(env,user,{key,before,policyRaw,access});
    return {...settled,recovery:{kind:'SETTLED',receipt:settled.result}};
  }
  if(state.receipt)return {saved:before,recovery:null};
  const hasCoins=Number(run.coins?.paid||0)>0;
  if(hasCoins&&run.rewardTiming==='FINISH'&&state.startedAt!=null){
    // A paid run consumes its entry, so retain its already collected bag too.
    // Use only the persisted acknowledgement/items: reconnect must not roll
    // unseen drops, advance combat, or credit coins a second time. This also
    // repairs the old interrupted record while that record still exists.
    const session=restoreHuntSession({...state,ended:false},{now:()=>at});
    Object.assign(session.finish(state.lastAck,{collectedOnly:true}),{
      previewOnly:run.liveRewards!==true,liveRewards:false,
      entries:legionHuntEntries(run,at,user,support),...legionCoinSummary(run.coins)
    });
    const pending={...run,entry:{...run.entry,status:'CONSUMED'},rewardStatus:'PENDING',finishRequestedAt:at,state:session.exportState()};
    const saved=await saveRun(env,key,before.raw,pending);
    const settled=await settleRun(env,user,{key,before:saved,policyRaw,access});
    return {...settled,recovery:{kind:'SETTLED',receipt:settled.result}};
  }
  if(run.interruption)return {saved:before,recovery:null};
  const charged=run.entry?run.entry.charged:state.startedAt!=null&&user.role!=='OWNER';
  const day=run.entry?.day||(state.startedAt!=null?new Date(state.startedAt+9*3600000).toISOString().slice(0,10):null);
  const refund=!hasCoins&&charged&&run.daily?.day===day&&Number(run.daily.used)>0;
  const daily=refund?{...run.daily,used:run.daily.used-1}:run.daily;
  const coinRefund=!hasCoins&&run.entry?.coinCharged&&run.coinDaily?.day===run.entry.coinDay&&run.coinDaily.used>0;
  const coinDaily=coinRefund?{...run.coinDaily,used:run.coinDaily.used-1}:run.coinDaily;
  const balance=legionHuntEnergy(run,at,support,user);
  const energyRefund=!hasCoins&&(run.entry?.energyCharged??(charged||run.entry?.coinCharged));
  const energy=contentEnergy({...balance,current:Math.min(balance.maximum,balance.current+(energyRefund?1:0))},{at,maximum:balance.maximum});
  const interruption={id:state.id,kind:'INTERRUPTED',at,refunded:!!energyRefund,day,...legionCoinSummary(run.coins)};
  const saved=await saveRun(env,key,before.raw,{...run,daily,coinDaily,energy,entry:{...run.entry,charged:!!charged,day,status:hasCoins?'CONSUMED':'REFUNDED'},interruption,state:{...state,ended:true}});
  return {saved,recovery:interruption};
}
export async function handleLegionHunt({path,request,env,deps}){
  if(!path.startsWith('legion-hunt/')&&!['admin/legion-hunt','admin/legion-hunt/test-users','admin/legion-hunt/regions'].includes(path))return null;
  const json=deps.json;
  try{
    const user=await deps.authenticate(request,env);
    if(!user)throw jointError('JOINT_AUTH','로그인이 필요합니다.',401);
    if(path==='admin/legion-hunt'||path==='admin/legion-hunt/test-users'||path==='admin/legion-hunt/regions'){
      if(user.role!=='OWNER')throw jointError('JOINT_PERMISSION','운영 설정은 OWNER만 변경할 수 있습니다.',403);
      if(path==='admin/legion-hunt/regions'){
        if(request.method==='GET'){const [{policy},catalog]=await Promise.all([readRegionPolicy(env),legionHuntCatalog(env)]);return json({ok:true,policy,catalog,...regionBootstrap({...policy,mode:'TEST'},user),mode:policy.mode});}
        if(request.method!=='PATCH')return json({error:'지원하지 않는 요청입니다.'},405);
        const body=await readJointBody(request,{maxBytes:655360,fields:['policy']});
        return json({ok:true,policy:await deps.withUserMutationLock(env,user.id,path,()=>saveRegionPolicy(env,user,body.policy))});
      }
      if(path==='admin/legion-hunt/test-users'){
        if(request.method!=='GET')return json({error:'지원하지 않는 요청입니다.'},405);
        return json({ok:true,users:await searchLegionHuntTestUsers(env,new URL(request.url).searchParams.get('q'))});
      }
      if(request.method==='GET'){
        const [{policy},catalog]=await Promise.all([readLegionHuntPolicy(env),legionHuntCatalog(env)]);
        return json({ok:true,access:legionHuntAccess(policy),policy,catalog,coinCaps:LEGION_COIN_CAPS,testUsers:await legionHuntTestUsers(env,policy.testUserIds)});
      }
      if(request.method!=='PATCH')return json({error:'지원하지 않는 요청입니다.'},405);
      const body=await readJointBody(request,{maxBytes:131072,fields:['policy']});
      const policy=await deps.withUserMutationLock(env,user.id,path,()=>saveLegionHuntPolicy(env,user,body.policy));
      return json({ok:true,access:legionHuntAccess(policy),policy});
    }
    const action=path.slice('legion-hunt/'.length);
    const now=deps.now||Date.now,key='legion_hunt_owner_session_v1:'+Number(user.id);
    if(action==='status'&&request.method==='GET'){
      const {policy}=await readLegionHuntPolicy(env);
      return json({ok:true,access:legionHuntAccess(policy),canEnter:canAccessLegionHunt(policy,user)});
    }
    if(action==='bootstrap'&&request.method==='GET'){
      const {policy}=await readLegionHuntPolicy(env),access=requireAccess(policy,user);
      const support=await readSupportBenefits(env,user.id,now());
      const saved=await deps.withUserMutationLock(env,user.id,path,async()=>{
        const current=await loadRun(env,key);
        if(current.run?.energy)return current;
        const energy=legionHuntEnergy(current.run,now(),support,user);
        return saveRun(env,key,current.raw,{...current.run,energy});
      });
      let loadout=null,loadoutError=null;
      try{loadout=await accountSnapshot(env,user,deps);}catch(error){if(error.code!=='HUNT_DECK')throw error;loadoutError=error.message;}
      const regional=await readRegionPolicy(env);
      return json({ok:true,access,difficulties:DIFFICULTIES,regionExpansion:regionBootstrap(regional.policy,user,regionAccess(regional.policy,user)?await regionRewardCatalog(env):[]),entries:legionHuntEntries(saved.run,now(),user,support),coinEntries:coinEntries(saved.run,now(),support,user),coinCaps:LEGION_COIN_CAPS,loadout,loadoutError,revision:policy.revision,activeItems:policy.items.filter(i=>i.enabled&&i.weight>0).length});
    }
    if(!Object.hasOwn(ACTIONS,action))return json({error:'군단토벌 경로를 확인하세요.'},404);
    if(request.method!=='POST')return json({error:'지원하지 않는 요청입니다.'},405);
    const body=await readJointBody(request,{maxBytes:4096,fields:ACTIONS[action]});
    if(action==='start'&&!(body.regionId?regionById(body.regionId)&&regionalDifficulty(body.difficulty):DIFFICULTIES.some(d=>d.id===body.difficulty)))throw jointError('HUNT_SELECTION','지역과 난이도를 선택하세요.');
    if(action==='start'&&!(body.regionId?body.version===5:[4,5].includes(body.version)))throw jointError('HUNT_CLIENT_UPDATE','군단토벌이 개선됐습니다. 게임을 새로고침한 뒤 입장하세요.',409);
    if(!['start','recover'].includes(action)&&!idValid(body.id))throw jointError('HUNT_SESSION','원정 번호를 확인하세요.');
    return json(await deps.withUserMutationLock(env,user.id,path,async()=>{
      const {policy,raw:policyRaw}=await readLegionHuntPolicy(env),access=action==='recover'?legionHuntAccess(policy):requireAccess(policy,user);
      let before=await loadRun(env,key),recovery=null;
      const support=['start','begin','recover','cancel','finish'].includes(action)?await readSupportBenefits(env,user.id,now()):null;
      if(action==='recover'||action==='start'){
        const recovered=await recoverRun(env,user,{key,before,policyRaw,access,at:now(),support});before=recovered.saved;recovery=recovered.recovery;
      }
      if(!before.run?.energy&&['start','begin','recover','cancel','finish'].includes(action))before=await saveRun(env,key,before.raw,{...before.run,energy:legionHuntEnergy(before.run,now(),support,user)});
      const entries=legionHuntEntries(before.run,now(),user,support);
      if(action==='recover')return {ok:true,recovery,entries};
      if(action==='start'){
        requireEntry(entries);
        let regionPolicy=null,regionDifficulty=null;
        if(body.regionId){regionPolicy=(await readRegionPolicy(env)).policy;if(!regionAccess(regionPolicy,user)||!regionPolicy.regions.find(r=>r.id===body.regionId)?.enabled)throw jointError('HUNT_REGION_CLOSED','선택한 지역은 현재 이용할 수 없습니다.',403);regionDifficulty=regionPolicy.difficulties.find(d=>d.id===body.difficulty);}
        const d=regionDifficulty||policy.difficulties.find(r=>r.id===body.difficulty);
        if(!d)throw jointError('HUNT_POLICY_UNAVAILABLE','난이도별 드랍 설정을 확인하세요.',503);
        const snapshot=await accountSnapshot(env,user,deps);
        const [miracleDropPercent,collection,martialLaw]=await Promise.all([readMiracleDropPercent(env),readCollectionBonuses(env,user.id),readMartialLaw(env,{now:now()})]);
        const collectionPercent=collection.totals.dropPercent;
        const paying=access.liveRewards&&(!regionPolicy||regionPolicy.mode==='ON');
        const coins=createLegionCoins(body.regionId,body.difficulty,{live:paying,bonusPercent:collection.totals.coinPercent,martialLaw:martialLaw.enabled});
        const regionLoot=regionDifficulty?{...regionDifficulty.loot}:null;
        if(regionLoot)for(const key of ['stonePercent','eliteStonePercent','eliteSetPercent','bossSetPercent','bossUniquePercent'])regionLoot[key]=rewardDropWithBonus(applyMiracleDropChance(regionLoot[key],miracleDropPercent),collectionPercent);
        const dropPolicy=regionPolicy?{regionLoot,dropLifeMs:regionLoot.lifetimeSeconds*1000,items:await regionRewardCatalog(env,{live:paying,ascendant:regionPolicy.ascendantDrops?.enabled===true})}:{dropChance:rewardDropWithBonus(applyMiracleDropChance(d.dropPercent,miracleDropPercent),collectionPercent)/100,bossDropChance:rewardDropWithBonus(applyMiracleDropChance(d.bossDropPercent,miracleDropPercent),collectionPercent)/100,dropLifeMs:d.lifetimeSeconds*1000,items:policy.items};
        if(regionPolicy?.ascendantDrops?.enabled){
          dropPolicy.ascendantDrops=regionPolicy.ascendantDrops.tiers.map(row=>({tier:row.tier,bossPercent:rewardDropWithBonus(applyMiracleDropChance(100/row.expectedRuns,miracleDropPercent),collectionPercent)}));
        }
        const fieldDrops=regionPolicy?.regions.find(r=>r.id===body.regionId)?.fieldDrops;
        if(fieldDrops){
          const field=fieldDrops.difficulties.find(r=>r.id===body.difficulty);
          dropPolicy.fieldDrops={items:fieldDrops.items,dropChance:rewardDropWithBonus(applyMiracleDropChance(field.dropPercent,miracleDropPercent),collectionPercent)/100,bossDropChance:rewardDropWithBonus(applyMiracleDropChance(field.bossDropPercent,miracleDropPercent),collectionPercent)/100};
          dropPolicy.dropLifeMs=field.lifetimeSeconds*1000;
        }
        dropPolicy.coinCap=coins.cap;
        const session=(deps.createSession||createHuntSession)({snapshot,...body,regionDifficulty,now,dropPolicy});
        await saveRun(env,key,before.raw,{daily:before.run?.daily||null,coinDaily:before.run?.coinDaily||null,energy:legionHuntEnergy(before.run,now(),support,user),coins,expiresAt:now()+TTL,configRevision:policy.revision,regionRevision:regionPolicy?.revision??null,liveRewards:paying,rewardTiming:'FINISH',entry:{charged:false,status:'READY'},state:session.exportState()});
        return {ok:true,id:session.id,payload:publicRegionHuntPayload(session.payload),entries,...legionCoinSummary(coins),access:{...access,liveRewards:paying,...(regionPolicy&&!paying?{mode:'TEST'}:{})},recovery,configRevision:policy.revision};
      }
      if(!before.run||before.run.state?.id!==body.id)throw jointError('HUNT_SESSION_EXPIRED','원정이 만료됐습니다. 입장 화면에서 복구 후 다시 출전하세요.',409);
      if(action==='cancel'){
        const recovered=await recoverRun(env,user,{key,before,policyRaw,access,at:now(),support});
        return {cancelled:!recovered.saved.run.state.receipt,recovery:recovered.recovery,entries:legionHuntEntries(recovered.saved.run,now(),user,support)};
      }
      if(before.run.state.receipt){
        if(action==='finish')return before.run.rewardTiming==='FINISH'&&before.run.rewardStatus!=='SETTLED'?(await settleRun(env,user,{key,before,policyRaw,access})).result:before.run.state.receipt;
        throw jointError('HUNT_ENDED','이미 종료된 원정입니다.',409);
      }
      if(before.run.interruption||before.run.expiresAt<=now())throw jointError('HUNT_SESSION_EXPIRED','원정이 중단됐습니다. 입장 화면에서 행동력을 복구해 주세요.',409);
      const session=restoreHuntSession(before.run.state,{now});
      let result;
      if(action==='begin'){
        if(before.run.state.startedAt===null&&!before.run.state.ended){
          requireEntry(entries);
          const balance=legionHuntEnergy(before.run,now(),support,user);
          const coinEligible=!!(before.run.coins?.live&&access.liveRewards&&balance.current>0);
          const charged=!entries.unlimited||coinEligible;
          before.run.energy=contentEnergy({...balance,current:balance.current-(charged?1:0)},{at:now(),maximum:balance.maximum});
          before.run.entry={charged:!entries.unlimited,energyCharged:charged,status:'RESERVED'};
          if(before.run.coins)before.run.coins.eligible=coinEligible;
        }
        result={...session.begin(),entries:legionHuntEntries(before.run,now(),user,support),...legionCoinSummary(before.run.coins)};
      }
      if(action==='reveal'){
        if(body.seqs!==undefined&&body.seq!==undefined)throw jointError('HUNT_DROP_BATCH','드랍 확인 요청을 다시 확인하세요.');
        if(before.run.state.magnet&&before.run.liveRewards&&!access.liveRewards)throw jointError('HUNT_REWARD_PAUSED','실계정 보상 지급이 중지됐습니다. 운영 모드를 확인해 주세요.',423);
        result=body.seqs!==undefined?session.revealMany(body.seqs):session.reveal(body.seq);
        if(before.run.state.magnet){result.pendingRewards=before.run.liveRewards===true;result.liveRewards=false;}
      }
      if(action==='claim'){
        result=session.claim(body);
        if(before.run.state.claims?.some(([id])=>id===body.dropId))return result;
        // TEST sessions never become paying sessions after an operator mode change.
        if(before.run.liveRewards===true){
          if(!access.liveRewards)throw jointError('HUNT_REWARD_PAUSED','실계정 보상 지급이 중지됐습니다. 운영 모드를 확인해 주세요.',423);
          if(before.run.rewardTiming!=='FINISH')return claimLegionHuntReward(env,user,{key,before:before.raw,run:{...before.run,state:session.exportState()},policyRaw,result});
          result.pendingRewards=true;
        }
        result.liveRewards=false;
      }
      if(action==='finish'){
        result=Object.assign(session.finish(body.seq),{previewOnly:before.run.liveRewards!==true,liveRewards:false,entries});
        if(before.run.rewardTiming==='FINISH'){
          const finished={...before.run,entry:{...before.run.entry,status:'CONSUMED'},rewardStatus:'PENDING',finishRequestedAt:now(),state:session.exportState()};
          before=(await saveLegionCoinProgress(env,user,{key,before:before.raw,run:finished,policyRaw,access,saveRun})).saved;
          return (await settleRun(env,user,{key,before,policyRaw,access})).result;
        }
        result.liveRewards=before.run.liveRewards===true;
      }
      const next={...before.run,state:session.exportState()};
      if(action==='reveal'||action==='finish'){
        const credited=await saveLegionCoinProgress(env,user,{key,before:before.raw,run:next,policyRaw,access,saveRun});
        Object.assign(result,credited.summary);
      }else await saveRun(env,key,before.raw,next);
      return result;
    }));
  }catch(error){
    if(error.code?.startsWith('HUNT_'))return json({ok:false,code:error.code,error:error.message},error.status||400);
    if(/^(?:HUNT_|INVALID_HUNT_|INVALID_DROP_|DROP_)[A-Z_]+$/.test(error.message||''))return json({ok:false,code:error.message,error:error.message},409);
    return jointResponseError(error,json);
  }
}
