import {sniperOrikkungVisualPlan,SNIPER_ORIKKUNG_BALANCE,SNIPER_ORIKKUNG_DURATION} from '../../shared/mercenary-sniper-orikkung-v1.mjs';
export const ORIKKUNG_SKILL={id:'MS-050',name:'에메랄드 대물저격',balance:SNIPER_ORIKKUNG_BALANCE,visual:{duration:SNIPER_ORIKKUNG_DURATION,impactAt:.6}};
export function compileOrikkungPreview({basic=false,cancelAt=null,mode='PVE'}={}){
 const plan=sniperOrikkungVisualPlan({basic});
 plan.events=plan.events.filter(e=>cancelAt===null||e.at<cancelAt).map(e=>({...e,label:e.kind==='SHOT'?`${e.shot+1}번째 사격`:'탄착'}));
 if(cancelAt!==null)plan.events.push({kind:'CANCEL',at:cancelAt,label:'시전 중단'});
 return {...plan,mode};
}
