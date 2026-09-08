import {acceptResult} from './contract.mjs';
import {MODELS} from './models.mjs';

// Only a completed server receipt can enter presentation. Never infer a win
// from truthy strings or substitute a request/target from the current selection.
export function liveAssemblyReceipt(data,recipe){
  if(data?.ok!==true||!recipe||String(data.recipeId)!==String(recipe.id)||data.category!==recipe.category)return null;
  const mode=data.category==='BATTLE_SUIT_CRAFT'?'suit':data.category==='VEHICLE'?'vehicle':null;
  if(!mode)return null;
  let result;try{result=acceptResult(data);}catch{return null;}
  const type=mode==='suit'?'EQUIPMENT':'VEHICLE';
  if(recipe.output_type!==type)return null;
  if(result.success&&(result.output.type!==type||String(result.output.ref)!==String(recipe.output_ref)))return null;
  const ref=String(recipe.output_ref);
  let model=Object.keys(MODELS).find(key=>MODELS[key].mode===mode&&String(MODELS[key].catalogId||'')===ref)||null;
  // Veneno's original CMS image is the approved identity; never route an
  // arbitrary car through Veneno just because it is a vehicle recipe.
  const image=String(recipe.output_image||'').replace(/\\/g,'/').replace(/^\//,'');
  if(mode==='vehicle'&&!model&&image==='assets/tire/lamborghini-veneno-showroom-v1.png')model='veneno';
  const name=String(result.output?.name||recipe.output_name||data.recipeName||'제작 아이템');
  return Object.freeze({mode,model,name,result,image:result.output?.image||recipe.output_image||'',
    coinSpent:Number(data.coinSpent||0),masterStarSpent:Number(data.masterStarSpent||0),
    replayed:data.replayed===true});
}
