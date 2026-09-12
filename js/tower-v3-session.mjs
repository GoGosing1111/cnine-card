import {createPveContinuousSession} from './pve-continuous-session-v1.mjs';
// Reuse the tested cross-tab/reconnect controller; translate selection at the
// transport boundary instead of introducing a second recovery state machine.
export function createTowerV3Session(options){
  const transport=options.transport;
  return createPveContinuousSession({...options,content:options.content||'TOWER',
    validateSelection:value=>typeof value==='string'&&/^[1-9][0-9]{0,3}$/.test(value),
    transport:{
      async run({requestId,difficulty}){const r=await transport.run({requestId,tier:Number(difficulty)});return {...r,difficulty:r.status==='COMPLETED'?{id:String(r.tier)}:String(r.tier)};},
      async status(){const r=await transport.status();return {...r,...(r.status==='RUNNING'?{difficulty:String(r.tier)}:{})};}
    }});
}
