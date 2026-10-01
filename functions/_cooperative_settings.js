import {readJointBody,jointError} from './_joint_request.js';
import {defaultCoopSettings,validateCoopCombat,validateCoopEconomy} from '../shared/cooperative-settings-v1.mjs';
const KEY='cooperative_battleground_settings_v1';
const fail=(code,message,status=400)=>{throw jointError('COOP_'+code,message,status);};
function normalize(raw){
 const base=defaultCoopSettings(),v=raw?JSON.parse(raw):base;
 if(!['OFF','TEST','ON'].includes(v.mode)||!Array.isArray(v.testUserIds)||!Number.isSafeInteger(v.revision))fail('CONFIG','격전지 설정을 확인하지 못했습니다.',503);
 return {...v,rewardLocked:true,combat:v.combat?validateCoopCombat(v.combat):base.combat,economyDraft:v.economyDraft?validateCoopEconomy(v.economyDraft):base.economyDraft};
}
export async function coopSettings(env){const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first();return normalize(row?.value);}
async function testUsers(env,ids){return ids.length?(await env.DB.prepare('SELECT id,nickname FROM users WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id').bind(...ids).all()).results.map(u=>({id:Number(u.id),nickname:u.nickname})):[];}
export async function cooperativeAdmin({kind,request,env,deps,user,config}){
 if(user.role!=='OWNER')fail('OWNER','OWNER만 설정할 수 있습니다.',403);
 const respond=async settings=>deps.json({ok:true,settings,testUsers:await testUsers(env,settings.testUserIds)},200,{'cache-control':'no-store'});
 if(kind==='test-users'){
  if(request.method!=='GET')fail('METHOD','지원하지 않는 요청입니다.',405);
  const q=new URL(request.url).searchParams.get('q')?.trim();if(!q||q.length>80)fail('SEARCH','정확한 닉네임 또는 계정번호를 입력하세요.');
  const id=/^[1-9]\d{0,12}$/.test(q)?Number(q):0;
  const rows=await env.DB.prepare('SELECT id,nickname FROM users WHERE nickname=? OR id=? ORDER BY id LIMIT 20').bind(q,id).all();
  return deps.json({ok:true,users:rows.results.map(u=>({id:Number(u.id),nickname:u.nickname}))},200,{'cache-control':'no-store'});
 }
 if(request.method==='GET')return respond(config);
 if(request.method!=='POST')fail('METHOD','지원하지 않는 요청입니다.',405);
 const {settings:s}=await readJointBody(request,{maxBytes:32768,fields:['settings']});
 if(!s||!['OFF','TEST','ON'].includes(s.mode)||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.testUserIds)||s.testUserIds.length>100||new Set(s.testUserIds).size!==s.testUserIds.length||s.testUserIds.some(n=>!Number.isSafeInteger(n)||n<1))fail('SETTINGS','공개 상태, 테스트 계정 ID와 설정 버전을 확인하세요.');
 // The existing lobby dialog sends only mode/testers. Omitted advanced fields
 // preserve the current saved document instead of resetting CMS adjustments.
 const combat=s.combat===undefined?null:validateCoopCombat(s.combat),economy=s.economyDraft===undefined?null:validateCoopEconomy(s.economyDraft);
 if(s.rewardLocked===false||s.economyEnabled===true)fail('REWARD_LOCKED','입장 차감·보상은 초안만 저장할 수 있습니다.');
 if((await testUsers(env,s.testUserIds)).length!==s.testUserIds.length)fail('TEST_USERS','존재하지 않는 계정 ID입니다.');
 return deps.withUserMutationLock(env,user.id,'coop/settings',async()=>{
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(KEY).first(),fresh=normalize(row?.value);
  if(fresh.revision!==s.revision)fail('CONFIG_CONFLICT','다른 화면에서 설정이 변경됐습니다. 다시 불러온 뒤 저장하세요.',409);
  const next={mode:s.mode,testUserIds:s.testUserIds,revision:fresh.revision+1,rewardLocked:true,combat:combat||fresh.combat,economyDraft:economy||fresh.economyDraft,updatedBy:Number(user.id),updatedAt:new Date().toISOString()};
  const raw=JSON.stringify(next),saved=row?
   await env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,KEY,row.value).run():
   await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(KEY,raw).run();
  if(Number(saved.meta?.changes)!==1)fail('CONFIG_CONFLICT','설정 저장이 충돌했습니다. 다시 불러온 뒤 저장하세요.',409);
  return respond(next);
 });
}
