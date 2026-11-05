import action from './action.json' with {type:'json'};
export {action};
export function flightAt(time){let a=action.flight[0];for(const b of action.flight.slice(1)){if(time<=b.time){const u=Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time)));return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};}a=b;}return {x:a.x,y:a.y};}
export const elapsedAt=time=>time+action.visualBeats.filter(b=>b.time<time-1e-7).reduce((sum,b)=>sum+b.hold,0);
export const elapsedDuration=action.duration+action.visualBeats.reduce((sum,b)=>sum+b.hold,0);
