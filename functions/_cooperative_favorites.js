import {readJointBody,jointError} from './_joint_request.js';
const prefix=id=>'coop_favorite_v1:'+Number(id)+':';
const fields={card:'cards',mercenary:'mercenaries'};
const fail=(message,status=400)=>{throw jointError('COOP_FAVORITE',message,status);};
export async function readCoopFavorites(env,user){
 const key=prefix(user.id),rows=(await env.DB.prepare('SELECT key FROM app_meta WHERE key LIKE ? ORDER BY value,key LIMIT 201').bind(key+'%').all()).results;
 const result={cards:[],mercenaries:[]};
 for(const row of rows){const [kind,...parts]=row.key.slice(key.length).split(':');if(!Object.hasOwn(fields,kind))continue;try{result[fields[kind]].push(decodeURIComponent(parts.join(':')));}catch{}}
 return result;
}
export async function saveCoopFavorite({request,env,user,deps,owned}){
 if(request.method!=='POST')fail('지원하지 않는 요청입니다.',405);
 const body=await readJointBody(request,{maxBytes:1024,fields:['kind','id','favorite']});
 const {kind,id,favorite}=body;
 if(!Object.hasOwn(fields,kind)||typeof id!=='string'||!id||id.length>100||/[\u0000-\u001f]/.test(id)||typeof favorite!=='boolean'||kind==='mercenary'&&!/^V-\d{3}$/.test(id))fail('즐겨찾기 대상과 설정을 확인하세요.');
 try{encodeURIComponent(id);}catch{fail('즐겨찾기 대상의 문자를 확인하세요.');}
 return deps.withUserMutationLock(env,user.id,'coop/favorites',async()=>{
  const saved=await readCoopFavorites(env,user),list=saved[fields[kind]];
  if(favorite){
   if(!await owned(kind,id))fail('보유하고 출전 가능한 용병·카드만 등록할 수 있습니다.',403);
   if(!list.includes(id)&&list.length>=100)fail('종류별 즐겨찾기는 최대 100개입니다.');
   await env.DB.prepare('INSERT INTO app_meta(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO NOTHING').bind(prefix(user.id)+kind+':'+encodeURIComponent(id),String(Date.now())).run();
  }else await env.DB.prepare('DELETE FROM app_meta WHERE key=?').bind(prefix(user.id)+kind+':'+encodeURIComponent(id)).run();
  return {ok:true,you:Number(user.id),kind,id,favorite,favorites:await readCoopFavorites(env,user)};
 });
}
