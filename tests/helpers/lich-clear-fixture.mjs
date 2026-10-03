import assert from 'node:assert/strict';
export async function readyLichClear(h,{members=[1,2,3],settings={}}={}){
  await h.configure({mode:'ON',petEssenceEnabled:true,petEssenceReward:5,masterStarReward:1000,coinReward:1000000000,...settings});
  const opened=await h.command('open');assert.equal(opened.status,200,JSON.stringify(opened.body));
  const roomId=opened.body.roomId;
  for(const user of members.slice(1))assert.equal((await h.command('join',{roomId},user)).status,200);
  await h.command('assign',{roomId,targetId:String(members[1]),role:'WARDEN'});
  await h.command('assign',{roomId,targetId:String(members[2]),role:'RESCUE'});
  for(const user of members)assert.equal((await h.command('ready',{roomId,ready:true},user)).status,200);
  assert.equal((await h.command('start',{roomId})).status,200);
  const room=JSON.parse((await h.one('SELECT state_json FROM raid_lich_rooms_v1 WHERE room_id=?',roomId)).state_json),now=Date.now();
  room.step='EXPOSED';room.round=6;room.boss.hp=1;
  room.challenge={id:'final-weekly',coop:true,kind:'FINALE',startedAt:now,deadline:now+60000,lastStrikes:{},inputEpochs:{},rescues:[],seals:[],chains:[]};
  room.clock=now;room.endsAt=now+120000;
  await h.run('UPDATE raid_lich_rooms_v1 SET state_json=? WHERE room_id=?',JSON.stringify(room),roomId);
  return {roomId,body:await lichFinishingAction(h,roomId,members[0])};
}
export async function lichFinishingAction(h,roomId,user=1){
  const result=await h.call('status?roomId='+roomId,{user});assert.equal(result.status,200,JSON.stringify(result.body));
  const view=result.body.state,control=view.controls.find(c=>c.action==='STRIKE');assert.ok(control);
  return {roomId,challengeId:view.challenge.id,action:'STRIKE',stepToken:control.token,requestId:h.uid()};
}
