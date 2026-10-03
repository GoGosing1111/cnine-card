import {lichLiveFixture} from './lich-live-fixture.mjs';
import {handlePetOpening} from '../../functions/_pet_opening.js';
export async function petOpeningFixture(options={}){
  const h=await lichLiveFixture(options),deps={...h.deps,requirePermission:h.deps.authenticate};
  const handle=request=>handlePetOpening({path:new URL(request.url).pathname.slice(5),request,env:h.env,deps});
  async function petCall(path='pets/opening/state',{user=1,body,method=body?'POST':'GET',origin='https://test.invalid'}={}){
    const request=new Request('https://test.invalid/api/'+path,{method,headers:{authorization:'Bearer local-qa-'+user,'content-type':'application/json',origin},...(body?{body:JSON.stringify(body)}:{})});
    const response=await handle(request);return {status:response.status,body:await response.json()};
  }
  async function petConfigure(changes={}){
    const state=await petCall('admin/pets/opening');
    return petCall('admin/pets/opening',{body:{settings:{...state.body.settings,...changes}}});
  }
  const stock=async(user=1,seals=100,essence=1000)=>{for(const [code,n] of [['PET_SEAL_ORB',seals],['PET_ESSENCE',essence]])await h.run('INSERT INTO cnine_user_inventory(user_id,item_code,quantity,unseen_quantity) VALUES(?,?,?,?) ON CONFLICT(user_id,item_code) DO UPDATE SET quantity=excluded.quantity,unseen_quantity=excluded.unseen_quantity',user,code,n,n);};
  return {...h,petCall,petConfigure,stock,petHandle:handle};
}
