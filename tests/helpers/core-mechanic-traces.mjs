import {coreMechanicPlans,circuitOrder,circuitTarget,safeCells,MECHANICS} from '../../shared/core-raid-mechanics-v2086.js';
export function mechanicTrace(plan,challenge,success=true){
 const durationMs=plan.windowMs;
 if(plan.kind==='SEQUENCE')return {inputs:success?challenge.sequence.map((key,i)=>({key,at:100+i*120})):[],durationMs:success?100+challenge.sequence.length*120:durationMs};
 if(plan.kind==='MASH')return {presses:success?Array.from({length:challenge.mashTarget},(_,i)=>100+i*40):[],durationMs:success?100+challenge.mashTarget*40:durationMs};
 if(!success)return {trace:[{action:'START',at:0}],durationMs:MECHANICS[plan.kind].windowMs};
 if(plan.kind==='CENTER')return {trace:[{action:'START',at:0},... [450,1360,2210].map(at=>({action:'STOP',at}))],durationMs:2210};
 if(plan.kind==='CIRCUIT')return {trace:[{action:'START',at:0},...[0,1,2].flatMap(source=>[{action:'PICK',source,at:100+source*200},{action:'CONNECT',source,target:circuitTarget(source,circuitOrder(plan.seed)),at:200+source*200}])],durationMs:600};
 return {trace:[{action:'START',at:0},...[0,1,2].map(wave=>({action:'MOVE',cell:safeCells(wave,plan.seed)[0],at:wave*3500+100}))],durationMs:10500};
}
export function coreTraces(challenge,success=true){
 const results=Object.fromEntries(coreMechanicPlans(challenge).map(plan=>[plan.kind,mechanicTrace(plan,challenge,success)]));
 return challenge.mechanicVersion?{mechanics:results}:{sequence:results.SEQUENCE,mash:results.MASH};
}
