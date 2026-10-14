import {ORGANIZATION_PREPARATION} from './organization-preparation-v1.mjs';
import {orgInteger} from './organization-system-v1.mjs';

// Reading a policy never upgrades an existing headquarters. The stored stage is
// the result of an eventual authorized growth receipt, not a UI calculation.
export function organizationHeadquartersState(progress,policy){
 const points=orgInteger(Number(progress?.points??0),0,Number.MAX_SAFE_INTEGER,'조직 점수');
 const stage=orgInteger(Number(progress?.stage??1),1,5,'현재 아지트 단계');
 const nextThreshold=policy.growthMode==='CUMULATIVE'&&stage<5?(policy.hideoutThresholds[stage]??null):null;
 return {stage,name:ORGANIZATION_PREPARATION.hideouts[stage-1],points,
  nextStage:stage<5?stage+1:null,nextName:stage<5?ORGANIZATION_PREPARATION.hideouts[stage]:null,
  nextThreshold,remainingPoints:nextThreshold===null?null:Math.max(0,nextThreshold-points),
  configured:nextThreshold!==null,contentEnabled:false};
}
