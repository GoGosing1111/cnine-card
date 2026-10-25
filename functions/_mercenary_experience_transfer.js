import {decodeTransferState,TRANSFER_ITEM,transferGroup,transferGroupLabel,mercenaryTransferState} from '../shared/mercenary-experience-transfer-v1.mjs';
export const experienceTransferKey=userId=>'mercenary_experience_transfer_v1:'+userId;
export async function readExperienceTransfer(env,userId){
 const key=experienceTransferKey(userId),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first(),raw=row?.value??null;
 return {key,raw,state:decodeTransferState(raw)};
}
export async function readMercenaryGrowthHistory(env,userId){
 const rows=(await env.DB.prepare("SELECT request_id,plan_json FROM joint_operations_v1 WHERE user_id=? AND kind='MERCENARY_LEVEL_V1' AND status='COMPLETED'").bind(userId).all()).results;
 return rows.map(r=>({requestId:r.request_id,plan:JSON.parse(r.plan_json)}));
}
export function transferCardView(record,card){return {...mercenaryTransferState(record.state,card.code),group:card.rank?transferGroup(card):null};}
export async function experienceTransferInventory(env,userId){
 const {state}=await readExperienceTransfer(env,userId);if(!state.potions.length)return [];
 const groups=[...new Set(state.potions.map(p=>transferGroupLabel(p.group)))].join(' · ');
 return [{...TRANSFER_ITEM,subtitle:'누적 성장 경험치 50% · 용병당 1회',description:`${groups} 물약 보관 중. 용병 성장의 경험치 이전에서 물약과 대상 용병을 선택하세요. 일반 SSS와 SSS 리미티드는 서로 사용할 수 없습니다.`,category:'POTION',rarity:'SPECIAL',quantity:state.potions.length,unseenQuantity:0,usable:true}];
}
export function transferRecordGuard(record){return {sql:record.raw===null?'NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)':'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',values:record.raw===null?[record.key]:[record.key,record.raw]};}
