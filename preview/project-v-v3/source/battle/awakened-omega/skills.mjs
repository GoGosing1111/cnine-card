// Accepted body poses, movement and timings are imported unchanged.
import {POSES,SKILLS as ACCEPTED,posePlan,sampleMovement,sampleStep} from './motion.mjs';
export {POSES,posePlan,sampleMovement,sampleStep};
const charge=(start,end,size)=>({key:'charge',start,end,from:0,to:7,target:'blade',bladeFraction:.3,size,layer:'front',blend:'add',alpha:.82});
const effects={
 cleave:[charge(.24,.98,1.05),{key:'cleave',start:.64,end:1.42,from:0,to:7,target:0,size:2.4,layer:'front'}],
 sever:[charge(.3,1.13,1.2),{key:'sever',start:.75,end:1.61,from:0,to:7,target:0,size:2.75,layer:'front'}],
 orbit:[charge(.26,1.08,1.35),{key:'orbit',start:.62,end:1.84,from:0,to:7,target:'area',size:4.1,layer:'front'}],
 rupture:[charge(.36,1.43,1.5),{key:'rupture',start:1.04,end:2.26,from:0,to:7,target:'area',size:4.5,layer:'front'}]
};
export const SKILLS=Object.fromEntries(Object.entries(ACCEPTED).map(([key,skill])=>[key,{...skill,effects:effects[key]}]));
