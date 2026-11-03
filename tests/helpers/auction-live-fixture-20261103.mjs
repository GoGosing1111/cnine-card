import {userAuctionFixture} from './auction-user-fixture-20261103.mjs';
import {createLiveAuctionService,handleUserAuction} from '../../functions/_auction_user_routes.js';
export async function auctionLiveFixture(t){
 const f=await userAuctionFixture(t);f.sql.exec(`CREATE TABLE admin_logs(id INTEGER PRIMARY KEY,admin_id INTEGER,action_type TEXT,target_type TEXT,target_id TEXT,before_data TEXT,after_data TEXT);CREATE TABLE auctions_v1553(id INTEGER,status TEXT);`);
 const saved=JSON.parse(f.row("SELECT value FROM app_meta WHERE key='auction_user_policy_v1'").value);saved.operatorEnabled=true;f.sql.prepare("UPDATE app_meta SET value=? WHERE key='auction_user_policy_v1'").run(JSON.stringify(saved));
 const user=id=>({...f.user(id),role:id===1?'OWNER':'USER',status:'ACTIVE'}),locks=[],catalog=async user=>(await f.catalog(user)).map(a=>({...a,policyRef:a.kind==='EQUIPMENT'?'40':a.ref,provenance:a.kind==='MERCENARY'?{version:1,verifiedSellerId:user.id,accessVerified:true,code:a.ref}:null}));
 const adminCatalog=async()=>f.assets.map(a=>({...a,systemEligible:['ITEM','MASTER_STAR','EQUIPMENT','VEHICLE'].includes(a.kind),ref:a.kind==='EQUIPMENT'?'40':a.ref}));
 const deps={now:f.now,catalog,adminCatalog,operatorCatalog:adminCatalog,hostGuards:async()=>[],withUserMutationLock:async(_env,id,path,work)=>{locks.push(id);return work();},authenticate:async request=>user(Number(request.headers.get('x-preview-user')||2)),json:(body,status=200,headers={})=>Response.json(body,{status,headers})};
 const service=createLiveAuctionService(f.env,deps);
 const route=async(id,action,body,extraHeaders={})=>{const method=body===undefined?'GET':'POST',request=new Request('http://localhost/api/auction/user/'+action,{method,headers:{origin:'http://localhost','content-type':'application/json','x-preview-user':String(id),...extraHeaders},...(body===undefined?{}:{body:JSON.stringify(body)})});const response=await handleUserAuction({path:'auction/user/'+action.split('?')[0],request,env:f.env,deps});return {status:response.status,body:await response.json()};};
 return {...f,user,service,catalog,adminCatalog,deps,locks,route};
}
