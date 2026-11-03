import {createUserAuctionService} from './_auction_user_service.js';
import {auctionAdminCatalog,auctionOwnedCatalog,auctionLiveHostGuards,AUCTION_BOUND_ITEMS} from './_auction_user_catalog.js';
import {readAuctionPolicy,saveAuctionPolicy,auctionAssetBlocked} from './_auction_user_policy.js';
import {auctionSettlementAccounting} from './_auction_user_accounting.js';
import {readAuctionAdminBgm,saveAuctionAdminBgm} from './_auction_user_admin.js';
import {publishAccountSync} from './_account_sync.js';
import {readJointBody,jointError} from './_joint_request.js';

export function createLiveAuctionService(env,{withUserMutationLock,catalog,operatorCatalog,hostGuards,settlementAccounting,now}={}){
 const withUserLocks=async(ids,work)=>{
  if(!withUserMutationLock)throw jointError('AUCTION_LOCK','경매 계정 잠금을 확인할 수 없습니다.',503);
  const next=index=>index===ids.length?work():withUserMutationLock(env,ids[index],'auction/user/transaction',()=>next(index+1));return next(0);
 };
 return createUserAuctionService(env,{
  catalog:catalog||((user)=>auctionOwnedCatalog(env,user)),operatorCatalog:operatorCatalog||(async()=>{const [{policy},assets]=await Promise.all([readAuctionPolicy(env),auctionAdminCatalog(env)]);return assets.filter(a=>a.systemEligible&&!auctionAssetBlocked(policy,a));}),
  now,hostGuards:hostGuards||((user,asset,q)=>auctionLiveHostGuards(env,user,asset,q)),settlementAccounting:settlementAccounting||auctionSettlementAccounting,withUserLocks,
  legacyActive:async()=>!!await env.DB.prepare("SELECT id FROM auctions_v1553 WHERE status IN ('ACTIVE','SCHEDULED') LIMIT 1").first(),
  afterCommit:async ids=>{for(let i=0;i<ids.length;i+=8)await Promise.all(ids.slice(i,i+8).map(id=>publishAccountSync(env,id)));}
 });
}
export async function handleUserAuction({path,request,env,deps}){
 if(!path.startsWith('auction/user/'))return null;
 const reply=(value,status=200)=>deps.json(value,status,{'cache-control':'private, no-store'});
 try{
  const user=await deps.authenticate(request,env);if(!user)throw jointError('AUCTION_LOGIN','로그인이 필요합니다.',401);
  if(user.status!=='ACTIVE')throw jointError('AUCTION_ACCOUNT','계정 상태를 확인하세요.',403);
  const action=path.slice('auction/user/'.length),admin=action.startsWith('admin/');if(admin&&user.role!=='OWNER')throw jointError('AUCTION_PERMISSION','운영자만 경매 CMS를 사용할 수 있습니다.',403);
  const service=createLiveAuctionService(env,deps),url=new URL(request.url);
  if(request.method==='GET'){
   if(action==='state')return reply(await service.state(user));
   if(action==='lobby'){await service.tick();return reply({active:await service.activeLot(),userId:Number(user.id),serverNow:Date.now()});}
   if(action==='bgm-events')return reply(await service.bgmEvents({lotId:url.searchParams.get('lotId'),after:url.searchParams.get('after')||0}));
   if(action==='catalog')return reply({assets:await (deps.catalog?deps.catalog(user):auctionOwnedCatalog(env,user))});
   if(action==='admin/bgm')return reply(await readAuctionAdminBgm(env));
   if(action==='admin/state'){const [state,{policy},catalog]=await Promise.all([service.state(user),readAuctionPolicy(env),deps.adminCatalog?deps.adminCatalog():auctionAdminCatalog(env)]);return reply({...state,policy,catalog,boundItems:AUCTION_BOUND_ITEMS});}
  }else if(request.method==='POST'){
   const fields={host:['kind','ref','quantity','startPrice','requestId'],bid:['lotId','amount','message','requestId'],cancel:['lotId'],return:['lotId'],notice:['lotId'],'admin/host':['kind','ref','quantity','startPrice','requestId'],'admin/cancel':['lotId'],'admin/policy':['revision','enabled','operatorEnabled','blockedAssets'],'admin/bgm':['revision','rules']};
   if(fields[action]){
    const body=await readJointBody(request,{fields:fields[action],maxBytes:action.startsWith('admin/')?750000:8192});
    if(action==='host')return reply(await service.host(user,body));
    if(action==='bid')return reply(await service.bid(user,body));
    if(action==='cancel'||action==='admin/cancel')return reply(await service.cancel(user,body.lotId,{operator:admin}));
    if(action==='return')return reply(await service.claimReturn(user,body.lotId));
    if(action==='notice')return reply(await service.claimNotice(user,body.lotId));
    if(action==='admin/host')return reply(await service.host(user,body,{system:true}));
    if(action==='admin/bgm')return reply(await saveAuctionAdminBgm(env,user,body));
    if(action==='admin/policy')return reply({policy:await saveAuctionPolicy(env,user,body)});
   }
  }
  return reply({error:'지원하지 않는 경매 요청입니다.'},405);
 }catch(error){const known=Number.isInteger(error.status);return reply({error:known?error.message:'경매 처리가 지연되었습니다. 같은 요청으로 다시 확인하세요.',code:error.code||'AUCTION_RETRY',retryable:!known||error.status>=500},known?error.status:503);}
}
