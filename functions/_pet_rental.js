import {isPetCode} from '../shared/companion-loadout-v2.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';

export const PET_RENTAL_DAY_MS=86400000;
export const petRentalKey=userId=>`pet_rental_v1:${Number(userId)}`;
export const emptyPetRentals=()=>({version:1,revision:0,pets:{}});
const validTime=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function validatePetRentals(state){
 if(!state||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<0||!state.pets||Array.isArray(state.pets)||typeof state.pets!=='object')throw Error('Invalid pet rental record');
 for(const [code,pet]of Object.entries(state.pets))if(!isPetCode(code)||!pet||!validTime(pet.startedAt)||!validTime(pet.expiresAt)||Date.parse(pet.expiresAt)<=Date.parse(pet.startedAt))throw Error('Invalid pet rental period');
 return state;
}
export async function readPetRentals(env,userId){
 const key=petRentalKey(userId),row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
 return {key,raw:row?.value??null,state:validatePetRentals(row?JSON.parse(row.value):emptyPetRentals())};
}
export function activePetRental(state,code,now=Date.now()){
 const pet=state?.pets?.[code];return !!pet&&Date.parse(pet.startedAt)<=now&&Date.parse(pet.expiresAt)>now;
}
export function petOwnershipProjection(collection,rentals,now=Date.now()){
 const pets={...collection.pets},expiries={};
 for(const [code,rental]of Object.entries(rentals.pets))if(!(pets[code]>0)){
  expiries[code]=rental.expiresAt;if(activePetRental(rentals,code,now))pets[code]=1;
 }
 return {pets,expiries};
}
export const petRecordPredicate=record=>record.raw===null?['NOT EXISTS(SELECT 1 FROM app_meta WHERE key=?)',[record.key]]:['EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[record.key,record.raw]];
export const petDatabaseClock=DB=>DB.dialect==='postgres'?`to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`:"strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export function petOwnershipPredicate(DB,owned,code){
 const permanent=owned.collection.state.pets[code]>0,record=permanent?owned.collection:owned.rentals;
 const [sql,args]=petRecordPredicate(record);
 if(permanent)return [sql,args];
 const rental=record.state.pets[code];
 if(!rental||!owned.pets[code])return ['1=0',[]];
 return [sql+` AND ${petDatabaseClock(DB)}>=? AND ${petDatabaseClock(DB)}<?`,[...args,rental.startedAt,rental.expiresAt]];
}
export function nextPetRental(state,code,days,requestId,now=Date.now()){
 validatePetRentals(state);
 if(!isPetCode(code)||!Number.isSafeInteger(days)||days<1||days>36500||state.revision>=Number.MAX_SAFE_INTEGER)throw Error('Invalid pet rental grant');
 const active=activePetRental(state,code,now),prior=state.pets[code],expiresAt=new Date((active?Date.parse(prior.expiresAt):now)+days*PET_RENTAL_DAY_MS).toISOString();
 if(!validTime(expiresAt))throw Error('Pet rental duration limit exceeded');
 const entry={startedAt:active?prior.startedAt:new Date(now).toISOString(),expiresAt,updatedAt:new Date(now).toISOString(),lastRequestId:requestId};
 return {state:{...state,revision:state.revision+1,pets:{...state.pets,[code]:entry}},entry,action:active?'EXTEND':'START'};
}
export function petRentalWriteStatements(DB,record,next){
 const token=crypto.randomUUID(),[sql,args]=petRecordPredicate(record),raw=JSON.stringify(next);
 return [jointGuard(DB,token,sql,args),DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(record.key,raw),jointGuardEnd(DB,token)];
}
