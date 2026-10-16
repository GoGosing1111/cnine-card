import base,{qaUser} from './cooperative-worker.mjs';
import {CooperativeRoom as ProductionRoom} from '../../workers/api-runtime/src/cooperative.js';
export {CooperativePlayer,UserMutationLock,AccountSync} from './cooperative-worker.mjs';
import {handleMonsterDefense,monsterDefenseLive} from '../../functions/_monster_defense.js';
// Fixture-only storage hooks; never exported by the production worker.
export class CooperativeRoom extends ProductionRoom{
 qaRead(){return this.read();}
 async qaSeed(room){this.save(room);await this.defenseHost().schedule(room);return true;}
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname.replace(/^\/api\//,'');
 if(path.startsWith('/__qa/defense-room/')){const room=env.COOP_ROOMS.getByName('defense:'+path.split('/').at(-1));return Response.json(request.method==='POST'?await room.qaSeed(await request.json()):await room.qaRead());}
 if(path.startsWith('defense/live/'))return monsterDefenseLive(request,{...env,DB:undefined});
 const id=Number(request.headers.get('authorization')?.match(/^Bearer local-qa-([1-4])$/)?.[1]||0),user=id?qaUser(id):null;
 if(path==='admin/dashboard')return Response.json({role:'OWNER',admin:qaUser(1),stats:{users:4,cards:5}});
 if(path.startsWith('defense/')||path.startsWith('admin/defense/'))return handleMonsterDefense({path,request,env,deps:{authenticate:async()=>user,json:(value,status=200,headers={})=>Response.json(value,{status,headers}),withUserMutationLock:async(_env,_user,_path,work)=>work()}});
 return base.fetch(request,env);
}};
