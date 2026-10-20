import base from './cooperative-worker.mjs';
export {CooperativeRoom,CooperativePlayer,UserMutationLock,AccountSync} from './cooperative-worker.mjs';
// Isolated Miniflare-only fault injection; this module is never deployed.
export default {async fetch(request,env){
 if(new URL(request.url).pathname==='/__qa/energy-lost-ack'){
  const {id}=await request.json(),stub=env.COOP_ROOMS.getByName(id),room=await stub.read();
  room.entryPending={requestKey:room.receipts.at(-1)?.id};delete room.energyEntry;
  await stub.save(room);return Response.json({ok:true});
 }
 return base.fetch(request,env);
}};
