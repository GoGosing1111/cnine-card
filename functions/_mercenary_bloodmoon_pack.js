import {BLOODMOON_MERCENARIES,BLOODMOON_CODES,BLOODMOON_SERVER_LIMIT} from '../shared/mercenary-bloodmoon-catalog-v1.mjs';
import {BLOODMOON_PACK,bloodmoonPackDraft} from '../shared/mercenary-bloodmoon-pack-v1.mjs';
export async function handleBloodmoonPack({path,request,env,deps}){
 if(![BLOODMOON_PACK.featurePath,BLOODMOON_PACK.openPath].includes(path))return null;
 const headers={'cache-control':'no-store'};
 if(path===BLOODMOON_PACK.openPath){
  if(request.method!=='POST')return deps.json({error:'지원하지 않는 요청입니다.'},405,headers);
  // Return before reading accounts, request bodies, settings, stock or wallets.
  return deps.json({code:'MERCENARY_BLOODMOON_CLOSED',error:'블러드문 SS 리미티드 팩은 현재 개봉할 수 없습니다. 코인은 차감되지 않았습니다.'},423,headers);
 }
 if(request.method!=='GET')return deps.json({error:'도감 공개 단계에서는 설정을 변경할 수 없습니다.'},405,headers);
 const rows=await env.DB.prepare('SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('+BLOODMOON_CODES.map(()=>'?').join(',')+')').bind(...BLOODMOON_CODES).all();
 const stock=BLOODMOON_CODES.map(code=>{const row=rows.results.find(r=>r.code===code),issued=Number(row?.issued||0);return {code,limit:BLOODMOON_SERVER_LIMIT,issued,remaining:Math.max(0,BLOODMOON_SERVER_LIMIT-issued)};});
 return deps.json({id:BLOODMOON_PACK.id,name:BLOODMOON_PACK.name,releaseEnabled:false,userOpeningEnabled:false,packSettings:bloodmoonPackDraft(),cards:BLOODMOON_MERCENARIES,stock},200,headers);
}
