import {clanRestorationState} from '../shared/clan-restoration-v1.mjs';
import {readClanResumption} from './_clan_resumption.js';
import {regularClanRules} from '../shared/clan-resumption-v1.mjs';
import {handleRestoredClanMemberKick} from './_organization.js';

// Run before the former retirement gate, admin shortcuts and lazy lifecycle writes.
export async function handleClanRestorationRoute({path,request,env,deps,readOverview,readAdmin}){
  if(!path.startsWith('clan/')&&!path.startsWith('admin/clan-war/'))return null;
  const restoration=clanRestorationState();if(!restoration)return null;
  const user=await deps.authenticate(request,env);
  if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  if(path.startsWith('admin/')&&!(['OWNER','ADMIN'].includes(String(user.role).toUpperCase())||deps.isAdminRole?.(user)))
    return deps.json({error:'관리자 권한이 필요합니다.'},403);
 const resumption=await readClanResumption(env);
 const reply=data=>deps.json({...data,restoration},200,{'cache-control':'no-store'});
 if(resumption){
  const status={...restoration,regularScheduleLocked:false,factionScheduleLocked:false,scheduleLocked:false,pointsIncluded:true,
   factionDailyCount:1,message:regularClanRules(resumption).regularLabel+' · 세력전 매일 랜덤 1회 / 4개 이상 점령 시 승점 1점. 새 가입 방식과 챔피언스리그 개최는 보류 중입니다.'};
  const resumed=data=>deps.json({...data,resumption,restoration:status},200,{'cache-control':'no-store'});
  if(path==='clan/member/kick')return handleRestoredClanMemberKick({request,env,deps,user});
  if(request.method==='GET'&&path==='clan/overview')return resumed(await readOverview(user,resumption));
  if(request.method==='GET'&&path==='admin/clan-war/settings')return resumed(await readAdmin(user,resumption));
  if(request.method==='GET'&&path==='clan/organization')return resumed({ok:true,organizationPreparation:{restored:true,legacyClosed:false}});
  if(request.method==='GET'&&path==='clan/faction/alerts')return resumed({ok:true,enabled:false,alert:null,alerts:[]});
  if(['clan/war/fight','clan/war/planning','clan/war/availability','clan/war/ready','clan/war/field','clan/war/ready-alert'].includes(path))return null;
  return deps.json({error:'새 가입·드래프트와 챔피언스리그 개최는 보류 중입니다. 현재 클랜 가입은 클랜 본부의 기존 원로 심사를 이용하세요.',code:'CLAN_SCHEDULE_LOCKED',restoration:status},409,{'cache-control':'no-store'});
 }
  if(request.method==='GET'){
    if(['clan/war/ready-alert','clan/faction/alerts'].includes(path))return reply({ok:true,enabled:false,alert:null,alerts:[]});
    if(path==='clan/overview')return reply(await readOverview(user));
    if(path==='admin/clan-war/settings')return reply(await readAdmin(user));
    if(path==='clan/organization')return reply({ok:true,organizationPreparation:{restored:true,legacyClosed:false}});
  }
  return deps.json({error:restoration.message,code:'CLAN_SCHEDULE_LOCKED',restoration},409,{'cache-control':'no-store'});
}
