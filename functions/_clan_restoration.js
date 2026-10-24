import {clanRestorationState} from '../shared/clan-restoration-v1.mjs';

// Run before the former retirement gate, admin shortcuts and lazy lifecycle writes.
export async function handleClanRestorationRoute({path,request,env,deps,readOverview,readAdmin}){
  if(!path.startsWith('clan/')&&!path.startsWith('admin/clan-war/'))return null;
  const restoration=clanRestorationState();if(!restoration)return null;
  const user=await deps.authenticate(request,env);
  if(!user)return deps.json({error:'로그인이 필요합니다.'},401);
  if(path.startsWith('admin/')&&!(['OWNER','ADMIN'].includes(String(user.role).toUpperCase())||deps.isAdminRole?.(user)))
    return deps.json({error:'관리자 권한이 필요합니다.'},403);
  const reply=data=>deps.json({...data,restoration},200,{'cache-control':'no-store'});
  if(request.method==='GET'){
    if(['clan/war/ready-alert','clan/faction/alerts'].includes(path))return reply({ok:true,enabled:false,alert:null,alerts:[]});
    if(path==='clan/overview')return reply(await readOverview(user));
    if(path==='admin/clan-war/settings')return reply(await readAdmin(user));
    if(path==='clan/organization')return reply({ok:true,organizationPreparation:{restored:true,legacyClosed:false}});
  }
  return deps.json({error:restoration.message,code:'CLAN_SCHEDULE_LOCKED',restoration},409,{'cache-control':'no-store'});
}
