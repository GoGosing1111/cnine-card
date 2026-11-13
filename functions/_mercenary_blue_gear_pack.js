import {BLUE_GEAR_PACK,BLUE_GEAR_PACK_KEY,BLUE_GEAR_STOCK_PREFIX,BLUE_GEAR_LIMITED_CARDS,BLUE_GEAR_DRAW_POLICY,blueGearCatalog,blueGearState} from '../shared/mercenary-blue-gear-pack-v1.mjs';
import {readMercenaryDocument} from './_mercenary_account.js';
import {MERCENARY_CMS_SEED} from './_mercenary_cms_seed.js';
import {limitedNormalCards} from '../shared/mercenary-limited-pack-v1.mjs';
import {validateMercenaryCardRules} from '../shared/mercenary-draw-policy-v1.mjs';
import {createBlackcrownPackService} from './_mercenary_blackcrown_opening.js';
import {jointError,jointResponseError,readJointBody} from './_joint_request.js';

export async function readBlueGearSnapshot(env){
 const db=env.DB,codes=BLUE_GEAR_LIMITED_CARDS.map(c=>BLUE_GEAR_STOCK_PREFIX+c.code);
 const rows='SELECT code,stock_limit,issued FROM mercenary_limited_stock_v1 WHERE code IN ('+codes.map(()=>'?').join(',')+')';
 const pg=db.dialect==='postgres',stock=pg?"COALESCE(json_agg(s),'[]'::json)::text":"COALESCE(json_group_array(json_object('code',code,'stock_limit',stock_limit,'issued',issued)),'[]')";
 const now=pg?"to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')":"strftime('%Y-%m-%dT%H:%M:%fZ','now')";
 const result=await db.prepare('SELECT (SELECT value FROM app_meta WHERE key=?) AS value,(SELECT '+stock+' FROM ('+rows+') s) AS stocks,'+now+' AS now_utc').bind(BLUE_GEAR_PACK_KEY,...codes).first();
 return {doc:result.value?JSON.parse(result.value):null,rawPack:result.value,stock:JSON.parse(result.stocks),serverNow:result.now_utc};
}
export async function blueGearPackShopRow(env){
 const {doc,stock,serverNow}=await readBlueGearSnapshot(env);
 return blueGearCatalog(doc,stock,serverNow);
}
export async function readBlueGearPackState(env,{userId=null}={}){
 const codes=BLUE_GEAR_DRAW_POLICY.ssCodes;
 const [snapshot,cms,draw,owned]=await Promise.all([readBlueGearSnapshot(env),readMercenaryDocument(env),
  env.DB.prepare('SELECT payload_json,revision FROM mercenary_draw_config_v1 WHERE id=1').first(),
  userId?env.DB.prepare('SELECT mercenary_code,total_copies FROM user_mercenary_cards_v1 WHERE user_id=? AND total_copies>0 AND mercenary_code IN ('+codes.map(()=>'?').join(',')+')').bind(userId,...codes).all():{results:[]}]);
 if(!snapshot.doc)throw Object.assign(jointError('MERCENARY_BLACKCROWN_CLOSED','블루기어팩을 준비하고 있습니다.',423),{terminal:true});
 const catalog=MERCENARY_CMS_SEED.catalog.cards;
 const rules=draw&&validateMercenaryCardRules(JSON.parse(draw.payload_json).cardRules,catalog.map(c=>c.code));
 const normals=rules?limitedNormalCards(cms.document.mercenaries,catalog,rules):[];
 return {...blueGearState(snapshot.doc,snapshot.stock,normals,snapshot.serverNow,owned.results),rawPack:snapshot.rawPack,
  normalCmsRevision:cms.revision,normalDrawRevision:Number(draw?.revision||0),personalOddsKnown:Boolean(userId)};
}
export function createBlueGearPackService(options={}){
 return createBlackcrownPackService({...options,readState:options.readState||readBlueGearPackState,variant:{
  pack:BLUE_GEAR_PACK,packKey:BLUE_GEAR_PACK_KEY,openKind:'MERCENARY_BLUE_GEAR_OPEN',stockPrefix:BLUE_GEAR_STOCK_PREFIX,
  drawPolicy:BLUE_GEAR_DRAW_POLICY,fallbackSs:true,validateState(state){if(state.openingScheduled)throw Object.assign(jointError('MERCENARY_BLACKCROWN_CLOSED','11월 20일 00시부터 개봉할 수 있습니다.',423),{terminal:true});}}});
}
const service=createBlueGearPackService();
export async function handleBlueGearPack({path,request,env,deps}){
 if(![BLUE_GEAR_PACK.featurePath,BLUE_GEAR_PACK.openPath,BLUE_GEAR_PACK.receiptPath].includes(path))return null;
 const respond=data=>deps.json(data,200,{'cache-control':'no-store'});
 try{
  if(path===BLUE_GEAR_PACK.featurePath&&request.method==='GET'){
   const user=await deps.authenticate(request,env);
   const {rawPack,normalCards,...state}=await readBlueGearPackState(env,{userId:user?.id});return respond(state);
  }
  const user=await deps.authenticate(request,env);if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  if(path===BLUE_GEAR_PACK.openPath&&request.method==='POST'){
   const body=await readJointBody(request,{maxBytes:2048,fields:['requestId','count','expectedRevision','budget']});
   return respond(await deps.withUserMutationLock(env,user.id,path,()=>service.open(env,user,body)));
  }
  if(path===BLUE_GEAR_PACK.receiptPath&&request.method==='GET')return respond(await service.receipt(env,user,new URL(request.url).searchParams.get('requestId')));
  return deps.json({error:'지원하지 않는 요청입니다.'},405);
 }catch(error){return jointResponseError(error,deps.json);}
}
