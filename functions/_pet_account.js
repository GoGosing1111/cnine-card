import {COMPANION_RELEASE} from '../shared/companion-loadout-v2.mjs';
import {PET_ART_CATALOG} from '../shared/pet-art-catalog-v1.mjs';
import {validatePetDefinition,petReadiness} from '../shared/pet-cms-v1.mjs';
import {petCollectionKey,petLoadoutKey,petPotentialKey,PET_MAGNET} from '../shared/pet-potential-v1.mjs';
import {readPetCms} from './_pet_companion_cms.js';
import {readSupportBenefits} from './_supporter_benefits.js';

export async function readPetRecord(env,key,fallback){
  const row=await env.DB.prepare('SELECT value FROM app_meta WHERE key=?').bind(key).first();
  return {key,raw:row?.value??null,state:row?JSON.parse(row.value):fallback};
}
export async function readPetCollection(env,userId){
  const record=await readPetRecord(env,petCollectionKey(userId),{revision:0,pets:{}}),s=record.state;
  if(!Number.isSafeInteger(s.revision)||s.revision<0||!s.pets||Array.isArray(s.pets)||Object.values(s.pets).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('Invalid pet collection');
  return record;
}
export async function readPetPotentials(env,userId){
  const record=await readPetRecord(env,petPotentialKey(userId),{revision:0,pets:{}}),s=record.state;
  if(!Number.isSafeInteger(s.revision)||s.revision<0||!s.pets||Array.isArray(s.pets)||Object.values(s.pets).some(p=>!p||!Number.isSafeInteger(p.attempts)||p.attempts<0||p.potential!==null&&p.potential!==PET_MAGNET))throw Error('Invalid pet potentials');
  return record;
}
export async function readPetLoadout(env,userId){
  const record=await readPetRecord(env,petLoadoutKey(userId),{revision:0,petCode:null,audit:[]}),s=record.state;
  if(!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.audit)||s.audit.length>50||s.petCode!==null&&!/^PET-[A-Z0-9-]{1,28}$/.test(s.petCode))throw Error('Invalid pet loadout');
  return record;
}
export function livePetDefinition(raw,mode){
  if(!raw||raw.liveEnabled===false)return null;
  const pet=validatePetDefinition(raw),art=PET_ART_CATALOG.find(row=>row.code===pet.code);
  // The approved transparent pet illustrations are also the support portraits.
  // A custom pet requires its own explicitly configured battle sprite.
  const definition={...pet,enabled:true,battleSprite:pet.battleSprite||art?.sourceArt||''};
  return petReadiness(definition,mode).ok?definition:null;
}
export async function loadPetBattleSnapshot(env,user,mode='PVE'){
  if(!COMPANION_RELEASE.pets)return null;
  const userId=Number(user?.id??user);if(!Number.isSafeInteger(userId)||userId<1)return null;
  const loadout=await readPetLoadout(env,userId);if(!loadout.state.petCode)return null;
  const [collection,potentials,cms,support]=await Promise.all([readPetCollection(env,userId),readPetPotentials(env,userId),readPetCms(env),readSupportBenefits(env,userId)]);
  if(!(collection.state.pets[loadout.state.petCode]>0))return null;
  const definition=livePetDefinition(cms.state.document.pets.find(p=>p.code===loadout.state.petCode),mode);if(!definition)return null;
  const permanentMagnet=potentials.state.pets[definition.code]?.potential===PET_MAGNET;
  return {definition,magnet:permanentMagnet||support.active&&support.magnetPetCode===definition.code,cmsRevision:cms.state.revision,loadoutRevision:loadout.state.revision,ownerId:userId};
}
