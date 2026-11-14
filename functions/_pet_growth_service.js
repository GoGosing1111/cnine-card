import {applyGrowthRequest,publicGrowthState} from '../shared/pet-growth-v2.mjs';
// The host must supply its account transaction and ownership storage. No live route
// or default economy is enabled by this preparation service.
export function createPetGrowthService({store,policy,randomInt,now=()=>Date.now()}){
 if(typeof store?.transaction!=='function'||typeof store?.read!=='function')throw new Error('An atomic account store is required');
 return {
  async read(actor){if(!Number.isSafeInteger(actor?.id)||actor.id<=0)throw new Error('Authentication required');const state=await store.read(actor.id);if(!state||state.ownerId!==actor.id)throw new Error('Ownership mismatch');return publicGrowthState(state);},
  async execute(actor,request){
   if(!Number.isSafeInteger(actor?.id)||actor.id<=0)throw new Error('Authentication required');
   return store.transaction(actor.id,async current=>{
    if(!current||current.ownerId!==actor.id)throw new Error('Ownership mismatch');
    const result=applyGrowthRequest(current,request,policy,{randomInt,now:now()});
    return {next:result.state,value:{...publicGrowthState(result.state),receipt:result.receipt,replayed:result.replayed}};
   });
  }
 };
}
