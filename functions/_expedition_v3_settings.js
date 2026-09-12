import {readJointReleaseComponent} from './_joint_release_document.js';
import {V3_JOINT_RELEASE_ENABLED} from '../shared/v3-joint-release-v1.mjs';
import {jointError} from './_joint_request.js';
export const EXPEDITION_V3_DRAFTS=Object.freeze({
  COW_ROOM:{revision:0,version:'cow-economy-draft-20260913',mode:'OFF',approved:false,entryCoin:250000,dailyRuns:3,dailyCoinCap:6000000,clearCoin:[2000000]}
});
export function validateExpeditionPolicy(content,value){
  if(!Object.hasOwn(EXPEDITION_V3_DRAFTS,content))throw jointError('PVE_V3_CONTENT','콘텐츠를 확인하세요.');
  const integer=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
  if(!value||Object.keys(value).some(k=>!['revision','version','mode','approved','entryCoin','dailyRuns','dailyCoinCap','clearCoin','updatedBy','updatedAt'].includes(k))||
    !integer(value.revision,1e9)||typeof value.version!=='string'||!/^[a-zA-Z0-9._:-]{1,80}$/.test(value.version)||
    !['OFF','TEST','ON'].includes(value.mode)||typeof value.approved!=='boolean'||!integer(value.entryCoin,1e9)||
    !integer(value.dailyRuns,200)||value.dailyRuns<1||!integer(value.dailyCoinCap,200000000)||
    !Array.isArray(value.clearCoin)||value.clearCoin.length!==1||value.clearCoin.some(n=>!integer(n,20000000)))
    throw jointError('PVE_V3_POLICY','입장 비용·일일 횟수·보상 상한을 확인하세요.');
  return structuredClone(value);
}
async function record(env,content){
  if(!Object.hasOwn(EXPEDITION_V3_DRAFTS,content))throw jointError('PVE_V3_CONTENT','콘텐츠를 확인하세요.');
  const key=`expedition_v3_${content.toLowerCase()}`,r=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(!r)return {key,raw:null,value:structuredClone(EXPEDITION_V3_DRAFTS[content])};
  let value;try{value=JSON.parse(r.value);}catch{throw jointError('PVE_V3_POLICY','원정 설정을 읽을 수 없습니다.',503);}
  return {key,raw:r.value,value:validateExpeditionPolicy(content,value)};
}
export async function readExpeditionPolicy(env,content,{draft=false}={}){return (!draft&&await readJointReleaseComponent(env,content))||(await record(env,content)).value;}
export async function saveExpeditionDraft(env,user,content,body){
  if(user.role!=='OWNER')throw jointError('PVE_V3_PERMISSION','OWNER 권한이 필요합니다.',403);
  const before=await record(env,content);
  if(body.revision!==before.value.revision)throw jointError('PVE_V3_CONFIG_CONFLICT','설정이 변경됐습니다. 다시 불러오세요.',409);
  const next=validateExpeditionPolicy(content,{...body.economy,revision:body.revision+1,approved:false,updatedBy:Number(user.id),updatedAt:new Date().toISOString()});
  if(next.mode==='ON'&&!V3_JOINT_RELEASE_ENABLED)throw jointError('PVE_V3_RELEASE_HELD','공동 출시 전에는 OFF 또는 TEST로 저장하세요.',423);
  if(next.mode==='ON')throw jointError('PVE_V3_POLICY_APPROVAL','승인된 경제 정책이 필요합니다.',409);
  const raw=JSON.stringify(next),s=before.raw===null?
    env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(before.key,raw):
    env.DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(raw,before.key,before.raw);
  if(Number((await s.run()).meta?.changes)!==1)throw jointError('PVE_V3_CONFIG_CONFLICT','다른 창에서 먼저 저장했습니다.',409);
  return {ok:true,content,...next};
}
