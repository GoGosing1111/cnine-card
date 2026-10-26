import base,{qaUser} from './cooperative-worker.mjs';
import {CooperativeRoom as ProductionRoom} from '../../workers/api-runtime/src/cooperative.js';
export {CooperativePlayer,UserMutationLock,AccountSync} from './cooperative-worker.mjs';
import {handleMonsterDefense,monsterDefenseLive} from '../../functions/_monster_defense.js';
import {DEFENSE_DIRECTORY} from '../../shared/monster-defense-room-list-v1.mjs';
// Fixture-only storage hooks; never exported by the production worker.
export class CooperativeRoom extends ProductionRoom{
 qaRead(){return this.read();}
 async qaSeed(room){this.save(room);await this.defenseHost().schedule(room);return true;}
 qaDropTickets(){this.ctx.storage.sql.exec('DELETE FROM tickets');return true;}
 async qaAlarm(){this.defenseHost().rewardRetryAt=0;this.defenseHost().entryRetryAt=0;await this.defenseHost().alarm();return this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE name='room'").toArray().length?this.read():null;}
}
export default {async fetch(request,env){
 const path=new URL(request.url).pathname.replace(/^\/api\//,'');
 if(path.startsWith('/__qa/defense-alarm/'))return Response.json(await env.COOP_ROOMS.getByName('defense:'+path.split('/').at(-1)).qaAlarm());
 if(path.startsWith('/__qa/defense-drop-tickets/'))return Response.json(await env.COOP_ROOMS.getByName('defense:'+path.split('/').at(-1)).qaDropTickets());
 if(path==='/__qa/defense-directory'&&request.method==='POST'){await env.COOP_PLAYERS.getByName(DEFENSE_DIRECTORY).publishDefenseRoom(await request.json());return Response.json({ok:true});}
 if(path.startsWith('/__qa/defense-room/')){const room=env.COOP_ROOMS.getByName('defense:'+path.split('/').at(-1));return Response.json(request.method==='POST'?await room.qaSeed(await request.json()):await room.qaRead());}
 if(path.startsWith('defense/live/'))return monsterDefenseLive(request,{...env,DB:undefined});
 const id=Number(request.headers.get('authorization')?.match(/^Bearer local-qa-([1-4])$/)?.[1]||0),user=id?qaUser(id):null;
 if(path==='admin/dashboard')return Response.json({role:'OWNER',admin:qaUser(1),stats:{users:4,cards:5}});
 if(path.startsWith('defense/')||path.startsWith('admin/defense/'))return handleMonsterDefense({path,request,env,deps:{authenticate:async()=>user,json:(value,status=200,headers={})=>Response.json(value,{status,headers}),
  battleSettings:async()=>({}),cardBattlePower:c=>Number(c.base_power||0),cardUniqueDeckState:async(_env,_user,cards)=>({cards}),cardUniqueDeckStates:async(_env,entries)=>entries.map(({cards})=>({cards})),
  withUserMutationLock:async(_env,_user,_path,work)=>work()}});
 return base.fetch(request,env);
}};
