import {companionCmsFixture} from './companion-preparation-fixture.mjs';
import {handlePetEquipment} from '../../functions/_pet_equipment.js';
export async function petEquipmentFixture(){
  const fixture=await companionCmsFixture();
  const handle=async(request,options={})=>{
    const path=options.path||'admin/pets/equipment/state',deps={requirePermission:async()=>options.denied?null:{id:options.owner||1,role:options.role||'OWNER'},authenticate:async()=>options.denied?null:{id:options.owner||1,role:'USER'},json:(data,status=200)=>Response.json(data,{status})};
    return await handlePetEquipment({request,path,env:fixture.env,deps})||fixture.handle(request,{...options,path});
  };
  const call=async(body,options={})=>{
    const path=options.path||(body?'admin/pets/equipment/loadout':'admin/pets/equipment/state');
    const response=await handle(new Request('https://qa.test/api/'+path,{method:options.method||(body?'POST':'GET'),headers:{origin:'https://qa.test','content-type':'application/json',...options.headers},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),{...options,path});
    return response?{status:response.status,headers:response.headers,body:await response.json()}:null;
  };
  return {...fixture,handle,call,cmsCall:fixture.call};
}
