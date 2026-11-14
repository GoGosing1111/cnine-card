// Growth grades are separate from the species cap. No production economy defaults.
export const PET_GRADES=Object.freeze(['C','B','A','S','SS','SSS']);
export const PET_STATS=Object.freeze(['attack','defense','hp','speed']);
export const PET_STAT_LABELS=Object.freeze({attack:'공격',defense:'방어',hp:'체력',speed:'속도'});
export const PET_TRAITS=Object.freeze({
 ASSAULT:{name:'맹공',effect:'ATTACK_PERCENT',description:'전투 시작에 공격을 지원합니다.',slug:'attack',target:'ALLY'},
 GUARD:{name:'수호',effect:'START_SHIELD_PERCENT',description:'전투 시작에 아군 보호막을 펼칩니다.',slug:'barrier',target:'ALLY'},
 VITALITY:{name:'생명',effect:'MAX_HP_PERCENT',description:'생명 파동으로 아군 체력을 지원합니다.',slug:'vitality',target:'ALLY'},
 HASTE:{name:'질주',effect:'SPEED_PERCENT',description:'번개와 바람으로 아군 속도를 지원합니다.',slug:'speed',target:'ALLY'},
 HUNTER:{name:'사냥꾼',effect:'BOSS_DAMAGE_PERCENT',description:'사냥 표식으로 PvE 보스 공략을 지원합니다.',slug:'hunter',target:'BOSS'},
 LUCK:{name:'행운',effect:'REWARD_BONUS_PERCENT',description:'PvE 전투 콘텐츠의 코인 보상을 높입니다.',slug:'luck',target:'ALLY'}
});
export class PetGrowthError extends Error{constructor(code,message){super(message);this.code=code;}}
export function gradeIndex(grade){const index=PET_GRADES.indexOf(grade);if(index<0)throw new PetGrowthError('INVALID_GRADE','능력치 등급을 확인해 주세요.');return index;}
export function gradePool(cap,weights){
 const max=gradeIndex(cap);
 if(!weights||PET_GRADES.some(g=>!Number.isSafeInteger(weights[g])||weights[g]<0))throw new PetGrowthError('INVALID_POLICY','등급별 확률 설정을 확인해 주세요.');
 const entries=PET_GRADES.slice(0,max+1).map(grade=>({grade,weight:weights[grade]}));
 const total=entries.reduce((n,row)=>n+row.weight,0);
 if(!Number.isSafeInteger(total)||total<1||total>0x100000000)throw new PetGrowthError('INVALID_POLICY','추첨 가능한 확률이 없습니다.');
 return {entries,total};
}
export function secureRandomInt(total){
 if(!Number.isSafeInteger(total)||total<1||total>0x100000000)throw new RangeError('Invalid random range');
 const limit=Math.floor(0x100000000/total)*total,word=new Uint32Array(1);
 do{globalThis.crypto.getRandomValues(word);}while(word[0]>=limit);
 return word[0]%total;
}
export function rollGrade(cap,weights,randomInt=secureRandomInt){
 const {entries,total}=gradePool(cap,weights);let ticket=randomInt(total);
 if(!Number.isSafeInteger(ticket)||ticket<0||ticket>=total)throw new Error('Invalid random ticket');
 for(const row of entries){if(ticket<row.weight)return row.grade;ticket-=row.weight;}
 throw new Error('Unreachable random result');
}
export function rollStats(cap,weights,randomInt=secureRandomInt){
 return Object.fromEntries(PET_STATS.map(key=>[key,rollGrade(cap,weights,randomInt)]));
}
export function perfectProbability(cap,weights){const {entries,total}=gradePool(cap,weights);return (entries.at(-1).weight/total)**PET_STATS.length;}
export function validateInstance(instance){
 if(!instance||typeof instance.id!=='string'||typeof instance.petCode!=='string')throw new PetGrowthError('INVALID_INSTANCE','펫 개체를 확인해 주세요.');
 const max=gradeIndex(instance.cap);
 if(!instance.stats||PET_STATS.some(key=>gradeIndex(instance.stats[key])>max))throw new PetGrowthError('CAP_EXCEEDED','펫의 성장 상한을 초과했습니다.');
 if(!PET_TRAITS[instance.trait?.id]||gradeIndex(instance.trait.grade)>max)throw new PetGrowthError('INVALID_TRAIT','펫 특성 설정을 확인해 주세요.');
 return instance;
}
export function validateRequest(request){
 const commands=['ROLL_STATS','ROLL_TRAIT','KEEP','APPLY','EQUIP'];
 if(!request||!commands.includes(request.command)||typeof request.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(request.requestId)||!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0)
  throw new PetGrowthError('INVALID_REQUEST','요청 정보를 확인해 주세요.');
 const expected=['command','expectedRevision','requestId',...(['ROLL_STATS','ROLL_TRAIT','EQUIP'].includes(request.command)?['instanceId']:['pendingId']),...(request.command==='EQUIP'?['mode']:[])].sort();
 if(Object.keys(request).sort().join(',')!==expected.join(','))throw new PetGrowthError('INVALID_REQUEST','서버에서 추첨한 결과만 적용할 수 있습니다.');
 if(request.command==='EQUIP'&&!['PVE','PVP'].includes(request.mode))throw new PetGrowthError('INVALID_MODE','편성 모드를 확인해 주세요.');
}
function signature(request){return JSON.stringify(Object.fromEntries(Object.keys(request).sort().map(key=>[key,request[key]])));}
function fail(code,message){throw new PetGrowthError(code,message);}
export function applyGrowthRequest(original,request,policy,{randomInt=secureRandomInt,now=Date.now()}={}){
 validateRequest(request);
 const previous=original.receipts?.[request.requestId],fingerprint=signature(request);
 if(previous){if(previous.fingerprint!==fingerprint)fail('REQUEST_REUSED','같은 요청 번호에 다른 내용을 사용할 수 없습니다.');return {state:original,receipt:previous,replayed:true};}
 if(!policy?.enabled)fail('DISABLED','펫 성장 기능을 준비 중입니다.');
 if(request.expectedRevision!==original.revision)fail('STALE_REVISION','펫 정보가 변경됐습니다. 새로고침해 주세요.');
 const state=structuredClone(original);
 const owned=id=>{const pet=state.instances.find(row=>row.id===id);if(!pet)fail('NOT_OWNED','보유한 펫 개체를 선택해 주세요.');validateInstance(pet);if(pet.expiresAt&&pet.expiresAt<=now)fail('EXPIRED','기간제 펫의 이용 기간이 종료됐습니다.');return pet;};
 if(request.command.startsWith('ROLL_')){
  if(state.pending)fail('PENDING_RESULT','이전 주사위 결과를 먼저 선택해 주세요.');
  const pet=owned(request.instanceId),kind=request.command==='ROLL_STATS'?'stats':'trait',cost=policy.costs?.[kind];
  if(typeof cost==='object'&&cost){
   if(!/^\d+$/.test(String(cost.coin))||BigInt(cost.coin)<1n||!Number.isSafeInteger(cost.masterStars)||cost.masterStars<1)fail('INVALID_POLICY','재설정 비용을 확인해 주세요.');
   if(!/^\d+$/.test(String(state.wallet.coin))||BigInt(state.wallet.coin)<BigInt(cost.coin)||!Number.isSafeInteger(state.wallet.masterStars)||state.wallet.masterStars<cost.masterStars)fail('INSUFFICIENT','코인 또는 마스터의 별이 부족합니다.');
  }else{
   if(!Number.isSafeInteger(cost)||cost<1)fail('INVALID_POLICY','주사위 비용이 아직 설정되지 않았습니다.');
   if(!Number.isSafeInteger(state.wallet[kind])||state.wallet[kind]<cost)fail('INSUFFICIENT','주사위가 부족합니다.');
  }
  let candidate;
  if(kind==='stats')candidate=rollStats(pet.cap,policy.weights,randomInt);
  else{
   const candidates=policy.traitPools?.[pet.petCode];
   if(!Array.isArray(candidates)||!candidates.length||candidates.some(id=>!PET_TRAITS[id])||new Set(candidates).size!==candidates.length)fail('INVALID_POLICY','이 펫의 특성 후보가 설정되지 않았습니다.');
   const selected=randomInt(candidates.length);if(!Number.isSafeInteger(selected)||selected<0||selected>=candidates.length)throw new Error('Invalid trait random ticket');
   candidate={id:candidates[selected],grade:rollGrade(pet.cap,policy.weights,randomInt)};
  }
  if(typeof cost==='object'){state.wallet.coin=(BigInt(state.wallet.coin)-BigInt(cost.coin)).toString();state.wallet.masterStars-=cost.masterStars;}
  else state.wallet[kind]-=cost;
  state.pending={id:request.requestId,instanceId:pet.id,kind,before:structuredClone(kind==='stats'?pet.stats:pet.trait),candidate,policyRevision:policy.revision,createdAt:now};
 }else if(request.command==='KEEP'||request.command==='APPLY'){
  const pending=state.pending;
  if(!pending||pending.id!==request.pendingId)fail('NO_PENDING_RESULT','선택할 주사위 결과를 찾지 못했습니다.');
  if(request.command==='APPLY'){const pet=owned(pending.instanceId);if(pending.kind==='stats')pet.stats=structuredClone(pending.candidate);else pet.trait=structuredClone(pending.candidate);validateInstance(pet);}
  state.pending=null;
 }else{
  if(state.pending)fail('PENDING_RESULT','주사위 결과를 선택한 뒤 편성해 주세요.');
  const pet=owned(request.instanceId);
  if(pet.allowedModes&&!pet.allowedModes.includes(request.mode))fail('MODE_UNAVAILABLE','이 펫은 선택한 전투 모드에 편성할 수 없습니다.');
  state.loadouts[request.mode]=pet.id;
 }
 state.revision++;
 const receipt={requestId:request.requestId,fingerprint,command:request.command,revision:state.revision,createdAt:now};
 state.receipts={...state.receipts,[request.requestId]:receipt};
 return {state,receipt,replayed:false};
}
export function publicGrowthState(state){
 const {receipts,...publicState}=structuredClone(state);
 return publicState;
}
// Build once at battle start; later rerolls must never mutate an existing battle snapshot.
export function buildGrowthOpening(instance,{battleId,ownerId,mode,values,targetIds=[],bossTargetIds=[]}){
 validateInstance(instance);
 if(!['PVE','PVP'].includes(mode)||!battleId||!Number.isSafeInteger(ownerId))throw new Error('Invalid battle identity');
 const read=(type,grade)=>{const n=values?.[type]?.[grade];if(!Number.isFinite(n)||n<0)throw new Error('Combat values must be explicitly configured');return n;};
 const buffs=PET_STATS.map((key,i)=>({type:['ATTACK_PERCENT','DEFENSE_PERCENT','MAX_HP_PERCENT','SPEED_PERCENT'][i],percent:read(key,instance.stats[key])}));
 const trait=PET_TRAITS[instance.trait.id],active=instance.trait.activated!==false&&(trait.target!=='BOSS'||mode==='PVE'&&bossTargetIds.length>0);
 const percent=active?read(instance.trait.id,instance.trait.grade):0;
 return structuredClone({eventKey:JSON.stringify([battleId,ownerId,instance.id,'pet-opening-v2']),petCode:instance.petCode,instanceId:instance.id,ownerId,phase:'BATTLE_START',frequency:'ONCE_PER_BATTLE',buffs,
  petTrait:{...instance.trait,name:trait.name,effect:trait.effect,percent,active,targetIds:trait.target==='BOSS'?bossTargetIds:targetIds}});
}
