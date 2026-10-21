import {mercenaryFixture} from './mercenary-db.mjs';
import {MERCENARY_LEVEL_KEY,mercenaryLevelDraft,mercenaryGrowthDraft,planMercenaryBreakthrough} from '../../shared/mercenary-level-v1.mjs';
import {ensureMercenaryLevelSchema} from '../../functions/_mercenary_level_policy.js';
import {handleMercenaryLevel} from '../../functions/_mercenary_level.js';

export async function mercenaryPityFixture(t,postgres=false){
 const f=await mercenaryFixture(t,{postgres});await ensureMercenaryLevelSchema(f.env);
 const policy=mercenaryLevelDraft();policy.mode='ON';policy.revision=1;
 for(const k of Object.keys(policy.xpPerCard))policy.xpPerCard[k]=100;
 for(const r of policy.levels)r.requiredXp=300;
 for(const r of policy.milestones)Object.assign(r,{successChancePpm:100000,bonus:{type:'ATTACK_PERCENT',value:1}});
 policy.growth=mercenaryGrowthDraft();
 for(const k of Object.keys(policy.growth.perLevel))policy.growth.perLevel[k]=1;
 for(const r of policy.growth.milestones)for(const k of Object.keys(r))if(k!=='level')r[k]=1;
 await f.setting(MERCENARY_LEVEL_KEY,policy);
 for(const code of ['V-049','V-055','V-996'])await f.p('INSERT INTO user_mercenary_cards_v1(user_id,mercenary_code,total_copies,duplicate_count,first_obtained_at,last_obtained_at) VALUES(7,?,201,200,?,?)',code,'2026-10-16','2026-10-16').run();
 const setState=async(code,state,userId=7)=>f.p('INSERT INTO user_mercenary_levels_v1(user_id,mercenary_code,level,experience,breakthrough_mask,revision,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,mercenary_code) DO UPDATE SET level=excluded.level,experience=excluded.experience,breakthrough_mask=excluded.breakthrough_mask,revision=excluded.revision,updated_at=excluded.updated_at',userId,code,state.level,state.experience,state.breakthroughMask,state.revision,'2026-10-21').run();
 const call=async(action,body,userId=7)=>{
  const path='mercenaries/v3/leveling/'+action.split('?')[0];
  const response=await handleMercenaryLevel({path,request:new Request('https://test/api/mercenaries/v3/leveling/'+action,{method:body?'POST':'GET',headers:{authorization:'Bearer local-account-'+userId,'content-type':'application/json',origin:'https://test'},...(body?{body:JSON.stringify(body)}:{})}),env:f.env,deps:f.deps});
  return {status:response.status,body:await response.json()};
 };
 return {...f,policy,setState,call};
}

// Pre-pity completed receipts. The absence of pity fields is deliberate.
export async function seedLegacyFailures(f,{code='V-049',level=5,count=10,userId=7,startRevision=0,status='COMPLETED',mode='ON'}={}){
 const index=[5,10,15,20].indexOf(level),mask=(1<<index)-1,target={code,rank:'SSS'},plans=[];
 for(let i=0;i<count;i++){
  const before={level,experience:code==='V-996'?1500:300,breakthroughMask:mask,revision:startRevision+i*2};
  const result=planMercenaryBreakthrough({policy:f.policy,state:before,target,roll:999999});delete result.pity;
  const plan={version:f.policy.version,action:'BREAKTHROUGH',mercenaryCode:code,rank:'SSS',policyRevision:1,policyRaw:JSON.stringify({...f.policy,mode}),cmsRevision:0,result,createdAt:'2026-10-17T00:00:00.000Z'};
  const id=crypto.randomUUID();
  await f.p('INSERT INTO joint_operations_v1(request_id,user_id,kind,input_hash,plan_json,status,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?)',id,userId,'MERCENARY_LEVEL_V1','legacy-'+id,JSON.stringify(plan),status,plan.createdAt,status==='COMPLETED'?plan.createdAt:null).run();
  plans.push({requestId:id,plan});
 }
 const state={level,experience:code==='V-996'?1500:300,breakthroughMask:mask,revision:startRevision+count*2};
 await f.setState(code,state,userId);return {state,plans};
}
