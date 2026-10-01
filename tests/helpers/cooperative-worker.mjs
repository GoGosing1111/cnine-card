// Loopback integration harness: real room/player Durable Objects and API handler.
// Authentication and account inventory are isolated QA fixtures, never production.
export {CooperativeRoom,CooperativePlayer} from '../../workers/api-runtime/src/cooperative.js';
export {UserMutationLock} from '../../workers/user-lock/src/index.js';
import {handleCooperative,cooperativeStream} from '../../functions/_cooperative_live.js';
import {prepareApiRuntimeRequest,openApiRuntimeRequest} from '../../functions/_api_runtime_transport.js';
import fixture from '../fixtures/cooperative-balance-20261001.json' with {type:'json'};
const cards=fixture.cardsByLevel[13];
export const qaUser=id=>({id,serverUserId:id,nickname:['','선봉 분대','지원 분대','돌파 분대','외부 계정'][id],role:id===1?'OWNER':'USER',coin:12345678,cardShards:2000,masterStars:1000,owned:cards.map(c=>c.id),quantities:Object.fromEntries(cards.map(c=>[c.id,1])),breakthroughs:Object.fromEntries(cards.map(c=>[c.id,13])),history:[],attendance:{totalDays:0},testCoinGrantedV13:true,collectionRepairR6:true});
export default {async fetch(request,env){
 if(new URL(request.url).pathname==='/__qa/sql'&&request.method==='POST'){
  const rows=await request.json();return Response.json(await env.DB.batch(rows.map(({sql,args=[]})=>env.DB.prepare(sql).bind(...args))));
 }
 const path=new URL(request.url).pathname.replace(/^\/api\//,'');
 if(path==='coop/stream'){
  const forwarded=await prepareApiRuntimeRequest(request,{API_RUNTIME_KEY:env.API_RUNTIME_KEY});
  const opened=await openApiRuntimeRequest(forwarded,env);return cooperativeStream(opened.request,opened.env);
 }
 const id=Number(request.headers.get('authorization')?.match(/^Bearer local-qa-([1-4])$/)?.[1]||0),user=id?qaUser(id):null;
 if(path.startsWith('coop/')||path.startsWith('admin/coop/'))return handleCooperative({path,request,env,deps:{
  authenticate:async()=>user,json:(value,status=200,headers={})=>Response.json(value,{status,headers}),
  battleSettings:async()=>({engine:{singleHealerBonus:fixture.singleHealerBonus}}),
  cardBattlePower:c=>cards.find(x=>x.id===c.id)?.power||0,
  cardUniqueDeckState:async(_env,_user,list)=>({cards:list.map(c=>({...c,uniqueAbility:cards.find(x=>x.id===c.id)?.uniqueAbility,uniqueAdvancement:null}))}),
  userEquipmentBonuses:async()=>({pve:2000000,battleSuitPve:0}),
  withUserMutationLock:async(_env,ownerId,path,work)=>{
   const lock=env.USER_LOCK.getByName(String(ownerId)),token=crypto.randomUUID();
   const acquired=await (await lock.fetch('https://lock/acquire',{method:'POST',body:JSON.stringify({token,actionPath:path})})).json();
   if(!acquired.acquired)throw Object.assign(Error('계정 요청 처리 중'),{code:'JOINT_LOCK_BUSY',status:409});
   try{return await work();}finally{await lock.fetch('https://lock/release',{method:'POST',body:JSON.stringify({token})});}
  }
 }});
 if(new URL(request.url).pathname.startsWith('/api/'))return Response.json({
  'service/status':{maintenance:{active:false}},'me/summary':{user,prison:{incarcerated:false}},me:{user},cards:{cards},packs:{packs:[]},
  'shell/summary':{inventory:{},messages:{unread:0},avatarFeature:{visible:false}},messages:{messages:[],unread:0},'loot-shop/balance':{pigCoins:0},
  'live-operations':{serverNow:new Date().toISOString(),items:[]},'burning-event/status':{enabled:false},'magic/status':{visible:false,enabled:false,cards:[],loadouts:[]},
  'pvp/config':{settings:{enabled:true}},'raid/status':{current:null,settings:{enabled:true},participants:[]},'pve/config':{settings:{enabled:true}},'pve/monsters':{monsters:[]}
 }[path]||{visible:false,enabled:false,items:[],profiles:[],cards:[],loadouts:[],settings:{}});
 return env.ASSETS.fetch(request);
}};
