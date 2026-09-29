import {makePlan as basePlan,sample as baseSample,track} from '../mercenary-berkan-sss-v1/skill.mjs';
export const AREA=Object.freeze({name:'흑금 천우',duration:3.4,release:1.05,contact:1.62,settled:3.22,runtimeEnabled:true});
export function makePlan(options={}){
 if(options.mode&&options.mode!=='area')return basePlan(options);
 const {cancelAt=null,targetLostAt=null,dodge=false}=options;
 for(const t of [cancelAt,targetLostAt])if(t!==null&&(!Number.isFinite(t)||t<0))throw Error('Invalid interruption time');
 const stop=Math.min(cancelAt??Infinity,targetLostAt??Infinity);
 const cues=[[0,'흑금 광휘 집중'],[.65,'활시위 최대 장력'],[AREA.release,'화살비 강하'],[AREA.contact,'적 진영 전체 명중'],[1.92,'연쇄 파열'],[2.25,'충격파 확산'],[AREA.settled,'잔향 소멸']];
 return {mode:'area',duration:AREA.duration,release:AREA.release,stop:Number.isFinite(stop)?stop:null,dodge,
  contacts:dodge||stop<=AREA.contact?[]:[AREA.contact],events:[...cues.filter(([t])=>t<stop).map(([at,label])=>({at,label})),...(Number.isFinite(stop)?[{at:stop,label:targetLostAt!==null?'대상 소멸 · 복귀':'시전 중단 · 복귀'}]:[])],damageAuthority:'NONE_VISUAL_PREVIEW'};
}
export function sample(plan,time){
 const state=baseSample(plan,time);if(plan.mode!=='area'||state.cancelled||state.done)return state;
 const t=state.time,poseAt=track([[0,0],[AREA.release,1.7],[1.4,2.08],[2.1,2.7],[2.35,3.05]],t);
 const pose=baseSample(basePlan({mode:'ultimate'}),poseAt);
 state.pose=pose.pose;state.charge=pose.charge;state.auraBoost=pose.auraBoost;
 if(t>=.15&&t<1.14)state.effects.push({key:'charge',frame:track([[.15,0],[1,11]],t),alpha:track([[.15,0],[.25,1],[1.05,1],[1.14,0]],t),anchor:'bow'});
 if(t>=AREA.release&&t<AREA.settled){
  state.effects.push({key:'arrowRainArea',frame:track([[AREA.release,0],[1.49,3],[AREA.contact,4],[1.92,7],[2.25,9],[2.75,12],[AREA.settled,15]],t),alpha:track([[AREA.release,0],[1.17,1],[2.85,1],[AREA.settled,0]],t),anchor:'formation'});
  if(!plan.dodge&&t>=AREA.contact&&t<2.2)state.effects.push({key:'impact',frame:track([[AREA.contact,4],[2.2,15]],t),alpha:track([[AREA.contact,1],[1.9,1],[2.2,0]],t),anchor:'target'});
 }
 if(!plan.dodge&&t>=AREA.contact&&t<AREA.contact+.18)state.recoil=Math.sin((t-AREA.contact)/.18*Math.PI)*7;
 return state;
}
