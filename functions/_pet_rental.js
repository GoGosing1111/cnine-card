import {isPetCode} from '../shared/companion-loadout-v2.mjs';
import {jointGuard,jointGuardEnd} from './_joint_atomic.js';
import {PET_GROWTH_KEY} from '../shared/pet-growth-live-v2.mjs';

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
export async function petRentalWriteStatements(DB,record,next){
 const token=crypto.randomUUID(),[sql,args]=petRecordPredicate(record),raw=JSON.stringify(next);
 const statements=[jointGuard(DB,token,sql,args),DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(record.key,raw)];
 // A continuous extension keeps its startedAt. A new paid period must not
 // resurrect the previous period's rolls or a result awaiting confirmation.
 const code='PET-PEPEGU',rental=next.pets[code],id=code+':R';
 if(rental&&rental.startedAt!==record.state.pets[code]?.startedAt){
  const uid=/^pet_rental_v1:([1-9]\d*)$/.exec(record.key)?.[1];if(!uid)throw Error('Invalid pet rental owner');
  const key=PET_GROWTH_KEY(uid),row=await DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  if(row){
   const growth=JSON.parse(row.value);
   if(growth.version!==2||!Number.isSafeInteger(growth.revision)||growth.revision<0||growth.revision>=Number.MAX_SAFE_INTEGER||!growth.pets||!growth.loadouts)throw Error('Invalid pet growth record');
   if(growth.pets[id]||growth.pending?.instanceId===id||Object.values(growth.loadouts).includes(id)){
    const cleared={...growth,revision:growth.revision+1,pets:{...growth.pets},loadouts:{...growth.loadouts},pending:growth.pending?.instanceId===id?null:growth.pending};
    delete cleared.pets[id];for(const mode of ['PVE','PVP'])if(cleared.loadouts[mode]===id)cleared.loadouts[mode]=null;
    const saved=JSON.stringify(cleared),growthToken=token+'g';
    statements.push(jointGuard(DB,growthToken,'EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,row.value]),
     DB.prepare('UPDATE app_meta SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=? AND value=?').bind(saved,key,row.value),
     jointGuard(DB,growthToken+'s','EXISTS(SELECT 1 FROM app_meta WHERE key=? AND value=?)',[key,saved]),jointGuardEnd(DB,growthToken),jointGuardEnd(DB,growthToken+'s'));
   }
  }
 }
 return [...statements,jointGuardEnd(DB,token)];
}
