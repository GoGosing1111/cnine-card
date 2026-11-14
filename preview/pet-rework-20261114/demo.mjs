import {mountPetEquipment} from '../../js/pet-equipment-window-v1.mjs';
import {PET_ART_CATALOG} from '../../shared/pet-art-catalog-v1.mjs';
import {PET_TRAITS} from '../../shared/pet-growth-v2.mjs';
import {createPetGrowthService} from '../../functions/_pet_growth_service.js';
const pet=PET_ART_CATALOG.find(row=>row.code==='PET-HEUKGU');
const images=await fetch('/assets/ui/pets/rework-20261114/codex-v3/pets.json').then(response=>response.json());
if(!pet)throw new Error('Approved Heukgu reference is required');
const policy={enabled:true,revision:1,weights:{C:30,B:25,A:20,S:15,SS:7,SSS:3},costs:{stats:1,trait:1},traitPools:{[pet.code]:Object.keys(PET_TRAITS)}};
let state={ownerId:9999,revision:0,wallet:{stats:100,trait:100},loadouts:{PVE:'heukgu-01',PVP:'heukgu-02'},pending:null,receipts:{},instances:[
 {id:'heukgu-01',petCode:pet.code,label:'흑구 · 첫 번째 동료',cap:'SSS',stats:{attack:'B',defense:'A',hp:'S',speed:'SSS'},trait:{id:'ASSAULT',grade:'SS'},allowedModes:['PVE','PVP']},
 {id:'heukgu-02',petCode:pet.code,label:'흑구 · 두 번째 동료',cap:'SSS',stats:{attack:'SS',defense:'B',hp:'A',speed:'S'},trait:{id:'GUARD',grade:'S'},allowedModes:['PVE','PVP']}
]};
let chain=Promise.resolve(),loseNext=false;
const service=createPetGrowthService({store:{read:async()=>structuredClone(state),transaction(id,work){const call=chain.then(async()=>{const result=await work(structuredClone(state));state=result.next;if(loseNext){loseNext=false;throw new Error('Simulated lost response');}return result.value;});chain=call.catch(()=>{});return call;}},policy});
const adapter={policy,read:()=>service.read({id:9999}),execute:req=>service.execute({id:9999},req)};
const cards=[pet,...PET_ART_CATALOG.filter(row=>row.code!==pet.code).slice(0,7)].map(row=>({...row,...images[row.code],owned:row.code===pet.code,quantity:row.code===pet.code?2:0,battleSprite:row.sourceArt,buffs:[{type:'ATTACK_PERCENT',percent:null}],target:'ALL_ALLIES',modes:['PVE','PVP'],ready:[],rewardBonuses:{},rewardBonusesActive:false}));
const request=async key=>{
 if(key.startsWith('server-support/'))throw Object.assign(new Error('No subscription in fixture'),{status:404});
 return {version:1,available:true,canEquip:false,reviewOnly:false,userId:9999,serverNow:Date.now(),cards,ownedCount:1,catalogCount:cards.length,loadout:{petCode:pet.code,revision:0},loadouts:{PVE:{petCode:pet.code,revision:0},PVP:{petCode:pet.code,revision:0}},buffTypes:{ATTACK_PERCENT:'공격력'},buffTargets:{ALL_ALLIES:'아군'},message:'선택한 펫의 능력치 · 특성 관리에서 개편 기능을 확인하세요.'};
};
const label=document.createElement('p');label.textContent='개발 검수 · 예시 펫: 흑구(SSS 등급 가정). 실제 계정과 연결되지 않으며 확률·비용은 예시입니다.';label.style.cssText='max-width:1440px;margin:8px auto 16px;color:#dbe7ac;font:14px/1.6 sans-serif';document.getElementById('pet-codex').before(label);
const mounted=mountPetEquipment(document.getElementById('pet-codex'),{codex:true,request,growth:{layout:'unified',adapter,async createEffectPreview(host,options){const {createEffectPreview}=await import('/preview/pet-rework-20261114/fx-preview.bundle.mjs');return createEffectPreview(host,options);}}});
window.__petCodexReview={animation:()=>mounted.animation,reload:()=>mounted.reload()};
window.__petGrowthDemo={state:()=>structuredClone(state),policy,loseResponse(){loseNext=true;},setTrait(id){if(!PET_TRAITS[id])throw Error('Invalid trait');state.instances[0].trait={id,grade:'SSS'};},empty(){state.instances=[];},setWallet(n){state.wallet={stats:n,trait:n};},dispose(){mounted.dispose();},getActiveFx:()=>window.__petActiveFx||0};
window.addEventListener('pagehide',()=>mounted.dispose(),{once:true});
window.__petGrowthDemo.foreignPending=()=>{const other={...structuredClone(state.instances[0]),id:'other-pet',petCode:cards[1].code};state.instances.push(other);state.pending={id:'foreign-result',instanceId:other.id,kind:'stats',before:other.stats,candidate:other.stats};};
