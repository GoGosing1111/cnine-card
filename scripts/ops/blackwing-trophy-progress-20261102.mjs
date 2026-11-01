import assert from 'node:assert/strict';
export const BLACKWING_TROPHY_REPAIR_KEY='ops:blackwing-trophy-progress-repair:20261102:v1';

// Restore only a closed official clear corroborated by the frozen final-strike
// receipt. Never use the later departure time to cross the trophy launch cutoff.
export function restoreBlackwingClear(row,launchedAt){
 const state=JSON.parse(row.state_json),at=state.presentation?.at;
 assert.equal(row.status,'CANCELLED');assert.equal(state.status,'CANCELLED');
 assert.equal(state.id,row.room_id);assert.equal(state.releaseMode,'ON');
 assert.equal(state.step,'FINISHED');assert.equal(state.phase,4);assert.equal(state.boss.hp,0);assert.equal(state.failure,null);
 assert.equal(state.presentation.key,'CLEAR');
 assert(Number.isSafeInteger(at)&&Number.isFinite(Date.parse(launchedAt))&&at>=Date.parse(launchedAt));
 assert(Number.isSafeInteger(state.startedAt)&&at>=state.startedAt&&state.finishedAt>=at);
 assert(Array.isArray(state.members)&&state.members.length>0&&state.members.every(m=>m.left===true));
 assert(state.events.some(e=>e.type==='BLACKWING_CUE'&&e.cueKey==='CLEAR'&&e.at===at));
 const participants=Object.keys(state.clearRewards||{}).sort((a,b)=>Number(a)-Number(b));assert(participants.length>0);
 for(const id of participants){assert(state.members.some(m=>m.id===id));assert(['GRANTED','WEEKLY_LIMIT','DISABLED'].includes(state.clearRewards[id].status));}
 assert(row.receipts?.length>0&&row.receipts.every(r=>r.kind==='action'&&r.status==='CLEAR'&&Number(r.finished_at)===at));
 const version=Number(row.version);assert(Number.isSafeInteger(version)&&version>=0&&version<Number.MAX_SAFE_INTEGER);
 const next={...state,status:'CLEAR',finishedAt:at};
 return {roomId:row.room_id,participants,clearAt:at,beforeStatus:row.status,beforeVersion:String(version),beforeRaw:row.state_json,
  afterStatus:'CLEAR',afterVersion:String(version+1),afterRaw:JSON.stringify(next)};
}
