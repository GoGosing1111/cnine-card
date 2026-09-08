import {MODELS} from './models.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
if(params.has('autoConfirm'))window.confirm=()=>true; // In-memory QA only.
let count=0,state,receipts=new Map(),load;
window.ensureFeatureResources=()=>load??=(async()=>{
  if(params.has('loadFailure'))throw Error('QA: resource unavailable');
  for(const src of ['/js/ui-fx-vendor-v2045.bundle.js?v=2045','/js/workshop-assembly-fx-v2073.bundle.js?v=2073.1'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.append(script);});
})();
const recipes=Object.entries(MODELS).map(([key,m],i)=>({id:i+1,category:m.mode==='suit'?'BATTLE_SUIT_CRAFT':'VEHICLE',output_type:m.mode==='suit'?'EQUIPMENT':'VEHICLE',output_ref:String(m.catalogId||901),output_name:m.name,output_image:key==='veneno'?'assets/tire/lamborghini-veneno-showroom-v1.png':m.catalogSource||m.source,name:m.name+' 제작',description:'검수용 제작법 · 실제 비용 없음',success_rate:10,payment_mode:'BOTH',coin_cost:200000000,master_star_cost:1000,materials:[],output_rarity:'MYTHIC',qaModel:key}));
function reset(){state={wallet:{coin:20000000000,masterStars:50000,cardShards:0},inventory:{},recipes:structuredClone(recipes),synthesis:[]};}
function reply(recipe,requestId){
  const success=$('qa-outcome').value==='success';
  return {ok:true,requestId,recipeId:recipe.id,recipeName:recipe.name,category:recipe.category,success,coinSpent:200000000,masterStarSpent:1000,output:success?{type:recipe.output_type,ref:recipe.output_ref,name:recipe.output_name,image:recipe.output_image,quantity:1}:null,state:structuredClone(state)};
}
// No fetch/api endpoint exists in this harness. It only feeds the real UI a
// deterministic in-memory response and counts request identities for QA.
window.apiRequest=async(path,options={})=>{
  if(path==='workshop')return structuredClone(state);
  if(path==='workshop/craft'){
    const body=JSON.parse(options.body);if(receipts.has(body.requestId))return {...receipts.get(body.requestId),replayed:true};
    const recipe=state.recipes.find(r=>r.id===body.recipeId);count++;state.wallet.coin-=200000000;state.wallet.masterStars-=1000;
    const data=reply(recipe,body.requestId);receipts.set(body.requestId,data);$('qa-status').textContent=`모의 제작 요청 ${count}회 · 실제 API 요청 0회`;
    return data;
  }
  throw Error('검수 페이지에서 허용되지 않는 작업');
};
async function mount(){reset();$('qa-workshop').innerHTML=window.workshopView();await window.bindWorkshopView();}
$('qa-direct').onclick=async()=>{const key=$('qa-model').value,recipe=state.recipes.find(r=>r.qaModel===key);await window.WorkshopAssemblyLive.play({data:reply(recipe,'QA-PRESENTATION-ONLY'),recipe,isActive:()=>!!$('qa-workshop').children.length});$('qa-status').textContent=JSON.stringify(window.WorkshopAssemblyLive.diagnostics());};
$('qa-leave').onclick=()=>{window.dispatchEvent(new Event('cnine:route-will-change'));$('qa-workshop').replaceChildren();$('qa-status').textContent='화면 이탈 · '+JSON.stringify(window.WorkshopAssemblyLive.diagnostics());};
if(params.has('item'))$('qa-model').value=params.get('item');if(params.has('result'))$('qa-outcome').value=params.get('result');
await mount();if(params.has('play'))$('qa-direct').click();
