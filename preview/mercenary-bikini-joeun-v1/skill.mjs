import {bikiniJoeunVisualPlan,BIKINI_JOEUN_BALANCE,BIKINI_JOEUN_DURATION} from '../../shared/mercenary-bikini-joeun-v1.mjs';
export const JOEUN_SKILL={id:'MS-047',name:'라벤더 리코셰',balance:BIKINI_JOEUN_BALANCE,visual:{duration:BIKINI_JOEUN_DURATION,impactAt:1.305}};
export function compileJoeunPreview({basic=false,cancelAt=null,mode='PVE'}={}){
 const plan=bikiniJoeunVisualPlan({basic});
 plan.events=plan.events.filter(e=>cancelAt===null||e.at<cancelAt).map(e=>({...e,label:e.kind==='SHOT'?`${e.shot+1}번째 사격`:'탄착'}));
 if(cancelAt!==null)plan.events.push({kind:'CANCEL',at:cancelAt,label:'시전 중단'});
 return {...plan,mode};
}
