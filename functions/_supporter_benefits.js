import {HIDEOUT_KEY,hideoutBenefits} from '../shared/personal-hideout-v1.mjs';
import {hideoutEnabled} from './_personal_hideout.js';
import {emptySupport,supportKey,supportBenefits} from '../shared/server-support-v1.mjs';

export async function readSupportRecord(env,userId){
  const key=supportKey(userId),row=await env.DB.prepare('SELECT (SELECT value FROM app_meta WHERE key=?) AS value,(SELECT value FROM app_meta WHERE key=?) AS hideout').bind(key,HIDEOUT_KEY(userId)).first();
  const state=row?.value?JSON.parse(row.value):emptySupport();
  if(state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0||!Number.isSafeInteger(state.startsAt)||state.startsAt<0||!Number.isSafeInteger(state.endsAt)||state.endsAt<state.startsAt||
    state.revokedAt!==null&&(!Number.isSafeInteger(state.revokedAt)||state.revokedAt<0)||state.magnetPetCode!==null&&!/^PET-[A-Z0-9-]{1,28}$/.test(state.magnetPetCode))throw Error('Invalid supporter record');
  return {key,raw:row?.value??null,state,hideout:hideoutBenefits(hideoutEnabled(env)&&row?.hideout?JSON.parse(row.hideout):null)};
}
export async function readSupportBenefits(env,userId,now=Date.now()){
  const record=await readSupportRecord(env,userId);return {...supportBenefits(record.state,now),hideout:record.hideout};
}
