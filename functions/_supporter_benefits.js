import {emptySupport,supportKey,supportBenefits} from '../shared/server-support-v1.mjs';

export async function readSupportRecord(env,userId){
  const key=supportKey(userId),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  const state=row?JSON.parse(row.value):emptySupport();
  if(state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0||!Number.isSafeInteger(state.startsAt)||state.startsAt<0||!Number.isSafeInteger(state.endsAt)||state.endsAt<state.startsAt||
    state.revokedAt!==null&&(!Number.isSafeInteger(state.revokedAt)||state.revokedAt<0)||state.magnetPetCode!==null&&!/^PET-[A-Z0-9-]{1,28}$/.test(state.magnetPetCode))throw Error('Invalid supporter record');
  return {key,raw:row?.value??null,state};
}
export async function readSupportBenefits(env,userId,now=Date.now()){
  return supportBenefits((await readSupportRecord(env,userId)).state,now);
}
