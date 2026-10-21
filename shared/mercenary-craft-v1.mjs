import {KAIRON_CODE,KAIRON_ART,KAIRON_COMBAT} from './mercenary-kairon-v1.mjs';
import {JOKRO_CODE,JOKRO_ART,JOKRO_COMBAT} from './mercenary-jokro-v1.mjs';
export const KAIRON_CRAFT_KEY='mercenary_kairon_craft_v1';
export const KAIRON_RECIPE_CODE='WORKSHOP_KAIRON';
export const KAIRON_CRAFT_LIMIT=8;
export const JOKRO_CRAFT_KEY='mercenary_jokro_craft_v1';
export const JOKRO_RECIPE_CODE='WORKSHOP_JOKRO';
export const JOKRO_CRAFT_LIMIT=2;
export const MERCENARY_CRAFTS=Object.freeze([
 Object.freeze({key:KAIRON_CRAFT_KEY,recipeCode:KAIRON_RECIPE_CODE,code:KAIRON_CODE,limit:KAIRON_CRAFT_LIMIT,art:KAIRON_ART,power:KAIRON_COMBAT.basePower,name:'카이론 · 흑탄의 집행관',description:'제작 전용 SSS 리미티드 · 팩 획득 불가 · 진무와 동일한 전투 밸런스',prefix:'KAIRON',sort:988,masterStarMax:1000000}),
 Object.freeze({key:JOKRO_CRAFT_KEY,recipeCode:JOKRO_RECIPE_CODE,code:JOKRO_CODE,limit:JOKRO_CRAFT_LIMIT,art:JOKRO_ART,power:JOKRO_COMBAT.basePower,name:'족로 · 청룡의 발도',description:'SSS 리미티드 · 서버 전체 제작 2장 한정 · 팩 발행 한도와 별도',prefix:'JOKRO',sort:989,masterStarMax:100000000})
]);
export function mercenaryCraftDefinition(recipe){
 const code=typeof recipe==='string'?recipe:recipe?.code;
 const definition=MERCENARY_CRAFTS.find(d=>d.recipeCode===code);
 if(!definition)throw Error('등록되지 않은 용병 제작 레시피입니다.');return definition;
}
export function mercenaryCraftStock(definition,crafted=0){
 const count=Number(crafted);if(!Number.isSafeInteger(count)||count<0)throw Error(`${definition.art.name} 제작 수량을 확인할 수 없습니다.`);
 return {limit:definition.limit,crafted:count,remaining:Math.max(0,definition.limit-count),soldOut:count>=definition.limit};
}
export const kaironCraftStock=crafted=>mercenaryCraftStock(MERCENARY_CRAFTS[0],crafted);
export const isMercenaryCraft=r=>r?.category==='MERCENARY_CRAFT'||(r?.outputType||r?.output_type)==='MERCENARY'||MERCENARY_CRAFTS.some(d=>d.recipeCode===r?.code);
export function kaironCraftDraft(){return {revision:0,coinCost:null,masterStarCost:null,successRate:null,materials:[],isActive:false,isPublic:false};}
export function jokroCraftDraft(){return {revision:0,coinCost:1000000000000,masterStarCost:10000000,successRate:1,materials:[{itemCode:'MERCENARY_SSS_CARD_SHARD',quantity:15}],isActive:false,isPublic:false};}
export const mercenaryCraftDraft=definition=>definition.recipeCode===JOKRO_RECIPE_CODE?jokroCraftDraft():kaironCraftDraft();
export function validateMercenaryCraft(raw,definition){
 const number=(v,label,max,integer=true)=>{
  if(v===null||v===undefined||v==='')return null;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>max||integer&&!Number.isSafeInteger(v))throw Error(`${label} 값을 확인하세요.`);
  return v;
 };
 const next={revision:number(raw.revision,'설정 버전',Number.MAX_SAFE_INTEGER),
  coinCost:number(raw.coinCost,'코인 비용',Number.MAX_SAFE_INTEGER),masterStarCost:number(raw.masterStarCost,'마스터의 별 비용',definition.masterStarMax),
  successRate:number(raw.successRate,'성공 확률',100,false),materials:[],isActive:raw.isActive===true,isPublic:raw.isPublic===true};
 if(!Array.isArray(raw.materials)||raw.materials.length>30)throw Error('제작 재료는 최대 30종까지 설정하세요.');
 for(const row of raw.materials){
  const itemCode=String(row.itemCode??row.item_code??'').trim().toUpperCase(),quantity=number(row.quantity,'재료 수량',100000000);
  if(!/^[A-Z0-9_:-]{1,100}$/.test(itemCode)||itemCode==='MASTER_STAR'||next.materials.some(m=>m.itemCode===itemCode)||quantity===0)throw Error('중복되지 않는 재료와 1개 이상의 수량을 입력하세요. 마스터의 별은 비용에 설정하세요.');
  next.materials.push({itemCode,quantity});
 }
 if(next.isActive&&!mercenaryCraftReady(next))throw Error(`${definition.art.name} 제작 잠금: 재료·수량·코인·마스터의 별·성공 확률을 모두 입력해야 운영할 수 있습니다.`);
 return next;
}
export const validateKaironCraft=raw=>validateMercenaryCraft(raw,MERCENARY_CRAFTS[0]);
export const mercenaryCraftReady=p=>p.coinCost!==null&&p.masterStarCost!==null&&p.successRate!==null&&p.materials.length>0&&p.materials.every(m=>m.quantity!==null&&m.quantity>0);
export const kaironCraftReady=mercenaryCraftReady;
export function mercenaryCraftRecipe(definition,policy,row={},stock=null){
 const ready=mercenaryCraftReady(policy),active=ready&&policy.isActive&&!stock?.soldOut;
 return {...row,id:Number(row.id||-Number(definition.code.slice(2))),code:definition.recipeCode,category:'MERCENARY_CRAFT',name:definition.name,
  description:definition.description,output_type:'MERCENARY',output_ref:definition.code,output_quantity:1,
  output_name:definition.art.name,output_image:definition.art.sourceArt,output_rarity:'SSS LIMITED',output_pve:definition.power,output_pvp:definition.power,
  payment_mode:'BOTH',coin_cost:policy.coinCost,master_star_cost:policy.masterStarCost,card_shard_cost:0,success_rate:policy.successRate,
  is_active:active?1:0,is_public:policy.isPublic?1:0,owner_test_only:0,is_featured:1,sort_order:definition.sort,
  extension_draft:true,craftRevision:policy.revision,craftLocked:!active,craftStock:stock,craftMasterStarMax:definition.masterStarMax,
  lockReason:stock?.soldOut?`서버 전체 ${definition.limit}장 제작 완료 · 한정 수량 소진`:!ready?'제작 조건 설정 전 · 제작 잠금':!active?'제작 운영 OFF':'',
  materials:policy.materials.map(m=>({...row.materials?.find(x=>x.item_code===m.itemCode),item_code:m.itemCode,quantity:m.quantity}))};
}
export const kaironCraftRecipe=(policy,row={},stock=null)=>mercenaryCraftRecipe(MERCENARY_CRAFTS[0],policy,row,stock);
